import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import HeatLayer from './HeatLayer'

// Fix leaflet default icon path broken by bundlers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const URGENCY_COLORS = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#22c55e',
}

function urgencyIcon(urgency) {
  const color = URGENCY_COLORS[urgency] ?? '#94a3b8'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  })
}

const userDotIcon = L.divIcon({
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 2px rgba(59,130,246,0.5);"></div>`,
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

// Keeps the map centered on the user as their coords update. Only re-centers
// when the coords actually change so it doesn't fight user pan/zoom.
function FollowUser({ center }) {
  const map = useMap()
  const prevRef = useRef(null)
  useEffect(() => {
    if (!center) return
    const prev = prevRef.current
    if (!prev) {
      map.setView(center, 14)
    } else {
      const [lat1, lng1] = prev
      const [lat2, lng2] = center
      const movedMeters = map.distance([lat1, lng1], [lat2, lng2])
      // Only pan when the fix has actually moved meaningfully (>10 m).
      // Prevents jittery jumping from GPS noise.
      if (movedMeters > 10) map.panTo(center, { animate: true })
    }
    prevRef.current = center
  }, [center, map])
  return null
}

// Invalidates size when parent resizes (handles mobile orientation change + panel collapse)
function ResizeObserver() {
  const map = useMap()
  useEffect(() => {
    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    // also run once after mount — parent may have laid out before map
    const id = setTimeout(() => map.invalidateSize(), 100)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      clearTimeout(id)
    }
  }, [map])
  return null
}

function Legend() {
  return (
    <div className="absolute bottom-3 right-3 z-[400] bg-gray-900/95 border border-gray-800 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-300 space-y-0.5 shadow-lg max-w-[140px]">
      <div className="font-semibold text-gray-100 mb-0.5">Urgency</div>
      {Object.entries(URGENCY_COLORS).map(([level, color]) => (
        <div key={level} className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ background: color }}
          />
          <span>{level}</span>
        </div>
      ))}
    </div>
  )
}

export default function MapView({ alerts, center, accuracy, heatPoints, showHeat = false }) {
  const defaultCenter = center ?? [30.7333, 76.7794]

  // Cap the accuracy circle to something sensible so a 5 km fix doesn't swamp
  // the whole map. Also hide it entirely if we have no fix yet.
  const cappedAccuracy = useMemo(() => {
    if (!accuracy || !center) return null
    return Math.min(accuracy, 2000)
  }, [accuracy, center])

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={defaultCenter}
        zoom={13}
        className="w-full h-full rounded-xl"
        style={{ minHeight: '300px' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ResizeObserver />
        {showHeat && heatPoints?.length > 0 && <HeatLayer points={heatPoints} />}
        {center && <FollowUser center={center} />}
        {center && (
          <>
            <Marker position={center} icon={userDotIcon}>
              <Popup>
                <div className="text-xs">
                  <strong>Your location</strong>
                  <br />
                  {center[0].toFixed(5)}, {center[1].toFixed(5)}
                  {accuracy ? <><br />±{Math.round(accuracy)} m</> : null}
                </div>
              </Popup>
            </Marker>
            {cappedAccuracy && cappedAccuracy > 15 && (
              <Circle
                center={center}
                radius={cappedAccuracy}
                pathOptions={{ color: '#3b82f6', weight: 1, fillOpacity: 0.08 }}
              />
            )}
          </>
        )}
        {alerts.map((alert) => {
          const [lng, lat] = alert.location.coordinates
          return (
            <Marker key={alert.id} position={[lat, lng]} icon={urgencyIcon(alert.urgency)}>
              <Popup>
                <div className="text-sm max-w-[240px]">
                  <p className="font-bold capitalize">{alert.category}</p>
                  <p className="text-xs text-gray-600 mb-1">
                    {alert.urgency} · {alert.status} · verified {alert.verified_score ?? 0}/100
                  </p>
                  <p className="mb-1">{alert.description}</p>
                  {alert.address ? (
                    <p className="text-[11px] text-gray-500 mt-1">📍 {alert.address}</p>
                  ) : null}
                  <p className="text-[11px] text-gray-500 mt-1">
                    👥 {alert.witnesses ?? 1} witness
                    {(alert.witnesses ?? 1) !== 1 ? 'es' : ''}
                    {alert.weather_match ? ' · 🌦 weather-match' : ''}
                  </p>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
      <Legend />
    </div>
  )
}
