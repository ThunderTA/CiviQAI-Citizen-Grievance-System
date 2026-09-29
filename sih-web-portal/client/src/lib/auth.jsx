/**
 * Authentication for the portal — a drop-in replacement for @clerk/clerk-react.
 *
 * The hook and component names deliberately mirror Clerk's (`useAuth`,
 * `useUser`, `SignedIn`, `SignedOut`, `UserButton`) so the fourteen files that
 * were built against Clerk keep working with only their import path changed.
 * Sessions are JWTs from our own API, held in localStorage.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import api from '@/lib/api'

const TOKEN_KEY = 'sih_auth_token'

const AuthContext = createContext(null)

/** localStorage throws in private-mode Safari and some embedded webviews. */
const safeStorage = {
  get(key) {
    try { return localStorage.getItem(key) } catch { return null }
  },
  set(key, value) {
    try { localStorage.setItem(key, value) } catch { /* session is memory-only */ }
  },
  remove(key) {
    try { localStorage.removeItem(key) } catch { /* nothing to clean up */ }
  },
}

export const getStoredToken = () => safeStorage.get(TOKEN_KEY)

/**
 * Shapes our API user like Clerk's, so existing reads such as
 * `user.primaryEmailAddress.emailAddress` keep working untouched.
 */
const toClerkShape = (user) => {
  if (!user) return null
  const [firstName, ...rest] = (user.name || '').split(' ')
  return {
    id: user.id,
    fullName: user.name || '',
    firstName: firstName || '',
    lastName: rest.join(' '),
    imageUrl: '',
    primaryEmailAddress: { emailAddress: user.email },
    emailAddresses: [{ emailAddress: user.email }],
    // Portal-specific fields, available without the Clerk shape.
    role: user.role,
    department: user.department,
    phone: user.phone,
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken())
  const [user, setUser] = useState(null)
  // Starts false so the app renders a loading state instead of briefly
  // flashing the signed-out UI to someone who is actually signed in.
  const [isLoaded, setIsLoaded] = useState(false)

  // Restore the session on boot. A stored token may be expired or signed with
  // a rotated secret, so it is only trusted once /me confirms it.
  useEffect(() => {
    let cancelled = false

    const restore = async () => {
      if (!token) {
        if (!cancelled) { setUser(null); setIsLoaded(true) }
        return
      }
      try {
        const { data } = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!cancelled) setUser(data.user)
      } catch {
        if (!cancelled) {
          safeStorage.remove(TOKEN_KEY)
          setToken(null)
          setUser(null)
        }
      } finally {
        if (!cancelled) setIsLoaded(true)
      }
    }

    restore()
    return () => { cancelled = true }
  }, [token])

  const persist = useCallback((nextToken, nextUser) => {
    safeStorage.set(TOKEN_KEY, nextToken)
    setToken(nextToken)
    setUser(nextUser)
    setIsLoaded(true)
  }, [])

  const signIn = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    persist(data.token, data.user)
    return data.user
  }, [persist])

  const signUp = useCallback(async ({ email, password, name, phone, aadhaarToken }) => {
    const { data } = await api.post('/auth/register', {
      email, password, name, phone, aadhaarToken,
    })
    persist(data.token, data.user)
    return data.user
  }, [persist])

  const signOut = useCallback(() => {
    safeStorage.remove(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const updateProfile = useCallback(async (fields) => {
    const { data } = await api.patch('/auth/me', fields, {
      headers: { Authorization: `Bearer ${token}` },
    })
    setUser(data.user)
    return data.user
  }, [token])

  // Async to match Clerk's signature — every caller already awaits it.
  const getToken = useCallback(async () => token, [token])

  const value = useMemo(() => ({
    token,
    rawUser: user,
    user: toClerkShape(user),
    isLoaded,
    isSignedIn: Boolean(user),
    userId: user?.id ?? null,
    role: user?.role ?? 'citizen',
    department: user?.department ?? null,
    getToken, signIn, signUp, signOut, updateProfile,
    // Adopt a session the API already issued — used by the password reset
    // flow, which signs the user in as part of completing the reset.
    applySession: persist,
  }), [token, user, isLoaded, getToken, signIn, signUp, signOut, updateProfile, persist])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

const useAuthContext = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('Wrap the app in <AuthProvider> before using auth hooks')
  return context
}

export function useAuth() {
  const {
    getToken, isSignedIn, isLoaded, userId, signIn, signUp, signOut,
    role, department, applySession,
  } = useAuthContext()
  return {
    getToken, isSignedIn, isLoaded, userId, signIn, signUp, signOut,
    role, department, applySession,
  }
}

export function useUser() {
  const { user, isLoaded, isSignedIn, rawUser, updateProfile } = useAuthContext()
  return { user, isLoaded, isSignedIn, rawUser, updateProfile }
}

export function SignedIn({ children }) {
  const { isSignedIn, isLoaded } = useAuthContext()
  return isLoaded && isSignedIn ? children : null
}

export function SignedOut({ children }) {
  const { isSignedIn, isLoaded } = useAuthContext()
  return isLoaded && !isSignedIn ? children : null
}

/** Avatar + sign-out, standing in for Clerk's <UserButton />. */
export function UserButton() {
  const { rawUser, signOut } = useAuthContext()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    // Deferred so the click that opened the menu does not immediately close it.
    const timer = setTimeout(() => document.addEventListener('click', close), 0)
    return () => { clearTimeout(timer); document.removeEventListener('click', close) }
  }, [open])

  if (!rawUser) return null

  const initials = (rawUser.name || rawUser.email || '?')
    .split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
        className="h-9 w-9 rounded-full bg-primary text-primary-foreground text-xs font-semibold
                   flex items-center justify-center hover:opacity-90 transition-opacity"
        aria-label="Account menu"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border bg-popover shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2.5 border-b">
            <p className="text-sm font-medium truncate">{rawUser.name}</p>
            <p className="text-xs text-muted-foreground truncate">{rawUser.email}</p>
            {rawUser.role !== 'citizen' && (
              <span className="mt-1.5 inline-block text-[10px] font-semibold uppercase tracking-wide
                               bg-primary/10 text-primary rounded px-1.5 py-0.5">
                {rawUser.role === 'dept_admin' ? rawUser.department || 'Department' : rawUser.role}
              </span>
            )}
          </div>
          <button
            onClick={signOut}
            className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
