import type { SessionHistoryItem } from "./su-types";

const DB_NAME = "su-scanner-history";
const STORE_NAME = "exports";
const DB_VERSION = 1;
const MAX_HISTORY_ITEMS = 100;

function openHistoryDb(): Promise<IDBDatabase> {
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
    req.onerror = () => reject(req.error ?? new Error("Gagal membuka IndexedDB."));
  });
}

export async function loadSessionHistory(): Promise<SessionHistoryItem[]> {
  try {
    const db = await openHistoryDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as SessionHistoryItem[]) ?? [];
        items.sort((a, b) => b.createdAt - a.createdAt);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return [];
  }
}

export async function saveSessionHistoryItem(
  item: SessionHistoryItem,
): Promise<SessionHistoryItem[]> {
  try {
    const db = await openHistoryDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(item);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });

    const all = await loadSessionHistory();
    if (all.length > MAX_HISTORY_ITEMS) {
      const excess = all.slice(MAX_HISTORY_ITEMS);
      const db2 = await openHistoryDb();
      await new Promise<void>((resolve) => {
        const tx = db2.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        for (const old of excess) store.delete(old.id);
        tx.oncomplete = () => {
          db2.close();
          resolve();
        };
      });
      return all.slice(0, MAX_HISTORY_ITEMS);
    }
    return all;
  } catch {
    return [item];
  }
}

export async function clearSessionHistory(): Promise<void> {
  try {
    const db = await openHistoryDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Ignore storage errors silently
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
