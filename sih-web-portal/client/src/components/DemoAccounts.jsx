import { DEMO_ACCOUNTS } from '@/lib/demo'
import { Button } from '@/components/ui/button'
import { Info } from 'lucide-react'

/**
 * Guest logins for the public demo. `kind` picks which account to offer on the
 * page it appears on; `onPick` fills the form so the visitor just presses
 * Sign in. Never shows the owner account: that one can delete data.
 */
export default function DemoAccounts({ kind, onPick }) {
  const account = DEMO_ACCOUNTS[kind]
  if (!account) return null

  return (
    <div className="mb-5 rounded-lg border bg-muted/30 px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <Info className="h-3.5 w-3.5 text-muted-foreground" />
        Public demo — try it as a {account.label.toLowerCase()}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{account.blurb}.</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="font-mono">{account.email}</dd>
        <dt className="text-muted-foreground">Password</dt>
        <dd className="font-mono">{account.password}</dd>
      </dl>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2.5 h-7 text-xs"
        onClick={() => onPick({ email: account.email, password: account.password })}
      >
        Fill in these details
      </Button>
    </div>
  )
}
