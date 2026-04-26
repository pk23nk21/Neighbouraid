import { afterEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  bumpAttempts,
  enqueueAlert,
  flushQueue,
  listPending,
  removePending,
} from './offlineQueue'

afterEach(async () => {
  // Reset the IDB between tests so leftover rows don't pollute the next run
  const pending = await listPending()
  for (const row of pending) await removePending(row.id)
})

describe('offlineQueue', () => {
  it('enqueues a payload and lists it back', async () => {
    const payload = { description: 'help', category: 'medical' }
    await enqueueAlert(payload)
    const pending = await listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0].payload).toEqual(payload)
    expect(pending[0].attempts).toBe(0)
  })

  it('removePending deletes an entry by id', async () => {
    await enqueueAlert({ description: 'one' })
    const before = await listPending()
    await removePending(before[0].id)
    expect(await listPending()).toHaveLength(0)
  })

  it('bumpAttempts increments the per-row counter', async () => {
    await enqueueAlert({ description: 'x' })
    const [row] = await listPending()
    await bumpAttempts(row.id)
    await bumpAttempts(row.id)
    const [updated] = await listPending()
    expect(updated.attempts).toBe(2)
  })

  it('flushQueue posts each pending alert and removes them on success', async () => {
    await enqueueAlert({ description: 'a' })
    await enqueueAlert({ description: 'b' })
    const post = vi.fn(async () => ({ ok: true }))
    const result = await flushQueue(post)
    expect(post).toHaveBeenCalledTimes(2)
    expect(result.sent).toBe(2)
    expect(result.failed).toBe(0)
    expect(await listPending()).toHaveLength(0)
  })

  it('flushQueue retries failures by leaving the row in place and bumping attempts', async () => {
    await enqueueAlert({ description: 'fails' })
    const post = vi.fn(async () => {
      throw new Error('network')
    })
    const result = await flushQueue(post)
    expect(result.sent).toBe(0)
    expect(result.failed).toBe(1)
    const remaining = await listPending()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].attempts).toBe(1)
  })

  it('flushQueue drops a row that has failed >= 10 times to avoid a stuck queue', async () => {
    await enqueueAlert({ description: 'poison' })
    const [row] = await listPending()
    // Pre-bump to 10 attempts
    for (let i = 0; i < 10; i += 1) await bumpAttempts(row.id)
    const post = vi.fn(async () => {
      throw new Error('still broken')
    })
    await flushQueue(post)
    expect(await listPending()).toHaveLength(0)
  })
})
