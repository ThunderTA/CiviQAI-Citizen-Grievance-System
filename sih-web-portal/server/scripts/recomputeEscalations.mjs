/**
 * Apply repeat-report escalation to grievances that already exist.
 *
 *   node scripts/recomputeEscalations.mjs           preview only (default)
 *   node scripts/recomputeEscalations.mjs --apply   write the changes
 *
 * Safe to re-run: it only ever raises a score, and a second run changes nothing.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { recomputeAllClusters } from '../services/escalation.js';

dotenv.config();
const apply = process.argv.includes('--apply');

await mongoose.connect(process.env.MONGODB_URI);
const result = await recomputeAllClusters({ dryRun: !apply });

console.log(apply ? '\nAPPLIED' : '\nDRY RUN — nothing was changed (pass --apply to write)');
console.log(`  clusters found : ${result.clusters}`);
console.log(`  links repaired : ${result.repaired.relinked} re-pointed, ${result.repaired.released} released`);
console.log(`  scores raised  : ${result.raised.length}`);
for (const r of result.raised) {
  console.log(`    ${r.from} -> ${r.to}  (${r.reportCount} people)  ${r.title}`);
}
if (result.skipped.length) {
  console.log(`  skipped        : ${result.skipped.length}`);
  for (const s of result.skipped) console.log(`    ${s.reason.padEnd(10)} ${s.title}`);
}
await mongoose.disconnect();
