import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Remembers a resolved setting for the length of one request, and no longer.
 *
 * Every rule the SRS requires to stay changeable is stored as data and read
 * through SettingsService, which asks the database each time it is called.
 * That is right for a rule that must be changeable, and wasteful when one
 * screen asks the same question over and over: a pupil's unit list resolves
 * twelve keys once per unit, so four units cost forty reads of the settings
 * table -- forty round trips to a database in another building.
 *
 * The cache is deliberately the smallest thing that fixes it. It lives in an
 * AsyncLocalStorage store created when a request arrives and discarded when it
 * finishes, so:
 *
 *   - a value changed in the CMS is seen by the very next request. There is no
 *     window in which the platform is running on a stale rule, which a
 *     process-wide cache with a time-to-live would have;
 *   - nothing is shared between two requests, so one school's scope chain can
 *     never answer another's;
 *   - work outside a request -- a script, a test, a background job -- simply
 *     finds no store and reads the database as before.
 *
 * The key is the setting's name together with the whole scope chain, in order,
 * because the chain is what decides which value wins. Two calls for the same
 * key with different scopes are different questions and are cached apart.
 */
const store = new AsyncLocalStorage<Map<string, unknown>>();

/** Runs `work` with a cache of its own. */
export function withSettingsCache<T>(work: () => T): T {
  return store.run(new Map(), work);
}

/**
 * The value for `key`, from this request's cache when it is already there.
 *
 * Outside a request there is no store, and `load` is simply called. The
 * promise is cached rather than the value, so two callers asking at the same
 * moment -- which is what `Promise.all` over four units does -- wait on one
 * query instead of starting four.
 */
export async function cachedSetting<T>(key: string, load: () => Promise<T>): Promise<T> {
  const cache = store.getStore();
  if (!cache) return load();

  const known = cache.get(key);
  if (known !== undefined) return known as Promise<T>;

  const pending = load();
  cache.set(key, pending);

  try {
    return await pending;
  } catch (failure) {
    // A failed read must not be remembered: the next caller in this request
    // should get a fresh attempt rather than the same rejection.
    cache.delete(key);
    throw failure;
  }
}

/** Forgets everything this request had cached, after a value is written. */
export function forgetCachedSettings(): void {
  store.getStore()?.clear();
}
