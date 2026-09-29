import { useState } from 'react'
import { useAuth, useUser } from '@/lib/auth'
import api from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MessageSquare, Send, ShieldCheck, User, Building2, Loader2, Sparkles } from 'lucide-react'

export function CommentSection({ issueId, comments = [], onCommentAdded }) {
  const { getToken, isSignedIn } = useAuth()
  const { user } = useUser()
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!text.trim() || submitting || !isSignedIn) return
    setError('')
    setSubmitting(true)
    try {
      const token = await getToken()
      const { data } = await api.post(
        `/issues/${issueId}/comments`,
        { text: text.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setText('')
      onCommentAdded?.(data)
    } catch (err) {
      console.error('Comment submit error:', err)
      setError(err.response?.data?.error || 'Failed to post comment')
    } finally {
      setSubmitting(false)
    }
  }

  const getRoleBadge = (role, dept) => {
    switch (role) {
      case 'admin':
        return (
          <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[10px] py-0 px-1.5 gap-1 font-semibold">
            <ShieldCheck className="h-3 w-3" />
            Main Admin
          </Badge>
        )
      case 'dept_admin':
        return (
          <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 text-[10px] py-0 px-1.5 gap-1 font-semibold">
            <Building2 className="h-3 w-3" />
            {dept || 'Official'}
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 gap-1 font-normal">
            <User className="h-3 w-3" />
            Citizen
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between pb-2 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-sm">Official Discussion & Updates</h4>
        </div>
        <span className="text-xs text-muted-foreground font-medium">
          {comments.length} {comments.length === 1 ? 'message' : 'messages'}
        </span>
      </div>

      {/* Comment List */}
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {comments.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            <MessageSquare className="h-6 w-6 mx-auto mb-1.5 opacity-40" />
            <p>No messages yet.</p>
            <p className="opacity-80">Citizens and officials can communicate and post status updates here.</p>
          </div>
        ) : (
          comments.map((c, index) => {
            const isOfficial = c.userRole === 'admin' || c.userRole === 'dept_admin'
            return (
              <div
                key={c._id || index}
                className={`p-3 rounded-lg text-xs leading-relaxed border transition-colors ${
                  isOfficial
                    ? 'bg-primary/5 border-primary/20 dark:bg-primary/10'
                    : 'bg-muted/40 border-border/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground text-xs">{c.userName || 'Citizen'}</span>
                    {getRoleBadge(c.userRole, c.userDepartment)}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(c.createdAt).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-foreground whitespace-pre-wrap">{c.text}</p>
              </div>
            )
          })
        )}
      </div>

      {/* Input Field */}
      {isSignedIn ? (
        <form onSubmit={handleSubmit} className="space-y-2 pt-2 border-t">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Textarea
              placeholder="Write a message, query, or official update…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              className="text-xs resize-none"
            />
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !text.trim()}
              className="self-end shrink-0 gap-1"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send
            </Button>
          </div>
        </form>
      ) : (
        <div className="pt-2 border-t text-center text-xs text-muted-foreground">
          Sign in to post a question or reply to authorities.
        </div>
      )}
    </div>
  )
}
