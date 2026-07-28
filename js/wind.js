import { map, windLayer } from "./map.js";

const WEATHER_PROXY = "https://square-frog-f706.louyidev.workers.dev/weather";

let windPoints = [];

let currentHour = 0;

let sliderControl = null;

export async function loadWind() {
  console.log("🌬️ Chargement vent Météo-France");

  try {
    const points = generateFireGrid();

    const results = await Promise.all(points.map(loadPointWind));

    windPoints = results.filter(Boolean);

    console.log(`🌬️ ${windPoints.length} points vent chargés`);

    createSlider();

    drawWind();

    map.on("zoomend", drawWind);
  } catch (error) {
    console.error("Erreur chargement vent", error);
  }
}

async function loadPointWind(point) {
  try {
    const response = await fetch(
      `${WEATHER_PROXY}?lat=${point.lat}&lng=${point.lng}`,
    );

    if (!response.ok) {
      console.warn("Météo indisponible", point);

      return null;
    }

    const data = await response.json();

    return {
      lat: point.lat,

      lng: point.lng,

      speed: data.speed,

      direction: data.direction,
    };
  } catch (error) {
    console.error("Erreur météo point", error);

    return null;
  }
}

function generateFireGrid() {
  /*
    Grille légère France.
    Avant :
    651 appels Open Meteo ❌

    Maintenant :
    25 points météo ✅
  */

  const points = [];

  for (let lat = 42; lat <= 50; lat += 2) {
    for (let lng = -4; lng <= 8; lng += 2) {
      points.push({
        lat,
        lng,
      });
    }
  }

  return points;
}

function drawWind() {
  windLayer.clearLayers();

  if (map.getZoom() < 5) {
    return;
  }

  windPoints.forEach((point) => {
    if (point.direction === undefined || point.speed === undefined) {
      return;
    }

    const icon = L.divIcon({
      className: "wind-arrow",

      html: `
        <div
          style="
            transform:rotate(${point.direction}deg);
            font-size:24px;
            color:#008cff;
            opacity:.7;
            font-weight:bold;
          "
        >
          ➤
        </div>
        `,

      iconSize: [25, 25],
    });

    L.marker(
      [point.lat, point.lng],

      {
        icon,
        interactive: true,
      },
    )

      .bindPopup(
        `
      🌬️ Vent<br>

      Vitesse :
      ${point.speed} km/h

      <br>

      Direction :
      ${point.direction}°

      `,
      )

      .addTo(windLayer);
  });
}

function createSlider() {
  if (sliderControl) {
    return;
  }

  sliderControl = L.control({
    position: "bottomleft",
  });

  sliderControl.onAdd = function () {
    const div = L.DomUtil.create("div", "wind-slider");

    div.innerHTML = `

    <div style="
      background:white;
      padding:12px;
      border-radius:8px;
      box-shadow:0 0 8px #999;
    ">

    🌬️ Vent temps réel

    </div>

    `;

    L.DomEvent.disableClickPropagation(div);

    return div;
  };

  sliderControl.addTo(map);
}
