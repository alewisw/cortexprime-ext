import { describe, expect, it } from 'vitest'
import { buildPickerState, toDiceValue } from '../module/applications/complicationDialogLogic.js'

const namesFor = (state, severity) => state.severities.find(s => s.severity === severity).names

describe('buildPickerState', () => {
  it('defaults to the first category and first subCategory when nothing is selected', () => {
    const state = buildPickerState()

    expect(state.categories[0]).toEqual({ value: 'Mental', selected: true })
    expect(state.subCategory.selected).toBe('Anger and Aggression')
  })

  it('returns all three severities as columns, each with its own names', () => {
    const state = buildPickerState()

    expect(state.severities.map(s => s.severity)).toEqual(['mild', 'moderate', 'severe'])
    expect(state.severities.find(s => s.severity === 'mild').label).toBe('Mild')
    expect(namesFor(state, 'mild').map(n => n.name)).toContain('Annoyed')
    expect(namesFor(state, 'severe').map(n => n.name)).toContain('White-Hot Fury')
  })

  it('marks the selected name within whichever severity column it belongs to', () => {
    const state = buildPickerState({ selectedName: 'Annoyed' })

    expect(namesFor(state, 'mild').find(n => n.name === 'Annoyed').selected).toBe(true)
    expect(namesFor(state, 'mild').find(n => n.name === 'Bristling').selected).toBe(false)
  })

  it('keeps a valid category/subCategory selection as-is', () => {
    const state = buildPickerState({ category: 'Physical', subCategory: 'Cuts and Bleeding' })

    expect(state.categories.find(c => c.value === 'Physical').selected).toBe(true)
    expect(state.subCategory.selected).toBe('Cuts and Bleeding')
    expect(namesFor(state, 'severe').map(n => n.name)).toContain('Haemorrhaging')
  })

  it('resets subCategory to the new category\'s first when the category changes away from it', () => {
    const state = buildPickerState({ category: 'Social', subCategory: 'Anger and Aggression' })

    expect(state.subCategory.selected).toBe('Connection and Isolation')
  })

  it('falls back to the first category for an unknown one', () => {
    const state = buildPickerState({ category: 'Nonsense' })

    expect(state.categories[0].selected).toBe(true)
  })
})

describe('toDiceValue', () => {
  it('wraps a single die face as the dice.value shape', () => {
    expect(toDiceValue(8)).toEqual({ 0: '8' })
  })
})
