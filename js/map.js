// ✅ Import ESM direct depuis le CDN pour éviter l'erreur "bare specifier"

// Initialisation de la carte MapLibre GL JS avec les flux IGN Géoplateforme
export const map = new maplibregl.Map({
  
  container: "map",
  style: {
    version: 8,
    // ✅ Requis pour l'affichage des textes (labels/text-field) dans MapLibre GL
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      // 1. Plan IGN (Fond topographique récent)
      "ign-plan": {
        type: "raster",
        tiles: [
          "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png",
        ],
        tileSize: 256,
        attribution: "© IGN - Géoplateforme",
      },
      // 2. Orthophotos IGN (Photographies aériennes HD récentes)
      "ign-ortho": {
        type: "raster",
        tiles: [
          "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg",
        ],
        tileSize: 256,
        attribution: "© IGN - Photos Aériennes",
      },
    },
    layers: [
      {
        id: "ign-ortho-layer",
        type: "raster",
        source: "ign-ortho",
        minzoom: 0,
        maxzoom: 19,
        layout: { visibility: "visible" },
      },
      {
        id: "ign-plan-layer",
        type: "raster",
        source: "ign-plan",
        minzoom: 0,
        maxzoom: 19,
        layout: { visibility: "none" }, // Masqué par défaut
      },
    ],
  },
  center: [-0.52, 44.56], // [Longitude, Latitude] - Sud-Ouest / Gironde
  zoom: 9,
});

// Ajout du contrôle de navigation standard (Zoom / Boussole)
map.addControl(new maplibregl.NavigationControl(), "top-right");

// Attente du chargement complet du style
export const mapReady = new Promise((resolve) => {
  if (map.isStyleLoaded()) {
    resolve();
  } else {
    map.on("load", resolve);
  }
});

// Collections (Maps) pour stocker et séparer les marqueurs d'avions MapLibre
export const commercialAircraftLayer = new Map();
export const fireAircraftLayer = new Map();