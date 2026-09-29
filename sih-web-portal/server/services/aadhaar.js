/**
 * Aadhaar verification — verification ONLY. The number is never persisted.
 *
 * ============================ READ THIS FIRST ============================
 * This is a SIMULATED verification flow, not real UIDAI e-KYC.
 *
 * Genuine Aadhaar authentication requires being a licensed AUA/KUA with a
 * UIDAI contract, licence keys, an HSM, and a hardware-certified biometric or
 * OTP channel. None of that can be stubbed. What this module does:
 *
 *   - validates the number is well formed, using the real Verhoeff check
 *     digit that UIDAI actually uses, so typos and made-up numbers are caught
 *   - issues a one-time code through a mock channel to demonstrate the flow
 *
 * It does NOT prove the number belongs to the person presenting it. Do not
 * present this as identity assurance. Swap `sendOtp` for a licensed provider
 * before this is used for anything real.
 * =========================================================================
 *
 * The privacy design, which IS production-shaped:
 *   - The number lives in memory for the duration of one request and is never
 *     written to MongoDB, a log line, or an error message.
 *   - The OTP session is keyed by a random id, never by the Aadhaar number,
 *     so the store cannot be walked back to a list of numbers.
 *   - Success yields a short-lived signed token asserting only "an Aadhaar was
 *     verified" — carrying no identifier at all.
 *   - The user document records a boolean and a timestamp. Nothing else.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

// --- Verhoeff checksum (the scheme UIDAI uses for the 12th digit) ----------

const D_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const P_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** True when the 12 digits satisfy the Verhoeff check digit. */
const passesVerhoeff = (digits) => {
  let c = 0;
  // The algorithm consumes the number right to left.
  const reversed = digits.split('').reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = D_TABLE[c][P_TABLE[i % 8][reversed[i]]];
  }
  return c === 0;
};

/**
 * Structural validation. Returns a reason rather than throwing, and that
 * reason NEVER echoes the number back.
 */
export const validateAadhaarFormat = (raw) => {
  const digits = String(raw || '').replace(/[\s-]/g, '');

  if (!/^\d{12}$/.test(digits)) {
    return { valid: false, reason: 'Aadhaar number must be exactly 12 digits' };
  }
  // UIDAI never issues a number beginning with 0 or 1.
  if (digits[0] === '0' || digits[0] === '1') {
    return { valid: false, reason: 'Aadhaar numbers do not begin with 0 or 1' };
  }
  if (/^(\d)\1{11}$/.test(digits)) {
    return { valid: false, reason: 'That is not a valid Aadhaar number' };
  }
  if (!passesVerhoeff(digits)) {
    return { valid: false, reason: 'Aadhaar number failed its checksum — please re-check the digits' };
  }
  return { valid: true };
};

// --- One-time-code sessions ------------------------------------------------

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
// Deliberately small: this is a demo store. A real deployment needs Redis so
// sessions survive a restart and are shared across instances.
const sessions = new Map();

const sweepExpired = () => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt < now) sessions.delete(id);
  }
};

const hashOtp = (otp, salt) =>
  crypto.createHash('sha256').update(`${salt}:${otp}`).digest('hex');

/**
 * Begin verification.
 *
 * The Aadhaar number is used here and then goes out of scope. It is not
 * returned, stored, or included in the session record.
 */
export const requestOtp = (rawAadhaar) => {
  sweepExpired();

  const check = validateAadhaarFormat(rawAadhaar);
  if (!check.valid) return { ok: false, error: check.reason };

  const verificationId = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  // 6 digits, uniform, from a CSPRNG.
  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

  sessions.set(verificationId, {
    // No Aadhaar-derived value is kept — not the number, not a hash of it.
    otpHash: hashOtp(otp, salt),
    salt,
    attempts: 0,
    verified: false,
    expiresAt: Date.now() + OTP_TTL_MS,
  });

  return { ok: true, verificationId, otp, expiresInSeconds: OTP_TTL_MS / 1000 };
};

/** Check a code and, on success, mint a short-lived proof-of-verification. */
export const verifyOtp = (verificationId, submittedOtp) => {
  sweepExpired();

  const session = sessions.get(verificationId);
  if (!session) {
    return { ok: false, error: 'This verification has expired. Please start again.' };
  }
  if (session.attempts >= MAX_ATTEMPTS) {
    sessions.delete(verificationId);
    return { ok: false, error: 'Too many incorrect attempts. Please start again.' };
  }

  session.attempts += 1;

  const expected = Buffer.from(session.otpHash);
  const actual = Buffer.from(hashOtp(String(submittedOtp || ''), session.salt));
  // Constant-time compare so response timing cannot leak the code.
  const matches =
    expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

  if (!matches) {
    return {
      ok: false,
      error: 'Incorrect code',
      attemptsRemaining: MAX_ATTEMPTS - session.attempts,
    };
  }

  // Single use.
  sessions.delete(verificationId);
  return { ok: true, token: signAadhaarToken() };
};

// --- Proof of verification -------------------------------------------------

const AADHAAR_TOKEN_TTL = '10m';

const secret = () =>
  process.env.JWT_SECRET || 'dev-only-insecure-secret-do-not-deploy';

/**
 * Asserts only that *an* Aadhaar passed verification in this session. It
 * carries no identifier, so even if intercepted it discloses nothing about
 * which Aadhaar was used.
 */
const signAadhaarToken = () =>
  jwt.sign({ purpose: 'aadhaar_verified' }, secret(), { expiresIn: AADHAAR_TOKEN_TTL });

export const consumeAadhaarToken = (token) => {
  if (!token) return false;
  try {
    return jwt.verify(token, secret()).purpose === 'aadhaar_verified';
  } catch {
    return false;
  }
};

/** Exposed for tests. */
export const _internals = { passesVerhoeff, sessions };
