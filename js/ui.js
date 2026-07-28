let hideTimer = null;

const terminal = document.getElementById("terminal-log");

export function termLog(message) {
  if (!terminal) {
    return;
  }

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
        }),
      );
    });
  }
}

initUI();

export function updateLastFireUpdate(label) {
  const banner = document.getElementById("last-update-banner");
  const text = document.getElementById("last-update-text");

  if (!banner || !text) {
    return;
  }

  text.textContent = label;
  banner.style.display = "flex";
}

export function updateLastUpdate(date) {
  const banner = document.getElementById("last-update-banner");
  const text = document.getElementById("last-update-text");

  if (!banner || !text) {
    return;
  }

  text.textContent = date;

  banner.style.display = "flex";
}