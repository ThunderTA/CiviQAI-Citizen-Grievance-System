import { useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShieldCheck, Loader2, AlertCircle, Info, Check } from 'lucide-react'

/**
 * Aadhaar identity step.
 *
 * Calls `onVerified(token)` with a short-lived proof once verification
 * succeeds. The token carries no Aadhaar number, and the number itself is only
 * ever held in this component's state — it is sent once and never persisted
 * anywhere, on the client or the server.
 */
export default function AadhaarVerification({ onVerified }) {
  const [step, setStep] = useState('number')   // number | otp | done
  const [aadhaar, setAadhaar] = useState('')
  const [otp, setOtp] = useState('')
  const [verificationId, setVerificationId] = useState(null)
  const [devOtp, setDevOtp] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Grouped 4-4-4 while typing, which is how the number appears on the card.
  const formatted = aadhaar.replace(/(\d{4})(?=\d)/g, '$1 ').trim()

  const onNumberChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 12)
    setAadhaar(digits)
    setError('')
  }

  const requestOtp = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data } = await api.post('/auth/aadhaar/request-otp', { aadhaar })
      setVerificationId(data.verificationId)
      setDevOtp(data.devOtp || null)
      setStep('otp')
    } catch (err) {
      setError(err.response?.data?.error || 'Could not start verification. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const submitOtp = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data } = await api.post('/auth/aadhaar/verify-otp', { verificationId, otp })
      setStep('done')
      // Clear the number from component state the moment it is no longer
      // needed — it should not sit in memory behind a completed step.
      setAadhaar('')
      onVerified(data.aadhaarToken)
    } catch (err) {
      const remaining = err.response?.data?.attemptsRemaining
      setError(
        (err.response?.data?.error || 'Verification failed') +
        (remaining != null ? ` — ${remaining} attempt${remaining === 1 ? '' : 's'} left` : '')
      )
    } finally {
      setBusy(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="h-4 w-4" />
          Identity verified
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Your Aadhaar number was not stored — only the fact that verification succeeded.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">Verify your identity</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Required so grievances come from real residents.
          </p>
        </div>
      </div>

      {/* Stated plainly and up front: overstating what this proves would be
          the most harmful thing this screen could do. */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-2">
        <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Demonstration only.</span> This
          is a simulated check, not UIDAI e-KYC. It validates the number's format and
          checksum — it does not confirm the number belongs to you. Your Aadhaar number
          is never saved.
        </p>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === 'number' && (
        <div className="space-y-2">
          <Label htmlFor="aadhaar">Aadhaar number</Label>
          <Input
            id="aadhaar"
            inputMode="numeric"
            autoComplete="off"
            placeholder="1234 5678 9012"
            value={formatted}
            onChange={onNumberChange}
          />
          <p className="text-xs text-muted-foreground">
            12 digits. Not stored, and not sent anywhere except this verification step.
          </p>
          <Button
            type="button"
            onClick={requestOtp}
            disabled={busy || aadhaar.length !== 12}
            className="w-full"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Sending code…' : 'Send verification code'}
          </Button>
        </div>
      )}

      {step === 'otp' && (
        <div className="space-y-2">
          <Label htmlFor="otp">6-digit code</Label>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            value={otp}
            onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
          />
          {devOtp && (
            <p className="text-xs rounded bg-muted px-2 py-1.5 text-muted-foreground">
              Development mode — your code is <span className="font-mono font-semibold text-foreground">{devOtp}</span>.
              A real deployment sends this to the registered mobile.
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => { setStep('number'); setOtp(''); setError('') }}>
              Back
            </Button>
            <Button type="button" onClick={submitOtp} disabled={busy || otp.length !== 6} className="flex-1">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? 'Verifying…' : 'Verify'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
