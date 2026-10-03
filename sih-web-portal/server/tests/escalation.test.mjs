/**
 * Repeat-report escalation, duplicate folding and citizen tracking, end to end
 * against the running stack (API + MongoDB + AI service).
 *
 *   node tests/escalation.test.mjs
 *
 * Runs on your real database, so it is built to leave nothing behind and to be
 * unable to touch real complaints: it uses throwaway accounts, coordinates in a
 * remote part of the country, and removes everything it created — including the
 * vector-index entries — in a `finally` block. It checks the index size before
 * and after to prove that.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Issue from '../models/Issue.js';
import { resolveRoot, recomputeAllClusters, URGENCY_LEVELS } from '../services/escalation.js';
dotenv.config();

// Owner credentials. Default to the seeded demo account so a fresh clone works
// out of the box; override with ADMIN_EMAIL / ADMIN_PASSWORD when the owner
// account has been changed (never commit a real password here).
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@demo.in';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'demo12345';

const BASE = process.env.API_URL || 'http://localhost:3000/api';
const RUN = Date.now();
const PASSWORD = 'esctest12345';
const EMAIL = (n) => `esc-test-${RUN}-${n}@demo.in`;

let passed = 0, failed = 0;
const check = (label, ok, detail = '') => {
  ok ? passed++ : failed++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${!ok && detail ? `\n         ${detail}` : ''}`);
};
const eq = (label, actual, expected) =>
  check(label, JSON.stringify(actual) === JSON.stringify(expected),
        `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const call = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

// A spot in Shillong: nowhere near any real complaint, so the geo gate rejects
// every real candidate and the two clusters below cannot be polluted.
const SPOT_A = { latitude: 25.5788, longitude: 91.8933 };
const SPOT_B = { latitude: 25.5702, longitude: 91.8801 };
const at = (spot) => ({ latitude: spot.latitude + (Math.random() - 0.5) * 0.0001, longitude: spot.longitude });

// Close paraphrases of one plain, low-urgency problem — no danger words, so the
// base score is low and there is headroom to watch it climb.
const BENCH = [
  ['Broken bench at the riverside walkway', 'The wooden bench at the riverside walkway has a broken plank and is uncomfortable to sit on.'],
  ['Riverside walkway bench is damaged', 'A plank on the bench along the riverside walkway is broken so nobody can sit on it comfortably.'],
  ['Bench on the riverside path is broken', 'The bench on the riverside path has a broken wooden plank and needs to be repaired.'],
  ['Damaged bench beside the river walkway', 'One plank of the bench beside the river walkway is broken, making it uncomfortable to sit.'],
  ['Riverside walkway has a broken bench', 'There is a bench on the riverside walkway with a broken plank that is uncomfortable to sit on.'],
  ['Broken plank on the walkway bench by the river', 'The wooden bench by the river walkway has a broken plank and is not comfortable to sit on.'],
];
const LAMP = [
  ['Signal lamp flickering at the depot crossing', 'The traffic signal lamp at the bus depot crossing keeps flickering on and off during the evening.'],
  ['Depot crossing signal lamp keeps flickering', 'A signal lamp at the depot crossing flickers on and off repeatedly in the evening.'],
];

const file = (token, [title, description], spot, extra = {}) =>
  call('/issues', {
    method: 'POST', token,
    body: { title, description: `${description} (escalation test ${RUN})`, location: 'Shillong test spot',
            state: 'Meghalaya', coordinates: at(spot), ...extra },
  });

const created = [];   // ids created through the API, removed via DELETE so the index is cleaned too
const track = (res) => { if (res.body?._id) created.push(res.body._id); return res; };

const indexedCount = async (adminToken) =>
  (await call('/issues/ai-status', { token: adminToken })).body?.duplicate_engine?.indexed_complaints;

const run = async () => {
  console.log('='.repeat(62));
  console.log('Repeat-report escalation');
  console.log('='.repeat(62));

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/citizencare');

  const hash = await bcrypt.hash(PASSWORD, 10);
  const users = [];
  for (let n = 1; n <= 6; n += 1) {
    users.push(await User.create({
      email: EMAIL(n), name: `Esc Tester ${n}`, passwordHash: hash,
      role: 'citizen', aadhaarVerified: true,
    }));
  }
  const tokens = [];
  for (let n = 1; n <= 6; n += 1) {
    tokens.push((await call('/auth/login', { method: 'POST', body: { email: EMAIL(n), password: PASSWORD } })).body?.token);
  }
  const admin = (await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })).body?.token;
  if (!admin || tokens.some(t => !t)) {
    console.error('Could not sign in the test accounts (set ADMIN_EMAIL / ADMIN_PASSWORD if the owner account was changed).');
    process.exit(1);
  }
  const [t1, t2, t3, t4, t5, t6] = tokens;
  const indexBefore = await indexedCount(admin);
  const adminGet = async (id) => (await call(`/issues/${id}`, { token: admin })).body;

  try {
    // ------------------------------------------------------------------
    console.log('\nA single report');
    const original = track(await file(t1, BENCH[0], SPOT_A));
    check('the original is filed', original.status === 201, JSON.stringify(original.body));
    const originalId = original.body._id;
    check('it is not a duplicate', original.body.isDuplicate === false);
    const base = original.body.priorityScore;
    check(`the AI gave it a low base score (${base})`, base <= 2,
          'this test needs headroom to watch the score climb');
    eq('the base score is remembered separately', original.body.aiTriage?.baseScore, base);
    const deadlineBefore = new Date((await adminGet(originalId)).sla.deadline);

    // ------------------------------------------------------------------
    console.log('\nA second person reports it');
    const second = track(await file(t2, BENCH[1], SPOT_A));
    check('it is recognised as the same problem', second.body?.isDuplicate === true,
          `similarity ${second.body?.similarityScore}`);
    eq('and linked to the original', second.body?.matchedComplaintId, originalId);
    eq('two people have now reported it', second.body?.cluster?.reportCount, 2);
    check('the response says the priority was raised', second.body?.cluster?.raised === true);
    eq('by one point', second.body?.cluster?.priorityScore, Math.min(5, base + 1));

    let root = await adminGet(originalId);
    eq('the original\'s score really moved', root.priorityScore, Math.min(5, base + 1));
    eq('its urgency label followed', root.urgencyLevel, URGENCY_LEVELS[Math.min(5, base + 1)]);
    eq('the AI base score is preserved', root.aiTriage.baseScore, base);
    eq('one escalation is on record', root.priorityHistory.length, 1);
    eq('...with the reason and count', [root.priorityHistory[0].fromScore, root.priorityHistory[0].toScore, root.priorityHistory[0].reportCount],
       [base, Math.min(5, base + 1), 2]);
    check('the deadline only got tighter', new Date(root.sla.deadline) <= deadlineBefore);
    eq('the SLA label matches the real window',
       root.sla.targetHours, Math.max(1, Math.round((new Date(root.sla.deadline) - new Date(root.createdAt)) / 3600000)));

    // ------------------------------------------------------------------
    console.log('\nThe same person cannot inflate it');
    const votesBefore = root.votes;
    const again = track(await file(t2, BENCH[2], SPOT_A));
    check('their second report is still linked', again.body?.isDuplicate === true);
    eq('but does not count as another person', again.body?.cluster?.reportCount, 2);
    check('and does not raise the score again', again.body?.cluster?.raised === false);

    const ownRefile = track(await file(t1, BENCH[3], SPOT_A));
    check('the original author re-filing is linked', ownRefile.body?.isDuplicate === true);
    eq('but is not counted as a separate reporter', ownRefile.body?.cluster?.reportCount, 2);
    root = await adminGet(originalId);
    eq('and neither repeat added a vote', root.votes, votesBefore);
    eq('history still has one entry', root.priorityHistory.length, 1);

    // ------------------------------------------------------------------
    console.log('\nMore people, more urgency, capped at 5');
    const third = track(await file(t3, BENCH[4], SPOT_A));
    eq('three people: still one point up', third.body?.cluster?.reportCount, 3);
    check('no further raise yet', third.body?.cluster?.raised === false);
    track(await file(t4, BENCH[5], SPOT_A));
    const fifth = track(await file(t5, BENCH[0], SPOT_A));
    eq('five people have reported it', fifth.body?.cluster?.reportCount, 5);
    check('crossing five raises it again', fifth.body?.cluster?.raised === true);
    root = await adminGet(originalId);
    eq('two points above the AI\'s own score', root.priorityScore, Math.min(5, base + 2));
    eq('two escalations on record', root.priorityHistory.length, 2);

    const rows = await Issue.find({ isDuplicate: true, submitterEmail: { $regex: `^esc-test-${RUN}` } }).lean();
    check('every merged report points at the ORIGINAL, never at another duplicate',
          rows.length > 0 && rows.every(r => r.matchedComplaintId === originalId),
          rows.map(r => r.matchedComplaintId).join(', '));

    // ------------------------------------------------------------------
    console.log('\nFolded away in the views');
    const feed = (await call('/issues/feed')).body;
    const feedIds = feed.map(i => i._id);
    eq('the original appears once in the feed', feedIds.filter(id => id === originalId).length, 1);
    check('none of the merged reports appear separately', rows.every(r => !feedIds.includes(String(r._id))));
    eq('the feed says four other people reported it', feed.find(i => i._id === originalId)?.similarReports, 4);
    eq('...so five people in all', feed.find(i => i._id === originalId)?.reportCount, 5);
    check('the feed carries the reason it was raised',
          feed.find(i => i._id === originalId)?.priorityHistory?.length === 2);

    const queue = (await call('/issues', { token: admin })).body;
    check('the staff queue folds them away too', rows.every(r => !queue.some(i => i._id === String(r._id))));
    eq('and counts them on the original', queue.find(i => i._id === originalId)?.similarReports, 4);
    const withDups = (await call('/issues?includeDuplicates=true', { token: admin })).body;
    check('includeDuplicates=true lists them as rows again', rows.every(r => withDups.some(i => i._id === String(r._id))));

    const stats = (await call('/issues/stats', { token: admin })).body;
    eq('the headline total counts problems, not repeat reports',
       stats.total, await Issue.countDocuments({ isDuplicate: { $ne: true } }));
    eq('and repeat reports are counted separately',
       stats.repeatReports, await Issue.countDocuments({ isDuplicate: true }));

    // ------------------------------------------------------------------
    console.log('\nThe queue is ordered by urgency');
    const lamp = track(await file(t6, LAMP[0], SPOT_B));
    check('an unrelated, newer issue is filed', lamp.status === 201 && lamp.body.isDuplicate === false);
    const byUrgency = (await call('/issues', { token: admin })).body.map(i => i._id);
    check('the escalated grievance outranks the newer, lower-scored one',
          byUrgency.indexOf(originalId) < byUrgency.indexOf(lamp.body._id),
          `scores ${root.priorityScore} vs ${lamp.body.priorityScore}`);
    const byNewest = (await call('/issues?sort=newest', { token: admin })).body.map(i => i._id);
    check('?sort=newest restores filing order',
          byNewest.indexOf(lamp.body._id) < byNewest.indexOf(originalId));

    // ------------------------------------------------------------------
    console.log('\nThe citizen tracking view');
    const mine2 = (await call('/issues/my', { token: t2 })).body;
    const merged = mine2.filter(i => i.isDuplicate);
    eq('the second reporter sees both of their reports', merged.length, 2);
    check('each carries the shared picture of the report it joined',
          merged.every(m => m.linkedIssue?.title === original.body.title));
    eq('including how many people have reported it', merged[0].linkedIssue.reportCount, 5);
    eq('and its current, raised priority', merged[0].linkedIssue.priorityScore, Math.min(5, base + 2));
    eq('and why it was raised', merged[0].linkedIssue.priorityHistory.length, 2);
    const mine1 = (await call('/issues/my', { token: t1 })).body;
    eq('the original reporter sees how many others reported it',
       mine1.find(i => i._id === originalId)?.similarReports, 4);

    // ------------------------------------------------------------------
    console.log('\nProgress reaches everyone who reported it');
    const progress = await call(`/issues/${originalId}`, {
      method: 'PATCH', token: admin, body: { status: 'in-progress', adminNote: 'Carpenter assigned.' },
    });
    check('the owner advances the original', progress.status === 200);
    let dupRows = await Issue.find({ isDuplicate: true, matchedComplaintId: originalId }).lean();
    check('every merged report follows it', dupRows.length > 0 && dupRows.every(r => r.status === 'in-progress'));
    check('each records the change as inherited',
          dupRows.every(r => r.statusHistory.at(-1)?.viaOriginal === true));
    check('...with who did it and in what capacity',
          dupRows.every(r => r.statusHistory.at(-1)?.changedByTitle === 'System administrator'));
    check('the official note travels with it', dupRows.every(r => r.adminNote === 'Carpenter assigned.'));
    const originalAfter = await adminGet(originalId);
    check('the original\'s own entry is not marked inherited', !originalAfter.statusHistory.at(-1).viaOriginal);

    await call(`/issues/${originalId}`, { method: 'PATCH', token: admin, body: { status: 'resolved', adminNote: 'Bench repaired.' } });
    dupRows = await Issue.find({ isDuplicate: true, matchedComplaintId: originalId }).lean();
    check('resolving the original resolves them all', dupRows.every(r => r.status === 'resolved'));

    // ------------------------------------------------------------------
    console.log('\nA problem that comes back is not buried');
    const recurrence = track(await file(t6, BENCH[1], SPOT_A));
    check('reported again after being resolved, it is filed fresh',
          recurrence.status === 201 && recurrence.body.isDuplicate === false,
          JSON.stringify({ dup: recurrence.body?.isDuplicate, match: recurrence.body?.matchedComplaintId }));
    const stillResolved = await adminGet(originalId);
    eq('and the closed original is left alone', stillResolved.priorityScore, root.priorityScore);

    // ------------------------------------------------------------------
    console.log('\nThe owner\'s manual priority is respected');
    const lockOrig = track(await file(t1, LAMP[0], SPOT_B));   // joins the lamp report above
    const lampRoot = lamp.body._id;
    check('a second person reports the lamp, merging into it',
          lockOrig.body?.isDuplicate === true && lockOrig.body?.matchedComplaintId === lampRoot);
    // fresh cluster for the lock test, elsewhere so it cannot merge with anything
    const SPOT_C = { latitude: 25.5601, longitude: 91.9050 };
    const lockRoot = track(await file(t3, ['Cracked drain cover on the lane', 'The drain cover on the lane has a crack across it and rattles when anyone walks past.'], SPOT_C));
    await call(`/issues/${lockRoot.body._id}`, { method: 'PATCH', token: admin, body: { priority: 'low' } });
    const lockDup = track(await file(t4, ['Drain cover cracked in the lane', 'A crack runs across the drain cover in the lane and it rattles whenever someone walks by.'], SPOT_C));
    check('a report merges into the locked grievance', lockDup.body?.isDuplicate === true);
    check('but does not overwrite the owner\'s decision', lockDup.body?.cluster?.raised === false);
    const locked = await adminGet(lockRoot.body._id);
    eq('the score is untouched', locked.priorityScore, lockRoot.body.priorityScore);
    eq('and nothing was recorded', locked.priorityHistory.length, 0);
    check('it is marked locked', locked.priorityLocked === true);

    // ------------------------------------------------------------------
    console.log('\nDeleting an original un-merges its reports');
    const del = await call(`/issues/${lockRoot.body._id}`, { method: 'DELETE', token: admin });
    check('the original is deleted', del.status === 200);
    const released = await Issue.findById(lockDup.body._id).lean();
    check('the report merged into it stands alone again', released.isDuplicate === false && released.matchedComplaintId === null);
    const queueAfter = (await call('/issues', { token: admin })).body;
    check('and reappears in the staff queue', queueAfter.some(i => i._id === lockDup.body._id));
    created.splice(created.indexOf(lockRoot.body._id), 1);   // already gone

    // ------------------------------------------------------------------
    console.log('\nRepairing older data');
    const root0 = await Issue.create({ title: `synthetic root ${RUN}`, description: 'x', submittedBy: 'x', submitterEmail: `esc-test-${RUN}-syn`, state: 'Meghalaya' });
    const d1 = await Issue.create({ title: `synthetic d1 ${RUN}`, description: 'x', submittedBy: 'a', submitterEmail: `esc-test-${RUN}-syn`, state: 'Meghalaya', isDuplicate: true, matchedComplaintId: String(root0._id) });
    const d2 = await Issue.create({ title: `synthetic d2 ${RUN}`, description: 'x', submittedBy: 'b', submitterEmail: `esc-test-${RUN}-syn`, state: 'Meghalaya', isDuplicate: true, matchedComplaintId: String(d1._id) });
    const orphan = await Issue.create({ title: `synthetic orphan ${RUN}`, description: 'x', submittedBy: 'c', submitterEmail: `esc-test-${RUN}-syn`, state: 'Meghalaya', isDuplicate: true, matchedComplaintId: String(new mongoose.Types.ObjectId()) });

    eq('a chain of duplicates resolves to its root', String((await resolveRoot(d2._id))._id), String(root0._id));
    eq('an orphan has no root', await resolveRoot(orphan._id), null);

    const preview = await recomputeAllClusters({ dryRun: true });
    check('a dry run finds the chain to re-point', preview.repaired.relinked >= 1);
    check('and the orphan to release', preview.repaired.released >= 1);
    eq('a dry run writes nothing (chain)', (await Issue.findById(d2._id).lean()).matchedComplaintId, String(d1._id));
    eq('a dry run writes nothing (orphan)', (await Issue.findById(orphan._id).lean()).isDuplicate, true);

    const viaApi = await call('/issues/recompute-priorities?dryRun=true', { method: 'POST', token: admin });
    check('the owner endpoint offers the same preview', viaApi.status === 200 && viaApi.body.dryRun === true);
    const notOwner = await call('/issues/recompute-priorities?dryRun=true', { method: 'POST', token: t1 });
    check('and is closed to citizens', notOwner.status === 403, `got ${notOwner.status}`);

    await Issue.deleteMany({ submitterEmail: `esc-test-${RUN}-syn` });
  } finally {
    // ------------------------------------------------------------------
    console.log('\nCleanup');
    for (const id of created) {
      await call(`/issues/${id}`, { method: 'DELETE', token: admin });
    }
    await Issue.deleteMany({ submitterEmail: { $regex: `^esc-test-${RUN}` } });
    await User.deleteMany({ email: { $regex: `^esc-test-${RUN}` } });

    const indexAfter = await indexedCount(admin);
    const leftover = await Issue.countDocuments({ submitterEmail: { $regex: `^esc-test-${RUN}` } });
    check('no test grievances left in the database', leftover === 0);
    eq('and the vector index is back to its original size', indexAfter, indexBefore);
    await mongoose.disconnect();
  }

  console.log('\n' + '='.repeat(62));
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log('='.repeat(62));
  process.exit(failed ? 1 : 0);
};

run().catch(err => { console.error(err); process.exit(1); });
