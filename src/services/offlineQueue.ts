import { API_URL } from "@/services/api";

/**
 * Çevrimdışıyken yapılan yazma istekleri burada (IndexedDB) bekler.
 *
 * Redux persist yalnızca "bekleyen kayıt var mı" bilgisini tutar; isteğin
 * kendisi IndexedDB'de durduğu için sayfa yenilense ya da tarayıcı kapansa da
 * değişiklik kaybolmaz. Aynı anahtarla (ör. `routine:2026-11-18`) yeni bir
 * kayıt gelirse eskisinin üzerine yazılır; böylece kuyruk şişmez.
 */

const DB_NAME = "adaptime-offline";
const DB_VERSION = 1;
const STORE = "writes";

export interface QueuedWrite {
  key: string;
  endpoint: string;
  method: string;
  body: unknown;
  token: string;
  at: number;
  attempts: number;
}

function supported(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  if (!supported()) return undefined;
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result: T | undefined;
      const request = run(store);
      if (request) request.onsuccess = () => (result = request.result);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function enqueueWrite(
  write: Omit<QueuedWrite, "at" | "attempts"> & { at?: number },
): Promise<void> {
  try {
    await withStore("readwrite", (store) =>
      store.put({
        ...write,
        at: write.at ?? Date.now(),
        attempts: 0,
      } as QueuedWrite),
    );
  } catch {
    /* IndexedDB kapalı (gizli sekme, kota): Redux retry devrede kalır. */
  }
}

export async function dequeueWrite(key: string): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(key));
  } catch {
    /* yoksay */
  }
}

export async function queuedWrites(): Promise<QueuedWrite[]> {
  try {
    const rows = await withStore<QueuedWrite[]>("readonly", (store) =>
      store.getAll(),
    );
    return (rows ?? []).sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

export async function queuedWriteCount(): Promise<number> {
  return (await queuedWrites()).length;
}

/**
 * Kuyruğu sırayla gönderir. Ağ hatasında durur (kalanlar sonraki denemeye
 * kalır); sunucunun kalıcı reddettiği (4xx) istekler kuyruktan çıkarılır ki
 * sonsuza kadar tekrar denemesin.
 */
export async function flushWrites(): Promise<{
  sent: number;
  failed: number;
  remaining: number;
}> {
  const rows = await queuedWrites();
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const res = await fetch(`${API_URL}${row.endpoint}`, {
        method: row.method,
        headers: {
          "Content-Type": "application/json",
          ...(row.token ? { Authorization: `Bearer ${row.token}` } : {}),
        },
        body: row.body === undefined ? undefined : JSON.stringify(row.body),
        cache: "no-store",
      });

      if (res.ok || (res.status >= 400 && res.status < 500)) {
        // 409 dahil: kullanıcı karar verene kadar tekrar denemek anlamsız.
        await dequeueWrite(row.key);
        if (res.ok) sent += 1;
        else failed += 1;
        continue;
      }
      // 5xx: sunucu geçici olarak sorunlu, kuyrukta kalsın.
      break;
    } catch {
      // Ağ yok: kuyruğu olduğu gibi bırak.
      break;
    }
  }

  return { sent, failed, remaining: (await queuedWrites()).length };
}
