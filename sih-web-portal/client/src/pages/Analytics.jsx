import { useEffect, useState } from 'react'
import { useAuth, useUser } from '@/lib/auth'
import api from '@/lib/api'
import socket from '@/lib/socket'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ShieldX } from 'lucide-react'

const CATEGORY_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
  '#8b5cf6', '#f97316', '#14b8a6', '#ec4899', '#64748b',
]

const SENTIMENT_COLORS = { negative: '#ef4444', neutral: '#64748b', positive: '#10b981' }
const STATUS_COLORS = { pending: '#f59e0b', 'in-progress': '#3b82f6', resolved: '#10b981' }

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
      No data yet
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (active && payload?.length) {
    return (
      <div className="rounded-lg border bg-background shadow-md px-3 py-2 text-sm">
        {label && <p className="font-medium mb-1">{label}</p>}
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color || p.fill }}>
            {p.name}: <span className="font-semibold">{p.value}</span>
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function Analytics() {
  const { getToken, role } = useAuth()
  const { user, isLoaded } = useUser()
  const isStaff = ['admin', 'official', 'dept_admin'].includes(role)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const token = await getToken()
      const { data: res } = await api.get('/issues/analytics', {
        headers: { Authorization: `Bearer ${token}` },
      })
      setData(res)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isStaff || !isLoaded) { setLoading(false); return }
    load()
    socket.connect()
    socket.on('issue_updated', load)
    return () => {
      socket.off('issue_updated', load)
      socket.disconnect()
    }
  }, [isStaff, isLoaded, getToken])

  if (!isLoaded || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!isStaff) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <ShieldX className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground text-sm">Analytics is only accessible to government staff.</p>
      </div>
    )
  }

  const total = data?.byStatus?.reduce((s, i) => s + i.count, 0) || 0
  const resolved = data?.byStatus?.find(i => i.name === 'resolved')?.count || 0
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0

  const sentimentData = data?.bySentiment?.map(i => ({
    ...i,
    fill: SENTIMENT_COLORS[i.name] || '#64748b',
  })) || []

  const statusData = data?.byStatus?.map(i => ({
    ...i,
    fill: STATUS_COLORS[i.name] || '#64748b',
  })) || []

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          {role === 'admin'
            ? 'Insights and trends across all citizen issues'
            : `Insights for ${data?.scope?.department || 'your department'} in ${data?.scope?.region || 'your assigned region'}`}
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-muted-foreground mb-1">Total Issues</p>
            <p className="text-3xl font-bold">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-muted-foreground mb-1">Resolution Rate</p>
            <p className="text-3xl font-bold text-green-600">{resolutionRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-muted-foreground mb-1">Resolved</p>
            <p className="text-3xl font-bold text-green-600">{resolved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-muted-foreground mb-1">Pending</p>
            <p className="text-3xl font-bold text-yellow-600">
              {data?.byStatus?.find(i => i.name === 'pending')?.count || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Category breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Issues by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {!data?.byCategory?.length ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={data.byCategory}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    paddingAngle={3}
                  >
                    {data.byCategory.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    formatter={(value) => <span className="text-xs">{value}</span>}
                    iconSize={10}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Issues by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {!statusData.length ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    paddingAngle={3}
                  >
                    {statusData.map((item, i) => (
                      <Cell key={i} fill={item.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    formatter={(value) => <span className="text-xs capitalize">{value}</span>}
                    iconSize={10}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Sentiment distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sentiment Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {!sentimentData.length ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sentimentData} barSize={48}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, textTransform: 'capitalize' }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {sentimentData.map((item, i) => (
                      <Cell key={i} fill={item.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Issues over time */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Issues Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {!data?.byDate?.length ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.byDate}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#colorCount)"
                    dot={{ r: 3, fill: '#6366f1' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
