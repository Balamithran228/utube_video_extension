# Webtoon Panel Cutter

A Manifest V3 Chrome/Brave extension for capturing regions of long-scroll comic, manga, and webtoon pages and saving them as numbered PNG files.

For the full architecture reference see [CONTEXT.md](CONTEXT.md).

---

## Features at a glance

| Feature | Detail |
|---|---|
| **3 capture modes** | Cutter, Box, Section — only one active at a time |
| **Auto-save to Downloads** | Each run creates `mode-YYYYMMDD-HHmmss/` inside Downloads — no folder picker needed |
| **Preview gallery** | Thumbnail grid before saving — delete unwanted panels, view full-size |
| **Full-size modal viewer** | Click any thumbnail; navigate with ←/→ or keyboard arrows |
| **Save All / Save Trimmed** | Save raw PNGs or auto-trim horizontal whitespace |
| **Multi-segment stitching** | Tall regions taller than the viewport are auto-stitched from multiple screenshots |
| **Scrollbar hidden during capture** | Clean output — no browser chrome or scrollbar in images |
| **Site nav bars stripped during capture** | Sticky/fixed-position elements (top nav, floating buttons, cookie banners) are auto-hidden during capture — no leftover site UI in your screenshots |
| **Ctrl+Z undo** | Remove the last placed cut / box / section bookmark at any time |
| **Mode isolation** | Cut lines, rubber-band boxes, and green section bands are strictly mode-specific — no visual bleed |
| **Status toasts** | Live feedback on every action; errors shown in red for 5 s |

---

## Modes

Only one mode is active at a time. Select from the popup. All three intercept right-click, which is why they are mutually exclusive.

### Cutter Mode

Slice a long page into horizontal panels using paired cut lines.

1. Select **Cutter** in the popup.
2. Right-click on the page — a **red horizontal line** appears.
3. Right-click again below it — a second line appears and a **red highlight** shows the queued panel.
4. Repeat for more panels. Each pair = one panel.
5. Click **End & Save** (the floating blue button).
6. Review the preview gallery, delete unwanted panels.
7. Click **Save All** or **Save All (Trim White Space)**.
8. Files are saved to `Downloads/cutter-YYYYMMDD-HHmmss/panel-001.png` …

> Use **Ctrl+Z** at any point to remove the last cut line.

### Box Mode

Draw arbitrary rectangles over the page and capture each one.

1. Select **Box** in the popup.
2. Right-click and **drag** to draw a rectangle — a **blue dashed rubber-band** appears while dragging.
3. Release — the rectangle is committed and shown as a **solid blue box** with a number badge.
4. Scroll, drag another box, repeat.
5. Click **End & Save**.
6. Files saved to `Downloads/box-YYYYMMDD-HHmmss/panel-001.png` …

> Boxes that span multiple viewport heights are auto-stitched. Use **Ctrl+Z** to remove the last box.

### Section Mode

Capture the full visible viewport at each bookmark. Section mode saves what is on screen immediately, so each section can use its own browser zoom or touchpad zoom level.

1. Select **Section** in the popup.
2. Scroll and zoom until the image looks right on screen.
3. Right-click anywhere, or press `Space`, to capture that current viewport. A **green highlighted band** covering the full viewport appears, numbered.
4. Scroll to the next image, change zoom if needed, and capture again.
5. Click **End & Save**.
6. Files saved to `Downloads/section-YYYYMMDD-HHmmss/panel-001.png` …

> Browser chrome (URL bar, tabs, scrollbar) is excluded automatically. The green band shows the viewport that was captured at that moment. Use **Ctrl+Z** to remove the last bookmark.

---

## Preview window

After clicking **End & Save** the extension opens a preview popup:

- **Thumbnail grid** — all captured panels shown as cards.
- **Delete** (×) button on each card — remove before saving.
- **Click any thumbnail** — opens a full-size modal viewer.
- **Modal viewer** — ← / → buttons or Arrow keys to navigate, Esc to close, click backdrop to close.
- **Save All** — write all remaining panels to Downloads as `panel-001.png`, `panel-002.png`, …
- **Save All (Trim White Space)** — same but strips solid-white or transparent columns from the left and right edges of each image before saving.
- Progress shown live (`Saving panel 3 of 12…`).
- Window closes automatically after saving.

---

## How saving works

Files are written via `chrome.downloads.download` directly into your **Downloads** folder. No folder picker is shown. Each capture run gets its own subfolder named:

```
mode-YYYYMMDD-HHmmss
```

Examples:
```
Downloads/
  cutter-20260427-143052/
    panel-001.png
    panel-002.png
  box-20260427-151230/
    panel-001.png
  section-20260427-160045/
    panel-001.png
    panel-002.png
    panel-003.png
```

> **Tip:** turn off *"Ask where to save each file before downloading"* in `chrome://settings/downloads` for uninterrupted saving.

---

## Keyboard shortcuts

| Shortcut | Windows / Linux | macOS |
|---|---|---|
| Remove last cut / box / section | `Ctrl+Z` | `⌘+Z` |
| Capture section viewport | `Space` | `Space` |
| Place cutter line at viewport center | `Space` | `Space` |
| Previous / next panel in viewer | `←` / `→` | `←` / `→` |
| Close the viewer | `Esc` | `Esc` |

---

## Capture pipeline (how tall regions are stitched)

Chrome can only screenshot the visible viewport. For regions taller than the viewport (cutter panels and tall box selections), the extension:

1. Saves the original scroll position.
2. Hides all extension UI (cut lines, badges, status toast) so they don't appear in the image.
3. Scrolls to the top of the region.
4. Takes a screenshot with `chrome.tabs.captureVisibleTab`.
5. Crops the relevant slice onto a canvas.
6. Scrolls down and repeats until the full region is covered.
7. Stitches all slices into one PNG using canvas compositing.
8. Restores scroll position.

Section mode captures are single-screenshot — one `captureVisibleTab` per bookmarked scroll position.

---

## Folder structure

```
panel-cutter-extension/
  manifest.json         — MV3 manifest, permissions, command shortcut
  background.js         — service worker: mode storage, capture relay, download, preview window
  content.js            — per-page dispatcher: handles right-click / drag / Ctrl+Z per mode
  overlay.js            — DOM overlay: cut lines, boxes, section bands, rubber-band, toasts, buttons
  cropper.js            — capture functions: capturePageRegion, captureBox, captureViewportAt
  folder-storage.js     — IndexedDB helper (kept for future use, not active)
  popup.html / popup.js — browser-action popup: mode selector
  preview.html          — preview window markup
  preview.js            — preview gallery, modal viewer, save logic
  preview.css           — preview window styles
  styles.css            — in-page overlay styles + popup styles
  CONTEXT.md            — architecture reference for developers
  README.md             — this file
```

---

## Setup

The extension is unpacked — you load it directly from the source folder. Same steps on Windows, macOS, and Linux.

### Windows / Linux (Chrome, Brave, Edge)

1. Open the browser.
2. Go to `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
3. Toggle **Developer mode** on (top-right corner).
4. Click **Load unpacked**.
5. Select the `panel-cutter-extension` folder.
6. Click the puzzle-piece icon in the toolbar and pin **Webtoon Panel Cutter** for quick popup access.

### macOS (Chrome, Brave, Edge)

1. Open the browser.
2. In the address bar type `chrome://extensions` (or `brave://extensions`, `edge://extensions`) and press **Return**.
3. Toggle **Developer mode** on (top-right corner).
4. Click **Load unpacked**.
5. Navigate to and select the `panel-cutter-extension` folder.
   - If your repo is in `~/Projects/utube_video_extension/`, pick `~/Projects/utube_video_extension/panel-cutter-extension/`.
6. Pin **Webtoon Panel Cutter** from the puzzle-piece icon in the toolbar.
7. The Ctrl+Z undo shortcut is automatically mapped to **⌘+Z** on macOS by the extension manifest.

### Updating the extension after pulling new code

After `git pull`, return to the extensions page and click the **circular reload** arrow on the Webtoon Panel Cutter card. You do not need to remove and re-add the extension.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| No line / box / green band appears | Check the popup — make sure the correct mode is active |
| Right-click opens the browser context menu | The page might block content scripts, or mode is Off. Chrome system pages (`chrome://`) cannot run extensions |
| Box drag does nothing | You must drag — click-and-release without movement is rejected as too small |
| Green band looks wrong | Scroll the page fully first so lazy-loaded images appear before capturing |
| Capture fails on a very tall panel | Chrome has a maximum canvas size. Try a smaller cut region |
| Files are prompted one by one | Turn off *"Ask where to save each file"* in `chrome://settings/downloads` |
| Images appear blank or white | Scroll through the full page first so all lazy images load |

---

## Known limitations

- Chrome's `captureVisibleTab` is rate-limited (~2 captures/sec). Very large capture runs slow down accordingly.
- Maximum canvas size in Chrome limits very tall stitched panels (~16 000 px tall).
- `showDirectoryPicker` (File System Access API) is not used — it is unavailable in extension popup windows and blocked by Brave. Saving uses `chrome.downloads` instead.

---

## Possible future improvements

- Drag cut lines and box edges to adjust after placement.
- Auto-detect panel gutters and suggest cut positions.
- Per-domain settings (trim widths, scroll wait time).
- Export as ZIP, PDF, or WebP/JPG with quality setting.
- Reorder panels in the preview before saving.
- Abort button to cancel an in-progress capture run.
- Persist the queue across accidental page reloads.
