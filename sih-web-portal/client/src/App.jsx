import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useRole } from '@/contexts/RoleContext'
import AppShell from '@/components/AppShell'
import LandingPage from './pages/LandingPage'
import SignInPage from './pages/SignIn'
import SignUpPage from './pages/SignUp'
import OfficialSignIn from './pages/OfficialSignIn'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import OfficialConsole from './pages/OfficialConsole'
import OwnerConsole from './pages/OwnerConsole'
import CitizenPortal from './pages/CitizenPortal'
import AdminDashboard from './pages/AdminDashboard'
import MyIssues from './pages/MyIssues'
import Analytics from './pages/Analytics'
import IssueMap from './pages/IssueMap'
import Feed from './pages/Feed'
import Profile from './pages/Profile'
import DeptDashboard from './pages/DeptDashboard'
import UserManagement from './pages/UserManagement'
import { SocketNotifications } from './components/SocketNotifications'
import { Analytics as VercelAnalytics } from '@vercel/analytics/react'
import { Loader2 } from 'lucide-react'
import { DEMO_MODE } from '@/lib/demo'

function FullPageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function ProtectedRoute({ children, allow }) {
  const { isSignedIn, isLoaded } = useAuth()
  const { role, synced } = useRole()
  const location = useLocation()

  // Waiting for the session to be restored. Rendering the redirect first would
  // bounce an already-signed-in user to the login page on every refresh.
  if (!isLoaded || !synced) return <FullPageSpinner />

  if (!isSignedIn) {
    // Remember where they were going so sign-in can return them there.
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
  }

  if (allow && !allow.includes(role)) {
    return <Navigate to="/feed" replace />
  }

  return children
}

/**
 * Signed-in users have no reason to see the sign-in or sign-up forms.
 *
 * This guard also owns the post-authentication destination. The pages used to
 * navigate themselves, but signing in flips `isSignedIn` first, so this
 * redirect re-rendered and won the race — a new registration always landed on
 * the feed instead of the reporting form. Deciding it in one place removes the
 * race entirely.
 */
function GuestOnlyRoute({ children, redirectTo = '/feed' }) {
  const { isSignedIn, isLoaded } = useAuth()
  const location = useLocation()

  if (!isLoaded) return <FullPageSpinner />
  if (!isSignedIn) return children

  // A page they were bounced off takes precedence over the default.
  return <Navigate to={location.state?.from || redirectTo} replace />
}

function App() {
  return (
    <BrowserRouter>
      <SocketNotifications />
      <AppShell>
        <Routes>
          <Route path="/" element={<LandingPage />} />

          <Route path="/sign-in" element={<GuestOnlyRoute><SignInPage /></GuestOnlyRoute>} />
          {/* Officials land on their console, not the citizen feed. */}
          <Route path="/official/sign-in" element={
            <GuestOnlyRoute redirectTo="/official"><OfficialSignIn /></GuestOnlyRoute>} />

          {/* Account creation and password recovery. The public demo has neither:
              visitors use the shared guest logins, and the API refuses these
              calls anyway, so the pages just hand people to the sign-in form. */}
          <Route path="/forgot-password" element={
            DEMO_MODE ? <Navigate to="/sign-in" replace />
              : <GuestOnlyRoute><ForgotPassword /></GuestOnlyRoute>} />
          {/* Not guest-only: completing a reset signs the user in, and the page
              itself must survive that transition to show the result. */}
          <Route path="/reset-password" element={
            DEMO_MODE ? <Navigate to="/sign-in" replace /> : <ResetPassword />} />
          {/* A new account's first task is filing something, so land there. */}
          <Route path="/sign-up" element={
            DEMO_MODE ? <Navigate to="/sign-in" replace />
              : <GuestOnlyRoute redirectTo="/submit"><SignUpPage /></GuestOnlyRoute>} />

          {/* Public — anyone can browse what has been reported */}
          <Route path="/map" element={<IssueMap />} />
          <Route path="/feed" element={<Feed />} />

          {/* Citizen */}
          <Route path="/submit" element={<ProtectedRoute><CitizenPortal /></ProtectedRoute>} />
          <Route path="/my-issues" element={<ProtectedRoute><MyIssues /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

          {/* Government officials: view, verify, advance status. The API
              rejects edits and deletions independently of this guard. */}
          <Route path="/official" element={
            <ProtectedRoute allow={['official', 'dept_admin', 'admin']}>
              <OfficialConsole />
            </ProtectedRoute>} />

          {/* Owner */}
          <Route path="/owner" element={
            <ProtectedRoute allow={['admin']}><OwnerConsole /></ProtectedRoute>} />

          {/* Staff — guarded by role, matching what the sidebar offers */}
          <Route path="/dashboard" element={
            <ProtectedRoute allow={['admin']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/dept-dashboard" element={
            <ProtectedRoute allow={['dept_admin', 'admin']}><DeptDashboard /></ProtectedRoute>} />
          <Route path="/analytics" element={
            <ProtectedRoute allow={['admin', 'official', 'dept_admin']}><Analytics /></ProtectedRoute>} />
          <Route path="/users" element={
            <ProtectedRoute allow={['admin']}><UserManagement /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/feed" replace />} />
        </Routes>
      </AppShell>
      <VercelAnalytics />
    </BrowserRouter>
  )
}

export default App
