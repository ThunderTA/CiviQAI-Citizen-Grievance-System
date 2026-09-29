import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MapPin, Navigation, Loader2, Sparkles, AlertCircle, Check } from 'lucide-react'

// Custom sleek marker icon using Lucide style
const customPinIcon = L.divIcon({
  className: 'custom-map-pin',
  html: `
    <div style="
      background-color: #ef4444;
      width: 32px;
      height: 32px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      border: 2px solid white;
    ">
      <div style="
        width: 10px;
        height: 10px;
        background-color: white;
        border-radius: 50%;
        transform: rotate(45deg);
      "></div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
})

// Map click listener component
function MapClickHandler({ onPinDrop }) {
  useMapEvents({
    click(e) {
      onPinDrop(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// Map recenter helper
function MapRecenter({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords && coords.latitude && coords.longitude) {
      map.setView([coords.latitude, coords.longitude], 15, { animate: true })
    }
  }, [coords, map])
  return null
}

export function LocationPicker({ value, onLocationSelect }) {
  // Default coordinates (New Delhi / Central India)
  const defaultLat = value?.latitude || 28.6139
  const defaultLng = value?.longitude || 77.2090

  const [coords, setCoords] = useState(
    value?.latitude && value?.longitude
      ? { latitude: value.latitude, longitude: value.longitude }
      : null
  )
  const [detecting, setDetecting] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [geoAddress, setGeoAddress] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Reverse geocoding using OpenStreetMap Nominatim
  const reverseGeocode = useCallback(async (lat, lng) => {
    setGeocoding(true)
    setErrorMsg('')
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      )
      const data = await res.json()
      if (data && data.address) {
        const addr = data.address
        const street = [addr.road || addr.suburb || addr.neighbourhood || addr.city_district, addr.city || addr.town || addr.county]
          .filter(Boolean)
          .join(', ')

        const fullLocation = street || data.display_name?.split(',').slice(0, 3).join(',')
        const stateName = addr.state || ''

        setGeoAddress(fullLocation)
        onLocationSelect?.({
          coordinates: { latitude: lat, longitude: lng },
          locationText: fullLocation,
          stateName,
        })
      } else {
        onLocationSelect?.({
          coordinates: { latitude: lat, longitude: lng },
        })
      }
    } catch (err) {
      console.warn('Reverse geocoding failed:', err)
      onLocationSelect?.({
        coordinates: { latitude: lat, longitude: lng },
      })
    } finally {
      setGeocoding(false)
    }
  }, [onLocationSelect])

  const handlePinDrop = (lat, lng) => {
    const roundedLat = Math.round(lat * 1000000) / 1000000
    const roundedLng = Math.round(lng * 1000000) / 1000000
    setCoords({ latitude: roundedLat, longitude: roundedLng })
    reverseGeocode(roundedLat, roundedLng)
  }

  // Codes match the GeolocationPositionError spec (1 = permission denied,
  // 2 = position unavailable, 3 = timeout). Each needs different guidance —
  // "check your permissions" is useless advice for a timeout, and a denied
  // permission needs the user to change a *browser* setting, not retry.
  const describeGeoError = (err) => {
    switch (err.code) {
      case 1:
        return 'Location access is blocked for this site. Click the location or lock icon in your browser\'s address bar, allow location, then try again — or click a spot on the map instead.'
      case 2:
        return 'Your device could not determine a location right now. Try again in a moment, or click a spot on the map.'
      case 3:
        return 'Location detection took too long. Try again, or click a spot on the map.'
      default:
        return 'Unable to retrieve your location. Please check location permissions or click on the map.'
    }
  }

  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser.')
      return
    }
    setDetecting(true)
    setErrorMsg('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 1000000) / 1000000
        const lng = Math.round(pos.coords.longitude * 1000000) / 1000000
        setCoords({ latitude: lat, longitude: lng })
        setDetecting(false)
        reverseGeocode(lat, lng)
      },
      (err) => {
        // Was silently swallowed before, which made this unfixable to debug
        // from the outside — a user (or a developer) just saw "doesn't work".
        console.warn('Geolocation failed:', err.code, err.message)
        setDetecting(false)
        setErrorMsg(describeGeoError(err))
      },
      {
        // High accuracy asks for the GPS chip's precision, which most desktops
        // and laptops do not have; the browser then waits out the full timeout
        // for a fix that will never come before falling back anyway. Low
        // accuracy uses WiFi/IP positioning, which is what actually resolves
        // on a desktop and resolves in well under a second when it works.
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 60000,
      }
    )
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-3 shadow-xs">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <MapPin className="h-4 w-4 text-primary" />
          <span>Pinpoint Exact Incident Spot (GPS)</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDetectGPS}
          disabled={detecting}
          className="h-8 text-xs gap-1.5 bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary"
        >
          {detecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Navigation className="h-3.5 w-3.5" />
          )}
          <span>{detecting ? 'Locating…' : 'Use Live GPS'}</span>
        </Button>
      </div>

      {/* Map Display */}
      <div className="relative h-60 w-full rounded-lg overflow-hidden border">
        <MapContainer
          center={[coords?.latitude || defaultLat, coords?.longitude || defaultLng]}
          zoom={coords ? 15 : 5}
          scrollWheelZoom={false}
          className="h-full w-full z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onPinDrop={handlePinDrop} />
          {coords && <Marker position={[coords.latitude, coords.longitude]} icon={customPinIcon} />}
          {coords && <MapRecenter coords={coords} />}
        </MapContainer>

        {/* Tip overlay */}
        <div className="absolute bottom-2 left-2 z-[400] bg-background/90 backdrop-blur-xs text-[11px] px-2 py-1 rounded-md border text-muted-foreground shadow-xs pointer-events-none">
          {coords ? 'Click anywhere on map to reposition pin' : 'Click on the map or tap "Use Live GPS"'}
        </div>
      </div>

      {/* Selected Location Pill */}
      {coords && (
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border text-xs">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-foreground flex items-center gap-1">
                <Check className="h-3.5 w-3.5 text-emerald-500" /> GPS Tagged:
              </span>
              <span className="text-muted-foreground font-mono text-[11px]">
                {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
              </span>
            </div>
            {geoAddress && (
              <p className="text-muted-foreground truncate">{geoAddress}</p>
            )}
          </div>
          {geocoding && (
            <Badge variant="secondary" className="shrink-0 text-[10px] gap-1 animate-pulse">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Auto-filling…
            </Badge>
          )}
        </div>
      )}

      {errorMsg && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {errorMsg}
        </p>
      )}
    </div>
  )
}
