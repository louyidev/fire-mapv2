import { map, commercialAircraftLayer, fireAircraftLayer } from "./map.js";
import { AIRLINES } from "./aircraft-data.js";

const ADSB_URL_SO =
  "https://square-frog-f706.louyidev.workers.dev/adsb?zone=sud-ouest";
const ADSB_URL_FRANCE =
  "https://square-frog-f706.louyidev.workers.dev/adsb?zone=france";

const AIRCRAFT_ANGLE_OFFSET = 180; // Offset d'orientation SVG
const MIN_FETCH_INTERVAL = 4000; // Minimum 4s entre 2 requêtes API
const MAX_TRAIL_POINTS = 80; // Nombre maximal de points conservés par appareil ciblé
const STORAGE_KEY = "aircraft_history_v2"; // Clé mise à jour pour réinitialiser le stockage lourd

const aircraftMarkers = new Map();
const aircraftPositions = new Map(); // Stocke la dernière position cible
const aircraftAnimations = new Map();

// État des filtres d'affichage (Incendie coché par défaut)
export let showFireAircraft = true;
export let showCommercialAircraft = false;

// Hex de l'avion actuellement sélectionné pour l'affichage de la trace
let selectedAircraftHex = null;

// Historique des coordonnées : Map<hex, Array<[lon, lat]>>
const aircraftTrails = new Map(loadHistoryFromStorage());

let aircraftLoading = false;
let lastFetchTime = 0;
let rateLimitedUntil = 0;

// ------------------------------------------------------
// 0. Base de données fixe & Référentiels d'aéronefs
// ------------------------------------------------------

const KNOWN_HEX_AIRCRAFT = {
  "3e9555": {
    manufacturer: "Airbus Helicopters / NHIndustries",
    model: "NH90 TTH",
    type: "NH90",
    airline: "German Air Force (Luftwaffe)",
    isHelicopter: true,
  },
  "009343": {
    manufacturer: "Aérospatiale / Airbus Helicopters",
    model: "SA 330 Puma / Super Puma",
    type: "PUMA",
    airline: "Armée de l'Air et de l'Espace / ALAT",
    isHelicopter: true,
  },
};

const AIRCRAFT_TYPES = {
  A320: { manufacturer: "Airbus", model: "A320" },
  A319: { manufacturer: "Airbus", model: "A319" },
  A321: { manufacturer: "Airbus", model: "A321" },
  A330: { manufacturer: "Airbus", model: "A330" },
  A350: { manufacturer: "Airbus", model: "A350" },
  AS50: { manufacturer: "Airbus Helicopters / Eurocopter", model: "AS350 Écureuil / H125" },
  B738: { manufacturer: "Boeing", model: "737-800" },
  B737: { manufacturer: "Boeing", model: "737" },
  B744: { manufacturer: "Boeing", model: "747" },
  B77W: { manufacturer: "Boeing", model: "777-300ER" },
  B789: { manufacturer: "Boeing", model: "787-9 Dreamliner" },
  CRJ9: { manufacturer: "Bombardier", model: "CRJ-900" },
  CRJ7: { manufacturer: "Bombardier", model: "CRJ-700" },
  DH8D: { manufacturer: "De Havilland Canada", model: "Dash 8 Q400" },
  CL35: { manufacturer: "Bombardier", model: "Challenger 350" },
  CL2T: { manufacturer: "Canadair", model: "CL-215 / CL-415" },
  CL41: { manufacturer: "Canadair", model: "CL-415" },
  AT75: { manufacturer: "Air Tractor", model: "AT-802" },
  A400: { manufacturer: "Airbus", model: "A400M Atlas" },
  C130: { manufacturer: "Lockheed Martin", model: "C-130 Hercules" },
  NH90: { manufacturer: "NHIndustries", model: "NH90" },
  CH53: { manufacturer: "Sikorsky", model: "CH-53 Sea Stallion" },
  EC45: { manufacturer: "Airbus Helicopters", model: "H145 / EC145" },
  EC35: { manufacturer: "Airbus Helicopters", model: "H135 / EC135" },
  PUMA: {
    manufacturer: "Aérospatiale / Airbus Helicopters",
    model: "SA 330 Puma",
  },
  BE20: { manufacturer: "Beechcraft", model: "Super King Air 200" },
  BE30: { manufacturer: "Beechcraft", model: "Super King Air 300" },
};

// 1. Appareils dédiés à la lutte incendie (Canadair, Dash bombardier d'eau, Air Tractor)
const FIRE_AIRCRAFT_RULES = {
  types: ["CL2T", "CL41", "CL2P", "BE20", "BE30"],
  typePrefixes: ["AT8", "AT6", "AT70"],
  typeIncludes: ["DH8D"],
  callsignPrefixes: ["MILAN", "BUE", "PELICAN", "BENGA"],
};

// 2. Secours, SAMU et Sécurité Civile (Dragon, hélicoptères de secours)
const RESCUE_RULES = {
  callsignPrefixes: ["DRAGON", "SAMU", "CHOPPER", "HELISMUR"],
  callsignIncludes: ["DRAGON", "SAMU", "SMUR"],
};

// 3. Règles hélicoptères génériques (si non spécifié secours ou armée)
const HELICOPTER_RULES = {
  types: [
    "AS50",
    "AS35",
    "EC35",
    "EC45",
    "EC55",
    "H145",
    "H135",
    "H125",
    "AS32",
    "AS33",
    "AS53",
    "PUMA",
    "NH90",
    "CH53",
    "H60",
    "UH1",
    "A109",
    "AW139",
    "B06",
    "B412",
  ],
  typeIncludes: [
    "PUMA",
    "AS3",
    "EC45",
    "H145",
    "NH90",
    "CH53",
  ],
  adsbCategories: ["A7"],
};

// 4. Armée & Forces de l'ordre
const MILITARY_RULES = {
  typeIncludes: [
    "A400",
    "C130",
    "C30J",
    "C160",
    "M346",
    "C17",
    "A332",
    "NH90",
    "CH53",
    "PUMA",
    "E3TF",
    "E70",
  ],
  callsignPrefixes: [
    "CTM",
    "FAF",
    "COTAM",
    "GAF",
    "GAM",
    "IAM",
    "BAF",
    "AME",
    "VALOR",
    "FORTE",
    "PUMA",
    "LX",
    "LXN",
    "LXA",
    "FMY", // Gendarmerie / ALAT
  ],
};

// ------------------------------------------------------
// 1. Gestion dynamique de la visibilité des filtres
// ------------------------------------------------------

export function toggleFireAircraft(visible) {
  showFireAircraft = visible;
  fireAircraftLayer.forEach((marker) => {
    marker.getElement().style.display = visible ? "block" : "none";
  });
  updateTrailLayers();
}

export function toggleCommercialAircraft(visible) {
  showCommercialAircraft = visible;
  commercialAircraftLayer.forEach((marker) => {
    marker.getElement().style.display = visible ? "block" : "none";
  });
  updateTrailLayers();
}

// ------------------------------------------------------
// 2. Lissage des virages & Tracés MapLibre
// ------------------------------------------------------

function smoothCoordinates(coords, iterations = 3, ratio = 0.85) {
  if (coords.length < 3) return coords;

  let points = [...coords];
  const complementaryRatio = 1 - ratio;

  for (let i = 0; i < iterations; i++) {
    const smoothed = [];
    smoothed.push(points[0]);

    for (let j = 0; j < points.length - 1; j++) {
      const p0 = points[j];
      const p1 = points[j + 1];

      const q = [
        ratio * p0[0] + complementaryRatio * p1[0],
        ratio * p0[1] + complementaryRatio * p1[1],
      ];
      const r = [
        complementaryRatio * p0[0] + ratio * p1[0],
        complementaryRatio * p0[1] + ratio * p1[1],
      ];

      smoothed.push(q);
      smoothed.push(r);
    }

    smoothed.push(points[points.length - 1]);
    points = smoothed;
  }

  return points;
}

function loadHistoryFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Impossible de charger l'historique ADS-B :", e);
    return [];
  }
}

function saveHistoryToStorage() {
  try {
    const data = Array.from(aircraftTrails.entries());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Erreur de sauvegarde dans localStorage :", e);
  }
}

function initTrailLayer() {
  if (!map.getSource("aircraft-trails")) {
    map.addSource("aircraft-trails", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });

    map.addLayer({
      id: "aircraft-trails-layer",
      type: "line",
      source: "aircraft-trails",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#ff3838",
        "line-width": 3,
        "line-opacity": 0.85,
        "line-dasharray": [2, 1],
      },
    });
  }
}

if (map.isStyleLoaded()) {
  initTrailLayer();
} else {
  map.on("load", initTrailLayer);
}

function updateTrailLayers() {
  const source = map.getSource("aircraft-trails");
  if (!source) return;

  const features = [];

  if (selectedAircraftHex && aircraftTrails.has(selectedAircraftHex)) {
    const markerData = aircraftMarkers.get(selectedAircraftHex);
    if (markerData && markerData.element.style.display !== "none") {
      const coords = aircraftTrails.get(selectedAircraftHex);
      if (coords.length > 1) {
        const smoothedCoords = smoothCoordinates(coords, 2);

        features.push({
          type: "Feature",
          properties: { hex: selectedAircraftHex },
          geometry: {
            type: "LineString",
            coordinates: smoothedCoords,
          },
        });
      }
    }
  }

  source.setData({
    type: "FeatureCollection",
    features,
  });
}

function recordPosition(aircraft) {
  const isTarget =
    aircraft.category === "🚒 Feu" ||
    aircraft.category === "🚑 SAMU / Secours" ||
    aircraft.category === "🪖 Militaire" ||
    aircraft.category === "🚁 Hélicoptère";

  if (!isTarget) return;

  const hex = aircraft.hex;
  let trail = aircraftTrails.get(hex) || [];
  const lastPoint = trail[trail.length - 1];

  if (!lastPoint || lastPoint[0] !== aircraft.lon || lastPoint[1] !== aircraft.lat) {
    trail.push([aircraft.lon, aircraft.lat]);

    if (trail.length > MAX_TRAIL_POINTS) {
      trail.shift();
    }

    aircraftTrails.set(hex, trail);
    saveHistoryToStorage();
    updateTrailLayers();
  }
}

// ------------------------------------------------------
// 3. Fonctions Utilitaires & Classification
// ------------------------------------------------------

function lerpAngle(startAngle, endAngle, progress) {
  let diff = (endAngle - startAngle) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return startAngle + diff * progress;
}

function isFireAircraft(aircraft) {
  const cat = aircraft?.category;
  return (
    cat === "🚒 Feu" ||
    cat === "🚑 SAMU / Secours" ||
    cat === "🪖 Militaire" ||
    cat === "🚁 Hélicoptère"
  );
}

function classifyAircraft(type, callsign, rawCategory, hex) {
  const t = (type ?? "").toUpperCase();
  const c = (callsign ?? "").toUpperCase();
  const known = KNOWN_HEX_AIRCRAFT[hex?.toLowerCase()];

  // 1. Lutte Incendie (Canadair, Dash, Milan, Pelican)
  if (
    FIRE_AIRCRAFT_RULES.types?.includes(t) ||
    FIRE_AIRCRAFT_RULES.typePrefixes?.some((p) => t.startsWith(p)) ||
    FIRE_AIRCRAFT_RULES.typeIncludes?.some((inc) => t.includes(inc)) ||
    FIRE_AIRCRAFT_RULES.callsignPrefixes?.some((p) => c.startsWith(p))
  ) {
    return "🚒 Feu";
  }

  // 2. SAMU / Sécurité Civile (Dragon, SAMU, etc.)
  if (
    RESCUE_RULES.callsignPrefixes?.some((p) => c.startsWith(p)) ||
    RESCUE_RULES.callsignIncludes?.some((inc) => c.includes(inc))
  ) {
    return "🚑 SAMU / Secours";
  }

  // 3. Militaire & Forces de l'ordre
  if (
    MILITARY_RULES.typeIncludes?.some((inc) => t.includes(inc)) ||
    MILITARY_RULES.callsignPrefixes?.some((p) => c.startsWith(p)) ||
    c.startsWith("LX")
  ) {
    return "🪖 Militaire";
  }

  // 4. Hélicoptères génériques (sans indicatif militaire ou secours spécifique)
  if (
    known?.isHelicopter ||
    rawCategory === "A7" ||
    (t && HELICOPTER_RULES.types?.includes(t)) ||
    HELICOPTER_RULES.typeIncludes?.some((inc) => t.includes(inc))
  ) {
    return "🚁 Hélicoptère";
  }

  // 5. Commercial
  if (
    t.startsWith("A3") ||
    t.startsWith("B7") ||
    t.startsWith("B8") ||
    t.startsWith("CL") ||
    t.startsWith("CRJ")
  ) {
    return "✈️ Commercial";
  }

  return "Autre";
}

function createAircraftElement(aircraft) {
  const t = (aircraft?.type ?? "").toUpperCase();
  const c = (aircraft?.callsign ?? "").toUpperCase();
  const category = aircraft?.category ?? "";

  let iconPath = "./assets/commercial.svg";

  // Attribution précise des icônes selon la classification
  if (t === "CL2T" || t === "CL41" || t === "CL2P") {
    iconPath = "./assets/canadair.svg";
  } else if (t.includes("DH8D") || c.startsWith("MILAN")) {
    iconPath = "./assets/dash.svg";
  } else if (
    t.startsWith("AT8") ||
    t.startsWith("AT6") ||
    t.startsWith("AT7")
  ) {
    iconPath = "./assets/airtractor.svg";
  } else if (category === "🚑 SAMU / Secours") {
    iconPath = "./assets/rescue.svg";
  } else if (category === "🪖 Militaire") {
    iconPath = "./assets/military.svg";
  } else if (category === "🚁 Hélicoptère") {
    iconPath = "./assets/helicopter.svg";
  }

  const el = document.createElement("div");
  el.className = "aircraft-marker";
  el.style.cursor = "pointer";
  el.innerHTML = `<img src="${iconPath}" class="plane" style="width: 28px; height: 28px;" />`;
  return el;
}

function projectPosition(lat, lon, speedKnots, trackDeg, seconds) {
  const speed = speedKnots ?? 200;
  const distanceKm = (speed * 1.852 * seconds) / 3600;
  const rad = ((trackDeg ?? 0) * Math.PI) / 180;

  const dLat = (distanceKm * Math.cos(rad)) / 111;
  const dLon =
    (distanceKm * Math.sin(rad)) / (111 * Math.cos((lat * Math.PI) / 180));

  return {
    lat: lat + dLat,
    lon: lon + dLon,
  };
}

function getAircraftInfo(type, hex, callsign) {
  const known = KNOWN_HEX_AIRCRAFT[hex?.toLowerCase()];
  if (known) {
    return {
      manufacturer: known.manufacturer,
      model: known.model,
      typeFallback: known.type,
    };
  }

  const c = (callsign ?? "").toUpperCase();
  if (c.startsWith("PUMA")) {
    return {
      manufacturer: "Aérospatiale / Airbus Helicopters",
      model: "SA 330 Puma / Super Puma",
      typeFallback: "PUMA",
    };
  }

  if (!type) {
    return { manufacturer: "Inconnu", model: "Inconnu", typeFallback: "?" };
  }

  const info = AIRCRAFT_TYPES[type.toUpperCase()];
  return info ?? { manufacturer: "Inconnu", model: type, typeFallback: type };
}

function getAirline(callsign, registration) {
  if (callsign) {
    const prefix3 = callsign.substring(0, 3).toUpperCase();
    const prefix2 = callsign.substring(0, 2).toUpperCase();

    if (AIRLINES[prefix3]) return AIRLINES[prefix3];

    if (callsign.toUpperCase().startsWith("DRAGON")) {
      return "Sécurité Civile";
    }

    if (
      callsign.toUpperCase().startsWith("SAMU") ||
      callsign.toUpperCase().includes("SMUR")
    ) {
      return "SAMU / Urgence Médicale";
    }

    if (
      MILITARY_RULES.callsignPrefixes.some((p) =>
        callsign.toUpperCase().startsWith(p),
      ) ||
      callsign.toUpperCase().startsWith("PUMA")
    ) {
      if (prefix2 === "LX") return "OTAN / Forces Armées";
      return "Armée de l'Air et de l'Espace / ALAT";
    }
  }

  if (registration) {
    if (registration.startsWith("LX-") || registration.startsWith("LX"))
      return "Luxembourg / OTAN";
    if (registration.startsWith("G-"))
      return "Royaume-Uni (compagnie inconnue)";
    if (registration.startsWith("F-")) return "France (compagnie inconnue)";
    if (registration.startsWith("D-")) return "Allemagne (compagnie inconnue)";
  }

  return "Inconnue";
}

// ------------------------------------------------------
// 4. Chargement & Parsing
// ------------------------------------------------------

export async function loadAircrafts() {
  const now = Date.now();

  if (
    aircraftLoading ||
    now < rateLimitedUntil ||
    now - lastFetchTime < MIN_FETCH_INTERVAL
  ) {
    return;
  }

  aircraftLoading = true;
  lastFetchTime = now;

  try {
    const response = await fetch(ADSB_URL_FRANCE, { cache: "no-cache" });

    if (response.status === 429) {
      console.warn("ADS-B Rate limit (429) atteint.");
      rateLimitedUntil = Date.now() + 10000;
      return;
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const aircrafts = parseAircrafts(data);

    renderAircrafts(aircrafts);
  } catch (error) {
    console.error("Erreur ADS-B :", error);
  } finally {
    aircraftLoading = false;
  }
}

function parseAircrafts(data) {
  return (data.ac ?? [])
    .map((aircraft) => {
      const hex = (aircraft.hex ?? "").toLowerCase();
      const callsign = aircraft.flight?.trim();
      const known = KNOWN_HEX_AIRCRAFT[hex];

      const typeIcao = aircraft.t || known?.type || null;
      const registration =
        aircraft.r || (callsign?.startsWith("LX") ? callsign : null);

      const info = getAircraftInfo(typeIcao, hex, callsign);

      return {
        hex: aircraft.hex,
        callsign,
        airline: known?.airline || getAirline(callsign, registration),
        registration: registration ?? "?",
        type: typeIcao ?? info.typeFallback ?? "?",
        manufacturer: info.manufacturer,
        model: info.model,
        category: classifyAircraft(
          typeIcao,
          callsign,
          aircraft.category,
          aircraft.hex,
        ),
        lat: aircraft.lat,
        lon: aircraft.lon,
        altitude: aircraft.alt_baro,
        speed: aircraft.gs,
        track: aircraft.track ?? 0,
        raw: aircraft,
      };
    })
    .filter(
      (aircraft) =>
        Number.isFinite(aircraft.lat) && Number.isFinite(aircraft.lon),
    );
}

// ------------------------------------------------------
// 5. Rendu & Animations
// ------------------------------------------------------

function renderAircrafts(aircrafts) {
  const now = Date.now();
  const ANIMATION_DURATION = 5200;
  const AIRCRAFT_TTL = 30000; // ⏱️ Conserver l'avion 30 secondes avant de le supprimer s'il disparaît des radars

  aircrafts.forEach((aircraft) => {
    const hex = aircraft.hex;

    recordPosition(aircraft);

    let markerData = aircraftMarkers.get(hex);
    const isFire = isFireAircraft(aircraft);
    const targetMap = isFire ? fireAircraftLayer : commercialAircraftLayer;
    const isVisible = isFire ? showFireAircraft : showCommercialAircraft;

    if (!markerData) {
      const el = createAircraftElement(aircraft);
      el.style.display = isVisible ? "block" : "none";

      const popup = new maplibregl.Popup({
        offset: 25,
        maxWidth: "320px",
      }).setHTML(createPopup(aircraft));

      popup.on("close", () => {
        if (selectedAircraftHex === hex) {
          selectedAircraftHex = null;
          updateTrailLayers();
        }
      });

      el.addEventListener("click", () => {
        selectedAircraftHex = hex;
        updateTrailLayers();
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([aircraft.lon, aircraft.lat])
        .setPopup(popup)
        .addTo(map);

      markerData = {
        hex,
        marker,
        element: el,
        currentTrack: aircraft.track,
        lastSeen: now, // Enregistrement de l'heure de dernière détection
      };

      aircraftMarkers.set(hex, markerData);
      targetMap.set(hex, marker);

      const targetPos = projectPosition(
        aircraft.lat,
        aircraft.lon,
        aircraft.speed,
        aircraft.track,
        5
      );

      aircraftPositions.set(hex, { lat: aircraft.lat, lon: aircraft.lon });

      animateAircraft(
        hex,
        markerData,
        aircraft.lat,
        aircraft.lon,
        targetPos.lat,
        targetPos.lon,
        aircraft.track,
        aircraft.track,
        ANIMATION_DURATION
      );
    } else {
      // Mise à jour de l'horodatage
      markerData.lastSeen = now;

      markerData.element.style.display = isVisible ? "block" : "none";

      const currentLngLat = markerData.marker.getLngLat();
      const fromLat = currentLngLat.lat;
      const fromLon = currentLngLat.lng;

      const currentTrack = markerData.currentTrack ?? aircraft.track;

      let toLat = aircraft.lat;
      let toLon = aircraft.lon;

      const lastPos = aircraftPositions.get(hex);
      if (
        lastPos &&
        lastPos.lat === aircraft.lat &&
        lastPos.lon === aircraft.lon
      ) {
        const projected = projectPosition(
          fromLat,
          fromLon,
          aircraft.speed,
          aircraft.track,
          5
        );
        toLat = projected.lat;
        toLon = projected.lon;
      }

      aircraftPositions.set(hex, { lat: aircraft.lat, lon: aircraft.lon });

      animateAircraft(
        hex,
        markerData,
        fromLat,
        fromLon,
        toLat,
        toLon,
        currentTrack,
        aircraft.track,
        ANIMATION_DURATION
      );

      markerData.marker.getPopup().setHTML(createPopup(aircraft));
    }

    markerData.currentTrack = aircraft.track;
  });

  // Nettoyage : suppression si l'avion n'a pas été vu depuis plus de AIRCRAFT_TTL (30s)
  aircraftMarkers.forEach((markerData, hex) => {
    if (now - markerData.lastSeen > AIRCRAFT_TTL) {
      markerData.marker.remove();
      commercialAircraftLayer.delete(hex);
      fireAircraftLayer.delete(hex);
      aircraftMarkers.delete(hex);
      aircraftPositions.delete(hex);

      if (selectedAircraftHex === hex) {
        selectedAircraftHex = null;
      }

      const anim = aircraftAnimations.get(hex);
      if (anim) {
        cancelAnimationFrame(anim);
        aircraftAnimations.delete(hex);
      }
    }
  });

  updateTrailLayers();
}

function rotateAircraft(el, angle) {
  if (!el) return;
  const plane = el.querySelector(".plane");
  if (!plane) return;

  const correctedAngle = (angle + AIRCRAFT_ANGLE_OFFSET) % 360;
  plane.style.transform = `rotate(${correctedAngle}deg)`;
}

function animateAircraft(
  hex,
  markerData,
  fromLat,
  fromLon,
  toLat,
  toLon,
  fromTrack,
  toTrack,
  duration = 5200,
) {
  const previousAnimation = aircraftAnimations.get(hex);
  if (previousAnimation) {
    cancelAnimationFrame(previousAnimation);
  }

  const startTime = performance.now();

  function move(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const currentLat = fromLat + (toLat - fromLat) * progress;
    const currentLon = fromLon + (toLon - fromLon) * progress;
    const currentTrack = lerpAngle(fromTrack, toTrack, progress);

    markerData.marker.setLngLat([currentLon, currentLat]);
    rotateAircraft(markerData.element, currentTrack);

    if (progress < 1) {
      const animation = requestAnimationFrame(move);
      aircraftAnimations.set(hex, animation);
    } else {
      aircraftAnimations.delete(hex);
    }
  }

  const animation = requestAnimationFrame(move);
  aircraftAnimations.set(hex, animation);
}

function createPopup(aircraft) {
  const speedKmh =
    aircraft.speed != null ? Math.round(aircraft.speed * 1.852) : "?";

  const altitudeM =
    aircraft.altitude != null ? Math.round(aircraft.altitude * 0.3048) : "?";

  return `
    <div class="aircraft-popup">

      <div class="aircraft-popup-header">
        <span class="aircraft-title">
          ${aircraft.callsign || "Inconnu"}
        </span>

        <span class="aircraft-tag">
          ${aircraft.category || "Autre"}
        </span>
      </div>

      <div class="aircraft-popup-body">

        <div class="aircraft-info-grid">

          <span class="aircraft-label">Compagnie</span>
          <span class="aircraft-value company-label">
            ${aircraft.airline || "Inconnue"}
          </span>

          <span class="aircraft-label">Constructeur</span>
          <span class="aircraft-value">
            ${aircraft.manufacturer || "Inconnu"}
          </span>

          <span class="aircraft-label">Modèle</span>
          <span class="aircraft-value">
            ${aircraft.model || "Inconnu"}
          </span>

          <span class="aircraft-label">Type ICAO</span>
          <span class="aircraft-value">
            ${aircraft.type || "?"}
          </span>

          <span class="aircraft-label">Immatriculation</span>
          <span class="aircraft-value">
            ${aircraft.registration || "?"}
          </span>

        </div>

        <div class="aircraft-telemetry">

          <div class="telemetry-item">
            <span class="telemetry-label">Altitude</span>
            <span class="telemetry-value">${altitudeM} m</span>
          </div>

          <div class="telemetry-item">
            <span class="telemetry-label">Vitesse</span>
            <span class="telemetry-value">${speedKmh} km/h</span>
          </div>

          <div class="telemetry-item">
            <span class="telemetry-label">Cap</span>
            <span class="telemetry-value">${aircraft.track ?? "?"}°</span>
          </div>

        </div>

      </div>

    </div>
  `;
}