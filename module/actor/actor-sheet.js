/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {foundry.appv1.sheets.ActorSheet}
 */
import { getLength, objectFindKey, objectMapValues, objectFindValue, objectSome } from '../../lib/helpers.js'
import { computeActorTypeChange, mergeActorTypeData } from './actorTypeChangeLogic.js'
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

    const actorTypes = game.settings.get('cortexprime-ext', 'actorTypes')
    const currentActorTypeId = this.actor.system.actorType?.id

    return {
      ...data,
      actorTypeOptions: objectMapValues(actorTypes, val => val.name),
      // The picker's <option> values are keys into the actorTypes setting, so the current type has
      // to be identified the same way to preselect it.
      currentActorTypeIndex: objectFindKey(actorTypes, actorType => actorType.id === currentActorTypeId) ?? null,
      canAddToPool: this.actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER),
      isGM: game.user.isGM,
      // Either the actor has no type yet (first-time selection) or a GM asked to change it.
      showActorTypePicker: !this.actor.system.actorType || !!this._actorTypeEdit,
      theme,
    }
  }

  /* -------------------------------------------- */
  /** @override */
  activateListeners (html) {
    super.activateListeners(html)
    html.find('.update-actor-settings').click(this._updateActorSettings.bind(this))
    html.find('.actor-type-confirm').click(this._actorTypeConfirm.bind(this))
    html.find('.actor-type-edit').click(this._actorTypeEditStart.bind(this))
    html.find('.add-pp').click(() => { this.actor.changePpBy(1) })
    html.find('.add-asset').click(this._addAsset.bind(this))
    html.find('.add-complication').click(this._addComplication.bind(this))
    html.find('.add-descriptor').click(this._addDescriptor.bind(this))
    html.find('.add-note').click(this._addNote.bind(this))
    html.find('.add-sfx').click(this._addSfx.bind(this))
    html.find('.add-sub-trait').click(this._addSubTrait.bind(this))
    html.find('.add-to-pool').click(this._addToPool.bind(this))
    html.find('.hinder-to-pool').click(this._hinderToPool.bind(this))
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
    // Scoped to this sheet: with a second sheet showing the picker (now possible, since a GM can
    // reopen it on an already-configured actor) a bare $('.actor-type-select') reads whichever one
    // happens to be first in the DOM.
    const actorTypeIndex = this.element.find('.actor-type-select').val()

    const actorType = actorTypes[actorTypeIndex]

    if (!actorType) return

    const currentActorType = this.actor.system.actorType

    if (!currentActorType) {
      await this.actor.update({
        'img': actorType.defaultImage,
        'system.actorType': actorType,
        'system.pp.value': actorType.hasPlotPoints ? 1 : 0
      })

      return
    }

    await this._actorTypeChange(currentActorType, actorType)
  }

  // Changing the type of an actor that already has one. GM-only, and separate from first-time
  // selection because an existing actor has data worth keeping: the merge preserves everything the
  // old and new type have in common (matched on id), the portrait stays as it is, and Plot Points
  // are only zeroed when the new type has none.
  async _actorTypeChange (currentActorType, newActorType) {
    if (!game.user.isGM) return

    const { actorType, ppValue } = computeActorTypeChange(
      currentActorType,
      newActorType,
      this.actor.system.pp?.value
    )

    this._actorTypeEdit = false

    // Unset-then-set, so trait sets and tabs the new type doesn't have actually disappear rather
    // than surviving Foundry's update() merge - see the comment above _resetDataPoints.
    await this._resetDataPoint('system', 'actorType', actorType)

    if (ppValue !== null) await this.actor.update({ 'system.pp.value': ppValue })
  }

  /** @override */
  async close (options) {
    // Foundry caches the sheet instance on the document, so without this a GM who opens the picker
    // and closes the window without confirming reopens straight back into the picker.
    this._actorTypeEdit = false

    return super.close(options)
  }

  _actorTypeEditStart (event) {
    event.preventDefault()

    if (!game.user.isGM) return

    // Deliberately sheet-instance state rather than a flag on the actor: writing it to the document
    // (as _traitSetEdit does) would broadcast, dropping every other client with this sheet open
    // into the picker too.
    this._actorTypeEdit = true
    this.render()
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
      // hindered: false so this also un-hinders a stray instance left over from a Hinder click -
      // see applyTraitToPool in dicePoolTraitLogic.js for the exact "one instance vs several" rule.
      await game.cortexprime.UserDicePool._setTraitInPool(this.actor.name, {
        label,
        value,
        traitPath: path,
        traitSetId: this._traitSetIdFor(path),
        hindered: false
      })
    }
  }

  // The Hinder control next to a trait's dice (only rendered when the trait has Enable Hinder set -
  // see traits.html). Always a flat d4, and deliberately skips the consumable-dice prompt _addToPool
  // goes through: hindering contributes a fresh d4, not one of the trait's own dice.
  async _hinderToPool (event) {
    // Sits nested inside the trait name's own .add-to-pool span (see traits.html) so it can render
    // right between the dice icon and the name, rather than as a separate control elsewhere in the
    // row - so its click must not bubble up into that span's own _addToPool handler.
    event.stopPropagation()

    if (!this.actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) return

    const { path, label } = event.currentTarget.dataset

    await game.cortexprime.UserDicePool._setTraitInPool(this.actor.name, {
      label,
      value: { 0: '4' },
      traitPath: path,
      traitSetId: this._traitSetIdFor(path),
      hindered: true
    })
  }

  // The Trait Set id a trait's dice `path` belongs to, or null for a path outside any Trait Set
  // (a Simple Trait, an Asset, ...). Shared by _addToPool and _hinderToPool so both identify the
  // same trait's pool entries identically.
  _traitSetIdFor (path) {
    const traitSetMatch = path.match(/^system\.actorType\.traitSets\.(\d+)\./)

    return traitSetMatch
      ? foundry.utils.getProperty(this.actor, `system.actorType.traitSets.${traitSetMatch[1]}.id`)
      : null
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

    // "Nothing selected" — a fresh object each time, since the caller reads it back out.
    const noDice = () => ({ remove: [], value: {} })

    return new Promise(resolve => {
      // Every exit path has to answer, or the caller's await hangs for the rest of the session:
      // dismissing via the window's X (or Escape) is a real way out of this dialog and means the
      // same thing Cancel does. Foundry's appv1 Dialog#submit runs the chosen button's callback
      // and THEN close(), so `close` below fires on the button paths too — first answer wins, and
      // resolveOnce makes that explicit rather than leaning on Promise semantics. Same guard
      // plotPointUsageDialog.js uses.
      let resolved = false

      const resolveOnce = value => {
        if (resolved) return

        resolved = true
        resolve(value)
      }

      new Dialog({
        title: label,
        content,
        buttons: {
          cancel: {
            icon: '<i class="fa-solid fa-times"></i>',
            label: localizer('Cancel'),
            callback () {
              resolveOnce(noDice())
            }
          },
          done: {
            icon: '<i class="fa-solid fa-check"></i>',
            label: localizer('AddToPool'),
            callback (html) {
              const remove = html.find('.remove-check').prop('checked')
              const selectedDice = html.find('.die-select.selected').get()

              if (!selectedDice.length) {
                resolveOnce(noDice())
                return
              }

              resolveOnce(
                selectedDice
                  .reduce((selectedValues, selectedDie) => {
                    const $selectedDie = $(selectedDie)

                    if (remove) {
                      selectedValues.remove = [...selectedValues.remove, $selectedDie.data('key')]
                    }

                    selectedValues.value = { ...selectedValues.value, [getLength(selectedValues.value)]: $selectedDie.data('value') }

                    return selectedValues
                  }, noDice())
              )
            }
          }
        },
        default: 'cancel',
        close: () => resolveOnce(noDice()),
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

    const newValue = objectMapValues(currentDiceData.value ?? {}, (value, index) => parseInt(index, 10) === targetKey ? targetValue : value)

    // A temporary step recorded against this die's old face is meaningless once the face itself
    // changes — left in place, it keeps rendering as a stale extra badge next to the real one.
    const temporaryValue = currentDiceData.temporaryValue ?? {}

    if (targetKey in temporaryValue) {
      const newTemporaryValue = { ...temporaryValue }
      delete newTemporaryValue[targetKey]
      await this._resetDataPoints(target, { value: newValue, temporaryValue: newTemporaryValue })
    } else {
      await this._resetDataPoint(target, 'value', newValue)
    }
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
    // Plot Points live at system.pp, not on the Document itself (see changePpBy in
    // entities/CortexPrimeActor.js) — and system.pp only exists once an Actor Type has been
    // confirmed (_actorTypeConfirm above), so an actor that hasn't been through that yet counts
    // as 0 rather than throwing.
    const currentValue = parseInt(this.actor.system.pp?.value ?? 0, 10)
    const newValue = parsedValue < 0 ? 0 : parsedValue
    const changeAmount = newValue - currentValue

    await this.actor.changePpBy(changeAmount, true)
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

    const newData = mergeActorTypeData(actorData, actorTypeSettings)

    // Awaited, so a failure surfaces instead of becoming an unhandled rejection — and so the
    // unset/set pair lands as the two consecutive updates _resetDataPoint depends on. It used to
    // be fired and forgotten, with a bare no-op this.actor.update() behind it that did nothing
    // except slip a third update in between the two halves.
    await this._resetDataPoint('system', 'actorType', newData)
  }
}
