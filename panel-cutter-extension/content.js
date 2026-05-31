(() => {
  if (window.__WEBTOON_PANEL_CUTTER_CONTENT_LOADED__) {
    return;
  }
  window.__WEBTOON_PANEL_CUTTER_CONTENT_LOADED__ = true;

  const MESSAGE_TYPES = {
    GET_MODE: "PANEL_CUTTER_GET_MODE",
    SET_MODE: "PANEL_CUTTER_SET_MODE",
    MODE_CHANGED: "PANEL_CUTTER_MODE_CHANGED",
    UNDO_LAST_CUT: "PANEL_CUTTER_UNDO_LAST_CUT",
    ADD_PREVIEW_PANEL: "PANEL_CUTTER_ADD_PREVIEW_PANEL",
    CLEAR_PREVIEW_PANELS: "PANEL_CUTTER_CLEAR_PREVIEW_PANELS",
    OPEN_PREVIEW_POPUP: "OPEN_PREVIEW_POPUP"
  };

  const MIN_DRAG_PIXELS = 6;

  const state = {
    mode: "off",
    cuts: [],
    boxes: [],
    sections: [],
    isExtracting: false,
    drag: null
  };

  const overlay = window.WebtoonPanelCutterOverlay;
  const cropper = window.WebtoonPanelCutterCropper;

  if (!overlay || !cropper) {
    console.error("Webtoon Panel Cutter failed to initialize overlay or cropper modules.");
    return;
  }

  init();

  function init() {
    overlay.mountEndButton(handleEndClick);
    bindEvents();
    loadInitialMode();
  }

  function bindEvents() {
    document.addEventListener("contextmenu", handleContextMenu, true);
    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("mouseup", handleMouseUp, true);
    document.addEventListener("keydown", handleKeyDown, true);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === MESSAGE_TYPES.MODE_CHANGED) {
        applyMode(normalizeMode(message.mode));
        sendResponse({ ok: true });
        return true;
      }

      if (message?.type === MESSAGE_TYPES.UNDO_LAST_CUT) {
        undoLast();
        sendResponse({ ok: true });
        return true;
      }

      return false;
    });
  }

  function loadInitialMode() {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_MODE }, (response) => {
      if (chrome.runtime.lastError) {
        applyMode("off");
        return;
      }

      applyMode(normalizeMode(response?.mode));
    });
  }

  function handleToggleClick() {
    const nextMode = state.mode === "off" ? "cutter" : "off";
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.SET_MODE, mode: nextMode }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        overlay.showStatus("Unable to update mode on this page.", true);
      }
    });
  }

  function applyMode(mode) {
    if (state.mode === mode) {
      overlay.setMode(mode);
      updateEndButton();
      return;
    }

    state.mode = mode;
    resetAll();
    overlay.setMode(mode);
    updateEndButton();

    switch (mode) {
      case "cutter":
        overlay.showStatus("Cutter mode: right-click twice to cut a panel.");
        break;
      case "box":
        overlay.showStatus("Box mode: right-click and drag to mark a rectangle.");
        break;
      case "section":
        overlay.showStatus("Section mode: right-click to bookmark the visible viewport.");
        break;
      default:
        overlay.showStatus("All modes are off.");
    }
  }

  function handleContextMenu(event) {
    if (state.mode === "off") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (state.isExtracting) {
      overlay.showStatus("Capture in progress. Please wait.", true);
      return;
    }

    switch (state.mode) {
      case "cutter":
        handleCutterContextMenu(event);
        break;
      case "box":
        // Box commit happens in mouseup. Suppress the browser context menu only.
        break;
      case "section":
        captureSectionBookmark();
        break;
      default:
        break;
    }
  }

  function handleCutterContextMenu(event) {
    // Guard: cutter-specific cut lines must never appear in other modes.
    if (state.mode !== "cutter") {
      return;
    }

    const y = Math.round(window.scrollY + event.clientY);
    addCutterCut(y);
  }

  function addCutterCut(y) {
    state.cuts.push(y);
    overlay.addCutLine(y, state.cuts.length);

    if (state.cuts.length % 2 === 1) {
      overlay.clearHighlight();
      overlay.showStatus(`Cut ${state.cuts.length} placed. Add one more line to complete this panel.`);
      updateEndButton();
      return;
    }

    const y1 = state.cuts[state.cuts.length - 2];
    const y2 = state.cuts[state.cuts.length - 1];
    overlay.highlightRegion(Math.min(y1, y2), Math.max(y1, y2));
    overlay.showStatus(`Panel ${state.cuts.length / 2} queued. Add more cuts or click End & Save.`);
    updateEndButton();
  }

  async function captureSectionBookmark() {
    // Guard: section markers must never appear in other modes.
    if (state.mode !== "section") {
      return;
    }

    if (state.isExtracting) {
      overlay.showStatus("Capture in progress. Please wait.", true);
      return;
    }

    const viewportRect = getVisibleViewportRect();
    state.isExtracting = true;
    updateEndButton("Capturing...");
    overlay.showStatus(`Capturing section ${state.sections.length + 1}...`);

    try {
      const result = await cropper.captureCurrentViewport();
      state.sections.push({
        viewportRect,
        dataUrl: result.dataUrl
      });
      overlay.addSectionMarker(viewportRect, state.sections.length);
      overlay.showStatus(`Section ${state.sections.length} captured. Scroll, zoom, and capture more.`);
    } catch (error) {
      console.error(error);
      overlay.showStatus(error.message || "Unable to capture this section.", true);
    } finally {
      state.isExtracting = false;
      updateEndButton();
    }
  }

  function handleMouseDown(event) {
    // Guard: rubber-band drag is exclusive to box mode.
    if (state.mode !== "box" || state.isExtracting) {
      return;
    }

    if (event.button !== 2) {
      return;
    }

    const startX = Math.round(window.scrollX + event.clientX);
    const startY = Math.round(window.scrollY + event.clientY);

    state.drag = {
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      committed: false
    };

    overlay.showRubberBand(rectFromDrag(state.drag));
    event.preventDefault();
    event.stopPropagation();
  }

  function handleMouseMove(event) {
    if (!state.drag) {
      return;
    }

    state.drag.currentX = Math.round(window.scrollX + event.clientX);
    state.drag.currentY = Math.round(window.scrollY + event.clientY);
    overlay.showRubberBand(rectFromDrag(state.drag));
  }

  function handleMouseUp(event) {
    if (!state.drag) {
      return;
    }

    if (event.button !== 2) {
      return;
    }

    const drag = state.drag;
    state.drag = null;
    overlay.hideRubberBand();

    const rect = rectFromDrag(drag);
    if (rect.width < MIN_DRAG_PIXELS || rect.height < MIN_DRAG_PIXELS) {
      overlay.showStatus("Box too small. Drag a larger region.", true);
      return;
    }

    state.boxes.push(rect);
    overlay.addBox(rect, state.boxes.length);
    overlay.showStatus(`Box ${state.boxes.length} queued. Drag more or click End & Save.`);
    updateEndButton();

    event.preventDefault();
    event.stopPropagation();
  }

  function rectFromDrag(drag) {
    const left = Math.min(drag.startX, drag.currentX);
    const top = Math.min(drag.startY, drag.currentY);
    const right = Math.max(drag.startX, drag.currentX);
    const bottom = Math.max(drag.startY, drag.currentY);
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top
    };
  }

  function getVisibleViewportRect() {
    const viewport = window.visualViewport;

    if (viewport) {
      return {
        left: Math.round(viewport.pageLeft),
        top: Math.round(viewport.pageTop),
        width: Math.round(viewport.width),
        height: Math.round(viewport.height)
      };
    }

    return {
      left: Math.round(window.scrollX),
      top: Math.round(window.scrollY),
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  function handleKeyDown(event) {
    const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "z";
    const isPlainSpace = event.code === "Space" && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
    if (state.mode === "off" || (!isUndo && !isPlainSpace)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (isUndo) {
      undoLast();
      return;
    }

    handleSpaceShortcut();
  }

  function handleSpaceShortcut() {
    if (state.isExtracting) {
      overlay.showStatus("Capture in progress. Please wait.", true);
      return;
    }

    if (state.mode === "section") {
      captureSectionBookmark();
      return;
    }

    if (state.mode === "cutter") {
      const y = Math.round(window.scrollY + (window.innerHeight / 2));
      addCutterCut(y);
      return;
    }

    if (state.mode === "box") {
      overlay.showStatus("Box mode still needs right-click drag to choose the rectangle.");
    }
  }

  async function handleEndClick() {
    if (state.mode === "off") {
      return;
    }

    if (state.isExtracting) {
      overlay.showStatus("Saving is already running. Please wait.", true);
      return;
    }

    try {
      if (state.mode === "cutter") {
        await runCutterEnd();
      } else if (state.mode === "box") {
        await runBoxEnd();
      } else if (state.mode === "section") {
        await runSectionEnd();
      }
    } catch (error) {
      console.error(error);
      overlay.showStatus(error.message || "Unable to capture queued items.", true);
    }
  }

  async function runCutterEnd() {
    const completeCutCount = state.cuts.length - (state.cuts.length % 2);
    if (completeCutCount < 2) {
      overlay.showStatus("Add at least two cut lines before saving.", true);
      return;
    }

    if (state.cuts.length % 2 === 1) {
      overlay.showStatus("Last cut has no matching pair, so it will be ignored.", true);
    }

    const queuedCuts = state.cuts.slice(0, completeCutCount);
    state.isExtracting = true;
    updateEndButton("Capturing...");
    const previewPanels = [];
    const totalPanels = queuedCuts.length / 2;

    try {
      for (let index = 0; index < queuedCuts.length; index += 2) {
        const panelNumber = (index / 2) + 1;
        overlay.showStatus(`Capturing panel ${panelNumber} of ${totalPanels}...`);
        const top = Math.min(queuedCuts[index], queuedCuts[index + 1]);
        const bottom = Math.max(queuedCuts[index], queuedCuts[index + 1]);

        if (bottom - top < 2) {
          throw new Error(`Panel ${panelNumber} is too small. Move those cut lines farther apart.`);
        }

        overlay.highlightRegion(top, bottom);
        const result = await cropper.capturePageRegion({ top, bottom });
        previewPanels.push(result.dataUrl);
      }

      await openPreviewPopup(previewPanels);
      overlay.showStatus(`Preview opened with ${previewPanels.length} panels.`);
      resetCutterState();
    } finally {
      state.isExtracting = false;
      updateEndButton();
      overlay.clearHighlight();
    }
  }

  async function runBoxEnd() {
    if (state.boxes.length === 0) {
      overlay.showStatus("Drag at least one box before saving.", true);
      return;
    }

    state.isExtracting = true;
    updateEndButton("Capturing...");
    const previewPanels = [];
    const total = state.boxes.length;

    try {
      for (let index = 0; index < state.boxes.length; index += 1) {
        overlay.showStatus(`Capturing box ${index + 1} of ${total}...`);
        const result = await cropper.captureBox(state.boxes[index]);
        previewPanels.push(result.dataUrl);
      }

      await openPreviewPopup(previewPanels);
      overlay.showStatus(`Preview opened with ${previewPanels.length} boxes.`);
      resetBoxState();
    } finally {
      state.isExtracting = false;
      updateEndButton();
    }
  }

  async function runSectionEnd() {
    if (state.sections.length === 0) {
      overlay.showStatus("Right-click at least once before saving.", true);
      return;
    }

    state.isExtracting = true;
    updateEndButton("Capturing...");
    const previewPanels = [];
    const total = state.sections.length;

    try {
      for (let index = 0; index < state.sections.length; index += 1) {
        overlay.showStatus(`Capturing section ${index + 1} of ${total}...`);
        previewPanels.push(state.sections[index].dataUrl);
      }

      await openPreviewPopup(previewPanels);
      overlay.showStatus(`Preview opened with ${previewPanels.length} sections.`);
      resetSectionState();
    } finally {
      state.isExtracting = false;
      updateEndButton();
    }
  }

  function updateEndButton(label) {
    const counts = {
      cutter: Math.floor(state.cuts.length / 2),
      box: state.boxes.length,
      section: state.sections.length
    };

    const queued = counts[state.mode] || 0;
    const canSave = state.mode !== "off" && !state.isExtracting && queued > 0;
    const noun = state.mode === "cutter"
      ? "Panel"
      : state.mode === "box"
        ? "Box"
        : state.mode === "section"
          ? "Section"
          : "Item";
    const defaultLabel = queued > 0
      ? `End & Save ${queued} ${noun}${queued === 1 ? "" : "s"}`
      : "End & Save";

    overlay.setEndButtonState({
      enabled: canSave,
      label: label || defaultLabel
    });
  }

  async function openPreviewPopup(panels) {
    await clearPreviewQueue();

    for (let index = 0; index < panels.length; index += 1) {
      overlay.showStatus(`Preparing preview ${index + 1} of ${panels.length}...`);
      await addPreviewPanel(panels[index]);
    }

    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.OPEN_PREVIEW_POPUP,
      mode: state.mode
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unable to open the preview window.");
    }
  }

  async function addPreviewPanel(dataUrl) {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.ADD_PREVIEW_PANEL,
      mode: state.mode,
      dataUrl
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unable to prepare a captured image for preview.");
    }
  }

  async function clearPreviewQueue() {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.CLEAR_PREVIEW_PANELS
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unable to clear the previous preview queue.");
    }
  }

  function undoLast() {
    if (state.isExtracting) {
      overlay.showStatus("Cannot undo while capture is running.", true);
      return;
    }

    if (state.mode === "cutter") {
      if (state.cuts.length === 0) {
        overlay.showStatus("No cut lines to remove.");
        return;
      }
      state.cuts.pop();
      overlay.removeLastCutLine();
      overlay.clearHighlight();
      restoreLastCutterHighlight();
      updateEndButton();
      overlay.showStatus("Last cut removed.");
      return;
    }

    if (state.mode === "box") {
      if (state.boxes.length === 0) {
        overlay.showStatus("No boxes to remove.");
        return;
      }
      state.boxes.pop();
      overlay.removeLastBox();
      updateEndButton();
      overlay.showStatus("Last box removed.");
      return;
    }

    if (state.mode === "section") {
      if (state.sections.length === 0) {
        overlay.showStatus("No sections to remove.");
        return;
      }
      state.sections.pop();
      overlay.removeLastSectionMarker();
      updateEndButton();
      overlay.showStatus("Last section removed.");
    }
  }

  function restoreLastCutterHighlight() {
    if (state.cuts.length < 2 || state.cuts.length % 2 === 1) {
      return;
    }

    const y1 = state.cuts[state.cuts.length - 2];
    const y2 = state.cuts[state.cuts.length - 1];
    overlay.highlightRegion(Math.min(y1, y2), Math.max(y1, y2));
  }

  function resetAll() {
    resetCutterState();
    resetBoxState();
    resetSectionState();
    state.drag = null;
    overlay.hideRubberBand();
  }

  function resetCutterState() {
    state.cuts = [];
    overlay.clearCutLines();
    overlay.clearHighlight();
  }

  function resetBoxState() {
    state.boxes = [];
    overlay.clearBoxes();
  }

  function resetSectionState() {
    state.sections = [];
    overlay.clearSectionMarkers();
  }

  function normalizeMode(value) {
    return ["off", "cutter", "box", "section"].includes(value) ? value : "off";
  }
})();
