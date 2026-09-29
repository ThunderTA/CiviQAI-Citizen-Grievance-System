import { useState, useRef, useCallback } from 'react'
import { useAuth } from '@/lib/auth'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select } from '@/components/ui/select'
import { LocationPicker } from '@/components/LocationPicker'
import { SLATimer } from '@/components/SLATimer'
import { Upload, X, CheckCircle2, Loader2, Brain, MapPin, AlertTriangle, ThumbsUp, Sparkles, Phone, MessageSquare, BellRing, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'

const URGENCY_NAMES = { 5: 'Critical', 4: 'High', 3: 'Moderate', 2: 'Low', 1: 'Routine' }
const sentimentColors = { positive: 'success', negative: 'destructive', neutral: 'secondary' }
const priorityColors = { high: 'destructive', medium: 'warning', low: 'info' }

const INDIAN_STATES = [
  'Andaman & Nicobar', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra',
  'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal',
]

export default function CitizenPortal() {
  const { getToken } = useAuth()
  const fileRef = useRef(null)
  const searchTimer = useRef(null)

  const [form, setForm] = useState({
    title: '',
    description: '',
    location: '',
    state: '',
    submitterPhone: '',
    notifyViaSms: false,
    notifyViaWhatsapp: true,
    coordinates: null, // { latitude, longitude }
  })
  const [imagePreview, setImagePreview] = useState(null)
  const [imageBase64, setImageBase64] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(null)
  const [similarIssues, setSimilarIssues] = useState([])

  const searchSimilar = useCallback((query) => {
    clearTimeout(searchTimer.current)
    if (query.trim().length < 4) { setSimilarIssues([]); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/issues/search?q=${encodeURIComponent(query.trim())}`)
        setSimilarIssues(data)
      } catch { setSimilarIssues([]) }
    }, 600)
  }, [])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    const updated = { ...form, [name]: type === 'checkbox' ? checked : value }
    setForm(updated)
    if (name === 'title') searchSimilar(value)
  }

  const handleLocationSelect = ({ coordinates, locationText, stateName }) => {
    setForm(prev => {
      const next = { ...prev, coordinates }
      if (locationText && !prev.location) next.location = locationText
      if (stateName && !prev.state) {
        const matched = INDIAN_STATES.find(s => s.toLowerCase() === stateName.toLowerCase() || stateName.toLowerCase().includes(s.toLowerCase()))
        if (matched) next.state = matched
      }
      return next
    })
  }

  const handleImage = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB')
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result)
      setImageBase64(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.title.trim() || !form.description.trim()) {
      setError('Title and description are required')
      return
    }
    setLoading(true)
    try {
      const token = await getToken()
      const { data } = await api.post(
        '/issues',
        {
          ...form,
          imageBase64,
          state: form.state || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setSubmitted(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    const vision = submitted.imageAnalysis
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="border-green-200 dark:border-green-900 shadow-md">
          <CardContent className="pt-8 pb-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <h2 className="text-xl font-semibold mb-1">Issue Registered & Analyzed!</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Your civic report has been processed by our AI Vision & Triage engine, SLA clock activated, and routed to authorities.
            </p>

            {/* AI Vision & Triage Card */}
            <div className="rounded-xl border bg-muted/30 p-4 text-left mb-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Brain className="h-4 w-4 text-primary" />
                  AI Summary & Triage
                </div>
                {vision?.isGenuineCivicIssue && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI Vision Verified ({vision.confidenceScore || 90}% confidence)
                  </Badge>
                )}
              </div>

              <p className="text-sm text-muted-foreground italic">"{submitted.aiSummary}"</p>

              {vision?.detectedIssue && (
                <div className="text-xs bg-background/60 p-2.5 rounded-lg border">
                  <span className="font-semibold text-foreground">Visual Observation: </span>
                  <span className="text-muted-foreground">{vision.detectedIssue}</span>
                </div>
              )}

              {/* Where it was routed and how urgently — the decision the
                  citizen most wants to see, and the one an official acts on. */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded-lg border bg-background/60 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Routed to
                  </p>
                  <p className="text-sm font-medium leading-tight mt-0.5">
                    {submitted.department || 'General Administration'}
                  </p>
                </div>
                <div className="rounded-lg border bg-background/60 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Priority
                  </p>
                  <p className="text-sm font-medium leading-tight mt-0.5">
                    {submitted.urgencyLevel || '—'}
                    <span className="text-muted-foreground font-normal">
                      {' '}({submitted.priorityScore ?? '?'}/5)
                    </span>
                  </p>
                </div>
              </div>

              {submitted.aiTriage?.reasoning && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Why: </span>
                  {submitted.aiTriage.reasoning}
                </p>
              )}

              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="secondary">{submitted.category}</Badge>
                <Badge variant={sentimentColors[submitted.sentiment] || 'secondary'}>
                  {submitted.sentiment} sentiment
                </Badge>
                <Badge variant={priorityColors[submitted.priority] || 'secondary'}>
                  {submitted.priority} priority
                </Badge>
                {submitted.coordinates?.latitude && (
                  <Badge variant="outline" className="text-[11px] gap-1 text-primary">
                    <MapPin className="h-3 w-3" /> GPS Pinpoint
                  </Badge>
                )}
                {vision?.visualTags?.map((tag, idx) => (
                  <Badge key={idx} variant="outline" className="text-[11px] text-muted-foreground">
                    #{tag}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Duplicate detection outcome. Shown plainly rather than hidden:
                the complaint is still tracked, and saying so up front avoids
                the impression that it was silently discarded. */}
            {submitted.isDuplicate && (
              <div className="mb-4 text-left rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Already reported by someone else
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  This matches an existing complaint
                  {typeof submitted.similarityScore === 'number' &&
                    ` (${Math.round(submitted.similarityScore * 100)}% similar)`}
                  {submitted.matchedDistanceMeters != null &&
                    `, about ${Math.round(submitted.matchedDistanceMeters)}m away`}
                  .{' '}
                  {submitted.cluster?.reportCount > 1 &&
                    `${submitted.cluster.reportCount} different people have now reported it. `}
                  {submitted.cluster?.raised ? (
                    <>
                      <span className="font-medium text-foreground">
                        Your report raised its priority from{' '}
                        {URGENCY_NAMES[submitted.cluster.fromScore]} to {submitted.cluster.urgencyLevel}
                      </span>
                      , so the department will see it sooner. You'll be updated as it progresses.
                    </>
                  ) : (
                    <>
                      Yours is recorded as a supporting report and you'll be updated as it
                      progresses. Reports from more people raise its priority.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* SLA Clock Preview */}
            <div className="mb-4 text-left">
              <SLATimer issue={submitted} />
            </div>

            {/* Multi-Channel Alerts confirmation */}
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground mb-6 bg-muted/20 py-2.5 px-4 rounded-lg">
              <div className="flex items-center gap-1">
                <BellRing className="h-3.5 w-3.5 text-primary" /> Email Alerts: Active
              </div>
              {submitted.submitterPhone && (
                <>
                  {submitted.notifyViaWhatsapp && (
                    <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <MessageSquare className="h-3.5 w-3.5" /> WhatsApp Enabled
                    </div>
                  )}
                  {submitted.notifyViaSms && (
                    <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                      <Phone className="h-3.5 w-3.5" /> SMS Enabled
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => {
                  setSubmitted(null)
                  setForm({
                    title: '',
                    description: '',
                    location: '',
                    state: '',
                    submitterPhone: '',
                    notifyViaSms: false,
                    notifyViaWhatsapp: true,
                    coordinates: null,
                  })
                  setImagePreview(null)
                  setImageBase64(null)
                  setSimilarIssues([])
                }}
              >
                Submit Another
              </Button>
              <Button variant="outline" asChild>
                <Link to="/my-issues">View My Issues</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Report a Civic Issue</h1>
        <p className="text-muted-foreground text-sm">
          Submit details, photos, and precise GPS location of the problem. Our Multimodal AI will inspect, categorize, and enforce SLA tracking.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Issue Details</CardTitle>
          <CardDescription>Provide accurate details and GPS location to expedite municipal resolution.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                placeholder="e.g., Large pothole on Main Street near the municipal school"
                value={form.title}
                onChange={handleChange}
                required
              />
              {similarIssues.length > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50/60 dark:border-yellow-900 dark:bg-yellow-950/30 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Similar issues already reported — consider upvoting instead
                  </div>
                  <div className="space-y-1.5">
                    {similarIssues.map(issue => (
                      <div key={issue._id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-foreground/80">{issue.title}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {issue.votes > 0 && (
                            <span className="flex items-center gap-0.5 text-muted-foreground">
                              <ThumbsUp className="h-2.5 w-2.5" />{issue.votes}
                            </span>
                          )}
                          <Badge variant={issue.status === 'resolved' ? 'success' : issue.status === 'in-progress' ? 'info' : 'warning'} className="capitalize text-[10px] py-0">
                            {issue.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Link to="/feed" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
                    View in Community →
                  </Link>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Describe the issue in detail — exact location, severity, duration, and safety hazards…"
                value={form.description}
                onChange={handleChange}
                className="min-h-[120px]"
                required
              />
            </div>

            {/* GPS Pin-Drop Location Picker */}
            <div className="space-y-2">
              <LocationPicker
                value={form.coordinates}
                onLocationSelect={handleLocationSelect}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="location">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> Location / Address
                  </span>
                </Label>
                <Input
                  id="location"
                  name="location"
                  placeholder="e.g., Sector 14, near water tank"
                  value={form.location}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">State / UT</Label>
                <Select
                  id="state"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                >
                  <option value="">Select state…</option>
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
            </div>

            <Separator />

            {/* Photo Upload with AI Vision Notice */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Issue Photo (Enables AI Vision Inspection)</Label>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-primary" /> AI Vision Enabled
                </span>
              </div>
              {imagePreview ? (
                <div className="relative inline-block">
                  <img src={imagePreview} alt="preview" className="rounded-lg max-h-48 object-cover border" />
                  <button
                    type="button"
                    onClick={() => { setImagePreview(null); setImageBase64(null); fileRef.current.value = '' }}
                    className="absolute -top-2 -right-2 rounded-full bg-destructive text-white p-0.5 shadow cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer"
                >
                  <Upload className="h-6 w-6" />
                  <span>Click to upload a complaint photo (max 5 MB)</span>
                  <span className="text-xs text-muted-foreground/80">AI will automatically verify physical defect and severity</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
            </div>

            <Separator />

            {/* Multi-channel WhatsApp & SMS Preferences */}
            <div className="space-y-3 bg-muted/20 p-4 rounded-xl border">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Phone className="h-4 w-4 text-primary" />
                <span>Instant Mobile Updates (Optional)</span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="submitterPhone" className="text-xs">Mobile Number</Label>
                <Input
                  id="submitterPhone"
                  name="submitterPhone"
                  placeholder="e.g., +91 98765 43210"
                  value={form.submitterPhone}
                  onChange={handleChange}
                  className="text-xs"
                />
              </div>
              <div className="flex flex-wrap gap-4 pt-1 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="notifyViaWhatsapp"
                    checked={form.notifyViaWhatsapp}
                    onChange={handleChange}
                    className="rounded border-border accent-emerald-600"
                  />
                  <span>WhatsApp Updates</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="notifyViaSms"
                    checked={form.notifyViaSms}
                    onChange={handleChange}
                    className="rounded border-border accent-primary"
                  />
                  <span>SMS Alerts</span>
                </label>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Submitting & Running AI Vision Inspection…
                </>
              ) : (
                'Submit Issue'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
