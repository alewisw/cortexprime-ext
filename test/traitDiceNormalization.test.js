import { describe, expect, it } from 'vitest'
import { computeTraitDiceNormalization } from '../module/scripts/traitDiceNormalization.js'

const traitSet = (settings, traits = {}, customTraits = {}) => ({ settings, traits, customTraits })
const trait = (values, subTraits, temporaryValue) => ({ dice: { value: values, temporaryValue }, ...(subTraits ? { subTraits } : {}) })
const subTrait = (values, temporaryValue) => ({ dice: { value: values, temporaryValue } })
const simpleTrait = (settings, values) => ({ dice: { value: values }, settings })
const asset = (values, temporaryValue) => ({ dice: { value: values, temporaryValue } })

describe('computeTraitDiceNormalization', () => {
  it('returns null when there are no Trait Sets', () => {
    expect(computeTraitDiceNormalization({})).toBeNull()
    expect(computeTraitDiceNormalization(undefined)).toBeNull()
  })

  it('returns null when hasMultipleDice is true (or unset) regardless of dice count', () => {
    const actorType = {
      traitSets: {
        0: traitSet({ hasMultipleDice: true }, { 0: trait({}), 1: trait({ 0: '8', 1: '6' }) }),
        1: traitSet({}, { 0: trait({}) })
      }
    }

    expect(computeTraitDiceNormalization(actorType)).toBeNull()
  })

  it('leaves a hasMultipleDice:false trait with zero dice alone (0 is now a valid resting state)', () => {
    const actorType = {
      traitSets: {
        0: traitSet({ hasMultipleDice: false }, { 0: trait({}) })
      }
    }

    expect(computeTraitDiceNormalization(actorType)).toBeNull()
  })

  it('returns null when a hasMultipleDice:false trait already has exactly one die', () => {
    const actorType = {
      traitSets: {
        0: traitSet({ hasMultipleDice: false }, { 0: trait({ 0: '8' }) })
      }
    }

    expect(computeTraitDiceNormalization(actorType)).toBeNull()
  })

  it('trims a multi-die trait down to just its first die', () => {
    const actorType = {
      traitSets: {
        0: traitSet({ hasMultipleDice: false }, { 0: trait({ 0: '8', 1: '6', 2: '4' }) })
      }
    }

    expect(computeTraitDiceNormalization(actorType)).toEqual({
      unset: { 'system.actorType.traitSets.0.traits.0.dice.-=value': null },
      set: { 'system.actorType.traitSets.0.traits.0.dice.value': { 0: '8' } }
    })
  })

  it('normalizes customTraits the same way as traits', () => {
    const actorType = {
      traitSets: {
        0: traitSet({ hasMultipleDice: false }, {}, { 0: trait({ 0: '6', 1: '6' }) })
      }
    }

    expect(computeTraitDiceNormalization(actorType)).toEqual({
      unset: { 'system.actorType.traitSets.0.customTraits.0.dice.-=value': null },
      set: { 'system.actorType.traitSets.0.customTraits.0.dice.value': { 0: '6' } }
    })
  })

  it('fixes multiple over-full traits across multiple Trait Sets in a single batched result, leaving empty/single traits alone', () => {
    const actorType = {
      traitSets: {
        0: traitSet({ hasMultipleDice: false }, { 0: trait({}), 1: trait({ 0: '8', 1: '6' }) }),
        1: traitSet({ hasMultipleDice: true }, { 0: trait({ 0: '8', 1: '6' }) }),
        2: traitSet({ hasMultipleDice: false }, { 0: trait({ 0: '10' }) })
      }
    }

    expect(computeTraitDiceNormalization(actorType)).toEqual({
      unset: {
        'system.actorType.traitSets.0.traits.1.dice.-=value': null
      },
      set: {
        'system.actorType.traitSets.0.traits.1.dice.value': { 0: '8' }
      }
    })
  })

  it('respects a custom basePath', () => {
    const actorType = {
      traitSets: {
        0: traitSet({ hasMultipleDice: false }, { 0: trait({ 0: '6', 1: '4' }) })
      }
    }

    expect(computeTraitDiceNormalization(actorType, 'foo.bar')).toEqual({
      unset: { 'foo.bar.traitSets.0.traits.0.dice.-=value': null },
      set: { 'foo.bar.traitSets.0.traits.0.dice.value': { 0: '6' } }
    })
  })

  describe('Sub-Traits', () => {
    it('leaves an empty Sub-Trait alone when subTraitsHaveMultipleDice is false', () => {
      const actorType = {
        traitSets: {
          0: traitSet({ subTraitsHaveMultipleDice: false }, { 0: trait({ 0: '8' }, { 0: subTrait({}) }) })
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toBeNull()
    })

    it('trims a multi-die Sub-Trait down to just its first die', () => {
      const actorType = {
        traitSets: {
          0: traitSet({ subTraitsHaveMultipleDice: false }, { 0: trait({ 0: '8' }, { 0: subTrait({ 0: '6', 1: '4' }) }) })
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toEqual({
        unset: { 'system.actorType.traitSets.0.traits.0.subTraits.0.dice.-=value': null },
        set: { 'system.actorType.traitSets.0.traits.0.subTraits.0.dice.value': { 0: '6' } }
      })
    })

    it('leaves Sub-Traits alone when subTraitsHaveMultipleDice is true (or unset), independent of the main trait setting', () => {
      const actorType = {
        traitSets: {
          0: traitSet({ hasMultipleDice: false }, { 0: trait({ 0: '8', 1: '6' }, { 0: subTrait({ 0: '6', 1: '4' }) }) })
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toEqual({
        unset: { 'system.actorType.traitSets.0.traits.0.dice.-=value': null },
        set: { 'system.actorType.traitSets.0.traits.0.dice.value': { 0: '8' } }
      })
    })

    it('fixes Sub-Traits independently of the main trait when only subTraitsHaveMultipleDice is false', () => {
      const actorType = {
        traitSets: {
          0: traitSet({ subTraitsHaveMultipleDice: false }, { 0: trait({ 0: '8', 1: '6' }, { 0: subTrait({ 0: '6', 1: '4' }) }) })
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toEqual({
        unset: { 'system.actorType.traitSets.0.traits.0.subTraits.0.dice.-=value': null },
        set: { 'system.actorType.traitSets.0.traits.0.subTraits.0.dice.value': { 0: '6' } }
      })
    })
  })

  describe('temporaryValue', () => {
    it('trims temporaryValue in lockstep when the kept die (index 0) has a diverged value', () => {
      const actorType = {
        traitSets: {
          0: traitSet({ hasMultipleDice: false }, { 0: trait({ 0: '8', 1: '6' }, undefined, { 0: '10' }) })
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toEqual({
        unset: {
          'system.actorType.traitSets.0.traits.0.dice.-=value': null,
          'system.actorType.traitSets.0.traits.0.dice.-=temporaryValue': null
        },
        set: {
          'system.actorType.traitSets.0.traits.0.dice.value': { 0: '8' },
          'system.actorType.traitSets.0.traits.0.dice.temporaryValue': { 0: '10' }
        }
      })
    })

    it('drops a diverged temporaryValue that belonged to a trimmed-away die', () => {
      const actorType = {
        traitSets: {
          0: traitSet({ hasMultipleDice: false }, { 0: trait({ 0: '8', 1: '6' }, undefined, { 1: '10' }) })
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toEqual({
        unset: {
          'system.actorType.traitSets.0.traits.0.dice.-=value': null,
          'system.actorType.traitSets.0.traits.0.dice.-=temporaryValue': null
        },
        set: {
          'system.actorType.traitSets.0.traits.0.dice.value': { 0: '8' },
          'system.actorType.traitSets.0.traits.0.dice.temporaryValue': {}
        }
      })
    })

    it('does not touch temporaryValue when it was never populated', () => {
      const actorType = {
        traitSets: {
          0: traitSet({ hasMultipleDice: false }, { 0: trait({ 0: '8', 1: '6' }) })
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toEqual({
        unset: { 'system.actorType.traitSets.0.traits.0.dice.-=value': null },
        set: { 'system.actorType.traitSets.0.traits.0.dice.value': { 0: '8' } }
      })
    })
  })

  describe('Simple Traits', () => {
    it('leaves an empty dice-type Simple Trait alone', () => {
      const actorType = {
        simpleTraits: {
          0: simpleTrait({ valueType: 'dice', hasMultipleDice: false }, {})
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toBeNull()
    })

    it('trims a multi-die dice-type Simple Trait down to just its first die', () => {
      const actorType = {
        simpleTraits: {
          0: simpleTrait({ valueType: 'dice', hasMultipleDice: false }, { 0: '6', 1: '6' })
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toEqual({
        unset: { 'system.actorType.simpleTraits.0.dice.-=value': null },
        set: { 'system.actorType.simpleTraits.0.dice.value': { 0: '6' } }
      })
    })

    it('leaves a Simple Trait alone when hasMultipleDice is true (or unset)', () => {
      const actorType = {
        simpleTraits: {
          0: simpleTrait({ valueType: 'dice', hasMultipleDice: true }, { 0: '6', 1: '6' }),
          1: simpleTrait({ valueType: 'dice' }, { 0: '6', 1: '6' })
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toBeNull()
    })

    it('never touches a non-dice Simple Trait regardless of hasMultipleDice', () => {
      const actorType = {
        simpleTraits: {
          0: simpleTrait({ valueType: 'number', hasMultipleDice: false }, { 0: '6', 1: '6' }),
          1: simpleTrait({ valueType: 'text', hasMultipleDice: false }, { 0: '6', 1: '6' })
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toBeNull()
    })
  })

  describe('Assets', () => {
    it('leaves an empty Asset alone', () => {
      const actorType = {
        assetsHaveMultipleDice: false,
        assets: {
          0: asset({})
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toBeNull()
    })

    it('returns null when an Asset already has exactly one die', () => {
      const actorType = {
        assetsHaveMultipleDice: false,
        assets: {
          0: asset({ 0: '8' })
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toBeNull()
    })

    it('trims a multi-die Asset down to just its first die', () => {
      const actorType = {
        assetsHaveMultipleDice: false,
        assets: {
          0: asset({ 0: '8', 1: '6' })
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toEqual({
        unset: { 'system.actorType.assets.0.dice.-=value': null },
        set: { 'system.actorType.assets.0.dice.value': { 0: '8' } }
      })
    })

    it('trims a diverged temporaryValue in lockstep', () => {
      const actorType = {
        assetsHaveMultipleDice: false,
        assets: {
          0: asset({ 0: '8', 1: '6' }, { 0: '10' })
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toEqual({
        unset: {
          'system.actorType.assets.0.dice.-=value': null,
          'system.actorType.assets.0.dice.-=temporaryValue': null
        },
        set: {
          'system.actorType.assets.0.dice.value': { 0: '8' },
          'system.actorType.assets.0.dice.temporaryValue': { 0: '10' }
        }
      })
    })

    it('leaves Assets alone when assetsHaveMultipleDice is true (or unset)', () => {
      const actorType = {
        assetsHaveMultipleDice: true,
        assets: {
          0: asset({ 0: '8', 1: '6' })
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toBeNull()
      expect(computeTraitDiceNormalization({ assets: { 0: asset({ 0: '8', 1: '6' }) } })).toBeNull()
    })

    it('fixes multiple over-full Assets in a single batched result', () => {
      const actorType = {
        assetsHaveMultipleDice: false,
        assets: {
          0: asset({}),
          1: asset({ 0: '8', 1: '6' })
        }
      }

      expect(computeTraitDiceNormalization(actorType)).toEqual({
        unset: { 'system.actorType.assets.1.dice.-=value': null },
        set: { 'system.actorType.assets.1.dice.value': { 0: '8' } }
      })
    })
  })
})
