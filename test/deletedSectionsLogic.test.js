import { describe, expect, it, vi } from 'vitest'
import { previewText, pushDeletedSection, removeDeletedSection } from '../module/scripts/deletedSectionsLogic.js'

describe('pushDeletedSection', () => {
  it('prepends the note with a fresh deletedAt, ahead of what was already there', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)

    const existing = { 0: { label: 'Older', deletedAt: 500 } }
    const result = pushDeletedSection(existing, { label: 'Newest', value: '<p>x</p>' })

    expect(result).toEqual({
      0: { label: 'Newest', value: '<p>x</p>', deletedAt: 1000 },
      1: { label: 'Older', deletedAt: 500 }
    })

    vi.useRealTimers()
  })

  it('starts a fresh queue when there is nothing deleted yet', () => {
    const result = pushDeletedSection(undefined, { label: 'First' })

    expect(Object.keys(result)).toEqual(['0'])
    expect(result[0].label).toBe('First')
  })

  it('evicts the oldest entry once the cap is exceeded', () => {
    const nine = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i, { label: `Old ${i}` }]))

    const result = pushDeletedSection(nine, { label: 'New' }, 10)

    expect(Object.keys(result).length).toBe(10)
    expect(result[0].label).toBe('New')
    expect(result[9].label).toBe('Old 8')
  })

  it('an 11th deletion drops the oldest (index 9) entirely', () => {
    const ten = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, { label: `Old ${i}` }]))

    const result = pushDeletedSection(ten, { label: 'Eleventh' }, 10)

    expect(Object.keys(result).length).toBe(10)
    expect(Object.values(result).map(entry => entry.label)).not.toContain('Old 9')
  })

  it('does not mutate its input', () => {
    const existing = { 0: { label: 'Older' } }
    const snapshot = JSON.parse(JSON.stringify(existing))

    pushDeletedSection(existing, { label: 'New' })

    expect(existing).toEqual(snapshot)
  })
})

describe('removeDeletedSection', () => {
  it('removes the entry at the given index and reindexes what remains', () => {
    const queue = { 0: { label: 'A' }, 1: { label: 'B' }, 2: { label: 'C' } }

    const result = removeDeletedSection(queue, 1)

    expect(result).toEqual({ 0: { label: 'A' }, 1: { label: 'C' } })
  })

  it('removing the only entry leaves an empty queue', () => {
    expect(removeDeletedSection({ 0: { label: 'Only' } }, 0)).toEqual({})
  })

  it('does not mutate its input', () => {
    const queue = { 0: { label: 'A' }, 1: { label: 'B' } }
    const snapshot = JSON.parse(JSON.stringify(queue))

    removeDeletedSection(queue, 0)

    expect(queue).toEqual(snapshot)
  })
})

describe('previewText', () => {
  it('strips HTML tags and collapses whitespace', () => {
    expect(previewText('<p>Grew up  on   <strong>Mars</strong>.</p>')).toBe('Grew up on Mars .')
  })

  it('returns an empty string for nothing', () => {
    expect(previewText(undefined)).toBe('')
    expect(previewText(null)).toBe('')
  })

  it('truncates past maxLength with an ellipsis', () => {
    const long = 'x'.repeat(200)

    const result = previewText(long, 10)

    expect(result).toBe(`${'x'.repeat(10)}…`)
  })

  it('leaves text at or under maxLength untouched', () => {
    expect(previewText('short', 10)).toBe('short')
  })
})
