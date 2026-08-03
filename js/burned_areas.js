import maplibregl from "https://esm.sh/maplibre-gl@4.7.1";
import { map, mapReady } from "./map.js";

// Remplacez par l'URL effective de votre Worker Cloudflare
const WORKER_BURNED_URL = "https://square-frog-f706.louyidev.workers.dev/burned";

let effisPopup = null;

export async function loadBurnedAreas() {
  console.log("🔥 Chargement des surfaces brûlées via le Worker...");

  try {
    await mapReady;

    const response = await fetch(WORKER_BURNED_URL);
    if (!response.ok) {
      throw new Error(`Worker HTTP ${response.status}`);
    }

    const geojson = await response.json();
    console.log("🔥 Surfaces brûlées reçues :", geojson.features ? geojson.features.length : 0);

    if (!geojson.features || geojson.features.length === 0) {
      console.warn("⚠️ Aucune zone brûlée renvoyée par l'API.");
      return;
    }

    if (!map.getSource("effis-burned-source")) {
      map.addSource("effis-burned-source", {
        type: "geojson",
        data: geojson,
      });

      map.addLayer({
        id: "effis-burned-fill",
        type: "fill",
        source: "effis-burned-source",
        paint: {
          "fill-color": "#ff4500",
          "fill-opacity": 0.4,
        },
      });

      map.addLayer({
        id: "effis-burned-outline",
        type: "line",
        source: "effis-burned-source",
        paint: {
          "line-color": "#cc0000",
          "line-width": 1.5,
        },
      });

      addEffisEvents();
    } else {
      map.getSource("effis-burned-source").setData(geojson);
    }

    console.log("🔥 Couche EFFIS ajoutée avec succès");
  } catch (error) {
    console.error("Erreur chargement EFFIS depuis le Worker :", error);
  }
}

function addEffisEvents() {
  map.on("click", "effis-burned-fill", (event) => {
    const feature = event.features[0];
    const p = feature.properties;

    const html = `
      <div class="fire-popup-header">
        <span class="fire-title">🔥 Zone brûlée EFFIS</span>
      </div>
      <div class="fire-popup-body">
        <div class="fire-info-grid">
          <span class="fire-label">Pays</span>
          <span class="fire-value">${p.COUNTRY ?? "-"}</span>
          <span class="fire-label">Surface</span>
          <span class="fire-value">${p.AREA_HA ?? "-"} ha</span>
          <span class="fire-label">Date</span>
          <span class="fire-value">${p.FIREDATE ?? "-"}</span>
        </div>
      </div>
    `;

    if (effisPopup) {
      effisPopup.remove();
    }

    effisPopup = new maplibregl.Popup({
      closeButton: true,
      offset: 10,
    })
      .setLngLat(event.lngLat)
      .setHTML(html)
      .addTo(map);
  });

  map.on("mouseenter", "effis-burned-fill", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "effis-burned-fill", () => {
    map.getCanvas().style.cursor = "";
  });
}