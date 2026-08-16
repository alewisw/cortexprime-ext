import { describe, expect, it } from 'vitest'
import { computeCssVars, getBorderWidth } from '../module/scripts/foundryHelpers.js'

// computeCssVars returns pairs; most assertions here only care about one key at a time.
const varsFor = theme => Object.fromEntries(computeCssVars(theme))

describe('getBorderWidth', () => {
  it('builds the four-sided shorthand for each position', () => {
    expect(getBorderWidth('a', 2)).toBe('2px 2px 2px 2px')
    expect(getBorderWidth('t', 2)).toBe('2px 0 0 0')
    expect(getBorderWidth('b', 2)).toBe('0 0 2px 0')
    expect(getBorderWidth('l', 2)).toBe('0 0 0 2px')
    expect(getBorderWidth('r', 2)).toBe('0 2px 0 0')
    expect(getBorderWidth('x', 2)).toBe('0 2px 0 2px')
    expect(getBorderWidth('y', 2)).toBe('2px 0 2px 0')
  })

  // No default branch: an unset or unrecognised position produces undefined, which
  // setProperty then ignores, leaving whatever the stylesheet already had.
  it('returns undefined for an unrecognised or missing position', () => {
    expect(getBorderWidth('q', 2)).toBeUndefined()
    expect(getBorderWidth(undefined, 2)).toBeUndefined()
    expect(getBorderWidth('', 2)).toBeUndefined()
  })

  it('carries a zero width through rather than dropping it', () => {
    expect(getBorderWidth('t', 0)).toBe('0px 0 0 0')
  })
})

describe('computeCssVars', () => {
  it('converts camelCase keys to --cp- prefixed kebab-case', () => {
    expect(varsFor({ sheetBackgroundColor: '#fff' }))
      .toEqual({ '--cp-sheet-background-color': '#fff' })
  })

  it('keeps runs of capitals together as one word', () => {
    expect(varsFor({ ppColor: '#f00', someURLThing: 'x' })).toEqual({
      '--cp-pp-color': '#f00',
      '--cp-some-url-thing': 'x'
    })
  })

  it('passes values through untouched by default', () => {
    expect(varsFor({ sheetBackgroundColor: '#fff', someLabel: 'bold' })).toEqual({
      '--cp-sheet-background-color': '#fff',
      '--cp-some-label': 'bold'
    })
  })

  it('suffixes the size and width keys with px', () => {
    expect(varsFor({ bodyFontSize: 12, sfxLabelFontSize: 9, separatorWeight: 1 })).toEqual({
      '--cp-body-font-size': '12px',
      '--cp-sfx-label-font-size': '9px',
      '--cp-separator-weight': '1px'
    })
  })

  it('does not suffix keys outside the px list', () => {
    expect(varsFor({ sheetBackgroundColor: 12 })).toEqual({ '--cp-sheet-background-color': 12 })
  })

  describe('background images', () => {
    // An absolute URL is used as-is; anything else is treated as a path relative to the
    // Foundry data root and gets a leading slash.
    it('wraps an absolute URL in url() unchanged', () => {
      expect(varsFor({ sheetBackgroundImage: 'http://example.com/bg.png' }))
        .toEqual({ '--cp-sheet-background-image': "url('http://example.com/bg.png')" })
    })

    it('roots a relative path with a leading slash', () => {
      expect(varsFor({ sectionBackgroundImage: 'assets/bg.png' }))
        .toEqual({ '--cp-section-background-image': "url('/assets/bg.png')" })
    })

    it('resolves an unset image to none, so it clears rather than breaking', () => {
      expect(varsFor({ sheetBackgroundImage: '' })['--cp-sheet-background-image']).toBe('none')
      expect(varsFor({ sheetBackgroundImage: null })['--cp-sheet-background-image']).toBe('none')
    })
  })

  describe('border positions', () => {
    it('expands a border position into a shorthand using its matching width', () => {
      expect(varsFor({ inputBorderPosition: 't', inputBorderWidth: 2 })).toEqual({
        '--cp-input-border-position': '2px 0 0 0',
        '--cp-input-border-width': '2px'
      })
    })

    it('reads each border position against its own width', () => {
      const vars = varsFor({
        inputBorderPosition: 'l',
        inputBorderWidth: 1,
        sectionBorderPosition: 'a',
        sectionBorderWidth: 3
      })

      expect(vars['--cp-input-border-position']).toBe('0 0 0 1px')
      expect(vars['--cp-section-border-position']).toBe('3px 3px 3px 3px')
    })
  })

  it('returns no pairs for an empty theme', () => {
    expect(computeCssVars({})).toEqual([])
  })
})
