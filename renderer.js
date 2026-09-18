"use strict";

const canvas=document.getElementById("glcanvas");
const statusEl=document.getElementById("status");
const positionEl=document.getElementById("position");
const fpsEl=document.getElementById("fps");
const trisEl=document.getElementById("tris");
const lockhintEl=document.getElementById("lockhint");
const colliderHintEl=document.getElementById("colliderhint");
const gl=canvas.getContext("webgl2",{antialias:true,alpha:false,preserveDrawingBuffer:false});
if(!gl) throw new Error("WebGL2 is required by this standalone file.");

const vs=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uProjection,uView,uModel;
out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;
void main(){
  vec4 wp=uModel*vec4(aPosition,1.0);
  vWorldPos=wp.xyz;
  vNormal=mat3(uModel)*aNormal;
  vUV=aUV;
  gl_Position=uProjection*uView*wp;
}`;

const fs=`#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
out vec4 outColor;

uniform sampler2D uBaseColor;
uniform sampler2D uMetalRough;
uniform sampler2D uAO;
uniform sampler2D uEmissive;
uniform int uHasBase;
uniform int uHasMR;
uniform int uHasAO;
uniform int uHasEmissive;
uniform vec4 uBaseFactor;
uniform float uMetallic;
uniform float uRoughness;
uniform vec3 uEmissiveFactor;
uniform vec2 uUVScale;
uniform vec2 uUVOffset;
uniform float uUVRotation;
uniform int uAlphaMask;
uniform float uAlphaCutoff;
uniform vec3 uCameraPos;
uniform float uFogStart;
uniform float uFogEnd;
uniform vec3 uFogColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbientColor;

vec2 transformedUV(vec2 uv){
  vec2 p=uv*uUVScale+uUVOffset;
  float c=cos(uUVRotation),s=sin(uUVRotation);
  return mat2(c,-s,s,c)*(p-0.5)+0.5;
}
vec3 srgbToLinear(vec3 c){ return pow(max(c,vec3(0.0)),vec3(2.2)); }
vec3 linearToSrgb(vec3 c){ return pow(max(c,vec3(0.0)),vec3(1.0/2.2)); }

void main(){
  vec2 uv=transformedUV(vUV);
  vec4 texel=(uHasBase==1)?texture(uBaseColor,uv):vec4(1.0);
  vec4 base=texel*uBaseFactor;
  if(uAlphaMask==1 && base.a<uAlphaCutoff) discard;

  vec3 N=normalize(vNormal);
  vec3 V=normalize(uCameraPos-vWorldPos);

  // Sun moves across the sky over the day/night cycle (see updateDayNight in JS);
  // L2 stays a fixed dim sky-fill light so shadowed faces aren't pure black.
  vec3 L1=normalize(uSunDir);
  vec3 L2=normalize(vec3(0.35,0.45,-0.55));
  float ndl1=max(dot(N,L1),0.0);
  float ndl2=max(dot(N,L2),0.0);
  vec3 H1=normalize(L1+V);
  float ndh=max(dot(N,H1),0.0);
  float rough=max(uRoughness,0.08);
  float shininess=mix(180.0,8.0,rough);
  float specPow=pow(ndh,shininess);
  float metal=uMetallic;

  vec3 albedo=srgbToLinear(base.rgb);
  float mrR=1.0, mrG=1.0, mrB=0.0;
  if(uHasMR==1){
    vec4 mr=texture(uMetalRough,uv);
    mrG=mr.g; mrB=mr.b; mrR=mr.r;
  }
  float metallic=clamp(metal*max(mrB,0.04),0.0,1.0);
  float roughTex=(uHasMR==1)?mrG:1.0;
  rough=clamp(rough*max(roughTex,0.08),0.04,1.0);

  float ao=(uHasAO==1)?texture(uAO,uv).r:1.0;
  vec3 F0=mix(vec3(0.04),albedo,metallic);
  vec3 diffuse=albedo*(1.0-metallic)/3.14159;
  vec3 spec=F0*specPow*(1.0-0.35*rough);

  vec3 lighting=albedo*uAmbientColor*(0.5+0.5*ao)+
                diffuse*uSunColor*(1.10*ndl1)+diffuse*0.12*ndl2+
                spec*uSunColor*ndl1+spec*0.10*ndl2;

  if(uHasEmissive==1){
    vec3 e=srgbToLinear(texture(uEmissive,uv).rgb)*uEmissiveFactor;
    lighting+=e;
  }

  lighting*=1.0;
  float dist=length(uCameraPos-vWorldPos);
  float fogT=clamp((dist-uFogStart)/(uFogEnd-uFogStart),0.0,1.0);
  vec3 finalColor=mix(linearToSrgb(lighting),uFogColor,fogT);
  outColor=vec4(finalColor,base.a);
}`;

function compile(type,src){
  const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const program=gl.createProgram();
gl.attachShader(program,compile(gl.VERTEX_SHADER,vs));
gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fs));
gl.linkProgram(program);
if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
gl.useProgram(program);

const U={
  projection:gl.getUniformLocation(program,"uProjection"),
  view:gl.getUniformLocation(program,"uView"),
  model:gl.getUniformLocation(program,"uModel"),
  base:gl.getUniformLocation(program,"uBaseColor"),
  mr:gl.getUniformLocation(program,"uMetalRough"),
  ao:gl.getUniformLocation(program,"uAO"),
  emissive:gl.getUniformLocation(program,"uEmissive"),
  hasBase:gl.getUniformLocation(program,"uHasBase"),
  hasMR:gl.getUniformLocation(program,"uHasMR"),
  hasAO:gl.getUniformLocation(program,"uHasAO"),
  hasEmissive:gl.getUniformLocation(program,"uHasEmissive"),
  baseFactor:gl.getUniformLocation(program,"uBaseFactor"),
  metallic:gl.getUniformLocation(program,"uMetallic"),
  roughness:gl.getUniformLocation(program,"uRoughness"),
  emissiveFactor:gl.getUniformLocation(program,"uEmissiveFactor"),
  uvScale:gl.getUniformLocation(program,"uUVScale"),
  uvOffset:gl.getUniformLocation(program,"uUVOffset"),
  uvRotation:gl.getUniformLocation(program,"uUVRotation"),
  alphaMask:gl.getUniformLocation(program,"uAlphaMask"),
  alphaCutoff:gl.getUniformLocation(program,"uAlphaCutoff"),
  cameraPos:gl.getUniformLocation(program,"uCameraPos"),
  fogStart:gl.getUniformLocation(program,"uFogStart"),
  fogEnd:gl.getUniformLocation(program,"uFogEnd"),
  fogColor:gl.getUniformLocation(program,"uFogColor"),
  sunDir:gl.getUniformLocation(program,"uSunDir"),
  sunColor:gl.getUniformLocation(program,"uSunColor"),
  ambientColor:gl.getUniformLocation(program,"uAmbientColor")
};

function b64ToBytes(s){
  const bin=atob(s), out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
  return out;
}

const textures=[];
function loadTexture(src){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const t=gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D,t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      resolve(t);
    };
    img.onerror=()=>reject(new Error("Texture failed to load"));
    img.src=src;
  });
}

function mat4Perspective(out,fovy,aspect,near,far){
  const f=1/Math.tan(fovy/2), nf=1/(near-far);
  out.set([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,(2*far*near)*nf,0]);
  return out;
}
function mat4LookAt(out,eye,center,up){
  let zx=eye[0]-center[0],zy=eye[1]-center[1],zz=eye[2]-center[2];
  let zl=Math.hypot(zx,zy,zz); zx/=zl;zy/=zl;zz/=zl;
  let xx=up[1]*zz-up[2]*zy,xy=up[2]*zx-up[0]*zz,xz=up[0]*zy-up[1]*zx;
  let xl=Math.hypot(xx,xy,xz); xx/=xl;xy/=xl;xz/=xl;
  let yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
  out.set([xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0,
           -(xx*eye[0]+xy*eye[1]+xz*eye[2]),
           -(yx*eye[0]+yy*eye[1]+yz*eye[2]),
           -(zx*eye[0]+zy*eye[1]+zz*eye[2]),1]);
  return out;
}

function mat4Multiply(out,a,b){
  for(let c=0;c<4;c++){
    for(let r=0;r<4;r++){
      let sum=0;
      for(let k=0;k<4;k++) sum+=a[k*4+r]*b[c*4+k];
      out[c*4+r]=sum;
    }
  }
  return out;
}

/* ---- Frustum culling: the map is a whole city (~700k triangles across all
   materials), so drawing every triangle every frame regardless of where the
   camera is looking is the actual cause of low FPS. buildGeometry() below
   groups each material's triangles into spatial cells and reorders the index
   buffer so each cell is a contiguous range; render() then only issues a
   drawElements() call for cells whose bounding box is inside the camera's
   view frustum, skipping everything behind/beside the player. */
const RENDER_CELL_SIZE=300;
const pvMatrix=new Float32Array(16);
const frustumPlanes=[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];

function updateFrustumPlanes(projection,view){
  mat4Multiply(pvMatrix,projection,view);
  const m=pvMatrix;
  const rows=[
    [m[3]+m[0],m[7]+m[4],m[11]+m[8],m[15]+m[12]],   // left
    [m[3]-m[0],m[7]-m[4],m[11]-m[8],m[15]-m[12]],   // right
    [m[3]+m[1],m[7]+m[5],m[11]+m[9],m[15]+m[13]],   // bottom
    [m[3]-m[1],m[7]-m[5],m[11]-m[9],m[15]-m[13]],   // top
    [m[3]+m[2],m[7]+m[6],m[11]+m[10],m[15]+m[14]],  // near
    [m[3]-m[2],m[7]-m[6],m[11]-m[10],m[15]-m[14]]   // far
  ];
  for(let i=0;i<6;i++){
    const [a,b,c,d]=rows[i];
    const len=Math.hypot(a,b,c)||1;
    frustumPlanes[i][0]=a/len; frustumPlanes[i][1]=b/len;
    frustumPlanes[i][2]=c/len; frustumPlanes[i][3]=d/len;
  }
}

function aabbOutsideFrustum(box){
  for(let i=0;i<6;i++){
    const p=frustumPlanes[i];
    const px=p[0]>=0?box.maxX:box.minX;
    const py=p[1]>=0?box.maxY:box.minY;
    const pz=p[2]>=0?box.maxZ:box.minZ;
    if(p[0]*px+p[1]*py+p[2]*pz+p[3]<0) return true;
  }
  return false;
}

const geometry=[];
let totalTrisAll=0, drawnTrisLastFrame=0;
function buildGeometry(){
  const groundArr=[], colliderArr=[];
  for(const item of MODEL){
    const bytes=b64ToBytes(item.vertex_b64);
    const ib=b64ToBytes(item.index_b64);
    const pos=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength>>2);
    const idx=new Uint32Array(ib.buffer,ib.byteOffset,ib.byteLength>>2);

    // Bucket triangles into spatial cells by centroid, so each cell can be
    // drawn (or skipped) independently based on camera frustum.
    const cellMap=new Map(); // key -> {tris:[i0,i1,i2,...], minX,minY,minZ,maxX,maxY,maxZ}
    for(let k=0;k<idx.length;k+=3){
      const i0=idx[k],i1=idx[k+1],i2=idx[k+2];
      const b0=i0*8,b1=i1*8,b2=i2*8;
      const x0=pos[b0],y0=pos[b0+1],z0=pos[b0+2];
      const x1=pos[b1],y1=pos[b1+1],z1=pos[b1+2];
      const x2=pos[b2],y2=pos[b2+1],z2=pos[b2+2];
      const cx=(x0+x1+x2)/3, cz=(z0+z1+z2)/3;
      const key=Math.floor(cx/RENDER_CELL_SIZE)+","+Math.floor(cz/RENDER_CELL_SIZE);
      let cell=cellMap.get(key);
      if(!cell){
        cell={tris:[],minX:Infinity,minY:Infinity,minZ:Infinity,maxX:-Infinity,maxY:-Infinity,maxZ:-Infinity};
        cellMap.set(key,cell);
      }
      cell.tris.push(i0,i1,i2);
      const minX=Math.min(x0,x1,x2),maxX=Math.max(x0,x1,x2);
      const minY=Math.min(y0,y1,y2),maxY=Math.max(y0,y1,y2);
      const minZ=Math.min(z0,z1,z2),maxZ=Math.max(z0,z1,z2);
      if(minX<cell.minX)cell.minX=minX; if(maxX>cell.maxX)cell.maxX=maxX;
      if(minY<cell.minY)cell.minY=minY; if(maxY>cell.maxY)cell.maxY=maxY;
      if(minZ<cell.minZ)cell.minZ=minZ; if(maxZ>cell.maxZ)cell.maxZ=maxZ;
    }

    // Reorder the index buffer so each cell occupies a contiguous byte range.
    const reordered=new Uint32Array(idx.length);
    const cells=[];
    let cursor=0;
    for(const cell of cellMap.values()){
      reordered.set(cell.tris,cursor);
      cells.push({
        offset:cursor*4, count:cell.tris.length,
        minX:cell.minX,minY:cell.minY,minZ:cell.minZ,
        maxX:cell.maxX,maxY:cell.maxY,maxZ:cell.maxZ
      });
      cursor+=cell.tris.length;
    }
    totalTrisAll+=idx.length/3;

    const vao=gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,vb);
    gl.bufferData(gl.ARRAY_BUFFER,bytes,gl.STATIC_DRAW);
    const ibo=gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,reordered,gl.STATIC_DRAW);
    const stride=8*4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,stride,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,stride,12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,2,gl.FLOAT,false,stride,24);
    geometry.push({vao,cells,material:item.material,name:item.name});

    // CPU-side copy of the same triangles for collision: Railing / BridgeSupport
    // become solid walls, everything else (road, lanes, crossing, bridge deck)
    // is walkable ground used for the height raycast.
    const matName=MATERIALS[item.material].name;
    const isCollider=(matName==="Railing");
    const target=isCollider?colliderArr:groundArr;
    for(let k=0;k<idx.length;k+=3){
      const b0=idx[k]*8,b1=idx[k+1]*8,b2=idx[k+2]*8;
      target.push(pos[b0],pos[b0+1],pos[b0+2], pos[b1],pos[b1+1],pos[b1+2], pos[b2],pos[b2+1],pos[b2+2]);
    }
  }
  gl.bindVertexArray(null);
  groundTris=new Float32Array(groundArr);
  colliderTris=new Float32Array(colliderArr);
  groundGrid=buildGrid(groundTris,CELL_SIZE);
  wallGrid=buildGrid(colliderTris,CELL_SIZE);

  const wallLines=buildDebugLines(colliderTris);
  wallLineVAO=wallLines.vao; wallLineCount=wallLines.count;
  const groundLines=buildDebugLines(groundTris);
  groundLineVAO=groundLines.vao; groundLineCount=groundLines.count;
}

let projection=new Float32Array(16),view=new Float32Array(16),modelMat=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
let lastTime=performance.now();

async function start(){
  try{
    const texPromises=Object.keys(TEXTURES).map(k=>
      loadTexture(TEXTURES[k])
        .then(t=>{textures[Number(k)]=t;})
        .catch(err=>{console.warn(`Texture ${k} failed to load (${TEXTURES[k]}):`,err.message);})
    );
    statusEl.textContent="Building geometry and colliders…";
    buildGeometry();
    await Promise.all(texPromises);
    const g=raycastGroundHeight(player.x,player.z,1e9);
    if(g!==null){lastGroundY=g;player.y=g+EYE_HEIGHT;}
    initPlayerColliderDebug();
    const missing=Object.keys(TEXTURES).filter(k=>!textures[Number(k)]).length;
    statusEl.textContent=missing>0
      ? `Ready • ${geometry.length} mesh parts • ${missing} texture(s) missing (untextured) — click to walk`
      : `Ready • ${geometry.length} mesh parts • ${MATERIALS.length} materials — click to walk`;
    lastTime=performance.now();
    requestAnimationFrame(render);
  }catch(err){
    console.error(err);
    statusEl.textContent="Error: "+err.message;
  }
}

function bindTexture(unit,tex){
  gl.activeTexture(gl.TEXTURE0+unit);
  gl.bindTexture(gl.TEXTURE_2D,tex||null);
}

const RENDER_DISTANCE=1100;   // beyond this, fog fully hides geometry — tune to taste

/* ---- Day/night cycle: dayTime is hours 0-24, advancing automatically as the
   game runs. Sun direction, sun color, ambient color, and fog/sky color are
   all derived from it each frame — see updateDayNight(). Keys , and . nudge
   time manually (wired up in player.js) for quick testing. */
let dayTime=8;                  // start at 8am
const DAY_LENGTH_SECONDS=300;   // one full 24h cycle = 5 real minutes
const timeEl=document.getElementById("time");

const NIGHT_AMBIENT=[0.05,0.06,0.11], DAY_AMBIENT=[0.55,0.58,0.63];
const SUN_DAY_COLOR=[1.0,0.97,0.92], SUN_WARM_COLOR=[1.0,0.52,0.26];
const NIGHT_FOG=[0.02,0.025,0.05], DAY_FOG=[0.55,0.66,0.78], TWILIGHT_FOG=[0.85,0.5,0.32];

function lerp3(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function smooth01(edge0,edge1,x){
  const t=Math.max(0,Math.min(1,(x-edge0)/(edge1-edge0)));
  return t*t*(3-2*t);
}

let sunDir=[0,1,0], sunColor=SUN_DAY_COLOR, ambientColor=DAY_AMBIENT, skyColor=DAY_FOG;
function updateDayNight(dt){
  dayTime=(dayTime+(dt/DAY_LENGTH_SECONDS)*24+24)%24;

  const angle=(dayTime/24)*Math.PI*2-Math.PI/2;
  const elevation=Math.sin(angle);
  sunDir=[Math.cos(angle)*0.6, elevation, 0.35];

  const dayFactor=smooth01(-0.12,0.12,elevation);       // 0 at night, 1 in daytime
  const horizonCloseness=1-Math.min(1,Math.abs(elevation)*3); // peaks at sunrise/sunset

  ambientColor=lerp3(NIGHT_AMBIENT,DAY_AMBIENT,dayFactor);
  const sunBase=lerp3(SUN_DAY_COLOR,SUN_WARM_COLOR,horizonCloseness);
  sunColor=[sunBase[0]*dayFactor,sunBase[1]*dayFactor,sunBase[2]*dayFactor];

  skyColor=lerp3(NIGHT_FOG,DAY_FOG,dayFactor);
  skyColor=lerp3(skyColor,TWILIGHT_FOG,horizonCloseness*0.7);

  if(timeEl){
    const h24=Math.floor(dayTime), m=Math.floor((dayTime-h24)*60);
    const ampm=h24>=12?"PM":"AM";
    const h12=((h24+11)%12)+1;
    timeEl.textContent=`${h12}:${m.toString().padStart(2,"0")} ${ampm}`;
  }
}

let frames=0,fpsTimer=0;
function render(now){
  const dt=Math.min((now-lastTime)/1000,0.05);
  lastTime=now;
  updatePlayer(dt);
  updateDayNight(dt);
  resize();

  const camState=freeCam?freeCamPos:player;
  const eye=freeCam?[freeCamPos.x,freeCamPos.y,freeCamPos.z]:[player.x,player.y,player.z];
  const dir=cameraDirection(camState);
  const target=[eye[0]+dir[0],eye[1]+dir[1],eye[2]+dir[2]];
  const aspect=canvas.width/canvas.height;
  mat4Perspective(projection,Math.PI/4,aspect,0.5,RENDER_DISTANCE+400);
  mat4LookAt(view,eye,target,[0,1,0]);

  gl.viewport(0,0,canvas.width,canvas.height);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(skyColor[0],skyColor[1],skyColor[2],1);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniformMatrix4fv(U.projection,false,projection);
  gl.uniformMatrix4fv(U.view,false,view);
  gl.uniformMatrix4fv(U.model,false,modelMat);
  gl.uniform3fv(U.cameraPos,eye);
  gl.uniform1f(U.fogStart,RENDER_DISTANCE*0.55);
  gl.uniform1f(U.fogEnd,RENDER_DISTANCE);
  gl.uniform3fv(U.fogColor,skyColor);
  gl.uniform3fv(U.sunDir,sunDir);
  gl.uniform3fv(U.sunColor,sunColor);
  gl.uniform3fv(U.ambientColor,ambientColor);

  updateFrustumPlanes(projection,view);
  drawnTrisLastFrame=0;
  const renderDistSq=RENDER_DISTANCE*RENDER_DISTANCE;

  for(const part of geometry){
    const m=MATERIALS[part.material];
    gl.uniform1i(U.hasBase,m.baseColorTexture!==null?1:0);
    gl.uniform1i(U.hasMR,m.metallicRoughnessTexture!==null?1:0);
    gl.uniform1i(U.hasAO,m.occlusionTexture!==null?1:0);
    gl.uniform1i(U.hasEmissive,m.emissiveTexture!==null?1:0);
    gl.uniform4fv(U.baseFactor,m.baseColorFactor);
    gl.uniform1f(U.metallic,m.metallicFactor);
    gl.uniform1f(U.roughness,m.roughnessFactor);
    gl.uniform3fv(U.emissiveFactor,m.emissiveFactor);
    gl.uniform2fv(U.uvScale,m.uvScale);
    gl.uniform2fv(U.uvOffset,m.uvOffset);
    gl.uniform1f(U.uvRotation,m.uvRotation);
    gl.uniform1i(U.alphaMask,m.alphaMode==="MASK"?1:0);
    gl.uniform1f(U.alphaCutoff,m.alphaCutoff);

    if(m.baseColorTexture!==null){bindTexture(0,textures[m.baseColorTexture]);gl.uniform1i(U.base,0);}
    if(m.metallicRoughnessTexture!==null){bindTexture(1,textures[m.metallicRoughnessTexture]);gl.uniform1i(U.mr,1);}
    if(m.occlusionTexture!==null){bindTexture(2,textures[m.occlusionTexture]);gl.uniform1i(U.ao,2);}
    if(m.emissiveTexture!==null){bindTexture(3,textures[m.emissiveTexture]);gl.uniform1i(U.emissive,3);}

    gl.bindVertexArray(part.vao);
    for(const cell of part.cells){
      const nx=Math.max(cell.minX,Math.min(eye[0],cell.maxX));
      const nz=Math.max(cell.minZ,Math.min(eye[2],cell.maxZ));
      const dx=nx-eye[0], dz=nz-eye[2];
      if(dx*dx+dz*dz>renderDistSq) continue;
      if(aabbOutsideFrustum(cell)) continue;
      gl.drawElements(gl.TRIANGLES,cell.count,gl.UNSIGNED_INT,cell.offset);
      drawnTrisLastFrame+=cell.count/3;
    }
  }
  gl.bindVertexArray(null);

  if(showColliders){
    gl.useProgram(dbgProgram);
    gl.uniformMatrix4fv(DU.projection,false,projection);
    gl.uniformMatrix4fv(DU.view,false,view);
    gl.disable(gl.DEPTH_TEST);
    if(groundLineVAO){
      gl.uniform3fv(DU.color,[0.15,0.85,0.95]);
      gl.bindVertexArray(groundLineVAO);
      gl.drawArrays(gl.LINES,0,groundLineCount);
    }
    if(wallLineVAO){
      gl.uniform3fv(DU.color,[1.0,0.15,0.15]);
      gl.bindVertexArray(wallLineVAO);
      gl.drawArrays(gl.LINES,0,wallLineCount);
    }
    if(playerColliderVAO){
      const pCount=updatePlayerColliderDebug(player.x,player.z,player.y-EYE_HEIGHT,player.y);
      gl.uniform3fv(DU.color,[1.0,0.9,0.1]);
      gl.bindVertexArray(playerColliderVAO);
      gl.drawArrays(gl.LINES,0,pCount);
    }
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
  }

  frames++; fpsTimer+=dt;
  if(fpsTimer>=1){fpsEl.textContent=frames; frames=0; fpsTimer=0;}
  trisEl.textContent=`${drawnTrisLastFrame.toLocaleString()} / ${totalTrisAll.toLocaleString()}`;

  requestAnimationFrame(render);
}

function resize(){
  const dpr=Math.min(devicePixelRatio||1,1.25);
  const w=Math.max(1,Math.floor(innerWidth*dpr)),h=Math.max(1,Math.floor(innerHeight*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
}
