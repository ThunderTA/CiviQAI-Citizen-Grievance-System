/**
 * Permission-boundary checks against a running API.
 *
 *   node tests/permissions.test.mjs
 *
 * The rule these protect: a government official may advance a grievance in
 * their assigned department and region, and may do nothing else. That is a security property,
 * not a UI preference, so it is asserted against the HTTP API — hiding a
 * button proves nothing.
 */
const BASE = process.env.API_URL || 'http://localhost:3000/api';

let passed = 0;
let failed = 0;

const check = (label, condition, detail = '') => {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${label}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${label}${detail ? `\n         ${detail}` : ''}`);
  }
};

const call = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let payload = null;
  try { payload = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: payload };
};

const login = async (email, password) => {
  const { body } = await call('/auth/login', { method: 'POST', body: { email, password } });
  return body?.token;
};

const run = async () => {
  console.log('='.repeat(62));
  console.log('Permission boundaries');
  console.log('='.repeat(62));

  const adminToken = await login('admin@demo.in', 'demo12345');
  if (!adminToken) {
    console.error('Could not sign in as admin@demo.in. Run `node seedDemo.js --reset` first.');
    process.exit(1);
  }

  const feed = await call('/issues/feed');
  const target = feed.body?.[0];
  if (!target) {
    console.error('No grievances to test against. Run `node seedDemo.js --reset` first.');
    process.exit(1);
  }

  // A throwaway official for this run, assigned to the target's queue.
  const email = `perm-test-${Date.now()}@gov.in`;
  const password = 'permtest12345';
  const created = await call('/auth/officials', {
    method: 'POST', token: adminToken,
    body: {
      email, password, name: 'Permission Test Officer', designation: 'Inspector',
      department: target.department, region: target.state,
    },
  });
  check('owner can provision an official', created.status === 201,
        JSON.stringify(created.body));

  const officialToken = await login(email, password);
  check('the official can sign in', Boolean(officialToken));

  // --- what an official MAY do -------------------------------------------
  console.log('\nAllowed for an official');

  const read = await call('/issues', { token: officialToken });
  check('read only the assigned department and region', read.status === 200 &&
        read.body.every(issue => issue.department === target.department && issue.state === target.state));

  const advance = await call(`/issues/${target._id}`, {
    method: 'PATCH', token: officialToken,
    body: { status: 'in-progress', adminNote: 'Inspected on site.' },
  });
  check('advance status and add a note', advance.status === 200);
  check('the action is attributed in the history',
        advance.body?.statusHistory?.some(h => h.changedByRole === 'official'));

  // --- what an official MAY NOT do ---------------------------------------
  console.log('\nBlocked for an official');

  for (const [label, body] of [
    ['change priority', { priority: 'low' }],
    ['reassign department', { department: 'General Administration' }],
    ['rewrite the title', { title: 'Nothing to see here' }],
    ['rewrite the description', { description: 'No issue found.' }],
    ['change the category', { category: 'Other' }],
    ['move the coordinates', { coordinates: { latitude: 0, longitude: 0 } }],
    ['inflate the vote count', { votes: 9999 }],
  ]) {
    const res = await call(`/issues/${target._id}`, {
      method: 'PATCH', token: officialToken, body,
    });
    check(label, res.status === 403, `got ${res.status}: ${JSON.stringify(res.body)}`);
  }

  const del = await call(`/issues/${target._id}`, { method: 'DELETE', token: officialToken });
  check('delete a grievance', del.status === 403, `got ${del.status}`);

  const bulkDel = await call('/issues/bulk', {
    method: 'DELETE', token: officialToken, body: { ids: [target._id] },
  });
  check('bulk delete', bulkDel.status === 403, `got ${bulkDel.status}`);

  const bulkPatch = await call('/issues/bulk', {
    method: 'PATCH', token: officialToken, body: { ids: [target._id], update: { priority: 'low' } },
  });
  check('bulk update', bulkPatch.status === 403, `got ${bulkPatch.status}`);

  const mintOfficial = await call('/auth/officials', {
    method: 'POST', token: officialToken,
    body: { email: 'self@gov.in', password: 'selfmade12345', name: 'Self Made' },
  });
  check('provision another official', mintOfficial.status === 403, `got ${mintOfficial.status}`);

  const ownerData = await call('/issues/ai-status', { token: officialToken });
  check('read the owner console data', ownerData.status === 403, `got ${ownerData.status}`);

  // --- the grievance survived unchanged ----------------------------------
  console.log('\nIntegrity after the attempts');
  const after = (await call('/issues/feed')).body.find(i => i._id === target._id);
  check('grievance still exists', Boolean(after));
  check('title unchanged', after?.title === target.title);
  check('description unchanged', after?.description === target.description);
  check('priority unchanged', after?.priority === target.priority);
  check('department unchanged', after?.department === target.department);

  // --- citizens are not staff --------------------------------------------
  console.log('\nCitizen boundaries');
  const citizenToken = await login('citizen@demo.in', 'demo12345');
  if (citizenToken) {
    const list = await call('/issues', { token: citizenToken });
    check('citizen cannot read the staff queue', list.status === 403, `got ${list.status}`);
    const patch = await call(`/issues/${target._id}`, {
      method: 'PATCH', token: citizenToken, body: { status: 'resolved' },
    });
    check('citizen cannot change status', patch.status === 403, `got ${patch.status}`);
  } else {
    console.log('  [SKIP] citizen@demo.in not seeded');
  }

  // --- anonymous ----------------------------------------------------------
  console.log('\nUnauthenticated');
  const anon = await call(`/issues/${target._id}`, { method: 'PATCH', body: { status: 'resolved' } });
  check('anonymous cannot change status', anon.status === 401, `got ${anon.status}`);

  // Clean up the throwaway account.
  const officials = await call('/auth/officials', { token: adminToken });
  const mine = officials.body?.find(o => o.email === email);
  if (mine) await call(`/auth/officials/${mine.id}`, { method: 'DELETE', token: adminToken });

  console.log('\n' + '='.repeat(62));
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log('='.repeat(62));
  process.exit(failed ? 1 : 0);
};

run().catch(err => { console.error(err); process.exit(1); });
