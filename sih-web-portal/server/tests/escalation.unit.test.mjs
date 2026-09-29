/**
 * Escalation rules that need no database or running stack.
 *
 *   node tests/escalation.unit.test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseSteps, boostFor, escalatedScore, nextDeadline, compareByUrgency,
  URGENCY_LEVELS, PORTAL_PRIORITY, SLA_HOURS,
} from '../services/escalation.js';

let passed = 0, failed = 0;
const check = (label, ok, detail = '') => {
  ok ? passed++ : failed++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${!ok && detail ? `\n         ${detail}` : ''}`);
};
const eq = (label, actual, expected) =>
  check(label, JSON.stringify(actual) === JSON.stringify(expected),
        `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

console.log('='.repeat(62));
console.log('Escalation rules');
console.log('='.repeat(62));

console.log('\nStep configuration');
eq('default steps', parseSteps(undefined), [[2, 1], [5, 2], [10, 3]]);
eq('custom steps are sorted', parseSteps('10:3,2:1'), [[2, 1], [10, 3]]);
eq('a threshold below 2 is ignored (one report cannot escalate)', parseSteps('1:1,3:1'), [[3, 1]]);
eq('garbage falls back to the defaults', parseSteps('nonsense,x:y'), [[2, 1], [5, 2], [10, 3]]);
eq('zero boost is ignored', parseSteps('2:0,4:1'), [[4, 1]]);

console.log('\nBoost curve');
for (const [reports, boost] of [[1, 0], [2, 1], [4, 1], [5, 2], [9, 2], [10, 3], [500, 3]]) {
  eq(`${reports} report${reports === 1 ? '' : 's'} -> +${boost}`, boostFor(reports), boost);
}

console.log('\nScore');
eq('a single report never raises the score', escalatedScore(2, 1), 2);
eq('two reports: Low (2) -> Moderate (3)', escalatedScore(2, 2), 3);
eq('five reports: Low (2) -> High (4)', escalatedScore(2, 5), 4);
eq('ten reports: Low (2) -> Critical (5)', escalatedScore(2, 10), 5);
eq('capped at 5, however many reports', escalatedScore(4, 500), 5);
eq('an already-Critical grievance stays at 5', escalatedScore(5, 10), 5);
eq('a nonsense base is clamped up to 1', escalatedScore(0, 1), 1);

console.log('\nDeadline');
const now = new Date('2026-09-28T10:00:00Z');
const hours = (n) => new Date(now.getTime() + n * 3600 * 1000);
eq('no existing deadline -> a fresh window from now',
   nextDeadline({ now, currentDeadline: null, targetHours: 24 }), hours(24));
eq('a later existing deadline is pulled in to the new window',
   nextDeadline({ now, currentDeadline: hours(100), targetHours: 24 }), hours(24));
eq('an earlier existing deadline is never pushed back',
   nextDeadline({ now, currentDeadline: hours(5), targetHours: 24 }), hours(5));
eq('an already-passed deadline is not extended',
   nextDeadline({ now, currentDeadline: hours(-10), targetHours: 24 }), hours(-10));

console.log('\nQueue order');
const mk = (id, over) => ({ id, status: 'pending', priorityScore: 3, createdAt: '2026-09-01', ...over });
const order = (items) => [...items].sort(compareByUrgency).map(i => i.id);
eq('higher score first',
   order([mk('low', { priorityScore: 2 }), mk('crit', { priorityScore: 5 }), mk('mid')]),
   ['crit', 'mid', 'low']);
eq('resolved always sinks below open, even at a higher score',
   order([mk('done', { priorityScore: 5, status: 'resolved' }), mk('open', { priorityScore: 1 })]),
   ['open', 'done']);
eq('same score: soonest deadline first',
   order([mk('later', { sla: { deadline: '2026-10-05' } }), mk('sooner', { sla: { deadline: '2026-10-01' } })]),
   ['sooner', 'later']);
eq('a missing deadline sorts after a present one',
   order([mk('none'), mk('has', { sla: { deadline: '2026-10-01' } })]),
   ['has', 'none']);
eq('all else equal: oldest first',
   order([mk('newer', { createdAt: '2026-09-10' }), mk('older', { createdAt: '2026-09-02' })]),
   ['older', 'newer']);
eq('two grievances with no deadline do not produce NaN ordering',
   order([mk('a', { createdAt: '2026-09-03' }), mk('b', { createdAt: '2026-09-02' })]),
   ['b', 'a']);

console.log('\nTables are complete');
for (const level of [1, 2, 3, 4, 5]) {
  check(`level ${level} has a label, coarse priority and SLA`,
        URGENCY_LEVELS[level] && PORTAL_PRIORITY[level] && SLA_HOURS[level] > 0);
}
check('SLA gets tighter as urgency rises',
      SLA_HOURS[5] < SLA_HOURS[4] && SLA_HOURS[4] < SLA_HOURS[3] &&
      SLA_HOURS[3] < SLA_HOURS[2] && SLA_HOURS[2] < SLA_HOURS[1]);

console.log('\nStays in step with the AI service taxonomy');
const taxonomyPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../sih-ai-service/app/sih/taxonomy.py'
);
if (fs.existsSync(taxonomyPath)) {
  const py = fs.readFileSync(taxonomyPath, 'utf8');
  const table = (name) => {
    const block = py.match(new RegExp(`${name}[^=]*=\\s*\\{([^}]*)\\}`, 's'))?.[1] || '';
    return Object.fromEntries(
      [...block.matchAll(/(\d)\s*:\s*(?:"([^"]+)"|'([^']+)'|(\d+))/g)]
        .map(m => [m[1], m[2] ?? m[3] ?? Number(m[4])])
    );
  };
  const asStrings = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v]));
  eq('SLA hours match taxonomy.py', asStrings(SLA_HOURS), table('SLA_HOURS'));
  eq('urgency labels match taxonomy.py', asStrings(URGENCY_LEVELS), table('URGENCY_LEVELS'));
  eq('coarse priorities match taxonomy.py', asStrings(PORTAL_PRIORITY), table('PORTAL_PRIORITY'));
} else {
  console.log('  [SKIP] taxonomy.py not found next to this project');
}

console.log('\n' + '='.repeat(62));
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(62));
process.exit(failed ? 1 : 0);
