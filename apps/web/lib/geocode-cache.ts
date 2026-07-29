interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const MAX_ENTRIES = 500;
const TTL_MS = 5 * 60 * 1000;

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  // Delete + re-set moves this key to the end of the Map's insertion-order
  // iteration, which is what makes "the first key" in setCached below the
  // least-recently-used one — no separate LRU data structure needed.
  store.delete(key);
  store.set(key, entry);
  return entry.value as T;
}

export function setCached<T>(key: string, value: T): void {
  if (store.size >= MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) store.delete(oldestKey);
  }
  store.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

export function normalizeCacheKey(raw: string): string {
  return raw.trim().toLowerCase();
}
