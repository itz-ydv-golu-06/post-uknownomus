"use strict";

/* Full map replacement: the old city (roads, terrain, villas, apartments,
   village houses, post office, starter house) is switched off via
   SKIP_CITY_WORLD, and the NASA scene (split into 4 files under
   houses/nasa_part1-4.glb) becomes the entire walkable world instead.
   Ground collision is rebuilt from the imported geometry itself, and the
   player spawns at the scene's own ground-level center. */
SKIP_CITY_WORLD = true;

start().then(async ()=>{
  const nasaFiles = ["houses/nasa_part1.glb","houses/nasa_part2.glb","houses/nasa_part3.glb","houses/nasa_part4.glb"];
  let allIndices = [];
  for(const file of nasaFiles){
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
  }

  rebuildGroundFromImportedParts(allIndices);

  // Spawn at the scene's own ground-level center (computed from its real
  // geometry, not guessed) — see conversation notes for how this was found.
  player.x = -9;
  player.z = -212;
  player.yaw = 0;
  const groundY = raycastGroundHeight(player.x, player.z, 1e9);
  player.y = (groundY!==null ? groundY : 0) + EYE_HEIGHT;

  console.log(`[main] map replaced — ${allIndices.length} total mesh parts, spawned at (${player.x}, ${player.y.toFixed(1)}, ${player.z})`);
});
