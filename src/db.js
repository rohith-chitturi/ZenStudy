const DB_NAME = 'StudentTodoDB';
const DB_VERSION = 1;
const STORE_NAME = 'appMedia';

/**
 * Initializes the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
export function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    
    request.onsuccess = (e) => {
      resolve(e.target.result);
    };
    
    request.onerror = (e) => {
      console.error('IndexedDB initialization failed:', e.target.error);
      reject(e.target.error);
    };
  });
}

/**
 * Saves a Blob in IndexedDB.
 * @param {string} key 
 * @param {Blob} blob 
 * @returns {Promise<void>}
 */
export async function saveBlob(key, blob) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(blob, key);
    
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieves a Blob from IndexedDB.
 * @param {string} key 
 * @returns {Promise<Blob|null>}
 */
export async function getBlob(key) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    
    request.onsuccess = (e) => resolve(e.target.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Deletes a Blob from IndexedDB.
 * @param {string} key 
 * @returns {Promise<void>}
 */
export async function deleteBlob(key) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(key);
    
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}
