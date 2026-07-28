export const canvasRenderer = L.canvas({
  padding: 0.5,
});

export const map = L.map("map", {
  center: [44.56, -0.52],
  zoom: 9,
  renderer: canvasRenderer,
  preferCanvas: true,
  zoomSnap: 0.5,
  tap: true,
});

// --- COUCHES DE BASE (Base Maps) ---
export const satelliteLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution: "Tiles © Esri",
  },
).addTo(map);

// --- COUCHES SUPERPOSÉES (Overlays) ---
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

export const fireLayer = L.layerGroup().addTo(map);
export const aircraftLayer = L.layerGroup().addTo(map);
export const windLayer = L.layerGroup().addTo(map);

// --- CONTRÔLE DES COUCHES LEAFLET ---
export const layerControl = L.control
  .layers(
    {
      Satellite: satelliteLayer,
      Satellite: satelliteLayer,
    },
    {
      "🔥 Incendies": fireLayer,
      "✈️ Avions": aircraftLayer,
      "🌬️ Vent": windLayer,
      Routes: roadsLayer,
      Villes: placesLayer,
    },
    { collapsed: false },
  )
  .addTo(map);
// --- BOUTON TOGGLE (FERMÉ PAR DÉFAUT) ---
const layersContainer = document.querySelector(".leaflet-control-layers");

if (layersContainer) {
  // 1. Création de l'en-tête cliquable
  const toggleHeader = document.createElement("div");
  toggleHeader.className = "layers-toggle-header";
  toggleHeader.innerHTML = `
    <span>🗺️ Affichage</span>
    <span class="layers-toggle-icon is-collapsed" id="layers-toggle-icon">▼</span>
  `;

  // 2. Insertion en haut du conteneur Leaflet
  layersContainer.insertBefore(toggleHeader, layersContainer.firstChild);

  const layersList = document.querySelector(".leaflet-control-layers-list");
  const toggleIcon = document.getElementById("layers-toggle-icon");

  // 3. Masquer la liste immédiatement au chargement
  if (layersList) {
    layersList.classList.add("is-collapsed");
  }

  // 4. Gestion du clic pour ouvrir / fermer
  toggleHeader.addEventListener("click", () => {
    const isCollapsed = layersList.classList.toggle("is-collapsed");
    toggleIcon.classList.toggle("is-collapsed", isCollapsed);
  });
}

// --- ÉCOUTEURS D'ÉVÉNEMENTS : GESTION DU VENT SUR LA CARTE ---
map.on("overlayadd", function (eventLayer) {
  if (eventLayer.name === "🌬️ Vent") {
    // 1. Réaffiche le canvas / conteneur de vitesse du vent sur la carte
    const velocityCanvas = document.querySelector(".velocity-overlay");
    if (velocityCanvas) velocityCanvas.style.display = "block";

    // Si tu as un objet d'animation global (ex: windAnimation), tu peux aussi faire :
    // if (window.windVelocityLayer) map.addLayer(window.windVelocityLayer);
  }
});

map.on("overlayremove", function (eventLayer) {
  if (eventLayer.name === "🌬️ Vent") {
    // 2. Masque le canvas du vent sur la carte
    const velocityCanvas = document.querySelector(".velocity-overlay");
    if (velocityCanvas) velocityCanvas.style.display = "none";

    // Si tu as un objet d'animation global :
    // if (window.windVelocityLayer) map.removeLayer(window.windVelocityLayer);
  }
});
