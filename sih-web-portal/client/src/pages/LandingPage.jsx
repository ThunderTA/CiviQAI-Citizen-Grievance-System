import { Link } from 'react-router-dom'
import { SignedIn, SignedOut } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useCategoryNames } from '@/lib/taxonomy'
import {
  PlusCircle, BarChart3, Brain, ShieldCheck, ArrowRight, MapPin,
  CheckCircle2, Bell, Globe, Users, Map, Zap, TrendingUp, Star,
} from 'lucide-react'

const stats = [
  { value: '10K+', label: 'Issues Reported' },
  { value: '85%', label: 'Resolution Rate' },
  { value: '48h', label: 'Avg Response' },
  { value: '200+', label: 'Cities Covered' },
]

const steps = [
  {
    step: '01',
    icon: PlusCircle,
    title: 'Report an Issue',
    desc: 'Describe the civic problem in your area — text, photo, or both. Takes under 2 minutes.',
    accent: 'from-blue-500 to-blue-600',
    ring: 'ring-blue-100 dark:ring-blue-900',
    iconColor: 'text-blue-500',
    iconBg: 'bg-blue-50 dark:bg-blue-950/40',
  },
  {
    step: '02',
    icon: Brain,
    title: 'AI Analyses It',
    desc: 'Groq LLM instantly categorises the issue, detects urgency, and writes a summary for the right authority.',
    accent: 'from-purple-500 to-purple-600',
    ring: 'ring-purple-100 dark:ring-purple-900',
    iconColor: 'text-purple-500',
    iconBg: 'bg-purple-50 dark:bg-purple-950/40',
  },
  {
    step: '03',
    icon: CheckCircle2,
    title: 'Track Resolution',
    desc: 'The right department gets assigned. You receive live push notifications until it\'s fully resolved.',
    accent: 'from-green-500 to-green-600',
    ring: 'ring-green-100 dark:ring-green-900',
    iconColor: 'text-green-500',
    iconBg: 'bg-green-50 dark:bg-green-950/40',
  },
]

const features = [
  {
    icon: Brain,
    title: 'AI-Powered Analysis',
    description: 'Every submission is automatically summarised, categorised, sentiment-scored, and priority-rated by Groq LLM.',
    color: 'text-purple-500',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    border: 'hover:border-purple-200 dark:hover:border-purple-800',
  },
  {
    icon: Map,
    title: 'Live Issue Map',
    description: 'India choropleth showing issue density by state. Click any state to drill into its active issues.',
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'hover:border-blue-200 dark:hover:border-blue-800',
  },
  {
    icon: Bell,
    title: 'Real-time Notifications',
    description: 'Socket.io pushes status updates the moment a department admin acts on your issue.',
    color: 'text-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'hover:border-orange-200 dark:hover:border-orange-800',
  },
  {
    icon: Globe,
    title: 'Community Feed',
    description: 'Browse, search, and upvote issues in your area. See what your neighbours are already reporting.',
    color: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'hover:border-green-200 dark:hover:border-green-800',
  },
  {
    icon: Users,
    title: 'Department Routing',
    description: 'Issues are assigned to the right department. Dept admins manage their own scoped view.',
    color: 'text-teal-500',
    bg: 'bg-teal-50 dark:bg-teal-950/30',
    border: 'hover:border-teal-200 dark:hover:border-teal-800',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description: 'Authorities see trends, resolution rates, sentiment over time, and full category breakdowns.',
    color: 'text-pink-500',
    bg: 'bg-pink-50 dark:bg-pink-950/30',
    border: 'hover:border-pink-200 dark:hover:border-pink-800',
  },
]

export default function LandingPage() {
  // Real category names, from the same taxonomy the AI classifies into - a
  // hand-typed list here had drifted to include "Drainage", which was never
  // an actual category the portal used.
  const { categories: categoryNames } = useCategoryNames()
  const displayedCategories = categoryNames.filter(c => c !== 'Other').slice(0, 12)

  return (
    <main className="overflow-x-hidden">

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative min-h-[88vh] flex items-center py-24 px-4">
        {/* Background layers */}
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#ffffff08_1px,transparent_1px)] bg-[size:28px_28px] -z-10" />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background/80 -z-10" />
        <div className="absolute top-10 right-[-10%] w-[500px] h-[500px] rounded-full blur-[100px] -z-10" style={{ background: 'rgba(29,78,216,0.12)' }} />
        <div className="absolute bottom-0 left-[-5%] w-[400px] h-[400px] rounded-full blur-[100px] -z-10" style={{ background: 'rgba(124,58,237,0.10)' }} />

        <div className="mx-auto max-w-5xl w-full text-center">
          {/* Product name */}
          <div className="mb-7 flex items-center justify-center" aria-label="CiviQAI">
            <span className="text-3xl font-bold tracking-tight text-foreground">
              CiviQ<span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(90deg, #1d4ed8, #7c3aed)' }}>AI</span>
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Empowering Citizens,<br />
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(90deg, #1d4ed8, #7c3aed)' }}>
              Improving Communities
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            CiviQAI bridges the gap between citizens and local authorities.
            Report issues, track progress, and let AI turn your feedback into real action.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
            <SignedOut>
              <Button size="lg" asChild className="gap-2 text-base px-8 h-12 shadow-lg shadow-primary/25">
                <Link to="/sign-up">
                  Get Started Free <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 text-base px-8">
                <Link to="/sign-in">Sign In</Link>
              </Button>
            </SignedOut>
            <SignedIn>
              <Button size="lg" asChild className="gap-2 text-base px-8 h-12 shadow-lg shadow-primary/25">
                <Link to="/submit">
                  Report an Issue <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 text-base px-8">
                <Link to="/my-issues">My Issues</Link>
              </Button>
            </SignedIn>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto">
            {stats.map(({ value, label }) => (
              <div key={label} className="rounded-xl border bg-background/60 backdrop-blur px-4 py-4 text-center shadow-sm">
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Category strip ───────────────────────────────────────── */}
      <section className="relative border-y bg-muted/20 py-4 overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
        <div className="flex gap-2 justify-center flex-wrap px-6">
          {displayedCategories.map((cat) => (
            <span key={cat} className="rounded-full border bg-background px-3.5 py-1 text-xs font-medium text-muted-foreground whitespace-nowrap">
              {cat}
            </span>
          ))}
          <span className="rounded-full border bg-background px-3.5 py-1 text-xs font-medium text-primary whitespace-nowrap">
            + more
          </span>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section className="py-24 px-4">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">How It Works</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Three steps to resolution</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              From problem to solution — faster than ever before.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 relative">
            {/* Connecting line (desktop) */}
            <div className="hidden sm:block absolute top-10 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px border-t-2 border-dashed border-border pointer-events-none" />

            {steps.map(({ step, icon: Icon, title, desc, ring, iconColor, iconBg }) => (
              <div key={step} className={`relative flex flex-col items-center text-center p-6 rounded-2xl border bg-background shadow-sm ring-4 ${ring}`}>
                <div className="relative mb-5">
                  <div className={`h-14 w-14 rounded-2xl ${iconBg} flex items-center justify-center`}>
                    <Icon className={`h-7 w-7 ${iconColor}`} />
                  </div>
                  <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {step.replace('0', '')}
                  </span>
                </div>
                <h3 className="font-semibold text-base mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="py-24 px-4 bg-muted/20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything you need, nothing you don't</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              A complete platform for citizens to report problems and for authorities to respond faster than ever.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(({ icon: Icon, title, description, color, bg, border }) => (
              <Card
                key={title}
                className={`group border transition-all duration-200 hover:shadow-md ${border} bg-background`}
              >
                <CardContent className="pt-6 pb-5">
                  <div className={`inline-flex rounded-xl p-2.5 mb-4 ${bg}`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <h3 className="font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust strip ──────────────────────────────────────────── */}
      <section className="py-14 px-4 border-y">
        <div className="mx-auto max-w-4xl">
          <div className="grid sm:grid-cols-3 gap-8 text-center">
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground max-w-[220px]">
                "Finally an app that actually gets issues fixed in my neighbourhood."
              </p>
              <p className="text-xs font-medium">— Rahul M., Pune</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground max-w-[220px]">
                "The AI summary makes it so much easier to prioritise and respond."
              </p>
              <p className="text-xs font-medium">— Priya S., Municipal Officer</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground max-w-[220px]">
                "Submitted a pothole report at 9am. It was marked in-progress by noon."
              </p>
              <p className="text-xs font-medium">— Ananya K., Bengaluru</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section
        className="relative py-24 px-4 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #7c3aed 100%)' }}
      >
        {/* decorative blobs — z-0 so they stay behind content */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 mx-auto max-w-2xl text-center text-white">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 border border-white/20 px-4 py-1.5 text-sm mb-6">
            <Zap className="h-3.5 w-3.5" /> Free to use · No credit card needed
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to make a difference?</h2>
          <p className="mb-8 text-white/75 text-lg">
            Join thousands of citizens already using CiviQAI to improve their communities — one issue at a time.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <SignedOut>
              <Button
                size="lg"
                asChild
                className="gap-2 h-12 text-base px-8 bg-white text-primary hover:bg-white/90 shadow-xl border-0"
              >
                <Link to="/sign-up">
                  Start Reporting <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                asChild
                className="h-12 text-base px-8 bg-white/15 hover:bg-white/25 border border-white/30 text-white shadow-none"
              >
                <Link to="/map">View Issue Map</Link>
              </Button>
            </SignedOut>
            <SignedIn>
              <Button
                size="lg"
                asChild
                className="gap-2 h-12 text-base px-8 bg-white text-primary hover:bg-white/90 shadow-xl border-0"
              >
                <Link to="/submit">
                  Report an Issue <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                asChild
                className="h-12 text-base px-8 bg-white/15 hover:bg-white/25 border border-white/30 text-white shadow-none"
              >
                <Link to="/feed">Community Feed</Link>
              </Button>
            </SignedIn>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t py-8 px-4">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            CiviQAI
          </div>
          <p>© {new Date().getFullYear()} CiviQAI. Built for a better India.</p>
          <div className="flex gap-4">
            <Link to="/map" className="hover:text-foreground transition-colors">Issue Map</Link>
            <Link to="/feed" className="hover:text-foreground transition-colors">Community</Link>
          </div>
        </div>
      </footer>

    </main>
  )
}
