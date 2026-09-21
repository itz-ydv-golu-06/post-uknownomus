"use strict";

/* Full map replacement: the old city (roads, terrain, villas, apartments,
   village houses, post office, starter house) is switched off via
   SKIP_CITY_WORLD, and the NASA scene (split into 4 files under
   houses/nasa_part1-4.glb) becomes the entire walkable world instead.
   Ground collision is rebuilt from the imported geometry itself, and the
   player spawns at the scene's own ground-level center.

   Loading feedback: importing ~460 mesh parts per file, and rebuilding
   collision from the resulting 1M+ triangles, are each heavy enough to
   block the main thread for a real stretch of time. Without any visible
   progress update in between, that looked identical to the page being
   frozen. Every stage below updates the loading screen's bar/text BEFORE
   starting its work, with an explicit yield (setTimeout 0) so the browser
   actually paints that update first — otherwise the text change and the
   freeze happen in the same tick and you'd never see it. */
SKIP_CITY_WORLD = true;

const loadingScreenEl = document.getElementById("loadingScreen");
const loadingBarFillEl = document.getElementById("loadingBarFill");
const loadingTextEl = document.getElementById("loadingText");

async function setLoadingProgress(pct, text){
  loadingBarFillEl.style.width = pct + "%";
  loadingTextEl.textContent = text;
  await new Promise(r=>setTimeout(r, 0)); // let the browser paint this update before we block again
}

function hideLoadingScreen(){
  loadingScreenEl.classList.add("hidden");
  setTimeout(()=>{ loadingScreenEl.style.display = "none"; }, 700);
}

(async ()=>{
  await setLoadingProgress(3, "Starting engine…");
  await start();

  const nasaFiles = ["houses/nasa_part1.glb","houses/nasa_part2.glb","houses/nasa_part3.glb","houses/nasa_part4.glb"];
  let allIndices = [];
  for(let i=0;i<nasaFiles.length;i++){
    const file = nasaFiles[i];
    const startPct = 5 + i*20, endPct = 5 + (i+1)*20;
    await setLoadingProgress(startPct, `Loading ${file} (${i+1}/${nasaFiles.length})…`);
    try{
      const res = await fetch(file, {cache:"no-store"});
      if(!res.ok) throw new Error("HTTP "+res.status);
      const buf = await res.arrayBuffer();
      const created = await importGLBFile(buf, {x:0,y:0,z:0});
      allIndices = allIndices.concat(created);
      console.log(`[main] loaded ${file}: ${created.length} mesh parts`);
    }catch(err){
      console.error(`[main] failed to load ${file}:`, err.message);
    }
    await setLoadingProgress(endPct, `Loaded ${allIndices.length} parts so far…`);
  }

  await setLoadingProgress(88, `Building world collision (this can take a few seconds)…`);
  rebuildGroundFromImportedParts(allIndices);

  await setLoadingProgress(97, "Placing you in the world…");
  // Spawn at the scene's own ground-level center (computed from its real
  // geometry, not guessed) — see conversation notes for how this was found.
  player.x = -9;
  player.z = -212;
  player.yaw = 0;
  const groundY = raycastGroundHeight(player.x, player.z, 1e9);
  player.y = (groundY!==null ? groundY : 0) + EYE_HEIGHT;

  console.log(`[main] map replaced — ${allIndices.length} total mesh parts, spawned at (${player.x}, ${player.y.toFixed(1)}, ${player.z})`);

  await setLoadingProgress(100, "Ready!");
  setTimeout(hideLoadingScreen, 300);
})();
