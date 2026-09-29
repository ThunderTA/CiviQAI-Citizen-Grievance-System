import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Building2, Loader2, AlertCircle, Check } from 'lucide-react'
import AadhaarVerification from '@/components/AadhaarVerification'

const MIN_PASSWORD = 8

export default function SignUpPage() {
  const { signUp } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Proof that the identity step passed. Holds no Aadhaar number.
  const [aadhaarToken, setAadhaarToken] = useState(null)

  const update = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const longEnough = form.password.length >= MIN_PASSWORD
  const matches = form.confirm.length > 0 && form.password === form.confirm

  const submit = async (e) => {
    e.preventDefault()
    setError('')

    // Checked here as well as on the server: the server is the authority, but
    // a round trip to be told the passwords differ is a poor experience.
    if (!aadhaarToken) return setError('Please complete Aadhaar verification first')
    if (!longEnough) return setError(`Password must be at least ${MIN_PASSWORD} characters`)
    if (form.password !== form.confirm) return setError('Passwords do not match')

    setBusy(true)
    try {
      // GuestOnlyRoute redirects once the session exists; navigating here too
      // would race it.
      await signUp({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        aadhaarToken,
      })
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create your account. Please try again.')
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
          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Report civic issues and follow them to resolution
          </p>
        </div>

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

          <AadhaarVerification onVerified={setAadhaarToken} />

          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" required autoComplete="name" placeholder="Asha Patel"
                   value={form.name} onChange={update('name')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required autoComplete="email"
                   placeholder="you@example.com"
                   value={form.email} onChange={update('email')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">
              Phone <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input id="phone" type="tel" autoComplete="tel" placeholder="9876543210"
                   value={form.phone} onChange={update('phone')} />
            <p className="text-xs text-muted-foreground">
              Used only for SMS and WhatsApp updates on your complaints.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required autoComplete="new-password"
                   placeholder="At least 8 characters"
                   value={form.password} onChange={update('password')} />
            {form.password.length > 0 && (
              <p className={`text-xs flex items-center gap-1 ${longEnough ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                {longEnough && <Check className="h-3 w-3" />}
                At least {MIN_PASSWORD} characters
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" required autoComplete="new-password"
                   placeholder="••••••••"
                   value={form.confirm} onChange={update('confirm')} />
            {form.confirm.length > 0 && (
              <p className={`text-xs flex items-center gap-1 ${matches ? 'text-emerald-600' : 'text-destructive'}`}>
                {matches ? <Check className="h-3 w-3" /> : null}
                {matches ? 'Passwords match' : 'Passwords do not match'}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={busy || !aadhaarToken}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
          {!aadhaarToken && (
            <p className="text-center text-xs text-muted-foreground">
              Complete identity verification to continue.
            </p>
          )}
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{' '}
          <Link to="/sign-in" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
