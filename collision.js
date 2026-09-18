"use strict";

/* ---- Collider viewer: flat-color line shader, separate tiny program ---- */
const dbgVs=`#version 300 es
layout(location=0) in vec3 aPosition;
uniform mat4 uProjection,uView;
void main(){ gl_Position=uProjection*uView*vec4(aPosition,1.0); }`;
const dbgFs=`#version 300 es
precision highp float;
uniform vec3 uColor;
out vec4 outColor;
void main(){ outColor=vec4(uColor,1.0); }`;
const dbgProgram=gl.createProgram();
gl.attachShader(dbgProgram,compile(gl.VERTEX_SHADER,dbgVs));
gl.attachShader(dbgProgram,compile(gl.FRAGMENT_SHADER,dbgFs));
gl.linkProgram(dbgProgram);
if(!gl.getProgramParameter(dbgProgram,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(dbgProgram));
const DU={
  projection:gl.getUniformLocation(dbgProgram,"uProjection"),
  view:gl.getUniformLocation(dbgProgram,"uView"),
  color:gl.getUniformLocation(dbgProgram,"uColor")
};
let wallLineVAO=null,wallLineCount=0;
let groundLineVAO=null,groundLineCount=0;
function buildDebugLines(trisFlat){
  // one line loop (3 edges) per triangle, drawn slightly above its own surface so it doesn't z-fight
  const verts=[];
  for(let o=0;o<trisFlat.length;o+=9){
    const x0=trisFlat[o],y0=trisFlat[o+1],z0=trisFlat[o+2];
    const x1=trisFlat[o+3],y1=trisFlat[o+4],z1=trisFlat[o+5];
    const x2=trisFlat[o+6],y2=trisFlat[o+7],z2=trisFlat[o+8];
    const lift=0.6;
    verts.push(x0,y0+lift,z0, x1,y1+lift,z1, x1,y1+lift,z1, x2,y2+lift,z2, x2,y2+lift,z2, x0,y0+lift,z0);
  }
  const arr=new Float32Array(verts);
  const vao=gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,vb);
  gl.bufferData(gl.ARRAY_BUFFER,arr,gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
  gl.bindVertexArray(null);
  return {vao,count:arr.length/3};
}

/* ---- Collision: spatial grid over the mesh triangles ---- */
let groundTris=null, colliderTris=null, groundGrid=null, wallGrid=null;

function buildGrid(trisFlat,cellSize){
  const grid=new Map();
  const n=trisFlat.length/9;
  for(let t=0;t<n;t++){
    const o=t*9;
    const x0=trisFlat[o],z0=trisFlat[o+2], x1=trisFlat[o+3],z1=trisFlat[o+5], x2=trisFlat[o+6],z2=trisFlat[o+8];
    const cx0=Math.floor(Math.min(x0,x1,x2)/cellSize), cx1=Math.floor(Math.max(x0,x1,x2)/cellSize);
    const cz0=Math.floor(Math.min(z0,z1,z2)/cellSize), cz1=Math.floor(Math.max(z0,z1,z2)/cellSize);
    for(let cx=cx0;cx<=cx1;cx++){
      for(let cz=cz0;cz<=cz1;cz++){
        const key=cx+","+cz;
        let arr=grid.get(key);
        if(!arr){arr=[];grid.set(key,arr);}
        arr.push(t);
      }
    }
  }
  return grid;
}

function baryXZ(px,pz,x0,z0,x1,z1,x2,z2){
  const d00x=x1-x0,d00z=z1-z0,d01x=x2-x0,d01z=z2-z0,d02x=px-x0,d02z=pz-z0;
  const den=d00x*d01z-d01x*d00z;
  if(Math.abs(den)<1e-8) return null;
  const v=(d02x*d01z-d01x*d02z)/den;
  const w=(d00x*d02z-d02x*d00z)/den;
  const u=1-v-w;
  if(u<-0.001||v<-0.001||w<-0.001) return null;
  return [u,v,w];
}

function raycastGroundHeight(px,pz,refY){
  if(!groundGrid) return null;
  const cx=Math.floor(px/CELL_SIZE), cz=Math.floor(pz/CELL_SIZE);
  let best=null;
  for(let dx=-1;dx<=1;dx++){
    for(let dz=-1;dz<=1;dz++){
      const arr=groundGrid.get((cx+dx)+","+(cz+dz));
      if(!arr) continue;
      for(const t of arr){
        const o=t*9;
        const x0=groundTris[o],y0=groundTris[o+1],z0=groundTris[o+2];
        const x1=groundTris[o+3],y1=groundTris[o+4],z1=groundTris[o+5];
        const x2=groundTris[o+6],y2=groundTris[o+7],z2=groundTris[o+8];
        const w=baryXZ(px,pz,x0,z0,x1,z1,x2,z2);
        if(!w) continue;
        const y=w[0]*y0+w[1]*y1+w[2]*y2;
        if(y<=refY+80 && (best===null||y>best)) best=y;
      }
    }
  }
  return best;
}

function closestOnSegment(px,pz,ax,az,bx,bz){
  const abx=bx-ax,abz=bz-az;
  const abLen2=abx*abx+abz*abz;
  let t=abLen2>1e-8?((px-ax)*abx+(pz-az)*abz)/abLen2:0;
  t=Math.max(0,Math.min(1,t));
  const cx=ax+abx*t,cz=az+abz*t;
  return [cx,cz,Math.hypot(px-cx,pz-cz)];
}

function resolveWalls(px,pz){
  if(!wallGrid) return [px,pz];
  for(let pass=0;pass<2;pass++){
    const cx=Math.floor(px/CELL_SIZE), cz=Math.floor(pz/CELL_SIZE);
    for(let dx=-1;dx<=1;dx++){
      for(let dz=-1;dz<=1;dz++){
        const arr=wallGrid.get((cx+dx)+","+(cz+dz));
        if(!arr) continue;
        for(const t of arr){
          const o=t*9;
          const ex=[colliderTris[o],colliderTris[o+3],colliderTris[o+6]];
          const ez=[colliderTris[o+2],colliderTris[o+5],colliderTris[o+8]];
          for(let e=0;e<3;e++){
            const ax=ex[e],az=ez[e],bx=ex[(e+1)%3],bz=ez[(e+1)%3];
            const r=closestOnSegment(px,pz,ax,az,bx,bz);
            const dist=r[2];
            if(dist<PLAYER_RADIUS){
              let nx=px-r[0],nz=pz-r[1];
              const nl=Math.hypot(nx,nz)||1;
              nx/=nl; nz/=nl;
              const push=PLAYER_RADIUS-dist;
              px+=nx*push; pz+=nz*push;
            }
          }
        }
      }
    }
  }
  return [px,pz];
}

