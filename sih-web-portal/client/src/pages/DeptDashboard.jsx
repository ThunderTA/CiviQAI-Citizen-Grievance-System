import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth'
import { useRole } from '@/contexts/RoleContext'
import api from '@/lib/api'
import socket from '@/lib/socket'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { ToastContainer } from '@/components/ui/toast'
import { BeforeAfterViewer } from '@/components/BeforeAfterViewer'
import { CommentSection } from '@/components/CommentSection'
import { SLATimer } from '@/components/SLATimer'
import { Loader2, Brain, MapPin, Clock, ShieldX, Search, Upload, Sparkles, ShieldAlert } from 'lucide-react'

const statusVariant = { pending: 'warning', 'in-progress': 'info', resolved: 'success' }
const priorityVariant = { high: 'destructive', medium: 'warning', low: 'secondary' }
const sentimentVariant = { positive: 'success', negative: 'destructive', neutral: 'secondary' }

const isIssueEscalated = (issue) => issue.status !== 'resolved' && (issue.sla?.isBreached || ((Date.now() - new Date(issue.createdAt)) > 7 * 86400000))

function StatCard({ label, value, color, highlight }) {
  return (
    <Card className={highlight ? 'border-red-200 bg-red-50/30 dark:border-red-900/60 dark:bg-red-950/20' : ''}>
      <CardContent className="pt-5 pb-4">
        <p className="text-sm text-muted-foreground mb-1">{label}</p>
        <p className={`text-3xl font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function IssueRow({ issue, onClick }) {
  const escalated = isIssueEscalated(issue)
  const isVerified = issue.resolutionVerification?.isVerified
  return (
    <tr
      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={() => onClick(issue)}
    >
      <td className="py-3 px-4 max-w-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm truncate">{issue.title}</p>
          {escalated && (
            <span className="shrink-0 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-900 flex items-center gap-0.5">
              <ShieldAlert className="h-3 w-3" /> Escalated
            </span>
          )}
          {isVerified && (
            <span className="shrink-0 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-900">
              ✓ Verified
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {issue.submitterName || 'Anonymous'} {issue.state ? `· ${issue.state}` : ''}
        </p>
      </td>
      <td className="py-3 px-4">
        <Badge variant="secondary" className="text-xs">{issue.category}</Badge>
      </td>
      <td className="py-3 px-4">
        <Badge variant={priorityVariant[issue.priority]} className="text-xs capitalize">{issue.priority}</Badge>
      </td>
      <td className="py-3 px-4">
        <Badge variant={statusVariant[issue.status]} className="text-xs capitalize">{issue.status}</Badge>
      </td>
      <td className="py-3 px-4">
        <SLATimer issue={issue} compact />
      </td>
      <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
        {new Date(issue.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
      </td>
    </tr>
  )
}

export default function DeptDashboard() {
  const { getToken } = useAuth()
  const { role, department, synced } = useRole()

  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [toasts, setToasts] = useState([])
  const [editForm, setEditForm] = useState({
    status: '',
    adminNote: '',
    resolutionImageBase64: '',
  })
  const resolutionFileRef = useRef(null)
  const toastIdRef = useRef(0)

  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current
    setToasts((prev) => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const fetchIssues = useCallback(async () => {
    try {
      const token = await getToken()
      const params = new URLSearchParams()
      if (statusFilter && statusFilter !== 'escalated') params.set('status', statusFilter)
      if (statusFilter === 'escalated') params.set('escalated', 'true')
      const { data } = await api.get(`/issues?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setIssues(data)
      setFetchError('')
    } catch (err) {
      setFetchError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }, [getToken, statusFilter])

  useEffect(() => {
    if (synced && role === 'dept_admin') fetchIssues()
  }, [synced, role, fetchIssues])

  useEffect(() => {
    if (role !== 'dept_admin') return
    socket.connect()
    socket.on('issue_updated', (updated) => {
      if (updated.department === department) {
        setIssues((prev) => prev.map((i) => i._id === updated._id ? updated : i))
        setSelected((prev) => prev?._id === updated._id ? updated : prev)
        addToast(`Issue updated: ${updated.title}`, 'info')
      }
    })
    return () => {
      socket.off('issue_updated')
      socket.disconnect()
    }
  }, [role, department, addToast])

  const openDetail = (issue) => {
    setSelected(issue)
    setEditForm({
      status: issue.status,
      adminNote: issue.adminNote || '',
      resolutionImageBase64: issue.resolutionImageBase64 || '',
    })
  }

  const handleResolutionPhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setEditForm((prev) => ({ ...prev, resolutionImageBase64: reader.result }))
    }
    reader.readAsDataURL(file)
  }

  const handleUpdate = async () => {
    setSaving(true)
    try {
      const token = await getToken()
      const { data } = await api.patch(`/issues/${selected._id}`, editForm, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setIssues((prev) => prev.map((i) => (i._id === data._id ? data : i)))
      setSelected(data)
      fetchIssues()
      addToast('Issue updated successfully', 'success')
    } catch (err) {
      console.error(err)
      addToast(err.response?.data?.error || 'Failed to update issue', 'error')
    } finally {
      setSaving(false)
    }
  }

  const filteredIssues = issues.filter((i) =>
    !search || i.title.toLowerCase().includes(search.toLowerCase()) ||
    i.submitterName?.toLowerCase().includes(search.toLowerCase())
  )

  const pending = issues.filter((i) => i.status === 'pending').length
  const inProgress = issues.filter((i) => i.status === 'in-progress').length
  const resolved = issues.filter((i) => i.status === 'resolved').length
  const escalated = issues.filter(isIssueEscalated).length

  if (!synced || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (role !== 'dept_admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <ShieldX className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground text-sm">This dashboard is only accessible to department administrators.</p>
      </div>
    )
  }

  return (
    <div className="w-full">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold">Department Dashboard</h1>
          <Badge variant="secondary" className="text-sm">{department}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Manage, resolve, and meet SLA timelines for issues assigned to your department</p>
      </div>

      {fetchError && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          API Error: {fetchError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="Total" value={issues.length} color="text-foreground" />
        <StatCard label="Pending" value={pending} color="text-yellow-600 dark:text-yellow-400" />
        <StatCard label="In Progress" value={inProgress} color="text-blue-600 dark:text-blue-400" />
        <StatCard label="Resolved" value={resolved} color="text-green-600 dark:text-green-400" />
        <StatCard label="Escalated" value={escalated} color="text-red-600 dark:text-red-400" highlight={escalated > 0} />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-4 pb-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Search issues…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="escalated">🔴 Escalated Only</option>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setStatusFilter('')}>Clear</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Issue</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Category</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Priority</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">SLA Target</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredIssues.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    {issues.length === 0 ? 'No issues assigned to your department yet' : 'No issues match your search'}
                  </td>
                </tr>
              ) : (
                filteredIssues.map((issue) => (
                  <IssueRow key={issue._id} issue={issue} onClick={openDetail} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!selected} onClose={() => setSelected(null)} className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {selected && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">{selected.title}</DialogTitle>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge variant={statusVariant[selected.status]} className="capitalize">{selected.status}</Badge>
                <Badge variant={sentimentVariant[selected.sentiment]} className="capitalize">{selected.sentiment}</Badge>
                <Badge variant="secondary">{selected.category}</Badge>
                {isIssueEscalated(selected) && (
                  <Badge variant="destructive" className="gap-1">
                    <ShieldAlert className="h-3 w-3" /> SLA Escalated
                  </Badge>
                )}
                {selected.resolutionVerification?.isVerified && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs">
                    ✓ AI Verified
                  </Badge>
                )}
              </div>
            </DialogHeader>

            <DialogContent className="space-y-5">
              <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-1">
                <p><span className="font-medium">Submitted by:</span> {selected.submitterName || 'Anonymous'}</p>
                {selected.submitterEmail && <p className="text-muted-foreground">{selected.submitterEmail}</p>}
                {selected.submitterPhone && (
                  <p className="text-xs text-muted-foreground">
                    Phone: {selected.submitterPhone} {selected.notifyViaWhatsapp ? '(WhatsApp Opt-in)' : ''} {selected.notifyViaSms ? '(SMS Opt-in)' : ''}
                  </p>
                )}
                {selected.state && <p className="text-muted-foreground">State: {selected.state}</p>}
                {selected.location && (
                  <p className="flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5" /> {selected.location}
                  </p>
                )}
                {selected.coordinates?.latitude && (
                  <p className="text-xs text-muted-foreground font-mono">
                    GPS Coordinates: {selected.coordinates.latitude.toFixed(5)}, {selected.coordinates.longitude.toFixed(5)}
                  </p>
                )}
                <p className="flex items-center gap-1 mt-1 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(selected.createdAt).toLocaleString('en-IN')}
                </p>
              </div>

              {/* SLA Timer */}
              <SLATimer issue={selected} />

              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{selected.description}</p>
              </div>

              {selected.aiSummary && (
                <div className="rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 mb-1.5">
                    <Brain className="h-3.5 w-3.5" /> AI Summary
                  </div>
                  <p className="text-sm italic mb-2">"{selected.aiSummary}"</p>
                  {selected.imageAnalysis?.detectedIssue && (
                    <p className="text-xs text-foreground font-medium">
                      AI Observation: <span className="text-muted-foreground font-normal">{selected.imageAnalysis.detectedIssue}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Before vs After Resolution Viewer */}
              {(selected.resolutionImageBase64 || editForm.resolutionImageBase64) && (
                <BeforeAfterViewer
                  beforeImage={selected.imageBase64}
                  afterImage={editForm.resolutionImageBase64 || selected.resolutionImageBase64}
                  verification={selected.resolutionVerification}
                />
              )}

              {selected.imageBase64 && !selected.resolutionImageBase64 && !editForm.resolutionImageBase64 && (
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Original Complaint Photo</p>
                  <img src={selected.imageBase64} alt="Issue" className="rounded-lg border max-h-48 object-cover w-full" />
                </div>
              )}

              <Separator />

              <div className="space-y-4 bg-muted/10 p-4 rounded-xl border">
                <div className="space-y-1.5">
                  <Label>Update Status</Label>
                  <Select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                    <option value="pending">Pending</option>
                    <option value="in-progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </Select>
                </div>

                {/* Resolution Photo Upload */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-primary" /> Resolution Proof Photo ("After")
                  </Label>
                  {editForm.resolutionImageBase64 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Photo attached</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditForm((prev) => ({ ...prev, resolutionImageBase64: '' }))}
                        className="h-6 text-xs text-destructive"
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => resolutionFileRef.current?.click()}
                      className="w-full text-xs gap-1.5"
                    >
                      <Upload className="h-3.5 w-3.5" /> Upload Resolution Photo
                    </Button>
                  )}
                  <input ref={resolutionFileRef} type="file" accept="image/*" className="hidden" onChange={handleResolutionPhoto} />
                </div>

                <div className="space-y-1.5">
                  <Label>Official Note for Citizen</Label>
                  <textarea
                    value={editForm.adminNote}
                    onChange={(e) => setEditForm({ ...editForm, adminNote: e.target.value })}
                    placeholder="Update the citizen on the progress and resolution details (sent via Email & SMS/WhatsApp)…"
                    className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  />
                </div>
              </div>

              {/* Two-Way Comments Discussion */}
              <CommentSection
                issueId={selected._id}
                comments={selected.comments || []}
                onCommentAdded={(updated) => {
                  setIssues((prev) => prev.map((i) => i._id === updated._id ? updated : i))
                  setSelected(updated)
                }}
              />
            </DialogContent>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Cancel</Button>
              <Button size="sm" onClick={handleUpdate} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save & Dispatch Updates
              </Button>
            </DialogFooter>
          </>
        )}
      </Dialog>
    </div>
  )
}
