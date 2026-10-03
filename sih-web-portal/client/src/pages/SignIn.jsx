import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Building2, Loader2, AlertCircle } from 'lucide-react'
import { DEMO_MODE } from '@/lib/demo'
import DemoAccounts from '@/components/DemoAccounts'

export default function SignInPage() {
  const { signIn } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const update = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      // GuestOnlyRoute sends them on once the session exists.
      await signIn(form.email.trim(), form.password)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not sign in. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 mb-4">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Sign in to file and track your grievances
          </p>
        </div>

        {DEMO_MODE && <DemoAccounts kind="citizen" onPick={setForm} />}

        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email" type="email" autoComplete="email" required
              placeholder="you@example.com"
              value={form.email} onChange={update('email')}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {!DEMO_MODE && (              <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                Forgot password?
              </Link>
              )}
            </div>
            <Input
              id="password" type="password" autoComplete="current-password" required
              placeholder="••••••••"
              value={form.password} onChange={update('password')}
            />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        {!DEMO_MODE && (        <p className="text-center text-sm text-muted-foreground mt-6">
          New here?{' '}
          <Link to="/sign-up" className="text-primary font-medium hover:underline">
            Create an account
          </Link>
        </p>

        )}
      </div>
    </div>
  )
}
