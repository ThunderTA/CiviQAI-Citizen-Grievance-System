/**
 * SLA & Escalation Configuration
 */
export const SLA_TARGETS = {
  high: 48,      // 48 hours (2 days)
  critical: 24,  // 24 hours (1 day)
  medium: 120,   // 120 hours (5 days)
  low: 240,      // 240 hours (10 days)
};

/**
 * Compute SLA target hours and deadline for an issue
 */
export const calculateSLA = (priority = 'medium', createdAt = new Date(), overrideHours = null) => {
  // The AI service scores urgency 1-5 and recommends a target from that finer
  // scale. Without this override a Critical (5) grievance collapsed into the
  // same 48h bucket as an ordinary High one, because both map to 'high' here.
  const targetHours =
    Number.isFinite(overrideHours) && overrideHours > 0
      ? overrideHours
      : SLA_TARGETS[priority] || 120;
  const creationDate = new Date(createdAt);
  const deadline = new Date(creationDate.getTime() + targetHours * 60 * 60 * 1000);

  return {
    targetHours,
    deadline,
    isBreached: false,
    escalatedAt: null,
    escalationReason: '',
  };
};

/**
 * Evaluate if an issue has breached its SLA and requires auto-escalation
 */
export const evaluateEscalation = (issue) => {
  if (!issue || issue.status === 'resolved') return issue;

  // If issue doesn't have an SLA deadline yet, compute it from creation date
  if (!issue.sla || !issue.sla.deadline) {
    issue.sla = calculateSLA(issue.priority, issue.createdAt || new Date());
  }

  const now = new Date();
  const deadline = new Date(issue.sla.deadline);

  if (now > deadline && !issue.sla.isBreached) {
    issue.sla.isBreached = true;
    if (!issue.sla.escalatedAt) {
      issue.sla.escalatedAt = now;
      issue.sla.escalationReason = `SLA target breached (${issue.sla.targetHours || 120}h limit exceeded)`;
    }
  }

  return issue;
};

/**
 * Calculate Great-Circle Distance between two coordinates in Kilometers (Haversine formula)
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;

  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;

  return Math.round(distanceKm * 100) / 100; // 2 decimal places
};

/**
 * Format distance in human-readable meter/km format
 */
export const formatDistance = (distanceKm) => {
  if (distanceKm == null) return null;
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m away`;
  }
  return `${distanceKm.toFixed(1)} km away`;
};
