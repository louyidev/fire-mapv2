import { map } from "./map.js";
import { termLog, updateStatus } from "./ui.js";

let burnedAreaLayer = null;

export async function loadBurnedAreas() {
  termLog("Chargement des zones brûlées via Proxy Cloudflare...");

  // Nettoyage si la couche existe déjà
  if (burnedAreaLayer && map.hasLayer(burnedAreaLayer)) {
    map.removeLayer(burnedAreaLayer);
  }

  // Création du Pane Leaflet
  if (!map.getPane("burnedAreaPane")) {
    map.createPane("burnedAreaPane");
    map.getPane("burnedAreaPane").style.zIndex = 400; // Sous les feux actifs
  }

  // URL pointant directement sur ton Worker Cloudflare
  const proxyWmsUrl = "https://square-frog-f706.louyidev.workers.dev/burned-areas";

  burnedAreaLayer = L.tileLayer.wms(proxyWmsUrl, {
    layers: "MODIS_Combined_Value_Added_Burn_Date",
    format: "image/png",
    transparent: true,
    version: "1.1.1", // Standard ultra-compatible avec Leaflet
    opacity: 0.85,
    pane: "burnedAreaPane",
    attribution: "NASA GIBS / MODIS",
  });

  // Écouteurs de statut
  burnedAreaLayer.on("loading", () => {
    console.log("⏳ [BurnedAreas] Requêtes envoyées au Worker...");
  });

  burnedAreaLayer.on("load", () => {
    console.log("✅ [BurnedAreas] Tuiles reçues et affichées !");
  });

  burnedAreaLayer.on("tileerror", (err) => {
    console.error("❌ [BurnedAreas] Erreur sur une tuile via le proxy :", err);
  });

  burnedAreaLayer.addTo(map);

  updateStatus("🔥 Zones brûlées chargées");
}

// Activer / Masquer
export function toggleBurnedAreas(visible) {
  if (!burnedAreaLayer) {
    if (visible) loadBurnedAreas();
    return;
  }

  if (visible) {
    if (!map.hasLayer(burnedAreaLayer)) {
      burnedAreaLayer.addTo(map);
    }
  } else {
    if (map.hasLayer(burnedAreaLayer)) {
      map.removeLayer(burnedAreaLayer);
    }
  }
}