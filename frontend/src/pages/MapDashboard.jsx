import { useEffect, useMemo, useRef, useState } from 'react'
import MapView from '../components/MapView'
import api from '../utils/api'
import { apiError } from '../utils/error'
import { useI18n } from '../utils/i18n'

const URGENCY_FILTERS = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const CATEGORIES = ['all', 'medical', 'flood', 'fire', 'missing', 'power', 'other']
const FALLBACK_CENTER = [30.7333, 76.7794] // Chandigarh

export default function MapDashboard() {
  const { t } = useI18n()
  const [alerts, setAlerts] = useState([])
  const [urgencyFilter, setUrgencyFilter] = useState('ALL')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [userCenter, setUserCenter] = useState(null)
  const [locationAccuracy, setLocationAccuracy] = useState(null)
  const [locationTime, setLocationTime] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [error, setError] = useState('')
  const [showHeat, setShowHeat] = useState(false)
  const [heatPoints, setHeatPoints] = useState([])
  const watchIdRef = useRef(null)

  // Start a live geolocation watch — coords + accuracy + timestamp update as
  // the browser/device reports fresher fixes. This keeps "My location" truly
  // current rather than frozen at the first fix.
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported in this browser')
      return undefined
    }
    setLocating(true)
    const onOk = ({ coords, timestamp }) => {
      setUserCenter([coords.latitude, coords.longitude])
      setLocationAccuracy(coords.accuracy)
      setLocationTime(timestamp)
      setLocationError('')
      setLocating(false)
    }
    const onErr = (err) => {
      setLocationError(err.message || 'Unable to read location')
      setLocating(false)
    }
    // getCurrentPosition gives us a fix immediately; watchPosition then keeps
    // it fresh as the device moves (or accuracy improves).
    navigator.geolocation.getCurrentPosition(onOk, onErr, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
    watchIdRef.current = navigator.geolocation.watchPosition(onOk, onErr, {
      enableHighAccuracy: true,
      maximumAge: 10000,
    })
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const center = userCenter ?? FALLBACK_CENTER
    let cancelled = false

    const fetchAlerts = async () => {
      // Skip polling when the tab is hidden — the map isn't visible anyway
      if (document.visibilityState === 'hidden') return
      try {
        const { data } = await api.get('/api/alerts/nearby', {
          params: { lat: center[0], lng: center[1], km: 50 },
        })
        if (!cancelled) {
          setAlerts(data)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(apiError(err, t('map_failed')))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchAlerts()
    const id = setInterval(fetchAlerts, 15000)
    const onVis = () => {
      if (document.visibilityState === 'visible') fetchAlerts()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [userCenter, t])

  // Fetch heatmap points only when the overlay is enabled. The endpoint
  // returns a compact [lat, lng, weight] list (no descriptions/photos), so
  // we can refresh it on a longer cadence than the main marker list.
  useEffect(() => {
    if (!showHeat) return undefined
    const center = userCenter ?? FALLBACK_CENTER
    let cancelled = false
    const fetchHeat = async () => {
      try {
        const { data } = await api.get('/api/alerts/heatmap', {
          params: { lat: center[0], lng: center[1], km: 50, hours: 72 },
        })
        if (!cancelled) setHeatPoints(data.points || [])
      } catch {
        /* silent — heatmap is decorative */
      }
    }
    fetchHeat()
    const id = setInterval(fetchHeat, 60000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [showHeat, userCenter])

  const recenterNow = () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => {
        setUserCenter([coords.latitude, coords.longitude])
        setLocationAccuracy(coords.accuracy)
        setLocationTime(timestamp)
        setLocationError('')
        setLocating(false)
      },
      (err) => {
        setLocationError(err.message || 'Unable to read location')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  const visible = useMemo(
    () =>
      alerts.filter(
        (a) =>
          (urgencyFilter === 'ALL' || a.urgency === urgencyFilter) &&
          (categoryFilter === 'all' || a.category === categoryFilter)
      ),
    [alerts, urgencyFilter, categoryFilter]
  )

  const urgencyCounts = alerts.reduce((acc, a) => {
    acc[a.urgency] = (acc[a.urgency] ?? 0) + 1
    return acc
  }, {})

  const categoryCounts = alerts.reduce((acc, a) => {
    acc[a.category] = (acc[a.category] ?? 0) + 1
    return acc
  }, {})

  const locStatus = locationError
    ? locationError
    : userCenter
    ? `${userCenter[0].toFixed(4)}, ${userCenter[1].toFixed(4)}${
        locationAccuracy ? ` · ±${Math.round(locationAccuracy)} m` : ''
      }${locationTime ? ` · ${new Date(locationTime).toLocaleTimeString()}` : ''}`
    : 'Locating…'

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      <div className="bg-gray-900 border-b border-gray-800 px-3 sm:px-6 py-2 sm:py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-white font-semibold text-sm sm:text-base">{t('map_title')}</span>
          <div className="flex gap-1.5 flex-wrap">
            {URGENCY_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setUrgencyFilter(f)}
                className={`text-[11px] sm:text-xs px-2.5 sm:px-3 py-1 rounded-full border transition-colors ${
                  urgencyFilter === f
                    ? 'border-orange-500 bg-orange-500/20 text-orange-400'
                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {f === 'ALL' ? t('map_all') : f}
                {f !== 'ALL' && urgencyCounts[f] ? (
                  <span className="ml-1 text-gray-500">({urgencyCounts[f]})</span>
                ) : null}
              </button>
            ))}
          </div>
          <span className="text-gray-500 text-[11px] sm:text-xs ml-auto w-full sm:w-auto order-last sm:order-none">
            {loading
              ? t('map_loading')
              : error
              ? error
              : `${visible.length} ${
                  visible.length !== 1 ? t('map_active_alerts_many') : t('map_active_alerts_one')
                } · ${t('map_refresh_note')}`}
          </span>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`text-[11px] sm:text-xs px-2.5 sm:px-3 py-1 rounded-full border transition-colors ${
                categoryFilter === cat
                  ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                  : 'border-gray-700 text-gray-500 hover:border-gray-500'
              }`}
            >
              {cat === 'all' ? t('map_all') : t(`cat_${cat}`)}
              {cat !== 'all' && categoryCounts[cat] ? (
                <span className="ml-1 text-gray-500">({categoryCounts[cat]})</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
          <span className="truncate flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span className="truncate">📍 {locStatus}</span>
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowHeat((v) => !v)}
              className={`text-xs border px-2 py-0.5 rounded-md transition-colors ${
                showHeat
                  ? 'border-orange-500 bg-orange-500/20 text-orange-300'
                  : 'border-gray-700 text-gray-300 hover:border-gray-500'
              }`}
              title="Toggle 72-hour heatmap overlay"
            >
              {showHeat ? '🔥 Heat on' : '🔥 Heat'}
            </button>
            <button
              onClick={recenterNow}
              disabled={locating}
              className="text-xs border border-gray-700 hover:border-gray-500 text-gray-300 px-2 py-0.5 rounded-md transition-colors disabled:opacity-50"
              title="Recenter to current location"
            >
              {locating ? '…' : '⟳'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-2 sm:p-4 min-h-0">
        <MapView
          alerts={visible}
          center={userCenter}
          accuracy={locationAccuracy}
          heatPoints={heatPoints}
          showHeat={showHeat}
        />
      </div>
    </div>
  )
}
