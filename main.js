"use strict";

start().then(()=>{
  buildStarterHouse(120,1420); // near spawn — reposition later via the dev tool (IAMDEV) if needed
  buildAllZones();             // villas, apartments, village houses, post office
  return loadHouseManifest();
});
