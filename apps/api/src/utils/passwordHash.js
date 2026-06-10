import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEYLEN = 64;

export function hashPassword(password) {
  const normalized = String(password || '');
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(normalized, salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, storedHash) {
  try {
    const normalized = String(password || '');
    const [algo, salt, expectedHex] = String(storedHash || '').split('$');

    if (algo !== 'scrypt' || !salt || !expectedHex) return false;

    const actual = scryptSync(normalized, salt, KEYLEN);
    const expected = Buffer.from(expectedHex, 'hex');

    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}