// ✅ Import & Initialisation de la carte MapLibre GL JS avec Satellite IGN & Noms de Villes

export const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    // 🔤 Polices vectorielles (CDN complet pour éviter les erreurs 404 HTTP)
    glyphs: "https://cdn.jsdelivr.net/gh/openmaptiles/fonts@gh-pages/{fontstack}/{range}.pbf",
    sources: {
      // 1. Photo Satellite HD (IGN Géoplateforme France)
      "ign-ortho": {
        type: "raster",
        tiles: [
          "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg",
        ],
        tileSize: 256,
        attribution: "© IGN - Photos Aériennes",
      },

      // 2. Réseau Routier IGN (Routes transparentes)
      "ign-roads": {
        type: "raster",
        tiles: [
          "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=TRANSPORTNETWORKS.ROADS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png",
        ],
        tileSize: 256,
        attribution: "© IGN - Routes",
      },

      // 3. Couche d'étiquettes et noms de villes (CartoDB Labels - Lisibilité optimale sur fond sombre/satellite)
      "carto-labels": {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
          "https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
          "https://c.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
          "https://d.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap, © CARTO",
      },
    },
    layers: [
      // 🟢 1. PHOTO SATELLITE IGN (Fond permanent)
      {
        id: "ign-ortho-layer",
        type: "raster",
        source: "ign-ortho",
        minzoom: 0,
        maxzoom: 20,
        layout: { visibility: "visible" },
      },

      // 🛣️ 2. ROUTES IGN (Apparition progressive à partir du zoom 8.5)
      {
        id: "ign-roads-layer",
        type: "raster",
        source: "ign-roads",
        minzoom: 8.5,
        maxzoom: 19,
        layout: { visibility: "visible" },
        paint: {
          "raster-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8.5, 0,
            11, 0.75,
          ],
        },
      },

      // 🏙️ 3. NOMS DES VILLES & ÉTIQUETTES (Superposés sur le satellite)
      {
        id: "carto-labels-layer",
        type: "raster",
        source: "carto-labels",
        minzoom: 0,
        maxzoom: 20,
        layout: { visibility: "visible" },
        paint: {
          "raster-opacity": 0.95,
        },
      },
    ],
  },
  center: [2.21, 46.23], // 🇫🇷 Vue centrée sur la France
  zoom: 5.4,
});

// Ajout des contrôles de navigation (Boussole et boutons Zoom)
map.addControl(new maplibregl.NavigationControl(), "top-right");

// Promise pour s'assurer que le style et la carte sont totalement chargés avant d'insérer des éléments
export const mapReady = new Promise((resolve) => {
  if (map.isStyleLoaded()) {
    resolve();
  } else {
    map.on("load", resolve);
  }
});

// Collections Map (ES6) pour la gestion et le suivi dynamique des marqueurs d'avions
export const commercialAircraftLayer = new Map();
export const fireAircraftLayer = new Map();