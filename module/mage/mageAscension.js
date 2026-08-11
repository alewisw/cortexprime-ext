// "Mage: The Ascension Engine" custom rule set — Challenge automation. Entirely self-contained:
// registers its own world setting and reacts via Hooks/DOM injection into the already-rendered
// Dice Pool tray, the same way module/scripts/sceneDistinctionActor.js injects a field into
// Foundry's own Scene Configuration. Never modifies UserDicePool.js, dice-pool.html,
// dicePoolValidation.js, rollToBeat.js, or settings.js — only imports their existing exports.
import { getLength } from '../../lib/helpers.js'
import { localizer } from '../scripts/foundryHelpers.js'
import { flattenPoolEntries } from '../scripts/dicePoolValidation.js'
import { getEffectiveDiceMap } from '../scripts/traitDiceTemporary.js'
import { getActiveChallenge, getRollToBeatTargets, hasInitiatorRolled } from '../scripts/rollToBeat.js'
import {
  computeGmRealityReinforcementDiceMap,
  computeMagePoolInvalidReason,
  computeRealityReinforcementSync,
  getCurrentRollerIds,
  getMagickLabelKey,
  isMageRuleSetActive,
  shouldShowChallengeBox
} from './mageAscensionLogic.js'

const REALITY_REINFORCEMENT_SOURCE = 'Reality Reinforcement'

const CHALLENGE_TYPE_LABEL_KEYS = { test: 'Test', contest: 'Contest', group: 'Group' }

const getMageChallengeState = () => game.settings.get('cortexprime', 'mageChallengeState')

const getMyId = () => game.user.isGM ? 'gm' : game.user.character?.id

const refreshDicePool = () => {
  const dicePool = game.cortexprime.UserDicePool

  if (dicePool?.rendered) dicePool.render(true)
}

// The tray uses height:'auto', so Foundry already measured and fixed the window's height before
// this hook ran — content injected straight into the DOM (the challenge box, the validation
// message) is extra height it never accounted for, pushing the roll buttons below the window's
// bottom edge. Re-triggering the auto-height calculation now that the content actually exists
// fixes that. Called last, after all DOM injection/listener wiring is done, and guarded — if
// setPosition ever throws, it must never take the rest of the render hook down with it, since
// that would silently skip attaching the radio change listeners below it.
const resizeToFitContent = app => {
  try {
    app.setPosition({ height: 'auto' })
  } catch (error) {
    console.warn('CP | Mage Ascension: could not resize the Dice Pool tray', error)
  }
}

// ---- GM Dice Pool tray: inject the Magick/Reality Reinforcement box ----

const injectChallengeBox = async (app, html) => {
  if (!game.user.isGM) return

  const customRuleSet = game.settings.get('cortexprime', 'customRuleSet')
  const activeChallenge = getActiveChallenge()

  if (!shouldShowChallengeBox(customRuleSet, activeChallenge)) return

  const element = html instanceof HTMLElement ? html : html[0]
  const buttonRow = element.querySelector('.set-challenge-type')?.closest('.flex-row')

  if (!buttonRow) return

  const { magick, realityReinforcement } = getMageChallengeState()

  const rendered = await foundry.applications.handlebars.renderTemplate(
    'systems/cortexprime/templates/partials/mage/challenge-box.html',
    { magick, realityReinforcement }
  )

  buttonRow.insertAdjacentHTML('afterend', rendered)

  const $box = $(buttonRow).next('.mage-challenge-box')

  $box.find('.mage-magick-radio').on('change', async event => {
    const state = getMageChallengeState()
    await game.settings.set('cortexprime', 'mageChallengeState', { ...state, magick: event.currentTarget.value })
  })

  $box.find('.mage-reality-reinforcement-radio').on('change', async event => {
    const state = getMageChallengeState()
    await game.settings.set('cortexprime', 'mageChallengeState', { ...state, realityReinforcement: event.currentTarget.value })
  })

  resizeToFitContent(app)
}

// ---- Any client: additively disable roll buttons + show a message when the current user is a
// current roller whose pool breaks the Powers-trait rule — no Powers trait allowed when Magick is
// None, and a Powers trait required whenever it's anything else ----

const injectPoolValidation = (app, html) => {
  const customRuleSet = game.settings.get('cortexprime', 'customRuleSet')

  if (!isMageRuleSetActive(customRuleSet)) return

  const activeChallenge = getActiveChallenge()
  const targets = getRollToBeatTargets()
  const rollerIds = getCurrentRollerIds(activeChallenge, targets, hasInitiatorRolled(activeChallenge))

  const myId = getMyId()

  if (!myId || !rollerIds.includes(myId)) return

  const { magick } = getMageChallengeState()
  const mageSettings = game.settings.get('cortexprime', 'mageSettings')
  const poolEntries = flattenPoolEntries(game.user.getFlag('cortexprime', 'dicePool')?.pool)

  const reasonKey = computeMagePoolInvalidReason(magick, poolEntries, mageSettings.powersTraitSetId)

  if (!reasonKey) return

  const element = html instanceof HTMLElement ? html : html[0]
  const rollButton = element.querySelector('.roll-dice-pool')

  if (!rollButton) return

  element.querySelectorAll('.roll-dice-pool').forEach(button => { button.disabled = true })

  // Two levels up from a roll button is the row of roll buttons itself (see dice-pool.html) —
  // the message is inserted as its preceding sibling, matching where the core Dice Pool
  // validation message (reused here via the same CSS class) already appears.
  const rollButtonsRow = rollButton.parentElement?.parentElement

  if (!rollButtonsRow) return

  const message = document.createElement('div')
  message.className = 'flex-col col-12 py-1 dice-pool-invalid-message mage-pool-invalid-message'
  message.innerHTML = `<p>${localizer(reasonKey)}</p>`

  rollButtonsRow.insertAdjacentElement('beforebegin', message)

  resizeToFitContent(app)
}

// ---- Any client: add a line under the tray's "Test —"/"Contest —"/"Group —" status line naming
// the active Magick, e.g. "Vulgar Witnessed Magick" under "Test — Roll Now: ..." ----

const injectMagickChallengeLabel = (app, html) => {
  const customRuleSet = game.settings.get('cortexprime', 'customRuleSet')

  if (!isMageRuleSetActive(customRuleSet)) return

  const { magick } = getMageChallengeState()
  const magickKey = getMagickLabelKey(magick)

  if (!magickKey) return

  const activeChallenge = getActiveChallenge()
  const challengeTypeKey = CHALLENGE_TYPE_LABEL_KEYS[activeChallenge.type]

  if (!challengeTypeKey) return

  const element = html instanceof HTMLElement ? html : html[0]
  const challengeLabel = localizer(challengeTypeKey)

  // dice-pool.html has no class or data attribute unique to this specific line — several other
  // .sub-trait-label-cpt elements exist elsewhere in the tray — so it's found by matching the same
  // plain text every locale already renders for the current challenge type, trimmed to ignore the
  // template's own indentation/whitespace.
  const label = Array.from(element.querySelectorAll('.sub-trait-label-cpt'))
    .find(node => node.textContent.trimStart().startsWith(challengeLabel))

  if (!label) return

  const magickLine = document.createElement('p')
  magickLine.className = 'sub-trait-label-cpt mage-magick-label'
  magickLine.textContent = `${localizer(magickKey)} ${localizer('MageMagick')}`

  label.insertAdjacentElement('afterend', magickLine)

  resizeToFitContent(app)
}

// ---- GM-only: keep the Reality Reinforcement trait's die in the right pool(s) ----

const getLinkedLocationActor = () => {
  const actorId = game.scenes?.active?.getFlag('cortexprime', 'linkedActorId')

  return actorId ? game.actors.get(actorId) : null
}

// The Reality Reinforcement trait's current effective {index: face} dice map, or null if the
// Scene's linked actor isn't of the configured Location Actor Type, or the configured Simple
// Trait can't be found or has no dice.
const getRealityReinforcementDiceValue = mageSettings => {
  const locationActor = getLinkedLocationActor()

  if (!locationActor) return null
  if (locationActor.system.actorType?.id !== mageSettings.locationActorTypeId) return null

  const simpleTraits = Object.values(locationActor.system.actorType?.simpleTraits ?? {})
  const trait = simpleTraits.find(simpleTrait => simpleTrait.id === mageSettings.realityReinforcementTraitId)

  if (!trait?.dice?.value || getLength(trait.dice.value) === 0) return null

  return getEffectiveDiceMap(trait.dice.value, trait.dice.temporaryValue)
}

// Adds/removes the fixed 'Reality Reinforcement' pool source on a given User's Dice Pool flag,
// using the same getFlag -> setFlag(null) -> setFlag(mutated) reset already used throughout
// UserDicePool.js (e.g. its own Crisis Pool source sync) — a plain merge-based update() wouldn't
// reliably delete the source once removed.
const syncPoolSource = async (user, action, diceValue) => {
  if (!user || action === 'none') return

  const currentDice = user.getFlag('cortexprime', 'dicePool')

  if (!currentDice) return

  const hasEntry = !!currentDice.pool?.[REALITY_REINFORCEMENT_SOURCE]

  if (action === 'remove') {
    if (!hasEntry) return

    delete currentDice.pool[REALITY_REINFORCEMENT_SOURCE]
  } else {
    const existingValue = currentDice.pool?.[REALITY_REINFORCEMENT_SOURCE]?.[0]?.value

    if (existingValue && JSON.stringify(existingValue) === JSON.stringify(diceValue)) return

    foundry.utils.setProperty(currentDice, `pool.${REALITY_REINFORCEMENT_SOURCE}`, {
      0: { label: REALITY_REINFORCEMENT_SOURCE, value: diceValue }
    })
  }

  await user.setFlag('cortexprime', 'dicePool', null)
  await user.setFlag('cortexprime', 'dicePool', currentDice)
}

const syncRealityReinforcement = async () => {
  if (game.user !== game.users.activeGM) return

  const customRuleSet = game.settings.get('cortexprime', 'customRuleSet')

  if (!isMageRuleSetActive(customRuleSet)) return

  const mageSettings = game.settings.get('cortexprime', 'mageSettings')
  const activeChallenge = getActiveChallenge()
  const targets = getRollToBeatTargets()
  const rollerIds = getCurrentRollerIds(activeChallenge, targets, hasInitiatorRolled(activeChallenge))

  const diceValue = getRealityReinforcementDiceValue(mageSettings)
  const { magick, realityReinforcement } = getMageChallengeState()
  const applicable = magick !== 'none' && !!activeChallenge.type && !!diceValue

  const { gm: gmAction, roller: rollerAction } = computeRealityReinforcementSync(realityReinforcement, applicable)

  // Vulgar Witnessed + Opposes steps up the die going into the GM's pool specifically — the
  // roller's side keeps the trait's plain value (moot here anyway, since Opposes always removes
  // it from the roller's pool).
  const gmDiceValue = computeGmRealityReinforcementDiceMap(diceValue, magick, realityReinforcement)

  await syncPoolSource(game.user, gmAction, gmDiceValue)

  for (const rollerId of rollerIds) {
    const rollerUser = game.users.contents.find(user => user.character?.id === rollerId)

    await syncPoolSource(rollerUser, rollerAction, diceValue)
  }
}

export const registerMageAscension = () => {
  game.settings.register('cortexprime', 'mageChallengeState', {
    scope: 'world',
    config: false,
    type: Object,
    default: { magick: 'none', realityReinforcement: 'opposes' }
  })

  Hooks.on('renderUserDicePool', async (app, html) => {
    await injectChallengeBox(app, html)
    injectPoolValidation(app, html)
    injectMagickChallengeLabel(app, html)
  })

  const settingKeys = [
    'cortexprime.activeChallenge',
    'cortexprime.lastGmRoll',
    'cortexprime.mageChallengeState',
    'cortexprime.customRuleSet'
  ]

  Hooks.on('updateSetting', async setting => {
    if (!settingKeys.includes(setting.key)) return

    await syncRealityReinforcement()
    refreshDicePool()
  })

  Hooks.on('updateActor', async (actor, data) => {
    if (foundry.utils.hasProperty(data, 'flags.cortexprime.lastRoll') || actor.id === getLinkedLocationActor()?.id) {
      await syncRealityReinforcement()
      refreshDicePool()
    }
  })

  // The sync above writes to a Player's dicePool flag from the GM's client via
  // rollerUser.setFlag(...) — Foundry broadcasts that update to every connected client,
  // including the affected Player's own, but nothing else tells their own open tray to
  // re-render and show it. This catches that case (and the GM's own dicePool changing too, for
  // the same reason) on whichever client actually owns the flag that changed.
  //
  // syncPoolSource (like every other dicePool mutator in UserDicePool.js) writes it in two
  // steps — setFlag(null) then setFlag(theRealValue) — since a plain merge-based update()
  // wouldn't reliably drop removed keys. That means this hook fires twice per change, and the
  // first firing's new value is genuinely null: UserDicePool#getData() has no guard against a
  // null dicePool flag (nothing before this hook existed ever rendered against that
  // transient state), so refreshing on it crashes the tray instead of updating it. Skip it and
  // only refresh once the second call lands the real value.
  Hooks.on('updateUser', (user, data) => {
    if (user.id !== game.user.id) return
    if (!foundry.utils.hasProperty(data, 'flags.cortexprime.dicePool')) return
    if (foundry.utils.getProperty(data, 'flags.cortexprime.dicePool') === null) return

    refreshDicePool()
  })

  Hooks.on('updateScene', async () => {
    await syncRealityReinforcement()
    refreshDicePool()
  })

  Hooks.once('ready', () => {
    if (game.user === game.users.activeGM) syncRealityReinforcement()
  })
}
