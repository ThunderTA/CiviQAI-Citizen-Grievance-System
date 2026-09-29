import { useEffect, useState } from 'react'
import { useAuth, useUser } from '@/lib/auth'
import api from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, User, CheckCircle2, Clock, AlertCircle, Star, ThumbsUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

const statusVariant = { pending: 'warning', 'in-progress': 'info', resolved: 'success' }

export default function Profile() {
  const { getToken } = useAuth()
  const { user, isLoaded } = useUser()
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)

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

  if (!isLoaded || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  const total = issues.length
  const resolved = issues.filter(i => i.status === 'resolved').length
  const inProgress = issues.filter(i => i.status === 'in-progress').length
  const pending = issues.filter(i => i.status === 'pending').length
  const resolutionRate = total ? Math.round((resolved / total) * 100) : 0
  const avgVotes = total ? (issues.reduce((s, i) => s + (i.votes || 0), 0) / total).toFixed(1) : 0
  const ratedCount = issues.filter(i => i.rating?.score).length
  const avgRating = ratedCount
    ? (issues.filter(i => i.rating?.score).reduce((s, i) => s + i.rating.score, 0) / ratedCount).toFixed(1)
    : null

  // Category breakdown
  const categoryMap = issues.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] || 0) + 1
    return acc
  }, {})
  const topCategories = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const recentIssues = [...issues].slice(0, 4)

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : null

  return (
    <div className="mx-auto max-w-4xl">
      {/* Profile header */}
      <div className="flex items-center gap-5 mb-10">
        {user?.imageUrl ? (
          <img src={user.imageUrl} alt="Avatar" className="h-16 w-16 rounded-full border-2 border-border object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full border-2 border-border bg-muted flex items-center justify-center">
            <User className="h-7 w-7 text-muted-foreground" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{user?.fullName || 'Citizen'}</h1>
          <p className="text-sm text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
          {memberSince && <p className="text-xs text-muted-foreground mt-0.5">Member since {memberSince}</p>}
        </div>
        <Button asChild size="sm" className="ml-auto">
          <Link to="/submit">+ Report Issue</Link>
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <Card className="lg:col-span-1">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Submitted</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{resolved}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Resolved</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{inProgress}</p>
            <p className="text-xs text-muted-foreground mt-0.5">In Progress</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{pending}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pending</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-primary">{resolutionRate}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Resolved</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold">{avgVotes}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Avg Votes</p>
          </CardContent>
        </Card>
      </div>

      {/* Resolution bar */}
      {total > 0 && (
        <Card className="mb-8">
          <CardContent className="pt-5 pb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium">Resolution Progress</span>
              <span className="text-muted-foreground">{resolved} of {total} resolved</span>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${resolutionRate}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> {resolved} resolved</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-blue-500" /> {inProgress} in progress</span>
              <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-yellow-500" /> {pending} pending</span>
              {avgRating && <span className="flex items-center gap-1"><Star className="h-3 w-3 text-yellow-400" /> {avgRating} avg rating</span>}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top categories */}
        {topCategories.length > 0 && (
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-sm font-semibold mb-4">Issues by Category</p>
              <div className="space-y-3">
                {topCategories.map(([cat, count]) => (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">{cat}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(count / total) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent issues */}
        {recentIssues.length > 0 && (
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold">Recent Issues</p>
                <Link to="/my-issues" className="text-xs text-primary hover:underline">View all</Link>
              </div>
              <div className="space-y-3">
                {recentIssues.map(issue => (
                  <div key={issue._id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{issue.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-muted-foreground">{issue.category}</span>
                        {issue.votes > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <ThumbsUp className="h-2.5 w-2.5" /> {issue.votes}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant={statusVariant[issue.status]} className="shrink-0 capitalize text-xs">
                      {issue.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {total === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <User className="h-10 w-10 mx-auto mb-3 opacity-25" />
          <p className="font-medium mb-1">No issues submitted yet</p>
          <p className="text-sm mb-4">Start by reporting a civic issue in your area.</p>
          <Button asChild size="sm">
            <Link to="/submit">Report an Issue</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
