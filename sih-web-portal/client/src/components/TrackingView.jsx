import {
  FileText, Send, Users, TrendingUp, PlayCircle, CheckCircle2, Clock, UserCircle2, RotateCcw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const LEVELS = { 5: 'Critical', 4: 'High', 3: 'Moderate', 2: 'Low', 1: 'Routine' }

/**
 * A report merged into an earlier one moves as part of it: the department, the
 * priority and the deadline all belong to the shared grievance. This returns
 * the issue as the citizen should see it — their own words, the cluster's
 * current state.
 */
export const asSeenByCitizen = (issue) => {
  const shared = issue?.isDuplicate ? issue.linkedIssue : null
  if (!shared) return issue
  return {
    ...issue,
    department: shared.department || issue.department,
    priority: shared.priority || issue.priority,
    priorityScore: shared.priorityScore ?? issue.priorityScore,
    urgencyLevel: shared.urgencyLevel || issue.urgencyLevel,
    // The SLA clock runs from when the problem was first reported, not from
    // when this citizen joined it.
    sla: shared.sla || issue.sla,
    createdAt: shared.createdAt || issue.createdAt,
  }
}

const STATUS_COPY = {
  pending: { title: 'Waiting for review', tone: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  'in-progress': { title: 'Being worked on', tone: 'text-sky-700 dark:text-sky-400', dot: 'bg-sky-500' },
  resolved: { title: 'Resolved', tone: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
}

const EVENT_STYLE = {
  reported: { icon: FileText, dot: 'bg-slate-400' },
  routed: { icon: Send, dot: 'bg-indigo-500' },
  merged: { icon: Users, dot: 'bg-violet-500' },
  priority: { icon: TrendingUp, dot: 'bg-amber-500' },
  pending: { icon: RotateCcw, dot: 'bg-amber-500' },
  'in-progress': { icon: PlayCircle, dot: 'bg-sky-500' },
  resolved: { icon: CheckCircle2, dot: 'bg-emerald-500' },
}

const STATUS_EVENT_TITLE = {
  pending: 'Marked as pending',
  'in-progress': 'Work started',
  resolved: 'Marked as resolved',
}

/** "S. Iyer · Junior Engineer, Public Works Department" */
export const describeActor = (entry) => {
  if (!entry?.changedBy) return null
  const title = entry.changedByTitle ? ` · ${entry.changedByTitle}` : ''
  const dept = entry.changedByDepartment ? `, ${entry.changedByDepartment}` : ''
  return `${entry.changedBy}${title}${dept}`
}

const when = (value) =>
  new Date(value).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })

/** Everything that has happened to this report, newest first. */
export const buildEvents = (issue) => {
  const shared = issue.isDuplicate ? issue.linkedIssue : null
  const filedAt = new Date(issue.createdAt).getTime()
  const events = []

  events.push({
    at: issue.createdAt, order: 0, kind: 'reported',
    title: 'You reported this issue',
  })

  const initialScore =
    issue.aiTriage?.baseScore ?? issue.priorityHistory?.[0]?.fromScore ?? issue.priorityScore
  // The AI's timestamp is taken a few milliseconds before the row is saved, so
  // taken at face value a report would appear routed before it existed.
  const routedAt = new Date(Math.max(
    new Date(issue.aiTriage?.analyzedAt || issue.createdAt).getTime(),
    new Date(issue.createdAt).getTime(),
  ))
  events.push({
    at: routedAt, order: 1, kind: 'routed',
    title: `Sent to ${issue.department || 'the responsible department'}`,
    detail: [
      initialScore ? `Assessed as ${LEVELS[initialScore]} priority.` : null,
      issue.aiTriage?.reasoning || null,
    ].filter(Boolean).join(' '),
  })

  if (shared) {
    events.push({
      at: issue.createdAt, order: 2, kind: 'merged',
      title: 'Matched to an earlier report of the same problem',
      detail:
        `${shared.reportCount} different people have now reported it. Your report was ` +
        'combined with the first one, so the problem is handled once and everyone who ' +
        'reported it is kept up to date.',
    })
  }

  // Raises that happened before this citizen reported it are part of the
  // cluster's history but not of their story; the summary shows where it stands.
  const raises = (shared ? shared.priorityHistory : issue.priorityHistory) || []
  for (const h of raises) {
    if (new Date(h.at).getTime() < filedAt) continue
    events.push({
      at: h.at, order: 3, kind: 'priority',
      title: `Priority raised: ${h.fromLevel} → ${h.toLevel}`,
      detail: h.reason,
    })
  }

  for (const h of issue.statusHistory || []) {
    events.push({
      at: h.changedAt, order: 4, kind: h.status,
      title: STATUS_EVENT_TITLE[h.status] || h.status,
      actor: describeActor(h),
      detail: h.note,
    })
  }

  // Newest first, like a parcel tracker. Events stamped in the same instant
  // fall back to the order they logically happened in.
  return events.sort((a, b) => {
    const diff = new Date(b.at) - new Date(a.at)
    return diff || b.order - a.order
  })
}

/**
 * "Where things stand", then the full trail. Puts the two questions a citizen
 * actually has — is anyone dealing with this, and who — ahead of the log.
 */
export function TrackingSummary({ issue }) {
  const view = asSeenByCitizen(issue)
  const shared = issue.isDuplicate ? issue.linkedIssue : null

  const lastAction = [...(issue.statusHistory || [])].reverse().find(h => h.changedBy)
  const handler = describeActor(lastAction)
  const status = STATUS_COPY[view.status] || STATUS_COPY.pending
  const reporters = shared ? shared.reportCount : (issue.reportCount || 1)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={`flex items-center gap-2 text-sm font-semibold ${status.tone}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${status.dot}`} />
            {status.title}
          </p>
          {view.urgencyLevel && (
            <Badge variant="outline" className="text-[11px]">
              {view.urgencyLevel} priority{view.priorityScore ? ` · ${view.priorityScore}/5` : ''}
            </Badge>
          )}
        </div>

        <dl className="mt-3 grid gap-2.5 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Handled by</dt>
            <dd className="mt-0.5 flex items-start gap-1.5 font-medium">
              <UserCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {handler || (
                <span className="font-normal text-muted-foreground">
                  {view.department ? `${view.department} — no official has acted yet` : 'Not yet assigned'}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Department</dt>
            <dd className="mt-0.5 font-medium">{view.department || '—'}</dd>
          </div>
          {reporters > 1 && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Reported by</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                {reporters} different people
                {shared && (
                  <span className="font-normal text-muted-foreground"> — yours is combined with the first report</span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}

/** The full trail of what has happened, newest first. */
export function TrackingTrail({ issue }) {
  const events = buildEvents(issue)

  return (
    <div className="space-y-4">
      <ol className="space-y-0">
        {events.map((event, i) => {
          const style = EVENT_STYLE[event.kind] || EVENT_STYLE.reported
          const Icon = style.icon
          const last = i === events.length - 1
          return (
            <li key={`${event.kind}-${i}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${style.dot}`}>
                  <Icon className="h-3.5 w-3.5 text-white" />
                </span>
                {!last && <span className="my-1 w-px flex-1 bg-border" style={{ minHeight: 14 }} />}
              </div>
              <div className={last ? '' : 'pb-4'}>
                <p className="text-sm font-medium leading-tight">{event.title}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {when(event.at)}
                </p>
                {event.actor && (
                  <p className="mt-1 flex items-start gap-1 text-xs font-medium">
                    <UserCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {event.actor}
                  </p>
                )}
                {event.detail && (
                  <p className="mt-1 text-xs italic text-muted-foreground">
                    {event.kind === 'priority' || event.kind === 'routed' || event.kind === 'merged'
                      ? event.detail
                      : `"${event.detail}"`}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function TrackingView({ issue }) {
  return (
    <div className="space-y-4">
      <TrackingSummary issue={issue} />
      <TrackingTrail issue={issue} />
    </div>
  )
}
