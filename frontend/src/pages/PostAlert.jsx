import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { apiError } from '../utils/error'
import { useVoice } from '../hooks/useVoice'
import { useI18n } from '../utils/i18n'
import { approxKb, compressImage } from '../utils/photo'
import { enqueueAlert, flushQueue, listPending } from '../utils/offlineQueue'
import { useToast } from '../components/Toast'

const CATEGORIES = ['medical', 'flood', 'fire', 'missing', 'power', 'other']
const MAX_PHOTOS = 3

export default function PostAlert() {
  const navigate = useNavigate()
  const { t, lang } = useI18n()
  const { push: toast } = useToast()
  const fileInputRef = useRef(null)
  const [form, setForm] = useState({
    category: 'medical',
    description: '',
    location: { type: 'Point', coordinates: [76.7794, 30.7333] },
  })
  const [photos, setPhotos] = useState([])
  const [locLoading, setLocLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [locationSet, setLocationSet] = useState(false)
  const [photoProcessing, setPhotoProcessing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  const voiceLang = lang === 'hi' ? 'hi-IN' : lang === 'pa' ? 'pa-IN' : 'en-IN'
  const voice = useVoice({
    lang: voiceLang,
    onResult: (text, isFinal) => {
      if (isFinal) {
        setForm((f) => ({
          ...f,
          description: f.description ? `${f.description} ${text}` : text,
        }))
      }
    },
  })

  useEffect(() => {
    listPending().then((rows) => setPendingCount(rows.length)).catch(() => {})
    const onOnline = () => {
      setOnline(true)
      // Try to flush any queued alerts as soon as we're back online
      flushQueue((payload) => api.post('/api/alerts/', payload))
        .then(({ sent, remaining }) => {
          setPendingCount(remaining)
          if (sent > 0) {
            toast({
              variant: 'success',
              title: 'Queued alerts sent',
              body: `${sent} alert${sent !== 1 ? 's' : ''} delivered after reconnect.`,
            })
          }
        })
        .catch(() => {})
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [toast])

  const detectLocation = () => {
    if (!navigator.geolocation) return
    setLocLoading(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setForm((f) => ({
          ...f,
          location: { type: 'Point', coordinates: [coords.longitude, coords.latitude] },
        }))
        setLocationSet(true)
        setLocLoading(false)
      },
      () => setLocLoading(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const onPhotoPick = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setPhotoProcessing(true)
    setError('')
    try {
      const room = Math.max(0, MAX_PHOTOS - photos.length)
      const picks = files.slice(0, room)
      const compressed = []
      for (const f of picks) {
        try {
          const data = await compressImage(f)
          compressed.push(data)
        } catch (err) {
          setError(err.message || 'Could not process photo')
        }
      }
      if (compressed.length) {
        setPhotos((prev) => [...prev, ...compressed].slice(0, MAX_PHOTOS))
      }
    } finally {
      setPhotoProcessing(false)
      // Reset the file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removePhoto = (i) => {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (form.description.trim().length < 10) {
      setError(t('post_min_chars'))
      return
    }
    setError('')
    setSubmitting(true)
    const payload = { ...form, photos }
    try {
      await api.post('/api/alerts/', payload)
      navigate('/my-alerts')
    } catch (err) {
      // If we're offline or the network is unreachable, queue it for later
      const isNetwork =
        err?.code === 'ERR_NETWORK' ||
        err?.message === 'Network Error' ||
        !navigator.onLine
      if (isNetwork) {
        try {
          await enqueueAlert(payload)
          const rows = await listPending()
          setPendingCount(rows.length)
          toast({
            variant: 'warning',
            title: 'Saved offline',
            body: 'Alert queued — it will send automatically when you reconnect.',
          })
          navigate('/my-alerts')
          return
        } catch {
          setError('Could not queue alert offline — try again.')
        }
      } else {
        setError(apiError(err, t('post_failed')))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const [lng, lat] = form.location.coordinates

  return (
    <div className="min-h-screen flex items-start sm:items-center justify-center px-4 py-8 sm:py-12">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 sm:p-8 w-full max-w-lg">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">🚨</span>
          <h1 className="text-xl sm:text-2xl font-bold text-white">{t('post_title')}</h1>
        </div>
        <p className="text-gray-400 text-sm mb-4 sm:mb-6">
          {t('post_subtitle')}
        </p>

        {!online && (
          <div className="bg-amber-950 border border-amber-700 text-amber-300 text-xs rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
            <span>📡</span>
            <span>Offline — your alert will be queued and sent automatically.</span>
          </div>
        )}
        {pendingCount > 0 && (
          <div className="bg-blue-950 border border-blue-700 text-blue-300 text-xs rounded-lg px-3 py-2 mb-4">
            {pendingCount} queued alert{pendingCount !== 1 ? 's' : ''} awaiting connectivity.
          </div>
        )}

        {error && (
          <div className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-5 sm:space-y-6">
          <div>
            <label className="block text-sm text-gray-400 mb-2">{t('post_category')}</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setForm({ ...form, category: cat })}
                  className={`py-2.5 rounded-lg border capitalize text-sm font-medium transition-colors ${
                    form.category === cat
                      ? 'border-orange-500 bg-orange-500/20 text-orange-400'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {t(`cat_${cat}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
              <label className="block text-sm text-gray-400">
                {t('post_description')}{' '}
                <span className="text-gray-600 hidden sm:inline">{t('post_description_hint')}</span>
              </label>
              {voice.supported && (
                <button
                  type="button"
                  onClick={voice.listening ? voice.stop : voice.start}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                    voice.listening
                      ? 'border-red-500 bg-red-500/20 text-red-300 animate-pulse'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                  title={voice.listening ? t('post_voice_tip_stop') : t('post_voice_tip_start')}
                >
                  {voice.listening ? t('post_voice_recording') : t('post_voice_speak')}
                </button>
              )}
            </div>
            <textarea
              required
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors resize-none text-base"
              placeholder={t('post_description_placeholder')}
            />
            {voice.error && (
              <p className="text-xs text-red-400 mt-1">🎤 {voice.error}</p>
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">
              Photos (optional) <span className="text-gray-600">· boosts AI confidence</span>
            </label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {photos.map((src, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-700 bg-gray-800">
                  <img src={src} alt={`upload ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 bg-black/70 hover:bg-black text-white w-6 h-6 rounded-full text-xs leading-none flex items-center justify-center"
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                  <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                    {approxKb(src)} KB
                  </span>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label
                  className={`aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-xs cursor-pointer transition-colors ${
                    photoProcessing
                      ? 'border-gray-700 text-gray-500'
                      : 'border-gray-700 text-gray-400 hover:border-orange-500 hover:text-orange-400'
                  }`}
                >
                  <span className="text-2xl mb-1">📷</span>
                  {photoProcessing ? 'Processing…' : 'Add photo'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={onPhotoPick}
                    className="hidden"
                    disabled={photoProcessing}
                  />
                </label>
              )}
            </div>
            <p className="text-[11px] text-gray-500">
              Up to {MAX_PHOTOS} photos · auto-compressed · AI scans them for visual evidence.
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">{t('post_location')}</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={`${lat.toFixed(5)}, ${lng.toFixed(5)}`}
                className={`flex-1 min-w-0 bg-gray-800 border text-gray-300 rounded-lg px-3 sm:px-4 py-2.5 text-sm ${
                  locationSet ? 'border-emerald-700' : 'border-gray-700'
                }`}
              />
              <button
                type="button"
                onClick={detectLocation}
                disabled={locLoading}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {locLoading ? '…' : t('post_use_gps')}
              </button>
            </div>
            {locationSet && (
              <p className="text-[11px] text-emerald-400 mt-1">✓ GPS location captured</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {submitting ? t('post_submitting') : t('post_submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
