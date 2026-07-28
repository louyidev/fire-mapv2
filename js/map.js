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

export const satelliteLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution: "Tiles © Esri",
  },
).addTo(map);

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

L.control
  .layers(
    {
      Satellite: satelliteLayer,
    },
    {
      "🔥 Incendies": fireLayer,
      "✈️ Avions": aircraftLayer,
      "🌬️ Vent": windLayer,
      Routes: roadsLayer,
      Villes: placesLayer,
    },
  )
  .addTo(map);
