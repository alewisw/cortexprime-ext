// Enforces "Has Multiple Dice: false" (on a Trait Set's main/custom traits, its Sub-Traits, and a
// dice-type Simple Trait) — 0 or 1 die is valid and left alone; an over-full dice value (2+) is
// trimmed down to just its first die. Kept free of any Foundry Application-extending imports so
// the pure logic is unit-testable; the actual Actor#update() write happens in the impure wrapper
// in actor-sheet.js.
const applyDiceFix = (unset, set, path, diceValue) => {
  const values = Object.values(diceValue ?? {})
  if (values.length <= 1) return

  unset[`${path}.-=value`] = null
  set[`${path}.value`] = { 0: values[0] }
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

        if (!hasMultipleDice) applyDiceFix(unset, set, `${traitPath}.dice`, trait.dice?.value)

        if (!subTraitsHaveMultipleDice) {
          Object.entries(trait.subTraits ?? {}).forEach(([subTraitIndex, subTrait]) => {
            applyDiceFix(unset, set, `${traitPath}.subTraits.${subTraitIndex}.dice`, subTrait.dice?.value)
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

  return Object.keys(set).length ? { unset, set } : null
}
