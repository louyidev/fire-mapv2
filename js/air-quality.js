import { map, mapReady } from "./map.js";

const WORKER_AQ_URL = "https://square-frog-f706.louyidev.workers.dev/air-quality";

function getAqiColor(aqi) {
  if (aqi <= 20) return "#00e400";  // Vert
  if (aqi <= 40) return "#ffff00";  // Jaune
  if (aqi <= 60) return "#ff7e00";  // Orange
  if (aqi <= 80) return "#ff0000";  // Rouge
  return "#8f3f97";                 // Violet
}

// Fonction utilitaire pour créer un polygone circulaire approximé (zone) à partir d'un point central et d'un rayon (en km)
function createPolygonCircle(centerLon, centerLat, radiusInKm = 5, points = 32) {
  const coords = [];
  const kmPerDegreeLat = 111;
  const kmPerDegreeLon = 111 * Math.cos(centerLat * (Math.PI / 180));

  for (let i = 0; i < points; i++) {
    const theta = (i * 2 * Math.PI) / points;
    const dx = radiusInKm * Math.cos(theta);
    const dy = radiusInKm * Math.sin(theta);

    const lon = centerLon + dx / kmPerDegreeLon;
    const lat = centerLat + dy / kmPerDegreeLat;
    coords.push([lon, lat]);
  }
  // Fermer le polygone
  coords.push(coords[0]);
  return [coords];
}

export async function fetchAndDisplayAirQuality(lat = 44.56, lon = -0.52) {
  try {
    const response = await fetch(`${WORKER_AQ_URL}?lat=${lat}&lon=${lon}`);
    if (!response.ok) throw new Error("Erreur réseau qualité de l'air");

    const data = await response.json();
    const current = data.current;
    if (!current) return null;

    const aqi = current.european_aqi ?? 0;
    const color = getAqiColor(aqi);

    // Création d'une surface (Polygone de ~8 km de rayon autour du point d'incendie/zone)
    const polygonCoordinates = createPolygonCircle(lon, lat, 8);

    const geojsonFeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: polygonCoordinates
          },
          properties: {
            aqi: aqi,
            pm25: current.pm2_5 ?? "N/A",
            pm10: current.pm10 ?? "N/A",
            no2: current.nitrogen_dioxide ?? "N/A",
            color: color
          }
        }
      ]
    };

    await mapReady;
    const source = map.getSource("air-quality-zones");
    if (source) {
      source.setData(geojsonFeatureCollection);
    }

    // Gestion du clic sur la zone colorée pour afficher les détails
    if (!map.hasListenerClickAirZone) {
      map.on("click", "air-quality-fill", (e) => {
        const props = e.features[0].properties;
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family: sans-serif; color: #333;">
              <strong>Zone d'impact - Qualité de l'air</strong><br>
              Indice AQI : <b>${props.aqi}</b><br>
              PM2.5 : ${props.pm25} µg/m³<br>
              PM10 : ${props.pm10} µg/m³<br>
              NO2 : ${props.no2} µg/m³
            </div>
          `)
          .addTo(map);
      });
      map.hasListenerClickAirZone = true;

      map.on("mouseenter", "air-quality-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "air-quality-fill", () => {
        map.getCanvas().style.cursor = "";
      });
    }

    return current;
  } catch (error) {
    console.error("Erreur chargement zone qualité de l'air :", error);
    return null;
  }
}