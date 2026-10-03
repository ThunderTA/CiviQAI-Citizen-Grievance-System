import { DEMO_MODE } from '@/lib/demo'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import { SignedIn, SignedOut, UserButton } from '@/lib/auth'
import { NotificationBell } from '@/components/NotificationBell'
import { Menu } from 'lucide-react'

/**
 * Sidebar + top bar frame for the whole app.
 *
 * The sidebar is permanent from `lg` up and a drawer below it, so the same
 * navigation model serves desktop and mobile without a second component.
 */
export default function AppShell({ children }) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <button
            onClick={() => setNavOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-md text-muted-foreground hover:bg-accent"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1" />

          <SignedIn>
            <NotificationBell />
            <UserButton />
          </SignedIn>

          <SignedOut>
            <Link
              to="/sign-in"
              className="text-sm rounded-md px-3 py-1.5 hover:bg-accent transition-colors"
            >
              Sign in
            </Link>
            {!DEMO_MODE && (
              <Link
                to="/sign-up"
                className="text-sm rounded-md bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90 transition-opacity"
              >
                Sign up
              </Link>
            )}
          </SignedOut>
        </header>

        {/* max-w-7xl so the admin tables and the map have room; narrower
            pages set their own max-width inside this. */}
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
