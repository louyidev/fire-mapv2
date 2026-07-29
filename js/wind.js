import { map } from "./map.js";

const WEATHER_PROXY = "https://square-frog-f706.louyidev.workers.dev/weather";

const WIND_GRID = {
  minLat: 41.0,
  maxLat: 51.0,
  minLng: -5.0,
  maxLng: 9.0,
  step: 1.0,
};

let windDataPoints = [];
let currentHourIndex = 0;
let velocityLayer = null;
let playInterval = null; // ⏯️ Contrôle de l'animation automatique

// ------------------------------------------------------
// Chargement des vents
// ------------------------------------------------------

export async function loadWind() {
  console.log("🌬️ Chargement du vent pour TOUTE la France...");

  try {
    const points = generateWindGrid();

    const lats = points.map((p) => p.lat).join(",");
    const lngs = points.map((p) => p.lng).join(",");

    const response = await fetch(`${WEATHER_PROXY}?lats=${lats}&lngs=${lngs}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const results = await response.json();
    const rawData = Array.isArray(results) ? results : [results];

    windDataPoints = rawData.map((data) => ({
      lat: Number(data.latitude.toFixed(2)),
      lng: Number(data.longitude.toFixed(2)),
      hourly: data.hourly,
    }));

    console.log(`🌬️ Données météo reçues pour ${windDataPoints.length} points`);

    setupWindSlider();

    // ⚡ Trouve l'index correspondant à l'heure actuelle
    const initialIndex = findCurrentHourIndex();
    updateWindTime(initialIndex);
  } catch (error) {
    console.error("Erreur chargement vent", error);
  }
}

// ------------------------------------------------------
// Recherche de l'heure actuelle
// ------------------------------------------------------

function findCurrentHourIndex() {
  const timeList = windDataPoints[0]?.hourly?.time;
  if (!timeList || timeList.length === 0) return 0;

  const now = new Date();

  // Cherche le créneau le plus proche de maintenant
  let closestIndex = 0;
  let smallestDiff = Infinity;

  timeList.forEach((timeStr, index) => {
    const timeDate = new Date(timeStr);
    const diff = Math.abs(now - timeDate);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestIndex = index;
    }
  });

  return closestIndex;
}

// ------------------------------------------------------
// Conversion des données u/v
// ------------------------------------------------------

function convertToVelocityData() {
  const lats = [...new Set(windDataPoints.map((p) => p.lat))].sort(
    (a, b) => b - a,
  );
  const lngs = [...new Set(windDataPoints.map((p) => p.lng))].sort(
    (a, b) => a - b,
  );

  const uComponent = [];
  const vComponent = [];

  lats.forEach((lat) => {
    lngs.forEach((lng) => {
      const point = windDataPoints.find(
        (p) => Math.abs(p.lat - lat) < 0.1 && Math.abs(p.lng - lng) < 0.1,
      );

      if (point && point.hourly) {
        const speedKmH = Number(
          point.hourly.wind_speed_10m?.[currentHourIndex] ?? 0,
        );
        const speedMS = speedKmH / 3.6;
        const dirDeg = Number(
          point.hourly.wind_direction_10m?.[currentHourIndex] ?? 0,
        );

        const rad = (dirDeg * Math.PI) / 180;
        uComponent.push(-speedMS * Math.sin(rad));
        vComponent.push(-speedMS * Math.cos(rad));
      } else {
        uComponent.push(0);
        vComponent.push(0);
      }
    });
  });

  return [
    {
      header: {
        parameterCategory: 2,
        parameterNumber: 2,
        parameterUnit: "m.s-1",
        nx: lngs.length,
        ny: lats.length,
        lo1: lngs[0],
        la1: lats[0],
        lo2: lngs[lngs.length - 1],
        la2: lats[lats.length - 1],
        dx: WIND_GRID.step,
        dy: WIND_GRID.step,
      },
      data: uComponent,
    },
    {
      header: {
        parameterCategory: 2,
        parameterNumber: 3,
        parameterUnit: "m.s-1",
        nx: lngs.length,
        ny: lats.length,
        lo1: lngs[0],
        la1: lats[0],
        lo2: lngs[lngs.length - 1],
        la2: lats[lats.length - 1],
        dx: WIND_GRID.step,
        dy: WIND_GRID.step,
      },
      data: vComponent,
    },
  ];
}

// ------------------------------------------------------
// Rendu Canvas Windy
// ------------------------------------------------------

function drawWindyEffect() {
  const velocityData = convertToVelocityData();

  // 💡 Si la couche existe déjà, on la met à jour avec setData() au lieu de la détruire
  if (velocityLayer) {
    velocityLayer.setData(velocityData);
    return;
  }

  let totalSpeed = 0;
  let count = 0;

  windDataPoints.forEach((point) => {
    if (point.hourly) {
      const speed = Number(
        point.hourly.wind_speed_10m?.[currentHourIndex] ?? 0,
      );
      totalSpeed += speed;
      count++;
    }
  });

  const avgSpeedKmH = count > 0 ? totalSpeed / count : 15;

  const dynamicVelocityScale = Math.min(
    Math.max(avgSpeedKmH * 0.0003, 0.002),
    0.01,
  );

  velocityLayer = L.velocityLayer({
    displayValues: true,
    displayOptions: {
      velocityType: "Vent",
      position: "bottomleft",
      emptyString: "Pas de données de vent",
      angleConvention: "bearingCW",
      speedUnit: "km/h",
    },
    data: velocityData,
    maxVelocity: 20,

    // 🎨 Couleurs renforcées en opacité pour meilleure visibilité
    colorScale: [
      "rgba(231, 255, 243, 0.9)",
      "rgba(229, 255, 212, 0.95)",
      "rgba(255, 235, 0, 0.95)",
      "rgba(255, 140, 0, 0.95)",
      "rgba(255, 30, 0, 1.0)",
      "rgba(180, 0, 255, 1.0)",
    ],

    velocityScale: dynamicVelocityScale,

    // --- 🎯 RÉGLAGES DE VISIBILITÉ ET ÉPAISSEUR ---
    particleAge: 25,
    particleMultiplier: 1 / 800,
    lineWidth: 2.5,
    frameRate: 30,
  });

  velocityLayer.addTo(map);
}

// ------------------------------------------------------
// Slider & Bouton Play/Pause
// ------------------------------------------------------

function generateWindGrid() {
  const points = [];
  for (
    let lat = WIND_GRID.maxLat;
    lat >= WIND_GRID.minLat;
    lat -= WIND_GRID.step
  ) {
    for (
      let lng = WIND_GRID.minLng;
      lng <= WIND_GRID.maxLng;
      lng += WIND_GRID.step
    ) {
      points.push({
        lat: Number(lat.toFixed(2)),
        lng: Number(lng.toFixed(2)),
      });
    }
  }
  return points;
}

function updateWindTime(hourIndex) {
  const slider = document.getElementById("wind-slider");
  const label = document.getElementById("wind-hour-value");

  currentHourIndex = hourIndex;
  if (slider) slider.value = currentHourIndex;

  if (label) {
    const timeISO = windDataPoints[0]?.hourly?.time?.[currentHourIndex];
    if (timeISO) {
      const dateObj = new Date(timeISO);
      const day = String(dateObj.getDate()).padStart(2, "0");
      const month = String(dateObj.getMonth() + 1).padStart(2, "0");
      const year = String(dateObj.getFullYear()).slice(-2);
      const hours = String(dateObj.getHours()).padStart(2, "0");
      const minutes = String(dateObj.getMinutes()).padStart(2, "0");

      label.textContent = `${day}/${month}/${year} ${hours}:${minutes}`;
    } else {
      label.textContent = `+${currentHourIndex}h`;
    }
  }

  drawWindyEffect();
}

function setupWindSlider() {
  const slider = document.getElementById("wind-slider");
  const playBtn = document.getElementById("wind-play-btn");

  if (!slider) return;

  const maxHours = windDataPoints[0]?.hourly?.time?.length ?? 72;
  slider.max = maxHours - 1;

  slider.addEventListener("input", (event) => {
    // Pause l'animation si l'utilisateur déplace la barre manuellement
    if (playInterval) togglePlay();
    updateWindTime(Number(event.target.value));
  });

  if (playBtn) {
    playBtn.addEventListener("click", togglePlay);
  }
}

function togglePlay() {
  const playBtn = document.getElementById("wind-play-btn");
  const maxHours = windDataPoints[0]?.hourly?.time?.length ?? 72;

  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
    if (playBtn) playBtn.textContent = "▶ Play";
  } else {
    if (playBtn) playBtn.textContent = "⏸ Pause";
    playInterval = setInterval(() => {
      let nextHour = currentHourIndex + 1;
      if (nextHour >= maxHours) nextHour = 0; // Boucle au début
      updateWindTime(nextHour);
    }, 1200); // Change d'heure toutes les 1.2 secondes
  }
}
