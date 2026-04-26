/**
 * Client-side, zero-key translation via Google's public gtx endpoint. Used
 * so a reporter's native-language description stays comprehensible to a
 * volunteer viewing the feed in a different language.
 *
 * Design notes:
 *   - Results are cached in-memory AND in localStorage (keyed by text+target)
 *     so repeat views are free and translations survive page reloads.
 *   - Batched: multiple texts in a single gtx call amortise the network hop.
 *   - Best-effort: on any failure we return the original text so UI never
 *     hangs waiting on the translation service.
 */

const LS_KEY = 'neighbouraid:tx-cache'
const memCache = new Map()
let lsHydrated = false

function hydrateFromLS() {
  if (lsHydrated) return
  lsHydrated = true
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const obj = JSON.parse(raw)
    Object.entries(obj).forEach(([k, v]) => memCache.set(k, v))
  } catch {
    /* ignore corrupt cache */
  }
}

let saveTimer = null
function persistToLS() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      // Cap the persisted cache — don't let a busy feed fill localStorage.
      const entries = Array.from(memCache.entries()).slice(-1000)
      const obj = Object.fromEntries(entries)
      localStorage.setItem(LS_KEY, JSON.stringify(obj))
    } catch {
      /* quota exceeded — silently skip */
    }
  }, 750)
}

function cacheKey(text, target) {
  return `${target}::${text}`
}

async function callGtx(texts, target) {
  // gtx accepts multiple q= params. We encode each text separately so the
  // response indices line up with the input order.
  const params = new URLSearchParams()
  params.set('client', 'gtx')
  params.set('sl', 'auto')
  params.set('tl', target)
  params.set('dt', 't')
  for (const text of texts) params.append('q', text)

  const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) throw new Error(`gtx ${res.status}`)
  const data = await res.json()

  // When a single q= is sent, gtx returns a single translation in data[0].
  // When multiple q= are sent, the response structure is the concatenation;
  // the simplest robust shape-handling is to call one text at a time on
  // top of a bounded-parallelism batch. Empirically gtx doesn't batch well
  // via repeat q= so we fall back to single-text calls below.
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0].map((segment) => segment?.[0] ?? '').join('')
  }
  return ''
}

export async function translateText(text, target) {
  hydrateFromLS()
  if (!text || !target) return text
  const trimmed = text.trim()
  if (!trimmed) return text

  const key = cacheKey(trimmed, target)
  if (memCache.has(key)) return memCache.get(key)

  try {
    const out = (await callGtx([trimmed], target)) || trimmed
    memCache.set(key, out)
    persistToLS()
    return out
  } catch {
    memCache.set(key, trimmed)
    return trimmed
  }
}

/**
 * Translate many texts in parallel (bounded concurrency). Preserves order,
 * and returns the original for any failed entry. Good for translating a
 * whole list of alert descriptions at once.
 */
export async function translateMany(texts, target, concurrency = 4) {
  hydrateFromLS()
  if (!target || !Array.isArray(texts) || texts.length === 0) return texts.slice()
  const results = new Array(texts.length)
  let cursor = 0
  async function worker() {
    while (cursor < texts.length) {
      const i = cursor++
      results[i] = await translateText(texts[i], target)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, texts.length) }, worker)
  )
  return results
}

export function clearTranslationCache() {
  memCache.clear()
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}
