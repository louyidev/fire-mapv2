import { map, mapReady } from "./map.js";

const WEATHER_PROXY = "https://square-frog-f706.louyidev.workers.dev/weather";

const WIND_GRID = {
  minLat: 41.0,
  maxLat: 51.5,
  minLng: -5.5,
  maxLng: 9.5,
  step: 0.8,
};

let windDataPoints = [];
let windGridMap = new Map();
let currentHourIndex = 0;
let playInterval = null;
let clickPopup = null;

let canvasOverlay = null;
let ctxOverlay = null;
let animationFrameId = null;
let particles = [];
let lastFrameTime = 0;
let pixelRatio = 1;
const PARTICLE_COUNT = 1700;
const MAX_PARTICLE_AGE = 3.2;
const WIND_PIXELS_PER_SECOND_PER_MS = 5;
const WIND_FADE = 0.9;

function makeGridKey(lat, lng) {
  const roundLat = (Math.round(lat / WIND_GRID.step) * WIND_GRID.step).toFixed(2);
  const roundLng = (Math.round(lng / WIND_GRID.step) * WIND_GRID.step).toFixed(2);
  return `${roundLat},${roundLng}`;
}

// ------------------------------------------------------
// Chargement des vents & Météo
// ------------------------------------------------------

export async function loadWind() {
  console.log("🌬️ Chargement du champ de vent et météo...");

  try {
    await mapReady;
    const points = generateWindGrid();

    const batchSize = 80;
    const fetchPromises = [];

    const params = "hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,weather_code";

    for (let i = 0; i < points.length; i += batchSize) {
      const chunk = points.slice(i, i + batchSize);
      const lats = chunk.map((p) => p.lat).join(",");
      const lngs = chunk.map((p) => p.lng).join(",");

      fetchPromises.push(
        fetch(`${WEATHER_PROXY}?lats=${lats}&lngs=${lngs}&${params}`).then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
      );
    }

    const responses = await Promise.all(fetchPromises);
    const rawData = responses.flat(2);

    windDataPoints = rawData.map((data) => ({
      lat: Number(data.latitude?.toFixed(2) ?? data.lat),
      lng: Number(data.longitude?.toFixed(2) ?? data.lng),
      hourly: data.hourly,
    }));

    buildGridIndex();

    console.log(
      `🌬️ Données météo reçues et indexées pour ${windDataPoints.length} points`
    );

    setupParticleCanvas();
    setupWindSlider();
    setupMapClick();

    const initialIndex = findCurrentHourIndex();
    updateWindTime(initialIndex);
  } catch (error) {
    console.error("❌ Erreur chargement vent :", error);
  }
}

function buildGridIndex() {
  windGridMap.clear();
  windDataPoints.forEach((pt) => {
    const key = makeGridKey(pt.lat, pt.lng);
    windGridMap.set(key, pt);
  });
}

// ------------------------------------------------------
// Reverse Geocoding (Ville la plus proche)
// ------------------------------------------------------

async function getCityName(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    return (
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      null
    );
  } catch (err) {
    return null;
  }
}

// ------------------------------------------------------
// Canvas & Particules
// ------------------------------------------------------

function setupParticleCanvas() {
  if (canvasOverlay) return;

  const container = map.getCanvasContainer();
  canvasOverlay = document.createElement("canvas");
  canvasOverlay.id = "wind-particle-canvas";
  canvasOverlay.style.position = "absolute";
  canvasOverlay.style.top = "0";
  canvasOverlay.style.left = "0";
  canvasOverlay.style.width = "100%";
  canvasOverlay.style.height = "100%";
  canvasOverlay.style.pointerEvents = "none";
  canvasOverlay.style.zIndex = "2";

  container.appendChild(canvasOverlay);
  ctxOverlay = canvasOverlay.getContext("2d");

  resizeCanvas();

  window.addEventListener("resize", resizeCanvas);
  map.on("resize", resizeCanvas);
  map.on("move", resetParticles);
  map.on("zoom", resetParticles);

  initParticles();
  startAnimation();
}

function resizeCanvas() {
  if (!canvasOverlay) return;
  const rect = map.getCanvas().getBoundingClientRect();
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvasOverlay.width = Math.round(rect.width * pixelRatio);
  canvasOverlay.height = Math.round(rect.height * pixelRatio);
  ctxOverlay.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctxOverlay.clearRect(0, 0, rect.width, rect.height);
  lastFrameTime = 0;
}

function initParticles() {
  particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(generateRandomParticle());
  }
}

function generateRandomParticle() {
  const { width, height } = map.getCanvas().getBoundingClientRect();

  return {
    x: Math.random() * width,
    y: Math.random() * height,
    age: Math.random() * MAX_PARTICLE_AGE,
  };
}

function resetParticles() {
  initParticles();
  if (ctxOverlay && canvasOverlay) {
    const { width, height } = map.getCanvas().getBoundingClientRect();
    ctxOverlay.clearRect(0, 0, width, height);
  }
}

// ------------------------------------------------------
// Interpolation & Vecteurs
// ------------------------------------------------------

function getGridPointData(lat, lng) {
  const key = makeGridKey(lat, lng);
  return windGridMap.get(key);
}

function getUVAtPoint(pt) {
  if (!pt || !pt.hourly) return null;

  const speedKmH = Number(pt.hourly.wind_speed_10m?.[currentHourIndex] ?? 0);
  const dirDeg = Number(pt.hourly.wind_direction_10m?.[currentHourIndex] ?? 0);

  const rad = (dirDeg * Math.PI) / 180;
  const u = -speedKmH * Math.sin(rad);
  const v = -speedKmH * Math.cos(rad);

  return { u, v, speed: speedKmH };
}

function getInterpolatedWindAt(lng, lat) {
  const step = WIND_GRID.step;

  const lat0 = Number(
    (Math.floor((lat - WIND_GRID.minLat) / step) * step + WIND_GRID.minLat).toFixed(2)
  );
  const lat1 = Number((lat0 + step).toFixed(2));
  const lng0 = Number(
    (Math.floor((lng - WIND_GRID.minLng) / step) * step + WIND_GRID.minLng).toFixed(2)
  );
  const lng1 = Number((lng0 + step).toFixed(2));

  const v00 = getUVAtPoint(getGridPointData(lat0, lng0));
  const v10 = getUVAtPoint(getGridPointData(lat1, lng0));
  const v01 = getUVAtPoint(getGridPointData(lat0, lng1));
  const v11 = getUVAtPoint(getGridPointData(lat1, lng1));

  if (!v00 || !v10 || !v01 || !v11) {
    return v00 || v10 || v01 || v11 || getUVAtPoint(getGridPointData(lat, lng));
  }

  const x = (lng - lng0) / step;
  const y = (lat - lat0) / step;

  const u =
    v00.u * (1 - x) * (1 - y) +
    v01.u * x * (1 - y) +
    v10.u * (1 - x) * y +
    v11.u * x * y;

  const v =
    v00.v * (1 - x) * (1 - y) +
    v01.v * x * (1 - y) +
    v10.v * (1 - x) * y +
    v11.v * x * y;

  const speed = Math.hypot(u, v);

  return { u, v, speed };
}

// ------------------------------------------------------
// Rendu d'Animation Canvas
// ------------------------------------------------------

function startAnimation() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  function frame(now) {
    const elapsed = lastFrameTime ? Math.min(now - lastFrameTime, 50) : 16.67;
    lastFrameTime = now;
    drawFrame(elapsed / 16.67);
    animationFrameId = requestAnimationFrame(frame);
  }

  frame();
}

function drawFrame(frameScale) {
  if (!ctxOverlay || !canvasOverlay) return;

  const { width, height } = map.getCanvas().getBoundingClientRect();
  ctxOverlay.fillStyle = `rgba(0, 0, 0, ${WIND_FADE})`;
  ctxOverlay.globalCompositeOperation = "destination-in";
  ctxOverlay.fillRect(0, 0, width, height);
  ctxOverlay.globalCompositeOperation = "source-over";

  ctxOverlay.lineCap = "round";

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    if (p.age >= MAX_PARTICLE_AGE) {
      particles[i] = generateRandomParticle();
      continue;
    }

    const position = map.unproject([p.x, p.y]);
    const vector = getInterpolatedWindAt(position.lng, position.lat);
    if (!vector || vector.speed === 0) {
      particles[i] = generateRandomParticle();
      continue;
    }

    const seconds = frameScale / 60;
    const endX = p.x + (vector.u / 3.6) * WIND_PIXELS_PER_SECOND_PER_MS * seconds;
    const endY = p.y - (vector.v / 3.6) * WIND_PIXELS_PER_SECOND_PER_MS * seconds;
    p.age += seconds;

    if (endX < 0 || endX > width || endY < 0 || endY > height) {
      particles[i] = generateRandomParticle();
      continue;
    }

    const startX = p.x;
    const startY = p.y;
    p.x = endX;
    p.y = endY;

    const speedMs = vector.speed / 3.6;
    ctxOverlay.strokeStyle = getWindColor(speedMs);
    ctxOverlay.lineWidth = speedMs < 5 ? 1 : speedMs < 10 ? 1.2 : 1.5;

    ctxOverlay.beginPath();
    ctxOverlay.moveTo(startX, startY);
    ctxOverlay.lineTo(p.x, p.y);
    ctxOverlay.stroke();
  }
}

function getWindColor(speedMs) {
  if (speedMs < 5) return "rgba(191, 227, 255, 0.55)";
  if (speedMs < 10) return "rgba(224, 241, 255, 0.70)";
  return "rgba(255, 255, 255, 0.88)";
}

// ------------------------------------------------------
// Helpers Météo
// ------------------------------------------------------

function getWeatherDescription(code) {
  if (code === undefined || code === null) return null;
  const numericCode = Number(code);
  if (numericCode === 0) return { label: "Ensoleillé", icon: "☀️" };
  if (numericCode >= 1 && numericCode <= 3) return { label: "Nuageux", icon: "⛅" };
  if (numericCode >= 45 && numericCode <= 48) return { label: "Brouillard", icon: "🌫️" };
  if (numericCode >= 51 && numericCode <= 67) return { label: "Pluie", icon: "🌧️" };
  if (numericCode >= 71 && numericCode <= 77) return { label: "Neige", icon: "❄️" };
  if (numericCode >= 80 && numericCode <= 82) return { label: "Averses", icon: "🌦️" };
  if (numericCode >= 95) return { label: "Orage", icon: "🌩️" };
  return { label: "Météo", icon: "🌡️" };
}

function getWeatherIcon(code) {
  const desc = getWeatherDescription(code);
  return desc ? desc.icon : "💨";
}

function extractTemp(hourlyObj, index) {
  if (!hourlyObj) return null;

  const directValue = hourlyObj.temperature_2m?.[index] ?? hourlyObj.temperature?.[index] ?? hourlyObj.temp?.[index];
  if (directValue !== undefined && directValue !== null) {
    return Number(directValue);
  }

  const tempKey = Object.keys(hourlyObj).find(k => k.toLowerCase().includes("temp"));
  if (tempKey && hourlyObj[tempKey]?.[index] !== undefined && hourlyObj[tempKey]?.[index] !== null) {
    return Number(hourlyObj[tempKey][index]);
  }

  return null;
}

function getDayMinMaxTemp(hourlyObj, currentIndex) {
  if (!hourlyObj || !hourlyObj.time || !hourlyObj.time[currentIndex]) return null;

  const targetDateStr = new Date(hourlyObj.time[currentIndex]).toDateString();
  const dayTemps = [];

  hourlyObj.time.forEach((timeStr, idx) => {
    if (new Date(timeStr).toDateString() === targetDateStr) {
      const temp = extractTemp(hourlyObj, idx);
      if (temp !== null) dayTemps.push(temp);
    }
  });

  if (dayTemps.length === 0) return null;

  return {
    min: Math.round(Math.min(...dayTemps)),
    max: Math.round(Math.max(...dayTemps)),
  };
}

function get7DayForecast(hourlyObj, currentIndex) {
  if (!hourlyObj || !hourlyObj.time) return [];

  const daysMap = new Map();
  const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  for (let i = currentIndex; i < hourlyObj.time.length; i++) {
    const dateObj = new Date(hourlyObj.time[i]);
    const dateKey = dateObj.toDateString();

    if (!daysMap.has(dateKey)) {
      if (daysMap.size >= 7) break;
      daysMap.set(dateKey, {
        dayLabel: dayNames[dateObj.getDay()],
        temps: [],
        codes: [],
      });
    }

    const dayData = daysMap.get(dateKey);
    const temp = extractTemp(hourlyObj, i);
    if (temp !== null) dayData.temps.push(temp);

    const code = hourlyObj.weather_code?.[i] ?? hourlyObj.weathercode?.[i];
    if (code !== undefined && code !== null) dayData.codes.push(code);
  }

  const result = [];
  daysMap.forEach((data) => {
    if (data.temps.length > 0) {
      const mainCode = data.codes.length > 0 ? Math.max(...data.codes) : 0;
      result.push({
        dayLabel: data.dayLabel,
        min: Math.round(Math.min(...data.temps)),
        max: Math.round(Math.max(...data.temps)),
        icon: getWeatherIcon(mainCode),
      });
    }
  });

  return result;
}

function getArrowIcon(dirDeg, speedKmH = 0) {
  const rotation = (dirDeg + 180) % 360;

  // Couleur dynamique selon l'intensité du vent (km/h)
  let color = "#38bdf8"; // Vent léger (bleu ciel)
  if (speedKmH >= 45) {
    color = "#f43f5e"; // Vent très fort / tempête (rouge rose)
  } else if (speedKmH >= 25) {
    color = "#fbbf24"; // Vent modéré (ambre/orange)
  }

  return `
    <span style="display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; transform: rotate(${rotation}deg); vertical-align: middle;">
      <svg viewBox="0 0 24 24" width="16" height="16" style="filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.6));">
        <path 
          d="M12 2L4.5 20.29C4.21 21 4.96 21.7 5.63 21.37L12 18.25L18.37 21.37C19.04 21.7 19.79 21 19.5 20.29L12 2Z" 
          fill="${color}" 
          stroke="rgba(0,0,0,0.3)" 
          stroke-width="1"
        />
      </svg>
    </span>
  `;
}

// ------------------------------------------------------
// UI & Clic Carte
// ------------------------------------------------------

function setupMapClick() {
  map.on("click", async (e) => {
    const targetEl = e.originalEvent?.target;
    if (targetEl) {
      const isAircraftDOM = targetEl.closest(".aircraft-marker, .mapboxgl-marker, .maplibregl-marker");
      if (isAircraftDOM) {
        if (clickPopup) {
          clickPopup.remove();
          clickPopup = null;
        }
        return;
      }
    }

    const features = map.queryRenderedFeatures(e.point);
    const hitOtherEntity = features.some((f) => {
      const layerId = (f.layer.id || "").toLowerCase();
      return (
        layerId.includes("fire") ||
        layerId.includes("incendie") ||
        layerId.includes("aircraft") ||
        layerId.includes("avion")
      );
    });

    if (hitOtherEntity) {
      if (clickPopup) {
        clickPopup.remove();
        clickPopup = null;
      }
      return;
    }

    if (clickPopup && clickPopup.isOpen()) {
      clickPopup.remove();
      clickPopup = null;
      return;
    }

    if (!windDataPoints || windDataPoints.length === 0) return;

    const clickedLat = e.lngLat.lat;
    const clickedLng = e.lngLat.lng;

    let closestPoint = null;
    let minDistance = Infinity;

    windDataPoints.forEach((point) => {
      const dist = Math.hypot(point.lat - clickedLat, point.lng - clickedLng);
      if (dist < minDistance) {
        minDistance = dist;
        closestPoint = point;
      }
    });

    if (!closestPoint || !closestPoint.hourly) return;

    const hourly = closestPoint.hourly;

    let idx = currentHourIndex;
    if (idx < 0 || !hourly.time || idx >= hourly.time.length) {
      idx = findCurrentHourIndex();
    }

    const speedKmH = Math.round(Number(hourly.wind_speed_10m?.[idx] ?? hourly.windspeed_10m?.[idx] ?? 0));
    const dirDeg = Math.round(Number(hourly.wind_direction_10m?.[idx] ?? hourly.winddirection_10m?.[idx] ?? 0));
    const gustRaw = hourly.wind_gusts_10m?.[idx] ?? hourly.windgusts_10m?.[idx];
    const gustKmH = gustRaw !== undefined && gustRaw !== null ? Math.round(Number(gustRaw)) : null;

    const directions = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    const cardinalDir = directions[Math.round(dirDeg / 45) % 8];
    const windArrow = getArrowIcon(dirDeg, speedKmH);

    const tempVal = extractTemp(hourly, idx);
    const tempDisplay = tempVal !== null ? `${Math.round(tempVal)}°C` : null;
    const dayMinMax = getDayMinMaxTemp(hourly, idx);

    const weatherCode = hourly.weather_code?.[idx] ?? hourly.weathercode?.[idx];
    const weatherDesc = getWeatherDescription(weatherCode);

    let tagHTML = "";
    if (weatherDesc) {
      tagHTML = `<span class="wind-tag" style="background: rgba(255, 255, 255, 0.2); padding: 2px 6px; border-radius: 4px; font-size: 0.85em; text-align: center">${weatherDesc.icon} ${weatherDesc.label}</span>`;
    } else if (tempDisplay) {
      tagHTML = `<span class="wind-tag" style="background: rgba(255, 255, 255, 0.2); padding: 2px 6px; border-radius: 4px; font-size: 0.85em; text-align: center">🌡️ ${tempDisplay}</span>`;
    } else {
      tagHTML = `<span class="wind-tag" style="background: rgba(255, 255, 255, 0.2); padding: 2px 6px; border-radius: 4px; font-size: 0.85em; text-align: center">💨 Vent</span>`;
    }

    let forecastHTML = "";
    if (hourly.time) {
      const forecastItems = [];
      // Pas de 4 heures : +4h, +8h, +12h, +16h
      for (let i = 4; i <= 16; i += 4) {
        const nextIdx = idx + i;
        if (nextIdx < hourly.time.length) {
          const hour = new Date(hourly.time[nextIdx]).getHours();
          
          const nextTempVal = extractTemp(hourly, nextIdx);
          const nextTemp = nextTempVal !== null ? `${Math.round(nextTempVal)}°C` : "--";
          
          const nextIcon = getWeatherIcon(hourly.weather_code?.[nextIdx] ?? hourly.weathercode?.[nextIdx]);
          
          const nextSpeed = Math.round(Number(hourly.wind_speed_10m?.[nextIdx] ?? hourly.windspeed_10m?.[nextIdx] ?? 0));
          const nextDirDeg = Math.round(Number(hourly.wind_direction_10m?.[nextIdx] ?? hourly.winddirection_10m?.[nextIdx] ?? 0));
          const nextCardinal = directions[Math.round(nextDirDeg / 45) % 8];
          const nextArrow = getArrowIcon(nextDirDeg, nextSpeed);

          forecastItems.push(`
            <div style="text-align: center; font-size: 0.8em; flex: 1; padding: 4px 2px; background: rgba(255,255,255,0.05); border-radius: 6px;">
              <div style="opacity: 0.7; font-size: 0.85em;">${hour}h</div>
              <div style="margin: 2px 0; font-size: 1.1em;">${nextIcon}</div>
              <div style="font-weight: bold; color: #ffffff;">${nextTemp}</div>
              <div style="font-size: 0.75em; color: #cbd5e1; margin-top: 2px; display: flex; align-items: center; justify-content: center; gap: 2px;">
                ${nextArrow} ${nextSpeed} <span style="font-size: 0.85em; opacity: 0.8;">${nextCardinal}</span>
              </div>
            </div>
          `);
        }
      }

      if (forecastItems.length > 0) {
        forecastHTML = `
          <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.15);">
            <div style="font-size: 0.7em; opacity: 0.7; color: #cbd5e1; margin-bottom: 6px; text-transform: uppercase; font-weight: 600;">PRÉVISIONS (PAS DE 4H)</div>
            <div style="display: flex; justify-content: space-between; gap: 4px;">
              ${forecastItems.join("")}
            </div>
          </div>
        `;
      }
    }

    let forecast7DaysHTML = "";
    const dailyForecast = get7DayForecast(hourly, idx);
    if (dailyForecast.length > 0) {
      const dayItems = dailyForecast.map(
        (day) => `
        <div style="text-align: center; font-size: 0.75em; flex: 1; padding: 4px 2px; background: rgba(255,255,255,0.03); border-radius: 6px;">
          <div style="opacity: 0.8; font-size: 0.85em; font-weight: 600;">${day.dayLabel}</div>
          <div style="margin: 2px 0; font-size: 1em;">${day.icon}</div>
          <div style="font-size: 0.75em;">
            <span style="color: #60a5fa;">${day.min}°</span> <span style="color: #f87171;">${day.max}°</span>
          </div>
        </div>
      `
      );

      forecast7DaysHTML = `
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.15);">
          <div style="font-size: 0.7em; opacity: 0.7; color: #cbd5e1; margin-bottom: 6px; text-transform: uppercase; font-weight: 600;">PRÉVISIONS (7 JOURS)</div>
          <div style="display: flex; justify-content: space-between; gap: 4px;">
            ${dayItems.join("")}
          </div>
        </div>
      `;
    }

    const popupContent = (cityName) => `
      <div class="wind-popup-container" style="font-family: system-ui, -apple-system, sans-serif; background: #1e293b; color: #ffffff; padding: 10px; border-radius: 8px;">
        <div class="wind-popup-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span class="wind-title" style="font-weight: bold; color: #ffffff; display: flex; align-items: center; gap: 4px;">
            📍 ${cityName || "Chargement..."}
          </span>
          ${tagHTML}
        </div>
        <div class="wind-popup-body">
          <div class="wind-telemetry" style="display: flex; gap: 12px; margin-bottom: 6px;">
            ${
              tempDisplay
                ? `<div class="telemetry-item">
                    <span class="telemetry-label" style="display: block; font-size: 0.75em; opacity: 0.7; color: #cbd5e1;">TEMPÉRATURE</span>
                    <span class="telemetry-value" style="font-size: 1.1em; font-weight: bold; color: #ffffff;">${tempDisplay}</span>
                    ${
                      dayMinMax
                        ? `<div style="font-size: 0.75em; color: #cbd5e1; margin-top: 2px;">
                            <span style="color: #60a5fa;">${dayMinMax.min}°</span> / <span style="color: #f87171;">${dayMinMax.max}°</span>
                          </div>`
                        : ""
                    }
                  </div>`
                : ""
            }
            <div class="telemetry-item">
              <span class="telemetry-label" style="display: block; font-size: 0.75em; opacity: 0.7; color: #cbd5e1;">VENT</span>
              <span class="telemetry-value" style="font-size: 1.1em; font-weight: bold; color: #ffffff; display: flex; align-items: center; gap: 4px;">
                ${windArrow} ${speedKmH} km/h (${cardinalDir})
              </span>
            </div>
            ${
              gustKmH !== null
                ? `<div class="telemetry-item">
                    <span class="telemetry-label" style="display: block; font-size: 0.75em; opacity: 0.7; color: #cbd5e1;">RAFALES</span>
                    <span class="telemetry-value" style="font-size: 1.1em; font-weight: bold; color: #f43f5e;">${gustKmH} km/h</span>
                  </div>`
                : ""
            }
          </div>
          ${forecastHTML}
          ${forecast7DaysHTML}
        </div>
      </div>
    `;

    clickPopup = new maplibregl.Popup({
      closeButton: true,
      offset: 10,
      closeOnClick: false,
    })
      .setLngLat([clickedLng, clickedLat])
      .setHTML(popupContent("Recherche..."))
      .addTo(map);

    getCityName(clickedLat, clickedLng).then((city) => {
      if (clickPopup && clickPopup.isOpen()) {
        clickPopup.setHTML(popupContent(city || "Zone isolée"));
      }
    });

    clickPopup.on("close", () => {
      clickPopup = null;
    });
  });
}

function findCurrentHourIndex() {
  const timeList = windDataPoints[0]?.hourly?.time;
  if (!timeList || !Array.isArray(timeList) || timeList.length === 0) return 0;

  const now = new Date();
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

function generateWindGrid() {
  const points = [];
  for (
    let lat = WIND_GRID.minLat;
    lat <= WIND_GRID.maxLat;
    lat += WIND_GRID.step
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
}

function setupWindSlider() {
  const slider = document.getElementById("wind-slider");
  const playBtn = document.getElementById("wind-play-btn");

  if (!slider) return;

  const maxHours = windDataPoints[0]?.hourly?.time?.length ?? 72;
  slider.max = maxHours - 1;

  slider.addEventListener("input", (event) => {
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
      if (nextHour >= maxHours) nextHour = 0;
      updateWindTime(nextHour);
    }, 1200);
  }
}