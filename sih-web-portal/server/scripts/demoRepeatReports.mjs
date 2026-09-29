/**
 * Stage — and remove — a live demonstration of repeat-report escalation.
 *
 *   node scripts/demoRepeatReports.mjs up     five people report the same problem
 *   node scripts/demoRepeatReports.mjs down   remove every trace of it
 *
 * `up` files one problem from five different accounts, has an official start
 * work on it, and adds an unrelated newer grievance, so you can watch in the
 * app: the score climbing, the reports folding into one card, the queue order,
 * and the citizen tracking view. It works on a remote spot in Shillong so it
 * cannot merge with real complaints, and `down` deletes through the API so the
 * vector index is cleaned too.
 *
 * All demo accounts use the password `esctest12345`.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Issue from '../models/Issue.js';
dotenv.config();

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
const PASSWORD = 'esctest12345';
const PREFIX = 'esc-demo-';
const mode = process.argv[2];

const call = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const login = async (email, password) =>
  (await call('/auth/login', { method: 'POST', body: { email, password } })).body?.token;

const SPOT = { latitude: 25.5788, longitude: 91.8933 };
const near = () => ({ latitude: SPOT.latitude + (Math.random() - 0.5) * 0.0001, longitude: SPOT.longitude });

const BENCH = [
  ['Broken bench at the riverside walkway', 'The wooden bench at the riverside walkway has a broken plank and is uncomfortable to sit on.'],
  ['Riverside walkway bench is damaged', 'A plank on the bench along the riverside walkway is broken so nobody can sit on it comfortably.'],
  ['Bench on the riverside path is broken', 'The bench on the riverside path has a broken wooden plank and needs to be repaired.'],
  ['Damaged bench beside the river walkway', 'One plank of the bench beside the river walkway is broken, making it uncomfortable to sit.'],
  ['Riverside walkway has a broken bench', 'There is a bench on the riverside walkway with a broken plank that is uncomfortable to sit on.'],
];

await mongoose.connect(process.env.MONGODB_URI);

const down = async () => {
  const admin = await login('admin@demo.in', 'demo12345');
  const issues = await Issue.find({ submitterEmail: { $regex: `^${PREFIX}` } }).select('_id').lean();
  for (const { _id } of issues) await call(`/issues/${_id}`, { method: 'DELETE', token: admin });
  await Issue.deleteMany({ submitterEmail: { $regex: `^${PREFIX}` } });
  const { deletedCount } = await User.deleteMany({ email: { $regex: `^${PREFIX}` } });
  console.log(`Removed ${issues.length} grievances and ${deletedCount} accounts.`);
};

if (mode === 'down') {
  await down();
} else if (mode === 'up') {
  await down();   // idempotent: start from a clean slate
  const hash = await bcrypt.hash(PASSWORD, 10);
  const citizens = [];
  for (let n = 1; n <= 5; n += 1) {
    citizens.push(await User.create({
      email: `${PREFIX}${n}@demo.in`, name: ['Kynthei Lyngdoh', 'Bah Donbok', 'Ibalaris Nongrum', 'Wanphrang Khongwir', 'Daiahun Marbaniang'][n - 1],
      passwordHash: hash, role: 'citizen', aadhaarVerified: true,
    }));
  }
  const tokens = [];
  for (const c of citizens) tokens.push(await login(c.email, PASSWORD));

  const file = (token, [title, description], spot = near()) =>
    call('/issues', { method: 'POST', token, body: { title, description, location: 'Riverside walkway, Shillong', state: 'Meghalaya', coordinates: spot } });

  console.log('Five different people report the same broken bench...');
  let original;
  for (let n = 0; n < 5; n += 1) {
    const res = await file(tokens[n], BENCH[n]);
    if (n === 0) original = res.body;
    const c = res.body.cluster;
    console.log(n === 0
      ? `  1. filed            score ${res.body.priorityScore} (${res.body.urgencyLevel})`
      : `  ${n + 1}. merged           ${c.reportCount} people -> score ${c.priorityScore} (${c.urgencyLevel})${c.raised ? '   RAISED' : ''}`);
  }

  // A named official starts work, so the tracking view has someone to show.
  const official = await User.create({
    email: `${PREFIX}official@gov.in`, name: 'S. Iyer', passwordHash: hash, role: 'official',
    designation: 'Junior Engineer', employeeId: 'ML-JE-0417',
    department: original.department, region: 'Meghalaya',
  });
  const officialToken = await login(official.email, PASSWORD);
  await call(`/issues/${original._id}`, {
    method: 'PATCH', token: officialToken,
    body: { status: 'in-progress', adminNote: 'Carpenter scheduled for Thursday morning.' },
  });

  await file(tokens[0], ['Signal lamp flickering at the depot crossing', 'The traffic signal lamp at the bus depot crossing keeps flickering on and off during the evening.'],
             { latitude: 25.5702, longitude: 91.8801 });

  console.log(`\nDone. Sign in (password ${PASSWORD}):`);
  console.log(`  citizen  ${PREFIX}2@demo.in   -> My Issues shows the merged, tracked report`);
  console.log(`  official ${PREFIX}official@gov.in  -> Official Console (${original.department}, Meghalaya)`);
  console.log('  owner    admin@demo.in / demo12345 -> Admin Dashboard');
  console.log('\nRemove it all with:  node scripts/demoRepeatReports.mjs down');
} else {
  console.log('usage: node scripts/demoRepeatReports.mjs up|down');
}

await mongoose.disconnect();
