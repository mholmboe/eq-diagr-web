// A small key-value store in the browser (IndexedDB), for the user's data files
// and database files. Everything stays in this browser; nothing is uploaded.
//   await Store.put("files", name, value); await Store.get("files", name);
//   await Store.keys("files"); await Store.remove("files", name);
(function (global) {
  const DB_NAME = "eq-diagr-web", STORES = ["files", "databases", "settings"];
  let dbPromise = null;
  function open() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) { reject(new Error("no IndexedDB in this browser")); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode), r = fn(t.objectStore(store));
      t.oncomplete = () => resolve(r && "result" in r ? r.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }
  global.Store = {
    get: (store, key) => tx(store, "readonly", s => s.get(key)),
    put: (store, key, value) => tx(store, "readwrite", s => s.put(value, key)),
    remove: (store, key) => tx(store, "readwrite", s => s.delete(key)),
    keys: async store => ((await tx(store, "readonly", s => s.getAllKeys())) || []).map(String).sort(),
  };
})(typeof window !== "undefined" ? window : globalThis);
