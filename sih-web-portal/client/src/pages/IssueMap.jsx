import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import api from '@/lib/api'
import indiaGeoData from '@/data/india-states.json'
import { loadMapplsSDK } from '@/lib/mappls'
import {
  Loader2,
  MapPin,
  Compass,
  Clock,
  ThumbsUp,
  Filter,
  Sparkles,
  Layers,
  ChevronRight,
  Search,
  CheckCircle2,
  AlertOctagon,
  Eye,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Info,
  Navigation,
  Globe,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { SLATimer } from '@/components/SLATimer'
import { BeforeAfterViewer } from '@/components/BeforeAfterViewer'
import { CommentSection } from '@/components/CommentSection'
import { StatusTimeline } from '@/components/StatusTimeline'

const STATUS_COLORS = {
  pending: '#f59e0b',
  'in-progress': '#3b82f6',
  resolved: '#10b981',
}

const INDIAN_STATES_COORDS = {
  'Delhi': [28.6139, 77.2090],
  'Maharashtra': [19.7515, 75.7139],
  'Karnataka': [15.3173, 75.7139],
  'Tamil Nadu': [11.1271, 78.6569],
  'Uttar Pradesh': [26.8467, 80.9462],
  'Gujarat': [22.2587, 71.1924],
  'Rajasthan': [27.0238, 74.2179],
  'West Bengal': [22.9868, 87.8550],
  'Madhya Pradesh': [22.9734, 78.6569],
  'Telangana': [18.1124, 79.0193],
  'Kerala': [10.8505, 76.2711],
  'Punjab': [31.1471, 75.3412],
  'Haryana': [29.0588, 76.0856],
  'Bihar': [25.0961, 85.3131],
  'Andhra Pradesh': [15.9129, 79.7400],
  'Odisha': [20.9517, 85.0985],
  'Assam': [26.2006, 92.9376],
  'Jammu & Kashmir': [33.7782, 76.5762],
  'Ladakh': [34.1526, 77.5771],
  'Himachal Pradesh': [31.1048, 77.1734],
  'Uttarakhand': [30.0668, 79.0193],
  'Jharkhand': [23.6102, 85.2799],
  'Chhattisgarh': [21.2787, 81.8661],
  'Goa': [15.2993, 74.1240],
  'Chandigarh': [30.7333, 76.7794],
  'Puducherry': [11.9416, 79.8083],
  'Tripura': [23.9408, 91.9882],
  'Manipur': [24.6637, 93.9063],
  'Meghalaya': [25.4670, 91.3662],
  'Nagaland': [26.1584, 94.5624],
  'Mizoram': [23.1645, 92.9376],
  'Arunachal Pradesh': [28.2180, 94.7278],
  'Sikkim': [27.5330, 88.5122],
}

// Visual color palette based on complaint volume
function getStateFillColor(count, max, isSelected, isHovered) {
  if (isSelected) return '#3b82f6'
  if (isHovered) return '#60a5fa'
  if (!count) return 'rgba(148, 163, 184, 0.18)'
  
  const ratio = Math.min(count / (max || 1), 1)
  if (ratio > 0.7) return '#ef4444' // High / Red
  if (ratio > 0.4) return '#f59e0b' // Moderate / Orange
  if (ratio > 0.15) return '#3b82f6' // Active / Blue
  return '#10b981'                 // Low / Emerald
}

export default function IssueMap() {
  const [issues, setIssues] = useState([])
  const [viewMode, setViewMode] = useState('mappls') // 'mappls' | 'choropleth'
  const [loadingMappls, setLoadingMappls] = useState(true)
  const [mapplsError, setMapplsError] = useState(false)
  const [hoveredState, setHoveredState] = useState(null)
  const [selectedState, setSelectedState] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [zoomLevel, setZoomLevel] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Mappls map instance refs
  const mapplsMapRef = useRef(null)
  const mapplsMarkersRef = useRef([])
  const mapplsContainerRef = useRef(null)
  const svgRef = useRef(null)

  // Fetch live issues safely
  useEffect(() => {
    api.get('/issues/public')
      .then((res) => {
        if (Array.isArray(res.data)) setIssues(res.data)
      })
      .catch((err) => console.warn('Issues fetch notice:', err))
  }, [])

  // Static D3 Geo Projection for India using bundled GeoJSON
  const { projection, statePaths } = useMemo(() => {
    const proj = geoMercator().fitExtent([[25, 25], [775, 855]], indiaGeoData)
    const pathGenerator = geoPath().projection(proj)

    const paths = (indiaGeoData.features || []).map((feature) => {
      const stateName = feature.properties.ST_NM || feature.properties.st_nm || feature.properties.name
      return {
        feature,
        name: stateName,
        d: pathGenerator(feature),
        centroid: pathGenerator.centroid(feature),
      }
    })

    return { projection: proj, statePaths: paths }
  }, [])

  // Aggregate issues by state
  const stateStats = useMemo(() => {
    const acc = {}
    statePaths.forEach((p) => {
      if (p.name) acc[p.name] = { total: 0, pending: 0, 'in-progress': 0, resolved: 0 }
    })
    issues.forEach((i) => {
      const st = i.state || 'Other'
      if (!acc[st]) acc[st] = { total: 0, pending: 0, 'in-progress': 0, resolved: 0 }
      acc[st].total++
      if (acc[st][i.status] !== undefined) acc[st][i.status]++
    })
    return Object.entries(acc).sort((a, b) => b[1].total - a[1].total)
  }, [issues, statePaths])

  const maxStateIssues = useMemo(() => {
    return Math.max(...stateStats.map(([_, data]) => data.total), 1)
  }, [stateStats])

  // Filtered issues
  const filteredIssues = useMemo(() => {
    return issues.filter((i) => {
      if (statusFilter && i.status !== statusFilter) return false
      if (categoryFilter && i.category !== categoryFilter) return false
      if (selectedState && i.state !== selectedState) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          i.title.toLowerCase().includes(q) ||
          i.location?.toLowerCase().includes(q) ||
          i.state?.toLowerCase().includes(q) ||
          i.category?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [issues, statusFilter, categoryFilter, selectedState, searchQuery])

  // Initialize & update Mappls Map
  const initMappls = useCallback(async () => {
    try {
      setLoadingMappls(true)
      const mappls = await loadMapplsSDK()
      if (!mapplsContainerRef.current) return

      if (!mapplsMapRef.current) {
        mapplsMapRef.current = new mappls.Map('mappls-map-container', {
          center: [22.9734, 78.6569], // Central India
          zoom: 5,
          zoomControl: true,
          hybrid: false,
        })
      }

      // Clear existing markers
      if (mapplsMarkersRef.current.length > 0) {
        mapplsMarkersRef.current.forEach((m) => {
          if (m && typeof m.remove === 'function') m.remove()
        })
        mapplsMarkersRef.current = []
      }

      // Add pins for filtered issues
      const mapInstance = mapplsMapRef.current
      filteredIssues.forEach((issue) => {
        let lat = issue.coordinates?.latitude
        let lng = issue.coordinates?.longitude

        // Fallback to state coordinates
        if ((!lat || !lng) && issue.state && INDIAN_STATES_COORDS[issue.state]) {
          [lat, lng] = INDIAN_STATES_COORDS[issue.state]
          const seed = (issue._id?.charCodeAt(0) || 1) + (issue._id?.charCodeAt(1) || 2)
          lat += ((seed % 10) - 5) * 0.03
          lng += (((seed * 3) % 10) - 5) * 0.03
        }

        if (lat && lng) {
          const marker = new mappls.Marker({
            map: mapInstance,
            position: { lat, lng },
            popupHtml: `
              <div style="font-family: inherit; padding: 4px; max-width: 220px;">
                <p style="font-weight: 600; font-size: 12px; margin: 0 0 4px 0;">${issue.title}</p>
                <span style="font-size: 10px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${issue.category || 'Civic'}</span>
                <span style="font-size: 10px; font-weight: 600; color: ${STATUS_COLORS[issue.status] || '#ef4444'}; margin-left: 4px; text-transform: capitalize;">${issue.status}</span>
                <p style="font-size: 11px; color: #64748b; margin: 4px 0 0 0;">${issue.location || issue.state || ''}</p>
              </div>
            `,
          })

          if (marker.addListener) {
            marker.addListener('click', () => setSelectedIssue(issue))
          }
          mapplsMarkersRef.current.push(marker)
        }
      })

      setLoadingMappls(false)
    } catch (err) {
      console.warn('Mappls map initialization notice:', err)
      setMapplsError(true)
      setLoadingMappls(false)
      setViewMode('choropleth') // Graceful fallback
    }
  }, [filteredIssues])

  useEffect(() => {
    if (viewMode === 'mappls') {
      initMappls()
    }
  }, [viewMode, initMappls])

  // Fly Mappls map to selected state
  const handleStateSelect = (stateName) => {
    setSelectedState(stateName)
    if (viewMode === 'mappls' && mapplsMapRef.current && stateName && INDIAN_STATES_COORDS[stateName]) {
      const [lat, lng] = INDIAN_STATES_COORDS[stateName]
      mapplsMapRef.current.setCenter({ lat, lng })
      mapplsMapRef.current.setZoom(8)
    }
  }

  // Project Issue Pins for Vector SVG mode
  const issuePins = useMemo(() => {
    if (!projection) return []
    return filteredIssues.map((issue) => {
      let x = 0
      let y = 0
      if (issue.coordinates?.latitude && issue.coordinates?.longitude) {
        const projected = projection([issue.coordinates.longitude, issue.coordinates.latitude])
        if (projected && !isNaN(projected[0])) [x, y] = projected
      } else if (issue.state) {
        const matched = statePaths.find(p => p.name?.toLowerCase() === issue.state?.toLowerCase())
        if (matched && matched.centroid && !isNaN(matched.centroid[0])) {
          const seed = (issue._id?.charCodeAt(0) || 1) + (issue._id?.charCodeAt(1) || 2)
          x = matched.centroid[0] + ((seed % 10) - 5) * 4
          y = matched.centroid[1] + (((seed * 3) % 10) - 5) * 4
        }
      }
      if (x === 0 && y === 0) return null
      return { issue, x, y }
    }).filter(Boolean)
  }, [filteredIssues, projection, statePaths])

  const handleReset = () => {
    setSelectedState('')
    setStatusFilter('')
    setCategoryFilter('')
    setSearchQuery('')
    setZoomLevel(1)
    setPanOffset({ x: 0, y: 0 })
    setHoveredState(null)
    if (mapplsMapRef.current) {
      mapplsMapRef.current.setCenter({ lat: 22.9734, lng: 78.6569 })
      mapplsMapRef.current.setZoom(5)
    }
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Compass className="h-6 w-6 text-primary" /> India Civic Issue Map
          </h1>
          <p className="text-sm text-muted-foreground">
            Powered by <strong>MapmyIndia (Mappls)</strong> — Official sovereign territorial mapping & live municipal tracking across India.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode Switcher */}
          <div className="flex items-center bg-muted p-1 rounded-xl text-xs font-medium border shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode('mappls')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === 'mappls' ? 'bg-background shadow-xs font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Globe className="h-3.5 w-3.5 text-primary" /> MapmyIndia Streets
            </button>
            <button
              type="button"
              onClick={() => setViewMode('choropleth')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === 'choropleth' ? 'bg-background shadow-xs font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layers className="h-3.5 w-3.5" /> State Heatmap
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="text-xs h-8 gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset View
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        {/* Main Map Container */}
        <div className="relative rounded-2xl border bg-card overflow-hidden shadow-sm h-[660px] select-none flex flex-col">
          {/* Top Toolbar */}
          <div className="p-3 bg-background/95 backdrop-blur-md border-b flex flex-wrap items-center justify-between gap-3 text-xs z-20">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                placeholder="Search complaint, city, state…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-xs bg-muted/40"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* State selector */}
              <Select
                value={selectedState}
                onChange={(e) => handleStateSelect(e.target.value)}
                className="h-8 text-xs w-44 bg-muted/40"
              >
                <option value="">All States / UTs</option>
                {statePaths.map((s) => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </Select>

              {/* Status filter */}
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 text-xs w-32 bg-muted/40"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </Select>
            </div>
          </div>

          {/* Map Display (Mappls vs Vector Choropleth) */}
          <div className="relative flex-1 w-full h-full overflow-hidden bg-slate-50/70 dark:bg-slate-950/60">
            {viewMode === 'mappls' ? (
              <div className="relative w-full h-full">
                {loadingMappls && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-xs">
                    <div className="text-center space-y-2">
                      <Loader2 className="h-7 w-7 animate-spin text-primary mx-auto" />
                      <p className="text-xs text-muted-foreground font-medium">Loading MapmyIndia (Mappls) Real-world Streets…</p>
                    </div>
                  </div>
                )}
                <div
                  id="mappls-map-container"
                  ref={mapplsContainerRef}
                  className="w-full h-full"
                  style={{ minHeight: '580px' }}
                />
              </div>
            ) : (
              /* Vector SVG State Heatmap */
              <div
                ref={svgRef}
                className="relative w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
                onMouseDown={(e) => { if (e.button === 0) { setIsDragging(true); setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y }) } }}
                onMouseMove={(e) => { if (isDragging) setPanOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }) }}
                onMouseUp={() => setIsDragging(false)}
                onMouseLeave={() => setIsDragging(false)}
              >
                {/* Zoom Controls */}
                <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5 bg-background/90 backdrop-blur-xs p-1.5 rounded-xl border shadow-md">
                  <button
                    type="button"
                    onClick={() => setZoomLevel(prev => Math.min(prev + 0.3, 3))}
                    className="p-1.5 hover:bg-muted rounded-lg text-foreground transition-colors"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomLevel(prev => Math.max(prev - 0.3, 0.7))}
                    className="p-1.5 hover:bg-muted rounded-lg text-foreground transition-colors"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }) }}
                    className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Hover Tooltip */}
                {hoveredState && (
                  <div
                    className="absolute z-30 pointer-events-none bg-background/95 backdrop-blur-md border rounded-xl shadow-xl px-3 py-2 text-xs space-y-1 min-w-[160px]"
                    style={{
                      left: `${tooltipPos.x}px`,
                      top: `${tooltipPos.y}px`,
                      transform: 'translate(-50%, -100%)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 border-b pb-1">
                      <span className="font-semibold text-foreground">{hoveredState.name}</span>
                      <Badge variant="secondary" className="text-[10px] py-0">{hoveredState.total} issues</Badge>
                    </div>
                    <div className="space-y-0.5 text-[11px] pt-0.5">
                      <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                        <span>Pending:</span>
                        <span className="font-medium">{hoveredState.pending}</span>
                      </div>
                      <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                        <span>In Progress:</span>
                        <span className="font-medium">{hoveredState['in-progress']}</span>
                      </div>
                      <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                        <span>Resolved:</span>
                        <span className="font-medium">{hoveredState.resolved}</span>
                      </div>
                    </div>
                  </div>
                )}

                <svg
                  viewBox="0 0 800 880"
                  className="w-full h-full max-h-[600px] transition-transform duration-75 ease-out"
                  style={{
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                    transformOrigin: 'center center',
                  }}
                >
                  <g className="states-group">
                    {statePaths.map((state) => {
                      const stats = stateStats.find(([st]) => st.toLowerCase() === state.name?.toLowerCase())?.[1]
                      const count = stats?.total || 0
                      const isSelected = selectedState && selectedState.toLowerCase() === state.name?.toLowerCase()
                      const isHovered = hoveredState?.name === state.name

                      return (
                        <path
                          key={state.name}
                          d={state.d}
                          fill={getStateFillColor(count, maxStateIssues, isSelected, isHovered)}
                          stroke={isSelected ? '#1d4ed8' : '#94a3b8'}
                          strokeWidth={isSelected ? 2.5 : 1.2}
                          className="transition-colors duration-150 cursor-pointer"
                          style={{ filter: isSelected ? 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.6))' : 'none' }}
                          onMouseEnter={(e) => {
                            const rect = svgRef.current?.getBoundingClientRect()
                            setHoveredState({ name: state.name, ...stats })
                            if (rect) setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top - 12 })
                          }}
                          onMouseLeave={() => setHoveredState(null)}
                          onClick={() => setSelectedState(prev => prev === state.name ? '' : state.name)}
                        />
                      )
                    })}
                  </g>

                  <g className="pins-group">
                    {issuePins.map(({ issue, x, y }) => (
                      <g
                        key={issue._id}
                        transform={`translate(${x}, ${y})`}
                        className="cursor-pointer transition-transform hover:scale-125"
                        onClick={(e) => { e.stopPropagation(); setSelectedIssue(issue) }}
                      >
                        <circle r="8" fill={STATUS_COLORS[issue.status] || '#ef4444'} opacity="0.3" />
                        <circle r="4.5" fill={STATUS_COLORS[issue.status] || '#ef4444'} stroke="#ffffff" strokeWidth="1.5" />
                      </g>
                    ))}
                  </g>
                </svg>
              </div>
            )}
          </div>

          {/* Bottom Info Bar */}
          <div className="px-4 py-2 bg-background border-t flex items-center justify-between text-xs text-muted-foreground z-20">
            <span className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-primary" />
              {viewMode === 'mappls'
                ? 'MapmyIndia live street vector map with 100% Survey of India sovereign borders.'
                : 'Click any state to highlight & filter complaints.'}
            </span>
            <span className="font-medium text-foreground">
              {selectedState ? `${selectedState}: ` : 'All India: '}
              {filteredIssues.length} complaint{filteredIssues.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Right Sidebar: State Directory & Status Legend */}
        <div className="space-y-4">
          {/* Status Legend Card */}
          <Card>
            <CardContent className="pt-4 pb-4 space-y-2.5 text-xs">
              <h3 className="font-semibold text-sm">Status Breakdown</h3>
              <div className="space-y-2">
                <div
                  onClick={() => setStatusFilter(statusFilter === 'pending' ? '' : 'pending')}
                  className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-colors ${
                    statusFilter === 'pending' ? 'bg-amber-500/15 border border-amber-500/30' : 'hover:bg-muted/50'
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Pending
                  </span>
                  <Badge variant="warning" className="text-[10px] py-0">{issues.filter(i => i.status === 'pending').length}</Badge>
                </div>

                <div
                  onClick={() => setStatusFilter(statusFilter === 'in-progress' ? '' : 'in-progress')}
                  className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-colors ${
                    statusFilter === 'in-progress' ? 'bg-blue-500/15 border border-blue-500/30' : 'hover:bg-muted/50'
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> In Progress
                  </span>
                  <Badge variant="info" className="text-[10px] py-0">{issues.filter(i => i.status === 'in-progress').length}</Badge>
                </div>

                <div
                  onClick={() => setStatusFilter(statusFilter === 'resolved' ? '' : 'resolved')}
                  className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-colors ${
                    statusFilter === 'resolved' ? 'bg-emerald-500/15 border border-emerald-500/30' : 'hover:bg-muted/50'
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Resolved
                  </span>
                  <Badge variant="success" className="text-[10px] py-0">{issues.filter(i => i.status === 'resolved').length}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* State & UT Explorer Directory */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>State & UT Explorer</span>
                <Badge variant="outline" className="text-[10px]">
                  36 Zones
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 max-h-[410px] overflow-y-auto space-y-1.5">
              {stateStats.map(([stateName, stats]) => {
                const isSelected = selectedState === stateName
                return (
                  <div
                    key={stateName}
                    onClick={() => handleStateSelect(isSelected ? '' : stateName)}
                    className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-primary/10 border-primary text-primary font-semibold shadow-xs'
                        : 'border-transparent hover:bg-muted/60 text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="truncate">{stateName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className="text-[10px] py-0">{stats.total}</Badge>
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Full Detail Modal */}
      <Dialog open={!!selectedIssue} onClose={() => setSelectedIssue(null)} className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {selectedIssue && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">{selectedIssue.title}</DialogTitle>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge
                  style={{
                    backgroundColor: `${STATUS_COLORS[selectedIssue.status]}20`,
                    color: STATUS_COLORS[selectedIssue.status],
                  }}
                  className="capitalize"
                >
                  {selectedIssue.status}
                </Badge>
                <Badge variant="secondary">{selectedIssue.category}</Badge>
                <Badge variant="outline" className="capitalize">{selectedIssue.priority} priority</Badge>
                {selectedIssue.resolutionVerification?.isVerified && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs">
                    ✓ AI Verified Resolution
                  </Badge>
                )}
              </div>
            </DialogHeader>

            <DialogContent className="space-y-5">
              {/* Location & Metadata */}
              <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-1">
                {(selectedIssue.location || selectedIssue.state) && (
                  <p className="flex items-center gap-1 font-medium">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    {[selectedIssue.location, selectedIssue.state].filter(Boolean).join(' · ')}
                  </p>
                )}
                {selectedIssue.coordinates?.latitude && (
                  <p className="text-xs text-muted-foreground font-mono">
                    GPS: {selectedIssue.coordinates.latitude.toFixed(5)}, {selectedIssue.coordinates.longitude.toFixed(5)}
                  </p>
                )}
                {selectedIssue.department && (
                  <p className="text-muted-foreground">Assigned to: {selectedIssue.department}</p>
                )}
                <p className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Clock className="h-3.5 w-3.5" />
                  Reported: {new Date(selectedIssue.createdAt).toLocaleString('en-IN')}
                </p>
              </div>

              {/* SLA Timer */}
              <SLATimer issue={selectedIssue} />

              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{selectedIssue.description}</p>
              </div>

              {/* Before vs After Resolution Verification */}
              {(selectedIssue.resolutionImageBase64 || (selectedIssue.status === 'resolved' && selectedIssue.imageBase64)) && (
                <BeforeAfterViewer
                  beforeImage={selectedIssue.imageBase64}
                  afterImage={selectedIssue.resolutionImageBase64}
                  verification={selectedIssue.resolutionVerification}
                />
              )}

              {/* Single Image fallback */}
              {selectedIssue.imageBase64 && !selectedIssue.resolutionImageBase64 && (
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Complaint Photo</p>
                  <img src={selectedIssue.imageBase64} alt="Issue" className="rounded-lg border max-h-56 object-cover w-full" />
                </div>
              )}

              {/* Official Admin Note */}
              {selectedIssue.adminNote && (
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Official Response</p>
                  <p className="text-sm">{selectedIssue.adminNote}</p>
                </div>
              )}

              {/* Timeline */}
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground mb-3">Status Timeline</p>
                <StatusTimeline issue={selectedIssue} />
              </div>

              {/* Comments */}
              <CommentSection
                issueId={selectedIssue._id}
                comments={selectedIssue.comments || []}
                onCommentAdded={(updated) => {
                  setIssues(prev => prev.map(i => i._id === updated._id ? updated : i))
                  setSelectedIssue(updated)
                }}
              />
            </DialogContent>
          </>
        )}
      </Dialog>
    </div>
  )
}
