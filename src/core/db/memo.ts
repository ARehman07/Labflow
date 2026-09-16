import { cache } from 'react';

/**
 * Memoize a lookup for the length of one request.
 *
 * React's `cache` is how Next dedupes work inside a single server request, and
 * it exists only inside the framework's server runtime. A plain `tsx scripts/…`
 * run has no request to scope to and no `cache` to call, so there the function
 * is simply called through: correct, just not deduped. Without this guard those
 * scripts crash on import with "cache is not a function".
 */
export const perRequest: <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => R =
  typeof cache === 'function' ? cache : (fn) => fn;
