/**
 * Aadhaar privacy checks against a running API + MongoDB.
 *
 *   node tests/aadhaar.test.mjs
 *
 * The promise being tested: the Aadhaar number is used to verify and then
 * discarded. Not stored, not hashed into a column, not logged. These assert it
 * rather than trusting the code comment that says so.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const BASE = process.env.API_URL || 'http://localhost:3000/api';
const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/citizencare';

let passed = 0, failed = 0;
const check = (label, ok, detail = '') => {
  ok ? passed++ : failed++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${!ok && detail ? `\n         ${detail}` : ''}`);
};

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

// Verhoeff check-digit generator, so the test uses genuinely well-formed
// numbers instead of ones that happen to fail validation for the wrong reason.
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
const INV = [0,4,3,2,1,5,6,7,8,9];
const withCheckDigit = (body11) => {
  let c = 0;
  const rev = body11.split('').reverse().map(Number);
  for (let i = 0; i < rev.length; i++) c = D[c][P[(i + 1) % 8][rev[i]]];
  return body11 + INV[c];
};

const run = async () => {
  console.log('='.repeat(62));
  console.log('Aadhaar verification & privacy');
  console.log('='.repeat(62));

  console.log('\nFormat validation');
  for (const [number, label] of [
    ['12345', 'too short'],
    ['012345678901', 'begins with 0'],
    ['112345678901', 'begins with 1'],
    ['999999999999', 'all identical digits'],
    ['234567890123', 'fails the checksum'],
  ]) {
    const res = await post('/auth/aadhaar/request-otp', { aadhaar: number });
    check(`rejects ${label}`, res.status === 400, `got ${res.status}`);
    check(`  ...and does not echo the number back`,
          !JSON.stringify(res.body).includes(number));
  }

  const aadhaar = withCheckDigit('23456789012');
  const started = await post('/auth/aadhaar/request-otp', { aadhaar });
  check('accepts a well-formed number', started.status === 200, JSON.stringify(started.body));
  check('flags itself as simulated', started.body?.simulated === true);
  check('response contains no Aadhaar number',
        !JSON.stringify(started.body).includes(aadhaar));

  console.log('\nOTP');
  const wrong = await post('/auth/aadhaar/verify-otp', {
    verificationId: started.body.verificationId, otp: '000000',
  });
  check('rejects an incorrect code', wrong.status === 400);
  check('counts down remaining attempts', typeof wrong.body?.attemptsRemaining === 'number');

  const right = await post('/auth/aadhaar/verify-otp', {
    verificationId: started.body.verificationId, otp: started.body.devOtp,
  });
  check('accepts the correct code', right.status === 200 && Boolean(right.body?.aadhaarToken));

  const replay = await post('/auth/aadhaar/verify-otp', {
    verificationId: started.body.verificationId, otp: started.body.devOtp,
  });
  check('the session is single-use', replay.status === 400, `got ${replay.status}`);

  const token = right.body.aadhaarToken;
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  check('proof token carries no Aadhaar number',
        !JSON.stringify(claims).includes(aadhaar), JSON.stringify(claims));
  check('proof token carries no identifier at all',
        Object.keys(claims).every(k => ['purpose', 'iat', 'exp'].includes(k)),
        JSON.stringify(claims));

  console.log('\nRegistration');
  const email = `aadhaar-test-${Date.now()}@demo.in`;
  const registered = await post('/auth/register', {
    email, password: 'aadhaartest123', name: 'Aadhaar Test', aadhaarToken: token,
  });
  check('registers with a valid proof', registered.status === 201, JSON.stringify(registered.body));
  check('records only that verification happened',
        registered.body?.user?.aadhaarVerified === true);

  const noProof = await post('/auth/register', {
    email: `noproof-${Date.now()}@demo.in`, password: 'aadhaartest123', name: 'No Proof',
  });
  check('refuses registration without a proof', noProof.status === 400, `got ${noProof.status}`);

  console.log('\nThe number must not be anywhere in the database');
  await mongoose.connect(MONGO);
  const collections = await mongoose.connection.db.listCollections().toArray();
  let found = [];
  for (const c of collections) {
    const docs = await mongoose.connection.db.collection(c.name).find({}).toArray();
    if (JSON.stringify(docs).includes(aadhaar)) found.push(c.name);
  }
  check('Aadhaar number absent from every collection', found.length === 0,
        `found in: ${found.join(', ')}`);

  const user = await mongoose.connection.db.collection('users').findOne({ email });
  const fields = Object.keys(user || {});
  check('user document has aadhaarVerified', fields.includes('aadhaarVerified'));
  check('user document stores no aadhaar number field',
        !fields.some(f => /aadhaar/i.test(f) && !['aadhaarVerified', 'aadhaarVerifiedAt'].includes(f)),
        fields.join(', '));

  await mongoose.connection.db.collection('users').deleteOne({ email });
  await mongoose.disconnect();

  console.log('\n' + '='.repeat(62));
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log('='.repeat(62));
  process.exit(failed ? 1 : 0);
};

run().catch(err => { console.error(err); process.exit(1); });
