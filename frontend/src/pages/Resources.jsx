import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../utils/i18n'
import api from '../utils/api'
import { apiError } from '../utils/error'
import EmptyState from '../components/EmptyState'

const KIND_META = {
  shelter:      { icon: '🏠', label: 'Shelter' },
  food:         { icon: '🍽️', label: 'Food' },
  blood:        { icon: '🩸', label: 'Blood' },
  oxygen:       { icon: '🫁', label: 'Oxygen' },
  water:        { icon: '💧', label: 'Water' },
  medical_camp: { icon: '⚕️', label: 'Medical camp' },
  other:        { icon: '📍', label: 'Other' },
}

const KINDS = Object.keys(KIND_META)

function ResourceCard({ pin, mineId, onDelete }) {
  const meta = KIND_META[pin.kind] || KIND_META.other
  const expires = pin.expires_at ? new Date(pin.expires_at) : null
  const expiresIn = expires ? Math.max(0, Math.floor((expires - Date.now()) / 60000)) : null
  const isMine = mineId && pin.owner_id === mineId
  const lat = pin.location?.coordinates?.[1]
  const lng = pin.location?.coordinates?.[0]
  const directions = lat != null && lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : null

  return (
    <li className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-white font-semibold truncate">
            <span aria-hidden className="mr-1.5">{meta.icon}</span>
            {pin.name}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5 capitalize">{meta.label}{pin.owner_name ? ` · ${pin.owner_name}` : ''}</p>
        </div>
        {expiresIn !== null && (
          <span className="text-[10px] uppercase tracking-wider text-gray-500 shrink-0">
            {expiresIn > 60 ? `${Math.floor(expiresIn / 60)}h left` : `${expiresIn}m left`}
          </span>
        )}
      </div>
      <div className="text-xs text-gray-300 mt-2 space-y-1">
        {pin.capacity != null && (
          <div><span className="text-gray-500">Capacity:</span> {pin.capacity}</div>
        )}
        {pin.contact && (
          <div><span className="text-gray-500">Contact:</span> {pin.contact}</div>
        )}
        {pin.notes && (
          <div className="text-gray-300 break-words">{pin.notes}</div>
        )}
      </div>
      <div className="flex items-center justify-between mt-3 gap-2">
        {directions ? (
          <a
            href={directions}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-300 hover:text-blue-200"
          >
            🧭 Directions
          </a>
        ) : <span />}
        {isMine && (
          <button
            onClick={() => onDelete(pin.id)}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Remove
          </button>
        )}
      </div>
    </li>
  )
}

export default function Resources() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [coords, setCoords] = useState(null)
  const [pins, setPins] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Form state
  const [kind, setKind] = useState('shelter')
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [capacity, setCapacity] = useState('')
  const [notes, setNotes] = useState('')
  const [validHours, setValidHours] = useState(24)
  const [posting, setPosting] = useState(false)

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
      const { data } = await api.get('/api/resources/near', {
        params: { lat: coords[1], lng: coords[0], km: 25 },
      })
      setPins(data)
    } catch (err) {
      setError(apiError(err, t('res_load_failed')))
    } finally {
      setLoading(false)
    }
  }, [coords, t])

  useEffect(() => {
    load()
    const id = setInterval(load, 60000)
    return () => clearInterval(id)
  }, [load])

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!user) return
    if (name.trim().length < 2) {
      setError(t('res_name_too_short'))
      return
    }
    if (!coords) {
      setError(t('res_no_location'))
      return
    }
    setPosting(true)
    setError('')
    try {
      // Re-read GPS so the pin is dropped at the user's current spot,
      // not a stale fix from page load.
      const fresh = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(coords)
        navigator.geolocation.getCurrentPosition(
          (p) => resolve([p.coords.longitude, p.coords.latitude]),
          () => resolve(coords),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        )
      })
      await api.post('/api/resources/', {
        kind,
        name: name.trim(),
        contact: contact.trim() || null,
        capacity: capacity === '' ? null : Math.max(0, parseInt(capacity, 10) || 0),
        notes: notes.trim() || null,
        location: { type: 'Point', coordinates: fresh },
        valid_for_hours: Math.min(336, Math.max(1, parseInt(validHours, 10) || 24)),
      })
      setName('')
      setContact('')
      setCapacity('')
      setNotes('')
      await load()
    } catch (err) {
      setError(apiError(err, t('res_post_failed')))
    } finally {
      setPosting(false)
    }
  }

  const onDelete = async (id) => {
    try {
      await api.delete(`/api/resources/${id}`)
      setPins((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      setError(apiError(err, t('res_delete_failed')))
    }
  }

  const filtered = useMemo(
    () => (filter === 'all' ? pins : pins.filter((p) => p.kind === filter)),
    [pins, filter]
  )

  // user.id is not part of the JWT payload we expose, so resolve "is mine"
  // via owner name match as a soft signal. Backend still enforces ownership.
  const mineMarker = user?.name || null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-5 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-white">{t('res_title')}</h1>
        <p className="text-gray-400 text-sm mt-1">{t('res_subtitle')}</p>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {user ? (
        <form
          onSubmit={onSubmit}
          className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 mb-6 space-y-3"
        >
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
            {t('res_pin_a_resource')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
                  kind === k
                    ? 'border-orange-500 bg-orange-500/15 text-orange-200'
                    : 'border-gray-700 text-gray-300 hover:border-gray-500'
                }`}
              >
                <span aria-hidden className="mr-1">{KIND_META[k].icon}</span>
                {KIND_META[k].label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('res_name_ph')}
            maxLength={120}
            required
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-orange-500"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={t('res_contact_ph')}
              maxLength={120}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-orange-500"
            />
            <input
              type="number"
              min="0"
              max="100000"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder={t('res_capacity_ph')}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-orange-500"
            />
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('res_notes_ph')}
            maxLength={500}
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-orange-500"
          />
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <label htmlFor="res-valid">{t('res_valid_for')}</label>
            <input
              id="res-valid"
              type="number"
              min="1"
              max="336"
              value={validHours}
              onChange={(e) => setValidHours(e.target.value)}
              className="w-20 bg-gray-800 border border-gray-700 text-white rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-orange-500"
            />
            <span>{t('res_hours')}</span>
          </div>
          <button
            type="submit"
            disabled={posting || !coords}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {posting ? t('res_posting') : t('res_post')}
          </button>
        </form>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 mb-6 text-sm text-gray-400">
          <a href="/login" className="text-orange-400 hover:text-orange-300">
            {t('safety_sign_in')}
          </a>{' '}
          {t('res_sign_in_to')}
        </div>
      )}

      <section>
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
            {t('res_nearby')} · {filtered.length}
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`text-[11px] px-2.5 py-1 rounded-full border ${
              filter === 'all'
                ? 'border-orange-500 bg-orange-500/15 text-orange-200'
                : 'border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            {t('res_all')}
          </button>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`text-[11px] px-2.5 py-1 rounded-full border ${
                filter === k
                  ? 'border-orange-500 bg-orange-500/15 text-orange-200'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              <span aria-hidden className="mr-1">{KIND_META[k].icon}</span>
              {KIND_META[k].label}
            </button>
          ))}
        </div>
        {loading ? (
          <p className="text-gray-500 text-sm">{t('res_loading')}</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="📭"
            title={t('res_none_yet')}
            body={t('res_none_body')}
          />
        ) : (
          <ul className="space-y-2.5">
            {filtered.map((p) => (
              <ResourceCard
                key={p.id}
                pin={p}
                mineId={mineMarker && p.owner_name === mineMarker ? p.owner_id : null}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
