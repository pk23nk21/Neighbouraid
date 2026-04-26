import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const ToastContext = createContext(null)

let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const h = timers.current.get(id)
    if (h) {
      clearTimeout(h)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    ({ title, body, variant = 'info', ttl = 6000 }) => {
      const id = nextId++
      setToasts((prev) => [...prev, { id, title, body, variant }])
      if (ttl > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), ttl)
        )
      }
      return id
    },
    [dismiss]
  )

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[1000] flex flex-col gap-2 w-[320px] max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const VARIANT_STYLE = {
  info: 'border-gray-700 bg-gray-900/95',
  success: 'border-emerald-700 bg-emerald-950/70',
  warning: 'border-amber-600 bg-amber-950/70',
  danger: 'border-red-600 bg-red-950/70',
}

const VARIANT_ICON = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  danger: '🚨',
}

const VARIANT_BAR = {
  info: 'bg-blue-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
}

function ToastItem({ toast, onClose }) {
  return (
    <div
      role="status"
      className={`relative border rounded-xl px-4 py-3 pl-5 text-sm text-gray-100 shadow-2xl backdrop-blur pop-in overflow-hidden ${
        VARIANT_STYLE[toast.variant] ?? VARIANT_STYLE.info
      }`}
    >
      {/* Coloured side bar for fast variant identification at a glance */}
      <span
        aria-hidden
        className={`absolute left-0 top-0 bottom-0 w-1 ${VARIANT_BAR[toast.variant] ?? VARIANT_BAR.info}`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <span aria-hidden className="text-base shrink-0 mt-px">
            {VARIANT_ICON[toast.variant] ?? VARIANT_ICON.info}
          </span>
          <div className="min-w-0">
            {toast.title && <div className="font-semibold mb-0.5 truncate">{toast.title}</div>}
            {toast.body && (
              <div className="text-gray-300 text-xs leading-relaxed break-words">
                {toast.body}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-200 text-lg leading-none shrink-0 -mt-0.5"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
