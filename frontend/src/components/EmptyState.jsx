/**
 * Friendly empty-state component used when a list (alerts, check-ins,
 * search results) has nothing to show. Replaces the bare "No items" text
 * with an icon + title + (optional) action so the UI doesn't look broken.
 */

export default function EmptyState({
  icon = '📭',
  title,
  body,
  action,
  className = '',
}) {
  return (
    <div
      role="status"
      className={`bg-gray-900 border border-gray-800 rounded-xl p-8 text-center ${className}`}
    >
      <div className="text-4xl mb-3" aria-hidden>
        {icon}
      </div>
      {title && <h3 className="text-base font-semibold text-gray-100 mb-1">{title}</h3>}
      {body && <p className="text-sm text-gray-500 mb-4 leading-relaxed">{body}</p>}
      {action}
    </div>
  )
}
