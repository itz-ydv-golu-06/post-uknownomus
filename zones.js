"use strict";

/* ================================================================
   ZONES — procedural buildings placed by real zone, from real road data.

   Permanent file (like houses.js), runs at every startup via main.js.
   Not "photoreal" — there's no texture-image source or image-generation
   tool available in this environment, so every material here is a flat
   procedural color, not a photographic texture. What IS real: building
   footprints/heights vary per zone (villas vs towers vs cottages), and
   placement uses actual roadProximity() data against the real road mesh
   rather than guessed coordinates, so buildings land in genuine gaps
   between roads instead of overlapping them.
   ================================================================ */

function pushTriN(posArr,idxArr,p0,p1,p2,n){
  const base=posArr.length/8;
  for(const p of [p0,p1,p2]) posArr.push(p[0],p[1],p[2], n[0],n[1],n[2], 0,0);
  idxArr.push(base,base+1,base+2);
}
// Axis-aligned box, 6 faces, explicit (pre-verified) outward normals — reused
// for tower bodies, AC units, chimneys, fence posts, balconies, etc.
function addBox(posArr,idxArr,x0,y0,z0,x1,y1,z1){
  pushQuad(posArr,idxArr,[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[0,0,-1]);
  pushQuad(posArr,idxArr,[x1,y0,z1],[x0,y0,z1],[x0,y1,z1],[x1,y1,z1],[0,0,1]);
  pushQuad(posArr,idxArr,[x0,y0,z1],[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[-1,0,0]);
  pushQuad(posArr,idxArr,[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0],[1,0,0]);
  pushQuad(posArr,idxArr,[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],[0,1,0]);
  pushQuad(posArr,idxArr,[x0,y0,z1],[x1,y0,z1],[x1,y0,z0],[x0,y0,z0],[0,-1,0]);
}
function rand(min,max){ return min+Math.random()*(max-min); }
function groundAt(x,z){
  const g=(typeof raycastGroundHeight==="function")?raycastGroundHeight(x,z,1e9):0;
  return g!==null?g:0;
}

/* ---------------- Villa (European luxury style) ----------------
   Two-story cream-stucco body, gabled terracotta roof, a small balcony
   over the entrance, an arched-look doorway, shuttered windows, and a
   low garden wall around the plot. */
function buildVilla(cx,cz,yaw){
  const baseY=groundAt(cx,cz);
  const hw=15, hd=12, wallH=22, overhang=2.5, peakRise=9;
  const rd=hd+overhang;

  const wallPos=[],wallIdx=[];
  addBox(wallPos,wallIdx,-hw,0,-hd,hw,wallH,hd);
  // second-floor string course (a thin trim band) for a two-story read
  addBox(wallPos,wallIdx,-hw-0.3,wallH*0.52,-hd-0.3,hw+0.3,wallH*0.52+0.8,hd+0.3);

  const roofPos=[],roofIdx=[];
  pushQuad(roofPos,roofIdx,[-hw,wallH,-rd],[hw,wallH,-rd],[hw,wallH+peakRise,0],[-hw,wallH+peakRise,0],
    [0,rd/Math.hypot(rd,peakRise),-peakRise/Math.hypot(rd,peakRise)]);
  pushQuad(roofPos,roofIdx,[hw,wallH,rd],[-hw,wallH,rd],[-hw,wallH+peakRise,0],[hw,wallH+peakRise,0],
    [0,rd/Math.hypot(rd,peakRise),peakRise/Math.hypot(rd,peakRise)]);
  pushTriN(roofPos,roofIdx,[-hw,wallH,-hd],[-hw,wallH,hd],[-hw,wallH+peakRise,0],[-1,0,0]);
  pushTriN(roofPos,roofIdx,[hw,wallH,hd],[hw,wallH,-hd],[hw,wallH+peakRise,0],[1,0,0]);

  const trimPos=[],trimIdx=[]; // door, windows, balcony, shutters — all one accent material
  pushQuad(trimPos,trimIdx,[-2.2,0,-hd-0.05],[2.2,0,-hd-0.05],[2.2,9,-hd-0.05],[-2.2,9,-hd-0.05],[0,0,-1]);
  pushQuad(trimPos,trimIdx,[-11,3,-hd-0.05],[-6,3,-hd-0.05],[-6,8,-hd-0.05],[-11,8,-hd-0.05],[0,0,-1]);
  pushQuad(trimPos,trimIdx,[6,3,-hd-0.05],[11,3,-hd-0.05],[11,8,-hd-0.05],[6,8,-hd-0.05],[0,0,-1]);
  pushQuad(trimPos,trimIdx,[-9,13.5,-hd-0.05],[-4,13.5,-hd-0.05],[-4,18,-hd-0.05],[-9,18,-hd-0.05],[0,0,-1]);
  pushQuad(trimPos,trimIdx,[4,13.5,-hd-0.05],[9,13.5,-hd-0.05],[9,18,-hd-0.05],[4,18,-hd-0.05],[0,0,-1]);
  addBox(trimPos,trimIdx,-4.5,11.6,-hd-2.6,4.5,12.1,-hd+0.2);
  for(let bx=-4;bx<=4;bx+=1.6) addBox(trimPos,trimIdx,bx-0.15,12.1,-hd-2.5,bx+0.15,14.4,-hd-2.2);

  const fencePos=[],fenceIdx=[];
  const fw=hw+9, fd=hd+9, fh=2.2;
  const segs=[[-fw,-fd,fw,-fd],[fw,-fd,fw,fd],[fw,fd,-fw,fd],[-fw,fd,-fw,-fd]];
  for(const [ax,az,bx,bz] of segs){
    const steps=6;
    for(let i=0;i<steps;i++){
      const t0=i/steps, t1=(i+1)/steps;
      if(az===-fd&&bz===-fd&&t0>0.35&&t1<0.65) continue;
      const x0=ax+(bx-ax)*t0, z0=az+(bz-az)*t0, x1=ax+(bx-ax)*t1, z1=az+(bz-az)*t1;
      addBox(fencePos,fenceIdx,Math.min(x0,x1)-0.2,0,Math.min(z0,z1)-0.2,Math.max(x0,x1)+0.2,fh,Math.max(z0,z1)+0.2);
    }
  }

  const wallMat=addHouseMaterial("VillaWalls",[0.93,0.87,0.74,1],0.85,0);
  const roofMat=addHouseMaterial("VillaRoof",[0.62,0.24,0.16,1],0.75,0);
  const trimMat=addHouseMaterial("VillaTrim",[0.97,0.96,0.92,1],0.5,0);
  const fenceMat=addHouseMaterial("VillaFence",[0.85,0.83,0.78,1],0.9,0);

  const parts=[
    uploadMeshPart("Villa_walls",wallMat,new Float32Array(wallPos),Uint32Array.from(wallIdx)),
    uploadMeshPart("Villa_roof",roofMat,new Float32Array(roofPos),Uint32Array.from(roofIdx)),
    uploadMeshPart("Villa_trim",trimMat,new Float32Array(trimPos),Uint32Array.from(trimIdx)),
    uploadMeshPart("Villa_fence",fenceMat,new Float32Array(fencePos),Uint32Array.from(fenceIdx)),
  ];
  parts.forEach(p=>{ p.offset={x:cx,y:baseY,z:cz}; });
  return parts;
}

/* ---------------- Apartment tower ---------------- */
function buildApartment(cx,cz){
  const baseY=groundAt(cx,cz);
  const hw=11, hd=11;
  const floors=Math.round(rand(5,9));
  const floorH=8.5, wallH=floors*floorH;

  const bodyPos=[],bodyIdx=[];
  addBox(bodyPos,bodyIdx,-hw,0,-hd,hw,wallH,hd);

  const winPos=[],winIdx=[];
  const cols=4, colStep=(hw*2-3)/cols;
  for(let f=0;f<floors;f++){
    const y0=f*floorH+2.2, y1=f*floorH+6.3;
    for(let c=0;c<cols;c++){
      const x0=-hw+1.5+c*colStep, x1=x0+colStep-1.0;
      pushQuad(winPos,winIdx,[x0,y0,-hd-0.05],[x1,y0,-hd-0.05],[x1,y1,-hd-0.05],[x0,y1,-hd-0.05],[0,0,-1]);
      pushQuad(winPos,winIdx,[x1,y0,hd+0.05],[x0,y0,hd+0.05],[x0,y1,hd+0.05],[x1,y1,hd+0.05],[0,0,1]);
    }
    const dcols=4, dstep=(hd*2-3)/dcols;
    for(let c=0;c<dcols;c++){
      const z0=-hd+1.5+c*dstep, z1=z0+dstep-1.0;
      pushQuad(winPos,winIdx,[-hw-0.05,y0,z1],[-hw-0.05,y0,z0],[-hw-0.05,y1,z0],[-hw-0.05,y1,z1],[-1,0,0]);
      pushQuad(winPos,winIdx,[hw+0.05,y0,z0],[hw+0.05,y0,z1],[hw+0.05,y1,z1],[hw+0.05,y1,z0],[1,0,0]);
    }
  }

  const roofPos=[],roofIdx=[];
  pushQuad(roofPos,roofIdx,[-hw,wallH,-hd],[hw,wallH,-hd],[hw,wallH,hd],[-hw,wallH,hd],[0,1,0]);
  addBox(roofPos,roofIdx,-3,wallH,-3,0,wallH+2.6,0);
  addBox(roofPos,roofIdx,1,wallH,1,4.5,wallH+1.2,3.5);

  const wallMat=addHouseMaterial("ApartmentBody",[0.72,0.71,0.68,1],0.7,0.05);
  const winMat=addHouseMaterial("ApartmentWindows",[0.38,0.5,0.58,1],0.25,0.15);
  const roofMat=addHouseMaterial("ApartmentRoof",[0.55,0.55,0.55,1],0.85,0);

  const parts=[
    uploadMeshPart("Apartment_body",wallMat,new Float32Array(bodyPos),Uint32Array.from(bodyIdx)),
    uploadMeshPart("Apartment_windows",winMat,new Float32Array(winPos),Uint32Array.from(winIdx)),
    uploadMeshPart("Apartment_roof",roofMat,new Float32Array(roofPos),Uint32Array.from(roofIdx)),
  ];
  parts.forEach(p=>{ p.offset={x:cx,y:baseY,z:cz}; });
  return parts;
}

/* ---------------- Village house ---------------- */
const VILLAGE_WALL_COLORS=[[0.88,0.80,0.62,1],[0.94,0.91,0.83,1],[0.80,0.68,0.52,1]];
const VILLAGE_ROOF_COLORS=[[0.55,0.20,0.15,1],[0.30,0.24,0.20,1],[0.42,0.42,0.44,1]];
function buildVillageHouse(cx,cz){
  const baseY=groundAt(cx,cz);
  const hw=rand(7,9.5), hd=rand(6,8), wallH=rand(9,12);
  const overhang=2, apexRise=rand(5,7);

  const wallPos=[],wallIdx=[];
  addBox(wallPos,wallIdx,-hw,0,-hd,hw,wallH,hd);

  const roofPos=[],roofIdx=[];
  const rw=hw+overhang, rd=hd+overhang, apex=[0,wallH+apexRise,0];
  const hz=Math.hypot(rd,apexRise), hx=Math.hypot(rw,apexRise);
  pushTriN(roofPos,roofIdx,[-rw,wallH,-rd],apex,[rw,wallH,-rd],[0,rd/hz,-apexRise/hz]);
  pushTriN(roofPos,roofIdx,[rw,wallH,-rd],apex,[rw,wallH,rd],[apexRise/hx,rw/hx,0]);
  pushTriN(roofPos,roofIdx,[rw,wallH,rd],apex,[-rw,wallH,rd],[0,rd/hz,apexRise/hz]);
  pushTriN(roofPos,roofIdx,[-rw,wallH,rd],apex,[-rw,wallH,-rd],[-apexRise/hx,rw/hx,0]);

  const chimPos=[],chimIdx=[];
  addBox(chimPos,chimIdx,hw-2.4,wallH-2,-hd+0.8,hw-1.0,wallH+5,-hd+2.2);

  const trimPos=[],trimIdx=[];
  pushQuad(trimPos,trimIdx,[-1.6,0,-hd-0.05],[1.6,0,-hd-0.05],[1.6,6,-hd-0.05],[-1.6,6,-hd-0.05],[0,0,-1]);
  pushQuad(trimPos,trimIdx,[-hw+1.5,3,-hd-0.05],[-hw+4,3,-hd-0.05],[-hw+4,6,-hd-0.05],[-hw+1.5,6,-hd-0.05],[0,0,-1]);
  pushQuad(trimPos,trimIdx,[hw-4,3,-hd-0.05],[hw-1.5,3,-hd-0.05],[hw-1.5,6,-hd-0.05],[hw-4,6,-hd-0.05],[0,0,-1]);

  const wallColor=VILLAGE_WALL_COLORS[Math.floor(Math.random()*VILLAGE_WALL_COLORS.length)];
  const roofColor=VILLAGE_ROOF_COLORS[Math.floor(Math.random()*VILLAGE_ROOF_COLORS.length)];
  const wallMat=addHouseMaterial("VillageWalls",wallColor,0.9,0);
  const roofMat=addHouseMaterial("VillageRoof",roofColor,0.8,0);
  const chimMat=addHouseMaterial("VillageChimney",[0.55,0.42,0.36,1],0.9,0);
  const trimMat=addHouseMaterial("VillageTrim",[0.33,0.22,0.14,1],0.7,0);

  const parts=[
    uploadMeshPart("VillageHouse_walls",wallMat,new Float32Array(wallPos),Uint32Array.from(wallIdx)),
    uploadMeshPart("VillageHouse_roof",roofMat,new Float32Array(roofPos),Uint32Array.from(roofIdx)),
    uploadMeshPart("VillageHouse_chimney",chimMat,new Float32Array(chimPos),Uint32Array.from(chimIdx)),
    uploadMeshPart("VillageHouse_trim",trimMat,new Float32Array(trimPos),Uint32Array.from(trimIdx)),
  ];
  parts.forEach(p=>{ p.offset={x:cx,y:baseY,z:cz}; });
  return parts;
}

/* ---------------- Post office ---------------- */
function buildPostOffice(cx,cz){
  const baseY=groundAt(cx,cz);
  const hw=13, hd=10, wallH=13;

  const wallPos=[],wallIdx=[];
  addBox(wallPos,wallIdx,-hw,0,-hd,hw,wallH,hd);

  const roofPos=[],roofIdx=[];
  pushQuad(roofPos,roofIdx,[-hw,wallH,-hd],[hw,wallH,-hd],[hw,wallH,hd],[-hw,wallH,hd],[0,1,0]);
  const pw=6, pd=4, pRise=3.5, peY=wallH+4.5;
  pushTriN(roofPos,roofIdx,[-pw,peY,-hd-pd],[pw,peY,-hd-pd],[0,peY+pRise,-hd],[0,0.753,-0.659]);
  addBox(roofPos,roofIdx,-pw,wallH,-hd-pd,pw,peY,-hd);

  const colPos=[],colIdx=[];
  addBox(colPos,colIdx,-pw+1,0,-hd-pd+1,-pw+2.2,wallH,-hd-pd+2.2);
  addBox(colPos,colIdx,pw-2.2,0,-hd-pd+1,pw-1,wallH,-hd-pd+2.2);

  const trimPos=[],trimIdx=[];
  pushQuad(trimPos,trimIdx,[-3,0,-hd-0.05],[3,0,-hd-0.05],[3,9,-hd-0.05],[-3,9,-hd-0.05],[0,0,-1]);
  for(const sx of [-9,9]){
    pushQuad(trimPos,trimIdx,[sx-2,4,-hd-0.05],[sx+2,4,-hd-0.05],[sx+2,9,-hd-0.05],[sx-2,9,-hd-0.05],[0,0,-1]);
  }
  addBox(trimPos,trimIdx,10.5,0,-hd-0.3,10.8,wallH+9,-hd);
  const flagPos=[],flagIdx=[];
  pushQuad(flagPos,flagIdx,[10.8,wallH+7.5,-hd],[13.5,wallH+7,-hd],[13.5,wallH+5.2,-hd],[10.8,wallH+5.7,-hd],[0,0,-1]);

  const wallMat=addHouseMaterial("PostOfficeWalls",[0.95,0.94,0.90,1],0.7,0);
  const roofMat=addHouseMaterial("PostOfficeRoof",[0.14,0.20,0.42,1],0.6,0);
  const colMat=addHouseMaterial("PostOfficeColumns",[0.97,0.97,0.95,1],0.4,0);
  const trimMat=addHouseMaterial("PostOfficeTrim",[0.14,0.20,0.42,1],0.5,0);
  const flagMat=addHouseMaterial("PostOfficeFlag",[0.75,0.12,0.12,1],0.6,0);

  const parts=[
    uploadMeshPart("PostOffice_walls",wallMat,new Float32Array(wallPos),Uint32Array.from(wallIdx)),
    uploadMeshPart("PostOffice_roof",roofMat,new Float32Array(roofPos),Uint32Array.from(roofIdx)),
    uploadMeshPart("PostOffice_columns",colMat,new Float32Array(colPos),Uint32Array.from(colIdx)),
    uploadMeshPart("PostOffice_trim",trimMat,new Float32Array(trimPos),Uint32Array.from(trimIdx)),
    uploadMeshPart("PostOffice_flag",flagMat,new Float32Array(flagPos),Uint32Array.from(flagIdx)),
  ];
  parts.forEach(p=>{ p.offset={x:cx,y:baseY,z:cz}; });
  return parts;
}

/* ---------------- Plot finding ----------------
   roadProximity() is ring-quantized in units of ROAD_MASK_CELL (120) — it
   only ever returns 0, 120, 240, etc, never a value in between. A distance
   of exactly 120 means "just outside any road-occupied cell", which is
   reliably a real gap between roads (a city block interior) rather than a
   guessed coordinate. 0 means on/right next to the road itself; anything
   240+ is likely open land beyond the block, not a real building plot. */
function findPlots(cx,cz,radius,minSpacing,maxCount,allowedDistances){
  if(typeof roadProximity!=="function") return [{x:cx,z:cz}];
  const allowed=allowedDistances||[120];
  const candidates=[];
  const step=Math.max(20,minSpacing*0.6);
  for(let x=cx-radius;x<=cx+radius;x+=step){
    for(let z=cz-radius;z<=cz+radius;z+=step){
      const d=roadProximity(x,z);
      if(allowed.includes(d)) candidates.push({x,z,d});
    }
  }
  candidates.sort(()=>Math.random()-0.5);
  const chosen=[];
  for(const c of candidates){
    if(chosen.length>=maxCount) break;
    if(chosen.every(o=>Math.hypot(o.x-c.x,o.z-c.z)>=minSpacing)) chosen.push(c);
  }
  return chosen;
}

/* ---------------- Master placement ---------------- */
function buildAllZones(){
  const villaPlots=findPlots(-1000,-550,300,55,7,[120]);
  villaPlots.forEach(p=>buildVilla(p.x,p.z));

  const apartmentPlots=findPlots(300,100,420,60,7,[120,240]);
  apartmentPlots.forEach(p=>buildApartment(p.x,p.z));

  const villagePlots=findPlots(-1000,-1300,220,45,6,[120]);
  villagePlots.forEach(p=>buildVillageHouse(p.x,p.z));

  const postPlots=findPlots(-280,-190,180,50,1,[120]);
  if(postPlots.length) buildPostOffice(postPlots[0].x,postPlots[0].z);
  else buildPostOffice(-280,-190);

  console.log(`[zones] placed ${villaPlots.length} villas, ${apartmentPlots.length} apartment towers, `+
              `${villagePlots.length} village houses, 1 post office`);
}
