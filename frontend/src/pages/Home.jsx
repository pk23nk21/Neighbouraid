import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../utils/i18n'
import api from '../utils/api'
import QuickSOS from '../components/QuickSOS'

export default function Home() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [stats, setStats] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [news, setNews] = useState([])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      // Skip background polling when the tab is hidden — saves battery and
      // bandwidth, especially useful on mobile. Data refreshes when the
      // user comes back to the tab (visibilitychange handler below).
      if (document.visibilityState === 'hidden') return
      api
        .get('/api/stats/')
        .then(({ data }) => !cancelled && setStats(data))
        .catch(() => {})
      api
        .get('/api/stats/leaderboard', { params: { limit: 5, days: 30 } })
        .then(({ data }) => !cancelled && setLeaderboard(data.top || []))
        .catch(() => {})
      api
        .get('/api/news/recent')
        .then(({ data }) => !cancelled && setNews((data.items || []).slice(0, 6)))
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 60000)
    const onVis = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const urgencyLevels = [
    { level: 'CRITICAL', color: 'bg-red-600', example: t('urgency_example_critical') },
    { level: 'HIGH', color: 'bg-orange-500', example: t('urgency_example_high') },
    { level: 'MEDIUM', color: 'bg-yellow-500', example: t('urgency_example_medium') },
    { level: 'LOW', color: 'bg-green-600', example: t('urgency_example_low') },
  ]

  // CTA shape varies by role; consolidating here keeps the hero JSX clean.
  const heroPrimary = !user
    ? { to: '/register', label: t('home_cta_join'), tone: 'from-orange-500 to-orange-600 hover:to-orange-500' }
    : user.role === 'reporter'
    ? { to: '/post-alert', label: t('home_cta_report'), tone: 'from-red-600 to-red-700 hover:to-red-500' }
    : { to: '/volunteer', label: t('home_cta_volunteer'), tone: 'from-green-600 to-green-700 hover:to-green-500' }

  return (
    <div className="min-h-screen bg-gray-950">
      <QuickSOS />
      {/* Hero */}
      <section className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-10 sm:pt-20 pb-10 sm:pb-16 text-center overflow-hidden">
        {/* Soft accent glow behind the title */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-72 max-w-md rounded-full bg-orange-500/10 blur-3xl"
        />
        <div className="inline-flex items-center gap-2 bg-orange-500/15 text-orange-300 text-[11px] sm:text-xs font-semibold px-3 py-1 rounded-full mb-4 sm:mb-6 uppercase tracking-widest border border-orange-500/30 fade-in">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-400" />
          </span>
          {t('home_badge')}
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-white mb-4 sm:mb-6 leading-tight tracking-tight">
          {t('home_title_1')}
          <br />
          <span className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">
            {t('home_title_2')}
          </span>
        </h1>
        <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto mb-8 sm:mb-10 px-2 leading-relaxed">
          {t('home_subtitle')}
        </p>

        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 sm:gap-4">
          <Link
            to={heroPrimary.to}
            className={`bg-gradient-to-r ${heroPrimary.tone} text-white font-semibold px-6 sm:px-8 py-3 rounded-xl transition-all shadow-lg shadow-orange-500/10 hover:shadow-orange-500/30 hover:-translate-y-0.5`}
          >
            {heroPrimary.label}
          </Link>
          <Link
            to="/map"
            className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-semibold px-6 sm:px-8 py-3 rounded-xl transition-all hover:-translate-y-0.5"
          >
            {t('home_cta_map')}
          </Link>
        </div>
      </section>

      {/* Live stats */}
      {stats && (
        <section className="max-w-4xl mx-auto px-4 sm:px-6 -mt-4 sm:-mt-8 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <StatTile value={stats.active_alerts} label={t('home_stats_active')} />
            <StatTile value={stats.critical_open} label={t('home_stats_critical')} accent="text-red-400" />
            <StatTile value={stats.last_24h} label={t('home_stats_24h')} />
            <StatTile
              value={stats.volunteers_online ?? '—'}
              label={t('home_stats_volunteers')}
              accent="text-emerald-400"
            />
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-6 sm:mb-8 text-center">{t('home_how_title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {[
            { step: '1', title: t('home_how_1_title'), desc: t('home_how_1_desc') },
            { step: '2', title: t('home_how_2_title'), desc: t('home_how_2_desc') },
            { step: '3', title: t('home_how_3_title'), desc: t('home_how_3_desc') },
          ].map(({ step, title, desc }) => (
            <div
              key={step}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 sm:p-6 card-hoverable"
            >
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-orange-500/15 text-orange-400 text-xl font-black mb-3">
                {step}
              </div>
              <h3 className="font-semibold text-white mb-2">{title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6 text-center">
            {t('home_leaderboard_title')}{' '}
            <span className="text-gray-500 text-base font-normal block sm:inline">· {t('home_leaderboard_since')}</span>
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800 overflow-hidden">
            {leaderboard.map((v, i) => {
              const trust = v.trust
              const trustStyle =
                trust?.label === 'trusted'
                  ? 'bg-emerald-900/40 text-emerald-300 border-emerald-800'
                  : trust?.label === 'reliable'
                  ? 'bg-blue-900/40 text-blue-300 border-blue-800'
                  : trust?.label === 'new'
                  ? 'bg-gray-800 text-gray-300 border-gray-700'
                  : 'bg-amber-900/40 text-amber-300 border-amber-800'
              return (
                <div
                  key={`${v.name}-${i}`}
                  className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-gray-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg font-black text-orange-400 w-7 text-center shrink-0">
                      {['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`}
                    </span>
                    <span className="text-gray-200 truncate">{v.name}</span>
                    {trust && (
                      <span
                        className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full border ${trustStyle} hidden sm:inline`}
                        title={`${trust.resolved}/${trust.accepted} accepted alerts resolved · trust ${trust.score}`}
                      >
                        {trust.label}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-gray-400 whitespace-nowrap tabular-nums">
                    {v.resolved} {t('home_leaderboard_resolved')}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Crisis news feed */}
      {news.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 text-center">
            {t('home_news_title')}
          </h2>
          <p className="text-gray-500 text-xs sm:text-sm text-center mb-4 sm:mb-6 px-2">
            {t('home_news_subtitle')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {news.map((n) => {
              const trust = n.trust || 'unverified'
              const score = typeof n.authenticity_score === 'number' ? n.authenticity_score : null
              const trustStyle =
                trust === 'verified'
                  ? 'bg-emerald-900/50 border-emerald-700 text-emerald-300'
                  : trust === 'reputable'
                  ? 'bg-blue-900/40 border-blue-700 text-blue-300'
                  : trust === 'unverified'
                  ? 'bg-yellow-900/40 border-yellow-700 text-yellow-300'
                  : 'bg-red-900/40 border-red-700 text-red-300'
              const trustIcon =
                trust === 'verified' ? '✓' : trust === 'reputable' ? '✓' : '⚠'
              const topic = n.topic || 'other'
              const topicColor =
                topic === 'fire'
                  ? 'bg-orange-900/40 text-orange-300 border-orange-800'
                  : topic === 'flood'
                  ? 'bg-blue-900/40 text-blue-300 border-blue-800'
                  : topic === 'earthquake'
                  ? 'bg-purple-900/40 text-purple-300 border-purple-800'
                  : topic === 'accident'
                  ? 'bg-red-900/40 text-red-300 border-red-800'
                  : topic === 'medical'
                  ? 'bg-emerald-900/40 text-emerald-300 border-emerald-800'
                  : topic === 'power'
                  ? 'bg-yellow-900/40 text-yellow-300 border-yellow-800'
                  : topic === 'missing'
                  ? 'bg-pink-900/40 text-pink-300 border-pink-800'
                  : topic === 'rescue'
                  ? 'bg-teal-900/40 text-teal-300 border-teal-800'
                  : 'bg-gray-800 text-gray-300 border-gray-700'
              return (
                <a
                  key={n.link}
                  href={n.link}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-gray-900 border border-gray-800 rounded-xl p-4 block card-hoverable"
                >
                  <div className="flex items-center gap-2 flex-wrap text-[11px] mb-2">
                    <span className={`px-1.5 py-0.5 rounded-full border uppercase font-semibold ${topicColor}`}>
                      {topic}
                    </span>
                    <span className="uppercase tracking-wider text-gray-500 truncate">
                      {n.source}
                    </span>
                    <span
                      className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${trustStyle} whitespace-nowrap flex items-center gap-1`}
                      title={
                        n.domain_match
                          ? `Link resolves to ${n.domain}`
                          : `Link points outside ${n.domain || 'source'}`
                      }
                    >
                      <span>{trustIcon}</span>
                      <span className="capitalize">{trust}</span>
                      {score != null && <span className="opacity-70">· {score}</span>}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-100 line-clamp-2 mb-1">
                    {n.title}
                  </h3>
                  {n.summary && (
                    <p className="text-xs text-gray-400 line-clamp-2">{n.summary}</p>
                  )}
                </a>
              )
            })}
          </div>
        </section>
      )}

      {/* Urgency levels */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-6 sm:mb-8 text-center">{t('home_urgency_title')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {urgencyLevels.map(({ level, color, example }) => (
            <div
              key={level}
              className="flex items-center gap-3 sm:gap-4 bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4 card-hoverable"
            >
              <div
                className={`${color} text-white text-xs font-bold px-3 py-1.5 rounded-lg min-w-[80px] text-center shrink-0 shadow-md`}
              >
                {level}
              </div>
              <p className="text-gray-300 text-sm leading-relaxed">{example}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function StatTile({ value, label, accent = 'text-orange-400' }) {
  return (
    <div className="bg-gray-900/80 backdrop-blur border border-gray-800 rounded-xl py-3 px-3 sm:px-4 text-center card-hoverable">
      <div className={`text-xl sm:text-2xl font-bold tabular-nums ${accent}`}>{value}</div>
      <div className="text-[10px] sm:text-[11px] text-gray-500 uppercase tracking-widest mt-0.5">
        {label}
      </div>
    </div>
  )
}
