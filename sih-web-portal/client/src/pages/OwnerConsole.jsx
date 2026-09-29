import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import api from '@/lib/api'
import { INDIAN_REGIONS } from '@/lib/regions'
import { useTaxonomy } from '@/lib/taxonomy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Crown, Loader2, Activity, Users, Copy, ShieldCheck, ServerCog,
  AlertTriangle, Plus, Trash2, RefreshCw, CheckCircle2, XCircle,
} from 'lucide-react'

/**
 * Owner console — the operator's view of the whole system.
 *
 * Distinct from the admin issue dashboard, which is about working the
 * grievance queue. This answers the questions only the operator asks: are the
 * AI engines actually live, who holds official access, where is the backlog
 * concentrated, and is duplicate detection earning its keep.
 */
export default function OwnerConsole() {
  const { getToken } = useAuth()
  const { departments: knownDepartments } = useTaxonomy()

  const [health, setHealth] = useState(null)
  const [stats, setStats] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [officials, setOfficials] = useState([])
  const [duplicates, setDuplicates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const [form, setForm] = useState({
    name: '', email: '', password: '', designation: '', employeeId: '',
    department: '', region: '', role: 'official',
  })
  const [formError, setFormError] = useState('')
  const [formOk, setFormOk] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = await getToken()
      const auth = { headers: { Authorization: `Bearer ${token}` } }
      // allSettled: a single unreachable subsystem should degrade one card,
      // not blank the whole console.
      const [h, s, a, o, d] = await Promise.allSettled([
        api.get('/issues/ai-status', auth),
        api.get('/issues/stats', auth),
        api.get('/issues/analytics', auth),
        api.get('/auth/officials', auth),
        api.get('/issues/duplicates', auth),
      ])
      setHealth(h.status === 'fulfilled' ? h.value.data : { reachable: false })
      setStats(s.status === 'fulfilled' ? s.value.data : null)
      setAnalytics(a.status === 'fulfilled' ? a.value.data : null)
      setOfficials(o.status === 'fulfilled' ? o.value.data : [])
      setDuplicates(d.status === 'fulfilled' ? d.value.data : [])
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the console')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => { load() }, [load])

  const createOfficial = async (e) => {
    e.preventDefault()
    setFormError('')
    setFormOk('')
    setBusy('create')
    try {
      const token = await getToken()
      const { data } = await api.post('/auth/officials', form, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setOfficials(list => [data, ...list])
      setFormOk(`${data.name} can now sign in at /official/sign-in`)
      setForm({ name: '', email: '', password: '', designation: '', employeeId: '', department: '', region: '', role: 'official' })
    } catch (err) {
      setFormError(err.response?.data?.error || 'Could not create the account')
    } finally {
      setBusy('')
    }
  }

  const revoke = async (official) => {
    if (!confirm(`Revoke official access for ${official.name} (${official.email})?`)) return
    setBusy(official.id)
    try {
      const token = await getToken()
      await api.delete(`/auth/officials/${official.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setOfficials(list => list.filter(o => o.id !== official.id))
    } catch (err) {
      setError(err.response?.data?.error || 'Could not revoke access')
    } finally {
      setBusy('')
    }
  }

  const reindex = async () => {
    setBusy('reindex')
    try {
      const token = await getToken()
      const { data } = await api.post('/issues/ai-reindex', {}, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setFormOk(`Re-indexed ${data.indexed ?? data.requested ?? 0} grievances`)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Re-index failed')
    } finally {
      setBusy('')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const engine = health?.duplicate_engine
  const llm = health?.llm
  const duplicateReports = duplicates.reduce((sum, c) => sum + (c.duplicateCount || 0), 0)

  const Status = ({ ok, children }) => (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {children}
    </span>
  )

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Crown className="h-5 w-5 text-primary" />
            Owner Console
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            System health, official access, and where the backlog sits
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* --- Service health --------------------------------------------- */}
      <h2 className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
        <ServerCog className="h-4 w-4 text-muted-foreground" /> AI service
      </h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-3.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Reachable</p>
            <div className="mt-1"><Status ok={health?.reachable}>{health?.reachable ? 'Online' : 'Unreachable'}</Status></div>
            {!health?.reachable && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Grievances still save, with fallback triage.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Duplicate engine</p>
            <div className="mt-1"><Status ok={engine?.semantic}>{engine?.semantic ? 'Semantic' : 'Fallback'}</Status></div>
            <p className="mt-1 text-[11px] text-muted-foreground truncate">
              {engine ? `${engine.embedding_model} · ${engine.vector_backend}` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Language model</p>
            <div className="mt-1"><Status ok={llm?.available}>{llm?.available ? 'Active' : 'Rules only'}</Status></div>
            <p className="mt-1 text-[11px] text-muted-foreground truncate">{llm?.provider || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Vectors indexed</p>
            <p className="mt-0.5 text-2xl font-bold">{engine?.indexed_complaints ?? '—'}</p>
            <Button variant="ghost" size="sm" className="mt-1 h-6 px-1.5 text-[11px]"
                    onClick={reindex} disabled={busy === 'reindex'}>
              {busy === 'reindex' && <Loader2 className="h-3 w-3 animate-spin" />} Rebuild from database
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* --- Grievance load --------------------------------------------- */}
      <h2 className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
        <Activity className="h-4 w-4 text-muted-foreground" /> Grievance load
      </h2>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Total', value: stats?.total },
          { label: 'Pending', value: stats?.pending, tone: 'text-amber-600 dark:text-amber-400' },
          { label: 'In Progress', value: stats?.inProgress, tone: 'text-sky-600 dark:text-sky-400' },
          { label: 'Resolved', value: stats?.resolved, tone: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Escalated', value: stats?.escalated, tone: 'text-red-600 dark:text-red-400' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className={`mt-0.5 text-2xl font-bold ${s.tone || ''}`}>{s.value ?? '—'}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Load by department</h3>
            {analytics?.byCategory?.length ? (
              <ul className="space-y-2">
                {analytics.byCategory.slice(0, 8).map(row => {
                  const max = Math.max(...analytics.byCategory.map(c => c.count)) || 1
                  return (
                    <li key={row.name}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate">{row.name}</span>
                        <span className="ml-2 font-medium tabular-nums">{row.count}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary"
                             style={{ width: `${(row.count / max) * 100}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No data yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Copy className="h-4 w-4 text-muted-foreground" /> Duplicate clusters
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              {duplicates.length} issue{duplicates.length === 1 ? '' : 's'} attracted{' '}
              {duplicateReports} repeat report{duplicateReports === 1 ? '' : 's'} — work the
              AI collapsed into one ticket.
            </p>
            {duplicates.length ? (
              <ul className="space-y-2">
                {duplicates.slice(0, 6).map(c => (
                  <li key={c.original._id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{c.original.title}</span>
                    <Badge variant="secondary" className="shrink-0">+{c.duplicateCount}</Badge>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No duplicates detected yet.</p>}
          </CardContent>
        </Card>
      </div>

      {/* --- Official access -------------------------------------------- */}
      <h2 className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
        <Users className="h-4 w-4 text-muted-foreground" /> Government official access
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Plus className="h-4 w-4" /> Issue an official account
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Officials cannot self-register. They can update status and add notes —
              never edit or delete a grievance.
            </p>

            {formError && (
              <div role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
                {formError}
              </div>
            )}
            {formOk && (
              <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                {formOk}
              </div>
            )}

            <form onSubmit={createOfficial} className="space-y-2.5">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="o-name" className="text-xs">Name</Label>
                  <Input id="o-name" required value={form.name}
                         onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="o-email" className="text-xs">Official email</Label>
                  <Input id="o-email" type="email" required value={form.email}
                         onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="o-desig" className="text-xs">Designation</Label>
                  <Input id="o-desig" placeholder="Junior Engineer" value={form.designation}
                         onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="o-emp" className="text-xs">Employee ID</Label>
                  <Input id="o-emp" placeholder="KA-JE-0001" value={form.employeeId}
                         onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="o-role" className="text-xs">Access</Label>
                  <select
                    id="o-role"
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  >
                    <option value="official">Official — assigned department</option>
                    <option value="dept_admin">Department admin — assigned queue</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="o-dept" className="text-xs">
                    Department <span className="text-destructive">*</span>
                  </Label>
                  <Input id="o-dept" list="known-departments" placeholder="Public Works Department" value={form.department}
                         onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
                  {/* A datalist, not a <select>: an official can still be assigned to a
                      department outside the standard list, but a typo of a real one is
                      the more likely mistake, and this suggests the correct spelling as
                      they type instead of quietly creating an unreachable queue. */}
                  <datalist id="known-departments">
                    {knownDepartments.map(d => <option key={d} value={d} />)}
                  </datalist>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="o-region" className="text-xs">Region <span className="text-destructive">*</span></Label>
                  <select
                    id="o-region" required
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={form.region}
                    onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                  >
                    <option value="">Select state / UT…</option>
                    {INDIAN_REGIONS.map(region => <option key={region} value={region}>{region}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="o-pass" className="text-xs">Temporary password</Label>
                <Input id="o-pass" type="text" required minLength={8} value={form.password}
                       placeholder="At least 8 characters"
                       onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground">
                  Share this out of band. They can change it from their profile.
                </p>
              </div>
              <Button type="submit" size="sm" disabled={busy === 'create' || !form.department || !form.region}>
                {busy === 'create' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create account
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4" /> Active officials ({officials.length})
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Sign-in at <Link to="/official/sign-in" className="text-primary hover:underline">/official/sign-in</Link>
            </p>
            {officials.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No official accounts yet.
              </p>
            ) : (
              <ul className="divide-y">
                {officials.map(o => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{o.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {o.email}
                        {o.designation && ` · ${o.designation}`}
                        {o.employeeId && ` · ${o.employeeId}`}
                      </p>
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        {`${o.role === 'dept_admin' ? 'Dept admin' : 'Official'} · ${o.department || 'unassigned'} · ${o.region || 'unassigned region'}`}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      className="shrink-0 text-destructive hover:text-destructive"
                      disabled={busy === o.id}
                      onClick={() => revoke(o)}
                    >
                      {busy === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
