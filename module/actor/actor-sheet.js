/**
 * The system's Actor sheet.
 * @extends {foundry.applications.sheets.ActorSheetV2}
 */
import { getLength, objectFindKey, objectMapValues, objectFindValue, objectReindexFilter, objectSome } from '../../lib/helpers.js'
import { computeActorTypeChange, mergeActorTypeData } from './actorTypeChangeLogic.js'
import { confirmAction, dialogContent, expandNotesFieldOnEdit, getCurrentTheme, localizer, showPlotPointSpendAnimation } from '../scripts/foundryHelpers.js'
import { selectPlotPointUsage } from '../scripts/plotPointUsageDialog.js'
import { computeTraitDiceNormalization } from '../scripts/traitDiceNormalization.js'
import { computeSteppedTemporaryValue, getEffectiveDiceMap, getEffectiveValue, reindexDiceAfterRemoval, stepFaceDown, stepFaceUp } from '../scripts/traitDiceTemporary.js'
import { canAddDicePointToPool, canHinderDicePointToPool } from '../scripts/dicePoolTraitLogic.js'
import { pushDeletedSection } from '../scripts/deletedSectionsLogic.js'
import { DeletedSectionsDialog } from '../applications/DeletedSectionsDialog.js'
import { ComplicationDialog } from '../applications/ComplicationDialog.js'
import { removeDataPoint } from '../scripts/sheetHelpers.js'

export class CortexPrimeActorSheet extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.sheets.ActorSheetV2
) {
  static DEFAULT_OPTIONS = {
    classes: ['cortexprime', 'sheet', 'actor', 'actor-sheet'],
    tag: 'form',
    position: { width: 960, height: 'auto' },
    window: { resizable: true },
    form: {
      // MUST be set explicitly. appv1's ActorSheet defaulted submitOnChange to true, whereas
      // DocumentSheetV2 defaults it to FALSE - without this every named field on the sheet
      // silently stops saving, with no error anywhere.
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      actorTypeConfirm: CortexPrimeActorSheet.prototype._actorTypeConfirm,
      actorTypeEdit: CortexPrimeActorSheet.prototype._actorTypeEditStart,
      addAsset: CortexPrimeActorSheet.prototype._addAsset,
      addComplication: CortexPrimeActorSheet.prototype._addComplication,
      addDescriptor: CortexPrimeActorSheet.prototype._addDescriptor,
      addNote: CortexPrimeActorSheet.prototype._addNote,
      addPp: CortexPrimeActorSheet.prototype._addPp,
      addSfx: CortexPrimeActorSheet.prototype._addSfx,
      addSubTrait: CortexPrimeActorSheet.prototype._addSubTrait,
      addToPool: CortexPrimeActorSheet.prototype._addToPool,
      addTrait: CortexPrimeActorSheet.prototype._addTrait,
      closeTraitSetEdit: CortexPrimeActorSheet.prototype._closeTraitSetEdit,
      hinderToPool: CortexPrimeActorSheet.prototype._hinderToPool,
      newDie: CortexPrimeActorSheet.prototype._newDie,
      openComplicationDialog: CortexPrimeActorSheet.prototype._openComplicationDialog,
      openDeletedSections: CortexPrimeActorSheet.prototype._openDeletedSections,
      removeItem: CortexPrimeActorSheet.prototype._onRemoveItem,
      removeNote: CortexPrimeActorSheet.prototype._removeNote,
      spendPp: CortexPrimeActorSheet.prototype._spendPp,
      stepDieDown: CortexPrimeActorSheet.prototype._stepDieDown,
      stepDieUp: CortexPrimeActorSheet.prototype._stepDieUp,
      toggleItem: CortexPrimeActorSheet.prototype._onToggleItem,
      traitSetEdit: CortexPrimeActorSheet.prototype._traitSetEdit,
      updateActorSettings: CortexPrimeActorSheet.prototype._updateActorSettings
    }
  }

  static PARTS = {
    form: { template: 'systems/cortexprime-ext/templates/actor/actor-sheet.html' }
  }

  // Which tab is showing. ApplicationV2 keeps this across re-renders; the template reads it
  // through activeTab to mark the nav item and section active, because changeTab() only
  // applies those classes in response to a click.
  tabGroups = { primary: 'traits' }

  async _prepareContext (options) {
    const theme = getCurrentTheme()

    if (this.actor.isOwner) {
      const normalization = computeTraitDiceNormalization(this.actor.system.actorType)

      if (normalization) {
        await this.actor.update(normalization.unset)
        await this.actor.update(normalization.set)
      }
    }

    // Read AFTER the fix above, not before: the context snapshots the actor's CURRENT state,
    // so capturing it first (as this used to) meant a render that needed normalizing painted the
    // stale, over-full dice value anyway — the fix landed on the document a moment too late to be
    // reflected in THIS render, only showing up once the corrective update's own reactive
    // re-render caught up. That gap between a briefly-wrong render and the correction arriving
    // moments later is what showed up as a torn/misaligned row on a skill needing the trim.
    const context = await super._prepareContext(options)

    const actorTypes = game.settings.get('cortexprime-ext', 'actorTypes')
    const currentActorTypeId = this.actor.system.actorType?.id

    return {
      ...context,
      // appv1's ActorSheet#getData handed the templates `data` (the actor), `actor` and
      // `owner`; DocumentSheetV2's context has none of those, so they are supplied here
      // rather than rewriting every partial that reads data.system.actorType.*
      data: this.actor,
      actor: this.actor,
      owner: this.actor.isOwner,
      activeTab: this.tabGroups.primary,
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

  // Set once the player drags the resize handle, after which the window is theirs to size and
  // _resizeToFitContent stops running. Without this the auto-height pass below would snap the
  // window back to 960 x fit-content on the very next render - and with submitOnChange the sheet
  // re-renders on every field edit, so a manual resize would barely survive a keystroke.
  #userResized = false

  // The frame (and so the resize handle) is built once, before any part renders, so this is the
  // right place to bind - _onRender would stack a fresh listener on every re-render.
  async _onFirstRender (context, options) {
    await super._onFirstRender(context, options)

    this.element
      .querySelector('.window-resize-handle')
      ?.addEventListener('pointerdown', () => { this.#userResized = true }, { once: true })
  }

  // Clicks are all `actions`; only the change/mouseup controls are wired here.
  _onRender (context, options) {
    super._onRender(context, options)

    for (const select of this.element.querySelectorAll('.die-select')) {
      select.addEventListener('change', this._onDieChange.bind(this))
      select.addEventListener('mouseup', this._onDieRemove.bind(this))
    }

    for (const field of this.element.querySelectorAll('.pp-number-field')) {
      field.addEventListener('change', this._ppNumberChange.bind(this))
    }

    expandNotesFieldOnEdit(this.element)

    // The window uses height:'auto', so Foundry measures and fixes its height as part of this
    // same render - before the profile image (whose height isn't known until it loads) has
    // necessarily finished loading. If the sidebar column is taller than the main column, an
    // image that finishes loading afterward can grow the sidebar past that fixed height, clipping
    // content at the bottom of the window. Re-running the auto-height calculation now, and again
    // once the image actually loads, keeps the window sized to what's really on screen.
    for (const image of this.element.querySelectorAll('.profile-image')) {
      image.addEventListener('load', () => this._resizeToFitContent())
    }

    this._resizeToFitContent()
  }

  // The sheet's own remove/toggle handlers. appv1 got these from sheetHelpers' jQuery
  // removeItems/toggleItems; the data attributes are unchanged, only the binding is.
  async _onRemoveItem (event, target) {
    event.preventDefault()

    const { path, itemKey, itemName, target: dataTarget } = target.dataset

    const confirmed = await confirmAction({
      content: `${localizer('Remove')} ${itemName}?`
    })

    if (!confirmed) return

    const data = foundry.utils.getProperty(this.actor, `${path}.${dataTarget}`)

    await removeDataPoint.call(this, data, path, dataTarget, itemKey)
  }

  async _onToggleItem (event, target) {
    event.preventDefault()

    const { path } = target.dataset

    await this.actor.update({ [path]: !foundry.utils.getProperty(this.actor, path) })
  }

  async _addPp (event, target) {
    event.preventDefault()

    await this.actor.changePpBy(1)
  }

  // See the comment above the profile-image 'load' listener in _onRender - guarded so a
  // failure here can never take down the rest of listener setup. Width is passed explicitly
  // (rather than left to whatever Foundry currently has cached) because re-triggering the 'auto'
  // height calculation without it has been observed to also blow the window out to a much wider,
  // unintended width.
  _resizeToFitContent () {
    if (this.#userResized) return

    try {
      this.setPosition({ width: this.options.position.width, height: 'auto' })
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

  async _actorTypeConfirm (event, target) {
    event.preventDefault()
    const actorTypes = game.settings.get('cortexprime-ext', 'actorTypes')
    // Scoped to this sheet: with a second sheet showing the picker (now possible, since a GM can
    // reopen it on an already-configured actor) a document-wide '.actor-type-select' lookup reads
    // whichever one happens to be first in the DOM.
    const actorTypeIndex = this.element.querySelector('.actor-type-select')?.value

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
  _onClose (options) {
    // Foundry caches the sheet instance on the document, so without this a GM who opens the picker
    // and closes the window without confirming reopens straight back into the picker.
    this._actorTypeEdit = false

    return super._onClose(options)
  }

  _actorTypeEditStart (event, target) {
    event.preventDefault()

    if (!game.user.isGM) return

    // Deliberately sheet-instance state rather than a flag on the actor: writing it to the document
    // (as _traitSetEdit does) would broadcast, dropping every other client with this sheet open
    // into the picker too.
    this._actorTypeEdit = true
    this.render()
  }

  async _addAsset (event, target) {
    event.preventDefault()
    const { path } = target.dataset
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

  _addComplication (event, target) {
    event.preventDefault()
    const { path } = target.dataset
    const hasHidableTraits = !!foundry.utils.getProperty(this.actor, path)?.hasHidableTraits

    new ComplicationDialog({ actor: this.actor, path, hasHidableTraits }).render(true)
  }

  _openComplicationDialog (event, target) {
    event.preventDefault()
    const { path, index } = target.dataset
    const hasHidableTraits = !!foundry.utils.getProperty(this.actor, path)?.hasHidableTraits

    new ComplicationDialog({ actor: this.actor, path, index: parseInt(index, 10), hasHidableTraits }).render(true)
  }

  async _addDescriptor (event, target) {
    event.preventDefault()
    const { path } = target.dataset
    const currentDescriptors = foundry.utils.getProperty(this.actor, `${path}.descriptors`) ?? {}

    await this._resetDataPoint(path, 'descriptors', {
      ...currentDescriptors,
      [getLength(currentDescriptors)]: {
        label: localizer('NewDescriptor'),
        value: null
      }
    })
  }

  async _addNote (event, target) {
    event.preventDefault()
    const { tabIndex } = target.dataset
    const path = `system.actorType.additionalTabs.${tabIndex}`
    const currentNotes = foundry.utils.getProperty(this.actor, `${path}.notes`) ?? {}

    await this._resetDataPoint(path, 'notes', {
      ...currentNotes,
      [getLength(currentNotes)]: {
        label: localizer('Notes'),
        value: '',
        allowRename: true,
        allowDeletion: true,
        allowEdit: true
      }
    })
  }

  // Bespoke rather than the shared remove-item/removeDataPoint mechanism (see _onRemoveItem
  // above): a note's content has to be captured into the tab's deletedSections queue
  // before it's removed, which is specific to notes and shouldn't leak into that generic partial.
  async _removeNote (event, target) {
    event.preventDefault()
    const { tabIndex, noteIndex, noteLabel } = target.dataset

    const confirmed = await confirmAction({
      content: `${localizer('Remove')} ${noteLabel}?`
    })

    if (!confirmed) return

    const path = `system.actorType.additionalTabs.${tabIndex}`
    const currentNotes = foundry.utils.getProperty(this.actor, `${path}.notes`) ?? {}
    const removedNote = currentNotes[noteIndex]

    if (!removedNote) return

    const newNotes = objectReindexFilter(currentNotes, (_, currentKey) => parseInt(currentKey, 10) !== parseInt(noteIndex, 10))
    const currentDeletedSections = foundry.utils.getProperty(this.actor, `${path}.deletedSections`) ?? {}
    const newDeletedSections = pushDeletedSection(currentDeletedSections, removedNote)

    await this._resetDataPoints(path, { notes: newNotes, deletedSections: newDeletedSections })
  }

  _openDeletedSections (event, target) {
    event.preventDefault()
    const { tabIndex } = target.dataset

    new DeletedSectionsDialog(this.actor, tabIndex).render(true)
  }

  async _addSfx (event, target) {
    event.preventDefault()
    const { path } = target.dataset
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

  async _addSubTrait (event, target) {
    event.preventDefault()
    const { path } = target.dataset
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

  async _addToPool (event, target) {
    if (!this.actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) return

    const { consumable, path, label } = target.dataset

    // data-action="addToPool" is on the element unconditionally; only its 'add-to-pool' CLASS is
    // conditional on shutdown/hasDice/valueType/dice-value state (see traits.html and friends).
    // Re-check the same decision here so a shutdown Trait, a text-type Simple Trait, or a Trait
    // with no `dice` object at all yet (mergeActorTypeData omits it - see
    // actorTypeChangeLogic.js) can't reach _setTraitInPool - the last case would otherwise throw
    // on currentDiceData.value below.
    if (!canAddDicePointToPool(this.actor.system.actorType, path)) return

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
  async _hinderToPool (event, target) {
    // Sits nested inside the trait name's own .add-to-pool span (see traits.html) so it can render
    // right between the dice icon and the name, rather than as a separate control elsewhere in the
    // row - so its click must not bubble up into that span's own _addToPool handler.
    event.stopPropagation()

    if (!this.actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) return

    const { path, label } = target.dataset

    // Same defense-in-depth as _addToPool above: the Hinder icon only renders when
    // trait.enableHinder AND the surrounding add-to-pool conditions hold (see traits.html).
    if (!canHinderDicePointToPool(this.actor.system.actorType, path)) return

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

  async _addTrait (event, target) {
    const { path } = target.dataset
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

  async _closeTraitSetEdit (event, target) {
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

    // Every exit path answers, or the caller's await hangs for the rest of the session: dismissing
    // via the window's X (or Escape) is a real way out and means what Cancel does. DialogV2.wait
    // gives that for free - it resolves on the first of the submit or close paths and Promise
    // resolution is idempotent - which is why the hand-rolled resolveOnce guard this used to carry
    // is gone rather than ported.
    const selection = await foundry.applications.api.DialogV2.wait({
      window: { title: label },
      // Merged with DialogV2's own 'dialog' class, not replacing it: ApplicationV2 concatenates
      // class arrays down the inheritance chain and then de-duplicates.
      classes: ['cortexprime', 'consumable-dice'],
      // Element, not a string: keeps the dice' inline SVG from being stripped. See dialogContent.
      content: dialogContent(content),
      buttons: [
        {
          action: 'cancel',
          label: 'Cancel',
          icon: 'fa-solid fa-times',
          default: true,
          callback: () => noDice()
        },
        {
          action: 'done',
          label: 'AddToPool',
          icon: 'fa-solid fa-check',
          callback: (event, target, dialog) => {
            const remove = !!dialog.element.querySelector('.remove-check')?.checked
            const selectedDice = [...dialog.element.querySelectorAll('.die-select.selected')]

            if (!selectedDice.length) return noDice()

            return selectedDice.reduce((selectedValues, selectedDie) => {
              if (remove) {
                selectedValues.remove = [...selectedValues.remove, selectedDie.dataset.key]
              }

              // Number(), because jQuery's .data('value') coerced "8" to 8 and this map is handed
              // straight to the dice pool. dataset gives the raw string, so without this the pool
              // would start receiving strings from this one path where it used to get numbers.
              selectedValues.value = {
                ...selectedValues.value,
                [getLength(selectedValues.value)]: Number(selectedDie.dataset.value)
              }

              return selectedValues
            }, noDice())
          }
        }
      ],
      render: (event, dialog) => {
        for (const die of dialog.element.querySelectorAll('.die-select')) {
          die.addEventListener('click', () => {
            // Two independent toggles, matching jQuery's toggleClass('a b'): the die starts as
            // .result/.unchosen-cpt and swaps to .selected/.chosen-cpt, and back again.
            die.classList.toggle('result')
            die.classList.toggle('selected')

            const dieCpt = die.querySelector('.die-cpt')

            dieCpt?.classList.toggle('unchosen-cpt')
            dieCpt?.classList.toggle('chosen-cpt')
          })
        }
      }
    })

    return selection ?? noDice()
  }

  async _newDie (event, button) {
    event.preventDefault()
    const target = button.dataset.target
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
    const dieSelect = event.currentTarget
    const target = dieSelect.dataset.target
    const targetKey = parseInt(dieSelect.dataset.key, 10)
    const targetValue = dieSelect.value
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
      const dieSelect = event.currentTarget
      const target = dieSelect.dataset.target
      const targetKey = dieSelect.dataset.key
      const min = parseInt(dieSelect.dataset.min, 10) || 0
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

  async _stepDieUp (event, target) {
    await this._stepDie(event, target, 'up')
  }

  async _stepDieDown (event, target) {
    await this._stepDie(event, target, 'down')
  }

  async _stepDie (event, button, direction) {
    event.preventDefault()

    const target = button.dataset.target
    const targetKey = button.dataset.key
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
    const parsedValue = parseInt(event.currentTarget.value, 10)
    // Plot Points live at system.pp, not on the Document itself (see changePpBy in
    // entities/CortexPrimeActor.js) — and system.pp only exists once an Actor Type has been
    // confirmed (_actorTypeConfirm above), so an actor that hasn't been through that yet counts
    // as 0 rather than throwing.
    const currentValue = parseInt(this.actor.system.pp?.value ?? 0, 10)
    const newValue = parsedValue < 0 ? 0 : parsedValue
    const changeAmount = newValue - currentValue

    await this.actor.changePpBy(changeAmount, true)
  }

  async _spendPp (event, target) {
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

  async _traitSetEdit (event, target) {
    const { traitSet } = target.dataset

    await this.actor.update({
      ['system.actorType.traitSetEdit']: traitSet
    })
  }

  async _updateActorSettings (event, target) {
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
