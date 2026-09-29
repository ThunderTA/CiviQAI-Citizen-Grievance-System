/**
 * Bridge to the Python grievance AI service (sih-ai-service).
 *
 * Every function here is failure-tolerant on purpose. Grievance submission is
 * the one thing this portal must never refuse: if the AI service is down, the
 * complaint is still saved with rule-of-thumb metadata and flagged for review,
 * rather than the citizen seeing an error.
 */
import dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
// Written by sih-ai-service/tools/export_taxonomy.py. Read only when the AI
// service itself cannot be reached, so the portal's filters and dropdowns
// still work rather than silently falling back to an empty list.
const TAXONOMY_SNAPSHOT = join(__dirname, '..', 'config', 'taxonomy.json');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');
const AI_TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS || 12000);

// Map the AI service's 1-5 score onto the enum the Issue schema accepts.
const PORTAL_PRIORITY = { 5: 'high', 4: 'high', 3: 'medium', 2: 'low', 1: 'low' };

/**
 * fetch with a hard deadline. Node's fetch has no timeout of its own, so a
 * hung AI service would otherwise hold the citizen's request open forever.
 */
const fetchWithTimeout = async (url, options = {}, timeoutMs = AI_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

/**
 * What we store when the AI service cannot be reached. `aiServiceStatus` is
 * persisted so an admin can find and re-triage these later, and so nobody
 * mistakes a fallback default for a real model decision.
 */
const degradedResult = (title, description, reason) => ({
  department: 'General Administration',
  category: 'Other',
  priority: 'medium',
  priorityScore: 3,
  urgencyLevel: 'Moderate',
  sentiment: 'neutral',
  aiSummary: (description || title || '').substring(0, 200),
  isDuplicate: false,
  matchedComplaintId: null,
  similarityScore: 0,
  similarComplaints: [],
  aiServiceStatus: `unavailable: ${reason}`,
  analysisSource: 'fallback',
});

/**
 * Analyze a grievance: department, priority and duplicate check in one call.
 * Returns a shape ready to spread into the Issue document.
 */
export const analyzeComplaint = async ({ title, description, latitude, longitude, complaintId }) => {
  try {
    const response = await fetchWithTimeout(`${AI_SERVICE_URL}/analyze-complaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title || '',
        description: description || '',
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        complaint_id: complaintId || null,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn(`AI service returned ${response.status}: ${body.slice(0, 200)}`);
      return degradedResult(title, description, `HTTP ${response.status}`);
    }

    const data = await response.json();

    return {
      department: data.department,
      category: data.category,
      // Trust the service's own mapping, but keep a local fallback so a schema
      // validation error can never come from a missing field.
      priority: data.portal_priority || PORTAL_PRIORITY[data.priority_score] || 'medium',
      priorityScore: data.priority_score,
      urgencyLevel: data.urgency_level,
      sentiment: data.sentiment,
      aiSummary: data.summary,
      priorityReasoning: data.reasoning,
      slaHours: data.sla_hours,
      isDuplicate: Boolean(data.is_duplicate),
      matchedComplaintId: data.matched_complaint_id,
      similarityScore: data.similarity_score,
      matchedDistanceMeters: data.matched_distance_meters,
      similarComplaints: (data.similar_complaints || []).map(s => ({
        complaintId: s.complaint_id,
        title: s.title,
        similarity: s.similarity,
        distanceMeters: s.distance_meters,
      })),
      aiServiceStatus: 'ok',
      analysisSource: data.analysis_source,
    };
  } catch (err) {
    const reason = err.name === 'AbortError' ? `timeout after ${AI_TIMEOUT_MS}ms` : err.message;
    console.warn('AI analysis unavailable, saving with fallback metadata:', reason);
    return degradedResult(title, description, reason);
  }
};

/**
 * Add a saved complaint to the vector index, keyed by its MongoDB _id.
 *
 * Called after the write to Mongo so the index only ever holds complaints that
 * actually exist - otherwise `matched_complaint_id` could point at a document
 * that was never created. Fire-and-forget: an index failure must not fail the
 * citizen's submission.
 */
export const indexComplaint = async ({ complaintId, title, description, latitude, longitude, category, status }) => {
  try {
    const response = await fetchWithTimeout(`${AI_SERVICE_URL}/index-complaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaint_id: String(complaintId),
        title: title || '',
        description: description || '',
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        category: category || null,
        status: status || null,
      }),
    });
    if (!response.ok) {
      console.warn(`Failed to index complaint ${complaintId}: HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`Failed to index complaint ${complaintId}:`, err.message);
    return false;
  }
};

/** Remove a complaint from the vector index (called on delete). */
export const removeFromIndex = async (complaintId) => {
  try {
    const response = await fetchWithTimeout(
      `${AI_SERVICE_URL}/index-complaint/${complaintId}`,
      { method: 'DELETE' },
      5000
    );
    return response.ok;
  } catch (err) {
    console.warn(`Failed to de-index complaint ${complaintId}:`, err.message);
    return false;
  }
};

/**
 * Empty the vector index.
 *
 * Use before replaying from MongoDB. Removing complaints one id at a time
 * cannot clear orphans whose Mongo documents are already gone.
 */
export const clearIndex = async () => {
  try {
    const response = await fetchWithTimeout(`${AI_SERVICE_URL}/index`, { method: 'DELETE' }, 15000);
    if (!response.ok) return { cleared: 0, error: `HTTP ${response.status}` };
    return await response.json();
  } catch (err) {
    return { cleared: 0, error: err.message };
  }
};

/** Backfill the vector index from complaints already in MongoDB. */
export const bulkIndexComplaints = async (issues) => {
  if (!issues?.length) return { indexed: 0 };
  try {
    const response = await fetchWithTimeout(
      `${AI_SERVICE_URL}/index-complaints/bulk`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaints: issues.map(i => ({
            complaint_id: String(i._id),
            title: i.title || '',
            description: i.description || '',
            latitude: i.coordinates?.latitude ?? null,
            longitude: i.coordinates?.longitude ?? null,
            category: i.category || null,
            status: i.status || null,
          })),
        }),
      },
      60000
    );
    if (!response.ok) return { indexed: 0, error: `HTTP ${response.status}` };
    return await response.json();
  } catch (err) {
    return { indexed: 0, error: err.message };
  }
};

/**
 * Categories and departments, from the one place they are defined.
 *
 * Cached briefly in memory: this is called on nearly every page load (the
 * submit form, every filter dropdown), and the taxonomy changes rarely, so
 * there is no reason to round-trip to the AI service on each request.
 */
let taxonomyCache = null;
let taxonomyCacheAt = 0;
const TAXONOMY_CACHE_MS = 5 * 60 * 1000;

export const getTaxonomy = async ({ bypassCache = false } = {}) => {
  const now = Date.now();
  if (!bypassCache && taxonomyCache && now - taxonomyCacheAt < TAXONOMY_CACHE_MS) {
    return taxonomyCache;
  }

  try {
    const response = await fetchWithTimeout(`${AI_SERVICE_URL}/taxonomy`, {}, 5000);
    if (response.ok) {
      const data = await response.json();
      taxonomyCache = { ...data, source: 'live' };
      taxonomyCacheAt = now;
      return taxonomyCache;
    }
  } catch {
    // Fall through to the snapshot below.
  }

  try {
    const raw = await readFile(TAXONOMY_SNAPSHOT, 'utf-8');
    const data = JSON.parse(raw);
    // Not cached: a missed AI service is worth re-checking on the next call,
    // rather than pinning the whole portal to a stale snapshot for 5 minutes.
    return { ...data, source: 'snapshot' };
  } catch (err) {
    console.error('No taxonomy available from the AI service or the snapshot:', err.message);
    return { categories: [], departments: [], fallback_category: 'Other', source: 'unavailable' };
  }
};

/** Health of the AI service, surfaced on the admin dashboard. */
export const aiServiceHealth = async () => {
  try {
    const response = await fetchWithTimeout(`${AI_SERVICE_URL}/ai-health`, {}, 5000);
    if (!response.ok) return { reachable: false, error: `HTTP ${response.status}` };
    return { reachable: true, ...(await response.json()) };
  } catch (err) {
    return { reachable: false, error: err.message };
  }
};
