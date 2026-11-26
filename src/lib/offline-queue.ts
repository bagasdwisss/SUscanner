import type { OfflineUploadJob } from "./su-types";

const DB_NAME = "su-scanner-offline-sync";
const STORE_NAME = "pending_uploads";
const DB_VERSION = 1;

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB tidak tersedia."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("Gagal membuka IndexedDB antrean offline."));
  });
}

export async function loadOfflineQueue(): Promise<OfflineUploadJob[]> {
  try {
    const db = await openOfflineDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const list = (req.result as OfflineUploadJob[]) ?? [];
        list.sort((a, b) => a.createdAt - b.createdAt);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return [];
  }
}

export async function enqueueOfflineJob(
  job: OfflineUploadJob,
): Promise<OfflineUploadJob[]> {
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(job);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
    return loadOfflineQueue();
  } catch {
    return [job];
  }
}

export async function removeOfflineJob(id: string): Promise<OfflineUploadJob[]> {
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
    return loadOfflineQueue();
  } catch {
    return [];
  }
}

export async function updateOfflineJobAttempt(
  id: string,
  lastError: string | null,
): Promise<OfflineUploadJob[]> {
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const curr = getReq.result as OfflineUploadJob | undefined;
        if (curr) {
          store.put({
            ...curr,
            attempts: (curr.attempts || 0) + 1,
            lastError,
          });
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
    return loadOfflineQueue();
  } catch {
    return [];
  }
}
