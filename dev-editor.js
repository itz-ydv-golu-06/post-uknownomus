"use strict";

/* ================================================================
   DEV TOOLS — a standalone, removable debug/level-design toolkit.

   To fully strip this out of the game later: delete this file and
   remove its <script src="dev-editor.js"> line from index.html.
   Nothing else depends on it:
     - renderer.js's per-part `.offset` support is inert until this
       file sets one.
     - renderer.js's TERRAIN_AMP_SCALE / TERRAIN_FREQ_SCALE /
       TERRAIN_MASK_NEAR / TERRAIN_MASK_FAR globals default to
       exactly the original hardcoded terrain values, unchanged
       unless this file's terrain panel edits them.
     - houses.js (NOT removable — see that file) does the actual
       GLB parsing and the permanent auto-load of houses.json at
       every startup. This file just calls into it for interactive
       import/placement and writes the manifest via "Save Layout".
     - The name labels and everything else here run their own
       requestAnimationFrame loop and touch no other file.
   Removing this file returns the game to exactly how it behaved
   before dev tools existed — any houses you've already saved to
   houses.json will keep loading normally, since that's houses.js's
   job, not this file's.

   Activate in-game by typing IAMDEV, like a classic cheat code.
   Type it again to toggle the panel closed/open once unlocked.

   Free cam (F) and the collider viewer (C) already work normally
   at any time — they aren't gated by dev mode, so there's nothing
   special to do to use them alongside these tools.

   Note: the road position editor only repositions the VISUAL mesh.
   Collision is built once from the original geometry and does not
   follow a part you've moved. The terrain "Regenerate" button DOES
   rebuild collision too (it reruns the same buildGeometry() the
   game uses at startup), so terrain edits stay physically accurate
   — that button just costs a brief hitch while it rebuilds.
   ================================================================ */
(function(){
  const CHEAT="IAMDEV";
  let typedBuffer="";
  let devActive=false;
  let panel=null;
  let selectedIndex=0;
  let step=5;
  let labelEls=[];
  let placedHouses=[]; // [{fileName, partIndices:[geomIdx,...]}] — used by Save Layout below

  function inPanelInput(){
    return panel && document.activeElement && panel.contains(document.activeElement);
  }

  window.addEventListener("keydown",e=>{
    if(!devActive && !inPanelInput() && /^[a-zA-Z]$/.test(e.key)){
      typedBuffer=(typedBuffer+e.key).toUpperCase().slice(-CHEAT.length);
      if(typedBuffer===CHEAT){
        typedBuffer="";
        if(!devActive){ devActive=true; buildPanel(); startLabelLoop(); }
        else { panel.style.display=(panel.style.display==="none")?"block":"none"; }
      }
    }
    if(!devActive || !panel) return;

    if(inPanelInput()){
      if(typeof keys!=="undefined") keys[e.code]=false;
      return;
    }

    const nudgeKeys=["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","PageUp","PageDown"];
    if(nudgeKeys.includes(e.code)){
      if(typeof keys!=="undefined") keys[e.code]=false;
      e.preventDefault();
      nudgeSelected(e.code);
    }
  });

  /* ---------------- Road position editor ---------------- */
  function currentPart(){
    if(typeof geometry==="undefined"||!geometry.length) return null;
    return geometry[selectedIndex];
  }
  function ensureOffset(part){
    if(!part.offset) part.offset={x:0,y:0,z:0};
    return part.offset;
  }
  function nudgeSelected(code){
    const part=currentPart();
    if(!part) return;
    const off=ensureOffset(part);
    if(code==="ArrowLeft") off.x-=step;
    if(code==="ArrowRight") off.x+=step;
    if(code==="ArrowUp") off.z-=step;
    if(code==="ArrowDown") off.z+=step;
    if(code==="PageUp") off.y+=step;
    if(code==="PageDown") off.y-=step;
    syncPositionInputs();
  }
  function syncPositionInputs(){
    if(!panel) return;
    const part=currentPart();
    const off=(part&&part.offset)?part.offset:{x:0,y:0,z:0};
    panel.querySelector("#devX").value=off.x.toFixed(1);
    panel.querySelector("#devY").value=off.y.toFixed(1);
    panel.querySelector("#devZ").value=off.z.toFixed(1);
  }
  function applyPositionInputs(){
    const part=currentPart();
    if(!part) return;
    const off=ensureOffset(part);
    off.x=parseFloat(panel.querySelector("#devX").value)||0;
    off.y=parseFloat(panel.querySelector("#devY").value)||0;
    off.z=parseFloat(panel.querySelector("#devZ").value)||0;
  }

  /* ---------------- Terrain editor ---------------- */
  function syncTerrainInputs(){
    if(!panel||typeof TERRAIN_AMP_SCALE==="undefined") return;
    panel.querySelector("#devAmp").value=TERRAIN_AMP_SCALE;
    panel.querySelector("#devAmpVal").textContent=TERRAIN_AMP_SCALE.toFixed(2);
    panel.querySelector("#devFreq").value=TERRAIN_FREQ_SCALE;
    panel.querySelector("#devFreqVal").textContent=TERRAIN_FREQ_SCALE.toFixed(2);
    panel.querySelector("#devMaskNear").value=TERRAIN_MASK_NEAR;
    panel.querySelector("#devMaskFar").value=TERRAIN_MASK_FAR;
  }
  function applyTerrainSlidersLive(){
    // Sliders only affect NEW geometry, so this just previews the numbers;
    // the actual mesh only updates on Regenerate (below).
    TERRAIN_AMP_SCALE=parseFloat(panel.querySelector("#devAmp").value);
    panel.querySelector("#devAmpVal").textContent=TERRAIN_AMP_SCALE.toFixed(2);
    TERRAIN_FREQ_SCALE=parseFloat(panel.querySelector("#devFreq").value);
    panel.querySelector("#devFreqVal").textContent=TERRAIN_FREQ_SCALE.toFixed(2);
  }
  function regenerateWorld(){
    TERRAIN_MASK_NEAR=parseFloat(panel.querySelector("#devMaskNear").value)||0;
    TERRAIN_MASK_FAR=Math.max(TERRAIN_MASK_NEAR+50,parseFloat(panel.querySelector("#devMaskFar").value)||0);
    const savedOffsets=geometry.map(p=>p.offset||null);
    geometry.length=0;
    buildGeometry();
    geometry.forEach((p,i)=>{ if(savedOffsets[i]) p.offset=savedOffsets[i]; });
    rebuildLabels();
    console.log("[dev-editor] world regenerated with amp="+TERRAIN_AMP_SCALE+" freq="+TERRAIN_FREQ_SCALE+
                " maskNear="+TERRAIN_MASK_NEAR+" maskFar="+TERRAIN_MASK_FAR);
  }

  /* ---------------- Live name labels over each part ---------------- */
  function centroidOf(part){
    if(!part.cells||!part.cells.length) return [0,0,0];
    let sx=0,sy=0,sz=0;
    for(const c of part.cells){ sx+=(c.minX+c.maxX)/2; sy+=(c.minY+c.maxY)/2; sz+=(c.minZ+c.maxZ)/2; }
    const n=part.cells.length;
    return [sx/n, sy/n+60, sz/n];
  }
  function projectToScreen(pos,projMat,viewMat){
    const vx=viewMat[0]*pos[0]+viewMat[4]*pos[1]+viewMat[8]*pos[2]+viewMat[12];
    const vy=viewMat[1]*pos[0]+viewMat[5]*pos[1]+viewMat[9]*pos[2]+viewMat[13];
    const vz=viewMat[2]*pos[0]+viewMat[6]*pos[1]+viewMat[10]*pos[2]+viewMat[14];
    const vw=viewMat[3]*pos[0]+viewMat[7]*pos[1]+viewMat[11]*pos[2]+viewMat[15];
    const cx=projMat[0]*vx+projMat[4]*vy+projMat[8]*vz+projMat[12]*vw;
    const cy=projMat[1]*vx+projMat[5]*vy+projMat[9]*vz+projMat[13]*vw;
    const cw=projMat[3]*vx+projMat[7]*vy+projMat[11]*vz+projMat[15]*vw;
    if(cw<=0.05) return null;
    const ndcX=cx/cw, ndcY=cy/cw;
    if(ndcX<-1.3||ndcX>1.3||ndcY<-1.3||ndcY>1.3) return null;
    return [(ndcX*0.5+0.5)*innerWidth, (1-(ndcY*0.5+0.5))*innerHeight];
  }
  function rebuildLabels(){
    labelEls.forEach(el=>el.remove());
    labelEls=(typeof geometry!=="undefined"?geometry:[]).map((p,i)=>{
      const el=document.createElement("div");
      el.className="devLabel";
      el.textContent=`${i}: ${p.name}`;
      el.style.display="none";
      document.body.appendChild(el);
      return el;
    });
  }
  let labelLoopStarted=false;
  function startLabelLoop(){
    if(labelLoopStarted) return;
    labelLoopStarted=true;
    rebuildLabels();
    function frame(){
      if(!devActive || typeof projection==="undefined" || typeof view==="undefined"){
        labelEls.forEach(el=>el.style.display="none");
        requestAnimationFrame(frame);
        return;
      }
      const useFree=(typeof freeCam!=="undefined"&&freeCam);
      const eye=useFree?[freeCamPos.x,freeCamPos.y,freeCamPos.z]:[player.x,player.y,player.z];
      geometry.forEach((part,i)=>{
        const el=labelEls[i];
        if(!el) return;
        let [cx,cy,cz]=centroidOf(part);
        if(part.offset){ cx+=part.offset.x; cy+=part.offset.y; cz+=part.offset.z; }
        const dx=cx-eye[0], dz=cz-eye[2];
        if(dx*dx+dz*dz>900*900){ el.style.display="none"; return; }
        const p=projectToScreen([cx,cy,cz],projection,view);
        if(!p){ el.style.display="none"; return; }
        el.style.display="block";
        el.style.left=p[0]+"px";
        el.style.top=p[1]+"px";
        el.style.outline=(i===selectedIndex)?"2px solid #ffd25e":"none";
      });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- Panel UI ---------------- */
  function buildPanel(){
    const style=document.createElement("style");
    style.textContent=`
      #devEditorPanel{position:fixed;left:14px;top:130px;z-index:100;width:290px;max-height:80vh;overflow-y:auto;
        background:rgba(10,12,14,.92);color:#fff;border:1px solid rgba(255,255,255,.25);
        border-radius:12px;padding:14px;font-family:system-ui,sans-serif;font-size:12px;
        box-shadow:0 8px 24px rgba(0,0,0,.5)}
      #devEditorPanel h3{margin:14px 0 8px;font-size:13px;color:#ffd25e}
      #devEditorPanel h3:first-child{margin-top:0}
      #devEditorPanel select,#devEditorPanel input[type=number],#devEditorPanel button{
        width:100%;box-sizing:border-box;margin:4px 0;padding:6px;border-radius:6px;
        border:1px solid rgba(255,255,255,.25);background:#1a1d22;color:#fff;font-size:12px}
      #devEditorPanel input[type=range]{width:100%;margin:4px 0}
      #devEditorPanel .row{display:flex;gap:6px}
      #devEditorPanel .row input{flex:1;min-width:0}
      #devEditorPanel .sliderRow{display:flex;justify-content:space-between;font-size:11px;opacity:.85}
      #devEditorPanel button{cursor:pointer;background:#2a7dff;border:none;font-weight:700}
      #devEditorPanel button.secondary{background:#333}
      #devEditorPanel hr{border:none;border-top:1px solid rgba(255,255,255,.15);margin:10px 0}
      #devEditorPanel .hint{opacity:.7;margin-top:6px;line-height:1.5}
      .devLabel{position:fixed;z-index:60;pointer-events:none;color:#ffe27a;font:700 11px/1.2 system-ui,sans-serif;
        background:rgba(0,0,0,.55);padding:2px 6px;border-radius:5px;white-space:nowrap;
        transform:translate(-50%,-100%);text-shadow:0 1px 2px rgba(0,0,0,.8)}
    `;
    document.head.appendChild(style);

    panel=document.createElement("div");
    panel.id="devEditorPanel";
    panel.innerHTML=`
      <h3>ROAD POSITION EDITOR</h3>
      <select id="devPartSelect"></select>
      <div class="row">
        <input id="devX" type="number" step="1" placeholder="X">
        <input id="devY" type="number" step="1" placeholder="Y">
        <input id="devZ" type="number" step="1" placeholder="Z">
      </div>
      <select id="devStep">
        <option value="1">Step: 1</option>
        <option value="5" selected>Step: 5</option>
        <option value="25">Step: 25</option>
        <option value="100">Step: 100</option>
      </select>
      <button id="devResetPart" class="secondary">Reset this part</button>
      <button id="devResetAll" class="secondary">Reset ALL parts</button>
      <button id="devCopyJson">Copy offsets as JSON</button>
      <div class="hint">Arrow keys: move X/Z &middot; PageUp/PageDown: move Y &middot; WASD still walks normally</div>

      <hr>
      <h3>TERRAIN EDITOR</h3>
      <div class="sliderRow"><span>Hill amplitude</span><span id="devAmpVal">1.00</span></div>
      <input id="devAmp" type="range" min="0" max="3" step="0.05" value="1">
      <div class="sliderRow"><span>Hill frequency</span><span id="devFreqVal">1.00</span></div>
      <input id="devFreq" type="range" min="0.3" max="3" step="0.05" value="1">
      <div class="row">
        <input id="devMaskNear" type="number" step="10" placeholder="Flat radius">
        <input id="devMaskFar" type="number" step="10" placeholder="Full-hill radius">
      </div>
      <button id="devRegenerate">Regenerate terrain &amp; collision</button>
      <div class="hint">Sliders preview the numbers instantly; click Regenerate to rebuild the actual mesh + collision with these values. This one has a brief hitch — it rebuilds the whole scene.</div>

      <hr>
      <h3>HOUSE IMPORTER (.glb)</h3>
      <input id="devHouseFile" type="file" accept=".glb" multiple>
      <div id="devHouseStatus" class="hint">Select one or more .glb files (you can multi-select a whole folder's worth at once). Each is placed near where you're standing, then shows up in the dropdown above to reposition.</div>
      <button id="devSaveLayout" class="secondary">Save layout (download houses.json)</button>
      <div class="hint">Before saving: copy your .glb file(s) into a "houses" folder next to index.html (matching filenames). This button downloads houses.json — move that file next to index.html too. From then on, houses load automatically every time the game starts, no dev mode needed.</div>

      <hr>
      <div class="hint">Free cam (F) and collider view (C) work as normal right now — nothing special needed. Name labels above show live in the world while this panel is open. Type IAMDEV again to hide this panel.</div>
    `;
    document.body.appendChild(panel);

    const select=panel.querySelector("#devPartSelect");
    function refreshPartSelect(){
      const prevValue=select.value;
      select.innerHTML="";
      (typeof geometry!=="undefined"?geometry:[]).forEach((p,i)=>{
        const opt=document.createElement("option");
        opt.value=i; opt.textContent=`${i}: ${p.name}`;
        select.appendChild(opt);
      });
      if(prevValue!==""&&select.querySelector(`option[value="${prevValue}"]`)) select.value=prevValue;
    }
    refreshPartSelect();
    select.addEventListener("change",()=>{selectedIndex=parseInt(select.value,10);syncPositionInputs();});
    panel.querySelector("#devStep").addEventListener("change",e=>{step=parseFloat(e.target.value);});
    ["devX","devY","devZ"].forEach(id=>{
      panel.querySelector("#"+id).addEventListener("change",applyPositionInputs);
    });
    panel.querySelector("#devResetPart").addEventListener("click",()=>{
      const part=currentPart();
      if(part) part.offset={x:0,y:0,z:0};
      syncPositionInputs();
    });
    panel.querySelector("#devResetAll").addEventListener("click",()=>{
      (typeof geometry!=="undefined"?geometry:[]).forEach(p=>{p.offset={x:0,y:0,z:0};});
      syncPositionInputs();
    });
    panel.querySelector("#devCopyJson").addEventListener("click",()=>{
      const out={};
      (typeof geometry!=="undefined"?geometry:[]).forEach(p=>{
        if(p.offset&&(p.offset.x||p.offset.y||p.offset.z)) out[p.name]=p.offset;
      });
      const json=JSON.stringify(out,null,2);
      if(navigator.clipboard) navigator.clipboard.writeText(json).catch(()=>{});
      console.log("[dev-editor] offsets JSON:\n"+json);
      alert("Offsets copied to clipboard (also logged to console) so you can save them before removing this file.");
    });

    panel.querySelector("#devAmp").addEventListener("input",applyTerrainSlidersLive);
    panel.querySelector("#devFreq").addEventListener("input",applyTerrainSlidersLive);
    panel.querySelector("#devRegenerate").addEventListener("click",()=>{
      regenerateWorld();
      refreshPartSelect();
    });

    panel.querySelector("#devHouseFile").addEventListener("change",async e=>{
      const files=Array.from(e.target.files||[]);
      if(!files.length) return;
      const statusEl=panel.querySelector("#devHouseStatus");
      const base=(typeof player!=="undefined")?{x:player.x,y:player.y,z:player.z}:{x:0,y:0,z:0};
      let placed=0, lastIndex=null;
      for(const file of files){
        statusEl.textContent=`Importing ${file.name}...`;
        try{
          const spread=placed*30; // stop imported houses from all stacking on one spot
          const created=await importGLBFile(file,{x:base.x+spread,y:base.y,z:base.z});
          placed++;
          if(created.length) lastIndex=created[0];
          placedHouses.push({fileName:file.name,partIndices:created});
          console.log(`[dev-editor] imported ${file.name}: ${created.length} mesh part(s)`);
        }catch(err){
          console.error(`[dev-editor] failed to import ${file.name}:`,err);
          statusEl.textContent=`Failed: ${file.name} — ${err.message} (check the browser console for more detail)`;
        }
      }
      refreshPartSelect();
      rebuildLabels();
      if(lastIndex!==null){
        selectedIndex=lastIndex;
        select.value=lastIndex;
        syncPositionInputs();
      }
      if(placed>0) statusEl.textContent=`Placed ${placed} house(s) near you. Select them above to reposition.`;
    });

    panel.querySelector("#devSaveLayout").addEventListener("click",()=>{
      const byFile={};
      for(const h of placedHouses){
        // A part may have been deleted/reset since import; skip anything gone.
        const parts=h.partIndices
          .map(i=>geometry[i])
          .filter(Boolean)
          .map(p=>p.offset||{x:0,y:0,z:0});
        if(!parts.length) continue;
        // Multiple imports of the same filename get merged into one manifest
        // entry with all their parts concatenated, in import order.
        if(!byFile[h.fileName]) byFile[h.fileName]=[];
        byFile[h.fileName].push(...parts);
      }
      const manifest=Object.keys(byFile).map(fileName=>({
        file:"houses/"+fileName,
        parts:byFile[fileName]
      }));
      if(!manifest.length){
        alert("No houses placed yet in this session — nothing to save.");
        return;
      }
      const json=JSON.stringify(manifest,null,2);
      const blob=new Blob([json],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url; a.download="houses.json"; a.click();
      URL.revokeObjectURL(url);
      console.log("[dev-editor] houses.json:\n"+json);
      alert("houses.json downloaded. Move it into your project folder (next to index.html), "+
            "and make sure the matching .glb file(s) are in a \"houses\" subfolder there too. "+
            "Houses will then load automatically every time the game starts, dev mode or not.");
    });

    syncPositionInputs();
    syncTerrainInputs();
    console.log("[dev-editor] DEV MODE ACTIVE — panel opened.");
  }
})();
