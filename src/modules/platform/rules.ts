import { randomInt } from 'node:crypto';

/** What staff type as the lab code at sign-in: 3–30 lowercase letters, numbers or inner hyphens. */
export const LAB_CODE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/u;

/** Codes that would read as part of LabFlow itself rather than a lab. */
export const RESERVED_CODES = new Set(['platform', 'admin', 'api', 'login', 'portal', 'labflow', 'support', 'www']);

/** A one-time password that can be read out over the phone: no 0/O or 1/l/I. */
export function tempPassword(length = 10): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length }, () => chars[randomInt(chars.length)]).join('');
}
