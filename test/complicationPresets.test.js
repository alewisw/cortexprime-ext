import { describe, expect, it } from 'vitest'
import {
  COMPLICATION_PRESETS,
  SEVERITIES,
  SEVERITY_DICE,
  getCategories,
  getPresetNames,
  getSubCategories
} from '../module/actor/complicationPresets.js'

describe('getCategories', () => {
  it('lists the top-level categories in the preset library', () => {
    expect(getCategories()).toEqual(['Mental', 'Physical', 'Social'])
  })
})

describe('getSubCategories', () => {
  it('lists the subcategories under a category', () => {
    expect(getSubCategories('Mental')).toContain('Anger and Aggression')
    expect(getSubCategories('Physical')).toContain('Cuts and Bleeding')
  })

  it('returns an empty list for an unknown category', () => {
    expect(getSubCategories('Nonsense')).toEqual([])
  })
})

describe('getPresetNames', () => {
  it('lists the names for a category/subCategory/severity combination', () => {
    const names = getPresetNames('Mental', 'Anger and Aggression', 'mild')

    expect(names).toContain('Annoyed')
    expect(names).toContain('Sullen')
  })

  it('returns an empty list for an unknown combination', () => {
    expect(getPresetNames('Mental', 'Anger and Aggression', 'nonsense')).toEqual([])
    expect(getPresetNames('Mental', 'Nonsense', 'mild')).toEqual([])
    expect(getPresetNames('Nonsense', 'Anger and Aggression', 'mild')).toEqual([])
  })
})

describe('SEVERITY_DICE', () => {
  it('fixes the die each severity band uses', () => {
    expect(SEVERITY_DICE).toEqual({ mild: 6, moderate: 8, severe: 10 })
  })

  it('matches the severities exported for iteration', () => {
    expect(SEVERITIES).toEqual(['mild', 'moderate', 'severe'])
  })
})

describe('COMPLICATION_PRESETS shape', () => {
  it('gives every subcategory all three severities with non-empty name lists', () => {
    for (const category of getCategories()) {
      for (const subCategory of getSubCategories(category)) {
        for (const severity of SEVERITIES) {
          const names = COMPLICATION_PRESETS[category][subCategory][severity]

          expect(Array.isArray(names)).toBe(true)
          expect(names.length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('has no duplicate names within the same severity band', () => {
    for (const category of getCategories()) {
      for (const subCategory of getSubCategories(category)) {
        for (const severity of SEVERITIES) {
          const names = COMPLICATION_PRESETS[category][subCategory][severity]

          expect(new Set(names).size).toBe(names.length)
        }
      }
    }
  })
})
