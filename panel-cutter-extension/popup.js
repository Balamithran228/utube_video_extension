const MESSAGE_TYPES = {
  GET_MODE: "PANEL_CUTTER_GET_MODE",
  SET_MODE: "PANEL_CUTTER_SET_MODE"
};

const MODES = ["off", "cutter", "box", "section"];

const modeText = document.getElementById("modeText");
const modeButtons = Array.from(document.querySelectorAll(".mode-btn"));

let currentMode = "off";

document.addEventListener("DOMContentLoaded", refreshMode);

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

async function refreshMode() {
  const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_MODE });
  currentMode = MODES.includes(response?.mode) ? response.mode : "off";
  renderMode();
}

async function setMode(nextMode) {
  if (!MODES.includes(nextMode)) {
    return;
  }

  setButtonsDisabled(true);

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.SET_MODE,
      mode: nextMode
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unable to update mode.");
    }

    currentMode = MODES.includes(response.mode) ? response.mode : "off";
    renderMode();
  } catch (error) {
    modeText.textContent = error.message;
  } finally {
    setButtonsDisabled(false);
  }
}

function renderMode() {
  modeText.textContent = describeMode(currentMode);
  modeButtons.forEach((button) => {
    button.dataset.active = String(button.dataset.mode === currentMode);
  });
}

function describeMode(mode) {
  switch (mode) {
    case "cutter":
      return "Cutter mode: right-click pairs of horizontal cut lines.";
    case "box":
      return "Box mode: right-click and drag to mark rectangles.";
    case "section":
      return "Section mode: right-click to bookmark the visible viewport.";
    default:
      return "All modes are off.";
  }
}

function setButtonsDisabled(disabled) {
  modeButtons.forEach((button) => {
    button.disabled = disabled;
  });
}
