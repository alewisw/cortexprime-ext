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
  describeBaseParadox,
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

describe('describeBaseParadox', () => {
  it('shows a failed Vulgar roll starting from the opposition Effect die, unstepped', () => {
    expect(describeBaseParadox({
      magick: 'vulgar', outcome: PARADOX_OUTCOMES.LOST, paradoxSteps: 0, oppositionEffectDie: '8'
    })).toEqual({
      originKey: 'ParadoxStepBaseFromOpposition', originDie: '8', steps: 0, stepsFrom: 'each', die: '8'
    })
  })

  it('counts every hitch for Vulgar, and every hitch beyond the first for Coincidental', () => {
    expect(describeBaseParadox({
      magick: 'vulgar', outcome: PARADOX_OUTCOMES.LOST, paradoxSteps: 2, oppositionEffectDie: '4'
    })).toMatchObject({ originDie: '4', steps: 2, stepsFrom: 'each', die: '8' })

    expect(describeBaseParadox({
      magick: 'coincidental', outcome: PARADOX_OUTCOMES.BOTCH, paradoxSteps: 3
    })).toMatchObject({
      originKey: 'ParadoxStepBaseCoincidentalBotch', originDie: '6', steps: 2, stepsFrom: 'beyond-first', die: '10'
    })
  })

  it('never reports negative steps when a Coincidental botch had no hitches', () => {
    expect(describeBaseParadox({
      magick: 'coincidental', outcome: PARADOX_OUTCOMES.BOTCH, paradoxSteps: 0
    })).toMatchObject({ steps: 0, die: '6' })
  })

  it('agrees with computeBaseParadox everywhere, including where there is nothing to earn', () => {
    const cases = [
      { magick: 'vulgar', outcome: PARADOX_OUTCOMES.WON, paradoxSteps: 0 },
      { magick: 'vulgar', outcome: PARADOX_OUTCOMES.WON, paradoxSteps: 2 },
      { magick: 'vulgar-witnessed', outcome: PARADOX_OUTCOMES.WON, paradoxSteps: 1 },
      { magick: 'coincidental', outcome: PARADOX_OUTCOMES.LOST, paradoxSteps: 3 },
      { magick: 'none', outcome: PARADOX_OUTCOMES.BOTCH, paradoxSteps: 1 },
      { magick: 'vulgar', outcome: null, paradoxSteps: 1 }
    ]

    cases.forEach(context => {
      expect(describeBaseParadox(context)?.die ?? null).toBe(computeBaseParadox(context))
    })
  })
})

describe('buildParadoxLog', () => {
  // The screenshot case: Vulgar magick, roll lost against a D4 Effect die, no Shielding, and a
  // character already carrying D10 — the one whose arithmetic was previously unexplained.
  const lostAgainstD4 = {
    magick: 'vulgar',
    outcome: PARADOX_OUTCOMES.LOST,
    paradoxSteps: 0,
    oppositionEffectDie: '4',
    shieldingFace: null,
    shieldedParadox: '4',
    shieldingApplied: false,
    finalParadox: '12',
    currentParadox: '10'
  }

  it('lists the inputs that fed the calculation', () => {
    expect(buildParadoxLog(lostAgainstD4).inputs).toEqual([
      { label: 'ParadoxInputMagick', value: { key: 'MageMagickVulgar' } },
      { label: 'ParadoxInputOutcome', value: { key: 'Lost' } },
      { label: 'ParadoxInputOppositionEffect', value: { text: 'D4' } },
      { label: 'ParadoxInputHitchSteps', value: { text: '0' } },
      { label: 'ParadoxInputShielding', value: { key: 'None' } },
      { label: 'ParadoxInputCurrentParadox', value: { text: 'D10' } }
    ])
  })

  it('explains each step, including why an existing rating steps up rather than being replaced', () => {
    expect(buildParadoxLog(lostAgainstD4).steps).toEqual([
      { key: 'ParadoxStepBaseFromOpposition', data: { die: 'D4' } },
      { key: 'ParadoxStepShieldingNone', data: {} },
      { key: 'ParadoxStepFinalStepUp', data: { incoming: 'D4', current: 'D10', die: 'D12' } }
    ])
  })

  it('omits the opposition Effect die from the inputs when the roll was won', () => {
    const inputs = buildParadoxLog({
      ...lostAgainstD4, outcome: PARADOX_OUTCOMES.WON, paradoxSteps: 1, shieldedParadox: '6', finalParadox: '12'
    }).inputs

    expect(inputs.map(({ label }) => label)).not.toContain('ParadoxInputOppositionEffect')
  })

  it('accounts for the hitches that stepped the base die up', () => {
    const steps = buildParadoxLog({ ...lostAgainstD4, paradoxSteps: 2, shieldedParadox: '8' }).steps

    expect(steps[0]).toEqual({ key: 'ParadoxStepBaseFromOpposition', data: { die: 'D4' } })
    expect(steps[1]).toEqual({
      key: 'ParadoxStepHitches', data: { steps: 2, hitches: 2, from: 'D4', die: 'D8' }
    })
  })

  it('says the first Coincidental hitch only bought the base die', () => {
    const steps = buildParadoxLog({
      ...lostAgainstD4,
      magick: 'coincidental',
      outcome: PARADOX_OUTCOMES.BOTCH,
      paradoxSteps: 2,
      shieldedParadox: '8'
    }).steps

    expect(steps[1]).toEqual({
      key: 'ParadoxStepHitchesBeyondFirst', data: { steps: 1, hitches: 2, from: 'D6', die: 'D8' }
    })
  })

  it('reports how far above the Shielding the Paradox was when it was reduced', () => {
    const steps = buildParadoxLog({
      ...lostAgainstD4, oppositionEffectDie: '12', shieldingFace: '6', shieldedParadox: '10', shieldingApplied: true
    }).steps

    expect(steps[1]).toEqual({
      key: 'ParadoxStepShieldingReduced', data: { paradox: 'D12', shielding: 'D6', rungs: 3, die: 'D10' }
    })
  })

  it('reports an outright absorption, and has no final line to show', () => {
    const log = buildParadoxLog({
      ...lostAgainstD4,
      oppositionEffectDie: '6',
      shieldingFace: '8',
      shieldedParadox: null,
      shieldingApplied: true,
      finalParadox: null,
      currentParadox: null
    })

    expect(log.steps).toEqual([
      { key: 'ParadoxStepBaseFromOpposition', data: { die: 'D6' } },
      { key: 'ParadoxStepShieldingAbsorbed', data: { shielding: 'D8', paradox: 'D6' } }
    ])
  })

  it('says Shielding is off the table entirely for Witnessed magick', () => {
    const steps = buildParadoxLog({ ...lostAgainstD4, magick: 'vulgar-witnessed', shieldingFace: '8' }).steps

    expect(steps[1]).toEqual({ key: 'ParadoxStepShieldingWitnessed', data: {} })
    expect(buildParadoxLog({ ...lostAgainstD4, magick: 'vulgar-witnessed', shieldingFace: '8' }).inputs)
      .toContainEqual({ label: 'ParadoxInputShielding', value: { key: 'ParadoxShieldingNotApplicable' } })
  })

  it('explains a brand new Paradox, and an incoming die large enough to replace one', () => {
    expect(buildParadoxLog({ ...lostAgainstD4, currentParadox: null, finalParadox: '4' }).steps)
      .toContainEqual({ key: 'ParadoxStepFinalNew', data: { die: 'D4' } })

    expect(buildParadoxLog({
      ...lostAgainstD4, oppositionEffectDie: '12', shieldedParadox: '12', finalParadox: '12'
    }).steps).toContainEqual({
      key: 'ParadoxStepFinalReplaces', data: { incoming: 'D12', current: 'D10', die: 'D12' }
    })
  })

  it('explains the spill into Trauma when Paradox is already capped, and the descent into QUIET', () => {
    const log = buildParadoxLog({
      ...lostAgainstD4,
      currentParadox: '12',
      finalParadox: '12',
      finalTrauma: '12',
      currentTrauma: '12',
      descendIntoQuiet: true
    })

    expect(log.inputs).toContainEqual({ label: 'ParadoxInputCurrentTrauma', value: { text: 'D12' } })
    expect(log.steps.slice(2)).toEqual([
      { key: 'ParadoxStepFinalAtMax', data: { incoming: 'D4', die: 'D12' } },
      { key: 'ParadoxStepTraumaAtMax', data: { die: 'D12' } },
      { key: 'ParadoxStepQuiet', data: {} }
    ])
  })

  it('distinguishes a first Trauma from one stepping up off the minimum, or off a rating', () => {
    const traumaStep = currentTrauma => buildParadoxLog({
      ...lostAgainstD4, currentParadox: '12', finalParadox: '12', finalTrauma: '6', currentTrauma
    }).steps.at(-1)

    expect(traumaStep(null)).toEqual({ key: 'ParadoxStepTraumaNone', data: { die: 'D6' } })
    expect(traumaStep('4')).toEqual({ key: 'ParadoxStepTraumaFromMinimum', data: { from: 'D4', die: 'D6' } })
    expect(traumaStep('8')).toEqual({ key: 'ParadoxStepTraumaStepUp', data: { from: 'D8', die: 'D6' } })
  })

  it('leaves Trauma out of the inputs entirely when the Paradox never reached it', () => {
    expect(buildParadoxLog(lostAgainstD4).inputs.map(({ label }) => label))
      .not.toContain('ParadoxInputCurrentTrauma')
  })
})
