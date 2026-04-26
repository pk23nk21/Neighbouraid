import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../utils/api'
import { apiError } from '../utils/error'
import { useI18n } from '../utils/i18n'
import { SkeletonAlertList } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import ResponderTracker from '../components/ResponderTracker'

const URGENCY_BADGE = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-orange-500 text-white',
  MEDIUM: 'bg-yellow-500 text-black',
  LOW: 'bg-green-600 text-white',
}

const STATUS_BADGE = {
  open: 'bg-blue-900 text-blue-300',
  accepted: 'bg-purple-900 text-purple-300',
  resolved: 'bg-gray-800 text-gray-400',
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

function AlertRow({ a, onCancel, cancelling }) {
  const { t } = useI18n()
  const ago = useTimeAgo(a.created_at)
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold capitalize text-white">{t(`cat_${a.category}`) ?? a.category}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${URGENCY_BADGE[a.urgency]}`}>
            {a.urgency}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[a.status]}`}>
            {a.status}
          </span>
        </div>
        <span className="text-xs text-gray-500 shrink-0">{ago}</span>
      </div>
      <p className="text-gray-300 text-sm break-words">{a.description}</p>
      {a.address && (
        <p className="text-gray-500 text-xs mt-1.5 flex gap-1">
          <span aria-hidden className="shrink-0">📍</span>
          <span className="line-clamp-1">{a.address}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2 sm:gap-3 mt-2 text-[11px] text-gray-500">
        <span>Verified {a.verified_score ?? 0}/100</span>
        <span>
          👥 {a.witnesses ?? 1}{' '}
          {(a.witnesses ?? 1) !== 1 ? t('card_witness_many') : t('card_witness_one')}
        </span>
        {a.corroborating_ids?.length ? (
          <span>🔗 {a.corroborating_ids.length} {t('card_similar_nearby')}</span>
        ) : null}
        {a.weather_match ? <span>🌦 {t('card_weather_match')}</span> : null}
      </div>
      {a.status === 'open' && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => onCancel(a.id)}
            disabled={cancelling}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            {cancelling ? t('mine_cancelling') : t('mine_cancel')}
          </button>
        </div>
      )}
      {a.status === 'accepted' && <ResponderTracker alert={a} />}
    </div>
  )
}

export default function MyAlerts() {
  const { t } = useI18n()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/alerts/mine')
      setAlerts(data)
      setError('')
    } catch (err) {
      setError(apiError(err, t('mine_load_failed')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  const cancel = async (id) => {
    setCancelling(id)
    try {
      await api.delete(`/api/alerts/${id}`)
      setAlerts((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      setError(apiError(err, t('mine_cancel_failed')))
    } finally {
      setCancelling(null)
    }
  }

  const groups = {
    open: alerts.filter((a) => a.status === 'open'),
    accepted: alerts.filter((a) => a.status === 'accepted'),
    resolved: alerts.filter((a) => a.status === 'resolved'),
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center justify-between mb-5 sm:mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white">{t('mine_title')}</h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">
            {alerts.length} {t('mine_summary')} · {groups.open.length} {t('mine_open')} · {groups.accepted.length} {t('mine_in_progress')}
          </p>
        </div>
        <Link
          to="/post-alert"
          className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-3 sm:px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
        >
          {t('mine_new')}
        </Link>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonAlertList count={3} />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon="🚨"
          title={t('mine_empty')}
          action={
            <Link
              to="/post-alert"
              className="inline-block bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {t('mine_post_first')}
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <AlertRow
              key={a.id}
              a={a}
              onCancel={cancel}
              cancelling={cancelling === a.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
