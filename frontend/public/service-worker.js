/* NeighbourAid service worker
 *
 * Minimal offline strategy:
 *   - Pre-cache the shell on install.
 *   - Cache-first for static assets (/assets/...).
 *   - Network-first for API + WS (never cache live crisis data stale).
 *
 * Also handles `notificationclick` so a volunteer tapping a background
 * alert notification is routed straight to /volunteer (or the specific
 * alert if a URL was provided in the notification payload). Surviving
 * reloads is why we push through the SW instead of `new Notification()`.
 */

const CACHE = 'neighbouraid-v2'
const CORE = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE).catch(() => undefined))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Never cache API or WebSocket calls — they must be fresh.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return

  // Same-origin static assets: cache-first.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(req, clone))
            return res
          })
      )
    )
    return
  }

  // Shell / navigations: network-first, falling back to cached index.html.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    )
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  // Prefer the alert's share URL when one was supplied in the payload, so
  // volunteers land directly on the alert. Otherwise open the volunteer feed.
  const target = data.url || (data.alertId ? `/alert/${data.alertId}` : '/volunteer')
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url)
          if (clientUrl.origin === self.location.origin) {
            await client.focus()
            client.postMessage({ type: 'notification-click', target, data })
            return
          }
        } catch {
          /* ignore bad URLs */
        }
      }
      await self.clients.openWindow(target)
    })()
  )
})
