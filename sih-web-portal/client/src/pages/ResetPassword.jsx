import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KeyRound, Loader2, AlertCircle, Check, LinkIcon } from 'lucide-react'

const MIN_PASSWORD = 8

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const { applySession } = useAuth()
  const navigate = useNavigate()

  // 'checking' avoids showing a password form for a link that is already dead.
  const [state, setState] = useState('checking')  // checking | ready | invalid
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!token) { setState('invalid'); return }

    api.get('/auth/reset-password/check', { params: { token } })
      .then(({ data }) => { if (!cancelled) setState(data.valid ? 'ready' : 'invalid') })
      .catch(() => { if (!cancelled) setState('invalid') })

    return () => { cancelled = true }
  }, [token])

  const longEnough = form.password.length >= MIN_PASSWORD
  const matches = form.confirm.length > 0 && form.password === form.confirm

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!longEnough) return setError(`Password must be at least ${MIN_PASSWORD} characters`)
    if (!matches) return setError('Passwords do not match')

    setBusy(true)
    try {
      const { data } = await api.post('/auth/reset-password', { token, password: form.password })
      // The API signs the user straight in, so adopt that session rather than
      // making them log in again with the password they just set.
      applySession(data.token, data.user)

      // This route is not guest-only (the page has to survive signing in), so
      // nothing else will move them off it. Send them where their role starts.
      const landing = ['official', 'dept_admin'].includes(data.user?.role)
        ? '/official'
        : '/feed'
      navigate(landing, { replace: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Could not reset your password. Please try again.')
      if (err.response?.data?.code === 'invalid_reset_token') setState('invalid')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'checking') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (state === 'invalid') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 mb-4">
            <LinkIcon className="h-5 w-5 text-destructive" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">This link has expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Reset links last an hour and can only be used once. Request a fresh one
            and it will arrive in a moment.
          </p>
          <Button asChild className="mt-6 w-full">
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
          <Link to="/sign-in" className="mt-3 block text-sm text-muted-foreground hover:text-foreground">
            Back to sign in
          </Link>
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
          <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Signing you in afterwards. Any other device stays signed out.
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
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" required autoComplete="new-password"
                   placeholder="At least 8 characters"
                   value={form.password}
                   onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} />
            {form.password.length > 0 && (
              <p className={`flex items-center gap-1 text-xs ${longEnough ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                {longEnough && <Check className="h-3 w-3" />}
                At least {MIN_PASSWORD} characters
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" required autoComplete="new-password"
                   placeholder="••••••••"
                   value={form.confirm}
                   onChange={(e) => setForm(f => ({ ...f, confirm: e.target.value }))} />
            {form.confirm.length > 0 && (
              <p className={`flex items-center gap-1 text-xs ${matches ? 'text-emerald-600' : 'text-destructive'}`}>
                {matches ? <Check className="h-3 w-3" /> : null}
                {matches ? 'Passwords match' : 'Passwords do not match'}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Updating…' : 'Set new password'}
          </Button>
        </form>
      </div>
    </div>
  )
}
