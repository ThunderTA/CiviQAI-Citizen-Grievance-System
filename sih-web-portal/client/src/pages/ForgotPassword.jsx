import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KeyRound, Loader2, AlertCircle, MailCheck } from 'lucide-react'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [devUrl, setDevUrl] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data } = await api.post('/auth/forgot-password', { email: email.trim() })
      setDevUrl(data.devResetUrl || null)
      setSent(true)
    } catch (err) {
      // 429 is the only error this endpoint distinguishes; everything else
      // returns the same generic success so the page cannot be used to test
      // whether an address is registered.
      setError(
        err.response?.status === 429
          ? 'Too many requests. Please wait a few minutes and try again.'
          : 'Something went wrong. Please try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 mb-4">
            <MailCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{email}</span>,
            a reset link is on its way. It expires in an hour and can be used once.
          </p>

          {devUrl && (
            <div className="mt-5 rounded-lg border bg-muted/40 px-3 py-2.5 text-left">
              <p className="text-xs font-medium">Development mode</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Email is not configured, so the link is shown here instead. A real
                deployment only ever sends it by email.
              </p>
              <a
                href={devUrl}
                className="mt-2 block break-all text-xs text-primary hover:underline"
              >
                {devUrl}
              </a>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <Button variant="outline" onClick={() => { setSent(false); setDevUrl(null) }}>
              Use a different email
            </Button>
            <Link to="/sign-in" className="text-sm text-muted-foreground hover:text-foreground">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 mb-4">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required autoComplete="email"
                   placeholder="you@example.com"
                   value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Remembered it?{' '}
          <Link to="/sign-in" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
