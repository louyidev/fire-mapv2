import { loadFires } from "./fires.js";
import { loadAircrafts } from "./aircrafts.js";
import { loadWind } from "./wind.js";
import "./ui.js";

let aircraftInterval = null;

async function start() {
  await loadFires();

  await loadWind();

  await loadAircrafts();

  if (!aircraftInterval) {
    aircraftInterval = setInterval(() => loadAircrafts(), 10000);
  }
}

window.addEventListener("load", start, {
  once: true,
});
