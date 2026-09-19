"use strict";

/* ================================================================
   HOUSES — permanent GLB (binary glTF) loading engine.

   Unlike dev-editor.js, this file is NOT meant to be removed after
   development — it's what actually loads and places houses every
   time the game starts, for every player, whether or not the dev
   tools are present. dev-editor.js calls into the functions here
   for interactive import; loadHouseManifest() below runs on its
   own at startup (hooked from main.js) to place whatever's been
   saved to houses.json, with no cheat code or dev mode needed.

   Expected layout on disk:
     /houses/*.glb      — your house model files
     /houses.json        — manifest of {file, parts:[{x,y,z},...]}
                            written by dev-editor.js's "Save Layout"

   If houses.json doesn't exist yet (nothing saved so far), this
   fails silently and the game just has no houses — not an error.
   ================================================================ */

const COMPONENT_TYPES={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const TYPE_COMPONENTS={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};

function parseGLB(buf){
  const dv=new DataView(buf);
  if(dv.getUint32(0,true)!==0x46546C67) throw new Error("Not a .glb file (bad magic number)");
  const totalLength=dv.getUint32(8,true);
  let offset=12, json=null, bin=null;
  while(offset<totalLength){
    const chunkLength=dv.getUint32(offset,true);
    const chunkType=dv.getUint32(offset+4,true);
    const chunkStart=offset+8;
    if(chunkType===0x4E4F534A){ // "JSON"
      json=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,chunkStart,chunkLength)));
    } else if(chunkType===0x004E4942){ // "BIN\0"
      bin=buf.slice(chunkStart,chunkStart+chunkLength);
    }
    offset=chunkStart+chunkLength;
  }
  if(!json) throw new Error("No JSON chunk found in .glb");
  return {json,bin};
}

function readAccessor(json,bin,accessorIndex){
  const acc=json.accessors[accessorIndex];
  if(acc.sparse) console.warn("[houses] sparse accessors aren't supported — accessor",accessorIndex,"may render incorrectly");
  const Ctor=COMPONENT_TYPES[acc.componentType];
  const numComp=TYPE_COMPONENTS[acc.type];
  const out=new Float32Array(acc.count*numComp);
  if(acc.bufferView===undefined){
    return out; // accessor with no data (rare) — leave zeroed rather than throw
  }
  const bv=json.bufferViews[acc.bufferView];
  const elemBytes=Ctor.BYTES_PER_ELEMENT*numComp;
  const byteOffset=(bv.byteOffset||0)+(acc.byteOffset||0);
  if(!bv.byteStride||bv.byteStride===elemBytes){
    const src=new Ctor(bin,byteOffset,acc.count*numComp);
    for(let i=0;i<src.length;i++) out[i]=src[i];
  } else {
    for(let i=0;i<acc.count;i++){
      const elem=new Ctor(bin,byteOffset+i*bv.byteStride,numComp);
      for(let c=0;c<numComp;c++) out[i*numComp+c]=elem[c];
    }
  }
  return out;
}
function readIndices(json,bin,accessorIndex){
  const acc=json.accessors[accessorIndex];
  const bv=json.bufferViews[acc.bufferView];
  const Ctor=COMPONENT_TYPES[acc.componentType];
  const byteOffset=(bv.byteOffset||0)+(acc.byteOffset||0);
  const src=new Ctor(bin,byteOffset,acc.count);
  return Uint32Array.from(src);
}
// TRIANGLE_STRIP (mode 5) / TRIANGLE_FAN (mode 6) → plain triangle list,
// so meshes exported with those modes aren't silently dropped.
function expandToTriangleList(idxArr,mode){
  if(mode===undefined||mode===4) return idxArr; // already TRIANGLES
  const out=[];
  if(mode===5){ // strip
    for(let i=0;i<idxArr.length-2;i++){
      if(i%2===0) out.push(idxArr[i],idxArr[i+1],idxArr[i+2]);
      else out.push(idxArr[i+1],idxArr[i],idxArr[i+2]);
    }
  } else if(mode===6){ // fan
    for(let i=1;i<idxArr.length-1;i++) out.push(idxArr[0],idxArr[i],idxArr[i+1]);
  } else {
    return null; // POINTS/LINES/etc — not a surface, caller should skip
  }
  return Uint32Array.from(out);
}

function quatToMat4(q){
  const [x,y,z,w]=q;
  return [
    1-2*(y*y+z*z), 2*(x*y+z*w),   2*(x*z-y*w),   0,
    2*(x*y-z*w),   1-2*(x*x+z*z), 2*(y*z+x*w),   0,
    2*(x*z+y*w),   2*(y*z-x*w),   1-2*(x*x+y*y), 0,
    0,0,0,1
  ];
}
function trsToMat4(node){
  if(node.matrix) return node.matrix.slice();
  const t=node.translation||[0,0,0], s=node.scale||[1,1,1];
  const r=node.rotation?quatToMat4(node.rotation):[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const sm=[s[0],0,0,0, 0,s[1],0,0, 0,0,s[2],0, 0,0,0,1];
  const rs=new Float32Array(16);
  mat4Multiply(rs,r,sm);
  rs[12]=t[0]; rs[13]=t[1]; rs[14]=t[2];
  return Array.from(rs);
}
function transformPoint(m,x,y,z){
  return [
    m[0]*x+m[4]*y+m[8]*z+m[12],
    m[1]*x+m[5]*y+m[9]*z+m[13],
    m[2]*x+m[6]*y+m[10]*z+m[14]
  ];
}
function transformDir(m,x,y,z){
  const v=[m[0]*x+m[4]*y+m[8]*z, m[1]*x+m[5]*y+m[9]*z, m[2]*x+m[6]*y+m[10]*z];
  const l=Math.hypot(v[0],v[1],v[2])||1;
  return [v[0]/l,v[1]/l,v[2]/l];
}
// Per-triangle flat normals, used only when a primitive has no NORMAL
// attribute at all — previously this defaulted every vertex to a flat "up"
// normal regardless of actual orientation, which made walls/roofs on
// normal-less exports light as if they were lying flat. This computes the
// real face normal for each triangle instead.
function computeFlatNormals(rawPos,idx){
  const vcount=rawPos.length/3;
  const normals=new Float32Array(vcount*3);
  for(let k=0;k<idx.length;k+=3){
    const i0=idx[k],i1=idx[k+1],i2=idx[k+2];
    const ax=rawPos[i1*3]-rawPos[i0*3], ay=rawPos[i1*3+1]-rawPos[i0*3+1], az=rawPos[i1*3+2]-rawPos[i0*3+2];
    const bx=rawPos[i2*3]-rawPos[i0*3], by=rawPos[i2*3+1]-rawPos[i0*3+1], bz=rawPos[i2*3+2]-rawPos[i0*3+2];
    let nx=ay*bz-az*by, ny=az*bx-ax*bz, nz=ax*by-ay*bx;
    const l=Math.hypot(nx,ny,nz)||1; nx/=l;ny/=l;nz/=l;
    for(const i of [i0,i1,i2]){ normals[i*3]+=nx; normals[i*3+1]+=ny; normals[i*3+2]+=nz; }
  }
  for(let v=0;v<vcount;v++){
    const l=Math.hypot(normals[v*3],normals[v*3+1],normals[v*3+2])||1;
    normals[v*3]/=l; normals[v*3+1]/=l; normals[v*3+2]/=l;
  }
  return normals;
}

async function loadEmbeddedOrDataURITexture(json,bin,textureIndex,imageURLCache){
  if(textureIndex===undefined||textureIndex===null) return null;
  const tex=json.textures[textureIndex];
  const imgIndex=tex.source;
  if(imgIndex===undefined) return null;
  if(imageURLCache[imgIndex]===undefined){
    const img=json.images[imgIndex];
    if(img.bufferView!==undefined){
      const bv=json.bufferViews[img.bufferView];
      const bytes=new Uint8Array(bin,bv.byteOffset||0,bv.byteLength);
      const blob=new Blob([bytes],{type:img.mimeType||"image/png"});
      imageURLCache[imgIndex]=URL.createObjectURL(blob);
    } else if(img.uri && img.uri.startsWith("data:")){
      imageURLCache[imgIndex]=img.uri; // base64 data URI, usable directly as an <img> src
    } else if(img.uri){
      console.warn("[houses] image",imgIndex,"references an external file ("+img.uri+") — only embedded/.glb images are supported, skipping this texture");
      imageURLCache[imgIndex]=null;
    } else {
      imageURLCache[imgIndex]=null;
    }
  }
  const url=imageURLCache[imgIndex];
  if(!url) return null;
  const texIdx=textures.length;
  textures.push(null);
  loadTexture(url).then(t=>{textures[texIdx]=t;}).catch(err=>{
    console.warn("[houses] texture failed to load:",err.message);
  });
  return texIdx;
}

async function convertGLTFMaterial(json,bin,materialIndex,imageURLCache){
  if(materialIndex===undefined||materialIndex===null){
    return {name:"ImportedDefault",baseColorTexture:null,metallicRoughnessTexture:null,occlusionTexture:null,
            emissiveTexture:null,baseColorFactor:[0.8,0.8,0.8,1],metallicFactor:0,roughnessFactor:1,
            emissiveFactor:[0,0,0],alphaMode:"OPAQUE",alphaCutoff:0.5,doubleSided:true,
            uvScale:[1,1],uvOffset:[0,0],uvRotation:0};
  }
  const m=json.materials[materialIndex];
  const pbr=m.pbrMetallicRoughness||{};
  const baseColorTexture=pbr.baseColorTexture?await loadEmbeddedOrDataURITexture(json,bin,pbr.baseColorTexture.index,imageURLCache):null;
  const metallicRoughnessTexture=pbr.metallicRoughnessTexture?await loadEmbeddedOrDataURITexture(json,bin,pbr.metallicRoughnessTexture.index,imageURLCache):null;
  const occlusionTexture=m.occlusionTexture?await loadEmbeddedOrDataURITexture(json,bin,m.occlusionTexture.index,imageURLCache):null;
  const emissiveTexture=m.emissiveTexture?await loadEmbeddedOrDataURITexture(json,bin,m.emissiveTexture.index,imageURLCache):null;
  return {
    name:m.name||"ImportedMaterial",
    baseColorTexture,metallicRoughnessTexture,occlusionTexture,emissiveTexture,
    baseColorFactor:pbr.baseColorFactor||[1,1,1,1],
    metallicFactor:pbr.metallicFactor!==undefined?pbr.metallicFactor:1,
    roughnessFactor:pbr.roughnessFactor!==undefined?pbr.roughnessFactor:1,
    emissiveFactor:m.emissiveFactor||[0,0,0],
    alphaMode:m.alphaMode||"OPAQUE", alphaCutoff:m.alphaCutoff!==undefined?m.alphaCutoff:0.5,
    doubleSided:!!m.doubleSided, uvScale:[1,1], uvOffset:[0,0], uvRotation:0
  };
}

/* Imports one .glb (from a File object OR a raw ArrayBuffer) and places it
   at placeAt={x,y,z}. Returns the list of `geometry` array indices created —
   one per mesh primitive found (most simple house exports produce just one).
   A bad primitive is skipped with a console warning rather than failing the
   whole import, so one broken piece doesn't lose the rest of the house. */
async function importGLBFile(fileOrBuffer,placeAt){
  const buf=fileOrBuffer.arrayBuffer?await fileOrBuffer.arrayBuffer():fileOrBuffer;
  const {json,bin}=parseGLB(buf);
  if(!bin) throw new Error("This .glb has no embedded binary data (external .bin buffers aren't supported)");

  const materialCache={}, imageURLCache={};
  async function getMaterialIndex(gltfMatIndex){
    const key=gltfMatIndex===undefined?"__default__":gltfMatIndex;
    if(materialCache[key]!==undefined) return materialCache[key];
    const mat=await convertGLTFMaterial(json,bin,gltfMatIndex,imageURLCache);
    const idx=MATERIALS.length;
    MATERIALS.push(mat);
    materialCache[key]=idx;
    return idx;
  }

  const createdIndices=[];
  async function processPrimitive(mesh,prim,p,nodeIndex,world){
    const rawPos=readAccessor(json,bin,prim.attributes.POSITION);
    const vcount=rawPos.length/3;
    let rawNorm=prim.attributes.NORMAL!==undefined?readAccessor(json,bin,prim.attributes.NORMAL):null;

    let idx=prim.indices!==undefined?readIndices(json,bin,prim.indices):
             Uint32Array.from({length:vcount},(_,i)=>i);
    idx=expandToTriangleList(idx,prim.mode);
    if(idx===null) return; // not a triangle-producing primitive (points/lines), skip

    if(!rawNorm) rawNorm=computeFlatNormals(rawPos,idx);

    const matIdx=await getMaterialIndex(prim.material);
    const gltfMat=prim.material!==undefined?json.materials[prim.material]:null;
    const uvSetFor=(texRef)=>texRef&&texRef.texCoord?texRef.texCoord:0;
    const uvSet=gltfMat&&gltfMat.pbrMetallicRoughness&&gltfMat.pbrMetallicRoughness.baseColorTexture
                 ?uvSetFor(gltfMat.pbrMetallicRoughness.baseColorTexture):0;
    const uvAttrName="TEXCOORD_"+uvSet;
    const rawUV=prim.attributes[uvAttrName]!==undefined?readAccessor(json,bin,prim.attributes[uvAttrName]):
                 (prim.attributes.TEXCOORD_0!==undefined?readAccessor(json,bin,prim.attributes.TEXCOORD_0):null);

    const out=new Float32Array(vcount*8);
    for(let v=0;v<vcount;v++){
      const [wx,wy,wz]=transformPoint(world,rawPos[v*3],rawPos[v*3+1],rawPos[v*3+2]);
      out[v*8]=wx; out[v*8+1]=wy; out[v*8+2]=wz;
      const [nx,ny,nz]=transformDir(world,rawNorm[v*3],rawNorm[v*3+1],rawNorm[v*3+2]);
      out[v*8+3]=nx; out[v*8+4]=ny; out[v*8+5]=nz;
      out[v*8+6]=rawUV?rawUV[v*2]:0;
      out[v*8+7]=rawUV?rawUV[v*2+1]:0;
    }

    const name=(mesh.name||("Node"+nodeIndex))+"_"+p;
    const part=uploadMeshPart(name,matIdx,out,idx);
    part.offset={x:placeAt.x,y:placeAt.y,z:placeAt.z};
    createdIndices.push(geometry.indexOf(part));
  }

  async function walkNode(nodeIndex,parentMatrix){
    const node=json.nodes[nodeIndex];
    const local=trsToMat4(node);
    const world=new Float32Array(16);
    mat4Multiply(world,parentMatrix,local);

    if(node.mesh!==undefined){
      const mesh=json.meshes[node.mesh];
      for(let p=0;p<mesh.primitives.length;p++){
        try{
          await processPrimitive(mesh,mesh.primitives[p],p,nodeIndex,world);
        }catch(err){
          console.warn(`[houses] skipped a primitive in node ${nodeIndex} (mesh "${mesh.name||""}", primitive ${p}):`,err.message);
        }
      }
    }
    for(const c of (node.children||[])) await walkNode(c,world);
  }

  const identity=new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  let rootIndices;
  if(json.scenes && json.scenes.length && json.nodes){
    rootIndices=json.scenes[json.scene||0].nodes;
  } else if(json.nodes){
    const childSet=new Set();
    json.nodes.forEach(n=>(n.children||[]).forEach(c=>childSet.add(c)));
    rootIndices=json.nodes.map((_,i)=>i).filter(i=>!childSet.has(i));
  } else {
    throw new Error("This .glb has no nodes to import");
  }
  for(const rootIndex of rootIndices) await walkNode(rootIndex,identity);

  if(createdIndices.length===0) console.warn("[houses] import finished but produced no mesh parts — check the console above for skipped-primitive warnings");
  return createdIndices;
}

/* ---------------- Permanent manifest auto-loader ----------------
   Runs at every game startup (called from main.js), no dev mode or
   cheat code required. Silently does nothing if houses.json isn't
   present yet. Manifest format (written by dev-editor.js's Save Layout):
     [{"file":"houses/cottage.glb","parts":[{"x":150,"y":5,"z":250}]}]
   Each entry's `file` path is relative to index.html; each "parts"
   array has one {x,y,z} per mesh part that file produces, applied
   in the same order importGLBFile() creates them in. */
async function loadHouseManifest(){
  let manifest;
  try{
    const res=await fetch("houses.json",{cache:"no-store"});
    if(!res.ok) return;
    manifest=await res.json();
  }catch(err){
    return; // no houses.json yet (or opened via file://) — not an error
  }
  for(const entry of manifest){
    try{
      const res=await fetch(entry.file,{cache:"no-store"});
      if(!res.ok) throw new Error("HTTP "+res.status);
      const buf=await res.arrayBuffer();
      const parts=entry.parts&&entry.parts.length?entry.parts:[{x:0,y:0,z:0}];
      const created=await importGLBFile(buf,parts[0]);
      created.forEach((geomIdx,i)=>{
        if(parts[i]) geometry[geomIdx].offset={x:parts[i].x,y:parts[i].y,z:parts[i].z};
      });
      console.log(`[houses] loaded ${entry.file}: ${created.length} part(s)`);
    }catch(err){
      console.warn(`[houses] failed to load ${entry.file} from houses.json:`,err.message);
    }
  }
}
