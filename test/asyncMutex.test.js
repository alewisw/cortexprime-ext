import { describe, expect, it } from 'vitest'
import { runExclusive } from '../module/scripts/asyncMutex.js'

// A controllable async step: doesn't resolve until release() is called, so tests can pin down
// exactly which operation is "in flight" at any point without relying on timing/sleeps.
const deferred = () => {
  let release
  const promise = new Promise(resolve => { release = resolve })
  return { promise, release }
}

describe('runExclusive', () => {
  it('runs a single call\'s fn and returns its result', async () => {
    const result = await runExclusive('k', async () => 42)

    expect(result).toBe(42)
  })

  it('serializes two calls under the same key - the second never starts before the first resolves', async () => {
    const order = []
    const first = deferred()

    const runA = runExclusive('same-key', async () => {
      order.push('A start')
      await first.promise
      order.push('A end')
      return 'A'
    })

    const runB = runExclusive('same-key', async () => {
      order.push('B start')
      return 'B'
    })

    // B is queued behind A - nothing from B should have run yet.
    await Promise.resolve()
    await Promise.resolve()
    expect(order).toEqual(['A start'])

    first.release()

    expect(await runA).toBe('A')
    expect(await runB).toBe('B')
    expect(order).toEqual(['A start', 'A end', 'B start'])
  })

  it('lets calls under different keys run concurrently, not queued behind each other', async () => {
    const order = []
    const first = deferred()

    const runA = runExclusive('key-a', async () => {
      order.push('A start')
      await first.promise
      order.push('A end')
    })

    const runB = runExclusive('key-b', async () => {
      order.push('B start')
    })

    await runB
    // B (a different key) completed without waiting on A at all.
    expect(order).toEqual(['A start', 'B start'])

    first.release()
    await runA
    expect(order).toEqual(['A start', 'B start', 'A end'])
  })

  it('a failing call does not block later calls queued behind it under the same key', async () => {
    const runA = runExclusive('k', async () => { throw new Error('boom') })
    const runB = runExclusive('k', async () => 'B ran anyway')

    await expect(runA).rejects.toThrow('boom')
    await expect(runB).resolves.toBe('B ran anyway')
  })

  it('preserves call order under the same key across several queued calls', async () => {
    const order = []
    const calls = [1, 2, 3, 4, 5].map(n =>
      runExclusive('ordering', async () => { order.push(n) }))

    await Promise.all(calls)

    expect(order).toEqual([1, 2, 3, 4, 5])
  })

  it('the classic lost-update shape this exists to prevent: both read-modify-writes survive intact', async () => {
    // Two "handlers" each read a shared object, add their own entry, and write back the WHOLE
    // object - the exact shape of every dicePool/activeChallenge handler in this codebase. Run
    // outside a mutex, a fast second call finishing while a slow first call is still mid-flight
    // would read a base that doesn't include the slow call's eventual write, and clobber it.
    // Queuing both under the same key forces them to run one at a time instead, so there's no
    // window left for that to happen - both entries always survive, regardless of which was
    // "slower".
    let store = { entries: [] }
    const readAdd = release => runExclusive('store', async () => {
      const current = store
      if (release) await release
      store = { entries: [...current.entries, release ? 'slow' : 'fast'] }
    })

    const first = deferred()
    const slow = readAdd(first.promise)
    const fast = readAdd(null)

    // fast is queued strictly behind slow (same key), so it can never resolve before slow does -
    // release slow's gate first, then let both settle in their real, serialized order.
    first.release()

    await slow
    await fast

    expect(store.entries).toEqual(['slow', 'fast'])
  })
})
