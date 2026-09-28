import { describe, expect, it } from 'vitest'
import { isAdditionalTabVisible, resolveActiveTab } from '../module/actor/additionalTabVisibilityLogic.js'

describe('isAdditionalTabVisible', () => {
  it('shows a tab to everyone when ownerOnly is unset or false', () => {
    expect(isAdditionalTabVisible({ id: 't1' }, false)).toBe(true)
    expect(isAdditionalTabVisible({ id: 't1', ownerOnly: false }, false)).toBe(true)
    expect(isAdditionalTabVisible({ id: 't1' }, true)).toBe(true)
  })

  it('hides an ownerOnly tab from a non-owner', () => {
    expect(isAdditionalTabVisible({ id: 't1', ownerOnly: true }, false)).toBe(false)
  })

  it('shows an ownerOnly tab to an owner', () => {
    expect(isAdditionalTabVisible({ id: 't1', ownerOnly: true }, true)).toBe(true)
  })
})

describe('resolveActiveTab', () => {
  const tabs = {
    0: { id: 'open', name: 'Notes' },
    1: { id: 'secret', name: 'Secrets', ownerOnly: true }
  }

  it('keeps Traits', () => {
    expect(resolveActiveTab('traits', tabs, false)).toBe('traits')
  })

  it('keeps a tab the user can see', () => {
    expect(resolveActiveTab('open', tabs, false)).toBe('open')
    expect(resolveActiveTab('secret', tabs, true)).toBe('secret')
  })

  it('falls back to Traits when the active tab is hidden from the user', () => {
    expect(resolveActiveTab('secret', tabs, false)).toBe('traits')
  })

  it('tolerates an actor with no Additional Tabs', () => {
    expect(resolveActiveTab('traits', undefined, false)).toBe('traits')
    expect(resolveActiveTab('secret', undefined, false)).toBe('secret')
  })
})
