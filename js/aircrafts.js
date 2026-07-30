import { fireAircraftLayer, commercialAircraftLayer } from "./map.js";

const ADSB_URL = "https://square-frog-f706.louyidev.workers.dev/adsb";

function isFireAircraft(aircraft) {
  const t = (aircraft?.type ?? "").toUpperCase();
  const c = (aircraft?.callsign ?? "").toUpperCase();
  const category = aircraft?.category ?? "";

  return (
    category === "🚒 Feu" ||
    t.startsWith("CL") ||
    t.includes("DH8D") ||
    t.startsWith("AT8") ||
    t.startsWith("AT6") ||
    t.startsWith("AT7") ||
    c.startsWith("MILAN")
  );
}

function createAircraftIcon(aircraft) {
  const t = (aircraft?.type ?? "").toUpperCase();
  const c = (aircraft?.callsign ?? "").toUpperCase();
  const category = aircraft?.category ?? "";

  let iconPath = "/assets/commercial.svg";

  // 1. Canadair (CL-215, CL-415, etc.)
  if (t.startsWith("CL")) {
    iconPath = "/assets/canadair.svg";
  }
  // 2. Dash 8 (DH8D / Q400 bombardier d'eau ou transport)
  else if (t.includes("DH8D") || c.startsWith("MILAN")) {
    iconPath = "/assets/dash.svg";
  }
  // 3. Air Tractor (AT802, AT602, AT75, etc.)
  else if (t.startsWith("AT8") || t.startsWith("AT6") || t.startsWith("AT7")) {
    iconPath = "/assets/airtractor.svg";
  }
  // 4. Hélicoptères (basé sur la catégorie ou le type ICAO/callsign)
  else if (
    category === "🚁 Hélicoptère" ||
    t.includes("PUMA") ||
    t.includes("AS32") ||
    t.includes("AS33") ||
    t.includes("AS53") ||
    t.includes("EC45") ||
    t.includes("H145")
  ) {
    iconPath = "/assets/helicopter.svg";
  }
  // 5. Avions militaires (A400M, C-130 Hercules, Transall, Chasseurs, etc.)
  else if (
    category === "🪖 Militaire" ||
    t.includes("A400") ||
    t.includes("C130") ||
    t.includes("C30J") ||
    t.includes("C160") ||
    t.includes("M346") ||
    t.includes("C17") ||
    c.startsWith("CTM") ||
    c.startsWith("FAF") ||
    c.startsWith("COTAM")
  ) {
    iconPath = "/assets/military.svg";
  }

  return L.divIcon({
    className: "aircraft-icon",
    html: `<div class="plane"><img src="${iconPath}" width="28" height="28" alt="aircraft" /></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const aircraftMarkers = new Map();
let aircraftLoading = false;

const aircraftPositions = new Map();
const aircraftAnimations = new Map();
const MOVE_DURATION = 15000; // durée du déplacement en ms

export async function loadAircrafts() {
  if (aircraftLoading) {
    console.warn("ADS-B déjà en cours de chargement");
    return;
  }

  aircraftLoading = true;

  try {
    const response = await fetch(ADSB_URL, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const aircrafts = parseAircrafts(data);

    console.log(`✈️ ${aircrafts.length} avions`);

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
      const callsign = aircraft.flight?.trim();

      return {
        hex: aircraft.hex,
        callsign,
        airline: getAirline(callsign, aircraft.r),
        registration: aircraft.r,
        type: aircraft.t,
        ...getAircraftInfo(aircraft.t),
        category: classifyAircraft(aircraft.t, callsign),
        lat: aircraft.lat,
        lon: aircraft.lon,
        altitude: aircraft.alt_baro,
        speed: aircraft.gs,
        track: aircraft.track,
      };
    })
    .filter(
      (aircraft) =>
        Number.isFinite(aircraft.lat) && Number.isFinite(aircraft.lon),
    );
}

function renderAircrafts(aircrafts) {
  const visibleIds = new Set();

  aircrafts.forEach((aircraft) => {
    visibleIds.add(aircraft.hex);

    let marker = aircraftMarkers.get(aircraft.hex);

    // Sélection dynamique du calque : Pompier vs Commercial / Autre
    const targetLayer = isFireAircraft(aircraft)
      ? fireAircraftLayer
      : commercialAircraftLayer;

    if (!marker) {
      const startPosition = calculatePreviousPosition(aircraft);

      marker = L.marker([startPosition.lat, startPosition.lon], {
        icon: createAircraftIcon(aircraft),
      });

      marker.bindPopup("", {
        maxWidth: 240,
        minWidth: 220,
      });

      marker.addTo(targetLayer);
      aircraftMarkers.set(aircraft.hex, marker);

      animateAircraft(
        marker,
        startPosition.lat,
        startPosition.lon,
        aircraft.lat,
        aircraft.lon,
        aircraft.track ?? 0,
      );
    } else {
      const previousPosition = aircraftPositions.get(aircraft.hex);

      if (previousPosition) {
        animateAircraft(
          marker,
          previousPosition.lat,
          previousPosition.lon,
          aircraft.lat,
          aircraft.lon,
          aircraft.track ?? 0,
        );
      }

      aircraftPositions.set(aircraft.hex, {
        lat: aircraft.lat,
        lon: aircraft.lon,
      });
    }

    marker.setPopupContent(createPopup(aircraft));
    rotateAircraft(marker, aircraft.track ?? 0);

    aircraftPositions.set(aircraft.hex, {
      lat: aircraft.lat,
      lon: aircraft.lon,
    });
  });

  // Nettoyage des avions disparus du radar
  aircraftMarkers.forEach((marker, id) => {
    if (!visibleIds.has(id)) {
      fireAircraftLayer.removeLayer(marker);
      commercialAircraftLayer.removeLayer(marker);
      aircraftMarkers.delete(id);
    }
  });
}

function createPopup(aircraft) {
  // Conversion : 1 nœud (kt) = 1.852 km/h
  const speedKmh =
    aircraft.speed != null ? Math.round(aircraft.speed * 1.852) : "?";
  const altitudeFt =
    aircraft.altitude != null ? Math.round(aircraft.altitude) : "?";

  return `
    <div class="aircraft-popup-header">
      <span class="aircraft-title">${aircraft.callsign || "Inconnu"}</span>
      <span class="aircraft-tag">${aircraft.category || "Autre"}</span>
    </div>

    <div class="aircraft-popup-body">
      <div class="aircraft-info-grid">
        <span class="aircraft-label">Compagnie</span>
        <span class="aircraft-value compagny-label">${aircraft.airline || "Inconnue"}</span>
        
        <span class="aircraft-label">Constructeur</span>
        <span class="aircraft-value">${aircraft.manufacturer || "Inconnu"}</span>

        <span class="aircraft-label">Modèle</span>
        <span class="aircraft-value">${aircraft.model || "Inconnu"}</span>

        <span class="aircraft-label">Type ICAO</span>
        <span class="aircraft-value">${aircraft.type || "?"}</span>

        <span class="aircraft-label">Immatriculation</span>
        <span class="aircraft-value">${aircraft.registration || "?"}</span>
      </div>

      <div class="aircraft-telemetry">
        <div class="telemetry-item">
          <span class="telemetry-label">ALT</span>
          <span class="telemetry-value">${altitudeFt} ft</span>
        </div>
        <div class="telemetry-item">
          <span class="telemetry-label">VIT</span>
          <span class="telemetry-value">${speedKmh} km/h</span>
        </div>
        <div class="telemetry-item">
          <span class="telemetry-label">CAP</span>
          <span class="telemetry-value">${aircraft.track ?? "?"}°</span>
        </div>
      </div>
    </div>
  `;
}

function rotateAircraft(marker, angle) {
  const element = marker.getElement();
  if (!element) return;

  const plane = element.querySelector(".plane");
  if (!plane) return;

  // Rotation ajustée : 180° pour réaligner le SVG + (-10°) de décalage = + 170°
  plane.style.transform = `rotate(${angle + 170}deg)`;
}

function animateAircraft(marker, fromLat, fromLon, toLat, toLon, track) {
  const id = marker._leaflet_id;
  const previousAnimation = aircraftAnimations.get(id);

  if (previousAnimation) {
    cancelAnimationFrame(previousAnimation);
  }

  const startTime = performance.now();

  function move(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / MOVE_DURATION, 1);
    const eased = progress;

    marker.setLatLng([
      fromLat + (toLat - fromLat) * eased,
      fromLon + (toLon - fromLon) * eased,
    ]);

    rotateAircraft(marker, track);

    if (progress < 1) {
      const animation = requestAnimationFrame(move);
      aircraftAnimations.set(id, animation);
    }
  }

  const animation = requestAnimationFrame(move);
  aircraftAnimations.set(id, animation);
}

function classifyAircraft(type, callsign) {
  if (!type && !callsign) {
    return "Inconnu";
  }

  const t = (type ?? "").toUpperCase();
  const c = (callsign ?? "").toUpperCase();

  if (c.startsWith("MILAN") || t.includes("DH8D")) {
    return "🚒 Feu";
  }

  if (
    t.includes("PUMA") ||
    c.includes("PUMA") ||
    t.includes("AS32") ||
    t.includes("AS33") ||
    t.includes("AS53") ||
    t.includes("EC45") ||
    t.includes("H145")
  ) {
    return "🚁 Hélicoptère";
  }

  if (t.includes("CL") || t.includes("AT8") || t.includes("AT6")) {
    return "🚒 Feu";
  }

  if (t.includes("A400") || t.includes("C130")) {
    return "🪖 Militaire";
  }

  if (t.startsWith("A3") || t.startsWith("B7") || t.startsWith("B8")) {
    return "✈️ Commercial";
  }

  return "Autre";
}

function detectFireAircraft(aircraft) {
  const speed = aircraft.speed ?? 0;
  const altitude = aircraft.altitude ?? 0;

  return speed > 60 && speed < 180 && altitude < 5000;
}

function aircraftIconFor(category) {
  switch (category) {
    case "🚒 Feu":
      return "🚒";
    case "🪖 Militaire":
      return "🪖";
    case "✈️ Commercial":
      return "✈️";
    default:
      return "•";
  }
}

function getAirline(callsign, registration) {
  if (callsign) {
    const prefix = callsign.substring(0, 3).toUpperCase();
    if (AIRLINES[prefix]) {
      return AIRLINES[prefix];
    }
  }

  if (registration) {
    if (registration.startsWith("G-"))
      return "Royaume-Uni (compagnie inconnue)";
    if (registration.startsWith("F-")) return "France (compagnie inconnue)";
    if (registration.startsWith("D-")) return "Allemagne (compagnie inconnue)";
  }

  return "Inconnue";
}

function calculatePreviousPosition(aircraft) {
  const distance = ((aircraft.speed ?? 200) / 3600) * 5;
  const angle = ((aircraft.track ?? 0) * Math.PI) / 180;

  return {
    lat: aircraft.lat - (Math.cos(angle) * distance) / 111,
    lon: aircraft.lon - (Math.sin(angle) * distance) / 111,
  };
}

function getAircraftInfo(type) {
  if (!type) {
    return {
      manufacturer: "Inconnu",
      model: "Inconnu",
      category: "Autre",
    };
  }

  const aircrafts = {
    A320: { manufacturer: "Airbus", model: "A320" },
    A319: { manufacturer: "Airbus", model: "A319" },
    A321: { manufacturer: "Airbus", model: "A321" },
    A330: { manufacturer: "Airbus", model: "A330" },
    A350: { manufacturer: "Airbus", model: "A350" },
    B738: { manufacturer: "Boeing", model: "737-800" },
    B737: { manufacturer: "Boeing", model: "737" },
    B744: { manufacturer: "Boeing", model: "747" },
    B77W: { manufacturer: "Boeing", model: "777-300ER" },
    B789: { manufacturer: "Boeing", model: "787-9 Dreamliner" },
    CRJ9: { manufacturer: "Bombardier", model: "CRJ-900" },
    CRJ7: { manufacturer: "Bombardier", model: "CRJ-700" },
    DH8D: { manufacturer: "De Havilland Canada", model: "Dash 8 Q400" },
    CL35: { manufacturer: "Canadair", model: "CL-415" },
    AT75: { manufacturer: "Air Tractor", model: "AT-802" },
    A400: { manufacturer: "Airbus", model: "A400M Atlas" },
    C130: { manufacturer: "Lockheed Martin", model: "C-130 Hercules" },
  };

  const info = aircrafts[type.toUpperCase()];
  if (info) return info;

  return {
    manufacturer: "Inconnu",
    model: type,
  };
}

const AIRLINES = {
  AFR: "Air France",
  HOP: "Air France Hop",
  TVF: "Transavia France",
  FBU: "French Bee",
  CRL: "Corsair",
  CCM: "Air Corsica",
  FPO: "ASL Airlines France",
  DJT: "Air Djibouti",
  AIB: "Airbus Transport International",
  BGA: "Airbus Beluga Transport",
  CMA: "CMA CGM Air Cargo",
  BAW: "British Airways",
  EZY: "easyJet",
  EJU: "easyJet Europe",
  EXS: "Jet2",
  RUK: "Ryanair UK",
  RYR: "Ryanair",
  EIN: "Aer Lingus",
  LOG: "Loganair",
  BEE: "Flybe",
  IBE: "Iberia",
  VLG: "Vueling",
  VOE: "Volotea",
  ANE: "Air Nostrum",
  LAV: "Level",
  DLH: "Lufthansa",
  BER: "Eurowings",
  GWI: "Eurowings",
  CFG: "Condor",
  TUI: "TUI fly Germany",
  KLM: "KLM",
  BEL: "Brussels Airlines",
  SWR: "Swiss International Air Lines",
  AUA: "Austrian Airlines",
  HVN: "Transavia",
  TFL: "TUI fly Netherlands",
  AZA: "ITA Airways",
  ISS: "Air Italy",
  NEOS: "Neos",
  TAP: "TAP Air Portugal",
  PGA: "Portugalia Airlines",
  SAS: "Scandinavian Airlines",
  NAX: "Norwegian",
  NSZ: "Norwegian Sweden",
  WIF: "Widerøe",
  FLI: "Flyr",
  LOT: "LOT Polish Airlines",
  WZZ: "Wizz Air",
  TVS: "Smartwings",
  CSA: "Czech Airlines",
  AEE: "Aegean Airlines",
  TAR: "TAROM",
  THY: "Turkish Airlines",
  PGT: "Pegasus Airlines",
  FHY: "Freebird Airlines",
  UAE: "Emirates",
  QTR: "Qatar Airways",
  ETD: "Etihad Airways",
  SVA: "Saudia",
  MEA: "Middle East Airlines",
  RJA: "Royal Jordanian",
  OMA: "Oman Air",
  UAL: "United Airlines",
  AAL: "American Airlines",
  DAL: "Delta Air Lines",
  ACA: "Air Canada",
  SWA: "Southwest Airlines",
  JBU: "JetBlue",
  ASA: "Alaska Airlines",
  SIA: "Singapore Airlines",
  CPA: "Cathay Pacific",
  ANA: "All Nippon Airways",
  JAL: "Japan Airlines",
  KAL: "Korean Air",
  CCA: "Air China",
  CES: "China Eastern",
  CSN: "China Southern",
  THA: "Thai Airways",
  EVA: "EVA Air",
  RAM: "Royal Air Maroc",
  DAH: "Air Algérie",
  ETH: "Ethiopian Airlines",
  SAA: "South African Airways",
  MSR: "EgyptAir",
  UPS: "UPS Airlines",
  FDX: "FedEx",
  GTI: "Atlas Air",
  ABX: "ABX Air",
  CLX: "Cargolux",
  BOX: "European Air Transport",
  BCS: "European Air Transport",
};