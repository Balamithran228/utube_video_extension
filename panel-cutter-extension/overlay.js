(() => {
  if (window.WebtoonPanelCutterOverlay) {
    return;
  }

  const ROOT_ID = "webtoon-panel-cutter-root";
  const LINE_CLASS = "webtoon-panel-cutter-line";
  const BOX_CLASS = "webtoon-panel-cutter-box";
  const SECTION_CLASS = "webtoon-panel-cutter-section-marker";

  const overlayState = {
    root: null,
    lineLayer: null,
    boxLayer: null,
    sectionLayer: null,
    highlight: null,
    rubberBand: null,
    toggleButton: null,
    endButton: null,
    status: null,
    cutLines: [],
    boxes: [],
    sectionMarkers: [],
    statusTimer: null
  };

  function ensureRoot() {
    if (overlayState.root && document.documentElement.contains(overlayState.root)) {
      return overlayState.root;
    }

    const root = document.createElement("div");
    root.id = ROOT_ID;

    const lineLayer = document.createElement("div");
    lineLayer.className = "webtoon-panel-cutter-line-layer";

    const boxLayer = document.createElement("div");
    boxLayer.className = "webtoon-panel-cutter-box-layer";

    const sectionLayer = document.createElement("div");
    sectionLayer.className = "webtoon-panel-cutter-section-layer";

    const highlight = document.createElement("div");
    highlight.className = "webtoon-panel-cutter-highlight";
    highlight.hidden = true;

    const rubberBand = document.createElement("div");
    rubberBand.className = "webtoon-panel-cutter-rubberband";
    rubberBand.hidden = true;

    const status = document.createElement("div");
    status.className = "webtoon-panel-cutter-status";
    status.hidden = true;

    root.append(lineLayer, boxLayer, sectionLayer, highlight, rubberBand, status);
    document.documentElement.appendChild(root);

    overlayState.root = root;
    overlayState.lineLayer = lineLayer;
    overlayState.boxLayer = boxLayer;
    overlayState.sectionLayer = sectionLayer;
    overlayState.highlight = highlight;
    overlayState.rubberBand = rubberBand;
    overlayState.status = status;
    return root;
  }

  function mountFloatingToggle(onClick) {
    ensureRoot();

    if (overlayState.toggleButton && document.documentElement.contains(overlayState.toggleButton)) {
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "webtoon-panel-cutter-toggle";
    button.textContent = "Enable Cutter Mode";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });

    overlayState.root.appendChild(button);
    overlayState.toggleButton = button;
  }

  function mountEndButton(onClick) {
    ensureRoot();

    if (overlayState.endButton && document.documentElement.contains(overlayState.endButton)) {
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "webtoon-panel-cutter-end";
    button.textContent = "End & Save";
    button.disabled = true;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });

    overlayState.root.appendChild(button);
    overlayState.endButton = button;
  }

  function setMode(mode) {
    mountIfNeeded();
    if (overlayState.toggleButton) {
      overlayState.toggleButton.dataset.mode = mode;
      overlayState.toggleButton.dataset.enabled = String(mode !== "off");
      overlayState.toggleButton.textContent = labelForToggle(mode);
    }
    if (overlayState.endButton) {
      overlayState.endButton.hidden = mode === "off";
    }
  }

  function labelForToggle(mode) {
    switch (mode) {
      case "cutter":
        return "Cutter Mode (click to disable)";
      case "box":
        return "Box Mode (click to disable)";
      case "section":
        return "Section Mode (click to disable)";
      default:
        return "Cutter Mode disabled";
    }
  }

  function setEndButtonState({ enabled, label } = {}) {
    mountIfNeeded();
    if (!overlayState.endButton) {
      return;
    }

    overlayState.endButton.disabled = !enabled;
    if (label) {
      overlayState.endButton.textContent = label;
    }
  }

  function addCutLine(pageY, index) {
    mountIfNeeded();

    const existing = overlayState.cutLines.find((line) => Number(line.dataset.pageY) === pageY);
    if (existing) {
      existing.remove();
      overlayState.cutLines = overlayState.cutLines.filter((line) => line !== existing);
    }

    const line = document.createElement("div");
    line.className = LINE_CLASS;
    line.dataset.pageY = String(pageY);
    line.style.top = `${pageY}px`;
    line.title = `Cut ${index}`;

    overlayState.lineLayer.appendChild(line);
    overlayState.cutLines.push(line);
  }

  function removeLastCutLine() {
    const line = overlayState.cutLines.pop();
    if (line) {
      line.remove();
    }
  }

  function clearCutLines() {
    for (const line of overlayState.cutLines) {
      line.remove();
    }
    overlayState.cutLines = [];
  }

  function addBox(rect, index) {
    mountIfNeeded();

    const box = document.createElement("div");
    box.className = BOX_CLASS;
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    box.title = `Box ${index}`;

    const label = document.createElement("span");
    label.className = "webtoon-panel-cutter-box-label";
    label.textContent = String(index);
    box.appendChild(label);

    overlayState.boxLayer.appendChild(box);
    overlayState.boxes.push(box);
  }

  function removeLastBox() {
    const box = overlayState.boxes.pop();
    if (box) {
      box.remove();
    }
  }

  function clearBoxes() {
    for (const box of overlayState.boxes) {
      box.remove();
    }
    overlayState.boxes = [];
  }

  function showRubberBand(rect) {
    mountIfNeeded();
    overlayState.rubberBand.hidden = false;
    overlayState.rubberBand.style.left = `${rect.left}px`;
    overlayState.rubberBand.style.top = `${rect.top}px`;
    overlayState.rubberBand.style.width = `${Math.max(0, rect.width)}px`;
    overlayState.rubberBand.style.height = `${Math.max(0, rect.height)}px`;
  }

  function hideRubberBand() {
    if (!overlayState.rubberBand) {
      return;
    }
    overlayState.rubberBand.hidden = true;
    overlayState.rubberBand.style.width = "0";
    overlayState.rubberBand.style.height = "0";
  }

  function addSectionMarker(pageY, viewportHeight, index) {
    mountIfNeeded();

    const marker = document.createElement("div");
    marker.className = SECTION_CLASS;
    marker.style.top = `${pageY}px`;
    marker.style.height = `${Math.max(1, viewportHeight)}px`;
    marker.title = `Section ${index}`;

    const badge = document.createElement("span");
    badge.className = "webtoon-panel-cutter-section-label";
    badge.textContent = String(index);
    marker.appendChild(badge);

    overlayState.sectionLayer.appendChild(marker);
    overlayState.sectionMarkers.push(marker);
  }

  function removeLastSectionMarker() {
    const marker = overlayState.sectionMarkers.pop();
    if (marker) {
      marker.remove();
    }
  }

  function clearSectionMarkers() {
    for (const marker of overlayState.sectionMarkers) {
      marker.remove();
    }
    overlayState.sectionMarkers = [];
  }

  function highlightRegion(top, bottom) {
    mountIfNeeded();
    overlayState.highlight.hidden = false;
    overlayState.highlight.style.top = `${top}px`;
    overlayState.highlight.style.height = `${Math.max(0, bottom - top)}px`;
  }

  function clearHighlight() {
    if (!overlayState.highlight) {
      return;
    }
    overlayState.highlight.hidden = true;
    overlayState.highlight.style.height = "0";
  }

  function showStatus(message, isError = false) {
    mountIfNeeded();
    overlayState.status.textContent = message;
    overlayState.status.dataset.error = String(Boolean(isError));
    overlayState.status.hidden = false;

    window.clearTimeout(overlayState.statusTimer);
    overlayState.statusTimer = window.setTimeout(() => {
      overlayState.status.hidden = true;
    }, isError ? 5000 : 2600);
  }

  function mountIfNeeded() {
    ensureRoot();
    if (!overlayState.endButton) {
      mountEndButton(() => {});
    }
  }

  window.WebtoonPanelCutterOverlay = {
    mountFloatingToggle,
    mountEndButton,
    setMode,
    setEndButtonState,
    addCutLine,
    removeLastCutLine,
    clearCutLines,
    addBox,
    removeLastBox,
    clearBoxes,
    showRubberBand,
    hideRubberBand,
    addSectionMarker,
    removeLastSectionMarker,
    clearSectionMarkers,
    highlightRegion,
    clearHighlight,
    showStatus
  };
})();
