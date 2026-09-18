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
window.addEventListener("keydown",e=>{
  keys[e.code]=true;
  if(e.code==="Space") e.preventDefault();
  if(e.code==="KeyC"){
    showColliders=!showColliders;
    colliderHintEl.style.display="block";
    colliderHintEl.textContent=showColliders?"Collider view: ON (red = walls, cyan = ground)":"Collider view: OFF";
  }
});
window.addEventListener("keyup",e=>{keys[e.code]=false;});

canvas.addEventListener("click",()=>{canvas.requestPointerLock();});
document.addEventListener("pointerlockchange",()=>{
  lockhintEl.style.display=(document.pointerLockElement===canvas)?"none":"block";
});
document.addEventListener("mousemove",e=>{
  if(document.pointerLockElement!==canvas) return;
  player.yaw-=e.movementX*0.0024;
  player.pitch-=e.movementY*0.0024;
  player.pitch=Math.max(-1.5,Math.min(1.5,player.pitch));
});

function updatePlayer(dt){
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

function cameraDirection(){
  const cp=Math.cos(player.pitch),sp=Math.sin(player.pitch),cy=Math.cos(player.yaw),sy=Math.sin(player.yaw);
  return [cp*sy, sp, cp*cy];
}

