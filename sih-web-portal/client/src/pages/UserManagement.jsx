import { useEffect, useState, useCallback } from 'react'
import { useAuth, useUser } from '@/lib/auth'
import api from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { INDIAN_REGIONS } from '@/lib/regions'
import { useTaxonomy } from '@/lib/taxonomy'
import { Loader2, ShieldX, Users, ShieldCheck, User } from 'lucide-react'

export default function UserManagement() {
  const { getToken, role } = useAuth()
  const { departments: DEPARTMENTS } = useTaxonomy()
  const { user, isLoaded } = useUser()
  const isAdmin = role === 'admin'

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [edits, setEdits] = useState({})

  const fetchUsers = useCallback(async () => {
    try {
      const token = await getToken()
      const { data } = await api.get('/auth/users', { headers: { Authorization: `Bearer ${token}` } })
      setUsers(data)
      const initial = {}
      data.forEach(u => { initial[u._id] = { role: u.role, department: u.department || '', region: u.region || '' } })
      setEdits(initial)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    if (isAdmin) fetchUsers()
    else if (isLoaded) setLoading(false)
  }, [isAdmin, isLoaded, fetchUsers])

  const handleSave = async (userId) => {
    setSaving(userId)
    try {
      const token = await getToken()
      const { role, department, region } = edits[userId]
      const staff = role === 'official' || role === 'dept_admin'
      const { data } = await api.patch(`/auth/users/${userId}`, { role, department: staff ? department : null, region: staff ? region : null }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setUsers(prev => prev.map(u => u._id === data._id ? data : u))
      setEdits(prev => ({ ...prev, [data._id]: { role: data.role, department: data.department || '', region: data.region || '' } }))
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(null)
    }
  }

  const setEdit = (id, field, value) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const deptAdminCount = users.filter(u => u.role === 'dept_admin').length

  if (!isLoaded || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <ShieldX className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground text-sm">This page is only accessible to administrators.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">User Management</h1>
        <p className="text-sm text-muted-foreground">Assign government roles, departments, and regions to registered users</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold">{users.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Registered Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-primary">{deptAdminCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Dept Admins</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold">{users.length - deptAdminCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Citizens</p>
          </CardContent>
        </Card>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-25" />
          <p className="font-medium mb-1">No users yet</p>
          <p className="text-sm">Users appear here after they sign in for the first time.</p>
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">All Users</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {users.map((u) => {
                const edit = edits[u._id] || { role: u.role, department: u.department || '', region: u.region || '' }
                const isStaff = edit.role === 'official' || edit.role === 'dept_admin'
                const hasChanged = edit.role !== u.role || (isStaff && (edit.department !== (u.department || '') || edit.region !== (u.region || '')))
                return (
                  <div key={u._id} className="flex items-center gap-4 px-4 py-3 flex-wrap">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        {u.role === 'dept_admin'
                          ? <ShieldCheck className="h-4 w-4 text-primary" />
                          : <User className="h-4 w-4 text-muted-foreground" />
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Select
                        value={edit.role}
                        onChange={(e) => setEdit(u._id, 'role', e.target.value)}
                        className="w-32 text-xs h-8"
                      >
                        <option value="citizen">Citizen</option>
                        <option value="official">Official</option>
                        <option value="dept_admin">Dept Admin</option>
                      </Select>

                      {isStaff && (
                        <Select
                          value={edit.department}
                          onChange={(e) => setEdit(u._id, 'department', e.target.value)}
                          className="w-44 text-xs h-8"
                        >
                          <option value="">Select department…</option>
                          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                        </Select>
                      )}

                      {isStaff && (
                        <Select
                          value={edit.region}
                          onChange={(e) => setEdit(u._id, 'region', e.target.value)}
                          className="w-44 text-xs h-8"
                        >
                          <option value="">Select region…</option>
                          {INDIAN_REGIONS.map(region => <option key={region} value={region}>{region}</option>)}
                        </Select>
                      )}

                      {!isStaff && u.role === 'dept_admin' && (
                        <Badge variant="secondary" className="text-xs">{u.department}</Badge>
                      )}
                      {!isStaff && u.role !== 'dept_admin' && (
                        <Badge variant="outline" className="text-xs">Citizen</Badge>
                      )}

                      {hasChanged && (
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => handleSave(u._id)}
                          disabled={saving === u._id || (isStaff && (!edit.department || !edit.region))}
                        >
                          {saving === u._id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                          Save
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
