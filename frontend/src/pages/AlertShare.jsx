import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../utils/api'
import { apiError } from '../utils/error'

const URGENCY_BADGE = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-orange-500 text-white',
  MEDIUM: 'bg-yellow-500 text-black',
  LOW: 'bg-green-600 text-white',
}

const CATEGORY_ICON = {
  medical: '🏥',
  flood: '🌊',
  fire: '🔥',
  missing: '🔍',
  power: '⚡',
  other: '⚠️',
}

export default function AlertShare() {
  const { id } = useParams()
  const [alert, setAlert] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .get(`/api/alerts/${id}`)
      .then(({ data }) => {
        if (!cancelled) setAlert(data)
      })
      .catch((err) => {
        if (!cancelled) setError(apiError(err, 'Alert not found'))
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return <div className="text-center text-gray-500 py-20">Loading…</div>
  }

  if (error || !alert) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="text-5xl mb-4" aria-hidden>🔗</div>
        <h1 className="text-xl font-bold text-white mb-2">Alert unavailable</h1>
        <p className="text-gray-400 text-sm mb-6">{error || 'The link may have expired.'}</p>
        <Link to="/" className="text-orange-400 hover:text-orange-300">
          Go to NeighbourAid →
        </Link>
      </div>
    )
  }

  const [lng, lat] = alert.location?.coordinates ?? [0, 0]
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{CATEGORY_ICON[alert.category] ?? '⚠️'}</span>
            <span className="font-semibold capitalize text-white text-lg">{alert.category}</span>
          </div>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${URGENCY_BADGE[alert.urgency]}`}>
            {alert.urgency}
          </span>
        </div>
        <p className="text-gray-200 whitespace-pre-wrap">{alert.description}</p>
        {alert.address && (
          <p className="text-gray-500 text-sm mt-3">📍 {alert.address}</p>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            🧭 Directions
          </a>
          <a
            href="tel:112"
            className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            📞 112 Emergency
          </a>
          <Link
            to="/register"
            className="border border-orange-500 text-orange-400 hover:bg-orange-500/10 text-sm font-semibold px-4 py-2 rounded-lg"
          >
            Join NeighbourAid →
          </Link>
        </div>
      </section>

      {alert.photos?.length > 0 && (
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Photos
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {alert.photos.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`evidence ${i + 1}`}
                className="aspect-square object-cover rounded-lg border border-gray-700 bg-gray-800"
              />
            ))}
          </div>
        </section>
      )}

      <p className="text-center text-[11px] text-gray-500">
        This is a public snapshot shared from NeighbourAid. Join to witness or accept alerts.
      </p>
    </div>
  )
}
