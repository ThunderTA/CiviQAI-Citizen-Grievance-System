/**
 * Password reset tokens.
 *
 * The token is a 256-bit random value. Only its SHA-256 hash is stored, so a
 * database leak yields no working reset links — the same reasoning that
 * applies to the password itself. No HMAC secret is needed: the token has full
 * entropy, unlike a password, so a plain hash is not brute-forceable.
 */
import crypto from 'crypto';

const TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 60);

export const RESET_TTL_MINUTES = TTL_MINUTES;

export const createResetToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
  };
};

export const hashResetToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

/** The link a user clicks. The token travels in the URL, never the password. */
export const buildResetUrl = (token) => {
  const base = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
};
