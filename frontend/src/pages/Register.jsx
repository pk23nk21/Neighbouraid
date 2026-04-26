import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../utils/i18n'
import { apiError } from '../utils/error'
import { SkillsPicker, VehicleToggle } from '../components/ProfileFields'

export default function Register() {
  const { register } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'reporter',
    location: { type: 'Point', coordinates: [76.7794, 30.7333] },
    skills: [],
    has_vehicle: false,
    emergency_contacts: [],
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [locLoading, setLocLoading] = useState(false)

  const detectLocation = () => {
    if (!navigator.geolocation) return
    setLocLoading(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setForm((f) => ({
          ...f,
          location: { type: 'Point', coordinates: [coords.longitude, coords.latitude] },
        }))
        setLocLoading(false)
      },
      () => setLocLoading(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Only volunteers need skills/vehicle — reporters skip those fields.
      const payload =
        form.role === 'volunteer'
          ? form
          : { ...form, skills: [], has_vehicle: false }
      await register(payload)
      navigate(form.role === 'volunteer' ? '/volunteer' : '/')
    } catch (err) {
      setError(apiError(err, t('register_failed')))
    } finally {
      setLoading(false)
    }
  }

  const [lng, lat] = form.location.coordinates

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-2">{t('register_title')}</h1>
        <p className="text-gray-400 text-sm mb-6 sm:mb-8">{t('register_subtitle')}</p>

        {error && (
          <div className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">{t('register_name')}</label>
            <input
              required
              autoComplete="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-orange-500 transition-colors text-base"
              placeholder="Parth Kansal"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">{t('login_email')}</label>
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-orange-500 transition-colors text-base"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">{t('login_password')}</label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-orange-500 transition-colors text-base"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">{t('register_want_to')}</label>
            <div className="grid grid-cols-2 gap-3">
              {['reporter', 'volunteer'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm({ ...form, role: r })}
                  className={`py-3 rounded-xl border font-semibold capitalize transition-colors text-sm sm:text-base ${
                    form.role === r
                      ? 'border-orange-500 bg-orange-500/20 text-orange-400'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {r === 'reporter' ? `🚨 ${t('register_role_reporter')}` : `🤝 ${t('register_role_volunteer')}`}
                </button>
              ))}
            </div>
          </div>

          {form.role === 'volunteer' && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  Skills <span className="text-gray-600 text-xs">· helps route the right alerts to you</span>
                </label>
                <SkillsPicker
                  value={form.skills}
                  onChange={(skills) => setForm((f) => ({ ...f, skills }))}
                />
              </div>
              <VehicleToggle
                value={form.has_vehicle}
                onChange={(has_vehicle) => setForm((f) => ({ ...f, has_vehicle }))}
              />
            </>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">{t('register_location')}</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={`${lat.toFixed(4)}, ${lng.toFixed(4)}`}
                className="flex-1 min-w-0 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 sm:px-4 py-2.5 text-sm"
              />
              <button
                type="button"
                onClick={detectLocation}
                disabled={locLoading}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {locLoading ? t('register_detecting') : t('register_detect')}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? t('register_submitting') : t('register_submit')}
          </button>
        </form>

        <p className="text-center text-gray-500 text-sm mt-6">
          {t('register_have_account')}{' '}
          <Link to="/login" className="text-orange-400 hover:text-orange-300">
            {t('register_sign_in')}
          </Link>
        </p>
      </div>
    </div>
  )
}
