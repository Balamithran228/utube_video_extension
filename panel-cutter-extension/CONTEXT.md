# Panel Cutter — Architecture Context

Developer reference. Update this file whenever architecture, modes, message contracts, or platform gotchas change.

---

## What was built

A Manifest V3 Chrome/Brave extension for capturing regions of long-scroll manga/webtoon pages and saving them as numbered PNGs. Built from scratch with three capture modes, an in-page overlay system, a multi-segment stitching pipeline, and a preview gallery with modal viewer.

---

## Modes

Only one mode is active at a time (stored in `chrome.storage.local` as `cutterMode: "off" | "cutter" | "box" | "section"`). All three modes intercept right-click, making them mutually exclusive.

| Mode | Right-click action | Visual feedback | Output |
|---|---|---|---|
| `off` | Browser default menu | None | None |
| `cutter` | Places a red horizontal cut line at the click Y | Red lines + red highlight band between paired cuts | One stitched PNG per cut pair |
| `box` | Starts a right-click drag; mouseup commits a rectangle | Blue dashed rubber-band during drag, solid blue box after commit | One PNG per box (stitched if taller than viewport) |
| `section` | Bookmarks the current viewport at `scrollY` | Green semi-transparent band covering the viewport height, numbered badge | One viewport-sized PNG per bookmark |

### Mode isolation guarantee

Each mode-specific handler has an explicit self-guard at the top:

```js
function handleCutterContextMenu(event) {
  if (state.mode !== "cutter") return;  // guard
  // ... cut line logic
}

function handleSectionContextMenu() {
  if (state.mode !== "section") return; // guard
  // ... section marker logic
}
```

`handleContextMenu` routes via a `switch(state.mode)` (not a fragile `if/else if` chain). `handleMouseDown/Up` guards `state.mode !== "box"`. These three layers mean cutter visuals (red lines, red highlight) are structurally impossible to appear in box or section mode.

---

## Save flow

Files are written via `chrome.downloads.download` into a timestamped subfolder of Downloads. No folder picker is shown — `showDirectoryPicker` is not used (unavailable in extension popup windows and blocked by Brave).

```
Downloads/
  {mode}-{YYYYMMDD}-{HHmmss}/
    panel-001.png
    panel-002.png
    ...
```

Pipeline in `preview.js → exportPanels`:

1. Generate folder name: `${panelMode}-${makeTimestamp()}`.
2. For each panel (optionally trim whitespace first):
   - Convert data URL → `Blob` via `atob` + `Uint8Array` (never `fetch` — MV3 CSP blocks it).
   - Create a short-lived `blob:` URL with `URL.createObjectURL`.
   - Call `chrome.downloads.download({ url: blobUrl, filename: "folder/panel-001.png", saveAs: false })`.
   - Revoke the blob URL in the download callback.
3. Clear the preview queue in the service worker.
4. Close the preview window.

The `panelMode` value is passed from `content.js` → `OPEN_PREVIEW_POPUP` message → stored in service worker `previewMode` → returned in `GET_PREVIEW_PANELS` response → read into `preview.js`.

---

## Capture pipeline

Shared by all three modes. Core logic in `cropper.js`.

### `capturePageRegion({ top, bottom })` — used by Cutter mode

Captures a horizontal slice of the page by scroll-screenshot-crop-stitch:

1. Save `scrollX`, `scrollY`, `overflowAnchor`.
2. Set `overflowAnchor = "none"` to prevent scroll drift.
3. Hide all extension overlay UI (`withCaptureUiHidden`) — also hides the page scrollbar via CSS class.
4. Loop: scroll to next slice position → wait 450 ms for layout/lazy images → `captureVisibleTab` → crop the relevant strip onto canvas.
5. Stitch all strips into one canvas → `canvas.toDataURL("image/png")`.
6. Restore scroll and `overflowAnchor` in `finally`.

### `captureBox({ left, top, right, bottom })` — used by Box mode

Same loop as above but also crops horizontally to `left`/`right` using `sourceX` and `sourceWidth` in the canvas drawImage call.

### `captureViewportAt(scrollY)` — used by Section mode

Single screenshot: scroll to `scrollY` → hide UI → one `captureVisibleTab` call → return the data URL directly (no stitching needed).

---

## Overlay system

`overlay.js` manages all in-page DOM elements under a single root `div#webtoon-panel-cutter-root`. It exposes `window.WebtoonPanelCutterOverlay`.

| Element | Mode | CSS class | Visual |
|---|---|---|---|
| Cut line | Cutter | `.webtoon-panel-cutter-line` | 2 px solid red, full width |
| Highlight band | Cutter | `.webtoon-panel-cutter-highlight` | Red semi-transparent fill, red top/bottom borders |
| Rubber-band | Box | `.webtoon-panel-cutter-rubberband` | Blue dashed border, light blue fill |
| Committed box | Box | `.webtoon-panel-cutter-box` | Blue solid border, light blue fill, numbered badge |
| Section marker | Section | `.webtoon-panel-cutter-section-marker` | Green semi-transparent fill, green top/bottom borders, numbered badge |
| Status toast | All | `.webtoon-panel-cutter-status` | Dark pill bottom-left, red when error |
| End button | Any active mode | `.webtoon-panel-cutter-end` | Fixed bottom-right, blue. Hidden when mode is `off`. |

All overlay elements are listed in `OVERLAY_SELECTORS` in `cropper.js` and hidden (`visibility: hidden; display: none`) during any capture. The root div being hidden is sufficient, but individual selectors are also listed for robustness.

### Site-level fixed / sticky element hiding

`withCaptureUiHidden` in `cropper.js` also iterates `document.body.querySelectorAll("*")` and temporarily sets `visibility: hidden` on every element with `getComputedStyle().position === "fixed"` or `"sticky"`. This is what removes site nav bars, sticky headers, floating widgets, cookie banners, etc. from captured screenshots — without this, section mode and the top of cutter/box captures would include the site's fixed top bar. Elements inside `#webtoon-panel-cutter-root` are skipped so we don't double-process our own UI. Original `style.visibility` is captured per-element and restored in `finally`.

---

## File map

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest. Permissions: `activeTab`, `scripting`, `downloads`, `storage`. Declares `Ctrl+Z` command. |
| `background.js` | Service worker. Owns mode storage, `MODE_CHANGED` broadcast, `previewPanels`/`previewMode` store, `captureVisibleTab` relay, `chrome.downloads.download` relay. |
| `content.js` | Per-page controller. Mode-specific input handlers (`handleContextMenu`, `handleMouseDown/Up`, `handleKeyDown`), End-and-Save flows per mode, undo. |
| `overlay.js` | DOM overlay primitives. All UI creation/mutation. Exposes `window.WebtoonPanelCutterOverlay`. |
| `cropper.js` | Three capture functions (`capturePageRegion`, `captureBox`, `captureViewportAt`). Scroll-stitch logic. Exposes `window.WebtoonPanelCutterCropper`. |
| `folder-storage.js` | IndexedDB helper for a saved directory handle. Not currently used by any page — kept for future use. |
| `popup.html / popup.js` | Browser-action popup. 4-button mode selector (Off / Cutter / Box / Section). |
| `preview.html / preview.js / preview.css` | Preview popup window. Thumbnail grid, modal viewer, save logic, whitespace trim. |
| `styles.css` | All in-page overlay styles and popup styles. |

---

## Message contract

| Message type | Sender → Receiver | Key payload | Response |
|---|---|---|---|
| `PANEL_CUTTER_GET_MODE` | content / popup → background | — | `{ mode }` |
| `PANEL_CUTTER_SET_MODE` | content / popup → background | `{ mode }` | `{ ok, mode }` + broadcasts `MODE_CHANGED` to all tabs |
| `PANEL_CUTTER_MODE_CHANGED` | background → content (all tabs) | `{ mode, sourceTabId }` | `{ ok }` |
| `PANEL_CUTTER_UNDO_LAST_CUT` | background → content (active tab) | — | `{ ok }` |
| `PANEL_CUTTER_CAPTURE_VISIBLE_TAB` | content → background | — | `{ ok, dataUrl }` |
| `PANEL_CUTTER_DOWNLOAD_IMAGE` | preview → background | `{ dataUrl, filename }` | `{ ok, downloadId }` (fallback only; preview uses `chrome.downloads` directly) |
| `OPEN_PREVIEW_POPUP` | content → background | `{ panels, mode }` | `{ ok, windowId }` |
| `PANEL_CUTTER_GET_PREVIEW_PANELS` | preview → background | — | `{ ok, panels, mode }` |
| `PANEL_CUTTER_CLEAR_PREVIEW_PANELS` | preview → background | — | `{ ok }` |

---

## Platform gotchas (never repeat these mistakes)

1. **Never `fetch('data:...')` in extension pages.** Chrome MV3 CSP blocks it silently — no error in the console, just nothing saved. Always convert data URLs to Blob via `atob` + `Uint8Array`.

2. **`showDirectoryPicker` does not work in extension popup windows.** It is also blocked by Brave by default. Use `chrome.downloads.download` with a `filename` that includes a subfolder path — Chrome creates the folder automatically inside Downloads.

3. **Convert data URL → Blob → `blob:` URL → `chrome.downloads.download`.** Do not pass a raw data URL to the downloads API; large images fail silently. Use `URL.createObjectURL(blob)` and revoke in the callback.

4. **`captureVisibleTab` is rate-limited (~2/sec).** Do not call it in rapid succession. The 450 ms scroll-settle delay in `cropper.js` (`WAIT_AFTER_SCROLL_MS`) handles this for normal use.

5. **`overflowAnchor` must be reset.** Setting it to `"none"` before capture scroll and restoring it in `finally` prevents the browser's scroll-anchoring from jumping the page mid-stitch.

6. **Content scripts have a double-injection guard.** `window.__WEBTOON_PANEL_CUTTER_CONTENT_LOADED__` in `content.js`, `window.WebtoonPanelCutterOverlay` in `overlay.js`, `window.WebtoonPanelCutterCropper` in `cropper.js`. All three are needed because `background.js` re-injects scripts via `ensureContentScripts` when mode is activated.

---

## Adding a new mode (checklist)

1. Add the mode string to `MODES` in `background.js` and `content.js`.
2. Add a `<button data-mode="...">` in `popup.html` and a `describeMode` case in `popup.js`.
3. Add `state.<mode>[]` collection and `reset<Mode>State()` in `content.js`.
4. Add a handler function with an explicit `if (state.mode !== "<mode>") return` guard.
5. Add a `case "<mode>":` in the `handleContextMenu` switch (and/or mousedown/up if needed).
6. Add a `run<Mode>End()` function that iterates the queue and calls `openPreviewPopup`.
7. Add an `update<EndButton>` count entry in the `counts` object in `updateEndButton`.
8. Add a capture function in `cropper.js` if none of the three existing ones fit.
9. Add overlay primitives in `overlay.js` and styles in `styles.css`.
10. Add all new overlay selectors to `OVERLAY_SELECTORS` in `cropper.js`.
11. Add `reset<Mode>State()` call in `resetAll()`.
12. Update this file and `README.md`.
