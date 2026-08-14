/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {foundry.appv1.sheets.ActorSheet}
 */
import { getLength, objectMapValues, objectFindValue, objectReduce, objectSome } from '../../lib/helpers.js'
import { expandNotesFieldOnEdit, localizer, showPlotPointSpendAnimation } from '../scripts/foundryHelpers.js'
import { selectPlotPointUsage } from '../scripts/plotPointUsageDialog.js'
import { computeTraitDiceNormalization } from '../scripts/traitDiceNormalization.js'
import { computeSteppedTemporaryValue, getEffectiveDiceMap, getEffectiveValue, reindexDiceAfterRemoval, stepFaceDown, stepFaceUp } from '../scripts/traitDiceTemporary.js'
import {
  removeItems,
  toggleItems
} from '../scripts/sheetHelpers.js'

export class CortexPrimeActorSheet extends foundry.appv1.sheets.ActorSheet {

  get actor () {
    return super.actor
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['cortexprime', 'sheet', 'actor', 'actor-sheet'],
      template: "systems/cortexprime-ext/templates/actor/actor-sheet.html",
      width: 960,
      height: 'auto',
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "traits" }]
    })
  }

  async getData (options) {
    const data = super.getData(options)
    const themes = game.settings.get('cortexprime-ext', 'themes')
    const theme = themes.current === 'custom' ? themes.custom : themes.list[themes.current]

    if (this.actor.isOwner) {
      const normalization = computeTraitDiceNormalization(this.actor.system.actorType)

      if (normalization) {
        await this.actor.update(normalization.unset)
        await this.actor.update(normalization.set)
      }
    }

    return {
      ...data,
      actorTypeOptions: objectMapValues(game.settings.get('cortexprime-ext', 'actorTypes'), val => val.name),
      canAddToPool: this.actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER),
      theme,
    }
  }

  /* -------------------------------------------- */
  /** @override */
  activateListeners (html) {
    super.activateListeners(html)
    html.find('.update-actor-settings').click(this._updateActorSettings.bind(this))
    html.find('.actor-type-confirm').click(this._actorTypeConfirm.bind(this))
    html.find('.add-pp').click(() => { this.actor.changePpBy(1) })
    html.find('.add-asset').click(this._addAsset.bind(this))
    html.find('.add-complication').click(this._addComplication.bind(this))
    html.find('.add-descriptor').click(this._addDescriptor.bind(this))
    html.find('.add-note').click(this._addNote.bind(this))
    html.find('.add-sfx').click(this._addSfx.bind(this))
    html.find('.add-sub-trait').click(this._addSubTrait.bind(this))
    html.find('.add-to-pool').click(this._addToPool.bind(this))
    html.find('.add-trait').click(this._addTrait.bind(this))
    html.find('.close-trait-set-edit').click(this._closeTraitSetEdit.bind(this))
    html.find('.die-select').change(this._onDieChange.bind(this))
    html.find('.die-select').on('mouseup', this._onDieRemove.bind(this))
    html.find('.new-die').click(this._newDie.bind(this))
    html.find('.pp-number-field').change(this._ppNumberChange.bind(this))
    html.find('.spend-pp').click(this._spendPp.bind(this))
    html.find('.step-die-down').click(this._stepDieDown.bind(this))
    html.find('.step-die-up').click(this._stepDieUp.bind(this))
    html.find('.trait-set-edit').click(this._traitSetEdit.bind(this))

    expandNotesFieldOnEdit(html)

    removeItems.call(this, html)
    toggleItems.call(this, html)

    // The window uses height:'auto', so Foundry measures and fixes its height as part of this
    // same render - before the profile image (whose height isn't known until it loads) has
    // necessarily finished loading. If the sidebar column is taller than the main column, an
    // image that finishes loading afterward can grow the sidebar past that fixed height, clipping
    // content at the bottom of the window. Re-running the auto-height calculation now, and again
    // once the image actually loads, keeps the window sized to what's really on screen.
    html.find('.profile-image').on('load', () => this._resizeToFitContent())
    this._resizeToFitContent()
  }

  // See the comment above the profile-image 'load' listener in activateListeners - guarded so a
  // failure here can never take down the rest of listener setup. Width is passed explicitly
  // (rather than left to whatever Foundry currently has cached) because re-triggering the 'auto'
  // height calculation without it has been observed to also blow the window out to a much wider,
  // unintended width.
  _resizeToFitContent () {
    try {
      this.setPosition({ width: this.options.width, height: 'auto' })
    } catch (error) {
      console.warn('CP | Actor Sheet: could not resize to fit content', error)
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */

  async _actorTypeConfirm (event) {
    event.preventDefault()
    const actorTypes = game.settings.get('cortexprime-ext', 'actorTypes')
    const actorTypeIndex = $('.actor-type-select').val()

    const actorType = actorTypes[actorTypeIndex]

    await this.actor.update({
      'img': actorType.defaultImage,
      'system.actorType': actorType,
      'system.pp.value': actorType.hasPlotPoints ? 1 : 0
    })
  }

  async _addAsset (event) {
    event.preventDefault()
    const { path } = event.currentTarget.dataset
    const currentAssets = foundry.utils.getProperty(this.actor, `${path}.assets`) ?? {}

    console.log(path, currentAssets)

    await this._resetDataPoint(path, 'assets', {
      ...currentAssets,
      [getLength(currentAssets)]: {
        label: localizer('NewAsset'),
        dice: {
          value: {
            0: '6'
          }
        }
      }
    })
  }

  async _addComplication(event) {
    event.preventDefault()
    const { path } = event.currentTarget.dataset
    const currentComplications = foundry.utils.getProperty(this.actor, `${path}.complications`) ?? {}

    await this._resetDataPoint(path, 'complications', {
      ...currentComplications,
      [getLength(currentComplications)]: {
        label: localizer('NewComplication'),
        dice: {
          value: {
            0: '6'
          }
        }
      }
    })
  }

  async _addDescriptor(event) {
    event.preventDefault()
    const { path } = event.currentTarget.dataset
    const currentDescriptors = foundry.utils.getProperty(this.actor, `${path}.descriptors`) ?? {}

    await this._resetDataPoint(path, 'descriptors', {
      ...currentDescriptors,
      [getLength(currentDescriptors)]: {
        label: localizer('NewDescriptor'),
        value: null
      }
    })
  }

  async _addNote(event) {
    event.preventDefault()
    const { tabIndex } = event.currentTarget.dataset
    const path = `system.actorType.additionalTabs.${tabIndex}`
    const currentNotes = foundry.utils.getProperty(this.actor, `${path}.notes`) ?? {}

    await this._resetDataPoint(path, 'notes', {
      ...currentNotes,
      [getLength(currentNotes)]: {
        label: localizer('Notes'),
        value: ''
      }
    })
  }

  async _addSfx (event) {
    event.preventDefault()
    const { path } = event.currentTarget.dataset
    const currentSfx = foundry.utils.getProperty(this.actor, `${path}.sfx`) ?? {}

    await this._resetDataPoint(path, 'sfx', {
      ...currentSfx,
      [getLength(currentSfx)]: {
        description: null,
        label: localizer('NewSfx'),
        unlocked: true
      }
    })
  }

  async _addSubTrait(event) {
    event.preventDefault()
    const { path } = event.currentTarget.dataset
    const currentSubTraits = foundry.utils.getProperty(this.actor, `${path}.subTraits`) ?? {}

    await this._resetDataPoint(path, 'subTraits', {
      ...currentSubTraits,
      [getLength(currentSubTraits)]: {
        dice: {
          value: {
            0: '8'
          }
        },
        label: localizer('NewSubTrait')
      }
    })
  }

  async _addToPool (event) {
    if (!this.actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) return

    const { consumable, path, label } = event.currentTarget.dataset
    const currentDiceData = foundry.utils.getProperty(this.actor, path)
    let value = currentDiceData.value

    if (consumable) {
      const effectiveValue = getEffectiveDiceMap(value, currentDiceData.temporaryValue)
      const selectedDice = await this._getConsumableDiceSelection(effectiveValue, label)

      if (selectedDice.remove?.length) {
        const removeKeys = selectedDice.remove.map(x => parseInt(x, 10))
        const { value: newValue, temporaryValue: newTemporaryValue } = reindexDiceAfterRemoval(
          value,
          currentDiceData.temporaryValue,
          key => !removeKeys.includes(parseInt(key, 10))
        )

        await this._resetDataPoints(path, getLength(currentDiceData.temporaryValue ?? {})
          ? { value: newValue, temporaryValue: newTemporaryValue }
          : { value: newValue })
      }

      value = selectedDice.value
    } else {
      value = getEffectiveDiceMap(value, currentDiceData.temporaryValue)
    }

    if (getLength(value)) {
      const traitSetMatch = path.match(/^system\.actorType\.traitSets\.(\d+)\./)
      const traitSetId = traitSetMatch
        ? foundry.utils.getProperty(this.actor, `system.actorType.traitSets.${traitSetMatch[1]}.id`)
        : null

      await game.cortexprime.UserDicePool._addTraitToPool(this.actor.name, label, value, path, traitSetId)
    }
  }

  async _addTrait (event) {
    const { path } = event.currentTarget.dataset
    const currentCustomTraits = foundry.utils.getProperty(this.actor, `${path}.customTraits`) ?? {}

    await this._resetDataPoint(path, 'customTraits', {
      ...currentCustomTraits,
      [getLength(currentCustomTraits)]: {
        id: `_${Date.now()}`,
        name: localizer('NewTrait'),
        dice: {
          value: {
            0: '8'
          }
        }
      }
    })
  }

  async _closeTraitSetEdit(event) {
    await this.actor.update({
      ['system.actorType.traitSetEdit']: null
    })
  }

  async _getConsumableDiceSelection (options, label) {
    const content = await foundry.applications.handlebars.renderTemplate('systems/cortexprime-ext/templates/dialog/consumable-dice.html', {
      options,
      isOwner: game.user.isOwner
    })

    return new Promise((resolve, reject) => {
      new Dialog({ 
        title: label,
        content,
        buttons: {
          cancel: {
            icon: '<i class="fa-solid fa-times"></i>',
            label: localizer('Cancel'),
            callback () {
              resolve({ remove: [], value: {} })
            }
          },
          done: {
            icon: '<i class="fa-solid fa-check"></i>',
            label: localizer('AddToPool'),
            callback (html) {
              const remove = html.find('.remove-check').prop('checked')
              const selectedDice = html.find('.die-select.selected').get()

              if (!selectedDice?.length) {
                resolve({ remove: [], value: {} })
              }

              resolve(
                selectedDice
                  .reduce((selectedValues, selectedDie, index) => {
                    const $selectedDie = $(selectedDie)

                    if (remove) {
                      selectedValues.remove = [...selectedValues.remove, $selectedDie.data('key')]
                    }

                    selectedValues.value = { ...selectedValues.value, [getLength(selectedValues.value)]: $selectedDie.data('value') }

                    return selectedValues
                  }, { remove: [], value: {} })
              )
            }
          }
        },
        default: 'cancel',
        render(html) {
          html.find('.die-select').click(function () {
            const $dieContainer = $(this)
            const $dieCpt = $dieContainer.find('.die-cpt')
            $dieContainer.toggleClass('result selected')
            $dieCpt.toggleClass('unchosen-cpt chosen-cpt')
          })
        }
      }, { jQuery: true, classes: ['dialog', 'consumable-dice', 'cortexprime'] }).render(true)
    })
  }

  async _newDie (event) {
    event.preventDefault()
    const $targetNewDie = $(event.currentTarget)
    const target = $targetNewDie.data('target')
    const currentDiceData = foundry.utils.getProperty(this.actor, target)
    const currentDice = currentDiceData?.value ?? {}
    const newIndex = getLength(currentDice)
    const newValue = currentDice[newIndex - 1] ?? '8'

    await this.actor.update({
      [target]: {
        value: {
          ...currentDice,
          [newIndex]: newValue
        }
      }
    })
  }

  async _onDieChange (event) {
    event.preventDefault()
    const $targetNewDie = $(event.currentTarget)
    const target = $targetNewDie.data('target')
    const targetKey = $targetNewDie.data('key')
    const targetValue = $targetNewDie.val()
    const currentDiceData = foundry.utils.getProperty(this.actor, target)

    console.log(target)

    const newValue = objectMapValues(currentDiceData.value ?? {}, (value, index) => parseInt(index, 10) === targetKey ? targetValue : value)

    await this._resetDataPoint(target, 'value', newValue)
  }

  async _onDieRemove (event) {
    event.preventDefault()

    if (event.button === 2) {
      const $target = $(event.currentTarget)
      const target = $target.data('target')
      const targetKey = $target.data('key')
      const min = parseInt($target.data('min'), 10) || 0
      const currentDiceData = foundry.utils.getProperty(this.actor, target)
      const currentValue = currentDiceData.value ?? {}

      if (getLength(currentValue) <= min) return

      const { value: newValue, temporaryValue: newTemporaryValue } = reindexDiceAfterRemoval(
        currentValue,
        currentDiceData.temporaryValue,
        key => parseInt(key, 10) !== parseInt(targetKey, 10)
      )

      await this._resetDataPoints(target, getLength(currentDiceData.temporaryValue ?? {})
        ? { value: newValue, temporaryValue: newTemporaryValue }
        : { value: newValue })
    }
  }

  async _stepDieUp (event) {
    await this._stepDie(event, 'up')
  }

  async _stepDieDown (event) {
    await this._stepDie(event, 'down')
  }

  async _stepDie (event, direction) {
    event.preventDefault()

    const $target = $(event.currentTarget)
    const target = $target.data('target')
    const targetKey = $target.data('key')
    const currentDiceData = foundry.utils.getProperty(this.actor, target)
    const value = currentDiceData.value ?? {}
    const temporaryValue = currentDiceData.temporaryValue

    // Already at the top/bottom of the ladder — stepFaceUp/Down clamp rather than wrap, so skip
    // the write entirely instead of round-tripping an unchanged value (which would still trigger
    // a re-render/flicker for no visible effect).
    const current = getEffectiveValue(value, temporaryValue, targetKey)
    const stepped = direction === 'up' ? stepFaceUp(current) : stepFaceDown(current)

    if (stepped === current) return

    const newTemporaryValue = computeSteppedTemporaryValue(value, temporaryValue, targetKey, direction)

    await this._resetDataPoints(target, { temporaryValue: newTemporaryValue })
  }

  async _ppNumberChange (event) {
    event.preventDefault()
    const $field = $(event.currentTarget)
    const parsedValue = parseInt($field.val(), 10)
    const currentValue = parseInt(this.actor.pp.value, 10)
    const newValue = parsedValue < 0 ? 0 : parsedValue
    const changeAmount = newValue - currentValue

    this.actor.changePpBy(changeAmount, true)
  }

  async _spendPp (event) {
    event.preventDefault()

    const usage = await selectPlotPointUsage()

    if (!usage) return

    await this.actor.changePpBy(-1, false, usage)

    showPlotPointSpendAnimation()
  }

  async _resetDataPoint(path, target, value) {
    await this.actor.update({
      [`${path}.-=${target}`]: null
    })

    await this.actor.update({
      [`${path}.${target}`]: value
    })
  }

  // Same unset-then-set semantics as _resetDataPoint (needed so a shrinking object, e.g. a
  // temporaryValue losing an index, actually drops the removed key instead of Foundry's default
  // update() merge silently leaving it in place), but for one or more targets under the same path.
  // IMPORTANT: the unset and the set must remain two SEPARATE actor.update() calls — combining
  // "path.-=X": null and "path.X": value into a single update() silently drops the set (Foundry
  // applies the deletion after merging, wiping the just-written value along with it), which was
  // observed as right-clicking one die in a multi-die pool deleting the entire pool instead of
  // just that die. Still batches multiple targets (e.g. value + temporaryValue) into one unset
  // call and one set call, instead of a separate unset/set pair per target.
  async _resetDataPoints(path, entries) {
    const targets = Object.keys(entries)
    const unset = targets.reduce((acc, target) => ({ ...acc, [`${path}.-=${target}`]: null }), {})
    const set = targets.reduce((acc, target) => ({ ...acc, [`${path}.${target}`]: entries[target] }), {})

    await this.actor.update(unset)
    await this.actor.update(set)
  }

  async _traitSetEdit(event) {
    const { traitSet } = event.currentTarget.dataset

    await this.actor.update({
      ['system.actorType.traitSetEdit']: traitSet
    })
  }

  async _updateActorSettings(event) {
    event.preventDefault()

    const actorData = this.actor.system.actorType
    const actorTypeSettings = objectFindValue(game.settings.get('cortexprime-ext', 'actorTypes'), actorType => actorType.id === actorData.id)

    if (!actorTypeSettings) {
      ui.notifications.error(localizer('MissingActorTypeMessage'))
      return
    }

    const newData = {
      ...actorData,
      ...objectMapValues(actorTypeSettings, (propValue, key) => {
        if (key === 'simpleTraits') {
          return objectMapValues(propValue, ({ dice, hasDescription, id, label, settings }) => {
            const matchingSetting = objectFindValue((actorData.simpleTraits ?? {}), ({ id: matchId }) => matchId === id) ?? {}

            return {
              ...matchingSetting,
              dice: {
                ...matchingSetting.dice,
                consumable: dice.consumable
              },
              hasDescription,
              id,
              label,
              settings
            }
          })
        }

        if (key === 'additionalTabs') {
          return objectMapValues(propValue, ({ id, name, defaultNotes }) => {
            const matchingSetting = objectFindValue((actorData.additionalTabs ?? {}), ({ id: matchId }) => matchId === id) ?? {}
            const existingNotes = matchingSetting.notes ?? {}

            const notes = objectReduce(defaultNotes ?? {}, (acc, defaultNote) => {
              const alreadyExists = !!objectFindValue(acc, note => note.label === defaultNote.label)

              return alreadyExists
                ? acc
                : { ...acc, [getLength(acc)]: { label: defaultNote.label, value: defaultNote.value } }
            }, existingNotes)

            return { ...matchingSetting, id, name, notes }
          })
        }

        if (key === 'traitSets') {
          return objectMapValues(propValue, ({ hasDescription, id, label, settings, traits }) => {
            const matchingSetting = objectFindValue((actorData.traitSets ?? {}), ({ id: matchId }) => matchId === id) ?? {}

            return {
              ...matchingSetting,
              description: matchingSetting.description,
              hasDescription,
              id,
              label,
              shutdown: matchingSetting.shutdown,
              settings,
              traits: objectMapValues(traits ?? {}, trait => {
                const matchingTraitSetting = objectFindValue(matchingSetting.traits ?? {}, ({ id: matchId }) => matchId === trait.id) ?? {}
                return {
                  ...matchingTraitSetting,
                  id: trait.id,
                  name: trait.name
                }
              })
            }
          })
        }

        return propValue
      })
    }

    this._resetDataPoint('system', 'actorType', newData)
    this.actor.update()
  }
}
