"use strict";

/* ================================================================
   DEV ROAD EDITOR — a standalone, removable debug tool.

   To fully strip this out of the game later: delete this file and
   remove its <script src="dev-editor.js"> line from index.html.
   Nothing else depends on it. The only thing it relies on is the
   per-part `.offset` support in renderer.js's draw loop — and that
   hook is completely inert on its own: parts simply have no
   `.offset` property until this file sets one, so removing this
   file returns everything to exactly how it behaved before it
   existed. No other file needs to change.

   Activate in-game by typing IAMDEV, like a classic cheat code.
   Type it again to toggle the panel closed/open once unlocked.

   Note: this only repositions the VISUAL mesh. Collision (ground
   height + wall pushback) is built once from the original geometry
   and does not follow a part you've moved — treat this as a layout
   preview tool, not a physics-accurate one.
   ================================================================ */
(function(){
  const CHEAT="IAMDEV";
  let typedBuffer="";
  let devActive=false;
  let panel=null;
  let selectedIndex=0;
  let step=5;

  function inPanelInput(){
    return panel && document.activeElement && panel.contains(document.activeElement);
  }

  window.addEventListener("keydown",e=>{
    if(!devActive && !inPanelInput() && /^[a-zA-Z]$/.test(e.key)){
      typedBuffer=(typedBuffer+e.key).toUpperCase().slice(-CHEAT.length);
      if(typedBuffer===CHEAT){
        typedBuffer="";
        if(!devActive){ devActive=true; buildPanel(); }
        else { panel.style.display=(panel.style.display==="none")?"block":"none"; }
      }
    }
    if(!devActive || !panel) return;

    if(inPanelInput()){
      // Typing/clicking inside our own panel — never let it leak into player movement.
      if(typeof keys!=="undefined") keys[e.code]=false;
      return;
    }

    const nudgeKeys=["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","PageUp","PageDown"];
    if(nudgeKeys.includes(e.code)){
      if(typeof keys!=="undefined") keys[e.code]=false; // cancel player.js's movement flag
      e.preventDefault();
      nudgeSelected(e.code);
    }
  });

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
    syncInputs();
  }
  function syncInputs(){
    if(!panel) return;
    const part=currentPart();
    const off=(part&&part.offset)?part.offset:{x:0,y:0,z:0};
    panel.querySelector("#devX").value=off.x.toFixed(1);
    panel.querySelector("#devY").value=off.y.toFixed(1);
    panel.querySelector("#devZ").value=off.z.toFixed(1);
  }
  function applyInputs(){
    const part=currentPart();
    if(!part) return;
    const off=ensureOffset(part);
    off.x=parseFloat(panel.querySelector("#devX").value)||0;
    off.y=parseFloat(panel.querySelector("#devY").value)||0;
    off.z=parseFloat(panel.querySelector("#devZ").value)||0;
  }

  function buildPanel(){
    const style=document.createElement("style");
    style.textContent=`
      #devEditorPanel{position:fixed;left:14px;top:130px;z-index:100;width:280px;
        background:rgba(10,12,14,.92);color:#fff;border:1px solid rgba(255,255,255,.25);
        border-radius:12px;padding:14px;font-family:system-ui,sans-serif;font-size:12px;
        box-shadow:0 8px 24px rgba(0,0,0,.5)}
      #devEditorPanel h3{margin:0 0 8px;font-size:13px;color:#ffd25e}
      #devEditorPanel select,#devEditorPanel input,#devEditorPanel button{
        width:100%;box-sizing:border-box;margin:4px 0;padding:6px;border-radius:6px;
        border:1px solid rgba(255,255,255,.25);background:#1a1d22;color:#fff;font-size:12px}
      #devEditorPanel .row{display:flex;gap:6px}
      #devEditorPanel .row input{flex:1;min-width:0}
      #devEditorPanel button{cursor:pointer;background:#2a7dff;border:none;font-weight:700}
      #devEditorPanel button.secondary{background:#333}
      #devEditorPanel .hint{opacity:.7;margin-top:6px;line-height:1.5}
    `;
    document.head.appendChild(style);

    panel=document.createElement("div");
    panel.id="devEditorPanel";
    panel.innerHTML=`
      <h3>DEV ROAD EDITOR</h3>
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
      <div class="hint">Arrow keys: move X/Z &middot; PageUp/PageDown: move Y &middot; WASD still walks normally &middot; type IAMDEV again to hide panel</div>
    `;
    document.body.appendChild(panel);

    const select=panel.querySelector("#devPartSelect");
    (typeof geometry!=="undefined"?geometry:[]).forEach((p,i)=>{
      const opt=document.createElement("option");
      opt.value=i; opt.textContent=`${i}: ${p.name}`;
      select.appendChild(opt);
    });
    select.addEventListener("change",()=>{selectedIndex=parseInt(select.value,10);syncInputs();});
    panel.querySelector("#devStep").addEventListener("change",e=>{step=parseFloat(e.target.value);});
    ["devX","devY","devZ"].forEach(id=>{
      panel.querySelector("#"+id).addEventListener("change",applyInputs);
    });
    panel.querySelector("#devResetPart").addEventListener("click",()=>{
      const part=currentPart();
      if(part) part.offset={x:0,y:0,z:0};
      syncInputs();
    });
    panel.querySelector("#devResetAll").addEventListener("click",()=>{
      (typeof geometry!=="undefined"?geometry:[]).forEach(p=>{p.offset={x:0,y:0,z:0};});
      syncInputs();
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

    syncInputs();
    console.log("[dev-editor] DEV MODE ACTIVE — panel opened. Select a part, then use the arrow keys / PageUp / PageDown to nudge it, or type exact numbers.");
  }
})();
