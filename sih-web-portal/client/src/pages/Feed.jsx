import { useEffect, useState, useCallback } from 'react'
import { useAuth, useUser } from '@/lib/auth'
import api from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { StatusTimeline } from '@/components/StatusTimeline'
import { BeforeAfterViewer } from '@/components/BeforeAfterViewer'
import { CommentSection } from '@/components/CommentSection'
import { SLATimer } from '@/components/SLATimer'
import { SimilarReportsBadge, PriorityRaisedBadge, PriorityRaisedNote } from '@/components/ReportSignals'
import { Loader2, ThumbsUp, Search, Globe2, Brain, Clock, MessageSquare, Sparkles, Navigation, MapPin, ClipboardCheck, CheckCircle2 } from 'lucide-react'

const statusVariant = { pending: 'warning', 'in-progress': 'info', resolved: 'success' }
const priorityVariant = { high: 'destructive', medium: 'warning', low: 'secondary' }

export default function Feed() {
  const { getToken, isSignedIn, role } = useAuth()
  const { rawUser } = useUser()
  const isOfficial = ['official', 'dept_admin'].includes(role)
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('votes')
  const [filterStatus, setFilterStatus] = useState('')
  const [nearMeActive, setNearMeActive] = useState(false)
  const [userLocation, setUserLocation] = useState(null)
  const [radiusKm, setRadiusKm] = useState('5')
  const [locating, setLocating] = useState(false)
  const [voting, setVoting] = useState(null)
  const [updatingIssue, setUpdatingIssue] = useState(null)
  const [actionError, setActionError] = useState('')
  const [votedIds, setVotedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('cc_voted') || '[]')) }
    catch { return new Set() }
  })

  const fetchFeed = useCallback(async (coords = null, radius = null) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (coords?.latitude && coords?.longitude) {
        params.set('lat', coords.latitude)
        params.set('lng', coords.longitude)
        if (radius) params.set('radius', radius)
      }
      const token = isSignedIn ? await getToken() : null
      const { data } = await api.get(`/issues/feed?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      setIssues(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [getToken, isSignedIn])

  useEffect(() => {
    fetchFeed()
  }, [fetchFeed])

  const toggleNearMe = () => {
    if (!nearMeActive) {
      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser')
        return
      }
      setLocating(true)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
          setUserLocation(coords)
          setNearMeActive(true)
          setLocating(false)
          fetchFeed(coords, radiusKm)
        },
        () => {
          setLocating(false)
          alert('Could not retrieve your location. Please check browser permissions.')
        },
        { enableHighAccuracy: true }
      )
    } else {
      setNearMeActive(false)
      setUserLocation(null)
      fetchFeed()
    }
  }

  const handleRadiusChange = (newRadius) => {
    setRadiusKm(newRadius)
    if (nearMeActive && userLocation) {
      fetchFeed(userLocation, newRadius)
    }
  }

  const handleVote = async (issueId, e) => {
    e?.stopPropagation()
    if (!isSignedIn || voting) return
    setVoting(issueId)
    try {
      const token = await getToken()
      const { data } = await api.post(`/issues/${issueId}/vote`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setIssues(prev => prev.map(i => i._id === issueId ? { ...i, votes: data.votes } : i))
      setSelected(prev => prev?._id === issueId ? { ...prev, votes: data.votes } : prev)
      setVotedIds(prev => {
        const next = new Set(prev)
        data.voted ? next.add(issueId) : next.delete(issueId)
        localStorage.setItem('cc_voted', JSON.stringify([...next]))
        return next
      })
    } catch (err) {
      console.error(err)
    } finally {
      setVoting(null)
    }
  }

  const updateIssueStatus = async (issue, status, e) => {
    e?.stopPropagation()
    setActionError('')
    setUpdatingIssue(issue._id)
    try {
      const token = await getToken()
      const { data } = await api.patch(`/issues/${issue._id}`, { status }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setIssues(prev => prev.map(item => item._id === data._id ? { ...item, ...data } : item))
      setSelected(prev => prev?._id === data._id ? { ...prev, ...data } : prev)
    } catch (err) {
      setActionError(err.response?.data?.error || 'Could not update this issue')
    } finally {
      setUpdatingIssue(null)
    }
  }

  const filtered = issues
    .filter(i => {
      if (filterStatus && i.status !== filterStatus) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          i.title.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q) ||
          i.state?.toLowerCase().includes(q) ||
          i.category?.toLowerCase().includes(q)
        )
      }
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'nearby' && a.distanceKm != null && b.distanceKm != null) {
        return a.distanceKm - b.distanceKm
      }
      if (sortBy === 'votes') {
        return (b.votes || 0) - (a.votes || 0)
      }
      return new Date(b.createdAt) - new Date(a.createdAt)
    })

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <Globe2 className="h-6 w-6 text-primary" /> Community Feed
        </h1>
        <p className="text-sm text-muted-foreground">
          {isOfficial
            ? `Your assigned community issues: ${rawUser?.department || 'department'} · ${rawUser?.region || 'region'}. Take up and resolve issues from this feed.`
            : 'Browse civic issues from across India. Upvote neighborhood concerns, track live SLA countdowns, and inspect resolution proof.'}
        </p>
      </div>

      {actionError && (
        <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {/* Filters & Near Me Radar Bar */}
      <div className="space-y-3 mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search issues, categories, landmarks…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in-progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </Select>

          <Select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="votes">Most Voted</option>
            <option value="newest">Newest</option>
            {nearMeActive && <option value="nearby">Closest Distance</option>}
          </Select>

          {/* Near Me Toggle */}
          <Button
            type="button"
            variant={nearMeActive ? 'default' : 'outline'}
            size="sm"
            onClick={toggleNearMe}
            disabled={locating}
            className={`gap-1.5 text-xs h-9 ${
              nearMeActive
                ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                : 'text-primary border-primary/30 bg-primary/5 hover:bg-primary/10'
            }`}
          >
            {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
            <span>{nearMeActive ? 'Near Me: Active' : 'Filter Near Me'}</span>
          </Button>

          {nearMeActive && (
            <Select
              value={radiusKm}
              onChange={e => handleRadiusChange(e.target.value)}
              className="w-32 h-9 text-xs"
            >
              <option value="1">Within 1 km</option>
              <option value="3">Within 3 km</option>
              <option value="5">Within 5 km</option>
              <option value="10">Within 10 km</option>
              <option value="25">Within 25 km</option>
            </Select>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        {filtered.length} issue{filtered.length !== 1 ? 's' : ''} {nearMeActive ? `within ${radiusKm} km of your GPS location` : ''}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <Globe2 className="h-10 w-10 mx-auto mb-3 opacity-25" />
          <p className="font-medium">No issues found</p>
          {nearMeActive && <p className="text-xs mt-1">Try expanding your search radius.</p>}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(issue => {
            const voted = votedIds.has(issue._id)
            const isVerified = issue.resolutionVerification?.isVerified
            return (
              <Card
                key={issue._id}
                className="cursor-pointer hover:shadow-md transition-shadow flex flex-col"
                onClick={() => setSelected(issue)}
              >
                <CardContent className="pt-5 pb-4 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-sm leading-snug line-clamp-2 flex-1">{issue.title}</h3>
                    <Badge variant={statusVariant[issue.status]} className="shrink-0 capitalize text-xs">
                      {issue.status}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                    {issue.aiSummary || issue.description}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <Badge variant="secondary" className="text-xs">{issue.category}</Badge>
                    <Badge variant={priorityVariant[issue.priority]} className="text-xs capitalize">{issue.priority}</Badge>
                    <PriorityRaisedBadge issue={issue} />
                    <SimilarReportsBadge issue={issue} />
                    {issue.distanceFormatted && (
                      <Badge variant="outline" className="text-xs font-semibold text-primary border-primary/30 gap-0.5">
                        <MapPin className="h-2.5 w-2.5" /> {issue.distanceFormatted}
                      </Badge>
                    )}
                    {isVerified && (
                      <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] py-0">
                        ✓ AI Verified
                      </Badge>
                    )}
                  </div>

                  {/* Compact SLA status */}
                  <div className="mb-3">
                    <SLATimer issue={issue} compact />
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-1 border-t">
                    <span className="text-xs text-muted-foreground">
                      {new Date(issue.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <div className="flex items-center gap-2">
                      {isOfficial && issue.status === 'pending' && (
                        <Button
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          disabled={updatingIssue === issue._id}
                          onClick={e => updateIssueStatus(issue, 'in-progress', e)}
                        >
                          {updatingIssue === issue._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardCheck className="h-3 w-3" />}
                          Take up
                        </Button>
                      )}
                      {issue.comments?.length > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <MessageSquare className="h-3 w-3" /> {issue.comments.length}
                        </span>
                      )}
                      <button
                        onClick={e => handleVote(issue._id, e)}
                        disabled={!isSignedIn || voting === issue._id}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                          voted
                            ? 'bg-primary/10 text-primary border-primary/30 font-medium'
                            : 'text-muted-foreground border-border hover:text-foreground hover:bg-muted'
                        } disabled:opacity-50 disabled:cursor-default`}
                      >
                        {voting === issue._id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <ThumbsUp className="h-3 w-3" />}
                        {issue.votes || 0}
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Detail modal */}
      <Dialog open={!!selected} onClose={() => setSelected(null)} className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {selected && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">{selected.title}</DialogTitle>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge variant={statusVariant[selected.status]} className="capitalize">{selected.status}</Badge>
                <Badge variant="secondary">{selected.category}</Badge>
                <Badge variant={priorityVariant[selected.priority]} className="capitalize">{selected.priority}</Badge>
                <SimilarReportsBadge issue={selected} />
                {selected.resolutionVerification?.isVerified && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs">
                    ✓ AI Verified Resolution
                  </Badge>
                )}
              </div>
              <PriorityRaisedNote issue={selected} className="mt-2" />
            </DialogHeader>

            <DialogContent className="space-y-5">
              {/* Meta & Location */}
              <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-1">
                {selected.submitterName && (
                  <p><span className="font-medium">Reported by:</span> {selected.submitterName}</p>
                )}
                {(selected.state || selected.location) && (
                  <p className="text-muted-foreground">
                    {[selected.state, selected.location].filter(Boolean).join(' · ')}
                  </p>
                )}
                {selected.coordinates?.latitude && (
                  <p className="text-xs text-muted-foreground font-mono">
                    GPS Coordinates: {selected.coordinates.latitude.toFixed(5)}, {selected.coordinates.longitude.toFixed(5)}
                  </p>
                )}
                {selected.department && (
                  <p className="text-muted-foreground">Assigned to: {selected.department}</p>
                )}
                <p className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(selected.createdAt).toLocaleString('en-IN')}
                </p>
              </div>

              {/* SLA Timer */}
              <SLATimer issue={selected} />

              {/* Description */}
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{selected.description}</p>
              </div>

              {/* AI Summary */}
              {selected.aiSummary && (
                <div className="rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 mb-1">
                    <Brain className="h-3.5 w-3.5" /> AI Summary & Triage
                  </div>
                  <p className="text-sm italic mb-2">"{selected.aiSummary}"</p>
                  {selected.imageAnalysis?.detectedIssue && (
                    <p className="text-xs text-foreground font-medium">
                      Visual Defect: <span className="text-muted-foreground font-normal">{selected.imageAnalysis.detectedIssue}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Before vs After Resolution Inspection */}
              {(selected.resolutionImageBase64 || (selected.status === 'resolved' && selected.imageBase64)) && (
                <BeforeAfterViewer
                  beforeImage={selected.imageBase64}
                  afterImage={selected.resolutionImageBase64}
                  verification={selected.resolutionVerification}
                />
              )}

              {/* Single Image fallback */}
              {selected.imageBase64 && !selected.resolutionImageBase64 && (
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Complaint Photo</p>
                  <img src={selected.imageBase64} alt="Issue" className="rounded-lg border max-h-56 object-cover w-full" />
                </div>
              )}

              {/* Admin note */}
              {selected.adminNote && (
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Official Response</p>
                  <p className="text-sm">{selected.adminNote}</p>
                </div>
              )}

              {isOfficial && selected.status !== 'resolved' && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="mb-2 text-sm font-medium">Official action</p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    This issue is in your assigned department and region. You can take it up or mark it resolved.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selected.status === 'pending' && (
                      <Button size="sm" disabled={updatingIssue === selected._id}
                              onClick={e => updateIssueStatus(selected, 'in-progress', e)}>
                        {updatingIssue === selected._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                        Take up issue
                      </Button>
                    )}
                    {selected.status === 'in-progress' && (
                      <Button size="sm" disabled={updatingIssue === selected._id}
                              onClick={e => updateIssueStatus(selected, 'resolved', e)}>
                        {updatingIssue === selected._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Mark resolved
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground mb-3">Status Timeline</p>
                <StatusTimeline issue={selected} />
              </div>

              {/* Vote CTA */}
              <button
                onClick={e => handleVote(selected._id, e)}
                disabled={!isSignedIn || voting === selected._id}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  votedIds.has(selected._id)
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'text-muted-foreground border-border hover:bg-muted'
                } disabled:opacity-50`}
              >
                {voting === selected._id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <ThumbsUp className="h-4 w-4" />}
                {votedIds.has(selected._id) ? 'Voted · ' : ''}
                {selected.votes || 0} upvote{selected.votes !== 1 ? 's' : ''}
                {!isSignedIn && <span className="text-xs opacity-60">(sign in to vote)</span>}
              </button>

              {/* Two-Way Comments Thread */}
              <CommentSection
                issueId={selected._id}
                comments={selected.comments || []}
                onCommentAdded={(updated) => {
                  setIssues(prev => prev.map(i => i._id === updated._id ? updated : i))
                  setSelected(updated)
                }}
              />
            </DialogContent>
          </>
        )}
      </Dialog>
    </div>
  )
}
