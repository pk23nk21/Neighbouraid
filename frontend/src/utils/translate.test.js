import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translateText, clearTranslationCache } from './translate'

beforeEach(() => {
  clearTranslationCache()
  vi.restoreAllMocks()
})

afterEach(() => {
  clearTranslationCache()
})

function mockGtxOnce(translated) {
  // gtx response shape: [[[ "translated", "original", null, null, ... ]]]
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => [[[translated, 'original', null, null, 1, null, null, []]]],
  }))
}

describe('translateText', () => {
  it('returns original input when text is empty', async () => {
    const out = await translateText('   ', 'hi')
    expect(out).toBe('   ')
  })

  it('returns original when target is missing', async () => {
    const out = await translateText('hello', '')
    expect(out).toBe('hello')
  })

  it('returns translation from gtx and caches subsequent calls', async () => {
    mockGtxOnce('नमस्ते')
    const first = await translateText('hello', 'hi')
    expect(first).toBe('नमस्ते')
    expect(global.fetch).toHaveBeenCalledTimes(1)

    // Second call must hit the cache, not the network
    const second = await translateText('hello', 'hi')
    expect(second).toBe('नमस्ते')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('falls back to the original text when gtx fails', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 503 }))
    const out = await translateText('hello there', 'hi')
    // The fallback returns the trimmed original, not an empty string
    expect(out).toBe('hello there')
  })

  it('falls back when fetch throws (network blocked)', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network error')
    })
    const out = await translateText('hello', 'hi')
    expect(out).toBe('hello')
  })

  it('persists the cache to localStorage so reloads are free', async () => {
    mockGtxOnce('नमस्ते')
    await translateText('hello', 'hi')
    // Wait a turn for the debounced LS write
    await new Promise((resolve) => setTimeout(resolve, 800))
    const raw = localStorage.getItem('neighbouraid:tx-cache')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw)
    expect(parsed['hi::hello']).toBe('नमस्ते')
  })
})
