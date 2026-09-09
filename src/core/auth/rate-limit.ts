/**
 * Minimal in-memory login throttle: after too many failures for a username the
 * account is locked out for a cooldown window. For a multi-instance deployment
 * move this to Redis; it closes the brute-force item from ../../vulnerabilities.md (C-4).
 */
type Entry = { fails: number; lockedUntil: number };
const store = new Map<string, Entry>();

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60_000;

export function isLockedOut(key: string): boolean {
  const e = store.get(key);
  return !!e && e.lockedUntil > Date.now();
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const e = store.get(key) ?? { fails: 0, lockedUntil: 0 };
  e.fails += 1;
  if (e.fails >= MAX_FAILS) {
    e.lockedUntil = now + WINDOW_MS;
    e.fails = 0;
  }
  store.set(key, e);
}

export function recordSuccess(key: string): void {
  store.delete(key);
}
