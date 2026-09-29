/**
 * JWT authentication, replacing the Clerk SDK.
 *
 * Clerk required a hosted account and API keys before the portal would even
 * boot, which made the project impossible to run or demo standalone. This is
 * self-contained: accounts live in MongoDB and sessions are stateless JWTs.
 *
 * `req.auth` keeps the shape the existing routes already read
 * (`req.auth.userId`), so route code did not have to change around it.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import dotenv from 'dotenv';
dotenv.config();

const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Refuse to run on the fallback secret outside development. A predictable
 * secret means anyone can mint an admin token, so this must never reach a
 * deployed environment silently.
 */
const resolveSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET must be set to at least 16 characters in production. ' +
      'Refusing to start with a default signing key.'
    );
  }
  console.warn(
    '[auth] WARNING: JWT_SECRET is unset or too short. Using an insecure ' +
    'development key. Set JWT_SECRET in server/.env before deploying.'
  );
  return 'dev-only-insecure-secret-do-not-deploy';
};

const JWT_SECRET = resolveSecret();

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

/** Admin is derived from configuration at request time, never stored. */
export const isAdminEmail = (email) =>
  Boolean(email) && adminEmails().includes(email.toLowerCase());

export const hashPassword = (plain) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

export const signToken = (user) =>
  jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      name: user.name,
      role: isAdminEmail(user.email) ? 'admin' : user.role,
      department: user.department || null,
      region: user.region || null,
      // Millisecond stamp of the account's last password change. Compared
      // exactly on every request, so a password change invalidates every
      // previously issued token with no race window. The standard `iat` trick
      // cannot do this: it has one-second granularity, so a token minted in
      // the same second as the change is indistinguishable from one minted
      // just before it.
      pwd: user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0,
    },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );

/** Shape sent to the client. Never includes passwordHash. */
export const publicUser = (user) => ({
  id: String(user._id),
  email: user.email,
  name: user.name,
  phone: user.phone || '',
  role: isAdminEmail(user.email) ? 'admin' : user.role,
  department: user.department || null,
  region: user.region || null,
  designation: user.designation || '',
  employeeId: user.employeeId || '',
  // Whether identity was verified — never how, and never with what number.
  aadhaarVerified: Boolean(user.aadhaarVerified),
  aadhaarVerifiedAt: user.aadhaarVerifiedAt || null,
  createdAt: user.createdAt,
});

const readToken = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
};


/**
 * True when this token predates the account's current password.
 *
 * Compares the `pwd` stamp minted into the token against the account's
 * `passwordChangedAt` at millisecond precision, so the answer is exact: there
 * is no window in which a token issued around the time of a password change
 * might survive.
 *
 * Throws on a lookup failure rather than returning false. Failing *open* here
 * would mean a database blip silently restores every session a password reset
 * was meant to kill — which is precisely the situation a reset responds to.
 */
const isTokenStale = async (payload) => {
  if (!payload?.sub) return false;

  const user = await User.findById(payload.sub).select('passwordChangedAt').lean();
  // The account is gone; its tokens should not outlive it.
  if (!user) return true;

  const currentEpoch = user.passwordChangedAt
    ? new Date(user.passwordChangedAt).getTime()
    : 0;
  // Tokens issued before this claim existed carry no `pwd`; treat them as
  // valid only while the account has never changed its password.
  const tokenEpoch = typeof payload.pwd === 'number' ? payload.pwd : 0;

  return tokenEpoch !== currentEpoch;
};

/**
 * Rejects the request unless a valid token is present.
 *
 * Async because a password change has to invalidate sessions issued before
 * it: with stateless JWTs the only way to revoke is to compare the token's
 * issue time against the account's `passwordChangedAt`.
 */
export const requireAuth = async (req, res, next) => {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return res.status(401).json({
      error: expired ? 'Session expired, please sign in again' : 'Invalid token',
      code: expired ? 'token_expired' : 'invalid_token',
    });
  }

  try {
    if (await isTokenStale(payload)) {
      return res.status(401).json({
        error: 'Your password was changed. Please sign in again.',
        code: 'password_changed',
      });
    }
  } catch (err) {
    // Could not verify the session is current. Reported honestly as an
    // outage rather than as an authentication failure, so nobody debugs a
    // database problem as a login problem.
    console.error('Session freshness check failed:', err.message);
    return res.status(503).json({
      error: 'Could not verify your session right now. Please try again.',
      code: 'session_check_unavailable',
    });
  }

  try {
    req.auth = {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
      // Re-derived from config rather than trusted from the token, so revoking
      // an address in ADMIN_EMAILS takes effect without waiting for expiry.
      role: isAdminEmail(payload.email) ? 'admin' : payload.role,
      department: payload.department || null,
      region: payload.region || null,
    };
    next();
  } catch (err) {
    console.error('Failed to build the auth context:', err.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

/** Populates req.auth when a token is present, but allows anonymous access. */
export const optionalAuth = async (req, res, next) => {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // On a public route an unverifiable or stale token simply means anonymous,
    // which grants nothing — so failing open costs nothing here.
    if (await isTokenStale(payload).catch(() => true)) return next();
    req.auth = {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
      role: isAdminEmail(payload.email) ? 'admin' : payload.role,
    };
  } catch {
    // An invalid token on a public route is simply anonymous, not an error.
  }
  next();
};

export const requireAdmin = (req, res, next) => {
  if (req.auth?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * Admins see everything; department admins are scoped to their own department.
 * Sets req.deptAdminDept for the routes that filter on it.
 */
export const requireAdminOrDeptAdmin = async (req, res, next) => {
  if (req.auth?.role === 'admin') {
    req.isMainAdmin = true;
    return next();
  }
  try {
    const user = await User.findById(req.auth.userId);
    if (user?.role === 'dept_admin' && user.department) {
      req.isDeptAdmin = true;
      req.deptAdminDept = user.department;
      return next();
    }
    return res.status(403).json({ error: 'Admin or department admin access required' });
  } catch {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};


/**
 * Government officials: may read and advance grievances in their assigned
 * department and region, and nothing else.
 *
 * The restriction is enforced here rather than by hiding buttons in the UI —
 * a hidden button is not a permission. The route handler additionally
 * whitelists which fields an official may write; see routes/issues.js.
 */
export const OFFICIAL_ROLES = ['official', 'dept_admin'];

export const requireOfficial = (req, res, next) => {
  if (!OFFICIAL_ROLES.includes(req.auth?.role) && req.auth?.role !== 'admin') {
    return res.status(403).json({ error: 'Government official access required' });
  }
  next();
};

/**
 * Load a staff member's current assignment before exposing operational data.
 *
 * The assignment is read from MongoDB rather than trusted solely from the
 * JWT, so an owner changing an official's department or region takes effect
 * on the very next request. Owners remain intentionally unscoped.
 */
export const requireOfficialScope = async (req, res, next) => {
  if (req.auth?.role === 'admin') return next();

  try {
    const user = await User.findById(req.auth?.userId).select('role department region designation').lean();
    if (!user || !OFFICIAL_ROLES.includes(user.role)) {
      return res.status(403).json({ error: 'Government official access required' });
    }
    if (!user.department || !user.region) {
      return res.status(403).json({
        error: 'Your official account needs a department and region assignment. Contact the system owner.',
        code: 'official_assignment_required',
      });
    }
    req.officialScope = { department: user.department, region: user.region, designation: user.designation || '' };
    next();
  } catch {
    res.status(503).json({ error: 'Could not verify your official assignment right now.' });
  }
};

/** True for any role permitted to view the staff consoles. */
export const isStaff = (role) =>
  role === 'admin' || OFFICIAL_ROLES.includes(role);

/**
 * Deletion is reserved for the system owner and the grievance's own author.
 * Officials are excluded by design: a public record of what citizens reported
 * must not be erasable by the body being complained about.
 */
export const denyOfficialDeletion = (req, res, next) => {
  if (OFFICIAL_ROLES.includes(req.auth?.role)) {
    return res.status(403).json({
      error: 'Officials cannot delete grievances. You may update status and add notes.',
    });
  }
  next();
};
