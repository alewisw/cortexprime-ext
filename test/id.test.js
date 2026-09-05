import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The shape newId() promises: `_` + an 8-char base36 stamp + `-` + 3 base36 random chars.
const NEW_ID = /^_[0-9a-z]{8}-[0-9a-z]{3}$/
// What every id minted before this helper looked like: `_${Date.now()}`.
const LEGACY_ID = /^_\d+$/

// A real millisecond value (an id from configs/mage.json), so the base36 stamp is the 8 chars it
// will be for the next 30-odd years. It is in the past, which is exactly why each test needs a
// cold module below: lib/id.js's stamp only ever moves forwards, so a test freezing the clock here
// after another test has run against the real clock would otherwise see the real clock's stamps.
const NOW = 1787047140985

const stampOf = id => parseInt(id.slice(1).split('-')[0], 36)

// A fresh module instance per test - the equivalent of a client that has just loaded the world,
// with lastStamp back at 0. Tests are then free to put the clock wherever they like.
let newId

beforeEach(async () => {
  vi.resetModules()
  ;({ newId } = await import('../lib/id.js'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('newId', () => {
  it('mints the documented shape', () => {
    expect(newId()).toMatch(NEW_ID)
  })

  it('can never be mistaken for a legacy `_${Date.now()}` id', () => {
    const ids = Array.from({ length: 100 }, () => newId())

    for (const id of ids) {
      expect(id).not.toMatch(LEGACY_ID)
      expect(id).toContain('-')
    }
  })

  it('stays within a character of the legacy id length', () => {
    expect(Math.abs(newId().length - `_${NOW}`.length)).toBeLessThanOrEqual(1)
  })

  // The reason this helper exists.
  it('never repeats, however tightly the allocations are packed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    const ids = Array.from({ length: 10000 }, () => newId())

    expect(new Set(ids).size).toBe(10000)
  })

  it('is a real fix: the scheme it replaces collides under exactly that clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    const legacyIds = Array.from({ length: 10000 }, () => `_${Date.now()}`)

    expect(new Set(legacyIds).size).toBe(1)
  })

  it('advances the stamp on every call, not just when the clock moves', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    const stamps = Array.from({ length: 5 }, () => stampOf(newId()))

    expect(stamps).toEqual([NOW, NOW + 1, NOW + 2, NOW + 3, NOW + 4])
  })

  it('settles back onto the real clock once it catches up', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    Array.from({ length: 5 }, () => newId())

    // Past the five stamps just borrowed, so the clock leads again.
    vi.setSystemTime(NOW + 100)

    expect(stampOf(newId())).toBe(NOW + 100)
  })

  it('keeps increasing even if the clock jumps backwards', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    const before = stampOf(newId())

    vi.setSystemTime(NOW - 60000)

    expect(stampOf(newId())).toBe(before + 1)
  })

  it('pads the random block to three characters at both ends of its range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(newId().split('-')[1]).toBe('000')

    vi.spyOn(Math, 'random').mockReturnValue(0.9999999)
    expect(newId().split('-')[1]).toBe('zzz')
  })

  it('cannot collide with ids already in the wild', () => {
    // Real values: defaultActorTypes.js literals, a configs/mage.json id, and a migration id.
    const existing = ['_1', '_2', '_11', '_13', '_21', '_111', '_1787047140985', '_notes-_1785237793018']

    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    const minted = new Set(Array.from({ length: 1000 }, () => newId()))

    for (const id of existing) {
      expect(minted.has(id)).toBe(false)
      expect(id).not.toMatch(NEW_ID)
    }
  })
})
