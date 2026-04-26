/**
 * Tiny skeleton primitives. Use in place of "Loading…" text so the layout
 * doesn't jump when real content arrives.
 *
 * Examples:
 *   <Skeleton className="h-5 w-24" />
 *   <SkeletonCard lines={3} />
 *   <SkeletonAlertList count={3} />
 */

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function SkeletonCard({ lines = 2 }) {
  return (
    <div
      className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2"
      aria-hidden="true"
    >
      <div className="flex justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-12" />
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === 0 ? 'w-full' : 'w-4/5'}`} />
      ))}
    </div>
  )
}

export function SkeletonAlertList({ count = 3 }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading alerts">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={3} />
      ))}
    </div>
  )
}
