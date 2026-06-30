/* storage.js
 * IndexedDB wrapper (with localStorage fallback) for Vanguard Specs.
 * Stores parsed product records and sync metadata.
 */

const DB_NAME = 'vanguard-specs-db';
const DB_VERSION = 1;
const STORE_PRODUCTS = 'products';
const STORE_META = 'meta';
const LS_PRODUCTS_KEY = 'vs_products_fallback';
const LS_META_KEY = 'vs_meta_fallback';

let dbPromise = null;
let useFallback = false;

function openDB() {
  if (dbPromise) return dbPromise;

  if (!('indexedDB' in window)) {
    useFallback = true;
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }

  dbPromise = new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
        const store = db.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
        store.createIndex('manufacturer', 'manufacturer', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => {
      useFallback = true;
      resolve(null);
    };
  });

  return dbPromise;
}

async function saveProducts(products) {
  if (useFallback || !('indexedDB' in window)) {
    try {
      localStorage.setItem(LS_PRODUCTS_KEY, JSON.stringify(products));
      return true;
    } catch (err) {
      console.error('localStorage save failed', err);
      return false;
    }
  }

  const db = await openDB();
  if (!db) {
    try {
      localStorage.setItem(LS_PRODUCTS_KEY, JSON.stringify(products));
      return true;
    } catch (err) {
      return false;
    }
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
    const store = tx.objectStore(STORE_PRODUCTS);
    store.clear();
    products.forEach((p) => store.put(p));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

async function getProducts() {
  if (useFallback || !('indexedDB' in window)) {
    const raw = localStorage.getItem(LS_PRODUCTS_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  const db = await openDB();
  if (!db) {
    const raw = localStorage.getItem(LS_PRODUCTS_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_PRODUCTS, 'readonly');
    const store = tx.objectStore(STORE_PRODUCTS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function setMeta(key, value) {
  if (useFallback || !('indexedDB' in window)) {
    const raw = localStorage.getItem(LS_META_KEY);
    const meta = raw ? JSON.parse(raw) : {};
    meta[key] = value;
    localStorage.setItem(LS_META_KEY, JSON.stringify(meta));
    return true;
  }

  const db = await openDB();
  if (!db) {
    const raw = localStorage.getItem(LS_META_KEY);
    const meta = raw ? JSON.parse(raw) : {};
    meta[key] = value;
    localStorage.setItem(LS_META_KEY, JSON.stringify(meta));
    return true;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put({ key, value });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

async function getMeta(key) {
  if (useFallback || !('indexedDB' in window)) {
    const raw = localStorage.getItem(LS_META_KEY);
    const meta = raw ? JSON.parse(raw) : {};
    return meta[key];
  }

  const db = await openDB();
  if (!db) {
    const raw = localStorage.getItem(LS_META_KEY);
    const meta = raw ? JSON.parse(raw) : {};
    return meta[key];
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
    req.onerror = () => resolve(undefined);
  });
}

window.VSStorage = {
  saveProducts,
  getProducts,
  setMeta,
  getMeta,
};
