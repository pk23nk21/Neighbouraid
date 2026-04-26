/**
 * Single source of truth for button styles. Variant + size + loading state
 * map to Tailwind classes; everything else (`onClick`, `type`, `disabled`,
 * etc.) passes through to the underlying `<button>`.
 *
 * Use this anywhere you'd otherwise hand-roll a 5-class `<button>` so the
 * focus ring, disabled opacity, hover lift, and tap target stay consistent.
 */

const VARIANTS = {
  primary:
    'bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white shadow-md shadow-orange-500/10 hover:shadow-orange-500/30',
  danger:
    'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-md shadow-red-500/10 hover:shadow-red-500/30',
  success:
    'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/30',
  secondary: 'bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white',
  ghost: 'bg-transparent hover:bg-gray-800 text-gray-300 hover:text-white',
  outline:
    'border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white bg-transparent',
}

const SIZES = {
  sm: 'text-xs px-2.5 py-1.5 rounded-lg',
  md: 'text-sm px-4 py-2 rounded-lg',
  lg: 'text-base px-6 py-3 rounded-xl',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  full = false,
  className = '',
  type = 'button',
  disabled,
  children,
  ...rest
}) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold transition-all hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500'
  const tone = VARIANTS[variant] ?? VARIANTS.primary
  const sizeCls = SIZES[size] ?? SIZES.md
  const width = full ? 'w-full' : ''
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${base} ${tone} ${sizeCls} ${width} ${className}`}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      <span>{children}</span>
    </button>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
