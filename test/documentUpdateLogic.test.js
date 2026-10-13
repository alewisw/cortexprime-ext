import { describe, expect, it } from 'vitest'
import { replaceAt } from '../module/scripts/documentUpdateLogic.js'

describe('replaceAt', () => {
  it('builds a forced-replacement key for each target under the path', () => {
    expect(replaceAt('system.actorType.additionalTabs.4', { notes: { 0: { label: 'A' } }, deletedSections: {} }))
      .toEqual({
        'system.actorType.additionalTabs.4.==notes': { 0: { label: 'A' } },
        'system.actorType.additionalTabs.4.==deletedSections': {}
      })
  })

  // An empty object must still be written: it is how a collection shrinks to nothing.
  it('keeps empty and null values rather than dropping them', () => {
    expect(replaceAt('a.b', { value: {}, temporaryValue: null }))
      .toEqual({ 'a.b.==value': {}, 'a.b.==temporaryValue': null })
  })

  it('returns an empty payload for no targets', () => {
    expect(replaceAt('a.b', {})).toEqual({})
  })
})
