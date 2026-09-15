import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { platformKey, readPlatformToken, signPlatformToken, PLATFORM_SESSION_MS } from '../token';
import { parsePlatformAdmins, verifyPlatformAdmin } from '../admins';
import { LAB_CODE, tempPassword } from '../../../modules/platform/rules';

const key = platformKey('a-test-secret-that-is-long-enough');

describe('platform session token', () => {
  it('reads back the admin it was signed for', () => {
    expect(readPlatformToken(signPlatformToken('alice', key), key)).toBe('alice');
  });

  it('rejects a token signed with another key', () => {
    const other = platformKey('a-different-secret-also-long-enough');
    expect(readPlatformToken(signPlatformToken('alice', other), key)).toBeNull();
  });

  it('rejects an altered token', () => {
    const [, sig] = signPlatformToken('alice', key).split('.');
    const forged = Buffer.from(JSON.stringify({ a: 'mallory', e: Date.now() + 1e9 })).toString('base64url');
    expect(readPlatformToken(`${forged}.${sig}`, key)).toBeNull();
  });

  it('rejects an expired token', () => {
    const t = signPlatformToken('alice', key, Date.now() - PLATFORM_SESSION_MS - 1000);
    expect(readPlatformToken(t, key)).toBeNull();
  });

  it('needs a real secret', () => {
    expect(() => platformKey('short')).toThrow();
  });
});

describe('platform admins', () => {
  const hash = bcrypt.hashSync('correct horse battery', 4);
  const raw = `Alice:${Buffer.from(hash).toString('base64')},bob:${hash},broken-entry,eve:not-a-hash`;

  it('reads base64 and raw hashes and drops bad entries', () => {
    const admins = parsePlatformAdmins(raw);
    expect([...admins.keys()].sort()).toEqual(['alice', 'bob']);
  });

  it('accepts the right password and refuses the wrong one or an unknown admin', async () => {
    expect(await verifyPlatformAdmin('alice', 'correct horse battery', raw)).toBe('alice');
    expect(await verifyPlatformAdmin('alice', 'wrong', raw)).toBeNull();
    expect(await verifyPlatformAdmin('eve', 'correct horse battery', raw)).toBeNull();
  });
});

describe('lab rules', () => {
  it('allows short lowercase lab codes only', () => {
    for (const ok of ['city-lab', 'arfa2', 'abc']) expect(LAB_CODE.test(ok)).toBe(true);
    for (const bad of ['ab', 'City', '-lab', 'lab-', 'lab code', 'x'.repeat(31)]) expect(LAB_CODE.test(bad)).toBe(false);
  });

  it('makes one-time passwords without look-alike characters', () => {
    const p = tempPassword();
    expect(p).toHaveLength(10);
    expect(p).not.toMatch(/[0O1lI]/u);
  });
});
