import { describe, expect, it } from 'vitest'
import {
  getLength,
  indexObjectValues,
  isArray,
  isObject,
  objectEvery,
  objectFilter,
  objectFindEntry,
  objectFindKey,
  objectFindValue,
  objectForEach,
  objectIncludes,
  objectIncludesKey,
  objectMap,
  objectMapKeys,
  objectMapValues,
  objectReduce,
  objectReindexFilter,
  objectSome,
  objectSort,
  resetDataObject
} from '../lib/helpers.js'

describe('isArray', () => {
  it('is true for arrays only', () => {
    expect(isArray([])).toBe(true)
    expect(isArray([1, 2])).toBe(true)
    expect(isArray({})).toBe(false)
    expect(isArray('abc')).toBe(false)
  })

  // Guard clause is `arr && ...`, so falsy inputs short-circuit and the operand itself comes
  // back rather than `false`. Every caller uses it in a boolean position, so this is harmless
  // today - pinned so a `=== false` comparison somewhere can't silently start failing.
  it('returns the falsy operand rather than false for nullish/zero input', () => {
    expect(isArray(null)).toBe(null)
    expect(isArray(undefined)).toBe(undefined)
    expect(isArray(0)).toBe(0)
  })
})

describe('isObject', () => {
  it('is true for plain objects, false for arrays', () => {
    expect(isObject({})).toBe(true)
    expect(isObject({ a: 1 })).toBe(true)
    expect(isObject([])).toBe(false)
  })

  it('is falsy for primitives and nullish input', () => {
    expect(isObject(null)).toBe(null)
    expect(isObject('abc')).toBeFalsy()
    expect(isObject(7)).toBeFalsy()
  })
})

describe('getLength', () => {
  it('counts array entries', () => {
    expect(getLength([])).toBe(0)
    expect(getLength(['a', 'b'])).toBe(2)
  })

  it('counts object keys', () => {
    expect(getLength({})).toBe(0)
    expect(getLength({ 0: 'a', 1: 'b' })).toBe(2)
  })

  // Load-bearing: objectReindexFilter uses getLength(acc) as the next index, and the sheet
  // code calls getLength on trait dice maps that may not exist yet.
  it('treats nullish as empty, not as an error', () => {
    expect(getLength(null)).toBe(0)
    expect(getLength(undefined)).toBe(0)
  })

  it('returns -1 for anything that is not an array or object', () => {
    expect(getLength(5)).toBe(-1)
    expect(getLength(0)).toBe(-1)
    expect(getLength('abc')).toBe(-1)
    expect(getLength('')).toBe(-1)
  })
})

describe('indexObjectValues', () => {
  it('rekeys values onto dense 0..n indices, preserving key order', () => {
    expect(indexObjectValues({ x: 'a', y: 'b' })).toEqual({ 0: 'a', 1: 'b' })
  })

  it('collapses sparse numeric keys', () => {
    expect(indexObjectValues({ 0: 'a', 5: 'b', 9: 'c' })).toEqual({ 0: 'a', 1: 'b', 2: 'c' })
  })

  it('returns an empty object for an empty input', () => {
    expect(indexObjectValues({})).toEqual({})
  })
})

describe('objectFilter', () => {
  it('keeps entries under their original keys', () => {
    expect(objectFilter({ 0: 'a', 1: 'b', 2: 'c' }, value => value !== 'b'))
      .toEqual({ 0: 'a', 2: 'c' })
  })

  it('passes value, key and total count to the callback', () => {
    const seen = []
    objectFilter({ x: 'a', y: 'b' }, (value, key, count) => {
      seen.push([value, key, count])
      return true
    })

    expect(seen).toEqual([['a', 'x', 2], ['b', 'y', 2]])
  })

  it('does not mutate the source', () => {
    const source = { 0: 'a', 1: 'b' }
    objectFilter(source, () => false)

    expect(source).toEqual({ 0: 'a', 1: 'b' })
  })
})

describe('objectReindexFilter', () => {
  // This is the difference from objectFilter, and the reason it exists: Foundry trait/dice
  // collections are index-keyed, so a hole left behind by a removal corrupts the next write.
  it('closes the hole left by a removal', () => {
    expect(objectReindexFilter({ 0: 'a', 1: 'b', 2: 'c' }, value => value !== 'b'))
      .toEqual({ 0: 'a', 1: 'c' })
  })

  it('densifies an already-sparse source even when nothing is filtered out', () => {
    expect(objectReindexFilter({ 0: 'a', 5: 'b', 9: 'c' }, () => true))
      .toEqual({ 0: 'a', 1: 'b', 2: 'c' })
  })

  it('returns an empty object when everything is filtered out', () => {
    expect(objectReindexFilter({ 0: 'a', 1: 'b' }, () => false)).toEqual({})
  })

  it('does not mutate the source', () => {
    const source = { 0: 'a', 1: 'b', 2: 'c' }
    objectReindexFilter(source, value => value !== 'b')

    expect(source).toEqual({ 0: 'a', 1: 'b', 2: 'c' })
  })
})

describe('objectMapValues', () => {
  it('maps values while keeping keys', () => {
    expect(objectMapValues({ a: 1, b: 2 }, value => value * 10)).toEqual({ a: 10, b: 20 })
  })

  it('returns an empty object for an empty input', () => {
    expect(objectMapValues({}, value => value)).toEqual({})
  })
})

describe('objectMapKeys', () => {
  it('renames keys while keeping values', () => {
    expect(objectMapKeys({ a: 1, b: 2 }, (value, key) => `${key}!`)).toEqual({ 'a!': 1, 'b!': 2 })
  })

  // Last write wins - there is no collision guard, so a callback that isn't injective
  // silently drops entries.
  it('drops earlier entries when two keys collide', () => {
    expect(objectMapKeys({ a: 1, b: 2 }, () => 'k')).toEqual({ k: 2 })
  })
})

describe('objectMap', () => {
  it('merges each callback result into one object', () => {
    expect(objectMap({ a: 1, b: 2 }, (value, key) => ({ [key.toUpperCase()]: value })))
      .toEqual({ A: 1, B: 2 })
  })

  it('lets a callback contribute more than one key', () => {
    expect(objectMap({ a: 1 }, (value, key) => ({ [key]: value, [`${key}x2`]: value * 2 })))
      .toEqual({ a: 1, ax2: 2 })
  })
})

describe('objectReduce', () => {
  it('threads an accumulator through in key order', () => {
    expect(objectReduce({ a: 1, b: 2, c: 3 }, (acc, value) => acc + value, 0)).toBe(6)
  })

  it('returns the seed untouched for an empty object', () => {
    expect(objectReduce({}, (acc, value) => acc + value, 'seed')).toBe('seed')
  })

  it('passes value, key and total count', () => {
    expect(objectReduce({ x: 'a', y: 'b' }, (acc, value, key, count) => [...acc, `${key}:${value}:${count}`], []))
      .toEqual(['x:a:2', 'y:b:2'])
  })
})

describe('objectForEach', () => {
  it('visits every entry in key order', () => {
    const seen = []
    objectForEach({ x: 'a', y: 'b' }, (value, key, count) => { seen.push([value, key, count]) })

    expect(seen).toEqual([['a', 'x', 2], ['b', 'y', 2]])
  })
})

describe('objectEvery', () => {
  it('is true only when every entry matches', () => {
    expect(objectEvery({ a: 2, b: 4 }, value => value % 2 === 0)).toBe(true)
    expect(objectEvery({ a: 2, b: 3 }, value => value % 2 === 0)).toBe(false)
  })

  it('is vacuously true for an empty object', () => {
    expect(objectEvery({}, () => false)).toBe(true)
  })

  it('short-circuits on the first failure', () => {
    let calls = 0
    objectEvery({ a: 1, b: 2, c: 3 }, () => { calls += 1; return false })

    expect(calls).toBe(1)
  })
})

describe('objectSome', () => {
  it('is true when any entry matches', () => {
    expect(objectSome({ a: 1, b: 2 }, value => value === 2)).toBe(true)
    expect(objectSome({ a: 1, b: 2 }, value => value === 9)).toBe(false)
  })

  it('is false for an empty object', () => {
    expect(objectSome({}, () => true)).toBe(false)
  })

  it('short-circuits on the first match', () => {
    let calls = 0
    objectSome({ a: 1, b: 2, c: 3 }, () => { calls += 1; return true })

    expect(calls).toBe(1)
  })
})

describe('objectFindEntry', () => {
  it('returns the first matching key and value', () => {
    expect(objectFindEntry({ a: 1, b: 2, c: 2 }, value => value === 2))
      .toEqual({ key: 'b', value: 2 })
  })

  it('returns undefined key and value on a miss', () => {
    expect(objectFindEntry({ a: 1 }, () => false)).toEqual({ key: undefined, value: undefined })
  })
})

describe('objectFindKey', () => {
  it('returns the first matching key, or undefined', () => {
    expect(objectFindKey({ a: 1, b: 2 }, value => value === 2)).toBe('b')
    expect(objectFindKey({ a: 1 }, () => false)).toBeUndefined()
  })
})

describe('objectFindValue', () => {
  it('returns the first matching value, or undefined', () => {
    expect(objectFindValue({ a: 1, b: 2 }, (value, key) => key === 'b')).toBe(2)
    expect(objectFindValue({ a: 1 }, () => false)).toBeUndefined()
  })
})

describe('objectIncludes', () => {
  it('tests membership by value, strictly', () => {
    expect(objectIncludes({ a: 1, b: 2 }, 2)).toBe(true)
    expect(objectIncludes({ a: 1, b: 2 }, 3)).toBe(false)
    expect(objectIncludes({ a: '2' }, 2)).toBe(false)
  })
})

describe('objectIncludesKey', () => {
  it('tests membership by key', () => {
    expect(objectIncludesKey({ a: 1 }, 'a')).toBe(true)
    expect(objectIncludesKey({ a: 1 }, 'b')).toBe(false)
  })

  // Object keys are always strings, so a numeric index has to be passed as one.
  it('requires numeric indices to be passed as strings', () => {
    expect(objectIncludesKey({ 0: 'a' }, '0')).toBe(true)
    expect(objectIncludesKey({ 0: 'a' }, 0)).toBe(false)
  })
})

describe('objectSort', () => {
  it('sorts string-keyed entries by value with the default comparator', () => {
    expect(Object.keys(objectSort({ z: 'c', x: 'a', y: 'b' }))).toEqual(['x', 'y', 'z'])
  })

  it('accepts a custom comparator', () => {
    expect(Object.keys(objectSort({ z: 'c', x: 'a', y: 'b' }, (a, b) => b.localeCompare(a))))
      .toEqual(['z', 'y', 'x'])
  })

  // TRAP, pinned deliberately. objectSort reorders the key list but then rebuilds the object
  // under the ORIGINAL keys - and JS always enumerates integer-like keys in ascending numeric
  // order regardless of insertion order. So on the index-keyed collections used all over this
  // system (trait sets, dice maps), objectSort is a silent no-op. Sorting those requires
  // reindexing after the sort (see indexObjectValues), not objectSort alone.
  it('is a no-op on integer-like keys, because JS reorders them numerically', () => {
    expect(Object.keys(objectSort({ 0: 'c', 1: 'a', 2: 'b' }))).toEqual(['0', '1', '2'])
    expect(objectSort({ 0: 'c', 1: 'a', 2: 'b' })).toEqual({ 0: 'c', 1: 'a', 2: 'b' })
  })

  it('does not mutate the source', () => {
    const source = { z: 'c', x: 'a' }
    objectSort(source)

    expect(Object.keys(source)).toEqual(['z', 'x'])
  })
})

describe('resetDataObject', () => {
  const source = () => ({
    traitSets: {
      3: { name: 'A', traits: { 7: { v: 1 }, 9: { v: 2 } } },
      5: { name: 'B', traits: { 2: { v: 3 } } }
    }
  })

  it('reindexes the collection named by the first path segment', () => {
    expect(resetDataObject({ path: ['traitSets'], source: source() })).toEqual({
      traitSets: {
        0: { name: 'A', traits: { 7: { v: 1 }, 9: { v: 2 } } },
        1: { name: 'B', traits: { 2: { v: 3 } } }
      }
    })
  })

  it('walks the whole path, reindexing nested collections too', () => {
    expect(resetDataObject({ path: ['traitSets', 'traits'], source: source() })).toEqual({
      traitSets: {
        0: { name: 'A', traits: { 0: { v: 1 }, 1: { v: 2 } } },
        1: { name: 'B', traits: { 0: { v: 3 } } }
      }
    })
  })

  it('returns the source untouched when the path segment is absent', () => {
    expect(resetDataObject({ path: ['nope'], source: source() })).toEqual(source())
  })

  it('does not mutate the source', () => {
    const original = source()
    resetDataObject({ path: ['traitSets', 'traits'], source: original })

    expect(original).toEqual(source())
  })
})
