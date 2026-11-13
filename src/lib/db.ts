// Tiny IndexedDB wrapper: projects (JSON) and media blobs are stored locally on every platform.
const DB_NAME = 'cutvid';
const STORES = ['projects', 'media'] as const;
type Store = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function run<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const dbGet = <T>(store: Store, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key));
export const dbSet = (store: Store, key: string, value: unknown) => run(store, 'readwrite', (s) => s.put(value, key));
export const dbDel = (store: Store, key: string) => run(store, 'readwrite', (s) => s.delete(key));
export const dbAll = <T>(store: Store) => run<T[]>(store, 'readonly', (s) => s.getAll());
