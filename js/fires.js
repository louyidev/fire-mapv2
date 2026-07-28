import { canvasRenderer, fireLayer } from "./map.js";

import {
  termLog,
  updateLastFireUpdate,
  updateStatus,
} from "./ui.js";

const NASA_API_KEY = "d9fe3ef6c297fec40b61f84714b55a56";

let allFires = [];
let timeSteps = [];
let currentStepIndex = -1;

let animationInterval = null;
let pulseInterval = null;
let isPlaying = false;

const activeMarkers = new Set();

// ------------------------------------------------------
// Styles incendies selon l'âge du foyer
// ------------------------------------------------------

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
    case "c1": return base;
    case "c2": return base - 1;
    case "c3": return base - 2;
    case "c4": return 7;
    case "c5": return 6;
    case "c6": return 5;
    case "c7": return 4;
    default: return 3;
  }
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
      const time = (row[headers.indexOf("acq_time")] || "0000").padStart(4, "0");

      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        continue;
      }

      const dateObj = new Date(
        `${date}T${time.substring(0, 2)}:${time.substring(2)}:00Z`
      );

      result.push({
        lat,
        lng,
        frp,
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
    sources.map((s) => fetchCsv(s.url, s.name))
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
      ])
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
    const radius = radiusFor(category, fire.frp);

    // Marqueur principal
    if (!fire.marker) {
      fire.marker = L.circleMarker([fire.lat, fire.lng], {
        renderer: canvasRenderer,
        radius,
        ...FIRE_STYLES[category],
      }).addTo(fireLayer);

      fire.marker.bindPopup(`
        🔥 Catégorie : ${category}<br>
        Source : ${fire.source}<br>
        Date : ${fire.formattedDateTime}<br>
        FRP : ${fire.frp} MW
      `);
    } else {
      if (!fireLayer.hasLayer(fire.marker)) {
        fire.marker.addTo(fireLayer);
      }
      fire.marker.setStyle(FIRE_STYLES[category]);
      fire.marker.setRadius(radius);
    }

    // Effet d'incandescence (Glow) pour les feux très récents
    if (isHotFire(category)) {
      if (!fire.glowMarker) {
        fire.glowMarker = L.circleMarker([fire.lat, fire.lng], {
          renderer: canvasRenderer,
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

      const radius = radiusFor(fire.category, fire.frp);
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

// Initialisation au chargement du module
initUI();