// EGGlogU Security Module — Auth, hashing, PIN management
// SHA-256 with per-user salts, rate limiting, session management

import { Bus } from './bus.js';

const AUTH_KEY = 'egglogu_auth';
const AUTH_SESSION = 'egglogu_session';

/**
 * Hash a password with SHA-256 + random salt.
 * If salt is not provided, generates a new one.
 */
export async function hashPassword(pwd, salt) {
  if (!salt) {
    salt = crypto.getRandomValues(new Uint8Array(16));
    salt = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const enc = new TextEncoder().encode(salt + pwd);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return { hash, salt };
}

/**
 * Hash a PIN (same as password hashing).
 */
export async function hashPin(pin, salt) {
  return hashPassword(pin, salt);
}

/**
 * Verify a PIN against stored hash+salt.
 */
export async function verifyPinHash(pin, storedHash, storedSalt) {
  if (!storedHash || !storedSalt) return false;
  const { hash } = await hashPin(pin, storedSalt);
  return hash === storedHash;
}

/**
 * Migrate plaintext PIN to hashed format on a user object.
 */
export async function migratePinIfNeeded(user) {
  if (user.pin && !user.pinHash) {
    const { hash, salt } = await hashPin(user.pin);
    user.pinHash = hash;
    user.pinSalt = salt;
    delete user.pin;
    return true;
  }
  return false;
}

// Login rate limiting
const loginAttempts = { count: 0, lockUntil: 0 };
const pinAttempts = { count: 0, lockUntil: 0 };
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_DURATION = 5 * 60 * 1000;

export function isPinLocked() { return Date.now() < pinAttempts.lockUntil; }
export function pinLockRemaining() { return Math.max(0, pinAttempts.lockUntil - Date.now()); }
export function recordPinFailure() {
  pinAttempts.count++;
  if (pinAttempts.count >= PIN_MAX_ATTEMPTS) {
    pinAttempts.lockUntil = Date.now() + PIN_LOCK_DURATION;
    pinAttempts.count = 0;
  }
}
export function resetPinAttempts() { pinAttempts.count = 0; pinAttempts.lockUntil = 0; }

export function getLoginAttempts() { return loginAttempts; }
export function recordLoginFailure() {
  loginAttempts.count++;
  if (loginAttempts.count >= 5) {
    loginAttempts.lockUntil = Date.now() + 5 * 60000;
    loginAttempts.count = 0;
  }
}
export function resetLoginAttempts() { loginAttempts.count = 0; }
export function isLoginLocked() { return Date.now() < loginAttempts.lockUntil; }

/**
 * Check if this is the first run (no local auth, no API token).
 */
export function isFirstRun(apiService) {
  return !localStorage.getItem(AUTH_KEY) && !apiService.isLoggedIn();
}

/**
 * Check if user is currently authenticated.
 */
export function isAuthenticated(apiService) {
  return apiService.isLoggedIn() || sessionStorage.getItem(AUTH_SESSION) === 'true';
}

export { AUTH_KEY, AUTH_SESSION };
