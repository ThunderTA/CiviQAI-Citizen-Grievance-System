import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Landmark, Loader2, AlertCircle, ShieldAlert } from 'lucide-react'
import { DEMO_MODE } from '@/lib/demo'
import DemoAccounts from '@/components/DemoAccounts'

/**
 * Separate entrance for government officials.
 *
 * Deliberately its own route rather than a toggle on the citizen form: the two
 * audiences arrive from different places, and officials should never be
 * offered "create an account" — those are provisioned by the system owner.
 */
export default function OfficialSignIn() {
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
      const user = await signIn(form.email.trim(), form.password)
      // A citizen account signing in here is a mistake, not an attack — the
      // server would refuse the console anyway, so just say so plainly.
      if (user.role === 'citizen') {
        setError('This account is not registered as a government official. Use the citizen sign-in.')
      }
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
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-100 mb-4">
            <Landmark className="h-5 w-5 text-slate-100 dark:text-slate-900" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Government Official Portal</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Review, verify and update the status of citizen grievances
          </p>
        </div>

        {DEMO_MODE && <DemoAccounts kind="official" onPick={setForm} />}

        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Official email</Label>
            <Input id="email" type="email" required autoComplete="email"
                   placeholder="officer@gov.in"
                   value={form.email} onChange={update('email')} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {!DEMO_MODE && (              <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                Forgot password?
              </Link>
              )}
            </div>
            <Input id="password" type="password" required autoComplete="current-password"
                   placeholder="••••••••"
                   value={form.password} onChange={update('password')} />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-6 flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
          <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Official accounts are issued by the system administrator and cannot be
            self-registered. Officials can update status and add notes; they cannot
            edit or delete a citizen's grievance.
          </p>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Are you a citizen?{' '}
          <Link to="/sign-in" className="text-primary font-medium hover:underline">
            Citizen sign-in
          </Link>
        </p>
      </div>
    </div>
  )
}
