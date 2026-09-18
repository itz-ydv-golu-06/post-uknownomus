"use strict";

const isTouchDevice=('ontouchstart' in window)||navigator.maxTouchPoints>0;

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
  if(e.code==="Comma") dayTime=(dayTime-1+24)%24;
  if(e.code==="Period") dayTime=(dayTime+1)%24;
});
window.addEventListener("keyup",e=>{keys[e.code]=false;});

canvas.addEventListener("click",()=>{if(!isTouchDevice) canvas.requestPointerLock();});
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


/* ---- Mobile touch controls: virtual joystick drives the same keys{} map
   the keyboard uses (so all existing movement/physics code is untouched),
   a drag zone on the right rotates the camera like mouse-look, and small
   buttons cover jump/sprint/collider-view/free-cam. Only wired up and shown
   when isTouchDevice is true — desktop behavior is completely unaffected. */
if(isTouchDevice){
  document.body.classList.add("touch-device");

  const touchStartOverlay=document.getElementById("touchStartOverlay");
  const touchStartBtn=document.getElementById("touchStartBtn");
  touchStartOverlay.classList.add("visible");

  function goFullscreenAndLockLandscape(){
    const el=document.documentElement;
    const req=el.requestFullscreen||el.webkitRequestFullscreen||el.mozRequestFullScreen||el.msRequestFullscreen;
    const doLock=()=>{
      if(screen.orientation&&screen.orientation.lock){
        screen.orientation.lock("landscape").catch(()=>{/* not supported/allowed — the CSS rotate overlay covers this */});
      }
    };
    if(req){
      Promise.resolve(req.call(el)).then(doLock).catch(doLock);
    } else {
      doLock();
    }
    touchStartOverlay.classList.remove("visible");
  }
  touchStartBtn.addEventListener("touchend",e=>{e.preventDefault();goFullscreenAndLockLandscape();},{passive:false});
  touchStartBtn.addEventListener("click",goFullscreenAndLockLandscape);

  const joyBase=document.getElementById("joystickBase");
  const joyKnob=document.getElementById("joystickKnob");
  const lookZone=document.getElementById("lookZone");
  const jumpBtnTouch=document.getElementById("jumpBtnTouch");
  const sprintBtnTouch=document.getElementById("sprintBtnTouch");
  const colliderBtnTouch=document.getElementById("colliderBtnTouch");
  const freecamBtnTouch=document.getElementById("freecamBtnTouch");

  const JOY_RADIUS=60, JOY_DEADZONE=0.28;
  let joyTouchId=null, joyCenterX=0, joyCenterY=0;

  function setMoveKeys(dx,dy){
    keys["KeyW"]=false; keys["KeyA"]=false; keys["KeyS"]=false; keys["KeyD"]=false;
    if(Math.hypot(dx,dy)<JOY_DEADZONE) return;
    if(dy<-0.3) keys["KeyW"]=true;
    if(dy> 0.3) keys["KeyS"]=true;
    if(dx<-0.3) keys["KeyA"]=true;
    if(dx> 0.3) keys["KeyD"]=true;
  }

  joyBase.addEventListener("touchstart",e=>{
    e.preventDefault();
    const t=e.changedTouches[0];
    joyTouchId=t.identifier;
    const r=joyBase.getBoundingClientRect();
    joyCenterX=r.left+r.width/2; joyCenterY=r.top+r.height/2;
  },{passive:false});

  let lookTouchId=null, lastLookX=0, lastLookY=0;
  lookZone.addEventListener("touchstart",e=>{
    e.preventDefault();
    const t=e.changedTouches[0];
    lookTouchId=t.identifier;
    lastLookX=t.clientX; lastLookY=t.clientY;
  },{passive:false});

  window.addEventListener("touchmove",e=>{
    for(const t of e.changedTouches){
      if(t.identifier===joyTouchId){
        e.preventDefault();
        let dx=(t.clientX-joyCenterX)/JOY_RADIUS, dy=(t.clientY-joyCenterY)/JOY_RADIUS;
        const mag=Math.hypot(dx,dy);
        if(mag>1){dx/=mag;dy/=mag;}
        joyKnob.style.transform=`translate(${dx*JOY_RADIUS}px,${dy*JOY_RADIUS}px)`;
        setMoveKeys(dx,dy);
      } else if(t.identifier===lookTouchId){
        e.preventDefault();
        const dx=t.clientX-lastLookX, dy=t.clientY-lastLookY;
        lastLookX=t.clientX; lastLookY=t.clientY;
        const target=freeCam?freeCamPos:player;
        target.yaw-=dx*0.0045;
        target.pitch-=dy*0.0045;
        target.pitch=Math.max(-1.5,Math.min(1.5,target.pitch));
      }
    }
  },{passive:false});

  function endJoy(){ joyTouchId=null; joyKnob.style.transform="translate(0,0)"; setMoveKeys(0,0); }
  window.addEventListener("touchend",e=>{
    for(const t of e.changedTouches){
      if(t.identifier===joyTouchId) endJoy();
      if(t.identifier===lookTouchId) lookTouchId=null;
    }
  });
  window.addEventListener("touchcancel",e=>{
    for(const t of e.changedTouches){
      if(t.identifier===joyTouchId) endJoy();
      if(t.identifier===lookTouchId) lookTouchId=null;
    }
  });

  jumpBtnTouch.addEventListener("touchstart",e=>{e.preventDefault();keys["Space"]=true;},{passive:false});
  jumpBtnTouch.addEventListener("touchend",e=>{e.preventDefault();keys["Space"]=false;});
  jumpBtnTouch.addEventListener("touchcancel",()=>{keys["Space"]=false;});

  sprintBtnTouch.addEventListener("touchstart",e=>{e.preventDefault();keys["ShiftLeft"]=true;},{passive:false});
  sprintBtnTouch.addEventListener("touchend",e=>{e.preventDefault();keys["ShiftLeft"]=false;});
  sprintBtnTouch.addEventListener("touchcancel",()=>{keys["ShiftLeft"]=false;});

  colliderBtnTouch.addEventListener("touchstart",e=>{
    e.preventDefault();
    showColliders=!showColliders;
    colliderHintEl.style.display="block";
    colliderHintEl.textContent=showColliders?"Collider view: ON (red = walls, cyan = ground, yellow = player)":"Collider view: OFF";
  },{passive:false});

  freecamBtnTouch.addEventListener("touchstart",e=>{
    e.preventDefault();
    freeCam=!freeCam;
    if(freeCam){
      freeCamPos.x=player.x; freeCamPos.y=player.y; freeCamPos.z=player.z;
      freeCamPos.yaw=player.yaw; freeCamPos.pitch=player.pitch;
    }
    colliderHintEl.style.display="block";
    colliderHintEl.textContent=freeCam?"Free cam: ON (drag right side, joystick to fly)":"Free cam: OFF";
  },{passive:false});
}
