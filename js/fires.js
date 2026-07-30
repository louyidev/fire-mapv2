import { canvasRenderer, fireLayer } from "./map.js";

import { termLog, updateLastFireUpdate, updateStatus } from "./ui.js";

const NASA_API_KEY = "d9fe3ef6c297fec40b61f84714b55a56";

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

let allFires = [];
let timeSteps = [];
let currentStepIndex = -1;

let animationInterval = null;
let pulseInterval = null;
let isPlaying = false;

const activeMarkers = new Set();

// ------------------------------------------------------
// Labels & Styles incendies selon l'âge du foyer
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

const FIRE_STYLES = {
  c1: { fillColor: "#fff200", color: "#ffffff", fillOpacity: 1, weight: 3 },
  c2: { fillColor: "#ffd000", color: "#ffef9f", fillOpacity: 0.98, weight: 3 },
  c3: { fillColor: "#ff9800", color: "#ff5e00", fillOpacity: 0.95, weight: 3 },
  c4: { fillColor: "#ff5c00", color: "#d62828", fillOpacity: 0.9, weight: 2 },
  c5: { fillColor: "#d62828", color: "#8b0000", fillOpacity: 0.8, weight: 2 },
  c6: { fillColor: "#8b0000", color: "#4a0404", fillOpacity: 0.65, weight: 2 },
  c7: { fillColor: "#4a0404", color: "#1f1f1f", fillOpacity: 0.45, weight: 1 },
  c8: { fillColor: "#202020", color: "#000000", fillOpacity: 0.25, weight: 1 },
};

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

function isHotFire(category) {
  return ["c1", "c2", "c3"].includes(category);
}

function radiusFor(category, frp) {
  const base = Math.min(Math.max(frp * 0.45, 7), 18);

  switch (category) {
    case "c1":
      return base;
    case "c2":
      return base - 1;
    case "c3":
      return base - 2;
    case "c4":
      return 7;
    case "c5":
      return 6;
    case "c6":
      return 5;
    case "c7":
      return 4;
    default:
      return 3;
  }
}

// Générateur du template HTML Glassmorphism / Dark Mode avec Logo NASA
function buildFirePopupContent(fire, category) {
  const categoryLabel = CATEGORY_LABELS[category] || category;

  // --- Traduction / Nettoyage de la confiance ---
  let formattedConfidence = "N/A";
  if (
    fire.confidence !== undefined &&
    fire.confidence !== null &&
    fire.confidence !== "N/A"
  ) {
    const confStr = String(fire.confidence).trim().toLowerCase();
    if (confStr === "l" || confStr === "low") formattedConfidence = "Faible";
    else if (confStr === "n" || confStr === "nominal")
      formattedConfidence = "Moyenne";
    else if (confStr === "h" || confStr === "high")
      formattedConfidence = "Élevée";
    else if (!isNaN(confStr)) formattedConfidence = `${confStr}%`;
    else formattedConfidence = confStr.toUpperCase();
  }

  // --- Nom exact du satellite ---
  const exactSatellite = getFullSatelliteName(fire.satellite, fire.source);

  return `
    <div class="fire-popup-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
      <div style="display: flex; align-items: center; gap: 6px;">
        ${NASA_LOGO_SVG}
        <span class="fire-title" style="font-weight: bold;">Détection Satellite NASA</span>
      </div>
      <span class="fire-tag">${categoryLabel}</span>
    </div>

    <div class="fire-popup-body">
      <!-- 1. MÉTRIQUES CLÉS -->
      <div class="fire-telemetry" style="margin-bottom: 12px;">
        <div class="telemetry-item">
          <span class="telemetry-label">FRP (Puissance)</span>
          <span class="telemetry-value">${fire.frp} MW</span>
        </div>
        <div class="telemetry-item">
          <span class="telemetry-label">LAT</span>
          <span class="telemetry-value">${fire.lat.toFixed(2)}°</span>
        </div>
        <div class="telemetry-item">
          <span class="telemetry-label">LNG</span>
          <span class="telemetry-value">${fire.lng.toFixed(2)}°</span>
        </div>
      </div>

      <!-- 2. DÉTAILS DU FOYER -->
      <div class="fire-info-grid">
        <span class="fire-label">Satellite capteur</span>
        <span class="fire-value" style="font-weight: 600; color: #ffca28;">${exactSatellite}</span>

        <span class="fire-label">Date & Heure</span>
        <span class="fire-value">${fire.formattedDateTime} UTC</span>

        <span class="fire-label">Confiance</span>
        <span class="fire-value">${formattedConfidence}</span>

        <span class="fire-label">Luminosité</span>
        <span class="fire-value">${fire.brightness || "N/A"} K</span>

        <span class="fire-label">Passage</span>
        <span class="fire-value">${fire.daynight === "D" ? "Jour ☀️" : fire.daynight === "N" ? "Nuit 🌙" : fire.daynight || "N/A"}</span>

        <span class="fire-label">Coordonnées exactes</span>
        <span class="fire-value">${fire.lat.toFixed(4)}, ${fire.lng.toFixed(4)}</span>
      </div>
    </div>
  `;
}

// ------------------------------------------------------
// Lecture CSV NASA
// ------------------------------------------------------

async function fetchCsv(url, name) {
  termLog(`GET ${name}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const csv = await response.text();
    const lines = csv.trim().split("\n");
    if (lines.length <= 1) return [];

    const headers = lines[0].split(",").map((x) => x.trim());
    const result = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",");

      const lat = Number(row[headers.indexOf("latitude")]);
      const lng = Number(row[headers.indexOf("longitude")]);
      const frp = Number(row[headers.indexOf("frp")]) || 1;
      const date = row[headers.indexOf("acq_date")];
      const time = (row[headers.indexOf("acq_time")] || "0000").padStart(
        4,
        "0",
      );

      // Données optionnelles NASA CSV
      const brightness =
        row[headers.indexOf("brightness")] ||
        row[headers.indexOf("bright_ti4")] ||
        "N/A";
      const confidence = row[headers.indexOf("confidence")] || "N/A";
      const daynight = row[headers.indexOf("daynight")] || "N/A";
      const satellite = row[headers.indexOf("satellite")] || name;

      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        continue;
      }

      const dateObj = new Date(
        `${date}T${time.substring(0, 2)}:${time.substring(2)}:00Z`,
      );

      result.push({
        lat,
        lng,
        frp,
        brightness,
        confidence,
        daynight,
        satellite,
        timestamp: dateObj.getTime(),
        formattedDateTime: formatDate(dateObj),
        source: name,
        marker: null,
        glowMarker: null,
        category: null,
      });
    }

    termLog(`${name} : ${result.length} points`);
    return result;
  } catch (error) {
    console.error(`Erreur NASA (${name})`, error);
    return [];
  }
}

// ------------------------------------------------------
// Chargement NASA
// ------------------------------------------------------

export async function loadFires() {
  const bbox = "-5.5,41.0,9.8,51.5";

  const sources = [
    {
      name: "VIIRS SNPP",
      url: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${NASA_API_KEY}/VIIRS_SNPP_NRT/${bbox}/5`,
    },
    {
      name: "VIIRS NOAA20",
      url: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${NASA_API_KEY}/VIIRS_NOAA20_NRT/${bbox}/5`,
    },
    {
      name: "MODIS",
      url: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${NASA_API_KEY}/MODIS_NRT/${bbox}/5`,
    },
  ];

  const results = await Promise.all(
    sources.map((s) => fetchCsv(s.url, s.name)),
  );

  fireLayer.clearLayers();

  allFires = results.flat();
  allFires.sort((a, b) => a.timestamp - b.timestamp);

  // Génération des pas de temps uniques
  timeSteps = [
    ...new Map(
      allFires.map((f) => [
        f.timestamp,
        {
          timestamp: f.timestamp,
          label: f.formattedDateTime,
        },
      ]),
    ).values(),
  ];

  if (timeSteps.length === 0) {
    updateStatus("🔥 Aucun foyer détecté");
    return;
  }

  const lastIndex = timeSteps.length - 1;

  // Configuration de la timeline
  const timelinePanel = document.getElementById("timeline-panel");
  if (timelinePanel) {
    timelinePanel.style.display = "block";
  }

  const slider = document.getElementById("time-slider");
  if (slider) {
    slider.min = 0;
    slider.max = lastIndex;
    slider.value = lastIndex;
  }

  renderStep(lastIndex);
  updateFireSliderLabel(lastIndex);
  updateFireStatus();
  updateStatus(`🔥 ${allFires.length} foyers détectés`);

  startPulse();
}

// ------------------------------------------------------
// Rendu dynamique de la carte (Gestion rembobinage)
// ------------------------------------------------------

function renderStep(index) {
  const step = timeSteps[index];
  if (!step) return;

  activeMarkers.clear();

  allFires.forEach((fire) => {
    // Si le foyer est futur par rapport au curseur : on le masque
    if (fire.timestamp > step.timestamp) {
      if (fire.marker) {
        fireLayer.removeLayer(fire.marker);
        fire.marker = null;
      }
      if (fire.glowMarker) {
        fireLayer.removeLayer(fire.glowMarker);
        fire.glowMarker = null;
      }
      return;
    }

    // Le foyer est antérieur ou égal à la date choisie
    const ageHours = (step.timestamp - fire.timestamp) / 3600000;
    const category = categoryFor(ageHours);
    const radius = Math.max(radiusFor(category, fire.frp), 8); // Minimum 8px pour la facilité de clic
    const popupHtml = buildFirePopupContent(fire, category);

    // Marqueur principal
    if (!fire.marker) {
      fire.marker = L.circleMarker([fire.lat, fire.lng], {
        renderer: canvasRenderer,
        pane: "firePane", // 👈 Positionne au-dessus de la couche de vent
        radius,
        interactive: true,
        bubblingMouseEvents: false,
        ...FIRE_STYLES[category],
      }).addTo(fireLayer);

      // Bloque l'interception de clic par Leaflet-Velocity (wind.js)
      fire.marker.on("click", (e) => {
        if (e.originalEvent) {
          e.originalEvent._fireClicked = true;
          e.originalEvent.preventDefault();
          if (typeof e.originalEvent.stopPropagation === "function") {
            e.originalEvent.stopPropagation();
          }
        }
      });

      fire.marker.bindPopup(popupHtml);
    } else {
      if (!fireLayer.hasLayer(fire.marker)) {
        fire.marker.addTo(fireLayer);
      }
      fire.marker.setStyle(FIRE_STYLES[category]);
      fire.marker.setRadius(radius);

      if (fire.marker.getPopup()) {
        fire.marker.setPopupContent(popupHtml);
      }
    }

    // Effet d'incandescence (Glow) pour les feux très récents
    if (isHotFire(category)) {
      if (!fire.glowMarker) {
        fire.glowMarker = L.circleMarker([fire.lat, fire.lng], {
          renderer: canvasRenderer,
          pane: "firePane",
          radius: radius + 6,
          fillColor: "#ffe600",
          color: "transparent",
          fillOpacity: 0.35,
          interactive: false,
        }).addTo(fireLayer);
      } else if (!fireLayer.hasLayer(fire.glowMarker)) {
        fire.glowMarker.addTo(fireLayer);
      }
      activeMarkers.add(fire);
    } else {
      if (fire.glowMarker) {
        fireLayer.removeLayer(fire.glowMarker);
        fire.glowMarker = null;
      }
    }

    fire.category = category;
  });

  currentStepIndex = index;
}

// ------------------------------------------------------
// Animation de pulsation des foyers chauds
// ------------------------------------------------------

export function startPulse() {
  if (pulseInterval) return;

  let phase = 0;

  pulseInterval = setInterval(() => {
    phase += 0.3;

    activeMarkers.forEach((fire) => {
      if (!fire.marker || !fire.glowMarker) return;

      const radius = Math.max(radiusFor(fire.category, fire.frp), 8);
      fire.marker.setRadius(radius * (1 + Math.sin(phase) * 0.08));
      fire.glowMarker.setRadius((radius + 5) * (1 + Math.sin(phase) * 0.25));
    });
  }, 40);
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
      if (nextIndex >= timeSteps.length) {
        nextIndex = 0;
      }
      renderStep(nextIndex);
      updateFireSliderLabel(nextIndex);
    }, 500);
  }
}

// ------------------------------------------------------
// Mises à jour UI
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

// ------------------------------------------------------
// Événements et Initialisation
// ------------------------------------------------------

export function initUI() {
  const playBtn = document.getElementById("btn-play");
  if (playBtn) {
    playBtn.addEventListener("click", togglePlay);
  }

  const slider = document.getElementById("time-slider");
  if (slider) {
    slider.addEventListener("input", (event) => {
      if (isPlaying) togglePlay(); // Pause la lecture automatique lors de la manipulation
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

/**
 * Convertit la lettre/code du CSV NASA en nom exact du satellite
 */
function getFullSatelliteName(satCode, sourceName) {
  const sat = String(satCode || "")
    .trim()
    .toUpperCase();
  const source = String(sourceName || "")
    .trim()
    .toUpperCase();

  // 1. Détection basée sur la source "VIIRS SNPP"
  if (source.includes("SNPP")) {
    return "Suomi NPP (VIIRS)";
  }

  // 2. Détection basée sur la source "VIIRS NOAA20"
  if (source.includes("NOAA20") || source.includes("NOAA-20")) {
    return "NOAA-20 (JPSS-1 / VIIRS)";
  }

  // 3. Détection basée sur la source "MODIS" (Lettres T ou A)
  if (source.includes("MODIS")) {
    if (sat === "T" || sat.includes("TERRA")) return "Terra (EOS / MODIS)";
    if (sat === "A" || sat.includes("AQUA")) return "Aqua (EOS / MODIS)";
    return "Terra / Aqua (MODIS)";
  }

  // 4. Décodage secours par le code direct du satellite
  switch (sat) {
    case "NPP":
    case "SNPP":
      return "Suomi NPP (VIIRS)";
    case "N":
    case "NOAA20":
    case "NOAA-20":
    case "1":
      return "NOAA-20 (JPSS-1 / VIIRS)";
    case "N21":
    case "NOAA21":
    case "2":
      return "NOAA-21 (JPSS-2 / VIIRS)";
    case "T":
      return "Terra (EOS / MODIS)";
    case "A":
      return "Aqua (EOS / MODIS)";
    default:
      return satCode ? `Satellite (${satCode})` : sourceName || "Inconnu";
  }
}

// Dictionnaire d'identification des satellites de détection NASA
const SATELLITE_NAMES = {
  // VIIRS / JPSS
  NOAA20: "NOAA-20 (JPSS-1 / VIIRS)",
  "NOAA-20": "NOAA-20 (JPSS-1 / VIIRS)",
  N20: "NOAA-20 (JPSS-1 / VIIRS)",
  NPP: "Suomi NPP (VIIRS)",
  SNPP: "Suomi NPP (VIIRS)",
  VIIRS_SNPP_NRT: "Suomi NPP (VIIRS)",
  VIIRS_NOAA20_NRT: "NOAA-20 (VIIRS)",
  NOAA21: "NOAA-21 (JPSS-2 / VIIRS)",
  N21: "NOAA-21 (JPSS-2 / VIIRS)",

  // MODIS / EOS
  A: "Aqua (MODIS)",
  AQUA: "Aqua (MODIS)",
  T: "Terra (MODIS)",
  TERRA: "Terra (MODIS)",
  MODIS_NRT: "Terra / Aqua (MODIS)",
};

// Initialisation au chargement du module
initUI();
