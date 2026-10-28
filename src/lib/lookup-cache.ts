// In-memory cache for vehicle lookups (VIN decode, EPA menus/MPG) for this app session.
// Switching between units or re-opening a saved customer reuses earlier answers
// instead of calling NHTSA / fueleconomy.gov again. Cleared on page reload.

const MAX_ENTRIES = 300;

export interface LookupCache {
  /** Run `load` once per key; later calls (even in flight) share the same result. */
  get<T>(key: string, load: () => Promise<T>, keep?: (value: T) => boolean): Promise<T>;
  has(key: string): boolean;
  clear(): void;
  readonly size: number;
}

export function createLookupCache(max = MAX_ENTRIES): LookupCache {
  const map = new Map<string, Promise<unknown>>();
  return {
    get<T>(key: string, load: () => Promise<T>, keep: (value: T) => boolean = () => true) {
      const hit = map.get(key) as Promise<T> | undefined;
      if (hit) {
        // Refresh recency so busy keys aren't evicted first.
        map.delete(key);
        map.set(key, hit);
        return hit;
      }
      const p = load().then(
        (value) => {
          if (!keep(value)) map.delete(key); // don't remember failed / empty answers
          return value;
        },
        (err: unknown) => {
          map.delete(key);
          throw err;
        },
      );
      map.set(key, p);
      while (map.size > max) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
      return p;
    },
    has: (key) => map.has(key),
    clear: () => map.clear(),
    get size() {
      return map.size;
    },
  };
}

/** Shared by the proposed-unit lookup and the customer's current-car lookup. */
export const vehicleLookupCache = createLookupCache();
