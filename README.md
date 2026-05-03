# utube_video_extension

A browser extension toolkit for capturing regions of long-scroll content (manga, webtoons, comics) and saving them as numbered PNG files.

The active project in this repo is **Webtoon Panel Cutter** — a Manifest V3 Chrome / Brave / Edge extension with three capture modes (Cutter, Box, Section), an in-page overlay system, multi-segment screenshot stitching, and a preview gallery with full-size modal viewer.

> The repo is named `utube_video_extension` for historical reasons; the shipped extension is the panel cutter, not a YouTube tool.

---

## Repo layout

```
utube_video_extension/
├── README.md                  ← you are here
├── .gitignore
└── panel-cutter-extension/    ← the actual Chrome extension (load this folder unpacked)
    ├── manifest.json
    ├── background.js
    ├── content.js
    ├── overlay.js
    ├── cropper.js
    ├── popup.html / popup.js
    ├── preview.html / preview.js / preview.css
    ├── styles.css
    ├── folder-storage.js
    ├── README.md              ← user guide + setup
    └── CONTEXT.md             ← architecture reference
```

---

## Quick start

### macOS

```bash
git clone https://github.com/Balamithran228/utube_video_extension.git
cd utube_video_extension
```

Then in Chrome / Brave / Edge:

1. Open `chrome://extensions` (or `brave://extensions`).
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Pick the `panel-cutter-extension/` folder inside the cloned repo.
5. Pin the extension via the puzzle-piece icon.

### Windows / Linux

```powershell
git clone https://github.com/Balamithran228/utube_video_extension.git
cd utube_video_extension
```

Same browser steps as macOS — the path-picker uses your file browser.

For the full feature list, mode descriptions, keyboard shortcuts, and troubleshooting, see [panel-cutter-extension/README.md](panel-cutter-extension/README.md).

For architecture details (mode system, message contract, capture pipeline, platform gotchas, how to add a new mode), see [panel-cutter-extension/CONTEXT.md](panel-cutter-extension/CONTEXT.md).

---

## Features (one-line summary)

- **Cutter mode** — paired horizontal red lines slice tall pages into panels.
- **Box mode** — right-click drag a rectangle, multi-segment stitching for tall boxes.
- **Section mode** — right-click bookmarks the visible viewport at that scroll position.
- **Auto-save** to `Downloads/{mode}-{YYYYMMDD}-{HHmmss}/panel-001.png`.
- **Preview gallery** with delete, full-size modal viewer, save-all, save-with-trim.
- **Site nav bars stripped during capture** — no leftover sticky/fixed UI in screenshots.
- **Cross-platform** — Windows, macOS, Linux. `Ctrl+Z` / `⌘+Z` to undo.

---

## License

MIT — do what you want with it.
