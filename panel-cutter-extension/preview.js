const MESSAGE_TYPES = {
  GET_PREVIEW_PANELS: "PANEL_CUTTER_GET_PREVIEW_PANELS",
  GET_PREVIEW_PANEL: "PANEL_CUTTER_GET_PREVIEW_PANEL",
  CLEAR_PREVIEW_PANELS: "PANEL_CUTTER_CLEAR_PREVIEW_PANELS"
};

const gallery = document.getElementById("gallery");
const panelCount = document.getElementById("panelCount");
const saveAllButton = document.getElementById("saveAll");
const saveAllTrimmedButton = document.getElementById("saveAllTrimmed");
const viewerModal = document.getElementById("viewerModal");
const viewerImage = document.getElementById("viewerImage");
const viewerClose = document.getElementById("viewerClose");
const viewerPrev = document.getElementById("viewerPrev");
const viewerNext = document.getElementById("viewerNext");

let panels = [];
let panelMode = "cutter";
let isSaving = false;
let isClosingAfterAction = false;
let currentIndex = 0;
let isViewerOpen = false;

document.addEventListener("DOMContentLoaded", init);
saveAllButton.addEventListener("click", handleSaveAll);
saveAllTrimmedButton.addEventListener("click", handleSaveAllTrimmed);
viewerClose.addEventListener("click", closeViewer);
viewerPrev.addEventListener("click", showPreviousImage);
viewerNext.addEventListener("click", showNextImage);
viewerModal.addEventListener("click", (event) => {
  if (event.target === viewerModal) {
    closeViewer();
  }
});
document.addEventListener("keydown", handleKeyboardNavigation);
window.addEventListener("pagehide", () => {
  if (!isClosingAfterAction) {
    clearPreviewQueue();
  }
});

async function init() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.GET_PREVIEW_PANELS
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unable to load captured panels.");
    }

    const count = response.count || 0;
    panelMode = response.mode || "cutter";
    panels = [];

    for (let index = 0; index < count; index += 1) {
      panelCount.textContent = `Loading panel ${index + 1} of ${count}...`;
      panels.push(await loadPreviewPanel(index));
      await nextFrame();
    }

    renderGallery();
  } catch (error) {
    panelCount.textContent = error.message;
    saveAllButton.disabled = true;
    saveAllTrimmedButton.disabled = true;
  }
}

async function loadPreviewPanel(index) {
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.GET_PREVIEW_PANEL,
    index
  });

  if (!response?.ok) {
    throw new Error(response?.error || `Unable to load panel ${index + 1}.`);
  }

  return response.dataUrl;
}

function renderGallery() {
  gallery.textContent = "";
  updatePanelCount();

  if (panels.length === 0) {
    const empty = document.createElement("p");
    empty.className = "preview-empty";
    empty.textContent = "No panels in the queue.";
    gallery.appendChild(empty);
    saveAllButton.disabled = true;
    saveAllTrimmedButton.disabled = true;
    return;
  }

  saveAllButton.disabled = false;
  saveAllTrimmedButton.disabled = false;
  renderCardsInChunks(0);
}

function renderCardsInChunks(startIndex) {
  const fragment = document.createDocumentFragment();
  const chunkSize = 12;
  const endIndex = Math.min(startIndex + chunkSize, panels.length);

  for (let index = startIndex; index < endIndex; index += 1) {
    fragment.appendChild(createCard(index));
  }

  gallery.appendChild(fragment);

  if (endIndex < panels.length) {
    requestAnimationFrame(() => renderCardsInChunks(endIndex));
  }
}

function createCard(index) {
  const card = document.createElement("article");
  card.className = "preview-card";

  const imageButton = document.createElement("button");
  imageButton.type = "button";
  imageButton.className = "preview-image-button";
  imageButton.setAttribute("aria-label", `Open panel ${index + 1}`);
  imageButton.addEventListener("click", () => openViewer(index));

  const image = document.createElement("img");
  image.src = panels[index];
  image.alt = `Panel ${index + 1}`;
  image.loading = "lazy";
  imageButton.appendChild(image);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-btn preview-delete";
  deleteButton.textContent = "\u00d7";
  deleteButton.setAttribute("aria-label", `Remove panel ${index + 1}`);
  deleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    deletePanel(index);
  });

  const label = document.createElement("span");
  label.className = "preview-label";
  label.textContent = `panel-${String(index + 1).padStart(3, "0")}.png`;

  card.append(imageButton, deleteButton, label);
  return card;
}

function deletePanel(index) {
  panels.splice(index, 1);

  if (isViewerOpen) {
    if (panels.length === 0) {
      closeViewer();
    } else {
      currentIndex = Math.min(currentIndex, panels.length - 1);
      updateViewerImage();
    }
  }

  renderGallery();
}

function openViewer(index) {
  if (panels.length === 0) {
    return;
  }

  currentIndex = clampIndex(index);
  isViewerOpen = true;
  viewerModal.classList.add("is-open");
  document.body.classList.add("viewer-open");
  updateViewerImage();
  viewerClose.focus();
}

function closeViewer() {
  isViewerOpen = false;
  viewerModal.classList.remove("is-open");
  document.body.classList.remove("viewer-open");
  viewerImage.removeAttribute("src");
}

function showNextImage() {
  if (!isViewerOpen || panels.length === 0) {
    return;
  }

  currentIndex = (currentIndex + 1) % panels.length;
  updateViewerImage();
}

function showPreviousImage() {
  if (!isViewerOpen || panels.length === 0) {
    return;
  }

  currentIndex = (currentIndex - 1 + panels.length) % panels.length;
  updateViewerImage();
}

function updateViewerImage() {
  currentIndex = clampIndex(currentIndex);
  viewerImage.src = panels[currentIndex];
  viewerImage.alt = `Panel ${currentIndex + 1}`;
  viewerPrev.disabled = panels.length <= 1;
  viewerNext.disabled = panels.length <= 1;
}

function handleKeyboardNavigation(event) {
  if (!isViewerOpen) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeViewer();
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showPreviousImage();
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    showNextImage();
  }
}

async function handleSaveAll() {
  await exportPanels({ trimWhitespace: false });
}

async function handleSaveAllTrimmed() {
  await exportPanels({ trimWhitespace: true });
}

async function exportPanels({ trimWhitespace }) {
  if (isSaving || panels.length === 0) {
    return;
  }

  isSaving = true;
  closeViewer();

  const folderName = `${panelMode}-${makeTimestamp()}`;
  setBusyState(true, `Saving to ${folderName}/...`);

  try {
    for (let index = 0; index < panels.length; index += 1) {
      const filename = `${folderName}/panel-${String(index + 1).padStart(3, "0")}.png`;
      setBusyState(
        true,
        trimWhitespace
          ? `Trimming panel ${index + 1} of ${panels.length}...`
          : `Saving panel ${index + 1} of ${panels.length}...`
      );
      await nextFrame();

      const dataUrl = trimWhitespace
        ? await trimHorizontalWhitespaceFromDataUrl(panels[index])
        : panels[index];
      await downloadPanel(dataUrl, filename);
    }

    await clearPreviewQueue();
    panels = [];
    isClosingAfterAction = true;
    window.close();
  } catch (error) {
    showSaveError(error.message || "Unable to save panels.");
    setBusyState(false);
  } finally {
    isSaving = false;
  }
}

function makeTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    String(now.getFullYear()) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    "-" +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

function downloadPanel(dataUrl, filename) {
  const blob = dataUrlToBlob(dataUrl);
  const blobUrl = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url: blobUrl, filename, saveAs: false, conflictAction: "uniquify" },
      (downloadId) => {
        URL.revokeObjectURL(blobUrl);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(downloadId);
        }
      }
    );
  });
}

async function clearPreviewQueue() {
  await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.CLEAR_PREVIEW_PANELS
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime = (header.match(/:(.*?);/) || [])[1] || "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function trimHorizontalWhitespaceFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = 0;
      let right = canvas.width - 1;

      function isColumnWhite(x) {
        for (let y = 0; y < canvas.height; y += 1) {
          const i = (y * canvas.width + x) * 4;
          const r = imageData[i];
          const g = imageData[i + 1];
          const b = imageData[i + 2];
          const a = imageData[i + 3];

          if (a !== 0 && (r < 250 || g < 250 || b < 250)) {
            return false;
          }
        }

        return true;
      }

      while (left < canvas.width && isColumnWhite(left)) {
        left += 1;
      }

      while (right > left && isColumnWhite(right)) {
        right -= 1;
      }

      if (left >= canvas.width) {
        resolve(dataUrl);
        return;
      }

      const trimmedWidth = right - left + 1;
      const trimmedCanvas = document.createElement("canvas");
      trimmedCanvas.width = trimmedWidth;
      trimmedCanvas.height = canvas.height;

      trimmedCanvas
        .getContext("2d")
        .drawImage(
          canvas,
          left,
          0,
          trimmedWidth,
          canvas.height,
          0,
          0,
          trimmedWidth,
          canvas.height
        );

      resolve(trimmedCanvas.toDataURL("image/png"));
    };

    img.onerror = () => reject(new Error("Unable to trim a captured panel."));
    img.src = dataUrl;
  });
}

function updatePanelCount() {
  const count = panels.length;
  panelCount.textContent = `${count} panel${count === 1 ? "" : "s"} ready`;
}

function showSaveError(message) {
  let bar = document.getElementById("saveErrorBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "saveErrorBar";
    bar.className = "save-error-bar";
    document.querySelector(".preview-actions").before(bar);
  }
  bar.textContent = message;
  bar.hidden = false;
  clearTimeout(bar._timer);
  bar._timer = setTimeout(() => { bar.hidden = true; }, 8000);
}

function setBusyState(disabled, label = null) {
  saveAllButton.disabled = disabled;
  saveAllTrimmedButton.disabled = disabled;
  if (label) {
    panelCount.textContent = label;
  } else {
    updatePanelCount();
  }
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function clampIndex(index) {
  if (panels.length === 0) {
    return 0;
  }

  return Math.min(Math.max(index, 0), panels.length - 1);
}
