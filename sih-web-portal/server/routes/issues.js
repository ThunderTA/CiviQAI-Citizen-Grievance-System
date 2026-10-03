import express from 'express';
import {
  requireAuth,
  requireAdmin,
  requireAdminOrDeptAdmin,
  requireOfficial,
  requireOfficialScope,
  denyOfficialDeletion,
  isAdminEmail,
  OFFICIAL_ROLES,
  optionalAuth,
} from '../middleware/auth.js';
import Issue from '../models/Issue.js';
import User from '../models/User.js';
import { analyzeIssue, verifyResolution } from '../controllers/aiController.js';
import { dispatchMultiChannelNotification, sendWhatsAppNotification } from '../controllers/smsWhatsappController.js';
import { calculateSLA, evaluateEscalation, calculateDistance, formatDistance } from '../controllers/slaController.js';
import {
  analyzeComplaint,
  indexComplaint,
  removeFromIndex,
  bulkIndexComplaints,
  aiServiceHealth,
  getTaxonomy,
} from '../services/aiServiceClient.js';
import {
  URGENCY_LEVELS,
  attachLinkedIssues,
  attachSimilarReports,
  compareByUrgency,
  escalateCluster,
  propagateToDuplicates,
  recomputeAllClusters,
  releaseDuplicates,
  resolveRoot,
} from '../services/escalation.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { DEMO_MODE } from '../middleware/demoMode.js';
import { io } from '../server.js';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

const scopedIssueFilter = (req) => req.auth.role === 'admin'
  ? {}
  : { department: req.officialScope.department, state: req.officialScope.region };

// POST /api/issues — submit a new issue (citizen)
// Only in the public demo: the database is open to anyone holding a guest login,
// so cap how many grievances one account can file per hour. Off otherwise, so
// normal use and the test suites are unaffected.
const submissionLimiter = DEMO_MODE
  ? rateLimit({ windowMs: 60 * 60 * 1000, max: 10, keyOn: (req) => `submit:${req.auth?.userId || req.ip}` })
  : (req, res, next) => next();

router.post('/', requireAuth, submissionLimiter, async (req, res) => {
  try {
    const {
      title,
      description,
      location,
      imageBase64,
      state,
      submitterPhone,
      notifyViaSms,
      notifyViaWhatsapp,
      coordinates, // { latitude, longitude }
    } = req.body;
    // Identity comes straight off the verified JWT — no external call, so
    // submission no longer depends on a third-party auth service being up.
    const userId = req.auth.userId;
    const submitterName = req.auth.name || 'Citizen';
    const submitterEmail = req.auth.email || '';

    // Two analyses run in parallel — they answer different questions and
    // neither should wait on the other:
    //   • The Python AI service does text triage: department routing, the 1–5
    //     priority score, and the semantic duplicate check against every
    //     grievance already filed.
    //   • The existing Groq vision pass inspects the attached photo, which the
    //     text-only service cannot do.
    // `allSettled` because a rejection in either must not lose the complaint.
    const [triageResult, visionResult] = await Promise.allSettled([
      analyzeComplaint({
        title,
        description,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
      }),
      analyzeIssue(title, description, imageBase64),
    ]);

    const triage = triageResult.status === 'fulfilled' ? triageResult.value : null;
    const vision = visionResult.status === 'fulfilled' ? visionResult.value : null;

    if (triageResult.status === 'rejected') {
      console.error('AI triage threw unexpectedly:', triageResult.reason);
    }

    // The AI service flags a likely duplicate; whether it is one that can be
    // merged is decided here, against what is actually in the database:
    //  - the match may itself be a duplicate (every saved report is indexed), so
    //    follow it back to the report the cluster hangs off;
    //  - a match that no longer exists (stale index) or that is already
    //    resolved is NOT merged. A problem reported again after it was fixed has
    //    come back, and burying that under a closed ticket would hide it.
    let mergeInto = null;
    if (triage?.isDuplicate && triage.matchedComplaintId) {
      const root = await resolveRoot(triage.matchedComplaintId);
      if (root && root.status !== 'resolved') mergeInto = root;
    }

    // The Python service owns routing and prioritisation; the vision pass owns
    // the photo verdict. Where both produce a value (category, sentiment,
    // summary) the dedicated triage service wins, with vision as the fallback.
    const priority = triage?.priority || vision?.priority || 'medium';
    // Prefer the AI's 1-5-derived target so Critical gets 24h, not high's 48h.
    const sla = calculateSLA(priority, new Date(), triage?.slaHours);

    const issue = await Issue.create({
      title,
      description,
      location,
      imageBase64,
      state,
      coordinates: (coordinates?.latitude && coordinates?.longitude) ? coordinates : undefined,
      sla,
      submittedBy: userId,
      submitterName,
      submitterEmail,
      submitterPhone: submitterPhone || '',
      notifyViaSms: Boolean(notifyViaSms),
      notifyViaWhatsapp: Boolean(notifyViaWhatsapp),

      // --- AI classification & prioritisation ---
      category: triage?.category || vision?.category || 'Other',
      // A merged report belongs to whoever owns the original, so the citizen's
      // tracking view does not name a different department than the one that
      // is actually handling it.
      department: mergeInto?.department || triage?.department || 'General Administration',
      priority,
      priorityScore: triage?.priorityScore ?? 3,
      urgencyLevel: triage?.urgencyLevel || 'Moderate',
      sentiment: triage?.sentiment || vision?.sentiment || 'neutral',
      aiSummary: triage?.aiSummary || vision?.aiSummary || '',

      // --- semantic duplicate detection ---
      isDuplicate: Boolean(mergeInto),
      matchedComplaintId: mergeInto ? String(mergeInto._id) : null,
      similarityScore: triage?.similarityScore ?? 0,
      matchedDistanceMeters: triage?.matchedDistanceMeters ?? null,
      similarComplaints: triage?.similarComplaints || [],
      aiTriage: {
        reasoning: triage?.priorityReasoning || '',
        source: triage?.analysisSource || 'fallback',
        serviceStatus: triage?.aiServiceStatus || 'unknown',
        analyzedAt: new Date(),
        // Remembered so escalation can say what the AI originally judged.
        baseScore: triage?.priorityScore ?? 3,
      },

      // --- photo analysis (vision pass only) ---
      imageAnalysis: vision?.imageAnalysis,
    });

    // Index the saved complaint so the *next* submission can match against it.
    // Deliberately after the write: the vector store must only ever hold ids
    // that exist in MongoDB, or matchedComplaintId could point at nothing.
    // Not awaited — the citizen should not wait on bookkeeping.
    indexComplaint({
      complaintId: issue._id,
      title: issue.title,
      description: issue.description,
      latitude: issue.coordinates?.latitude,
      longitude: issue.coordinates?.longitude,
      category: issue.category,
      status: issue.status,
    }).catch(err => console.error('Indexing failed:', err));

    // A duplicate is still recorded — the citizen gets a tracking id and their
    // own history — but it is folded into the original: it adds a supporter, and
    // if enough DIFFERENT people have now reported the problem, the original's
    // priority is raised so the people working the queue see it sooner.
    let cluster = null;
    if (mergeInto) {
      // No vote from the original's own author or from someone who already
      // backed it; either would let one person inflate a count by refiling.
      await Issue.findOneAndUpdate(
        { _id: mergeInto._id, voters: { $ne: userId }, submittedBy: { $ne: userId } },
        { $push: { voters: userId }, $inc: { votes: 1 } }
      ).catch(err => console.error('Failed to upvote original complaint:', err));

      const outcome = await escalateCluster(mergeInto._id)
        .catch(err => { console.error('Escalation failed:', err); return null; });

      cluster = {
        originalId: String(mergeInto._id),
        reportCount: outcome?.reportCount ?? null,
        raised: Boolean(outcome?.raised),
        fromScore: outcome?.from ?? null,
        priorityScore: outcome?.raised ? outcome.to : (outcome?.from ?? mergeInto.priorityScore),
        urgencyLevel: outcome?.raised
          ? URGENCY_LEVELS[outcome.to]
          : URGENCY_LEVELS[outcome?.from ?? mergeInto.priorityScore],
      };

      const changed = outcome?.issue || await Issue.findById(mergeInto._id);
      if (changed) io.to('admins').emit('issue_updated', changed);

      if (outcome?.raised) {
        // Tell the person who first reported it that it just became more urgent.
        io.to(`user_${mergeInto.submittedBy}`).emit('citizen_notification', {
          message: `"${mergeInto.title}" was raised to ${cluster.urgencyLevel} priority — ` +
                   `${cluster.reportCount} people have now reported it`,
          issueId: mergeInto._id,
          status: changed?.status || 'pending',
        });
      }
    }

    // Notify admins in real-time
    io.to('admins').emit('new_issue', issue);

    // If opted in for WhatsApp confirmation, dispatch welcome alert
    if (submitterPhone && notifyViaWhatsapp) {
      sendWhatsAppNotification({
        to: submitterPhone,
        issueTitle: issue.title,
        status: 'pending',
        note: `Your issue has been registered. SLA Target: ${sla.targetHours} hours.`,
      }).catch(err => console.error(err));
    }

    res.status(201).json(cluster ? { ...issue.toObject(), cluster } : issue);
  } catch (err) {
    console.error('Issue submission error:', err);
    res.status(500).json({ error: 'Failed to submit issue' });
  }
});

// GET /api/issues/my — citizen's own issues
router.get('/my', requireAuth, async (req, res) => {
  try {
    const issues = await Issue.find({ submittedBy: req.auth.userId }).sort({ createdAt: -1 });
    const evaluated = issues.map(i => evaluateEscalation(i.toObject ? i.toObject() : i));
    // The citizen sees every report they filed, merged ones included — but a
    // merged one carries the shared status of the report it was folded into.
    await attachSimilarReports(evaluated);
    await attachLinkedIssues(evaluated);
    res.json(evaluated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

// GET /api/issues/stats — dashboard counters (any staff role)
router.get('/stats', requireAuth, requireOfficial, requireOfficialScope, async (req, res) => {
  try {
    const now = new Date();
    // Repeat reports are folded into their original everywhere staff look, so
    // the headline counts must too — otherwise "Total 15" sits above a list
    // that shows 12 rows.
    const scope = { ...scopedIssueFilter(req), isDuplicate: { $ne: true } };
    const [total, pending, inProgress, resolved, escalated, repeatReports] = await Promise.all([
      Issue.countDocuments(scope),
      Issue.countDocuments({ ...scope, status: 'pending' }),
      Issue.countDocuments({ ...scope, status: 'in-progress' }),
      Issue.countDocuments({ ...scope, status: 'resolved' }),
      Issue.countDocuments({
        ...scope,
        status: { $ne: 'resolved' },
        $or: [
          { 'sla.isBreached': true },
          { 'sla.deadline': { $lt: now } },
          { createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        ],
      }),
      Issue.countDocuments({ ...scopedIssueFilter(req), isDuplicate: true }),
    ]);
    res.json({ total, pending, inProgress, resolved, escalated, repeatReports });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/issues/analytics — full analytics data (admin)
router.get('/analytics', requireAuth, requireOfficial, requireOfficialScope, async (req, res) => {
  try {
    const match = scopedIssueFilter(req);
    const [byCategory, bySentiment, byStatus, recentIssues] = await Promise.all([
      Issue.aggregate([{ $match: match }, { $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Issue.aggregate([{ $match: match }, { $group: { _id: '$sentiment', count: { $sum: 1 } } }]),
      Issue.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Issue.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 30 },
      ]),
    ]);

    res.json({
      scope: req.auth.role === 'admin' ? null : req.officialScope,
      byCategory: byCategory.map(i => ({ name: i._id || 'Other', count: i.count })),
      bySentiment: bySentiment.map(i => ({ name: i._id || 'neutral', count: i.count })),
      byStatus: byStatus.map(i => ({ name: i._id || 'pending', count: i.count })),
      byDate: recentIssues.map(i => ({ date: i._id, count: i.count })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// GET /api/issues/public — public map data (no auth required)
router.get('/public', async (req, res) => {
  try {
    const issues = await Issue.find()
      .select('title category status priority sentiment location state coordinates votes createdAt imageAnalysis resolutionVerification sla department priorityScore urgencyLevel isDuplicate matchedComplaintId similarityScore matchedDistanceMeters aiTriage')
      .sort({ createdAt: -1 });

    const evaluated = issues.map(i => evaluateEscalation(i.toObject ? i.toObject() : i));
    res.json(evaluated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

// GET /api/issues — staff issues with optional filters.
//
// Owners see every issue. Every other staff member is constrained by the API
// to their own department and region; query parameters can only narrow this.
router.get('/', requireAuth, requireOfficial, requireOfficialScope, async (req, res) => {
  try {
    const {
      status, priority, category, sentiment, escalated, lat, lng, radius,
      sort, includeDuplicates,
    } = req.query;
    const filter = scopedIssueFilter(req);
    // Repeat reports are folded into their original; pass includeDuplicates=true
    // to list them as separate rows.
    if (includeDuplicates !== 'true') filter.isDuplicate = { $ne: true };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;
    if (sentiment) filter.sentiment = sentiment;

    let issues = await Issue.find(filter).sort({ createdAt: -1 });

    // Evaluate SLA escalation for each issue
    issues = issues.map(i => {
      const obj = i.toObject ? i.toObject() : i;
      const evaluated = evaluateEscalation(obj);

      // Attach distance if coordinates are supplied in query
      if (lat && lng && evaluated.coordinates?.latitude && evaluated.coordinates?.longitude) {
        const distKm = calculateDistance(
          parseFloat(lat),
          parseFloat(lng),
          evaluated.coordinates.latitude,
          evaluated.coordinates.longitude
        );
        evaluated.distanceKm = distKm;
        evaluated.distanceFormatted = formatDistance(distKm);
      }
      return evaluated;
    });

    // Filter by escalated if requested
    if (escalated === 'true') {
      issues = issues.filter(i => i.sla?.isBreached || i.status === 'pending' && (Date.now() - new Date(i.createdAt)) > 7 * 86400000);
    }

    // Filter by radius if requested
    if (radius && lat && lng) {
      const radKm = parseFloat(radius);
      issues = issues.filter(i => i.distanceKm != null && i.distanceKm <= radKm);
    }

    await attachSimilarReports(issues);

    // Most urgent first by default: this is where the priority score, including
    // any raised by repeat reports, actually decides what an official sees
    // first. `?sort=newest` restores plain filing order.
    if (sort !== 'newest') issues.sort(compareByUrgency);

    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

// GET /api/issues/feed — public for citizens, scoped for signed-in officials.
// An official coming from the community feed must see only their own work
// area, not every department's or region's citizen reports.
router.get('/feed', optionalAuth, async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    const filter = {};

    if (OFFICIAL_ROLES.includes(req.auth?.role)) {
      const official = await User.findById(req.auth.userId).select('department region').lean();
      if (!official?.department || !official?.region) {
        return res.status(403).json({
          error: 'Your official account needs a department and region assignment. Contact the system owner.',
          code: 'official_assignment_required',
        });
      }
      filter.department = official.department;
      filter.state = official.region;
    }

    // Repeat reports are folded into their original: the feed lists each
    // problem once, with a count of how many people reported it.
    filter.isDuplicate = { $ne: true };

    const rawIssues = await Issue.find(filter)
      .select('title description aiSummary category status priority sentiment state location coordinates votes submitterName createdAt statusHistory adminNote department imageBase64 resolutionImageBase64 resolutionVerification imageAnalysis rating comments sla priorityScore urgencyLevel isDuplicate matchedComplaintId similarityScore matchedDistanceMeters aiTriage similarComplaints priorityHistory')
      .sort({ votes: -1, createdAt: -1 })
      .limit(200);

    let issues = rawIssues.map(i => {
      const obj = i.toObject ? i.toObject() : i;
      const evaluated = evaluateEscalation(obj);

      if (lat && lng && evaluated.coordinates?.latitude && evaluated.coordinates?.longitude) {
        const distKm = calculateDistance(
          parseFloat(lat),
          parseFloat(lng),
          evaluated.coordinates.latitude,
          evaluated.coordinates.longitude
        );
        evaluated.distanceKm = distKm;
        evaluated.distanceFormatted = formatDistance(distKm);
      }
      return evaluated;
    });

    // If radius filtering is requested
    if (radius && lat && lng) {
      const maxRadius = parseFloat(radius);
      issues = issues.filter(i => i.distanceKm != null && i.distanceKm <= maxRadius);
    }

    await attachSimilarReports(issues);

    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// GET /api/issues/search — similar issue detection (no auth)
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 4) return res.json([]);
    const issues = await Issue.find({
      title: { $regex: q.trim(), $options: 'i' },
    })
      .select('title category status votes state imageAnalysis coordinates sla department priorityScore urgencyLevel isDuplicate')
      .limit(3);
    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/issues/taxonomy — every category and department, no auth required.
// The citizen submission form, the admin filters and the owner console all
// read from here instead of keeping their own hand-maintained lists.
router.get('/taxonomy', async (req, res) => {
  res.json(await getTaxonomy());
});

// GET /api/issues/ai-status — is the AI service live, and on which engines? (admin)
router.get('/ai-status', requireAuth, requireAdmin, async (req, res) => {
  res.json(await aiServiceHealth());
});

// POST /api/issues/ai-reindex — rebuild the vector index from MongoDB (admin)
//
// Needed after restoring a database, or on first run against an existing
// corpus: the index lives outside Mongo, so it has to be replayed from it.
router.post('/ai-reindex', requireAuth, requireAdmin, async (req, res) => {
  try {
    const issues = await Issue.find({ isDuplicate: { $ne: true } })
      .select('title description coordinates category status')
      .lean();
    const result = await bulkIndexComplaints(issues);
    res.json({ requested: issues.length, ...result });
  } catch (err) {
    console.error('Reindex failed:', err);
    res.status(500).json({ error: 'Reindex failed' });
  }
});

// POST /api/issues/recompute-priorities — apply repeat-report escalation to
// clusters that already exist (owner). `?dryRun=true` previews without writing.
router.post('/recompute-priorities', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json(await recomputeAllClusters({ dryRun: req.query.dryRun === 'true' }));
  } catch (err) {
    console.error('Recompute failed:', err);
    res.status(500).json({ error: 'Recompute failed' });
  }
});

// GET /api/issues/duplicates — duplicate clusters for the admin console (admin)
router.get('/duplicates', requireAuth, requireAdmin, async (req, res) => {
  try {
    const duplicates = await Issue.find({ isDuplicate: true })
      .select('title matchedComplaintId similarityScore category department createdAt submitterName')
      .sort({ createdAt: -1 })
      .lean();

    // Group by the original so the console shows "1 issue, 6 reports" rather
    // than six separate rows.
    const clusters = {};
    for (const dup of duplicates) {
      (clusters[dup.matchedComplaintId] ||= []).push(dup);
    }

    const originals = await Issue.find({ _id: { $in: Object.keys(clusters) } })
      .select('title category department status votes createdAt')
      .lean();

    res.json(originals.map(original => ({
      original,
      duplicates: clusters[String(original._id)] || [],
      duplicateCount: (clusters[String(original._id)] || []).length,
    })));
  } catch (err) {
    console.error('Duplicate fetch failed:', err);
    res.status(500).json({ error: 'Failed to fetch duplicates' });
  }
});

// PATCH /api/issues/bulk — bulk status/priority update (owner only)
router.patch('/bulk', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { ids, update } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'No ids provided' });
    const allowed = {};
    if (update.status) allowed.status = update.status;
    if (update.priority) allowed.priority = update.priority;
    if (update.department) allowed.department = update.department;
    const result = await Issue.updateMany({ _id: { $in: ids } }, { $set: allowed });
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: 'Bulk update failed' });
  }
});

// DELETE /api/issues/bulk — bulk delete (owner only; officials never reach here)
router.delete('/bulk', requireAuth, requireAdmin, denyOfficialDeletion, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'No ids provided' });
    const result = await Issue.deleteMany({ _id: { $in: ids } });

    // Single deletes already release merged reports and clear the vector index;
    // the bulk path did neither, leaving ghost embeddings that kept matching new
    // complaints against issues that no longer exist.
    await releaseDuplicates(ids).catch(err => console.error('Failed to release merged reports:', err));
    ids.forEach(id => removeFromIndex(id).catch(err => console.error('De-index failed:', err)));

    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: 'Bulk delete failed' });
  }
});

// GET /api/issues/:id — single issue
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const issue = await Issue.findById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    if (OFFICIAL_ROLES.includes(req.auth.role)) {
      const official = await User.findById(req.auth.userId).select('department region').lean();
      if (!official?.department || !official?.region ||
          issue.department !== official.department || issue.state !== official.region) {
        return res.status(403).json({ error: 'This issue is outside your department and region assignment' });
      }
    }
    const evaluated = evaluateEscalation(issue.toObject ? issue.toObject() : issue);
    res.json(evaluated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch issue' });
  }
});

// PATCH /api/issues/:id — update a grievance
//
// Who may write what:
//   admin      — everything (owner)
//   dept_admin — status, note and resolution photo, in their assigned scope
//   official   — status, note and resolution photo, in their assigned scope
//
// Officials and department admins can advance a grievance but never rewrite
// what the citizen reported: title, description, category, priority,
// department and coordinates are all rejected for them below. The check lives
// here, on the server, because hiding a field in the UI is not a permission.
router.patch('/:id', requireAuth, requireOfficial, requireOfficialScope, async (req, res) => {
  try {
    const { status, priority, department, adminNote, resolutionImageBase64, coordinates } = req.body;

    const existing = await Issue.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Issue not found' });

    const isOwnerAdmin = req.auth.role === 'admin';

    if (!isOwnerAdmin) {
      // Everything a non-admin is forbidden to touch, named explicitly so the
      // response tells them which field was rejected rather than failing mutely.
      const FORBIDDEN = { priority, department, coordinates };
      const attempted = Object.entries(FORBIDDEN)
        .filter(([, value]) => value !== undefined)
        .map(([field]) => field);

      // The citizen's own account of the problem is immutable for staff.
      for (const field of ['title', 'description', 'category', 'imageBase64', 'votes']) {
        if (req.body[field] !== undefined) attempted.push(field);
      }

      if (attempted.length) {
        return res.status(403).json({
          error:
            `Officials cannot change ${attempted.join(', ')}. ` +
            'You may update status, add a note, and upload a resolution photo.',
          forbiddenFields: attempted,
        });
      }
    }

    // All officials stay inside their assigned department and region.
    if (!isOwnerAdmin &&
        (existing.department !== req.officialScope.department || existing.state !== req.officialScope.region)) {
      return res.status(403).json({ error: 'This issue is outside your department and region assignment' });
    }

    const statusChanged = status !== undefined && status !== existing.status;

    const updateOp = { $set: {} };
    if (status !== undefined) updateOp.$set.status = status;
    // Reached only for an owner-admin: the guard above rejected everyone else.
    if (priority !== undefined) {
      updateOp.$set.priority = priority;
      // Re-calculate SLA deadline on priority adjustment
      updateOp.$set.sla = calculateSLA(priority, existing.createdAt);
      // An explicit decision by the owner: repeat reports must not silently
      // overwrite it later.
      updateOp.$set.priorityLocked = true;
    }
    if (department !== undefined) updateOp.$set.department = department;
    if (adminNote !== undefined) updateOp.$set.adminNote = adminNote;
    if (coordinates?.latitude && coordinates?.longitude) updateOp.$set.coordinates = coordinates;

    // If resolution image is uploaded or status becomes resolved with image
    if (resolutionImageBase64 !== undefined) {
      updateOp.$set.resolutionImageBase64 = resolutionImageBase64;
      if (resolutionImageBase64) {
        const verification = await verifyResolution({
          beforeImageBase64: existing.imageBase64,
          afterImageBase64: resolutionImageBase64,
          title: existing.title,
          description: existing.description,
        });
        updateOp.$set.resolutionVerification = verification;
      }
    } else if (status === 'resolved' && existing.resolutionImageBase64 && !existing.resolutionVerification?.isVerified) {
      const verification = await verifyResolution({
        beforeImageBase64: existing.imageBase64,
        afterImageBase64: existing.resolutionImageBase64,
        title: existing.title,
        description: existing.description,
      });
      updateOp.$set.resolutionVerification = verification;
    }

    // Who is acting, in what capacity — recorded on the history entry so the
    // citizen's tracking view can say who is handling the problem.
    const actor = {
      name: req.auth.name || 'Official',
      role: req.auth.role,
      title: isOwnerAdmin ? 'System administrator' : (req.officialScope?.designation || 'Official'),
      department: isOwnerAdmin ? existing.department : req.officialScope?.department,
    };

    if (statusChanged) {
      // Attribution matters on a public record: a citizen should be able to
      // see which office moved their grievance, not just that it moved.
      updateOp.$push = {
        statusHistory: {
          status,
          note: adminNote || '',
          changedAt: new Date(),
          changedBy: actor.name,
          changedByRole: actor.role,
          changedByTitle: actor.title,
          changedByDepartment: actor.department,
        },
      };
    }

    const issue = await Issue.findByIdAndUpdate(req.params.id, updateOp, { new: true, runValidators: true });

    io.to('admins').emit('issue_updated', issue);

    if (statusChanged) {
      const statusLabel = { pending: 'Pending', 'in-progress': 'In Progress', resolved: 'Resolved' }[status] || status;
      io.to(`user_${existing.submittedBy}`).emit('citizen_notification', {
        message: `Your issue "${existing.title}" is now ${statusLabel}`,
        issueId: issue._id,
        status,
      });

      // Dispatch multi-channel notifications (Email, SMS, WhatsApp)
      dispatchMultiChannelNotification({
        issue,
        status,
        adminNote,
      });

      // Everyone whose report was merged into this one is waiting on the same
      // fix. Staff never see those rows, so copy the change onto them and tell
      // each person — otherwise their complaint would sit at "pending" forever.
      try {
        const merged = await propagateToDuplicates(issue, { status, adminNote, actor });
        const statusLabel2 = { pending: 'Pending', 'in-progress': 'In Progress', resolved: 'Resolved' }[status] || status;
        for (const dup of merged) {
          io.to(`user_${dup.submittedBy}`).emit('citizen_notification', {
            message: `Your report "${dup.title}" is now ${statusLabel2}`,
            issueId: dup._id,
            status,
          });
          dispatchMultiChannelNotification({ issue: dup, status, adminNote });
        }
      } catch (err) {
        // The status change itself has already been saved; failing here must
        // not report the whole update as failed.
        console.error('Failed to propagate status to merged reports:', err);
      }
    }

    res.json(issue);
  } catch (err) {
    console.error('Update issue failed:', err);
    res.status(500).json({ error: 'Failed to update issue' });
  }
});

// POST /api/issues/:id/comments — post a comment on an issue
router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const issue = await Issue.findById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const userId = req.auth.userId;
    const email = (req.auth.email || '').toLowerCase();
    const userName = req.auth.name || 'User';

    let userRole = req.auth.role === 'admin' ? 'admin' : 'citizen';
    let userDepartment = null;

    if (userRole !== 'admin') {
      const dbUser = await User.findById(userId);
      if (dbUser?.role === 'dept_admin') {
        userRole = 'dept_admin';
        userDepartment = dbUser.department;
      }
    }

    const newComment = {
      userId,
      userName,
      userEmail: email,
      userRole,
      userDepartment,
      text: text.trim(),
      createdAt: new Date(),
    };

    issue.comments.push(newComment);
    await issue.save();

    // Real-time broadcast
    io.to('admins').emit('issue_updated', issue);
    io.to(`user_${issue.submittedBy}`).emit('new_comment', {
      issueId: issue._id,
      comment: newComment,
      issueTitle: issue.title,
    });

    // Notify submitter if an official replied
    if (userRole !== 'citizen' && issue.submittedBy !== userId) {
      if (issue.submitterPhone && issue.notifyViaWhatsapp) {
        sendWhatsAppNotification({
          to: issue.submitterPhone,
          issueTitle: issue.title,
          status: issue.status,
          note: `New message from ${userRole === 'admin' ? 'Administration' : userDepartment || 'Department'}: "${text.trim()}"`,
        }).catch(err => console.error(err));
      }
    }

    res.status(201).json(issue);
  } catch (err) {
    console.error('Post comment failed:', err);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// POST /api/issues/:id/verify-resolution — manual verification trigger (admin or dept_admin)
router.post('/:id/verify-resolution', requireAuth, requireAdminOrDeptAdmin, async (req, res) => {
  try {
    const { resolutionImageBase64 } = req.body;
    const issue = await Issue.findById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const afterImage = resolutionImageBase64 || issue.resolutionImageBase64;
    if (!afterImage) {
      return res.status(400).json({ error: 'No resolution photo provided to verify' });
    }

    const verification = await verifyResolution({
      beforeImageBase64: issue.imageBase64,
      afterImageBase64: afterImage,
      title: issue.title,
      description: issue.description,
    });

    issue.resolutionImageBase64 = afterImage;
    issue.resolutionVerification = verification;
    await issue.save();

    io.to('admins').emit('issue_updated', issue);
    res.json(issue);
  } catch (err) {
    console.error('Verification failed:', err);
    res.status(500).json({ error: 'Failed to verify resolution' });
  }
});

// POST /api/issues/:id/vote — toggle upvote
router.post('/:id/vote', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const issue = await Issue.findById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const hasVoted = issue.voters.includes(userId);
    if (hasVoted) {
      issue.voters = issue.voters.filter(v => v !== userId);
      issue.votes = Math.max(0, issue.votes - 1);
    } else {
      issue.voters.push(userId);
      issue.votes += 1;
    }
    await issue.save();
    res.json({ votes: issue.votes, voted: !hasVoted });
  } catch (err) {
    res.status(500).json({ error: 'Failed to vote' });
  }
});

// POST /api/issues/:id/rate — citizen satisfaction rating (issue owner, resolved only)
router.post('/:id/rate', requireAuth, async (req, res) => {
  try {
    const { score, comment } = req.body;
    if (!score || score < 1 || score > 5) return res.status(400).json({ error: 'Score must be 1–5' });

    const issue = await Issue.findById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    if (issue.submittedBy !== req.auth.userId) return res.status(403).json({ error: 'Not your issue' });
    if (issue.status !== 'resolved') return res.status(400).json({ error: 'Can only rate resolved issues' });
    if (issue.rating?.score) return res.status(400).json({ error: 'Already rated' });

    issue.rating = { score, comment: comment || '', ratedAt: new Date() };
    await issue.save();
    res.json(issue);
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit rating' });
  }
});

// DELETE /api/issues/:id — system owner, or the citizen who filed it.
//
// `denyOfficialDeletion` runs first so an official gets an explicit 403 rather
// than falling through to the owner check below.
router.delete('/:id', requireAuth, denyOfficialDeletion, async (req, res) => {
  try {
    const issue = await Issue.findById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const userId = req.auth.userId;
    const isAdmin = req.auth.role === 'admin' || isAdminEmail(req.auth.email);
    const isOwner = issue.submittedBy === userId;

    if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Not allowed' });

    await issue.deleteOne();

    // Reports merged into this one would otherwise stay hidden behind a parent
    // that no longer exists. Un-merge them so they reappear as ordinary issues.
    await releaseDuplicates([issue._id])
      .catch(err => console.error('Failed to release merged reports:', err));

    // Drop it from the vector store too, or it stays a duplicate candidate for
    // future submissions and matchedComplaintId points at a deleted document.
    removeFromIndex(issue._id).catch(err => console.error('De-index failed:', err));

    res.json({ message: 'Issue deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete issue' });
  }
});

export default router;
