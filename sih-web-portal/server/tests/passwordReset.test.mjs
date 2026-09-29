/**
 * Password reset behaviour, against a running API + MongoDB.
 *
 *   node tests/passwordReset.test.mjs
 *
 * The properties worth protecting here are all security properties: the
 * endpoint must not reveal who has an account, a leaked database must not
 * yield working links, a link must work once, and a reset must end every other
 * session.
 *
 * Uses a throwaway account so it does not consume the demo accounts' rate
 * limit allowance or change their passwords.
 */
import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const BASE = process.env.API_URL || 'http://localhost:3000/api';
const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/citizencare';

let passed = 0, failed = 0;
const check = (label, ok, detail = '') => {
  ok ? passed++ : failed++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${!ok && detail ? `\n         ${detail}` : ''}`);
};

const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const tokenFromUrl = (url) => new URL(url).searchParams.get('token');

const run = async () => {
  console.log('='.repeat(62));
  console.log('Password reset');
  console.log('='.repeat(62));

  await mongoose.connect(MONGO);
  const users = mongoose.connection.db.collection('users');

  // Seed a throwaway account directly, bypassing the Aadhaar gate and the
  // registration rate limit.
  const email = `reset-test-${Date.now()}@demo.in`;
  const original = 'originalpass123';
  const bcrypt = (await import('bcryptjs')).default;
  await users.insertOne({
    email, name: 'Reset Test', role: 'citizen',
    passwordHash: await bcrypt.hash(original, 12),
    aadhaarVerified: true, passwordChangedAt: null,
    createdAt: new Date(), updatedAt: new Date(), __v: 0,
  });

  console.log('\nEnumeration resistance');
  const real = await call('/auth/forgot-password', { method: 'POST', body: { email } });
  const fake = await call('/auth/forgot-password', {
    method: 'POST', body: { email: `definitely-not-here-${Date.now()}@demo.in` },
  });
  check('registered address returns 200', real.status === 200);
  check('unknown address returns 200 too', fake.status === 200);
  check('both return an identical message', real.body?.message === fake.body?.message,
        `${real.body?.message} vs ${fake.body?.message}`);
  const malformed = await call('/auth/forgot-password', { method: 'POST', body: { email: 'nonsense' } });
  check('malformed address answers the same way', malformed.body?.message === real.body?.message);

  const resetUrl = real.body?.devResetUrl;
  check('a reset link was produced', Boolean(resetUrl));
  const token = tokenFromUrl(resetUrl);

  console.log('\nToken storage');
  const stored = await users.findOne({ email });
  check('the raw token is NOT in the database',
        !JSON.stringify(stored).includes(token));
  check('only its SHA-256 hash is stored',
        stored.passwordResetTokenHash ===
        crypto.createHash('sha256').update(token).digest('hex'));
  check('an expiry is set', stored.passwordResetExpires instanceof Date);

  console.log('\nLink validity');
  check('a valid token checks out',
        (await call(`/auth/reset-password/check?token=${token}`)).body?.valid === true);
  check('a forged token does not',
        (await call('/auth/reset-password/check?token=deadbeef')).body?.valid === false);
  const forged = await call('/auth/reset-password', {
    method: 'POST', body: { token: 'deadbeef', password: 'whateverpass1' },
  });
  check('a forged token cannot reset', forged.status === 400);
  const short = await call('/auth/reset-password', {
    method: 'POST', body: { token, password: 'abc' },
  });
  check('a too-short password is rejected', short.status === 400);

  console.log('\nSession invalidation');
  const before = (await call('/auth/login', {
    method: 'POST', body: { email, password: original },
  })).body?.token;
  check('the old session works before the reset',
        (await call('/auth/me', { token: before })).status === 200);

  const done = await call('/auth/reset-password', {
    method: 'POST', body: { token, password: 'brandnewpass456' },
  });
  check('the reset succeeds', done.status === 200, JSON.stringify(done.body));
  check('and signs the user in', Boolean(done.body?.token));
  check('the session it issues is valid',
        (await call('/auth/me', { token: done.body.token })).status === 200);

  const after = await call('/auth/me', { token: before });
  check('the session from before the reset is revoked', after.status === 401,
        `got ${after.status}`);
  check('...with an explanatory code', after.body?.code === 'password_changed',
        JSON.stringify(after.body));

  console.log('\nSingle use');
  const replay = await call('/auth/reset-password', {
    method: 'POST', body: { token, password: 'thirdpassword789' },
  });
  check('the same link cannot be used twice', replay.status === 400);
  const cleared = await users.findOne({ email });
  check('the stored hash is cleared', cleared.passwordResetTokenHash === null);

  console.log('\nCredentials');
  check('the old password no longer works',
        (await call('/auth/login', { method: 'POST', body: { email, password: original } })).status === 401);
  check('the new password works',
        (await call('/auth/login', { method: 'POST', body: { email, password: 'brandnewpass456' } })).status === 200);

  await users.deleteOne({ email });
  await mongoose.disconnect();

  console.log('\n' + '='.repeat(62));
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log('='.repeat(62));
  process.exit(failed ? 1 : 0);
};

run().catch(err => { console.error(err); process.exit(1); });
