import { createContext, useContext, useMemo } from 'react'
import { useAuth } from '@/lib/auth'

const RoleContext = createContext({ role: 'citizen', department: null, synced: false })

/**
 * Exposes the signed-in user's role to the tree.
 *
 * The role now arrives with the session itself (the API derives it when
 * issuing the token), so unlike the old Clerk flow this needs no extra
 * round-trip and cannot briefly report the wrong role while a sync is pending.
 */
export function RoleProvider({ children }) {
  const { role, department, isLoaded } = useAuth()

  const value = useMemo(
    () => ({ role: role || 'citizen', department: department || null, synced: isLoaded }),
    [role, department, isLoaded]
  )

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export const useRole = () => useContext(RoleContext)
