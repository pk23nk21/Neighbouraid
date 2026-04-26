import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../utils/i18n'

const navLink = ({ isActive }) =>
  `transition-colors ${isActive ? 'text-white' : 'text-gray-400 hover:text-white'}`

function LanguageMenu() {
  const { lang, setLang, languages } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = languages.find((l) => l.code === lang) ?? languages[0]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs border border-gray-700 hover:border-gray-500 text-gray-300 px-2 py-1 rounded-md transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change language"
        title="Change language"
      >
        <span aria-hidden>🌐</span>
        <span>{current.short}</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-1 w-36 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-50 overflow-hidden"
        >
          {languages.map((l) => (
            <li key={l.code}>
              <button
                role="option"
                aria-selected={l.code === lang}
                onClick={() => {
                  setLang(l.code)
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  l.code === lang
                    ? 'bg-orange-500/20 text-orange-300'
                    : 'text-gray-200 hover:bg-gray-800'
                }`}
              >
                {l.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Navbar() {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    setMenuOpen(false)
    navigate('/')
  }

  const closeMenu = () => setMenuOpen(false)

  return (
    <nav className="sticky top-0 z-40 bg-gray-900/90 backdrop-blur border-b border-gray-800">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
        <Link
          to="/"
          onClick={closeMenu}
          className="flex items-center gap-2 text-lg sm:text-xl font-bold text-orange-400 tracking-tight"
        >
          <span aria-hidden>🛟</span>
          <span>NeighbourAid</span>
        </Link>

        <div className="hidden md:flex items-center gap-4 text-sm">
          <NavLink to="/map" className={navLink}>
            {t('nav_map')}
          </NavLink>
          <NavLink to="/safety" className={navLink}>
            {t('nav_safety')}
          </NavLink>
          <NavLink to="/resources" className={navLink}>
            {t('nav_resources')}
          </NavLink>

          {!user ? (
            <>
              <NavLink to="/login" className={navLink}>
                {t('nav_login')}
              </NavLink>
              <Link
                to="/register"
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-1.5 rounded-lg transition-colors"
              >
                {t('nav_join')}
              </Link>
            </>
          ) : (
            <>
              {user.role === 'reporter' && (
                <>
                  <NavLink to="/my-alerts" className={navLink}>
                    {t('nav_my_alerts')}
                  </NavLink>
                  <Link
                    to="/post-alert"
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg transition-colors"
                  >
                    {t('nav_report')}
                  </Link>
                </>
              )}
              {user.role === 'volunteer' && (
                <Link
                  to="/volunteer"
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg transition-colors"
                >
                  {t('nav_volunteer')}
                </Link>
              )}
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `transition-colors ${
                    isActive ? 'text-white' : 'text-gray-400 hover:text-white'
                  }`
                }
              >
                {user.name || t('nav_profile')}{' '}
                <span className="text-gray-600">·</span>{' '}
                <span className="capitalize text-gray-300">{user.role}</span>
              </NavLink>
              <button
                onClick={handleLogout}
                className="text-gray-400 hover:text-red-400 transition-colors"
              >
                {t('nav_logout')}
              </button>
            </>
          )}

          <LanguageMenu />
        </div>

        <div className="flex md:hidden items-center gap-2">
          <LanguageMenu />
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="text-gray-300 hover:text-white p-2 -mr-2"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="7" x2="21" y2="7" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="17" x2="21" y2="17" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-gray-800 px-4 py-3 space-y-1 text-sm bg-gray-900/95 backdrop-blur">
          <NavLink onClick={closeMenu} to="/map" className={({ isActive }) => `block px-2 py-2 rounded-lg ${isActive ? 'bg-gray-800 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
            {t('nav_map')}
          </NavLink>
          <NavLink onClick={closeMenu} to="/safety" className={({ isActive }) => `block px-2 py-2 rounded-lg ${isActive ? 'bg-gray-800 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
            {t('nav_safety')}
          </NavLink>
          <NavLink onClick={closeMenu} to="/resources" className={({ isActive }) => `block px-2 py-2 rounded-lg ${isActive ? 'bg-gray-800 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
            {t('nav_resources')}
          </NavLink>
          {!user ? (
            <>
              <NavLink onClick={closeMenu} to="/login" className={({ isActive }) => `block px-2 py-2 rounded-lg ${isActive ? 'bg-gray-800 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
                {t('nav_login')}
              </NavLink>
              <Link onClick={closeMenu} to="/register" className="block px-2 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-center font-semibold">
                {t('nav_join')}
              </Link>
            </>
          ) : (
            <>
              {user.role === 'reporter' && (
                <>
                  <NavLink onClick={closeMenu} to="/my-alerts" className={({ isActive }) => `block px-2 py-2 rounded-lg ${isActive ? 'bg-gray-800 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
                    {t('nav_my_alerts')}
                  </NavLink>
                  <Link onClick={closeMenu} to="/post-alert" className="block px-2 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-center font-semibold">
                    {t('nav_report')}
                  </Link>
                </>
              )}
              {user.role === 'volunteer' && (
                <Link onClick={closeMenu} to="/volunteer" className="block px-2 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-center font-semibold">
                  {t('nav_volunteer')}
                </Link>
              )}
              <NavLink onClick={closeMenu} to="/profile" className={({ isActive }) => `block px-2 py-2 rounded-lg ${isActive ? 'bg-gray-800 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
                {user.name || t('nav_profile')}{' '}
                <span className="text-gray-600">·</span>{' '}
                <span className="capitalize text-gray-400">{user.role}</span>
              </NavLink>
              <button
                onClick={handleLogout}
                className="w-full text-left px-2 py-2 rounded-lg text-red-400 hover:bg-gray-800"
              >
                {t('nav_logout')}
              </button>
            </>
          )}
        </div>
      )}
    </nav>
  )
}
