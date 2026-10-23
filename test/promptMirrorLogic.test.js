import { describe, expect, it } from 'vitest'
import {
  buildPoolRows,
  buildPromptRows,
  getMirroredPromptKind,
  isAllowedAttribute,
  isAllowedTag,
  isDroppedTag
} from '../module/scripts/promptMirrorLogic.js'

describe('getMirroredPromptKind', () => {
  it('recognises each mirrored prompt by its window class', () => {
    expect(getMirroredPromptKind(['application', 'dialog', 'cortexprime', 'dice-picker'])).toBe('dice-picker')
    expect(getMirroredPromptKind(['cortexprime', 'paradox-dialog'])).toBe('paradox-dialog')
    expect(getMirroredPromptKind(['cortexprime', 'give-in-confirm'])).toBe('give-in-confirm')
  })

  it('ignores every other window', () => {
    expect(getMirroredPromptKind(['cortexprime', 'actor-sheet'])).toBeNull()
    expect(getMirroredPromptKind(undefined)).toBeNull()
  })

  it('accepts a DOMTokenList-like iterable', () => {
    expect(getMirroredPromptKind(new Set(['consumable-dice']))).toBe('consumable-dice')
  })
})

describe('buildPromptRows', () => {
  const users = [
    { id: 'gm', name: 'GM', isGM: true, promptMirror: { a: { html: '<p>x</p>', title: 'Mine' } } },
    {
      id: 'u1',
      name: 'Player One',
      characterName: 'Amanda',
      promptMirror: {
        late: { html: '<p>b</p>', title: 'Spend Plot Point', kind: 'plot-point-use-dialog', updatedAt: 20 },
        early: { html: '<p>a</p>', title: 'Select Your Dice', kind: 'dice-picker', updatedAt: 10 },
        empty: { html: '', title: 'Gone' },
        cleared: null
      }
    }
  ]

  it('lists open player prompts oldest first, named by character, never the GM\'s own', () => {
    expect(buildPromptRows(users)).toEqual([
      { userId: 'u1', appId: 'early', playerName: 'Amanda', title: 'Select Your Dice', kind: 'dice-picker', updatedAt: 10 },
      { userId: 'u1', appId: 'late', playerName: 'Amanda', title: 'Spend Plot Point', kind: 'plot-point-use-dialog', updatedAt: 20 }
    ])
  })

  it('handles no users or no prompts', () => {
    expect(buildPromptRows(undefined)).toEqual([])
    expect(buildPromptRows([{ id: 'u2', name: 'P2' }])).toEqual([])
  })
})

describe('buildPoolRows', () => {
  it('shows each connected player\'s pool as labels and faces, skipping empty pools, offline players and the GM', () => {
    const users = [
      { id: 'gm', name: 'GM', isGM: true, active: true, dicePool: { pool: { custom: { 0: { label: 'Doom', value: { 0: '8' } } } } } },
      {
        id: 'u1',
        name: 'Player One',
        characterName: 'Amanda',
        active: true,
        dicePool: { pool: { 'Amanda Singh': { 0: { label: 'Mind', value: { 0: '8' } }, 1: { label: 'Fire', value: { 0: '6', 1: '4' } } }, custom: { 0: { label: 'Blank', value: {} } } } }
      },
      { id: 'u2', name: 'Offline', active: false, dicePool: { pool: { custom: { 0: { label: 'X', value: { 0: '6' } } } } } },
      { id: 'u3', name: 'Empty', active: true, dicePool: { pool: {} } }
    ]

    expect(buildPoolRows(users)).toEqual([
      { userId: 'u1', playerName: 'Amanda', entries: [{ label: 'Mind', dice: [8] }, { label: 'Fire', dice: [6, 4] }] }
    ])
  })

  it('survives a null pool flag (the transient half of a reset write)', () => {
    expect(buildPoolRows([{ id: 'u1', name: 'P', active: true, dicePool: null }])).toEqual([])
  })
})

describe('sanitiser allowlist', () => {
  it('keeps layout, form and dice-SVG tags', () => {
    for (const tag of ['div', 'input', 'select', 'button', 'svg', 'path', 'SVG']) expect(isAllowedTag(tag)).toBe(true)
  })

  // DialogV2 wraps its content in a <form>; dropping it would drop the whole prompt.
  it('unwraps rather than drops a form', () => {
    expect(isDroppedTag('form')).toBe(false)
    expect(isAllowedTag('form')).toBe(false)
  })

  it('drops script-capable tags outright', () => {
    for (const tag of ['script', 'iframe', 'object', 'style', 'foreignObject']) {
      expect(isDroppedTag(tag)).toBe(true)
      expect(isAllowedTag(tag)).toBe(false)
    }
  })

  it('rejects every event handler attribute', () => {
    expect(isAllowedAttribute('onerror', 'alert(1)')).toBe(false)
    expect(isAllowedAttribute('ONCLICK', 'x')).toBe(false)
  })

  it('rejects script URLs and CSS that can load or run anything', () => {
    expect(isAllowedAttribute('src', 'javascript:alert(1)')).toBe(false)
    expect(isAllowedAttribute('src', ' data:text/html,x')).toBe(false)
    expect(isAllowedAttribute('src', 'icons/svg/d6.svg')).toBe(true)
    expect(isAllowedAttribute('style', 'background: url(x)')).toBe(false)
    expect(isAllowedAttribute('style', 'display: flex')).toBe(true)
  })

  it('keeps state and data attributes, drops ids and names that could collide on the GM\'s page', () => {
    expect(isAllowedAttribute('checked')).toBe(true)
    expect(isAllowedAttribute('data-result', '6')).toBe(true)
    expect(isAllowedAttribute('aria-label', 'd6')).toBe(true)
    expect(isAllowedAttribute('viewBox', '0 0 30 30')).toBe(true)
    expect(isAllowedAttribute('id')).toBe(false)
    expect(isAllowedAttribute('name')).toBe(false)
    expect(isAllowedAttribute('href', 'x')).toBe(false)
  })
})
