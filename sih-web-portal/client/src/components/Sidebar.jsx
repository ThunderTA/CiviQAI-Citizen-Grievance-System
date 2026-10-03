import { DEMO_MODE } from '@/lib/demo'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useRole } from '@/contexts/RoleContext'
import { cn } from '@/lib/utils'
import {
  Building2, Globe2, Map, PlusCircle, FileText, LayoutDashboard,
  BarChart2, Users, Shield, User, X, Landmark, Crown,
} from 'lucide-react'

/**
 * Navigation model for the whole portal.
 *
 * `visible` decides who sees each entry, so the sidebar cannot advertise a
 * page the user would only be bounced off. Grouped because a flat list of ten
 * links gives no sense of which are public and which are staff tools.
 */
const SECTIONS = [
  {
    heading: 'Community',
    items: [
      { to: '/feed', label: 'Community Feed', icon: Globe2, visible: () => true },
      { to: '/map', label: 'Issue Map', icon: Map, visible: () => true },
    ],
  },
  {
    heading: 'My Grievances',
    items: [
      { to: '/submit', label: 'Report an Issue', icon: PlusCircle,
        visible: ({ signedIn, role }) => signedIn && role === 'citizen' },
      { to: '/my-issues', label: 'My Complaints', icon: FileText,
        visible: ({ signedIn, role }) => signedIn && role === 'citizen' },
      { to: '/profile', label: 'Profile', icon: User, visible: ({ signedIn }) => signedIn },
    ],
  },
  {
    heading: 'Official',
    items: [
      { to: '/official', label: 'Official Console', icon: Landmark,
        visible: ({ role }) => ['official', 'dept_admin', 'admin'].includes(role) },
      { to: '/dept-dashboard', label: 'Department Queue', icon: Shield,
        visible: ({ role }) => role === 'dept_admin' },
    ],
  },
  {
    heading: 'Administration',
    items: [
      { to: '/owner', label: 'Owner Console', icon: Crown, visible: ({ role }) => role === 'admin' },
      { to: '/dashboard', label: 'Issue Dashboard', icon: LayoutDashboard, visible: ({ role }) => role === 'admin' },
      { to: '/analytics', label: 'Analytics', icon: BarChart2, visible: ({ role }) => ['admin', 'official', 'dept_admin'].includes(role) },
      { to: '/users', label: 'User Management', icon: Users, visible: ({ role }) => role === 'admin' },
    ],
  },
]

function NavItem({ to, label, icon: Icon, onNavigate }) {
  const { pathname } = useLocation()
  const active = pathname === to || pathname.startsWith(`${to}/`)

  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  )
}

export default function Sidebar({ open, onClose }) {
  const { isSignedIn } = useAuth()
  const { role } = useRole()
  const { pathname } = useLocation()

  const context = { signedIn: isSignedIn, role }
  const sections = SECTIONS
    .map(s => ({ ...s, items: s.items.filter(i => i.visible(context)) }))
    .filter(s => s.items.length > 0)

  // Close the drawer on navigation, or a mobile user is left staring at the
  // menu instead of the page they just opened.
  useEffect(() => { onClose?.() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Mobile scrim */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 border-r bg-background flex flex-col',
          'transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b px-4 shrink-0">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold tracking-tight truncate">CiviQAI</span>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-md text-muted-foreground hover:bg-accent"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {sections.map(section => (
            <div key={section.heading}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.heading}
              </p>
              <div className="space-y-0.5">
                {section.items.map(item => (
                  <NavItem key={item.to} {...item} onNavigate={onClose} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {!isSignedIn && (
          <div className="border-t p-3 shrink-0">
            <p className="px-1 pb-2 text-xs text-muted-foreground">
              Sign in to report issues and track them.
            </p>
            <div className="flex gap-2">
              <Link
                to="/sign-in"
                className="flex-1 text-center text-sm rounded-md border px-3 py-1.5 hover:bg-accent transition-colors"
              >
                Sign in
              </Link>
              {!DEMO_MODE && (
                <Link
                  to="/sign-up"
                  className="flex-1 text-center text-sm rounded-md bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90 transition-opacity"
                >
                  Sign up
                </Link>
              )}
            </div>
            <Link
              to="/official/sign-in"
              className="mt-2 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Landmark className="h-3.5 w-3.5" />
              Government official sign-in
            </Link>
          </div>
        )}
      </aside>
    </>
  )
}
