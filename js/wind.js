import { map, windLayer } from "./map.js";

const WEATHER_PROXY = "https://square-frog-f706.louyidev.workers.dev/weather";

const WIND_GRID = {
  minLat: 43,
  maxLat: 46,
  minLng: -2,
  maxLng: 2,
  step: 0.5,
};

let windPoints = [];
let windMarkers = [];

export async function loadWind() {
  console.log("🌬️ Chargement du vent");

  try {
    const points = generateWindGrid();

    const results = await Promise.all(points.map(fetchWind));

    windPoints = results.filter(Boolean);

    console.log(`🌬️ ${windPoints.length} vents chargés`);

    drawWind();

    map.on("zoomend", drawWind);
  } catch (error) {
    console.error("Erreur chargement vent", error);
  }
}

async function fetchWind(point) {
  try {
    const response = await fetch(
      `${WEATHER_PROXY}?lat=${point.lat}&lng=${point.lng}`,
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    console.log("Vent reçu", point, data);

    const speed = Number(data.speed ?? data.wind_speed_10m ?? data.windSpeed);

    const direction = Number(
      data.direction ?? data.wind_direction_10m ?? data.windDirection,
    );

    if (!Number.isFinite(speed) || !Number.isFinite(direction)) {
      console.warn("Vent invalide", data);

      return null;
    }

    return {
      lat: point.lat,

      lng: point.lng,

      speed,

      direction,
    };
  } catch (error) {
    console.error("Erreur récupération vent", error);

    return null;
  }
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
        lat,
        lng,
      });
    }
  }

  return points;
}

function drawWind() {
  clearMarkers();

  if (map.getZoom() < 7) {
    return;
  }

  windPoints.forEach((point) => {
    const marker = L.marker(
      [point.lat, point.lng],

      {
        icon: createWindIcon(point),
        interactive: true,
      },
    );

    marker.bindPopup(createWindPopup(point));

    marker.addTo(windLayer);

    windMarkers.push(marker);
  });
}

function createWindPopup(point) {
  return `

    <strong>🌬️ Vent</strong>

    <br><br>

    💨 Vitesse :
    ${point.speed.toFixed(1)}
    km/h


    <br>


    🧭 Direction :
    ${point.direction}°
    

    <br>


    ➡️ Souffle vers :
    ${getDirectionName(point.direction + 180)}

  `;
}

function createWindIcon(point) {
  /*
    Les API météo indiquent
    la provenance du vent.

    Exemple :
    270° = vent venant de l'ouest

    Donc la flèche doit partir
    vers l'est.
  */

  const rotation = point.direction + 180;

  const size = point.speed > 30 ? 32 : point.speed > 15 ? 26 : 22;

  return L.divIcon({
    className: "wind-arrow",

    html: `

      <div
        style="
          transform:
          rotate(${rotation}deg);
          font-size:${size}px;
        "
      >
        ➤
      </div>

    `,

    iconSize: [size, size],

    iconAnchor: [size / 2, size / 2],
  });
}

function getDirectionName(degree) {
  const directions = [
    "Nord",
    "Nord-Est",
    "Est",
    "Sud-Est",
    "Sud",
    "Sud-Ouest",
    "Ouest",
    "Nord-Ouest",
  ];

  const index = Math.round(degree / 45) % 8;

  return directions[index];
}

function clearMarkers() {
  windMarkers.forEach((marker) => {
    windLayer.removeLayer(marker);
  });

  windMarkers = [];
}
