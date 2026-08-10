// Enforces "Has Multiple Dice: false" (on a Trait Set's main/custom traits, its Sub-Traits, a
// dice-type Simple Trait, and Assets) — 0 or 1 die is valid and left alone; an over-full dice
// value (2+) is trimmed down to just its first die. Kept free of any Foundry
// Application-extending imports so the pure logic is unit-testable; the actual Actor#update()
// write happens in the impure wrapper in actor-sheet.js.
import { reindexDiceAfterRemoval } from './traitDiceTemporary.js'

const applyDiceFix = (unset, set, path, diceValue, temporaryValue) => {
  const keys = Object.keys(diceValue ?? {})
  if (keys.length <= 1) return

  const { value: newValue, temporaryValue: newTemporaryValue } = reindexDiceAfterRemoval(diceValue, temporaryValue, key => key === keys[0])

  unset[`${path}.-=value`] = null
  set[`${path}.value`] = newValue

  // Only touch temporaryValue if it ever had anything stored — the vast majority of traits never
  // diverge from their actual value, and this avoids a pointless write for them.
  if (Object.keys(temporaryValue ?? {}).length) {
    unset[`${path}.-=temporaryValue`] = null
    set[`${path}.temporaryValue`] = newTemporaryValue
  }
}

export const computeTraitDiceNormalization = (actorType, basePath = 'system.actorType') => {
  const unset = {}
  const set = {}

  Object.entries(actorType?.traitSets ?? {}).forEach(([traitSetIndex, traitSet]) => {
    const traitSetPath = `${basePath}.traitSets.${traitSetIndex}`
    const hasMultipleDice = traitSet.settings?.hasMultipleDice !== false
    const subTraitsHaveMultipleDice = traitSet.settings?.subTraitsHaveMultipleDice !== false

    if (hasMultipleDice && subTraitsHaveMultipleDice) return

    ;['traits', 'customTraits'].forEach(target => {
      Object.entries(traitSet[target] ?? {}).forEach(([traitIndex, trait]) => {
        const traitPath = `${traitSetPath}.${target}.${traitIndex}`

        if (!hasMultipleDice) applyDiceFix(unset, set, `${traitPath}.dice`, trait.dice?.value, trait.dice?.temporaryValue)

        if (!subTraitsHaveMultipleDice) {
          Object.entries(trait.subTraits ?? {}).forEach(([subTraitIndex, subTrait]) => {
            applyDiceFix(unset, set, `${traitPath}.subTraits.${subTraitIndex}.dice`, subTrait.dice?.value, subTrait.dice?.temporaryValue)
          })
        }
      })
    })
  })

  Object.entries(actorType?.simpleTraits ?? {}).forEach(([simpleTraitIndex, simpleTrait]) => {
    if (simpleTrait.settings?.valueType !== 'dice') return
    if (simpleTrait.settings?.hasMultipleDice !== false) return

    applyDiceFix(unset, set, `${basePath}.simpleTraits.${simpleTraitIndex}.dice`, simpleTrait.dice?.value)
  })

  if (actorType?.assetsHaveMultipleDice === false) {
    Object.entries(actorType?.assets ?? {}).forEach(([assetIndex, asset]) => {
      applyDiceFix(unset, set, `${basePath}.assets.${assetIndex}.dice`, asset.dice?.value, asset.dice?.temporaryValue)
    })
  }

  return Object.keys(set).length ? { unset, set } : null
}
