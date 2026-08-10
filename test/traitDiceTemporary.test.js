import { describe, expect, it } from 'vitest'
import {
  computeSteppedTemporaryValue,
  getEffectiveDiceMap,
  getEffectiveValue,
  reindexDiceAfterRemoval,
  stepFaceDown,
  stepFaceUp
} from '../module/scripts/traitDiceTemporary.js'

describe('stepFaceUp', () => {
  it('steps one rung up the ladder', () => {
    expect(stepFaceUp('4')).toBe('6')
    expect(stepFaceUp('6')).toBe('8')
    expect(stepFaceUp('8')).toBe('10')
    expect(stepFaceUp('10')).toBe('12')
  })

  it('clamps at the ceiling (d12) instead of removing/overflowing', () => {
    expect(stepFaceUp('12')).toBe('12')
  })
})

describe('stepFaceDown', () => {
  it('steps one rung down the ladder', () => {
    expect(stepFaceDown('12')).toBe('10')
    expect(stepFaceDown('10')).toBe('8')
    expect(stepFaceDown('8')).toBe('6')
    expect(stepFaceDown('6')).toBe('4')
  })

  it('clamps at the floor (d4) instead of removing/overflowing', () => {
    expect(stepFaceDown('4')).toBe('4')
  })
})

describe('getEffectiveValue', () => {
  it('returns the actual value when no temporary value is stored', () => {
    expect(getEffectiveValue({ 0: '8' }, undefined, '0')).toBe('8')
    expect(getEffectiveValue({ 0: '8' }, {}, '0')).toBe('8')
  })

  it('returns the temporary value when one is stored', () => {
    expect(getEffectiveValue({ 0: '8' }, { 0: '10' }, '0')).toBe('10')
  })
})

describe('getEffectiveDiceMap', () => {
  it('resolves every index, falling back to actual where temporary is absent', () => {
    const value = { 0: '8', 1: '6', 2: '4' }
    const temporaryValue = { 1: '10' }

    expect(getEffectiveDiceMap(value, temporaryValue)).toEqual({ 0: '8', 1: '10', 2: '4' })
  })

  it('matches dice.value exactly when there is no temporary value at all', () => {
    const value = { 0: '8', 1: '6' }

    expect(getEffectiveDiceMap(value, undefined)).toEqual(value)
  })
})

describe('computeSteppedTemporaryValue', () => {
  it('steps up from the actual value when nothing has diverged yet', () => {
    const next = computeSteppedTemporaryValue({ 0: '8' }, undefined, '0', 'up')
    expect(next).toEqual({ 0: '10' })
  })

  it('steps down from the actual value when nothing has diverged yet', () => {
    const next = computeSteppedTemporaryValue({ 0: '8' }, undefined, '0', 'down')
    expect(next).toEqual({ 0: '6' })
  })

  it('continues stepping from an already-diverged temporary value', () => {
    const next = computeSteppedTemporaryValue({ 0: '8' }, { 0: '10' }, '0', 'up')
    expect(next).toEqual({ 0: '12' })
  })

  it('deletes the entry once stepping brings it back in sync with the actual value', () => {
    const next = computeSteppedTemporaryValue({ 0: '8' }, { 0: '10' }, '0', 'down')
    expect(next).toEqual({})
  })

  it('only touches the targeted index, leaving other diverged entries alone', () => {
    const next = computeSteppedTemporaryValue({ 0: '8', 1: '6' }, { 1: '10' }, '0', 'up')
    expect(next).toEqual({ 0: '10', 1: '10' })
  })
})

describe('reindexDiceAfterRemoval', () => {
  it('removes the targeted index and reindexes both value and a sparse temporaryValue in lockstep', () => {
    const value = { 0: 'a', 1: 'b', 2: 'c', 3: 'd' }
    const temporaryValue = { 2: 'X' } // only the die that WILL end up at new index 1 has diverged

    const result = reindexDiceAfterRemoval(value, temporaryValue, key => key !== '1')

    expect(result.value).toEqual({ 0: 'a', 1: 'c', 2: 'd' })
    expect(result.temporaryValue).toEqual({ 1: 'X' })
  })

  it('drops the temporary entry belonging to the removed die itself', () => {
    const value = { 0: 'a', 1: 'b' }
    const temporaryValue = { 0: 'X' }

    const result = reindexDiceAfterRemoval(value, temporaryValue, key => key !== '0')

    expect(result.value).toEqual({ 0: 'b' })
    expect(result.temporaryValue).toEqual({})
  })

  it('handles a completely absent temporaryValue gracefully', () => {
    const result = reindexDiceAfterRemoval({ 0: 'a', 1: 'b' }, undefined, key => key !== '0')

    expect(result.value).toEqual({ 0: 'b' })
    expect(result.temporaryValue).toEqual({})
  })

  it('supports removing multiple indices at once (consumable-dice spend)', () => {
    const value = { 0: 'a', 1: 'b', 2: 'c' }
    const temporaryValue = { 0: 'X', 2: 'Y' }

    const result = reindexDiceAfterRemoval(value, temporaryValue, key => !['0', '1'].includes(key))

    expect(result.value).toEqual({ 0: 'c' })
    expect(result.temporaryValue).toEqual({ 0: 'Y' })
  })
})
