import { useCallback, useEffect, useState } from 'react'
import api from '../utils/api'
import { apiError } from '../utils/error'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../utils/i18n'
import BuddyPing from '../components/BuddyPing'

const STATUS_STYLE = {
  safe: 'bg-green-900/50 text-green-300 border-green-700',
  need_help: 'bg-red-900/50 text-red-300 border-red-700',
}

function useTimeAgo(iso) {
  const { t } = useI18n()
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30000)
    return () => clearInterval(id)
  }, [])
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (Number.isNaN(diff) || diff < 0) return `0${t('t_sec')}`
  if (diff < 60) return `${diff}${t('t_sec')}`
  if (diff < 3600) return `${Math.floor(diff / 60)}${t('t_min')}`
  if (diff < 86400) return `${Math.floor(diff / 3600)}${t('t_hr')}`
  return `${Math.floor(diff / 86400)}${t('t_day')}`
}

function CheckinRow({ c }) {
  const ago = useTimeAgo(c.created_at)
  return (
    <li className={`border rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 ${STATUS_STYLE[c.status]}`}>
      <div className="flex items-center justify-between text-sm gap-2">
        <span className="font-semibold truncate">
          {c.status === 'safe' ? '✅' : '🆘'} {c.user_name}
        </span>
        <span className="text-xs text-gray-400 shrink-0">{ago}</span>
      </div>
      {c.note && <p className="text-sm mt-1 break-words">{c.note}</p>}
    </li>
  )
}

export default function Safety() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [list, setList] = useState([])
  const [me, setMe] = useState(null)
  const [coords, setCoords] = useState(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      ({ coords: c }) => setCoords([c.longitude, c.latitude]),
      () => setCoords([76.7794, 30.7333]),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }, [])

  const load = useCallback(async () => {
    if (!coords) return
    try {
      const [nearRes, meRes] = await Promise.all([
        api.get('/api/safety/near', {
          params: { lng: coords[0], lat: coords[1], km: 10 },
        }),
        user ? api.get('/api/safety/me') : Promise.resolve({ data: null }),
      ])
      setList(nearRes.data)
      setMe(meRes.data)
    } catch (err) {
      setError(apiError(err, t('safety_load_failed')))
    }
  }, [coords, user, t])

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  const checkin = async (status) => {
    if (!coords || !user) return
    setSaving(status)
    setError('')
    try {
      // Re-read current GPS right now so the check-in is posted with the freshest fix,
      // not a stale one from page load. Falls back to last-known coords on failure.
      const fresh = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(coords)
        navigator.geolocation.getCurrentPosition(
          (p) => resolve([p.coords.longitude, p.coords.latitude]),
          () => resolve(coords),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        )
      })
      const { data } = await api.post('/api/safety/', {
        status,
        note: note.trim(),
        location: { type: 'Point', coordinates: fresh },
      })
      setMe(data)
      await load()
    } catch (err) {
      setError(apiError(err, t('safety_post_failed')))
    } finally {
      setSaving('')
    }
  }

  const safeCount = list.filter((c) => c.status === 'safe').length
  const helpCount = list.filter((c) => c.status === 'need_help').length

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-5 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-white">{t('safety_title')}</h1>
        <p className="text-gray-400 text-sm mt-1">
          {t('safety_subtitle')}
        </p>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {user ? (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
            {t('safety_your')}
          </h2>
          {me ? (
            <MyCheckin me={me} />
          ) : (
            <p className="text-gray-500 text-sm mb-4">{t('safety_no_active')}</p>
          )}
          <div className="space-y-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('safety_note_ph')}
              maxLength={280}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-orange-500"
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => checkin('safe')}
                disabled={!coords || !!saving}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {saving === 'safe' ? t('safety_saving') : t('safety_i_am_safe')}
              </button>
              <button
                onClick={() => checkin('need_help')}
                disabled={!coords || !!saving}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {saving === 'need_help' ? t('safety_saving') : t('safety_i_need_help')}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 mb-6 text-sm text-gray-400">
          <a href="/login" className="text-orange-400 hover:text-orange-300">
            {t('safety_sign_in')}
          </a>{' '}
          {t('safety_sign_in_to')}
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
          {t('safety_nearby')} · {list.length} {t('safety_checkins')} ({safeCount} {t('safety_safe')}, {helpCount} {t('safety_need_help')})
        </h2>
        {list.length === 0 ? (
          <p className="text-gray-500 text-sm">{t('safety_none_yet')}</p>
        ) : (
          <ul className="space-y-2">
            {list.map((c, i) => (
              <CheckinRow key={`${c.user_name}-${i}`} c={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function MyCheckin({ me }) {
  const { t } = useI18n()
  const ago = useTimeAgo(me.created_at)
  return (
    <div className={`border rounded-lg px-3 sm:px-4 py-3 mb-4 ${STATUS_STYLE[me.status]}`}>
      <div className="flex items-center justify-between text-xs mb-1 gap-2">
        <span className="font-semibold uppercase truncate">
          {me.status === 'safe' ? t('safety_i_am_safe') : t('safety_i_need_help')}
        </span>
        <span className="text-gray-400 shrink-0">{ago}</span>
      </div>
      {me.note && <p className="text-sm mt-1 break-words">{me.note}</p>}
      <p className="text-[11px] text-gray-400 mt-2">
        {t('safety_expires')} {new Date(me.expires_at).toLocaleString()}
      </p>
      {me.status === 'need_help' && (
        <BuddyPing
          compact
          message={
            me.note
              ? `Need help on NeighbourAid: ${me.note}`
              : 'I marked that I need help on NeighbourAid. Please check on me.'
          }
        />
      )}
    </div>
  )
}
