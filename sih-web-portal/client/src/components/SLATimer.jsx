import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Clock, AlertTriangle, AlertOctagon, CheckCircle2, ShieldAlert } from 'lucide-react'

export function SLATimer({ issue, compact = false }) {
  if (!issue) return null

  const isResolved = issue.status === 'resolved'
  const targetHours = issue.sla?.targetHours || (issue.priority === 'high' ? 48 : issue.priority === 'critical' ? 24 : issue.priority === 'low' ? 240 : 120)
  
  const createdAt = new Date(issue.createdAt || Date.now())
  const deadline = issue.sla?.deadline ? new Date(issue.sla.deadline) : new Date(createdAt.getTime() + targetHours * 3600 * 1000)

  // Real-time ticking state
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    if (isResolved) return
    const timer = setInterval(() => setNow(new Date()), 60000) // Update every minute
    return () => clearInterval(timer)
  }, [isResolved])

  const totalDurationMs = deadline.getTime() - createdAt.getTime()
  const remainingMs = deadline.getTime() - now.getTime()
  const elapsedMs = now.getTime() - createdAt.getTime()

  const isBreached = issue.sla?.isBreached || remainingMs <= 0
  const progressPercent = Math.min(100, Math.max(0, Math.round((elapsedMs / totalDurationMs) * 100)))

  // Format remaining hours/days
  const formatTimeLeft = () => {
    if (isResolved) return 'Resolved'
    if (isBreached) {
      const breachedHoursAgo = Math.round(Math.abs(remainingMs) / (3600 * 1000))
      if (breachedHoursAgo < 24) return `${breachedHoursAgo}h overdue`
      return `${Math.round(breachedHoursAgo / 24)}d overdue`
    }
    const hoursLeft = Math.round(remainingMs / (3600 * 1000))
    if (hoursLeft < 1) return '< 1h left'
    if (hoursLeft < 24) return `${hoursLeft}h left`
    return `${Math.round(hoursLeft / 24)}d left`
  }

  // If resolved
  if (isResolved) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>SLA Closed ({targetHours}h Target)</span>
      </div>
    )
  }

  // If breached / escalated
  if (isBreached) {
    if (compact) {
      return (
        <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 gap-1 text-[10px] py-0 px-1.5 font-semibold">
          <ShieldAlert className="h-3 w-3" />
          Escalated ({formatTimeLeft()})
        </Badge>
      )
    }

    return (
      <div className="space-y-1.5 p-2.5 rounded-lg border border-rose-200 bg-rose-50/60 dark:border-rose-900/60 dark:bg-rose-950/20 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-semibold text-rose-600 dark:text-rose-400">
            <AlertOctagon className="h-4 w-4 shrink-0" />
            <span>SLA Breached · Auto-Escalated</span>
          </div>
          <Badge variant="destructive" className="text-[10px] py-0">
            {formatTimeLeft()}
          </Badge>
        </div>
        <div className="w-full bg-rose-200 dark:bg-rose-900/40 h-1.5 rounded-full overflow-hidden">
          <div className="bg-rose-600 h-full rounded-full w-full" />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Priority target of {targetHours}h exceeded. Escalated to Senior Administrative Directorate.
        </p>
      </div>
    )
  }

  // If approaching deadline (< 24 hours)
  const isExpiringSoon = remainingMs < 24 * 3600 * 1000

  if (compact) {
    return (
      <Badge
        className={`gap-1 text-[10px] py-0 px-1.5 font-medium ${
          isExpiringSoon
            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
            : 'bg-primary/10 text-primary border-primary/20'
        }`}
      >
        <Clock className="h-3 w-3" />
        SLA: {formatTimeLeft()}
      </Badge>
    )
  }

  return (
    <div className="space-y-1.5 p-2.5 rounded-lg border bg-muted/20 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Clock className={`h-3.5 w-3.5 ${isExpiringSoon ? 'text-amber-500' : 'text-primary'}`} />
          <span>SLA Countdown ({targetHours}h Target)</span>
        </div>
        <span className={`font-semibold ${isExpiringSoon ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}`}>
          {formatTimeLeft()}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isExpiringSoon ? 'bg-amber-500' : 'bg-primary'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Started: {createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
        <span>Target: {deadline.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  )
}
