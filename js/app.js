// Ajoutez toggleCommercialAircraft et toggleFireAircraft aux imports depuis ./aircrafts.js
import { loadAircrafts, toggleCommercialAircraft, toggleFireAircraft } from "./aircrafts.js";
import { loadFires } from "./fires.js";
import { loadWind } from "./wind.js";
import { loadBurnedAreas } from "./burned_areas.js";
import "./ui.js";

let aircraftInterval = null;

async function start() {
  console.log("🚀 Démarrage de l'application...");

  await loadFires();
  await loadWind();
  await loadAircrafts();

  if (!aircraftInterval) {
    aircraftInterval = setInterval(() => loadAircrafts(), 5000);
  }
}

window.addEventListener("load", start, { once: true });

document.addEventListener("DOMContentLoaded", () => {
  const filterCommercial = document.getElementById("filter-commercial");
  const filterEmergency = document.getElementById("filter-emergency");

  if (filterCommercial) {
    filterCommercial.addEventListener("change", (e) => {
      toggleCommercialAircraft(e.target.checked);
    });
  }

  if (filterEmergency) {
    filterEmergency.addEventListener("change", (e) => {
      toggleFireAircraft(e.target.checked);
    });
  }
});