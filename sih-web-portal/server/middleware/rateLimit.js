/**
 * Fixed-window rate limiter for the authentication endpoints.
 *
 * Login and password-reset endpoints are the two places an unauthenticated
 * stranger can hammer: one for password guessing, the other to spray reset
 * mail at an address they do not own. Neither had any limit.
 *
 * In-memory, so it is per-process — good enough for a single instance and for
 * this prototype. Behind more than one instance, move the counter to Redis or
 * the limit becomes N times looser than it reads.
 */
const buckets = new Map();

// Bound the map so a flood of unique IPs cannot grow it without limit.
const MAX_TRACKED = 10_000;

const sweep = (now) => {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};

/**
 * @param {object} options
 * @param {number} options.windowMs   length of the window
 * @param {number} options.max        requests allowed per key per window
 * @param {function} [options.keyOn]  derives the bucket key from the request
 */
export const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 10, keyOn } = {}) => {
  return (req, res, next) => {
    const now = Date.now();
    if (buckets.size > MAX_TRACKED) sweep(now);

    // Default: client IP. Where a request identifies an account, callers pass
    // `keyOn` so one attacker cannot exhaust a victim's allowance from many
    // addresses — and so one shared NAT does not lock out a whole office.
    const key = keyOn ? keyOn(req) : (req.ip || req.socket?.remoteAddress || 'unknown');

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', Math.ceil((bucket.resetAt - now) / 1000));

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        error: 'Too many attempts. Please try again later.',
        retryAfterSeconds: retryAfter,
      });
    }

    next();
  };
};

/** Exposed so tests can start from a clean slate. */
export const _resetBuckets = () => buckets.clear();
