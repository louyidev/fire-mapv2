import { map, mapReady } from "./map.js";

let hideTimer = null;
const terminal = document.getElementById("terminal-log");

const MAP_VIEWS = {
  gironde: { center: [-0.52, 44.56], zoom: 9 },
  france: { center: [2.21, 46.23], zoom: 5.4 },
};

export function termLog(message) {
  if (!terminal) return;

  clearTimeout(hideTimer);
  terminal.style.display = "block";

  const line = document.createElement("div");
  line.textContent = message;
  terminal.appendChild(line);

  terminal.scrollTop = terminal.scrollHeight;

  hideTimer = setTimeout(() => {
    terminal.style.display = "none";
  }, 5000);
}

export function initUI() {
  const reload = document.getElementById("btn-reload");
  if (reload) {
    reload.addEventListener("click", () => {
      location.reload();
    });
  }

  const slider = document.getElementById("time-slider");
  if (slider) {
    slider.addEventListener("input", (event) => {
      const index = Number(event.target.value);
      window.dispatchEvent(
        new CustomEvent("fire-time-change", {
          detail: index,
        })
      );
    });
  }

  document.querySelectorAll('input[name="map-view"]').forEach((radio) => {
    radio.addEventListener("change", async (event) => {
      if (!event.target.checked) return;

      const view = MAP_VIEWS[event.target.value];
      if (!view) return;

      await mapReady;
      map.flyTo({
        ...view,
        duration: 900,
        essential: true,
      });
    });
  });
}

initUI();

export function updateLastFireUpdate(label) {
  const banner = document.getElementById("last-update-banner");
  const text = document.getElementById("last-update-text");

  if (!banner || !text) return;

  text.textContent = label;
  banner.style.display = "flex";
}

export function updateLastUpdate(date) {
  const banner = document.getElementById("last-update-banner");
  const text = document.getElementById("last-update-text");

  if (!banner || !text) return;

  text.textContent = date;
  banner.style.display = "flex";
}

export function updateStatus(message) {
  const status = document.getElementById("status");
  if (!status) return;

  status.textContent = message;
}
