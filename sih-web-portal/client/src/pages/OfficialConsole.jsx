import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth, useUser } from '@/lib/auth'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { SimilarReportsBadge, PriorityRaisedBadge, PriorityRaisedNote } from '@/components/ReportSignals'
import {
  Landmark, Loader2, Search, MapPin, Clock, CheckCircle2,
  AlertTriangle, Lock, RefreshCw,
} from 'lucide-react'

const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
]

const URGENCY_STYLE = {
  Critical: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25',
  High: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/25',
  Moderate: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25',
  Low: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25',
  Routine: 'bg-muted text-muted-foreground border-transparent',
}

/**
 * Government official console — read, verify, advance.
 *
 * There is no edit or delete affordance anywhere on this page, matching what
 * the API enforces. The read-only notice is shown deliberately: an official
 * should understand the boundary rather than discover it as a failed request.
 */
export default function OfficialConsole() {
  const { getToken, role } = useAuth()
  const { rawUser } = useUser()

  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  // 'urgency' (default) puts the highest-priority, soonest-due work first;
  // 'newest' is plain filing order.
  const [sort, setSort] = useState('urgency')
  const [savingId, setSavingId] = useState(null)
  const [notes, setNotes] = useState({})

  const fetchIssues = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = await getToken()
      const { data } = await api.get('/issues', {
        params: { sort },
        headers: { Authorization: `Bearer ${token}` },
      })
      setIssues(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load grievances')
    } finally {
      setLoading(false)
    }
  }, [getToken, sort])

  useEffect(() => { fetchIssues() }, [fetchIssues])

  const updateStatus = async (issue, status) => {
    setSavingId(issue._id)
    setError('')
    try {
      const token = await getToken()
      const { data } = await api.patch(
        `/issues/${issue._id}`,
        { status, adminNote: notes[issue._id] || undefined },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setIssues(list => list.map(i => (i._id === data._id ? { ...i, ...data } : i)))
      setNotes(n => ({ ...n, [issue._id]: '' }))
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update the grievance')
    } finally {
      setSavingId(null)
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return issues.filter(i => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false
      if (!q) return true
      return [i.title, i.description, i.department, i.location, i.state]
        .filter(Boolean).some(v => v.toLowerCase().includes(q))
    })
  }, [issues, query, statusFilter])

  const counts = useMemo(() => ({
    total: issues.length,
    pending: issues.filter(i => i.status === 'pending').length,
    inProgress: issues.filter(i => i.status === 'in-progress').length,
    resolved: issues.filter(i => i.status === 'resolved').length,
    breached: issues.filter(i => i.sla?.isBreached && i.status !== 'resolved').length,
  }), [issues])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Landmark className="h-5 w-5 text-primary" />
            Official Console
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {rawUser?.designation ? `${rawUser.designation} · ` : ''}
            {rawUser?.department && rawUser?.region
              ? `${rawUser.department} · ${rawUser.region}`
              : 'Department and region assignment required'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchIssues}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* The permission boundary, stated rather than discovered. */}
      <div className="mb-6 flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3.5 py-3">
        <Lock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Read-only record.</span> You can
          advance a grievance's status and add an official note. The citizen's report —
          its title, description, priority and assigned department — cannot be edited or
          deleted from this console, and the server enforces that independently.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Total', value: counts.total },
          { label: 'Pending', value: counts.pending, tone: 'text-amber-600 dark:text-amber-400' },
          { label: 'In Progress', value: counts.inProgress, tone: 'text-sky-600 dark:text-sky-400' },
          { label: 'Resolved', value: counts.resolved, tone: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'SLA Breached', value: counts.breached, tone: 'text-red-600 dark:text-red-400' },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-3.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{stat.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${stat.tone || ''}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search grievances, departments, locations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {[{ value: 'all', label: 'All' }, ...STATUSES].map(s => (
            <Button
              key={s.value}
              size="sm"
              variant={statusFilter === s.value ? 'default' : 'outline'}
              onClick={() => setStatusFilter(s.value)}
            >
              {s.label}
            </Button>
          ))}
        </div>
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort grievances"
          className="w-auto"
        >
          <option value="urgency">Most urgent first</option>
          <option value="newest">Newest first</option>
        </Select>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No grievances match.</p>
      ) : (
        <div className="space-y-3">
          {visible.map(issue => (
            <Card key={issue._id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold leading-tight">{issue.title}</h3>
                      {issue.urgencyLevel && (
                        <Badge className={`border text-[11px] ${URGENCY_STYLE[issue.urgencyLevel] || ''}`}>
                          {issue.urgencyLevel} {issue.priorityScore ? `(${issue.priorityScore}/5)` : ''}
                        </Badge>
                      )}
                      <PriorityRaisedBadge issue={issue} />
                      <SimilarReportsBadge issue={issue} />
                      {issue.sla?.isBreached && issue.status !== 'resolved' && (
                        <Badge className="border border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400 text-[11px]">
                          SLA breached
                        </Badge>
                      )}
                    </div>

                    <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                      {issue.description}
                    </p>
                    <PriorityRaisedNote issue={issue} className="mt-2" />

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{issue.department}</span>
                      {issue.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />{issue.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(issue.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </span>
                      <span>by {issue.submitterName || 'Citizen'}</span>
                    </div>
                  </div>

                  <Badge variant={issue.status === 'resolved' ? 'success' : 'secondary'} className="shrink-0">
                    {STATUSES.find(s => s.value === issue.status)?.label || issue.status}
                  </Badge>
                </div>

                {issue.status !== 'resolved' && (
                  <div className="mt-3 border-t pt-3">
                    <Textarea
                      rows={2}
                      className="text-sm"
                      placeholder="Official note (visible to the citizen) — what was inspected, what happens next…"
                      value={notes[issue._id] || ''}
                      onChange={(e) => setNotes(n => ({ ...n, [issue._id]: e.target.value }))}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {issue.status === 'pending' && (
                        <Button
                          size="sm"
                          disabled={savingId === issue._id}
                          onClick={() => updateStatus(issue, 'in-progress')}
                        >
                          {savingId === issue._id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Acknowledge & start work
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={issue.status === 'in-progress' ? 'default' : 'outline'}
                        disabled={savingId === issue._id}
                        onClick={() => updateStatus(issue, 'resolved')}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Verify & mark resolved
                      </Button>
                    </div>
                  </div>
                )}

                {issue.statusHistory?.length > 0 && (
                  <details className="mt-3 border-t pt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      Action history ({issue.statusHistory.length})
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {issue.statusHistory.map((h, idx) => (
                        <li key={idx} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{h.status}</span>
                          {h.changedBy && <> · {h.changedBy}</>}
                          {' · '}
                          {new Date(h.changedAt).toLocaleString('en-IN', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                          {h.note && <p className="mt-0.5 italic">"{h.note}"</p>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
