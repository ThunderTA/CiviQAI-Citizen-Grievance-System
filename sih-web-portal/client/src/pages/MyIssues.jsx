import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth'
import api from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Loader2, FileText, Brain, MapPin, Clock, Trash2, ThumbsUp, Sparkles, MessageSquare, Users, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { TrackingSummary, TrackingTrail, asSeenByCitizen } from '@/components/TrackingView'
import { SimilarReportsBadge, PriorityRaisedBadge } from '@/components/ReportSignals'
import { BeforeAfterViewer } from '@/components/BeforeAfterViewer'
import { CommentSection } from '@/components/CommentSection'
import { SLATimer } from '@/components/SLATimer'

const statusVariant = { pending: 'warning', 'in-progress': 'info', resolved: 'success' }
const priorityVariant = { high: 'destructive', medium: 'warning', low: 'secondary' }
const sentimentVariant = { positive: 'success', negative: 'destructive', neutral: 'secondary' }

function IssueCard({ issue: raw, onClick }) {
  // A report merged into another shows that report's priority and deadline.
  const issue = asSeenByCitizen(raw)
  const isVerified = issue.resolutionVerification?.isVerified
  const hasAfter = Boolean(issue.resolutionImageBase64)

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onClick(raw)}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="font-medium text-sm leading-snug line-clamp-2">{issue.title}</h3>
          <Badge variant={statusVariant[issue.status]} className="shrink-0 capitalize">
            {issue.status}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{issue.aiSummary || issue.description}</p>
        
        <div className="flex flex-wrap gap-1.5 mb-2">
          <Badge variant="secondary" className="text-xs">{issue.category}</Badge>
          <Badge variant={priorityVariant[issue.priority]} className="text-xs capitalize">{issue.priority}</Badge>
          <Badge variant={sentimentVariant[issue.sentiment]} className="text-xs capitalize">{issue.sentiment}</Badge>
          {raw.isDuplicate && raw.linkedIssue && (
            <Badge variant="outline" className="gap-1 text-[11px]" title="Your report was combined with an earlier one about the same problem">
              <Users className="h-3 w-3" /> Combined with {raw.linkedIssue.reportCount - 1} other{raw.linkedIssue.reportCount - 1 === 1 ? '' : 's'}
            </Badge>
          )}
          <SimilarReportsBadge issue={raw} />
          <PriorityRaisedBadge issue={raw.isDuplicate ? raw.linkedIssue : raw} />
          {isVerified && (
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] py-0">
              ✓ AI Verified
            </Badge>
          )}
        </div>

        <div className="mb-2">
          <SLATimer issue={issue} compact />
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {new Date(issue.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {issue.comments?.length > 0 && (
              <span className="flex items-center gap-0.5">
                <MessageSquare className="h-3 w-3" /> {issue.comments.length}
              </span>
            )}
            {issue.votes > 0 && (
              <span className="flex items-center gap-0.5">
                <ThumbsUp className="h-3 w-3" /> {issue.votes}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StarRating({ value, onChange, readonly = false }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => !readonly && onChange?.(star)}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
          className={readonly ? 'cursor-default' : 'cursor-pointer'}
        >
          <Star
            className={`h-6 w-6 transition-colors ${
              star <= (hover || value) ? 'fill-yellow-400 text-yellow-400' : 'fill-transparent text-muted-foreground/30'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

export default function MyIssues() {
  const { getToken } = useAuth()
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [ratingScore, setRatingScore] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [submittingRating, setSubmittingRating] = useState(false)

  const handleRate = async () => {
    if (!ratingScore) return
    setSubmittingRating(true)
    try {
      const token = await getToken()
      const { data } = await api.post(`/issues/${selected._id}/rate`, { score: ratingScore, comment: ratingComment }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setIssues(prev => prev.map(i => i._id === data._id ? data : i))
      setSelected(data)
      setRatingScore(0)
      setRatingComment('')
    } catch (err) {
      console.error(err)
    } finally {
      setSubmittingRating(false)
    }
  }

  const handleDelete = async (issue) => {
    if (!confirm('Delete this issue permanently?')) return
    setDeleting(true)
    try {
      const token = await getToken()
      await api.delete(`/issues/${issue._id}`, { headers: { Authorization: `Bearer ${token}` } })
      setIssues((prev) => prev.filter((i) => i._id !== issue._id))
      setSelected(null)
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getToken()
        const { data } = await api.get('/issues/my', { headers: { Authorization: `Bearer ${token}` } })
        setIssues(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [getToken])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">My Issues</h1>
          <p className="text-sm text-muted-foreground">{issues.length} issue{issues.length !== 1 ? 's' : ''} submitted</p>
        </div>
        <Button asChild size="sm">
          <Link to="/submit">+ Report New</Link>
        </Button>
      </div>

      {issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-medium mb-1">No issues yet</p>
          <p className="text-sm text-muted-foreground mb-4">Your submitted issues will appear here.</p>
          <Button asChild size="sm">
            <Link to="/submit">Report an Issue</Link>
          </Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {issues.map((issue) => (
            <IssueCard key={issue._id} issue={issue} onClick={setSelected} />
          ))}
        </div>
      )}

      <Dialog open={!!selected} onClose={() => setSelected(null)} className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {selected && (() => {
          // Their own words, the shared grievance's current priority/deadline.
          const shown = asSeenByCitizen(selected)
          return (
          <>
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">{selected.title}</DialogTitle>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge variant={statusVariant[selected.status]} className="capitalize">{selected.status}</Badge>
                <Badge variant={priorityVariant[shown.priority]} className="capitalize">{shown.priority} priority</Badge>
                {selected.resolutionVerification?.isVerified && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs">
                    ✓ AI Verified
                  </Badge>
                )}
              </div>
            </DialogHeader>
            <DialogContent className="pb-2">
              <div className="space-y-5">
                <TrackingSummary issue={selected} />

                {selected.location && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <span>{selected.location} {selected.state ? `(${selected.state})` : ''}</span>
                  </div>
                )}

                <SLATimer issue={shown} />

                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Description</p>
                  <p className="text-sm">{selected.description}</p>
                </div>

                {selected.aiSummary && (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">
                      <Brain className="h-3.5 w-3.5" /> AI Summary & Observation
                    </div>
                    <p className="text-sm italic text-muted-foreground mb-2">"{selected.aiSummary}"</p>
                    {selected.imageAnalysis?.detectedIssue && (
                      <p className="text-xs text-foreground font-medium">
                        Visual Insight: <span className="text-muted-foreground font-normal">{selected.imageAnalysis.detectedIssue}</span>
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{selected.category}</Badge>
                  <Badge variant={sentimentVariant[selected.sentiment]} className="capitalize">{selected.sentiment} sentiment</Badge>
                  {selected.imageAnalysis?.visualTags?.map((tag, idx) => (
                    <Badge key={idx} variant="outline" className="text-[11px] text-muted-foreground">
                      #{tag}
                    </Badge>
                  ))}
                </div>

                {selected.adminNote && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Official Note</p>
                    <p className="text-sm border rounded-md p-2.5 bg-muted/20">{selected.adminNote}</p>
                  </div>
                )}

                {/* Before vs After Resolution Viewer */}
                {(selected.resolutionImageBase64 || (selected.status === 'resolved' && selected.imageBase64)) && (
                  <div>
                    <BeforeAfterViewer
                      beforeImage={selected.imageBase64}
                      afterImage={selected.resolutionImageBase64}
                      verification={selected.resolutionVerification}
                    />
                  </div>
                )}

                {/* Single Image fallback if not resolved with after photo */}
                {selected.imageBase64 && !selected.resolutionImageBase64 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Uploaded Photo</p>
                    <img src={selected.imageBase64} alt="Issue" className="rounded-lg border max-h-56 object-cover w-full" />
                  </div>
                )}

                {/* Everything that has happened, and who did it */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase mb-3">Tracking</p>
                  <TrackingTrail issue={selected} />
                </div>

                {/* Satisfaction Rating */}
                {selected.status === 'resolved' && (
                  <div className="rounded-xl border p-4 bg-card">
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Resolution Satisfaction Rating</p>
                    {selected.rating?.score ? (
                      <div>
                        <StarRating value={selected.rating.score} readonly />
                        {selected.rating.comment && (
                          <p className="text-xs text-muted-foreground mt-1 italic">"{selected.rating.comment}"</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">How satisfied are you with the municipal resolution?</p>
                        <StarRating value={ratingScore} onChange={setRatingScore} />
                        <textarea
                          value={ratingComment}
                          onChange={e => setRatingComment(e.target.value)}
                          placeholder="Optional feedback for the department…"
                          className="w-full text-xs rounded-md border border-input bg-transparent px-2.5 py-1.5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none min-h-[56px]"
                        />
                        <Button size="sm" onClick={handleRate} disabled={!ratingScore || submittingRating} className="w-full">
                          {submittingRating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                          Submit Rating
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Two-Way Comments Section */}
                <CommentSection
                  issueId={selected._id}
                  comments={selected.comments || []}
                  onCommentAdded={(updated) => {
                    setIssues(prev => prev.map(i => i._id === updated._id ? updated : i))
                    setSelected(updated)
                  }}
                />

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                  <span>Submitted {new Date(selected.createdAt).toLocaleString('en-IN')}</span>
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="h-3 w-3" /> {selected.votes || 0} upvote{selected.votes !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </DialogContent>
            <DialogFooter>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(selected)}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                Delete Issue
              </Button>
            </DialogFooter>
          </>
          )
        })()}
      </Dialog>
    </div>
  )
}
