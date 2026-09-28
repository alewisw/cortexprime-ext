import { describe, expect, it } from 'vitest'
import { scaledSheetWidth } from '../module/actor/sheetScaleLogic.js'

describe('scaledSheetWidth', () => {
  it('scales the base width by the percentage', () => {
    expect(scaledSheetWidth(960, 100)).toBe(960)
    expect(scaledSheetWidth(960, 75)).toBe(720)
    expect(scaledSheetWidth(960, 150)).toBe(1440)
  })

  // Form data can hand the setting back as a string.
  it('accepts a numeric string', () => {
    expect(scaledSheetWidth(960, '50')).toBe(480)
  })

  it('rounds to a whole pixel', () => {
    expect(scaledSheetWidth(960, 85)).toBe(816)
    expect(scaledSheetWidth(100, 33)).toBe(33)
    expect(scaledSheetWidth(10, 85)).toBe(9)
  })

  it('treats a missing, empty or non-numeric scale as 100', () => {
    expect(scaledSheetWidth(960, undefined)).toBe(960)
    expect(scaledSheetWidth(960, null)).toBe(960)
    expect(scaledSheetWidth(960, '')).toBe(960)
    expect(scaledSheetWidth(960, 'abc')).toBe(960)
    expect(scaledSheetWidth(960, 0)).toBe(960)
  })
})
