import { Users, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

/**
 * How widely a problem has been reported.
 *
 * Reports of the same problem are folded into one grievance everywhere staff
 * and the public look; these show what that folding hides — that several
 * different people reported it, and that this raised its priority.
 */

/** "+3 similar reports" — other people who reported the same problem. */
export function SimilarReportsBadge({ issue, className = '' }) {
  const others = issue?.similarReports || 0
  if (others < 1) return null

  return (
    <Badge
      variant="outline"
      title={`${others + 1} different people have reported this same problem`}
      className={`gap-1 text-[11px] font-medium ${className}`}
    >
      <Users className="h-3 w-3" />
      +{others} similar report{others === 1 ? '' : 's'}
    </Badge>
  )
}

/** Present when repeat reports have raised the score above the AI's own. */
export function PriorityRaisedBadge({ issue, className = '' }) {
  const last = issue?.priorityHistory?.at(-1)
  if (!last) return null

  return (
    <Badge
      title={last.reason}
      className={`gap-1 border border-amber-500/30 bg-amber-500/10 text-[11px] font-medium text-amber-700 dark:text-amber-400 ${className}`}
    >
      <TrendingUp className="h-3 w-3" />
      Raised to {last.toLevel}
    </Badge>
  )
}

/** One sentence saying what changed and why, for detail views. */
export function PriorityRaisedNote({ issue, className = '' }) {
  const last = issue?.priorityHistory?.at(-1)
  if (!last) return null

  return (
    <p className={`flex items-start gap-1.5 text-xs text-muted-foreground ${className}`}>
      <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <span>
        <span className="font-medium text-foreground">
          Priority raised from {issue.priorityHistory[0].fromLevel} to {last.toLevel}.
        </span>{' '}
        {last.reportCount} different people have reported this same problem nearby.
      </span>
    </p>
  )
}
