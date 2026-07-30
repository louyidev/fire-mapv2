export const canvasRenderer = L.canvas({
  padding: 0.5,
});

export const map = L.map("map", {
  center: [44.56, -0.52], // Centré sur le Sud-Ouest / Gironde
  zoom: 9,
  renderer: canvasRenderer,
  preferCanvas: true,
  zoomSnap: 0.5,
  tap: true,
});

// --- COUCHES DE BASE ---
export const satelliteLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution: "Tiles © Esri",
  },
).addTo(map);

// --- COUCHES SUPERPOSÉES ---
export const roadsLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    pane: "overlayPane",
  },
).addTo(map);

export const placesLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    pane: "overlayPane",
  },
).addTo(map);

// Couche principale pour les feux NASA
export const fireLayer = L.layerGroup().addTo(map);

// --- ✈️ SÉPARATION DES CALQUES AÉRIENS ---
export const fireAircraftLayer = L.layerGroup().addTo(map);       // Avions de lutte & secours (toujours visible)
export const commercialAircraftLayer = L.layerGroup().addTo(map); // Autres avions (commercial, militaire, etc.)

export const windLayer = L.layerGroup().addTo(map);

// --- 🔥 ZONES BRÛLÉES WMS EFFIS (COPERNICUS CORRIGÉ) ---
export const effisBurnedAreas = L.tileLayer.wms(
  "https://effis-gwis-cms.jrc.ec.europa.eu/geoserver/wms",
  {
    layers: "effis:effis.ba.current",
    format: "image/png",
    transparent: true,
    version: "1.1.1",
    crs: L.CRS.EPSG3857,
    attribution: "© Copernicus EFFIS",
  }
).addTo(map);

// --- CONTRÔLE DES COUCHES LEAFLET ---
export const layerControl = L.control
  .layers(
    {
      Satellite: satelliteLayer,
    },
    {
      "🔥 Zones Brûlées (NASA / FIRMS)": fireLayer,
      "🔥 Polygones EFFIS (Copernicus)": effisBurnedAreas,
      "✈️ Avions Commerciaux": commercialAircraftLayer,
      "🌬️ Vent": windLayer,
      Routes: roadsLayer,
      Villes: placesLayer,
    },
    { collapsed: false }
  )
  .addTo(map);

// --- BOUTON TOGGLE DU MENU DE COUCHES ---
const layersContainer = document.querySelector(".leaflet-control-layers");

if (layersContainer) {
  const toggleHeader = document.createElement("div");
  toggleHeader.className = "layers-toggle-header";
  toggleHeader.innerHTML = `
    <span>🗺️ Affichage</span>
    <span class="layers-toggle-icon is-collapsed" id="layers-toggle-icon">▼</span>
  `;

  layersContainer.insertBefore(toggleHeader, layersContainer.firstChild);

  const layersList = document.querySelector(".leaflet-control-layers-list");
  const toggleIcon = document.getElementById("layers-toggle-icon");

  if (layersList) {
    layersList.classList.add("is-collapsed");
  }

  toggleHeader.addEventListener("click", () => {
    const isCollapsed = layersList.classList.toggle("is-collapsed");
    toggleIcon.classList.toggle("is-collapsed", isCollapsed);
  });
}

// --- ÉCOUTEURS D'ÉVÉNEMENTS : GESTION DU VENT SUR LA CARTE ---
map.on("overlayadd", function (eventLayer) {
  if (eventLayer.name === "🌬️ Vent") {
    const velocityCanvas = document.querySelector(".velocity-overlay");
    if (velocityCanvas) velocityCanvas.style.display = "block";
  }
});

map.on("overlayremove", function (eventLayer) {
  if (eventLayer.name === "🌬️ Vent") {
    const velocityCanvas = document.querySelector(".velocity-overlay");
    if (velocityCanvas) velocityCanvas.style.display = "none";
  }
});