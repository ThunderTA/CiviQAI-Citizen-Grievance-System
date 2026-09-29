import mongoose from 'mongoose';

const issueSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  location: { type: String },
  imageBase64: { type: String },
  category: { type: String, default: 'Other' },
  sentiment: { type: String, enum: ['positive', 'negative', 'neutral'], default: 'neutral' },
  aiSummary: { type: String },
  status: { type: String, enum: ['pending', 'in-progress', 'resolved'], default: 'pending' },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  department: { type: String },
  adminNote: { type: String },
  state: { type: String },
  votes: { type: Number, default: 0 },
  voters: [{ type: String }],
  statusHistory: [{
    status: { type: String },
    note: { type: String },
    changedAt: { type: Date, default: Date.now },
    // Who moved it. A citizen should be able to see which office acted.
    changedBy: { type: String },
    changedByRole: { type: String },
    // In what capacity ("Junior Engineer") and for which department, so the
    // tracking view can say who is handling the problem, not just that
    // someone touched it.
    changedByTitle: { type: String },
    changedByDepartment: { type: String },
    // True when this entry was copied from the report this one was merged
    // into, rather than being an action taken on this row directly.
    viaOriginal: { type: Boolean, default: false },
  }],
  rating: {
    score: { type: Number, min: 1, max: 5 },
    comment: { type: String },
    ratedAt: { type: Date },
  },
  // AI Vision & Defect Analysis
  imageAnalysis: {
    detectedIssue: { type: String },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    visualTags: [{ type: String }],
    isGenuineCivicIssue: { type: Boolean, default: true },
    confidenceScore: { type: Number, default: 85 },
  },
  // Resolution Verification ("Before vs After")
  resolutionImageBase64: { type: String },
  resolutionVerification: {
    isVerified: { type: Boolean, default: false },
    verdict: { type: String, enum: ['verified', 'inconclusive', 'mismatch', 'unverified'], default: 'unverified' },
    completionScore: { type: Number, default: 0 },
    aiExplanation: { type: String },
    verifiedAt: { type: Date },
  },
  // Multi-Channel Notifications
  submitterPhone: { type: String },
  notifyViaSms: { type: Boolean, default: false },
  notifyViaWhatsapp: { type: Boolean, default: false },
  // ---------------------------------------------------------------------
  // AI Triage — populated by sih-ai-service POST /analyze-complaint
  // ---------------------------------------------------------------------
  // 1–5 from the AI service. `priority` above stays the coarse low|medium|high
  // the existing UI and SLA engine already read; this is the finer signal the
  // admin queue sorts on.
  priorityScore: { type: Number, min: 1, max: 5, default: 3 },
  urgencyLevel: {
    type: String,
    enum: ['Critical', 'High', 'Moderate', 'Low', 'Routine'],
    default: 'Moderate',
  },
  // Semantic duplicate detection (cosine similarity over complaint embeddings)
  isDuplicate: { type: Boolean, default: false },
  // The _id of the earlier complaint this one duplicates, as a string so a
  // failed/stale match can never break population of the parent document.
  matchedComplaintId: { type: String, default: null },
  similarityScore: { type: Number, default: 0 },
  matchedDistanceMeters: { type: Number, default: null },
  // Near-misses below the duplicate threshold, kept so an admin can merge
  // borderline cases by hand instead of only seeing a boolean.
  similarComplaints: [{
    complaintId: { type: String },
    title: { type: String },
    similarity: { type: Number },
    distanceMeters: { type: Number },
  }],
  aiTriage: {
    reasoning: { type: String },
    // 'rules' | 'llm+rules' | 'fallback' — which layer actually decided.
    source: { type: String, default: 'fallback' },
    // 'ok' or 'unavailable: <reason>'; lets an admin find complaints that were
    // saved while the AI service was down and re-run triage on them.
    serviceStatus: { type: String, default: 'unknown' },
    analyzedAt: { type: Date },
    // The score the AI gave this report on its own, before any repeat-report
    // escalation. `priorityScore` above is the CURRENT score and only ever
    // moves up from here; keeping the original lets the UI say what changed.
    baseScore: { type: Number, min: 1, max: 5 },
  },

  // Repeat-report escalation. When several different people report the same
  // problem nearby, the score is raised and each raise is recorded here so the
  // change is explainable ("4 people reported this") rather than a number that
  // silently moved.
  priorityHistory: [{
    at: { type: Date, default: Date.now },
    fromScore: { type: Number },
    toScore: { type: Number },
    fromLevel: { type: String },
    toLevel: { type: String },
    reportCount: { type: Number },
    reason: { type: String },
  }],
  // Set when the owner overrides priority by hand. Escalation then leaves the
  // score alone: an explicit human decision must not be silently overwritten
  // by an automatic rule.
  priorityLocked: { type: Boolean, default: false },
  // Geospatial Coordinates (GPS)
  coordinates: {
    latitude: { type: Number },
    longitude: { type: Number },
  },
  // Smart SLA & Escalation Engine
  sla: {
    targetHours: { type: Number, default: 120 }, // e.g. 48 for high, 120 for medium, 240 for low
    deadline: { type: Date },
    isBreached: { type: Boolean, default: false },
    escalatedAt: { type: Date },
    escalationReason: { type: String },
  },
  // Two-Way Comments
  comments: [{
    userId: { type: String, required: true },
    userName: { type: String, default: 'Citizen' },
    userEmail: { type: String },
    userRole: { type: String, enum: ['citizen', 'dept_admin', 'admin'], default: 'citizen' },
    userDepartment: { type: String },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  }],
  submittedBy: { type: String, required: true },
  submitterName: { type: String },
  submitterEmail: { type: String },
}, { timestamps: true });

export default mongoose.model('Issue', issueSchema);


