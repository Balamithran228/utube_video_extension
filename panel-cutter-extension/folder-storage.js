// Persists a chosen FileSystemDirectoryHandle across popup sessions and the
// preview window. Directory handles are structured-cloneable in Chrome, so they
// survive in IndexedDB. Permission must still be re-checked on each new session
// because Chrome scopes filesystem permissions per page lifetime.

(() => {
  const DB_NAME = "panel-cutter";
  const DB_VERSION = 1;
  const STORE = "handles";
  const KEY = "saveFolder";

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Unable to open folder storage."));
    });
  }

  async function withStore(mode, callback) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let result;
        Promise.resolve(callback(store))
          .then((value) => {
            result = value;
          })
          .catch(reject);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Folder storage transaction aborted."));
      });
    } finally {
      db.close();
    }
  }

  async function saveHandle(handle) {
    return withStore("readwrite", (store) => {
      store.put(handle, KEY);
    });
  }

  async function loadHandle() {
    return withStore("readonly", (store) => {
      return new Promise((resolve, reject) => {
        const request = store.get(KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    });
  }

  async function clearHandle() {
    return withStore("readwrite", (store) => {
      store.delete(KEY);
    });
  }

  async function ensurePermission(handle, mode = "readwrite") {
    if (!handle) {
      return false;
    }

    const options = { mode };
    if (typeof handle.queryPermission === "function") {
      const status = await handle.queryPermission(options);
      if (status === "granted") {
        return true;
      }
    }

    if (typeof handle.requestPermission === "function") {
      const status = await handle.requestPermission(options);
      return status === "granted";
    }

    return false;
  }

  async function pickAndSaveFolder() {
    if (!("showDirectoryPicker" in window)) {
      throw new Error("This browser does not support folder selection. Use the latest Chrome.");
    }

    const handle = await window.showDirectoryPicker({ mode: "readwrite" });

    await saveHandle(handle);
    return handle;
  }

  async function getReadyHandle() {
    const handle = await loadHandle();
    if (!handle) {
      return null;
    }

    const ok = await ensurePermission(handle);
    return ok ? handle : null;
  }

  window.PanelCutterFolderStorage = {
    pickAndSaveFolder,
    saveHandle,
    loadHandle,
    clearHandle,
    ensurePermission,
    getReadyHandle
  };
})();
