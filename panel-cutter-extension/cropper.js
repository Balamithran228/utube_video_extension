(() => {
  if (window.WebtoonPanelCutterCropper) {
    return;
  }

  const MESSAGE_TYPES = {
    CAPTURE_VISIBLE_TAB: "PANEL_CUTTER_CAPTURE_VISIBLE_TAB",
    DOWNLOAD_IMAGE: "PANEL_CUTTER_DOWNLOAD_IMAGE"
  };

  const WAIT_AFTER_SCROLL_MS = 450;
  const OVERLAY_SELECTORS = [
    "#webtoon-panel-cutter-root",
    ".webtoon-panel-cutter-toggle",
    ".webtoon-panel-cutter-end",
    ".webtoon-panel-cutter-line",
    ".webtoon-panel-cutter-highlight",
    ".webtoon-panel-cutter-box",
    ".webtoon-panel-cutter-section-marker",
    ".webtoon-panel-cutter-rubberband",
    ".webtoon-panel-cutter-status"
  ];

  async function capturePageRegion({ top, bottom }) {
    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;
    const originalOverflowAnchor = document.documentElement.style.overflowAnchor;
    const regionTop = clamp(top, 0, getDocumentHeight());
    const regionBottom = clamp(bottom, 0, getDocumentHeight());
    const regionHeight = Math.max(1, regionBottom - regionTop);
    const captureWidthCss = Math.max(1, document.documentElement.clientWidth || window.innerWidth || 1);
    const dpr = window.devicePixelRatio || 1;

    document.documentElement.style.overflowAnchor = "none";

    try {
      return await withCaptureUiHidden(async () => {
        const segments = await captureSegments(regionTop, regionBottom, captureWidthCss, dpr);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = Math.max(1, Math.round(captureWidthCss * dpr));
        canvas.height = Math.max(1, Math.round(regionHeight * dpr));

        for (const segment of segments) {
          ctx.drawImage(
            segment.image,
            segment.sourceX,
            segment.sourceY,
            segment.sourceWidth,
            segment.sourceHeight,
            0,
            segment.destinationY,
            segment.sourceWidth,
            segment.sourceHeight
          );
        }

        return {
          dataUrl: canvas.toDataURL("image/png"),
          width: canvas.width,
          height: canvas.height
        };
      });
    } finally {
      window.scrollTo(originalScrollX, originalScrollY);
      document.documentElement.style.overflowAnchor = originalOverflowAnchor;
    }
  }

  async function captureBox({ left, top, right, bottom }) {
    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;
    const originalOverflowAnchor = document.documentElement.style.overflowAnchor;
    const docHeight = getDocumentHeight();
    const docWidth = getDocumentWidth();
    const regionLeft = clamp(left, 0, docWidth);
    const regionRight = clamp(right, 0, docWidth);
    const regionTop = clamp(top, 0, docHeight);
    const regionBottom = clamp(bottom, 0, docHeight);
    const regionWidth = Math.max(1, regionRight - regionLeft);
    const regionHeight = Math.max(1, regionBottom - regionTop);
    const dpr = window.devicePixelRatio || 1;

    document.documentElement.style.overflowAnchor = "none";

    try {
      return await withCaptureUiHidden(async () => {
        const segments = await captureBoxSegments(regionLeft, regionRight, regionTop, regionBottom);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = Math.max(1, Math.round(regionWidth * dpr));
        canvas.height = Math.max(1, Math.round(regionHeight * dpr));

        for (const segment of segments) {
          ctx.drawImage(
            segment.image,
            segment.sourceX,
            segment.sourceY,
            segment.sourceWidth,
            segment.sourceHeight,
            segment.destinationX,
            segment.destinationY,
            segment.sourceWidth,
            segment.sourceHeight
          );
        }

        return {
          dataUrl: canvas.toDataURL("image/png"),
          width: canvas.width,
          height: canvas.height
        };
      });
    } finally {
      window.scrollTo(originalScrollX, originalScrollY);
      document.documentElement.style.overflowAnchor = originalOverflowAnchor;
    }
  }

  async function captureViewportAt(scrollY) {
    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;
    const originalOverflowAnchor = document.documentElement.style.overflowAnchor;
    const maxScrollY = Math.max(0, getDocumentHeight() - Math.max(1, window.innerHeight));
    const desiredScrollY = clamp(scrollY, 0, maxScrollY);

    document.documentElement.style.overflowAnchor = "none";

    try {
      return await withCaptureUiHidden(async () => {
        window.scrollTo(0, desiredScrollY);
        await waitForScrollToSettle();
        const dataUrl = await requestVisibleTabCapture();
        const image = await loadImage(dataUrl);
        return {
          dataUrl,
          width: image.naturalWidth,
          height: image.naturalHeight
        };
      });
    } finally {
      window.scrollTo(originalScrollX, originalScrollY);
      document.documentElement.style.overflowAnchor = originalOverflowAnchor;
    }
  }

  async function captureSegments(regionTop, regionBottom, captureWidthCss, dpr) {
    const segments = [];
    const viewportHeight = Math.max(1, window.innerHeight);
    const maxScrollY = Math.max(0, getDocumentHeight() - viewportHeight);
    let nextTop = regionTop;

    while (nextTop < regionBottom) {
      const desiredScrollY = clamp(nextTop, 0, maxScrollY);
      window.scrollTo(0, desiredScrollY);
      await waitForScrollToSettle();

      const actualScrollY = window.scrollY;
      const visibleTop = Math.max(nextTop, actualScrollY);
      const visibleBottom = Math.min(regionBottom, actualScrollY + viewportHeight);

      if (visibleBottom <= visibleTop) {
        throw new Error("Unable to bring selected region into the visible viewport.");
      }

      const dataUrl = await requestVisibleTabCapture();
      const image = await loadImage(dataUrl);
      const scaleX = image.naturalWidth / Math.max(1, window.innerWidth);
      const scaleY = image.naturalHeight / Math.max(1, window.innerHeight);

      const sourceY = Math.round((visibleTop - actualScrollY) * scaleY);
      const sourceHeight = Math.round((visibleBottom - visibleTop) * scaleY);
      const sourceWidth = Math.min(
        image.naturalWidth,
        Math.round(captureWidthCss * scaleX)
      );

      segments.push({
        image,
        sourceX: 0,
        sourceY,
        sourceWidth,
        sourceHeight,
        destinationY: Math.round((visibleTop - regionTop) * dpr)
      });

      nextTop = visibleBottom;
    }

    return segments;
  }

  async function captureBoxSegments(regionLeft, regionRight, regionTop, regionBottom) {
    const segments = [];
    const viewportHeight = Math.max(1, window.innerHeight);
    const viewportWidth = Math.max(1, window.innerWidth);
    const maxScrollY = Math.max(0, getDocumentHeight() - viewportHeight);
    const dpr = window.devicePixelRatio || 1;
    let nextTop = regionTop;

    while (nextTop < regionBottom) {
      const desiredScrollY = clamp(nextTop, 0, maxScrollY);
      window.scrollTo(0, desiredScrollY);
      await waitForScrollToSettle();

      const actualScrollY = window.scrollY;
      const visibleTop = Math.max(nextTop, actualScrollY);
      const visibleBottom = Math.min(regionBottom, actualScrollY + viewportHeight);

      if (visibleBottom <= visibleTop) {
        throw new Error("Unable to bring selected region into the visible viewport.");
      }

      const dataUrl = await requestVisibleTabCapture();
      const image = await loadImage(dataUrl);
      const scaleX = image.naturalWidth / viewportWidth;
      const scaleY = image.naturalHeight / viewportHeight;

      const sourceX = Math.round(regionLeft * scaleX);
      const sourceY = Math.round((visibleTop - actualScrollY) * scaleY);
      const sourceWidth = Math.round((regionRight - regionLeft) * scaleX);
      const sourceHeight = Math.round((visibleBottom - visibleTop) * scaleY);

      segments.push({
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        destinationX: 0,
        destinationY: Math.round((visibleTop - regionTop) * dpr)
      });

      nextTop = visibleBottom;
    }

    return segments;
  }

  async function requestVisibleTabCapture() {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.CAPTURE_VISIBLE_TAB
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Chrome could not capture the visible tab.");
    }

    return response.dataUrl;
  }

  async function downloadDataUrl(dataUrl, filename) {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.DOWNLOAD_IMAGE,
      dataUrl,
      filename
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Chrome could not download the cropped image.");
    }

    return response.downloadId;
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to load captured screenshot."));
      image.src = dataUrl;
    });
  }

  async function withCaptureUiHidden(callback) {
    const elements = OVERLAY_SELECTORS.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const previousVisibility = elements.map((element) => element.style.visibility);
    const previousDisplay = elements.map((element) => element.style.display);

    for (const element of elements) {
      element.style.visibility = "hidden";
      element.style.display = "none";
    }

    const stickySnapshot = hideFixedAndStickyElements();

    try {
      document.documentElement.classList.add("webtoon-panel-cutter-capturing");
      document.body?.classList.add("webtoon-panel-cutter-capturing");
      await nextFrame();
      return await callback();
    } finally {
      restoreFixedAndStickyElements(stickySnapshot);
      elements.forEach((element, index) => {
        element.style.visibility = previousVisibility[index];
        element.style.display = previousDisplay[index];
      });
      document.documentElement.classList.remove("webtoon-panel-cutter-capturing");
      document.body?.classList.remove("webtoon-panel-cutter-capturing");
    }
  }

  function hideFixedAndStickyElements() {
    const snapshot = [];
    const all = document.body ? document.body.querySelectorAll("*") : [];

    for (const element of all) {
      if (element.id === "webtoon-panel-cutter-root" ||
          element.closest("#webtoon-panel-cutter-root")) {
        continue;
      }

      const computed = getComputedStyle(element);
      if (computed.position === "fixed" || computed.position === "sticky") {
        snapshot.push({ element, prev: element.style.visibility });
        element.style.visibility = "hidden";
      }
    }

    return snapshot;
  }

  function restoreFixedAndStickyElements(snapshot) {
    for (const { element, prev } of snapshot) {
      element.style.visibility = prev;
    }
  }

  function waitForScrollToSettle() {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }, WAIT_AFTER_SCROLL_MS);
    });
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function getDocumentHeight() {
    return Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0,
      document.documentElement.offsetHeight,
      document.body?.offsetHeight || 0
    );
  }

  function getDocumentWidth() {
    return Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth || 0,
      document.documentElement.offsetWidth,
      document.body?.offsetWidth || 0,
      document.documentElement.clientWidth || 0,
      window.innerWidth || 0
    );
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  window.WebtoonPanelCutterCropper = {
    capturePageRegion,
    captureBox,
    captureViewportAt,
    downloadDataUrl
  };
})();
