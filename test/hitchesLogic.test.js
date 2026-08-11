import { describe, expect, it } from 'vitest'
import {
  DOOM_DIE_STEP_OPTIONS,
  HITCH_ACTIONS,
  computePlotPoints,
  computeProjection,
  getAvailableActions,
  getComplicationOptions,
  isBotch,
  stepUpDoomDie
} from '../module/scripts/hitchesLogic.js'

const row = overrides => ({
  faces: 8,
  result: 1,
  action: HITCH_ACTIONS.NONE,
  complicationName: '',
  complicationKey: '',
  renameComplication: '',
  doomDieSize: '',
  ...overrides
})

describe('isBotch', () => {
  it('is true when every rolled die came up 1', () => {
    expect(isBotch([{ faces: 8, result: 1 }, { faces: 4, result: 1 }])).toBe(true)
  })

  it('is false when any die beat a 1', () => {
    expect(isBotch([{ faces: 8, result: 1 }, { faces: 6, result: 5 }])).toBe(false)
  })

  it('is false for an empty roll', () => {
    expect(isBotch([])).toBe(false)
  })
})

describe('getAvailableActions', () => {
  it('offers only the complication options when nothing else is configured', () => {
    expect(getAvailableActions({ hasDoomPool: false, isMage: false, magick: null })).toEqual([
      HITCH_ACTIONS.NONE,
      HITCH_ACTIONS.INTRODUCE_COMPLICATION,
      HITCH_ACTIONS.STEP_UP_COMPLICATION
    ])
  })

  it('adds the Doom Pool options once a Doom Pool is configured', () => {
    const actions = getAvailableActions({ hasDoomPool: true, isMage: false, magick: null })

    expect(actions).toContain(HITCH_ACTIONS.ADD_DOOM_DIE)
    expect(actions).toContain(HITCH_ACTIONS.STEP_UP_DOOM_DIE)
  })

  it('offers Paradox only under the Mage rule set with a magical roll', () => {
    expect(getAvailableActions({ hasDoomPool: false, isMage: true, magick: 'vulgar' }))
      .toContain(HITCH_ACTIONS.STEP_UP_PARADOX)
    expect(getAvailableActions({ hasDoomPool: false, isMage: true, magick: 'none' }))
      .not.toContain(HITCH_ACTIONS.STEP_UP_PARADOX)
    expect(getAvailableActions({ hasDoomPool: false, isMage: false, magick: 'vulgar' }))
      .not.toContain(HITCH_ACTIONS.STEP_UP_PARADOX)
  })

  it('adds the scene complication options once a scene actor is linked', () => {
    const actions = getAvailableActions({ hasDoomPool: false, hasSceneActor: true, isMage: false, magick: null })

    expect(actions).toContain(HITCH_ACTIONS.INTRODUCE_SCENE_COMPLICATION)
    expect(actions).toContain(HITCH_ACTIONS.STEP_UP_SCENE_COMPLICATION)
  })

  it('hides the scene complication options without a linked scene actor', () => {
    const actions = getAvailableActions({ hasDoomPool: false, hasSceneActor: false, isMage: false, magick: null })

    expect(actions).not.toContain(HITCH_ACTIONS.INTRODUCE_SCENE_COMPLICATION)
    expect(actions).not.toContain(HITCH_ACTIONS.STEP_UP_SCENE_COMPLICATION)
  })
})

describe('getComplicationOptions', () => {
  it('lists the sheet complications plus any introduced in this dialog', () => {
    const complications = [{ label: 'Winded', dice: ['6'] }]
    const rows = [
      row({ action: HITCH_ACTIONS.INTRODUCE_COMPLICATION, complicationName: 'On Fire' }),
      row({ action: HITCH_ACTIONS.NONE })
    ]

    expect(getComplicationOptions(complications, rows)).toEqual([
      { key: 'existing:0', label: 'Winded' },
      { key: 'pending:0', label: 'On Fire' }
    ])
  })

  it('falls back to the default label for an unnamed new complication', () => {
    const rows = [row({ action: HITCH_ACTIONS.INTRODUCE_COMPLICATION })]

    expect(getComplicationOptions([], rows, 'New Complication')).toEqual([
      { key: 'pending:0', label: 'New Complication' }
    ])
  })

  it('only counts introduce rows of the matching type', () => {
    const rows = [
      row({ action: HITCH_ACTIONS.INTRODUCE_COMPLICATION, complicationName: 'On Fire' }),
      row({ action: HITCH_ACTIONS.INTRODUCE_SCENE_COMPLICATION, complicationName: 'Collapsing' })
    ]

    expect(getComplicationOptions([], rows, 'Complication', HITCH_ACTIONS.INTRODUCE_SCENE_COMPLICATION))
      .toEqual([{ key: 'pending:1', label: 'Collapsing' }])
  })
})

describe('DOOM_DIE_STEP_OPTIONS', () => {
  it('offers the whole ladder below D12, which has nowhere to step up to', () => {
    expect(DOOM_DIE_STEP_OPTIONS).toEqual(['4', '6', '8', '10'])
  })
})

describe('stepUpDoomDie', () => {
  it('steps up the lowest die at or above the picked size', () => {
    expect(stepUpDoomDie(['4', '8', '10'], '6')).toEqual(['4', '10', '10'])
  })

  it('steps up an exact match in preference to a larger die', () => {
    expect(stepUpDoomDie(['6', '10'], '6')).toEqual(['8', '10'])
  })

  it('leaves the pool alone when no die is large enough', () => {
    expect(stepUpDoomDie(['4', '6'], '10')).toEqual(['4', '6'])
  })

  it('clamps a D12 rather than wrapping it', () => {
    expect(stepUpDoomDie(['12'], '12')).toEqual(['12'])
  })
})

// A non-hitch die included alongside the rows actually under test, purely so the set as a whole
// isn't a botch (every row hitching) — computePlotPoints zeroes a botch outright regardless of
// picks, which is covered in its own tests below, so the "normal counting" tests need at least one
// die that beat a 1 to stay a meaningful, non-botch roll.
const nonHitchRow = row({ result: 5, faces: 6 })

describe('computePlotPoints', () => {
  it('counts one per Doom Pool add, Doom Pool step up and Paradox step up', () => {
    const rows = [
      nonHitchRow,
      row({ action: HITCH_ACTIONS.ADD_DOOM_DIE }),
      row({ action: HITCH_ACTIONS.STEP_UP_DOOM_DIE, doomDieSize: '8' }),
      row({ action: HITCH_ACTIONS.STEP_UP_PARADOX })
    ]

    expect(computePlotPoints(rows)).toBe(3)
  })

  it('counts nothing for rows left on "do not activate"', () => {
    expect(computePlotPoints([nonHitchRow, row(), row()])).toBe(0)
  })

  it('counts each distinct complication once', () => {
    const rows = [
      nonHitchRow,
      row({ action: HITCH_ACTIONS.INTRODUCE_COMPLICATION, complicationName: 'On Fire' }),
      row({ action: HITCH_ACTIONS.STEP_UP_COMPLICATION, complicationKey: 'existing:0' })
    ]

    expect(computePlotPoints(rows)).toBe(2)
  })

  it('counts introducing a complication and then stepping that same one up as a single point', () => {
    const rows = [
      nonHitchRow,
      row({ action: HITCH_ACTIONS.INTRODUCE_COMPLICATION, complicationName: 'On Fire' }),
      // Pending keys are row-relative, so this points at the row above (index 1).
      row({ action: HITCH_ACTIONS.STEP_UP_COMPLICATION, complicationKey: 'pending:1' })
    ]

    expect(computePlotPoints(rows)).toBe(1)
  })

  it('counts two step-up rows targeting the same complication once', () => {
    const rows = [
      nonHitchRow,
      row({ action: HITCH_ACTIONS.STEP_UP_COMPLICATION, complicationKey: 'existing:0' }),
      row({ action: HITCH_ACTIONS.STEP_UP_COMPLICATION, complicationKey: 'existing:0' })
    ]

    expect(computePlotPoints(rows)).toBe(1)
  })

  it('counts scene complications independently of character complications', () => {
    const rows = [
      nonHitchRow,
      row({ action: HITCH_ACTIONS.INTRODUCE_COMPLICATION, complicationName: 'On Fire' }),
      row({ action: HITCH_ACTIONS.INTRODUCE_SCENE_COMPLICATION, complicationName: 'Collapsing' })
    ]

    expect(computePlotPoints(rows)).toBe(2)
  })

  // Both rows carry the row-relative key "existing:0" — one against the character's complication
  // list, one against the scene's. They must NOT be treated as the same complication.
  it('does not let a character row and a scene row with the same key collapse into one point', () => {
    const rows = [
      nonHitchRow,
      row({ action: HITCH_ACTIONS.STEP_UP_COMPLICATION, complicationKey: 'existing:0' }),
      row({ action: HITCH_ACTIONS.STEP_UP_SCENE_COMPLICATION, complicationKey: 'existing:0' })
    ]

    expect(computePlotPoints(rows)).toBe(2)
  })

  // A BOTCH (every die came up 1) never earns Plot Points, no matter what the GM picks — this is
  // a deliberate override, separate from and taking priority over the normal per-action counting
  // above.
  it('is 0 for a botch no matter what the GM picks', () => {
    const rows = [
      row({ action: HITCH_ACTIONS.INTRODUCE_COMPLICATION, complicationName: 'On Fire' }),
      row({ action: HITCH_ACTIONS.ADD_DOOM_DIE }),
      row({ action: HITCH_ACTIONS.STEP_UP_DOOM_DIE, doomDieSize: '8' }),
      row({ action: HITCH_ACTIONS.STEP_UP_PARADOX })
    ]

    expect(isBotch(rows)).toBe(true)
    expect(computePlotPoints(rows)).toBe(0)
  })

  it('is 0 for a single-die botch', () => {
    expect(computePlotPoints([row({ action: HITCH_ACTIONS.ADD_DOOM_DIE })])).toBe(0)
  })

  it('is non-zero for the same picks once at least one die beats a 1', () => {
    const rows = [
      nonHitchRow,
      row({ action: HITCH_ACTIONS.INTRODUCE_COMPLICATION, complicationName: 'On Fire' }),
      row({ action: HITCH_ACTIONS.ADD_DOOM_DIE })
    ]

    expect(isBotch(rows)).toBe(false)
    expect(computePlotPoints(rows)).toBe(2)
  })
})

describe('computeProjection', () => {
  it('introduces new complications at D6', () => {
    const projection = computeProjection({
      rows: [row({ action: HITCH_ACTIONS.INTRODUCE_COMPLICATION, complicationName: 'On Fire' })],
      complications: [],
      doomDice: []
    })

    expect(projection.complications).toEqual([{ label: 'On Fire', dice: ['6'], isNew: true }])
  })

  it('steps up an existing complication', () => {
    const projection = computeProjection({
      rows: [row({ action: HITCH_ACTIONS.STEP_UP_COMPLICATION, complicationKey: 'existing:0' })],
      complications: [{ label: 'Winded', dice: ['6'] }],
      doomDice: []
    })

    expect(projection.complications[0].dice).toEqual(['8'])
    expect(projection.takenOut).toEqual([])
  })

  it('renames a complication as it steps it up', () => {
    const projection = computeProjection({
      rows: [row({
        action: HITCH_ACTIONS.STEP_UP_COMPLICATION,
        complicationKey: 'existing:0',
        renameComplication: 'Badly Winded'
      })],
      complications: [{ label: 'Winded', dice: ['6'] }],
      doomDice: []
    })

    expect(projection.complications[0]).toEqual({ label: 'Badly Winded', dice: ['8'], isSteppedUp: true })
  })

  it('keeps the existing name when the rename is left blank', () => {
    const projection = computeProjection({
      rows: [row({ action: HITCH_ACTIONS.STEP_UP_COMPLICATION, complicationKey: 'existing:0' })],
      complications: [{ label: 'Winded', dice: ['6'] }],
      doomDice: []
    })

    expect(projection.complications[0].label).toBe('Winded')
  })

  it('renames a D12 complication even though it cannot step up, and reports the new name', () => {
    const projection = computeProjection({
      rows: [row({
        action: HITCH_ACTIONS.STEP_UP_COMPLICATION,
        complicationKey: 'existing:0',
        renameComplication: 'Bleeding Out Badly'
      })],
      complications: [{ label: 'Bleeding Out', dice: ['12'] }],
      doomDice: []
    })

    expect(projection.complications[0].label).toBe('Bleeding Out Badly')
    expect(projection.takenOut).toEqual(['Bleeding Out Badly'])
  })

  it('can rename a complication introduced by an earlier row', () => {
    const projection = computeProjection({
      rows: [
        row({ action: HITCH_ACTIONS.INTRODUCE_COMPLICATION, complicationName: 'On Fire' }),
        row({
          action: HITCH_ACTIONS.STEP_UP_COMPLICATION,
          complicationKey: 'pending:0',
          renameComplication: 'Well Alight'
        })
      ],
      complications: [],
      doomDice: []
    })

    expect(projection.complications[0].label).toBe('Well Alight')
  })

  it('reports only the complications this roll actually changed', () => {
    const projection = computeProjection({
      rows: [
        row({ action: HITCH_ACTIONS.STEP_UP_COMPLICATION, complicationKey: 'existing:1' }),
        row({ action: HITCH_ACTIONS.INTRODUCE_COMPLICATION, complicationName: 'On Fire' })
      ],
      complications: [{ label: 'Untouched', dice: ['6'] }, { label: 'Winded', dice: ['6'] }],
      doomDice: []
    })

    expect(projection.complications).toHaveLength(3)
    expect(projection.changedComplications).toEqual([
      { label: 'Winded', dice: ['8'], isSteppedUp: true },
      { label: 'On Fire', dice: ['6'], isNew: true }
    ])
  })

  it('reports nothing as changed when no row touches a complication', () => {
    const projection = computeProjection({
      rows: [row({ action: HITCH_ACTIONS.ADD_DOOM_DIE })],
      complications: [{ label: 'Winded', dice: ['6'] }],
      doomDice: []
    })

    expect(projection.changedComplications).toEqual([])
  })

  it('can step up a complication introduced by an earlier row', () => {
    const projection = computeProjection({
      rows: [
        row({ action: HITCH_ACTIONS.INTRODUCE_COMPLICATION, complicationName: 'On Fire' }),
        row({ action: HITCH_ACTIONS.STEP_UP_COMPLICATION, complicationKey: 'pending:0' })
      ],
      complications: [],
      doomDice: []
    })

    // Introduced and then stepped up by a later row, so it carries both markers.
    expect(projection.complications).toEqual([{ label: 'On Fire', dice: ['8'], isNew: true, isSteppedUp: true }])
  })

  it('leaves a D12 complication at D12 and reports it as taken out', () => {
    const projection = computeProjection({
      rows: [row({ action: HITCH_ACTIONS.STEP_UP_COMPLICATION, complicationKey: 'existing:0' })],
      complications: [{ label: 'Bleeding Out', dice: ['12'] }],
      doomDice: []
    })

    expect(projection.complications[0].dice).toEqual(['12'])
    expect(projection.takenOut).toEqual(['Bleeding Out'])
    // Reported as taken out rather than as a change — nothing about it actually moved.
    expect(projection.changedComplications).toEqual([])
  })

  it('adds the hitched die size to the Doom Pool', () => {
    const projection = computeProjection({
      rows: [row({ faces: 10, action: HITCH_ACTIONS.ADD_DOOM_DIE })],
      complications: [],
      doomDice: ['6']
    })

    expect(projection.doomDice).toEqual(['6', '10'])
  })

  // The step up row is listed FIRST here, so it can only find a d6 to step up if every add has
  // already been applied — which is the ordering the rules call for.
  it('applies Doom Pool adds before step ups, so a queued die can be stepped up', () => {
    const projection = computeProjection({
      rows: [
        row({ faces: 6, action: HITCH_ACTIONS.STEP_UP_DOOM_DIE, doomDieSize: '6' }),
        row({ faces: 6, action: HITCH_ACTIONS.ADD_DOOM_DIE })
      ],
      complications: [],
      doomDice: []
    })

    expect(projection.doomDice).toEqual(['8'])
  })

  it('marks which Doom Pool dice were added and which were stepped up', () => {
    const projection = computeProjection({
      rows: [
        row({ faces: 6, action: HITCH_ACTIONS.ADD_DOOM_DIE }),
        row({ action: HITCH_ACTIONS.STEP_UP_DOOM_DIE, doomDieSize: '10' })
      ],
      complications: [],
      doomDice: ['10']
    })

    expect(projection.doomDice).toEqual(['12', '6'])
    expect(projection.doomDiceDetail).toEqual([
      { face: '12', isSteppedUp: true },
      { face: '6', isNew: true }
    ])
  })

  it('marks a die that was both added and then stepped up', () => {
    const projection = computeProjection({
      rows: [
        row({ faces: 6, action: HITCH_ACTIONS.ADD_DOOM_DIE }),
        row({ action: HITCH_ACTIONS.STEP_UP_DOOM_DIE, doomDieSize: '6' })
      ],
      complications: [],
      doomDice: []
    })

    expect(projection.doomDiceDetail).toEqual([{ face: '8', isNew: true, isSteppedUp: true }])
  })

  it('does not mark a D12 as stepped up, since it cannot grow', () => {
    const projection = computeProjection({
      rows: [row({ action: HITCH_ACTIONS.STEP_UP_DOOM_DIE, doomDieSize: '10' })],
      complications: [],
      doomDice: ['12']
    })

    expect(projection.doomDiceDetail).toEqual([{ face: '12' }])
  })

  it('counts Paradox steps without changing anything else', () => {
    const projection = computeProjection({
      rows: [row({ action: HITCH_ACTIONS.STEP_UP_PARADOX })],
      complications: [{ label: 'Winded', dice: ['6'] }],
      doomDice: ['8']
    })

    expect(projection.paradoxSteps).toBe(1)
    expect(projection.complications).toEqual([{ label: 'Winded', dice: ['6'] }])
    expect(projection.doomDice).toEqual(['8'])
  })

  it('projects scene complications independently of character complications, with identical mechanics', () => {
    const projection = computeProjection({
      rows: [
        row({ action: HITCH_ACTIONS.INTRODUCE_COMPLICATION, complicationName: 'On Fire' }),
        row({ action: HITCH_ACTIONS.INTRODUCE_SCENE_COMPLICATION, complicationName: 'Collapsing' }),
        row({ action: HITCH_ACTIONS.STEP_UP_SCENE_COMPLICATION, complicationKey: 'existing:0' })
      ],
      complications: [],
      sceneComplications: [{ label: 'Unstable', dice: ['12'] }],
      doomDice: []
    })

    expect(projection.complications).toEqual([{ label: 'On Fire', dice: ['6'], isNew: true }])
    expect(projection.sceneComplications).toEqual([
      { label: 'Unstable', dice: ['12'] },
      { label: 'Collapsing', dice: ['6'], isNew: true }
    ])
    // The scene's own D12 complication took the same TAKEN OUT path character complications do.
    expect(projection.sceneTakenOut).toEqual(['Unstable'])
    expect(projection.changedSceneComplications).toEqual([{ label: 'Collapsing', dice: ['6'], isNew: true }])
    // Untouched by anything scene-related.
    expect(projection.takenOut).toEqual([])
  })

  it('defaults sceneComplications to empty when no scene actor is linked', () => {
    const projection = computeProjection({
      rows: [row({ action: HITCH_ACTIONS.INTRODUCE_COMPLICATION, complicationName: 'On Fire' })],
      complications: [],
      doomDice: []
    })

    expect(projection.sceneComplications).toEqual([])
    expect(projection.changedSceneComplications).toEqual([])
    expect(projection.sceneTakenOut).toEqual([])
  })

  it('does not mutate the complications or Doom Pool it was given', () => {
    const complications = [{ label: 'Winded', dice: ['6'] }]
    const doomDice = ['8']

    computeProjection({
      rows: [
        row({ action: HITCH_ACTIONS.STEP_UP_COMPLICATION, complicationKey: 'existing:0' }),
        row({ faces: 6, action: HITCH_ACTIONS.ADD_DOOM_DIE })
      ],
      complications,
      doomDice
    })

    expect(complications).toEqual([{ label: 'Winded', dice: ['6'] }])
    expect(doomDice).toEqual(['8'])
  })
})
