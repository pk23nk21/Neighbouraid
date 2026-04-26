import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useVolunteerSocket } from '../hooks/useWebSocket'
import { useToast } from '../components/Toast'
import { useNotifications } from '../hooks/useNotifications'
import { ttsLocaleFor, useVoiceAlert } from '../hooks/useVoiceAlert'
import { useI18n } from '../utils/i18n'
import AlertCard from '../components/AlertCard'
import { SkeletonAlertList } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import api from '../utils/api'
import { apiError } from '../utils/error'

const TOAST_VARIANT = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'info',
}

function playPing() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.26)
  } catch {
    /* sound disabled / blocked — silent */
  }
}

const CATEGORY_ICON = {
  medical: '🏥',
  flood: '🌊',
  fire: '🔥',
  missing: '🔍',
  power: '⚡',
  other: '⚠️',
}

export default function VolunteerFeed() {
  const { token } = useAuth()
  const { push: toast } = useToast()
  const notif = useNotifications()
  const voiceAlert = useVoiceAlert()
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState([])
  const [coords, setCoords] = useState(null)
  const [status, setStatus] = useState('connecting')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const knownIds = useRef(new Set())
  const watchIdRef = useRef(null)

  // Keep the volunteer's location fresh — they may be moving toward a crisis.
  // The watch updates both the server proximity and the "nearby" fetch.
  useEffect(() => {
    if (!navigator.geolocation) {
      setCoords([76.7794, 30.7333])
      return undefined
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords: c }) => setCoords([c.longitude, c.latitude]),
      () => setCoords([76.7794, 30.7333]),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
    watchIdRef.current = navigator.geolocation.watchPosition(
      ({ coords: c }) => {
        setCoords((prev) => {
          if (!prev) return [c.longitude, c.latitude]
          // Only update when the fix moved more than ~15 m — avoids jitter
          const [oldLng, oldLat] = prev
          const dx = (c.longitude - oldLng) * 111320 * Math.cos((c.latitude * Math.PI) / 180)
          const dy = (c.latitude - oldLat) * 111320
          const moved = Math.sqrt(dx * dx + dy * dy)
          if (moved > 15) return [c.longitude, c.latitude]
          return prev
        })
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15000 }
    )
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!coords) return undefined
    let cancelled = false
    const [lng, lat] = coords
    setLoading(true)
    api
      .get('/api/alerts/nearby', { params: { lat, lng, km: 10 } })
      .then(({ data }) => {
        if (!cancelled) {
          setAlerts(data)
          knownIds.current = new Set(data.map((a) => a.id))
        }
      })
      .catch((err) => {
        if (!cancelled) setError(apiError(err, t('vol_failed')))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [coords, t])

  const notifyRef = useRef(notif.notify)
  notifyRef.current = notif.notify
  // voiceAlert.speak captures language inside its closure — keep both fresh
  // via refs so onAlert's dep array stays stable across language switches.
  const voiceSpeakRef = useRef(voiceAlert.speak)
  voiceSpeakRef.current = voiceAlert.speak
  const langRef = useRef(lang)
  langRef.current = lang

  const onAlert = useCallback(
    (incoming) => {
      const isNew = !knownIds.current.has(incoming.id)
      knownIds.current.add(incoming.id)
      setAlerts((prev) => {
        const exists = prev.some((a) => a.id === incoming.id)
        if (exists) return prev.map((a) => (a.id === incoming.id ? incoming : a))
        return [incoming, ...prev]
      })
      if (isNew && incoming.status === 'open') {
        playPing()
        const catIcon = CATEGORY_ICON[incoming.category] || '⚠️'
        // Hands-free TTS for CRITICAL only — anything lower is too noisy.
        if (incoming.urgency === 'CRITICAL') {
          const distancePart =
            typeof incoming.your_distance_km === 'number'
              ? `${incoming.your_distance_km.toFixed(1)} kilometres away`
              : ''
          voiceSpeakRef.current?.(
            `Critical ${incoming.category} alert${distancePart ? `, ${distancePart}` : ''}`,
            { lang: ttsLocaleFor(langRef.current) }
          )
        }
        const distance =
          typeof incoming.your_distance_km === 'number'
            ? ` · ${incoming.your_distance_km.toFixed(1)} km away`
            : ''
        const skillTag = incoming.is_skill_match ? ' · MATCHES YOUR SKILLS' : ''
        toast({
          variant: TOAST_VARIANT[incoming.urgency] ?? 'info',
          title: `${catIcon} ${incoming.urgency} · ${incoming.category}${skillTag}`,
          body: `${incoming.description.slice(0, 140)}${distance}`,
        })
        notifyRef.current?.({
          title: `${catIcon} ${incoming.urgency} · ${incoming.category}${skillTag}`,
          body: `${incoming.description.slice(0, 140)}${distance}`,
          tag: `alert-${incoming.id}`,
          // CRITICAL alerts stay visible until the volunteer interacts
          requireInteraction: incoming.urgency === 'CRITICAL',
          data: { alertId: incoming.id, url: `/alert/${incoming.id}` },
          onClick: () => navigate(`/alert/${incoming.id}`),
        })
      }
    },
    [toast, navigate]
  )

  useVolunteerSocket({ token, coordinates: coords, onAlert, onStatus: setStatus })

  // SW-routed click messages arrive here when a background notification is tapped
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined
    const onMsg = (event) => {
      const { type, target } = event.data || {}
      if (type === 'notification-click' && target) navigate(target)
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [navigate])

  const notifEnabled = notif.permission === 'granted'

  const updateAlert = (updated) => {
    setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
  }

  const openAlerts = alerts.filter((a) => a.status === 'open')
  const acceptedAlerts = alerts.filter((a) => a.status === 'accepted')
  const connected = status === 'open'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center justify-between mb-5 sm:mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white">{t('vol_title')}</h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">{t('vol_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0" aria-live="polite">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              connected ? 'bg-green-500 animate-pulse' : 'bg-gray-600'
            }`}
          />
          <span className="text-xs text-gray-400 capitalize">
            {connected ? t('vol_live') : status}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {notif.permission === 'default' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="text-sm text-gray-300 flex-1">
            {t('vol_enable_notif')}
          </div>
          <button
            onClick={notif.request}
            className="text-xs bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg whitespace-nowrap self-start sm:self-auto"
          >
            {t('vol_enable')}
          </button>
        </div>
      )}
      {notifEnabled && (
        <div className="text-[11px] text-gray-600 mb-2">{t('vol_notif_on')}</div>
      )}

      {voiceAlert.supported && (
        <button
          type="button"
          onClick={() => voiceAlert.setEnabled((v) => !v)}
          className={`text-[11px] mb-4 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-colors ${
            voiceAlert.enabled
              ? 'border-blue-700 bg-blue-950/40 text-blue-300'
              : 'border-gray-700 text-gray-500 hover:text-gray-300'
          }`}
          title="Read out CRITICAL alerts via your device's voice"
        >
          <span aria-hidden>🔊</span>
          <span>Voice alerts {voiceAlert.enabled ? 'on' : 'off'}</span>
        </button>
      )}

      {loading ? (
        <SkeletonAlertList count={3} />
      ) : (
        <>
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
              {t('vol_open')} — {openAlerts.length}
            </h2>
            {openAlerts.length === 0 ? (
              <EmptyState
                icon="🛟"
                title={t('vol_no_open')}
                body="When a reporter posts within 10 km — or anywhere matching your skills — it will land here in real time."
              />
            ) : (
              <div className="space-y-3">
                {openAlerts.map((a) => (
                  <AlertCard key={a.id} alert={a} onUpdate={updateAlert} />
                ))}
              </div>
            )}
          </section>

          {acceptedAlerts.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
                {t('vol_active')} — {acceptedAlerts.length}
              </h2>
              <div className="space-y-3">
                {acceptedAlerts.map((a) => (
                  <AlertCard key={a.id} alert={a} onUpdate={updateAlert} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
