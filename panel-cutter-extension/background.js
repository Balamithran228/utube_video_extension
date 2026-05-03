const MESSAGE_TYPES = {
  CAPTURE_VISIBLE_TAB: "PANEL_CUTTER_CAPTURE_VISIBLE_TAB",
  DOWNLOAD_IMAGE: "PANEL_CUTTER_DOWNLOAD_IMAGE",
  GET_MODE: "PANEL_CUTTER_GET_MODE",
  SET_MODE: "PANEL_CUTTER_SET_MODE",
  MODE_CHANGED: "PANEL_CUTTER_MODE_CHANGED",
  UNDO_LAST_CUT: "PANEL_CUTTER_UNDO_LAST_CUT",
  OPEN_PREVIEW_POPUP: "OPEN_PREVIEW_POPUP",
  GET_PREVIEW_PANELS: "PANEL_CUTTER_GET_PREVIEW_PANELS",
  CLEAR_PREVIEW_PANELS: "PANEL_CUTTER_CLEAR_PREVIEW_PANELS"
};

const MODES = ["off", "cutter", "box", "section"];
const DEFAULT_MODE = "off";
let previewPanels = [];
let previewMode = "cutter";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ cutterMode: DEFAULT_MODE });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "undo-last-cut") {
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.UNDO_LAST_CUT }).catch(() => {
    // The active tab may not allow content scripts, such as chrome:// pages.
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) {
    return false;
  }

  if (message.type === MESSAGE_TYPES.CAPTURE_VISIBLE_TAB) {
    captureVisibleTab(sender, sendResponse);
    return true;
  }

  if (message.type === MESSAGE_TYPES.DOWNLOAD_IMAGE) {
    downloadImage(message, sendResponse);
    return true;
  }

  if (message.type === MESSAGE_TYPES.GET_MODE) {
    chrome.storage.local.get({ cutterMode: DEFAULT_MODE }, (result) => {
      sendResponse({ mode: normalizeMode(result.cutterMode) });
    });
    return true;
  }

  if (message.type === MESSAGE_TYPES.SET_MODE) {
    setMode(normalizeMode(message.mode), sender.tab?.id, sendResponse);
    return true;
  }

  if (message.type === MESSAGE_TYPES.OPEN_PREVIEW_POPUP) {
    openPreviewPopup(message.panels || [], message.mode || "cutter", sendResponse);
    return true;
  }

  if (message.type === MESSAGE_TYPES.GET_PREVIEW_PANELS) {
    sendResponse({ ok: true, panels: previewPanels, mode: previewMode });
    return true;
  }

  if (message.type === MESSAGE_TYPES.CLEAR_PREVIEW_PANELS) {
    previewPanels = [];
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

function normalizeMode(value) {
  return MODES.includes(value) ? value : DEFAULT_MODE;
}

function captureVisibleTab(sender, sendResponse) {
  const windowId = sender.tab?.windowId;
  if (typeof windowId !== "number") {
    sendResponse({ ok: false, error: "Unable to identify the current browser window." });
    return;
  }

  chrome.tabs.captureVisibleTab(
    windowId,
    { format: "png" },
    (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      sendResponse({ ok: true, dataUrl });
    }
  );
}

function downloadImage(message, sendResponse) {
  if (!message.dataUrl) {
    sendResponse({ ok: false, error: "No image data was provided for download." });
    return;
  }

  chrome.downloads.download(
    {
      url: message.dataUrl,
      filename: message.filename || makeFilename(),
      saveAs: false,
      conflictAction: "uniquify"
    },
    (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      sendResponse({ ok: true, downloadId });
    }
  );
}

function openPreviewPopup(panels, mode, sendResponse) {
  previewPanels = panels.filter(Boolean);
  previewMode = mode;

  chrome.windows.create(
    {
      url: chrome.runtime.getURL("preview.html"),
      type: "popup",
      width: 420,
      height: 700
    },
    (window) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      sendResponse({ ok: true, windowId: window?.id });
    }
  );
}

function setMode(mode, sourceTabId, sendResponse) {
  chrome.storage.local.set({ cutterMode: mode }, async () => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }

    const activeTabId = sourceTabId || await getActiveTabId();
    if (mode !== "off" && activeTabId) {
      await ensureContentScripts(activeTabId);
    }

    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id) {
        continue;
      }

      chrome.tabs.sendMessage(tab.id, {
        type: MESSAGE_TYPES.MODE_CHANGED,
        mode,
        sourceTabId
      }).catch(() => {
        // Some tabs cannot receive extension messages. This is expected.
      });
    }

    sendResponse({ ok: true, mode });
  });
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function ensureContentScripts(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["overlay.js", "cropper.js", "content.js"]
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["styles.css"]
    });
  } catch (_error) {
    // Pages like chrome:// URLs cannot be scripted. Static content scripts still
    // handle normal web pages after navigation or refresh.
  }
}

function makeFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `webtoon-panel-${stamp}.png`;
}
