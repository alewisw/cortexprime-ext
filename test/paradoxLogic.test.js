import { describe, expect, it } from 'vitest'
import {
  LIMIT_STATES,
  PARADOX_OUTCOMES,
  applyShielding,
  buildParadoxLog,
  canHitchesStepUpParadox,
  computeBaseParadox,
  computeFinalParadox,
  computeFinalTrauma,
  computeLimitState,
  getParadoxOutcome,
  largestFace
} from '../module/mage/paradoxLogic.js'

const hitch = { faces: 8, result: 1 }
const hit = { faces: 8, result: 5 }

describe('largestFace', () => {
  it('returns the largest face as a string', () => {
    expect(largestFace([6, 10, 8])).toBe('10')
    expect(largestFace(['6', '12'])).toBe('12')
  })

  it('returns null for an empty or missing list', () => {
    expect(largestFace([])).toBeNull()
    expect(largestFace(undefined)).toBeNull()
  })
})

describe('getParadoxOutcome', () => {
  it('is null when the roll had no opposition', () => {
    expect(getParadoxOutcome(null, [hit])).toBeNull()
    expect(getParadoxOutcome(undefined, [hit])).toBeNull()
  })

  it('reads a win and a loss', () => {
    expect(getParadoxOutcome(true, [hit])).toBe(PARADOX_OUTCOMES.WON)
    expect(getParadoxOutcome(false, [hit])).toBe(PARADOX_OUTCOMES.LOST)
  })

  it('reads an all-ones roll as a botch rather than a loss', () => {
    expect(getParadoxOutcome(false, [hitch, hitch])).toBe(PARADOX_OUTCOMES.BOTCH)
  })

  it('is still null for a botch with no opposition', () => {
    expect(getParadoxOutcome(null, [hitch])).toBeNull()
  })
})

describe('canHitchesStepUpParadox', () => {
  it('always allows steps for Vulgar magick', () => {
    expect(canHitchesStepUpParadox('vulgar', PARADOX_OUTCOMES.WON)).toBe(true)
    expect(canHitchesStepUpParadox('vulgar-witnessed', PARADOX_OUTCOMES.LOST)).toBe(true)
  })

  it('allows steps for Coincidental magick only on a botch', () => {
    expect(canHitchesStepUpParadox('coincidental', PARADOX_OUTCOMES.BOTCH)).toBe(true)
    expect(canHitchesStepUpParadox('coincidental-witnessed', PARADOX_OUTCOMES.BOTCH)).toBe(true)
    expect(canHitchesStepUpParadox('coincidental', PARADOX_OUTCOMES.WON)).toBe(false)
    expect(canHitchesStepUpParadox('coincidental', PARADOX_OUTCOMES.LOST)).toBe(false)
  })

  it('never allows steps with no magick or no outcome', () => {
    expect(canHitchesStepUpParadox('none', PARADOX_OUTCOMES.BOTCH)).toBe(false)
    expect(canHitchesStepUpParadox('vulgar', null)).toBe(false)
  })
})

describe('computeBaseParadox', () => {
  describe('Coincidental / Coincidental Witnessed', () => {
    it('earns nothing on a win or a plain loss, however many hitches were spent', () => {
      expect(computeBaseParadox({ magick: 'coincidental', outcome: PARADOX_OUTCOMES.WON, paradoxSteps: 3 })).toBeNull()
      expect(computeBaseParadox({ magick: 'coincidental', outcome: PARADOX_OUTCOMES.LOST, paradoxSteps: 3 })).toBeNull()
      expect(computeBaseParadox({ magick: 'coincidental-witnessed', outcome: PARADOX_OUTCOMES.WON, paradoxSteps: 2 })).toBeNull()
    })

    // "D6 + one step for every hitch beyond the first" — so the first hitch buys nothing extra.
    it('is D6 on a botch with no hitches or a single hitch', () => {
      expect(computeBaseParadox({ magick: 'coincidental', outcome: PARADOX_OUTCOMES.BOTCH, paradoxSteps: 0 })).toBe('6')
      expect(computeBaseParadox({ magick: 'coincidental', outcome: PARADOX_OUTCOMES.BOTCH, paradoxSteps: 1 })).toBe('6')
    })

    it('steps up once per hitch beyond the first, capped at D12', () => {
      expect(computeBaseParadox({ magick: 'coincidental', outcome: PARADOX_OUTCOMES.BOTCH, paradoxSteps: 2 })).toBe('8')
      expect(computeBaseParadox({ magick: 'coincidental', outcome: PARADOX_OUTCOMES.BOTCH, paradoxSteps: 3 })).toBe('10')
      expect(computeBaseParadox({ magick: 'coincidental', outcome: PARADOX_OUTCOMES.BOTCH, paradoxSteps: 4 })).toBe('12')
      expect(computeBaseParadox({ magick: 'coincidental', outcome: PARADOX_OUTCOMES.BOTCH, paradoxSteps: 9 })).toBe('12')
    })
  })

  describe('Vulgar', () => {
    it('earns nothing on a win with no hitches spent', () => {
      expect(computeBaseParadox({ magick: 'vulgar', outcome: PARADOX_OUTCOMES.WON, paradoxSteps: 0 })).toBeNull()
    })

    it('steps a D4 up once per hitch on a win', () => {
      expect(computeBaseParadox({ magick: 'vulgar', outcome: PARADOX_OUTCOMES.WON, paradoxSteps: 1 })).toBe('6')
      expect(computeBaseParadox({ magick: 'vulgar', outcome: PARADOX_OUTCOMES.WON, paradoxSteps: 2 })).toBe('8')
      expect(computeBaseParadox({ magick: 'vulgar', outcome: PARADOX_OUTCOMES.WON, paradoxSteps: 3 })).toBe('10')
      expect(computeBaseParadox({ magick: 'vulgar', outcome: PARADOX_OUTCOMES.WON, paradoxSteps: 4 })).toBe('12')
      expect(computeBaseParadox({ magick: 'vulgar', outcome: PARADOX_OUTCOMES.WON, paradoxSteps: 7 })).toBe('12')
    })

    it('starts from the opposition effect die on a loss or botch, stepping once per hitch', () => {
      expect(computeBaseParadox({
        magick: 'vulgar', outcome: PARADOX_OUTCOMES.LOST, paradoxSteps: 0, oppositionEffectDie: '8'
      })).toBe('8')
      expect(computeBaseParadox({
        magick: 'vulgar', outcome: PARADOX_OUTCOMES.BOTCH, paradoxSteps: 2, oppositionEffectDie: '6'
      })).toBe('10')
    })
  })

  describe('Vulgar Witnessed', () => {
    it('is a flat D6 on a win, stepping once per hitch', () => {
      expect(computeBaseParadox({ magick: 'vulgar-witnessed', outcome: PARADOX_OUTCOMES.WON, paradoxSteps: 0 })).toBe('6')
      expect(computeBaseParadox({ magick: 'vulgar-witnessed', outcome: PARADOX_OUTCOMES.WON, paradoxSteps: 1 })).toBe('8')
      expect(computeBaseParadox({ magick: 'vulgar-witnessed', outcome: PARADOX_OUTCOMES.WON, paradoxSteps: 4 })).toBe('12')
    })

    it('starts from the opposition effect die on a loss or botch', () => {
      expect(computeBaseParadox({
        magick: 'vulgar-witnessed', outcome: PARADOX_OUTCOMES.LOST, paradoxSteps: 1, oppositionEffectDie: '10'
      })).toBe('12')
    })
  })

  it('defaults the opposition effect die to D4 when none was recorded', () => {
    expect(computeBaseParadox({ magick: 'vulgar', outcome: PARADOX_OUTCOMES.LOST, paradoxSteps: 0 })).toBe('4')
  })

  it('earns nothing when there is no outcome or no magick', () => {
    expect(computeBaseParadox({ magick: 'vulgar', outcome: null, paradoxSteps: 3 })).toBeNull()
    expect(computeBaseParadox({ magick: 'none', outcome: PARADOX_OUTCOMES.BOTCH, paradoxSteps: 3 })).toBeNull()
  })
})

describe('applyShielding', () => {
  it('absorbs a Paradox at or below the Shielding die', () => {
    expect(applyShielding('6', '8', 'vulgar')).toEqual({ paradox: null, applied: true })
    expect(applyShielding('8', '8', 'vulgar')).toEqual({ paradox: null, applied: true })
  })

  it('converts by how many rungs the Paradox exceeds the Shielding', () => {
    expect(applyShielding('10', '8', 'vulgar')).toEqual({ paradox: '6', applied: true })
    expect(applyShielding('10', '6', 'vulgar')).toEqual({ paradox: '8', applied: true })
    expect(applyShielding('10', '4', 'vulgar')).toEqual({ paradox: '10', applied: true })
    expect(applyShielding('12', '4', 'vulgar')).toEqual({ paradox: '10', applied: true })
  })

  it('does nothing for Witnessed magick', () => {
    expect(applyShielding('10', '12', 'vulgar-witnessed')).toEqual({ paradox: '10', applied: false })
    expect(applyShielding('10', '12', 'coincidental-witnessed')).toEqual({ paradox: '10', applied: false })
  })

  it('does nothing when the Scene has no Shielding die', () => {
    expect(applyShielding('10', null, 'vulgar')).toEqual({ paradox: '10', applied: false })
  })

  it('does nothing when there is no Paradox die to shield against', () => {
    expect(applyShielding(null, '8', 'vulgar')).toEqual({ paradox: null, applied: false })
  })
})

describe('computeFinalParadox', () => {
  it('takes the Paradox die when the Player carries none', () => {
    expect(computeFinalParadox('8', null)).toEqual({ finalParadox: '8', needsTrauma: false })
  })

  it('takes the Paradox die when it is larger than the existing trait', () => {
    expect(computeFinalParadox('10', '6')).toEqual({ finalParadox: '10', needsTrauma: false })
  })

  it('steps the existing trait up when the Paradox die is equal or smaller', () => {
    expect(computeFinalParadox('6', '6')).toEqual({ finalParadox: '8', needsTrauma: false })
    expect(computeFinalParadox('4', '8')).toEqual({ finalParadox: '10', needsTrauma: false })
    expect(computeFinalParadox('4', '10')).toEqual({ finalParadox: '12', needsTrauma: false })
  })

  it('spills over into Trauma when the existing trait is already D12', () => {
    expect(computeFinalParadox('8', '12')).toEqual({ finalParadox: '12', needsTrauma: true })
  })

  it('does not spill into Trauma when the incoming die beats a D12 trait (it cannot)', () => {
    expect(computeFinalParadox('12', '12')).toEqual({ finalParadox: '12', needsTrauma: true })
  })

  it('is nothing when there is no Paradox die', () => {
    expect(computeFinalParadox(null, '8')).toEqual({ finalParadox: null, needsTrauma: false })
  })
})

describe('computeFinalTrauma', () => {
  it('starts at D6 from nothing or D4', () => {
    expect(computeFinalTrauma(null)).toEqual({ finalTrauma: '6', descendIntoQuiet: false })
    expect(computeFinalTrauma('4')).toEqual({ finalTrauma: '6', descendIntoQuiet: false })
  })

  it('steps up one rung otherwise', () => {
    expect(computeFinalTrauma('6')).toEqual({ finalTrauma: '8', descendIntoQuiet: false })
    expect(computeFinalTrauma('8')).toEqual({ finalTrauma: '10', descendIntoQuiet: false })
    expect(computeFinalTrauma('10')).toEqual({ finalTrauma: '12', descendIntoQuiet: false })
  })

  it('descends into QUIET at D12', () => {
    expect(computeFinalTrauma('12')).toEqual({ finalTrauma: '12', descendIntoQuiet: true })
  })
})

describe('computeLimitState', () => {
  it('cannot limit a Vulgar botch', () => {
    expect(computeLimitState({
      magick: 'vulgar', outcome: PARADOX_OUTCOMES.BOTCH, finalParadox: '6', powersFaces: ['12']
    })).toBe(LIMIT_STATES.VULGAR_BOTCH)
    expect(computeLimitState({
      magick: 'vulgar-witnessed', outcome: PARADOX_OUTCOMES.BOTCH, finalParadox: '6', powersFaces: ['12']
    })).toBe(LIMIT_STATES.VULGAR_BOTCH)
  })

  it('can limit a Coincidental botch', () => {
    expect(computeLimitState({
      magick: 'coincidental', outcome: PARADOX_OUTCOMES.BOTCH, finalParadox: '6', powersFaces: ['8']
    })).toBe(LIMIT_STATES.AVAILABLE)
  })

  it('is too large when the Paradox exceeds every Powers die in the roll', () => {
    expect(computeLimitState({
      magick: 'vulgar', outcome: PARADOX_OUTCOMES.WON, finalParadox: '10', powersFaces: ['6', '8']
    })).toBe(LIMIT_STATES.TOO_LARGE)
  })

  it('is available when any Powers die matches or beats the Paradox', () => {
    expect(computeLimitState({
      magick: 'vulgar', outcome: PARADOX_OUTCOMES.WON, finalParadox: '8', powersFaces: ['6', '8']
    })).toBe(LIMIT_STATES.AVAILABLE)
    expect(computeLimitState({
      magick: 'vulgar', outcome: PARADOX_OUTCOMES.WON, finalParadox: '6', powersFaces: ['12']
    })).toBe(LIMIT_STATES.AVAILABLE)
  })

  // Nothing to spend as a Limit, so vacuously "too large".
  it('is too large when the roll contained no Powers dice at all', () => {
    expect(computeLimitState({
      magick: 'vulgar', outcome: PARADOX_OUTCOMES.WON, finalParadox: '4', powersFaces: []
    })).toBe(LIMIT_STATES.TOO_LARGE)
  })
})

describe('buildParadoxLog', () => {
  it('logs just the base and final Paradox when Shielding did not apply', () => {
    expect(buildParadoxLog({
      baseParadox: '6', shieldedParadox: '6', shieldingApplied: false, finalParadox: '6'
    })).toEqual([
      { key: 'ParadoxLogBase', data: { die: 'D6' } },
      { key: 'ParadoxLogFinal', data: { die: 'D6' } }
    ])
  })

  it('logs the shielded value when Shielding shrank the Paradox', () => {
    expect(buildParadoxLog({
      baseParadox: '10', shieldedParadox: '6', shieldingApplied: true, finalParadox: '6'
    })).toEqual([
      { key: 'ParadoxLogBase', data: { die: 'D10' } },
      { key: 'ParadoxLogShielded', data: { die: 'D6' } },
      { key: 'ParadoxLogFinal', data: { die: 'D6' } }
    ])
  })

  it('logs an absorbed Paradox with no final line', () => {
    expect(buildParadoxLog({
      baseParadox: '6', shieldedParadox: null, shieldingApplied: true, finalParadox: null
    })).toEqual([
      { key: 'ParadoxLogBase', data: { die: 'D6' } },
      { key: 'ParadoxLogShieldedAbsorbed', data: {} }
    ])
  })

  it('logs Trauma and QUIET when they apply', () => {
    expect(buildParadoxLog({
      baseParadox: '8',
      shieldedParadox: '8',
      shieldingApplied: false,
      finalParadox: '12',
      finalTrauma: '12',
      descendIntoQuiet: true
    })).toEqual([
      { key: 'ParadoxLogBase', data: { die: 'D8' } },
      { key: 'ParadoxLogFinal', data: { die: 'D12' } },
      { key: 'ParadoxLogTrauma', data: { die: 'D12' } },
      { key: 'ParadoxLogQuiet', data: {} }
    ])
  })

  it('shows the Final Paradox as a transition when the Player already carries a rating', () => {
    expect(buildParadoxLog({
      baseParadox: '6', shieldedParadox: '6', shieldingApplied: false, finalParadox: '8', currentParadox: '6'
    })).toEqual([
      { key: 'ParadoxLogBase', data: { die: 'D6' } },
      { key: 'ParadoxLogFinalFrom', data: { from: 'D6', die: 'D8' } }
    ])
  })

  it('shows the Final Trauma as a transition when the Player already carries a Trauma rating', () => {
    expect(buildParadoxLog({
      baseParadox: '8',
      shieldedParadox: '8',
      shieldingApplied: false,
      finalParadox: '12',
      finalTrauma: '10',
      currentParadox: '12',
      currentTrauma: '8'
    })).toEqual([
      { key: 'ParadoxLogBase', data: { die: 'D8' } },
      { key: 'ParadoxLogFinalFrom', data: { from: 'D12', die: 'D12' } },
      { key: 'ParadoxLogTraumaFrom', data: { from: 'D8', die: 'D10' } }
    ])
  })

  it('keeps the plain form for a Player with no existing rating on either trait', () => {
    expect(buildParadoxLog({
      baseParadox: '8',
      shieldedParadox: '8',
      shieldingApplied: false,
      finalParadox: '8',
      finalTrauma: '6',
      currentParadox: null,
      currentTrauma: null
    })).toEqual([
      { key: 'ParadoxLogBase', data: { die: 'D8' } },
      { key: 'ParadoxLogFinal', data: { die: 'D8' } },
      { key: 'ParadoxLogTrauma', data: { die: 'D6' } }
    ])
  })
})
