// Short-lived read cache with in-flight dedup for the backend client's GET
// calls. Every tab loads team, roster, rules, and games on mount and again on
// focus, so without this the same resources are fetched several times per
// navigation. Mutations invalidate the keys they touch, so a stale read lasts
// at most STALE_MS after a change made outside this app.
const STALE_MS = 30_000;

type Entry = { value: unknown; fetchedAt: number };

const entries = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

export const cachedRead = <T>(key: string, fetcher: () => Promise<T>): Promise<T> => {
  const hit = entries.get(key);
  if (hit && Date.now() - hit.fetchedAt < STALE_MS) {
    return Promise.resolve(hit.value as T);
  }

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const request = fetcher()
    .then((value) => {
      entries.set(key, { value, fetchedAt: Date.now() });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
};

export const invalidateReads = (prefix: string) => {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
};

export const clearReads = () => {
  entries.clear();
};
