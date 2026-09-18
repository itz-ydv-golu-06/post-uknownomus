"use strict";

/* ---- First-person walking camera (replaces the original orbit camera) ----
   The embedded scene spans roughly ±1740 units on X/Z with the ground surface
   sitting close to y=0, so eye height, move speed, gravity and jump are all
   scaled to that. Real colliders are built from the mesh itself: every
   "Railing" / "BridgeSupport" triangle becomes a solid wall you can't walk
   through, and every other triangle (road, lanes, crossing, bridge deck) is
   used to raycast the ground height under the player so you walk up bridges
   and ramps instead of sliding along a flat plane. */
const GROUND_Y=0;
const EYE_HEIGHT=3;
const WALK_SPEED=30;
const SPRINT_SPEED=40;
const GRAVITY=-200;
const JUMP_SPEED=40;
const PLAYER_RADIUS=22;
const CELL_SIZE=70;

let player={x:0,y:GROUND_Y+EYE_HEIGHT,z:1500,yaw:Math.PI,pitch:0};
let velocityY=0;
let onGround=true;
let lastGroundY=GROUND_Y;

const keys={};
let showColliders=false;
let freeCam=false;
let freeCamPos={x:0,y:0,z:0,yaw:Math.PI,pitch:0};
const FREECAM_SPEED=400;

window.addEventListener("keydown",e=>{
  keys[e.code]=true;
  if(e.code==="Space") e.preventDefault();
  if(e.code==="KeyC"){
    showColliders=!showColliders;
    colliderHintEl.style.display="block";
    colliderHintEl.textContent=showColliders?"Collider view: ON (red = walls, cyan = ground, yellow = player)":"Collider view: OFF";
  }
  if(e.code==="KeyF"){
    freeCam=!freeCam;
    if(freeCam){
      freeCamPos.x=player.x; freeCamPos.y=player.y; freeCamPos.z=player.z;
      freeCamPos.yaw=player.yaw; freeCamPos.pitch=player.pitch;
    }
    colliderHintEl.style.display="block";
    colliderHintEl.textContent=freeCam?"Free cam: ON (W/A/S/D fly, Space up, Shift down)":"Free cam: OFF";
  }
});
window.addEventListener("keyup",e=>{keys[e.code]=false;});

canvas.addEventListener("click",()=>{canvas.requestPointerLock();});
document.addEventListener("pointerlockchange",()=>{
  lockhintEl.style.display=(document.pointerLockElement===canvas)?"none":"block";
});
document.addEventListener("mousemove",e=>{
  if(document.pointerLockElement!==canvas) return;
  const target=freeCam?freeCamPos:player;
  target.yaw-=e.movementX*0.0024;
  target.pitch-=e.movementY*0.0024;
  target.pitch=Math.max(-1.5,Math.min(1.5,target.pitch));
});

function updateFreeCam(dt){
  const forward=(keys["KeyW"]||keys["ArrowUp"]?1:0)-(keys["KeyS"]||keys["ArrowDown"]?1:0);
  const strafe=(keys["KeyA"]||keys["ArrowLeft"]?1:0)-(keys["KeyD"]||keys["ArrowRight"]?1:0);
  const up=(keys["Space"]?1:0)-(keys["ShiftLeft"]||keys["ShiftRight"]?1:0);
  const cp=Math.cos(freeCamPos.pitch), sp=Math.sin(freeCamPos.pitch);
  const cy=Math.cos(freeCamPos.yaw), sy=Math.sin(freeCamPos.yaw);
  const fx=cp*sy, fy=sp, fz=cp*cy;   // full 3D forward (includes pitch)
  const rx=cy, rz=-sy;               // horizontal right
  let dx=forward*fx+strafe*rx, dy=forward*fy, dz=forward*fz+strafe*rz;
  const len=Math.hypot(dx,dy,dz);
  if(len>0){dx/=len;dy/=len;dz/=len;}
  freeCamPos.x+=dx*FREECAM_SPEED*dt;
  freeCamPos.y+=dy*FREECAM_SPEED*dt;
  freeCamPos.z+=dz*FREECAM_SPEED*dt;
  freeCamPos.y+=up*FREECAM_SPEED*dt;

  positionEl.textContent=`${freeCamPos.x.toFixed(0)}, ${freeCamPos.y.toFixed(0)}, ${freeCamPos.z.toFixed(0)} (free cam)`;
}

function updatePlayer(dt){
  if(freeCam){
    updateFreeCam(dt);
    return;
  }
  const sprint=keys["ShiftLeft"]||keys["ShiftRight"];
  const speed=sprint?SPRINT_SPEED:WALK_SPEED;
  const forward=(keys["KeyW"]||keys["ArrowUp"]?1:0)-(keys["KeyS"]||keys["ArrowDown"]?1:0);
  const strafe=(keys["KeyA"]||keys["ArrowLeft"]?1:0)-(keys["KeyD"]||keys["ArrowRight"]?1:0);
  const sy=Math.sin(player.yaw), cy=Math.cos(player.yaw);
  let dx=forward*sy+strafe*cy, dz=forward*cy-strafe*sy;
  const len=Math.hypot(dx,dz);
  if(len>0){dx/=len;dz/=len;}
  let nx=player.x+dx*speed*dt, nz=player.z+dz*speed*dt;
  const resolved=resolveWalls(nx,nz);
  player.x=resolved[0]; player.z=resolved[1];

  const groundY=raycastGroundHeight(player.x,player.z,player.y-EYE_HEIGHT);
  if(groundY!==null) lastGroundY=groundY;
  const floorY=lastGroundY+EYE_HEIGHT;

  if(keys["Space"]&&onGround){velocityY=JUMP_SPEED;onGround=false;}
  velocityY+=GRAVITY*dt;
  player.y+=velocityY*dt;
  if(player.y<=floorY){player.y=floorY;velocityY=0;onGround=true;}

  positionEl.textContent=`${player.x.toFixed(0)}, ${player.y.toFixed(0)}, ${player.z.toFixed(0)}`;
}

function cameraDirection(state){
  const cp=Math.cos(state.pitch),sp=Math.sin(state.pitch),cy=Math.cos(state.yaw),sy=Math.sin(state.yaw);
  return [cp*sy, sp, cp*cy];
}


