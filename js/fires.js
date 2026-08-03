import { map, mapReady } from "./map.js";
import { termLog, updateLastFireUpdate, updateStatus } from "./ui.js";

const WORKER_URL = "https://square-frog-f706.louyidev.workers.dev";

// 🚀 LOGO NASA STYLISÉ (SVG)
const NASA_LOGO_SVG = `
<svg class="nasa-logo" viewBox="0 0 192 159" width="22" height="18" style="vertical-align: middle; filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.5));">
  <g fill="none" fill-rule="evenodd">
    <ellipse cx="95.5" cy="79.5" rx="72.5" ry="72.5" fill="#0B3D91"/>
    <path fill="#FFF" d="M49 88.5l10-34h12l10 34h-9l-2-8H59l-2 8h-8zm12-15h7l-3.5-13L61 73.5zm27.5 15V54.5h11l9.5 21v-21h8.5v34h-10l-10.5-22.5v22.5h-8.5zm34 0l10-34h12l10 34h-9l-2-8h-11l-2 8h-8zm12-15h7l-3.5-13-3.5 13z"/>
    <path stroke="#E03C31" stroke-width="6.5" stroke-linecap="round" d="M22 105c35-45 110-80 150-50M22 105c45 10 115 5 150-50"/>
    <ellipse cx="95.5" cy="79.5" rx="72.5" ry="30" stroke="#FFF" stroke-width="3" transform="rotate(-22 95.5 79.5)"/>
  </g>
</svg>
`;

let allFiresGeoJSON = { type: "FeatureCollection", features: [] };
let timeSteps = [];
let currentStepIndex = -1;
let animationInterval = null;
let pulseAnimationId = null;
let isPlaying = false;
let activePopup = null;

// ------------------------------------------------------
// Labels & Styles des incendies selon l'âge du foyer
// ------------------------------------------------------

const CATEGORY_LABELS = {
  c1: "Très récent (< 3h)",
  c2: "Récent (3h - 6h)",
  c3: "Actif (6h - 12h)",
  c4: "Récent (12h - 24h)",
  c5: "En déclin (24h - 36h)",
  c6: "Atténué (36h - 48h)",
  c7: "Ancien (48h - 72h)",
  c8: "Éteint (> 72h)",
};

export const FIRE_STYLES = {
  c1: { fillColor: "#fff200", color: "#ffffff", fillOpacity: 1, weight: 3 },
  c2: { fillColor: "#ffd000", color: "#ffef9f", fillOpacity: 0.98, weight: 3 },
  c3: { fillColor: "#ff9800", color: "#ff5e00", fillOpacity: 0.95, weight: 3 },
  c4: { fillColor: "#ff5c00", color: "#d62828", fillOpacity: 0.9, weight: 2 },
  c5: { fillColor: "#d62828", color: "#8b0000", fillOpacity: 0.8, weight: 2 },
  c6: { fillColor: "#8b0000", color: "#4a0404", fillOpacity: 0.65, weight: 2 },
  c7: { fillColor: "#4a0404", color: "#1f1f1f", fillOpacity: 0.45, weight: 1 },
  c8: { fillColor: "#202020", color: "#000000", fillOpacity: 0.25, weight: 1 },
};

// Expressions MapLibre basées sur FIRE_STYLES
const fireColorExpr = [
  "match",
  ["get", "category"],
  "c1", FIRE_STYLES.c1.fillColor,
  "c2", FIRE_STYLES.c2.fillColor,
  "c3", FIRE_STYLES.c3.fillColor,
  "c4", FIRE_STYLES.c4.fillColor,
  "c5", FIRE_STYLES.c5.fillColor,
  "c6", FIRE_STYLES.c6.fillColor,
  "c7", FIRE_STYLES.c7.fillColor,
  "c8", FIRE_STYLES.c8.fillColor,
  FIRE_STYLES.c8.fillColor,
];

const fireStrokeColorExpr = [
  "match",
  ["get", "category"],
  "c1", FIRE_STYLES.c1.color,
  "c2", FIRE_STYLES.c2.color,
  "c3", FIRE_STYLES.c3.color,
  "c4", FIRE_STYLES.c4.color,
  "c5", FIRE_STYLES.c5.color,
  "c6", FIRE_STYLES.c6.color,
  "c7", FIRE_STYLES.c7.color,
  "c8", FIRE_STYLES.c8.color,
  FIRE_STYLES.c8.color,
];

const fireStrokeWidthExpr = [
  "match",
  ["get", "category"],
  "c1", FIRE_STYLES.c1.weight,
  "c2", FIRE_STYLES.c2.weight,
  "c3", FIRE_STYLES.c3.weight,
  "c4", FIRE_STYLES.c4.weight,
  "c5", FIRE_STYLES.c5.weight,
  "c6", FIRE_STYLES.c6.weight,
  "c7", FIRE_STYLES.c7.weight,
  "c8", FIRE_STYLES.c8.weight,
  1,
];

const fireOpacityExpr = [
  "match",
  ["get", "category"],
  "c1", FIRE_STYLES.c1.fillOpacity,
  "c2", FIRE_STYLES.c2.fillOpacity,
  "c3", FIRE_STYLES.c3.fillOpacity,
  "c4", FIRE_STYLES.c4.fillOpacity,
  "c5", FIRE_STYLES.c5.fillOpacity,
  "c6", FIRE_STYLES.c6.fillOpacity,
  "c7", FIRE_STYLES.c7.fillOpacity,
  "c8", FIRE_STYLES.c8.fillOpacity,
  0.25,
];

// ------------------------------------------------------
// Utilitaires
// ------------------------------------------------------

function formatDate(date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function categoryFor(ageHours) {
  if (ageHours <= 3) return "c1";
  if (ageHours <= 6) return "c2";
  if (ageHours <= 12) return "c3";
  if (ageHours <= 24) return "c4";
  if (ageHours <= 36) return "c5";
  if (ageHours <= 48) return "c6";
  if (ageHours <= 72) return "c7";
  return "c8";
}

function getFullSatelliteName(satCode, sourceName) {
  const sat = String(satCode || "").trim().toUpperCase();
  const source = String(sourceName || "").trim().toUpperCase();

  if (source.includes("SNPP")) return "Suomi NPP (VIIRS)";
  if (source.includes("NOAA20") || source.includes("NOAA-20"))
    return "NOAA-20 (JPSS-1 / VIIRS)";
  if (source.includes("MODIS")) {
    if (sat === "T" || sat.includes("TERRA")) return "Terra (EOS / MODIS)";
    if (sat === "A" || sat.includes("AQUA")) return "Aqua (EOS / MODIS)";
    return "Terra / Aqua (MODIS)";
  }

  switch (sat) {
    case "NPP":
    case "SNPP":
      return "Suomi NPP (VIIRS)";
    case "N":
    case "NOAA20":
    case "NOAA-20":
      return "NOAA-20 (JPSS-1 / VIIRS)";
    case "T":
      return "Terra (EOS / MODIS)";
    case "A":
      return "Aqua (EOS / MODIS)";
    default:
      return satCode ? `Satellite (${satCode})` : sourceName || "Inconnu";
  }
}

function buildFirePopupContent(properties) {
  const categoryLabel = CATEGORY_LABELS[properties.category] || properties.category;
  let formattedConfidence = "N/A";
  if (
    properties.confidence !== undefined &&
    properties.confidence !== null &&
    properties.confidence !== "N/A"
  ) {
    const confStr = String(properties.confidence).trim().toLowerCase();
    if (confStr === "l" || confStr === "low") formattedConfidence = "Faible";
    else if (confStr === "n" || confStr === "nominal") formattedConfidence = "Moyenne";
    else if (confStr === "h" || confStr === "high") formattedConfidence = "Élevée";
    else if (!isNaN(confStr)) formattedConfidence = `${confStr}%`;
    else formattedConfidence = confStr.toUpperCase();
  }

  const exactSatellite = getFullSatelliteName(properties.satellite, properties.source);

  return `
    <div class="fire-popup-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
      <div style="display: flex; align-items: center; gap: 6px;">
        ${NASA_LOGO_SVG}
        <span class="fire-title" style="font-weight: bold;">Sat. NASA</span>
      </div>
      <span class="fire-tag">${categoryLabel}</span>
    </div>

    <div class="fire-popup-body">
      <!-- 1. MÉTRIQUES CLÉS -->
      <div class="fire-telemetry" style="margin-bottom: 12px;">
        <div class="telemetry-item">
          <span class="telemetry-label">FRP</span>
          <span class="telemetry-value">${properties.frp} MW</span>
        </div>
        <div class="telemetry-item">
          <span class="telemetry-label">LAT</span>
          <span class="telemetry-value">${Number(properties.lat).toFixed(2)}°</span>
        </div>
        <div class="telemetry-item">
          <span class="telemetry-label">LNG</span>
          <span class="telemetry-value">${Number(properties.lng).toFixed(2)}°</span>
        </div>
      </div>

      <!-- 2. DÉTAILS DU FOYER -->
      <div class="fire-info-grid">
        <span class="fire-label">Satellite capteur</span>
        <span class="fire-value" style="font-weight: 600; color: #ffca28;">${exactSatellite}</span>

        <span class="fire-label">Date & Heure</span>
        <span class="fire-value">${properties.formattedDateTime} UTC</span>

        <span class="fire-label">Confiance</span>
        <span class="fire-value">${formattedConfidence}</span>

        <span class="fire-label">Luminosité</span>
        <span class="fire-value">${properties.brightness || "N/A"} K</span>

        <span class="fire-label">Passage</span>
        <span class="fire-value">${properties.daynight === "D" ? "Jour ☀️" : properties.daynight === "N" ? "Nuit 🌙" : properties.daynight || "N/A"}</span>

        <span class="fire-label">Coordonnées exactes</span>
        <span class="fire-value">${Number(properties.lat).toFixed(4)}, ${Number(properties.lng).toFixed(4)}</span>
      </div>
    </div>
  `;
}

// ------------------------------------------------------
// Fetch CSV NASA
// ------------------------------------------------------

async function fetchCsv(url, name) {
  termLog(`GET ${name}`);

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const csv = await response.text();
    const lines = csv.trim().split("\n");
    if (lines.length <= 1) return [];

    const headers = lines[0].split(",").map((x) => x.trim());
    const features = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",");
      const lat = Number(row[headers.indexOf("latitude")]);
      const lng = Number(row[headers.indexOf("longitude")]);
      const frp = Number(row[headers.indexOf("frp")]) || 1;
      const date = row[headers.indexOf("acq_date")];
      const time = (row[headers.indexOf("acq_time")] || "0000").padStart(4, "0");

      const brightness =
        row[headers.indexOf("brightness")] ||
        row[headers.indexOf("bright_ti4")] ||
        "N/A";
      const confidence = row[headers.indexOf("confidence")] || "N/A";
      const daynight = row[headers.indexOf("daynight")] || "N/A";
      const satellite = row[headers.indexOf("satellite")] || name;

      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

      const dateObj = new Date(`${date}T${time.substring(0, 2)}:${time.substring(2)}:00Z`);

      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
        properties: {
          lat,
          lng,
          frp,
          brightness,
          confidence,
          daynight,
          satellite,
          acq_date: date,
          timestamp: dateObj.getTime(),
          formattedDateTime: formatDate(dateObj),
          source: name,
          category: "c1",
        },
      });
    }

    termLog(`${name} : ${features.length} points`);
    return features;
  } catch (error) {
    console.error(`Erreur NASA (${name})`, error);
    return [];
  }
}

// ------------------------------------------------------
// Chargement NASA & Layers MapLibre
// ------------------------------------------------------

export async function loadFires() {
  await mapReady;

  const bbox = "-5.5,41.0,9.8,51.5";

  const sources = [
    {
      name: "VIIRS SNPP",
      url: `${WORKER_URL}/nasa-fires?source=VIIRS_SNPP_NRT&bbox=${bbox}&day=5`,
    },
    {
      name: "VIIRS NOAA20",
      url: `${WORKER_URL}/nasa-fires?source=VIIRS_NOAA20_NRT&bbox=${bbox}&day=5`,
    },
    {
      name: "MODIS",
      url: `${WORKER_URL}/nasa-fires?source=MODIS_NRT&bbox=${bbox}&day=5`,
    },
  ];

  const results = await Promise.all(
    sources.map((source) => fetchCsv(source.url, source.name))
  );

  const allFeatures = results.flat();
  allFeatures.sort((a, b) => a.properties.timestamp - b.properties.timestamp);

  allFiresGeoJSON.features = allFeatures;

  timeSteps = [
    ...new Map(
      allFeatures.map((feature) => [
        feature.properties.timestamp,
        {
          timestamp: feature.properties.timestamp,
          label: feature.properties.formattedDateTime,
        },
      ])
    ).values(),
  ];

  if (timeSteps.length === 0) {
    updateStatus("🔥 Aucun foyer détecté");
    return;
  }

  // Expression de calcul du Rayon de base
  const baseRadiusExpr = [
    "let",
    "base",
    ["min", ["max", ["*", ["get", "frp"], 0.45], 7], 18],
    [
      "match",
      ["get", "category"],
      "c1", ["max", ["var", "base"], 8],
      "c2", ["max", ["-", ["var", "base"], 1], 8],
      "c3", ["max", ["-", ["var", "base"], 2], 8],
      "c4", 8,
      "c5", 8,
      "c6", 8,
      "c7", 8,
      8
    ]
  ];

  if (!map.getSource("fires-source")) {
    map.addSource("fires-source", {
      type: "geojson",
      data: allFiresGeoJSON,
    });

    // Layer 1 : Halo lumineux d'incandescence (Glow) pour feux récents (c1, c2, c3)
    map.addLayer({
      id: "fires-glow-layer",
      type: "circle",
      source: "fires-source",
      paint: {
        "circle-radius": ["+", baseRadiusExpr, 6],
        "circle-color": "#ffe600",
        "circle-opacity": 0.35,
        "circle-stroke-width": 0,
      },
    });

    // Layer 2 : Marqueurs principaux avec styles issus de FIRE_STYLES
    map.addLayer({
      id: "fires-layer",
      type: "circle",
      source: "fires-source",
      paint: {
        "circle-radius": baseRadiusExpr,
        "circle-color": fireColorExpr,
        "circle-opacity": fireOpacityExpr,
        "circle-stroke-color": fireStrokeColorExpr,
        "circle-stroke-width": fireStrokeWidthExpr,
        "circle-stroke-opacity": fireOpacityExpr,
      },
    });

    // Gestion de l'ouverture des pop-ups
    map.on("click", "fires-layer", (event) => {
      if (event.originalEvent) {
        event.originalEvent._fireClicked = true;
        event.originalEvent.stopPropagation();
      }

      const feature = event.features[0];
      const popupHtml = buildFirePopupContent(feature.properties);

      if (activePopup) {
        activePopup.remove();
      }

      activePopup = new maplibregl.Popup({
        closeButton: true,
        offset: 10,
      })
        .setLngLat(feature.geometry.coordinates)
        .setHTML(popupHtml)
        .addTo(map);
    });

    map.on("mouseenter", "fires-layer", () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "fires-layer", () => {
      map.getCanvas().style.cursor = "";
    });
  } else {
    map.getSource("fires-source").setData(allFiresGeoJSON);
  }

  const lastIndex = timeSteps.length - 1;
  const timelinePanel = document.getElementById("timeline-panel");
  if (timelinePanel) timelinePanel.style.display = "block";

  const slider = document.getElementById("time-slider");
  if (slider) {
    slider.min = 0;
    slider.max = lastIndex;
    slider.value = lastIndex;
  }

  renderStep(lastIndex);
  startPulse();
  updateFireSliderLabel(lastIndex);
  updateFireStatus();
  updateStatus(`🔥 ${allFeatures.length} foyers détectés`);
}

// ------------------------------------------------------
// Animation de pulsation (c1, c2, c3 pulsent à vitesse constante)
// ------------------------------------------------------

export function startPulse() {
  if (pulseAnimationId) return;

  let phase = 0;

  function animate() {
    // Phase incrémentée plus doucement (0.04 au lieu de 0.2) pour un pulse régulier et fluide
    phase += 0.04;

    const scaleFactor = 1 + Math.sin(phase) * 0.1;
    const glowScaleFactor = 1 + Math.sin(phase) * 0.22;

    // 1. Rayons des cercles principaux (c1, c2, c3)
    if (map.getLayer("fires-layer")) {
      const pulsedRadiusExpr = [
        "let",
        "base",
        ["min", ["max", ["*", ["get", "frp"], 0.45], 7], 18],
        [
          "match",
          ["get", "category"],
          "c1", ["*", ["max", ["var", "base"], 8], scaleFactor],
          "c2", ["*", ["max", ["-", ["var", "base"], 1], 8], scaleFactor],
          "c3", ["*", ["max", ["-", ["var", "base"], 2], 8], scaleFactor],
          // c4 à c8 restent fixes
          "c4", 8,
          "c5", 8,
          "c6", 8,
          "c7", 8,
          8,
        ]
      ];

      map.setPaintProperty("fires-layer", "circle-radius", pulsedRadiusExpr);
    }

    // 2. Halo lumineux (glow) synchronisé sur c1, c2, c3
    if (map.getLayer("fires-glow-layer")) {
      const pulsedGlowRadiusExpr = [
        "let",
        "base",
        ["min", ["max", ["*", ["get", "frp"], 0.45], 7], 18],
        [
          "match",
          ["get", "category"],
          "c1", ["*", ["+", ["max", ["var", "base"], 8], 6], glowScaleFactor],
          "c2", ["*", ["+", ["max", ["-", ["var", "base"], 1], 8], 6], glowScaleFactor],
          "c3", ["*", ["+", ["max", ["-", ["var", "base"], 2], 8], 6], glowScaleFactor],
          0,
        ]
      ];

      map.setPaintProperty("fires-glow-layer", "circle-radius", pulsedGlowRadiusExpr);
    }

    pulseAnimationId = requestAnimationFrame(animate);
  }

  animate();
}

// ------------------------------------------------------
// Rendu dynamique de la carte (Gestion rembobinage / slider)
// ------------------------------------------------------

function renderStep(index) {
  const step = timeSteps[index];
  if (!step) return;

  allFiresGeoJSON.features.forEach((feature) => {
    if (feature.properties.timestamp <= step.timestamp) {
      const ageHours = (step.timestamp - feature.properties.timestamp) / 3600000;
      feature.properties.category = categoryFor(ageHours);
    }
  });

  const source = map.getSource("fires-source");
  if (source) {
    source.setData(allFiresGeoJSON);

    // Filtrage chronologique
    map.setFilter("fires-layer", ["<=", ["get", "timestamp"], step.timestamp]);

    // Halo réservé aux foyers c1, c2 et c3
    map.setFilter("fires-glow-layer", [
      "all",
      ["<=", ["get", "timestamp"], step.timestamp],
      ["in", ["get", "category"], ["literal", ["c1", "c2", "c3"]]],
    ]);
  }

  currentStepIndex = index;
}

// ------------------------------------------------------
// Animation Timeline (Play / Pause)
// ------------------------------------------------------

function togglePlay() {
  const playBtn = document.getElementById("btn-play");

  if (isPlaying) {
    clearInterval(animationInterval);
    animationInterval = null;
    isPlaying = false;
    if (playBtn) playBtn.textContent = "▶ Jouer";
  } else {
    isPlaying = true;
    if (playBtn) playBtn.textContent = "⏸ Pause";

    animationInterval = setInterval(() => {
      let nextIndex = currentStepIndex + 1;
      if (nextIndex >= timeSteps.length) nextIndex = 0;
      renderStep(nextIndex);
      updateFireSliderLabel(nextIndex);
    }, 500);
  }
}

// ------------------------------------------------------
// Mises à jour UI & Événements
// ------------------------------------------------------

function updateFireStatus() {
  if (timeSteps.length === 0) return;
  const lastFire = timeSteps[timeSteps.length - 1];
  updateLastFireUpdate(lastFire.label);
}

function updateFireSliderLabel(index) {
  const slider = document.getElementById("time-slider");
  const timeDisplay = document.getElementById("time-display");
  const step = timeSteps[index];
  if (!step) return;

  if (slider) slider.value = index;
  if (timeDisplay) timeDisplay.textContent = step.label;
}

export function initUI() {
  const playBtn = document.getElementById("btn-play");
  if (playBtn) playBtn.addEventListener("click", togglePlay);

  const slider = document.getElementById("time-slider");
  if (slider) {
    slider.addEventListener("input", (event) => {
      if (isPlaying) togglePlay();
      const index = Number(event.target.value);
      renderStep(index);
      updateFireSliderLabel(index);
    });
  }

  const reload = document.getElementById("btn-reload");
  if (reload) {
    reload.addEventListener("click", () => {
      location.reload();
    });
  }
}

// Initialisation au chargement
initUI();