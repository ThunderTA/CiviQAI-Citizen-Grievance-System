import express from 'express';
import User from '../models/User.js';
import {
  requireAuth,
  requireAdmin,
  hashPassword,
  verifyPassword,
  signToken,
  publicUser,
  isAdminEmail,
} from '../middleware/auth.js';
import { requestOtp, verifyOtp, consumeAadhaarToken } from '../services/aadhaar.js';
import {
  createResetToken,
  hashResetToken,
  buildResetUrl,
  RESET_TTL_MINUTES,
} from '../services/passwordReset.js';
import { sendPasswordResetEmail } from '../controllers/emailController.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { blockInDemo } from '../middleware/demoMode.js';

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

// Set REQUIRE_AADHAAR=false to let people register without the identity step
// (useful for local development and for the automated tests).
const REQUIRE_AADHAAR = process.env.REQUIRE_AADHAAR !== 'false';

// Password guessing and reset-mail spraying are the two things an anonymous
// caller can grind at. Keyed by IP *and* the submitted address, so one
// attacker cannot burn a victim's allowance and lock them out.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyOn: (req) => `login:${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
});

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyOn: (req) => `forgot:${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
});

// Reset endpoints are limited per TOKEN, not per IP.
//
// The security control that matters is "you cannot grind at one reset link",
// and a token-keyed bucket enforces exactly that. Keying by IP instead would
// let one noisy client lock out everyone behind the same office NAT, while
// doing nothing extra against an attacker with many addresses. A generous
// per-IP cap sits behind it purely as anti-abuse, since the token itself is
// 256 bits of randomness and not worth guessing.
const perTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyOn: (req) => `reset-token:${req.body?.token || req.query?.token || 'none'}`,
});

const resetIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyOn: (req) => `reset-ip:${req.ip}`,
});

const resetLimiter = [resetIpLimiter, perTokenLimiter];

const validateCredentials = ({ email, password, name }, { requireName }) => {
  if (!email || !EMAIL_RE.test(String(email).trim())) return 'A valid email address is required';
  if (!password || String(password).length < MIN_PASSWORD) {
    return `Password must be at least ${MIN_PASSWORD} characters`;
  }
  if (requireName && !String(name || '').trim()) return 'Name is required';
  return null;
};


// ---------------------------------------------------------------------------
// Aadhaar verification.
//
// SIMULATED — see services/aadhaar.js. Real UIDAI e-KYC needs a licensed
// AUA/KUA integration this cannot stand in for.
//
// The number is present only in the body of the first request. It is never
// written to MongoDB, never logged, and never echoed back in a response.
// ---------------------------------------------------------------------------

// POST /api/auth/aadhaar/request-otp
router.post('/aadhaar/request-otp', (req, res) => {
  const result = requestOtp(req.body?.aadhaar);
  if (!result.ok) return res.status(400).json({ error: result.error });

  // In a real deployment the code goes to the registered mobile and never
  // appears here. It is returned only outside production so the flow is
  // demonstrable without an SMS gateway.
  const body = {
    verificationId: result.verificationId,
    expiresInSeconds: result.expiresInSeconds,
    simulated: true,
  };
  if (process.env.NODE_ENV !== 'production') {
    body.devOtp = result.otp;
    body.notice = 'devOtp is returned only outside production. This is a simulated verification, not UIDAI e-KYC.';
  }
  res.json(body);
});

// POST /api/auth/aadhaar/verify-otp -> short-lived proof of verification
router.post('/aadhaar/verify-otp', (req, res) => {
  const { verificationId, otp } = req.body || {};
  if (!verificationId || !otp) {
    return res.status(400).json({ error: 'verificationId and otp are required' });
  }

  const result = verifyOtp(verificationId, otp);
  if (!result.ok) {
    return res.status(400).json({
      error: result.error,
      attemptsRemaining: result.attemptsRemaining,
    });
  }

  // Asserts only that a verification happened. Carries no identifier.
  res.json({ aadhaarToken: result.token, verified: true });
});

// POST /api/auth/register — create a citizen account
router.post('/register', blockInDemo, rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }), async (req, res) => {
  try {
    const { email, password, name, phone, aadhaarToken } = req.body;

    const problem = validateCredentials(req.body, { requireName: true });
    if (problem) return res.status(400).json({ error: problem });

    // Identity check. The token proves a verification happened in this
    // session; it carries no Aadhaar number, so nothing identifying reaches
    // this handler and nothing identifying can be stored.
    const aadhaarVerified = consumeAadhaarToken(aadhaarToken);
    if (REQUIRE_AADHAAR && !aadhaarVerified) {
      return res.status(400).json({
        error: 'Aadhaar verification is required before creating an account',
        code: 'aadhaar_required',
      });
    }

    const normalisedEmail = String(email).trim().toLowerCase();

    if (await User.findOne({ email: normalisedEmail })) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const user = await User.create({
      email: normalisedEmail,
      passwordHash: await hashPassword(String(password)),
      name: String(name).trim(),
      phone: String(phone || '').trim(),
      role: 'citizen',
      aadhaarVerified,
      aadhaarVerifiedAt: aadhaarVerified ? new Date() : null,
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    // A racing duplicate insert trips the unique index rather than the check
    // above. Report the field that actually collided: blindly blaming email
    // hid a stale unique index on a different field for far too long.
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || { email: 1 })[0];
      if (field === 'email') {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }
      console.error(`Unexpected unique-index collision on "${field}":`, err.keyValue);
      return res.status(409).json({
        error: `Account could not be created: a duplicate value for "${field}" already exists`,
      });
    }
    console.error('Registration failed:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // passwordHash is select:false on the model, so ask for it explicitly.
    const user = await User.findOne({ email: String(email).trim().toLowerCase() })
      .select('+passwordHash');

    // Same message and code either way: distinguishing "no such user" from
    // "wrong password" hands an attacker a list of registered emails.
    const ok = user && await verifyPassword(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});


// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

// POST /api/auth/forgot-password
//
// Always answers the same way, whether or not the address is registered.
// Saying "no such account" would turn this endpoint into a membership oracle:
// anyone could test an address list against the citizen database.
router.post('/forgot-password', blockInDemo, forgotLimiter, async (req, res) => {
  const generic = {
    message: 'If an account exists for that email, a reset link is on its way.',
  };

  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      // Even a malformed address gets the same answer.
      return res.json(generic);
    }

    const user = await User.findOne({ email });
    if (!user) return res.json(generic);

    const { token, tokenHash, expiresAt } = createResetToken();
    user.passwordResetTokenHash = tokenHash;
    user.passwordResetExpires = expiresAt;
    await user.save();

    const resetUrl = buildResetUrl(token);
    const sent = await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      expiresInMinutes: RESET_TTL_MINUTES,
    });

    // With no SMTP configured the link would be unreachable, so outside
    // production it is returned directly. Never in production, and never
    // conditional on whether the account exists — an attacker probing a
    // non-existent address still gets the plain generic response above.
    if (!sent && process.env.NODE_ENV !== 'production') {
      return res.json({
        ...generic,
        devResetUrl: resetUrl,
        notice: 'Email is not configured; devResetUrl is returned outside production only.',
      });
    }

    res.json(generic);
  } catch (err) {
    console.error('Forgot-password failed:', err.message);
    // Still generic: an internal error must not become a signal either.
    res.json(generic);
  }
});

// GET /api/auth/reset-password/check?token=... — is this link still good?
// Lets the UI show "this link has expired" before asking for a new password.
router.get('/reset-password/check', ...resetLimiter, async (req, res) => {
  try {
    const user = await User.findOne({
      passwordResetTokenHash: hashResetToken(String(req.query.token || '')),
      passwordResetExpires: { $gt: new Date() },
    }).select('_id');
    res.json({ valid: Boolean(user) });
  } catch {
    res.json({ valid: false });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', blockInDemo, ...resetLimiter, async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Reset token is required' });
    if (!password || String(password).length < MIN_PASSWORD) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
    }

    // Looked up by hash: the raw token is never stored, so a database read
    // cannot produce a usable link.
    const user = await User.findOne({
      passwordResetTokenHash: hashResetToken(token),
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetTokenHash +passwordResetExpires');

    if (!user) {
      return res.status(400).json({
        error: 'This reset link is invalid or has expired. Please request a new one.',
        code: 'invalid_reset_token',
      });
    }

    user.passwordHash = await hashPassword(String(password));
    // Single use.
    user.passwordResetTokenHash = null;
    user.passwordResetExpires = null;
    user.passwordChangedAt = new Date();
    await user.save();

    // Signing them straight in saves a redundant login, and every OTHER
    // session is now invalid — which is the point if the reset was prompted
    // by someone else having the old password.
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('Password reset failed:', err.message);
    res.status(500).json({ error: 'Could not reset the password' });
  }
});

// GET /api/auth/me — current user, used to restore a session on page load
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.auth.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// PATCH /api/auth/me — update own name/phone
router.patch('/me', requireAuth, blockInDemo, async (req, res) => {
  try {
    const update = {};
    if (req.body.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body.phone !== undefined) update.phone = String(req.body.phone).trim();

    const user = await User.findByIdAndUpdate(
      req.auth.userId, { $set: update }, { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, blockInDemo, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < MIN_PASSWORD) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
    }

    const user = await User.findById(req.auth.userId).select('+passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Proving knowledge of the current password stops a stolen token from
    // being upgraded into permanent account takeover.
    if (!await verifyPassword(String(currentPassword || ''), user.passwordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.passwordHash = await hashPassword(String(newPassword));
    // Same reasoning as a reset: other live sessions must not survive.
    user.passwordChangedAt = new Date();
    await user.save();

    // Re-issue, or the caller's own request would be the first one rejected.
    res.json({ success: true, token: signToken(user) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// POST /api/auth/sync — compatibility shim for the old Clerk flow
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.auth.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ role: publicUser(user).role, department: user.department || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to sync user' });
  }
});


// ---------------------------------------------------------------------------
// Official accounts (owner only).
//
// Officials are provisioned, never self-registered: anyone who could sign
// themselves up as a government official could then move grievances to
// "resolved" without doing anything.
// ---------------------------------------------------------------------------

// POST /api/auth/officials — create a government official account
router.post('/officials', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email, password, name, designation, employeeId, department, region, role } = req.body;

    const problem = validateCredentials(req.body, { requireName: true });
    if (problem) return res.status(400).json({ error: problem });

    const assignedRole = role === 'dept_admin' ? 'dept_admin' : 'official';
    if (!String(department || '').trim() || !String(region || '').trim()) {
      return res.status(400).json({ error: 'Every official needs a department and region assignment' });
    }

    const normalisedEmail = String(email).trim().toLowerCase();
    if (await User.findOne({ email: normalisedEmail })) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const user = await User.create({
      email: normalisedEmail,
      passwordHash: await hashPassword(String(password)),
      name: String(name).trim(),
      role: assignedRole,
      department: String(department).trim(),
      region: String(region).trim(),
      designation: String(designation || '').trim(),
      employeeId: String(employeeId || '').trim(),
      // Officials are vetted out of band by the office that employs them, so
      // the citizen Aadhaar step does not apply to them.
      aadhaarVerified: false,
    });

    res.status(201).json(publicUser(user));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    console.error('Official creation failed:', err);
    res.status(500).json({ error: 'Could not create the official account' });
  }
});

// GET /api/auth/officials — list official accounts (owner only)
router.get('/officials', requireAuth, requireAdmin, async (req, res) => {
  try {
    const officials = await User.find({ role: { $in: ['official', 'dept_admin'] } })
      .sort({ createdAt: -1 });
    res.json(officials.map(publicUser));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch officials' });
  }
});

// DELETE /api/auth/officials/:id — revoke an official account (owner only)
router.delete('/officials/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (!['official', 'dept_admin'].includes(user.role)) {
      return res.status(400).json({ error: 'That account is not an official account' });
    }
    await user.deleteOne();
    res.json({ revoked: true, email: user.email });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke the account' });
  }
});

// GET /api/auth/users — all accounts (admin)
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users.map(publicUser));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PATCH /api/auth/users/:id — assign or clear the dept_admin role (admin)
router.patch('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role, department, region } = req.body;
    const update = {};

    if (role !== undefined) {
      if (!['citizen', 'official', 'dept_admin'].includes(role)) {
        // 'admin' comes from ADMIN_EMAILS only — it must not be grantable
        // through the API, or an admin could silently promote anyone.
        return res.status(400).json({ error: 'Role must be citizen, official or dept_admin' });
      }
      update.role = role;
    }
    const targetRole = role === undefined ? (await User.findById(req.params.id).select('role').lean())?.role : role;
    if (!targetRole) return res.status(404).json({ error: 'User not found' });
    if (targetRole === 'citizen') {
      update.department = null;
      update.region = null;
    } else {
      const current = await User.findById(req.params.id).select('department region').lean();
      const assignedDepartment = department !== undefined ? String(department).trim() : current?.department;
      const assignedRegion = region !== undefined ? String(region).trim() : current?.region;
      if (!assignedDepartment || !assignedRegion) {
        return res.status(400).json({ error: 'Every official needs a department and region assignment' });
      }
      update.department = assignedDepartment;
      update.region = assignedRegion;
    }

    const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(publicUser(user));
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

export default router;
