/**
 * Repeat-report escalation and duplicate clusters.
 *
 * A grievance that several different people report is a bigger problem than
 * one reported once. When the duplicate detector links a new report to an
 * existing one, the existing ("original") grievance's priority score is raised
 * — so an official working the queue sees it sooner, and its SLA tightens.
 *
 * The rules, deliberately conservative:
 *  - Only DISTINCT people count. One citizen filing the same complaint three
 *    times is one voice, and would otherwise be a way to game the queue.
 *  - The score only ever goes UP from this rule, never down.
 *  - It is capped at 5, and never touches a grievance the owner set by hand
 *    (`priorityLocked`) or one that is already resolved.
 *  - Upvotes do not count. They cost one click, whereas a report takes real
 *    effort — and a duplicate report already adds an upvote, so counting both
 *    would score the same person twice.
 *
 * Duplicates stay as their own rows (so each citizen keeps a tracking id and
 * their own history) and are folded into the original for staff and feed views.
 */
import mongoose from 'mongoose';
import Issue from '../models/Issue.js';

// --- score tables -----------------------------------------------------------
// Mirrors sih-ai-service/app/sih/taxonomy.py (URGENCY_LEVELS, PORTAL_PRIORITY,
// SLA_HOURS). They are duplicated rather than fetched so escalation still works
// when the AI service is down; keep the two in step.
export const URGENCY_LEVELS = { 5: 'Critical', 4: 'High', 3: 'Moderate', 2: 'Low', 1: 'Routine' };
export const PORTAL_PRIORITY = { 5: 'high', 4: 'high', 3: 'medium', 2: 'low', 1: 'low' };
export const SLA_HOURS = { 5: 24, 4: 48, 3: 120, 2: 168, 1: 240 };

// --- escalation curve -------------------------------------------------------

const DEFAULT_STEPS = '2:1,5:2,10:3';

/**
 * "reports:boost" pairs, e.g. "2:1,5:2,10:3" means 2+ people → +1 point,
 * 5+ → +2, 10+ → +3. A single report can never escalate, so thresholds below 2
 * are ignored.
 */
export const parseSteps = (raw) => {
  const steps = String(raw || DEFAULT_STEPS)
    .split(',')
    .map(pair => pair.trim().split(':').map(Number))
    .filter(([reports, boost]) =>
      Number.isInteger(reports) && Number.isInteger(boost) && reports >= 2 && boost >= 1)
    .sort((a, b) => a[0] - b[0]);
  return steps.length ? steps : parseSteps(DEFAULT_STEPS);
};

const STEPS = parseSteps(process.env.ESCALATION_STEPS);

export const boostFor = (reportCount, steps = STEPS) => {
  let boost = 0;
  for (const [reports, points] of steps) {
    if (reportCount >= reports) boost = points;
  }
  return boost;
};

export const escalatedScore = (baseScore, reportCount, steps = STEPS) =>
  Math.min(5, Math.max(1, baseScore) + boostFor(reportCount, steps));

/**
 * The tighter of the existing deadline and a fresh window starting now.
 *
 * Measuring the new window from the moment of escalation (not from when the
 * grievance was filed) means an old grievance is not instantly marked breached
 * just because a new report arrived; taking the minimum means escalation can
 * only ever shorten a deadline.
 */
export const nextDeadline = ({ now, currentDeadline, targetHours }) => {
  const fresh = new Date(now.getTime() + targetHours * 3600 * 1000);
  if (!currentDeadline) return fresh;
  const current = new Date(currentDeadline);
  return current < fresh ? current : fresh;
};

// --- ordering ---------------------------------------------------------------

/**
 * Staff queue order: open before resolved, then highest score, then soonest
 * deadline, then oldest. This is what makes the priority score matter — without
 * it a Critical grievance sits wherever its filing date puts it.
 */
export const compareByUrgency = (a, b) => {
  const aClosed = a.status === 'resolved' ? 1 : 0;
  const bClosed = b.status === 'resolved' ? 1 : 0;
  if (aClosed !== bClosed) return aClosed - bClosed;

  const byScore = (b.priorityScore ?? 3) - (a.priorityScore ?? 3);
  if (byScore) return byScore;

  const aDue = a.sla?.deadline ? new Date(a.sla.deadline).getTime() : Infinity;
  const bDue = b.sla?.deadline ? new Date(b.sla.deadline).getTime() : Infinity;
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;

  return new Date(a.createdAt) - new Date(b.createdAt);
};

// --- clusters ---------------------------------------------------------------

const ROOT_FIELDS =
  '_id title status isDuplicate matchedComplaintId department state submittedBy priorityScore urgencyLevel';

/**
 * Follow a match back to the grievance the whole cluster hangs off.
 *
 * Every saved complaint — duplicates included — is indexed for similarity, so a
 * third report can match the second rather than the first. Linking it to the
 * second would leave it invisible to any count taken on the original, so the
 * chain is walked to its root. Returns null when the chain is broken (a
 * deleted or malformed id) or loops.
 */
export const resolveRoot = async (id) => {
  if (!id || !mongoose.isValidObjectId(id)) return null;

  const seen = new Set();
  let current = await Issue.findById(id).select(ROOT_FIELDS);

  for (let hops = 0; current && hops < 6; hops += 1) {
    if (!current.isDuplicate || !current.matchedComplaintId) return current;
    if (seen.has(String(current._id))) return null;
    seen.add(String(current._id));

    if (!mongoose.isValidObjectId(current.matchedComplaintId)) return null;
    current = await Issue.findById(current.matchedComplaintId).select(ROOT_FIELDS);
  }
  return null;
};

/** How many different people have reported this problem, the original included. */
export const countDistinctReporters = async (original) => {
  const reporters = await Issue.distinct('submittedBy', {
    isDuplicate: true,
    matchedComplaintId: String(original._id),
  });
  const others = new Set(reporters.filter(id => id && id !== original.submittedBy));
  return 1 + others.size;
};

/**
 * Attach `similarReports` (other people who reported the same problem) to each
 * original in a list, using two queries however long the list is.
 */
export const attachSimilarReports = async (issues) => {
  const originals = issues.filter(i => !i.isDuplicate);
  const ids = originals.map(i => String(i._id));

  if (ids.length) {
    const [authors, groups] = await Promise.all([
      Issue.find({ _id: { $in: ids } }).select('_id submittedBy').lean(),
      Issue.aggregate([
        { $match: { isDuplicate: true, matchedComplaintId: { $in: ids } } },
        { $group: { _id: '$matchedComplaintId', reporters: { $addToSet: '$submittedBy' } } },
      ]),
    ]);

    const authorOf = new Map(authors.map(a => [String(a._id), a.submittedBy]));
    const counts = new Map(groups.map(g => [
      g._id,
      g.reporters.filter(r => r && r !== authorOf.get(g._id)).length,
    ]));

    for (const issue of originals) {
      issue.similarReports = counts.get(String(issue._id)) || 0;
    }
  }

  for (const issue of issues) {
    if (issue.similarReports === undefined) issue.similarReports = 0;
    issue.reportCount = issue.similarReports + 1;
  }
  return issues;
};

/**
 * For reports merged into another, attach `linkedIssue`: the current shared
 * picture (priority, SLA, who has reported it) of the report they were merged
 * into. A merged report's own priority and deadline are meaningless — the
 * cluster moves as one — so the citizen's tracking view reads these instead.
 */
export const attachLinkedIssues = async (issues) => {
  const ids = [...new Set(
    issues
      .filter(i => i.isDuplicate && i.matchedComplaintId && mongoose.isValidObjectId(i.matchedComplaintId))
      .map(i => String(i.matchedComplaintId))
  )];
  if (!ids.length) return issues;

  const roots = await Issue.find({ _id: { $in: ids } })
    .select('title status department priorityScore urgencyLevel priority sla createdAt priorityHistory submittedBy')
    .lean();
  await attachSimilarReports(roots);
  const byId = new Map(roots.map(r => [String(r._id), r]));

  for (const issue of issues) {
    const root = issue.isDuplicate ? byId.get(String(issue.matchedComplaintId)) : null;
    if (!root) continue;
    issue.linkedIssue = {
      _id: root._id,
      title: root.title,
      status: root.status,
      department: root.department,
      priorityScore: root.priorityScore,
      urgencyLevel: root.urgencyLevel,
      priority: root.priority,
      sla: root.sla,
      createdAt: root.createdAt,
      priorityHistory: root.priorityHistory || [],
      similarReports: root.similarReports,
      reportCount: root.reportCount,
    };
  }
  return issues;
};

/**
 * Recompute an original's score from how many people have reported it.
 *
 * Idempotent and monotonic: running it twice changes nothing the second time,
 * and it can only raise a score. `dryRun` reports what would change without
 * writing, for previewing against real data.
 */
export const escalateCluster = async (originalId, { dryRun = false } = {}) => {
  const original = await Issue.findById(originalId);
  if (!original) return { skipped: 'missing' };
  if (original.isDuplicate) return { skipped: 'is-duplicate' };

  const reportCount = await countDistinctReporters(original);
  const current = original.priorityScore ?? 3;
  const base = original.aiTriage?.baseScore ?? current;
  const target = escalatedScore(base, reportCount);

  const result = { id: String(original._id), title: original.title, reportCount, from: current, to: current, raised: false };

  if (original.status === 'resolved') return { ...result, skipped: 'resolved' };
  if (original.priorityLocked) return { ...result, skipped: 'locked' };
  if (target <= current) return result;

  result.to = target;
  result.reason = `${reportCount} different people have reported this same problem nearby`;
  if (dryRun) return { ...result, dryRun: true };

  const now = new Date();
  const deadline = nextDeadline({
    now,
    currentDeadline: original.sla?.deadline,
    targetHours: SLA_HOURS[target],
  });

  // The filter makes this a compare-and-set: two reports landing at the same
  // instant cannot both apply, and a concurrent resolve or manual override wins.
  const updated = await Issue.findOneAndUpdate(
    {
      _id: original._id,
      priorityScore: { $lt: target },
      priorityLocked: { $ne: true },
      status: { $ne: 'resolved' },
    },
    {
      $set: {
        priorityScore: target,
        urgencyLevel: URGENCY_LEVELS[target],
        priority: PORTAL_PRIORITY[target],
        'sla.deadline': deadline,
        // Keep the label the SLA timer shows honest about the real window.
        'sla.targetHours': Math.max(1, Math.round((deadline - original.createdAt) / 3600000)),
        'aiTriage.baseScore': base,
      },
      $push: {
        priorityHistory: {
          at: now,
          fromScore: current,
          toScore: target,
          fromLevel: URGENCY_LEVELS[current],
          toLevel: URGENCY_LEVELS[target],
          reportCount,
          reason: result.reason,
        },
      },
    },
    { new: true }
  );

  return { ...result, raised: Boolean(updated), issue: updated };
};

/**
 * Copy a status change from an original onto the reports merged into it.
 *
 * Duplicates are hidden from staff, so nobody is ever going to advance them by
 * hand. Without this a citizen who reported a problem that then got fixed
 * would watch their own complaint sit at "pending" forever.
 */
export const propagateToDuplicates = async (original, { status, adminNote, actor }) => {
  const duplicates = await Issue.find({
    isDuplicate: true,
    matchedComplaintId: String(original._id),
    status: { $ne: status },
  });

  const at = new Date();
  const updated = [];
  for (const dup of duplicates) {
    dup.status = status;
    if (adminNote !== undefined) dup.adminNote = adminNote;
    dup.statusHistory.push({
      status,
      note: adminNote || '',
      changedAt: at,
      changedBy: actor.name,
      changedByRole: actor.role,
      changedByTitle: actor.title,
      changedByDepartment: actor.department,
      viaOriginal: true,
    });
    await dup.save();
    updated.push(dup);
  }
  return updated;
};

/**
 * Un-merge reports whose original is being deleted, so they reappear as
 * ordinary grievances instead of vanishing behind a parent that no longer exists.
 */
export const releaseDuplicates = async (originalIds) => {
  const ids = originalIds.map(String);
  if (!ids.length) return 0;
  const { modifiedCount } = await Issue.updateMany(
    { isDuplicate: true, matchedComplaintId: { $in: ids } },
    { $set: { isDuplicate: false, matchedComplaintId: null } }
  );
  return modifiedCount;
};

/**
 * Apply the escalation rule to clusters that already exist.
 *
 * Reports filed before this feature existed were never counted. This repairs
 * their links (a chain of duplicates is re-pointed at its root; a duplicate
 * whose original was deleted is released to stand alone) and then escalates
 * each original. Idempotent, and monotonic like escalateCluster.
 *
 * With `dryRun` nothing is written. Note a dry run counts reporters using the
 * links as they are now, so clusters that are chained will read low until the
 * repair has actually been applied.
 */
export const recomputeAllClusters = async ({ dryRun = false } = {}) => {
  const duplicates = await Issue.find({ isDuplicate: true }).select('_id matchedComplaintId').lean();
  const repaired = { relinked: 0, released: 0 };
  const roots = new Set();

  for (const dup of duplicates) {
    const root = await resolveRoot(dup._id);

    if (!root) {
      repaired.released += 1;
      if (!dryRun) {
        await Issue.updateOne({ _id: dup._id }, { $set: { isDuplicate: false, matchedComplaintId: null } });
      }
      continue;
    }

    if (String(root._id) !== String(dup.matchedComplaintId)) {
      repaired.relinked += 1;
      if (!dryRun) {
        await Issue.updateOne({ _id: dup._id }, { $set: { matchedComplaintId: String(root._id) } });
      }
    }
    roots.add(String(root._id));
  }

  const outcomes = [];
  for (const id of roots) outcomes.push(await escalateCluster(id, { dryRun }));

  return {
    dryRun,
    clusters: roots.size,
    repaired,
    raised: outcomes
      .filter(o => o.to > o.from)
      .map(({ id, title, reportCount, from, to }) => ({ id, title, reportCount, from, to })),
    skipped: outcomes
      .filter(o => o.skipped)
      .map(({ id, title, skipped }) => ({ id, title, reason: skipped })),
  };
};
