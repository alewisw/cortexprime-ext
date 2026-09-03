import { applyActorTypeInheritance, buildActorTypeTree } from '../actor/actorTypeInheritanceLogic.js'
import { buildSystemTraitOptions } from './systemTraitsLogic.js'
import { expandNotesFieldOnEdit, localizer } from '../scripts/foundryHelpers.js'
import { getLength, objectFindKey, objectFindValue, objectMapValues, objectReduce, objectReindexFilter } from '../../lib/helpers.js'
import { onRemoveItem, onReorderItem } from '../scripts/settingsHelpers.js'
import { CortexApplicationV2 } from '../applications/CortexApplicationV2.js'

export default class ActorSettings extends CortexApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'actor-settings',
    classes: ['actor-settings'],
    tag: 'form',
    position: { width: 600, height: 900, top: 200, left: 400 },
    // A localization key, not a localized string: DEFAULT_OPTIONS is evaluated at module load,
    // before game.i18n exists.
    window: { title: 'ActorSettings', resizable: true },
    form: {
      handler: ActorSettings.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      addAdditionalTab: ActorSettings.#onAddAdditionalTab,
      addDefaultNote: ActorSettings.#onAddAdditionalTabDefaultNote,
      addDerivedActorType: ActorSettings.#onAddDerivedActorType,
      addDescriptor: ActorSettings.#onAddDescriptor,
      addNewActorType: ActorSettings.#onAddNewActorType,
      addSfx: ActorSettings.#onAddSfx,
      addSimpleTrait: ActorSettings.#onAddSimpleTrait,
      addSubTrait: ActorSettings.#onAddSubTrait,
      addTrait: ActorSettings.#onAddTrait,
      addTraitSet: ActorSettings.#onAddTraitSet,
      breadcrumbChange: ActorSettings.#onBreadcrumbChange,
      changeDefaultImage: ActorSettings.#onChangeDefaultImage,
      duplicateItem: ActorSettings.#onDuplicateItem,
      newDie: ActorSettings.#onNewDie,
      viewChange: ActorSettings.#onViewChange,
      // Shared with the other settings applications; see settingsHelpers.
      removeItem: onRemoveItem,
      reorderItem: onReorderItem
    }
  }

  static PARTS = {
    form: { template: 'systems/cortexprime-ext/templates/actor/settings.html' }
  }

  async _prepareContext (options) {
    const breadcrumbs = game.settings.get('cortexprime-ext', 'actorBreadcrumbs') ?? {}
    const customRuleSet = game.settings.get('cortexprime-ext', 'customRuleSet')

    // Both augmentations only add display-only fields - buildActorTypeTree the inheritance ones
    // (children/hasChildren/parentName), buildSystemTraitOptions the System Trait dropdown options -
    // and leave the storage indices alone, so every `name="actorTypes.<i>..."` binding still lines
    // up. Nothing here is written back: every save re-reads the raw setting.
    const actorTypes = objectMapValues(
      buildActorTypeTree(game.settings.get('cortexprime-ext', 'actorTypes')),
      actorType => buildSystemTraitOptions(actorType, customRuleSet)
    )

    return {
      ...await super._prepareContext(options),
      actorTypes,
      breadcrumbs,
      goBack: breadcrumbs[getLength(breadcrumbs ?? {}) - 2]?.target ?? 0
    }
  }

  _onRender (context, options) {
    super._onRender(context, options)

    this.#lockInheritedControls()

    expandNotesFieldOnEdit(this.element)

    for (const field of this.element.querySelectorAll('.breadcrumb-name-change')) {
      field.addEventListener('change', this.#onBreadcrumbNameChange.bind(this))
    }

    for (const select of this.element.querySelectorAll('.die-select')) {
      select.addEventListener('change', this.#onDieChange.bind(this))
      select.addEventListener('mouseup', this.#onDieRemove.bind(this))
    }
  }

  // Set by _preClose so the submit it triggers doesn't try to re-render a closing application.
  #closing = false

  // appv1's submitOnClose has no ApplicationV2 equivalent; submit once more on the way out so a
  // field edited and then closed without losing focus is not dropped. _preClose is awaited while
  // the form element still exists, unlike _onClose.
  async _preClose (options) {
    this.#closing = true

    if (this.form) await this.submit()

    return super._preClose(options)
  }

  // Everything a derived Actor Type inherits is read-only: it belongs to the parent and is rebuilt
  // from it on every save. Disabled inputs aren't serialised by the form, and the submit handler
  // merges rather than replaces, so the omitted fields simply keep their reconciled parent values.
  #lockInheritedControls () {
    for (const container of this.element.querySelectorAll('.inherited-fields')) {
      for (const field of container.querySelectorAll('input, select, textarea')) field.disabled = true
      for (const button of container.querySelectorAll('button')) button.remove()
    }

    for (const row of this.element.querySelectorAll('.inherited-row')) {
      for (const control of row.querySelectorAll('.reorder, .duplicate-item, .remove-item')) control.remove()
    }
  }

  // The single write path for the actorTypes setting. Reconciling here means every derived Actor
  // Type is rebuilt from its parent on any change, wherever that change came from.
  async #saveActorTypes (value) {
    await game.settings.set('cortexprime-ext', 'actorTypes', applyActorTypeInheritance(value))
  }

  static async #onSubmit (event, form, formData) {
    // Dice are written by their own handlers, which do an index-aware rewrite rather than a
    // merge; letting the generic merge below run as well would put the pre-change value straight
    // back. appv1 checked event.currentTarget for this, which worked because it bound change per
    // input - ApplicationV2 binds one listener on the form, so the changed element is event.target.
    if (event?.target?.classList?.contains('die-select')) return

    const expandedFormData = foundry.utils.expandObject(formData.object)
    const currentActorTypes = game.settings.get('cortexprime-ext', 'actorTypes') ?? {}

    await this.#saveActorTypes(foundry.utils.mergeObject(currentActorTypes, expandedFormData.actorTypes))

    if (!this.#closing) await this.render()
  }

  async changeView (name, target) {
    const currentBreadcrumbs = game.settings.get('cortexprime-ext', 'actorBreadcrumbs')

    await game.settings.set('cortexprime-ext', 'actorBreadcrumbs', {
      ...objectMapValues(currentBreadcrumbs, breadcrumb => {
        breadcrumb.active = false
        return breadcrumb
      }),
      [getLength(currentBreadcrumbs)]: {
        active: true,
        localize: false,
        name,
        target
      }
    })

    await this.render()
  }

  static async #onAddNewActorType (event, target) {
    event.preventDefault()

    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const newKey = getLength(source ?? {})

    const newActorType = {
      [newKey]: {
        id: `_${Date.now()}`,
        name: localizer('NewActorType'),
        showProfileImage: true
      }
    }

    await this.#saveActorTypes(foundry.utils.mergeObject(source, newActorType))
    await this.changeView(localizer('NewActorType'), `actorType-${newKey}`)
  }

  static async #onAddAdditionalTab (event, target) {
    event.preventDefault()

    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const actorTypeKey = target.dataset.actorType
    const newKey = getLength(source[actorTypeKey]?.additionalTabs || {})
    const name = localizer('NewAdditionalTab')

    const newAdditionalTab = {
      [actorTypeKey]: {
        additionalTabs: {
          [newKey]: {
            id: `_${Date.now()}`,
            name
          }
        }
      }
    }

    await this.#saveActorTypes(foundry.utils.mergeObject(source, newAdditionalTab))
    await this.changeView(name, `additionalTab-${actorTypeKey}-${newKey}`)
  }

  static async #onAddAdditionalTabDefaultNote (event, target) {
    event.preventDefault()

    const { path } = target.dataset
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const currentDefaultNotes = foundry.utils.getProperty(source, path) || {}

    foundry.utils.setProperty(source, path, {
      ...currentDefaultNotes,
      [getLength(currentDefaultNotes ?? {})]: {
        label: localizer('NewSection'),
        allowRename: false,
        allowDeletion: false,
        allowEdit: false,
        value: null
      }
    })

    await this.#saveActorTypes(source)
    await this.render()
  }

  static async #onAddDerivedActorType (event, target) {
    event.preventDefault()

    const { actorTypeId } = target.dataset
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const newKey = getLength(source ?? {})
    const name = localizer('NewDerivedActorType')

    // Only the identity and the parent link are stored - #saveActorTypes materializes the rest
    // from the parent.
    const newActorType = {
      [newKey]: {
        id: `_${Date.now()}`,
        name,
        parentId: actorTypeId
      }
    }

    await this.#saveActorTypes(foundry.utils.mergeObject(source, newActorType))
    await this.changeView(name, `actorType-${newKey}`)
  }

  static async #onAddDescriptor (event, target) {
    event.preventDefault()

    const { path } = target.dataset
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const currentDescriptors = foundry.utils.getProperty(source, path) || {}

    foundry.utils.setProperty(source, path, {
      ...currentDescriptors,
      [getLength(currentDescriptors ?? {})]: {
        label: localizer('NewDescriptor'),
        value: null
      }
    })

    await this.#saveActorTypes(source)
    await this.render()
  }

  static async #onAddSfx (event, target) {
    event.preventDefault()

    const { path } = target.dataset
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const currentSfx = foundry.utils.getProperty(source, path) || {}

    foundry.utils.setProperty(source, path, {
      ...currentSfx,
      [getLength(currentSfx ?? {})]: {
        description: null,
        label: localizer('NewSfx'),
        unlocked: true
      }
    })

    await this.#saveActorTypes(source)
    await this.render()
  }

  static async #onAddSubTrait (event, target) {
    event.preventDefault()

    const { path } = target.dataset
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const currentSubTraits = foundry.utils.getProperty(source, path) || {}

    foundry.utils.setProperty(source, path, {
      ...currentSubTraits,
      [getLength(currentSubTraits ?? {})]: {
        dice: { value: { 0: '8' } },
        label: localizer('NewSubTrait')
      }
    })

    await this.#saveActorTypes(source)
    await this.render()
  }

  static async #onAddSimpleTrait (event, target) {
    event.preventDefault()

    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const actorTypeKey = target.dataset.actorType
    const newKey = getLength(source[actorTypeKey]?.simpleTraits || {})

    const newSimpleTrait = {
      [actorTypeKey]: {
        simpleTraits: {
          [newKey]: {
            dice: {
              value: {
                0: '8'
              }
            },
            id: `_${Date.now()}`,
            label: localizer('NewSimpleTrait'),
            settings: {
              editable: true,
              valueType: 'text'
            }
          }
        }
      }
    }

    await this.#saveActorTypes(foundry.utils.mergeObject(source, newSimpleTrait))
    await this.changeView(localizer('NewSimpleTrait'), `simpleTrait-${actorTypeKey}-${newKey}`)
  }

  static async #onAddTrait (event, target) {
    event.preventDefault()

    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const { actorType, path, traitSet } = target.dataset
    const currentTraits = foundry.utils.getProperty(source, `${path}.${traitSet}.traits`)
    const newKey = getLength(currentTraits || {})

    const newTraits = {
      ...currentTraits,
      [newKey]: {
        id: `_${Date.now()}`,
        name: localizer('NewTrait'),
        dice: {
          value: {
            0: '8'
          }
        }
      }
    }

    foundry.utils.setProperty(source, `${path}.${traitSet}.traits`, newTraits)

    await this.#saveActorTypes(source)
    await this.changeView(localizer('NewTrait'), `trait-${actorType}-${traitSet}-${newKey}`)
  }

  static async #onAddTraitSet (event, target) {
    event.preventDefault()

    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const actorTypeKey = target.dataset.actorType
    const newKey = getLength(source[actorTypeKey]?.traitSets || {})

    const newTraitSet = {
      [actorTypeKey]: {
        traitSets: {
          [newKey]: {
            id: `_${Date.now()}`,
            label: localizer('NewTraitSet')
          }
        }
      }
    }

    await this.#saveActorTypes(foundry.utils.mergeObject(source, newTraitSet))
    await this.changeView(localizer('NewTraitSet'), `traitSet-${actorTypeKey}-${newKey}`)
  }

  static async #onBreadcrumbChange (event, target) {
    const currentBreadcrumbs = game.settings.get('cortexprime-ext', 'actorBreadcrumbs')
    const to = target.dataset.to
    const targetKey = +objectFindKey(currentBreadcrumbs, breadcrumb => breadcrumb.target === to)

    const value = objectReduce(currentBreadcrumbs, (breadcrumbs, breadcrumb, key) => {
      if (+key > targetKey) return breadcrumbs

      breadcrumb.active = breadcrumb.target === to

      return {
        ...breadcrumbs,
        [key]: breadcrumb
      }
    }, {})

    await game.settings.set('cortexprime-ext', 'actorBreadcrumbs', value)

    // Commits any pending field edits before the view changes under them - this was
    // this._onSubmit(event) under appv1.
    await this.submit()
    await this.render()
  }

  // A `change` handler rather than an action, so it is bound in _onRender and `this` is already
  // the application.
  async #onBreadcrumbNameChange (event) {
    const nameField = event.currentTarget
    const to = nameField.dataset.target
    const currentBreadcrumbs = game.settings.get('cortexprime-ext', 'actorBreadcrumbs')

    await game.settings.set('cortexprime-ext', 'actorBreadcrumbs', {
      ...objectMapValues(currentBreadcrumbs, breadcrumb => {
        if (breadcrumb.target === to) {
          breadcrumb.name = nameField.value
        }

        return breadcrumb
      })
    })
  }

  static async #onChangeDefaultImage (event, target) {
    event.preventDefault()

    const { actorTypeIndex } = target.dataset
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const currentImage = source[actorTypeIndex]?.defaultImage || 'icons/svg/mystery-man.svg'

    const imagePicker = new foundry.applications.apps.FilePicker.implementation({
      type: 'image',
      current: currentImage,
      // An arrow function, so `this` is still the application - appv1 used method shorthand here
      // and had to capture the instance in a local `_this`.
      callback: async newImage => {
        source[actorTypeIndex].defaultImage = newImage

        await this.#saveActorTypes(source)

        await this.render()
      }
    })

    await imagePicker.render({ force: true })
  }

  static async #onDuplicateItem (event, target) {
    event.preventDefault()

    const { id, path } = target.dataset
    let source = game.settings.get('cortexprime-ext', 'actorTypes')
    const targetGroup = path ? foundry.utils.getProperty(source, path) : source
    const newKey = getLength(targetGroup ?? {})
    const item = objectFindValue(targetGroup, entry => entry.id === id)

    const newTarget = {
      [newKey]: objectMapValues(item, (value, key) => {
        if (key === 'id') return `_${Date.now()}`

        return value
      })
    }

    if (path) {
      foundry.utils.setProperty(source, path, { ...targetGroup, ...newTarget })
    } else {
      source = foundry.utils.mergeObject(source, newTarget)
    }

    await this.#saveActorTypes(source)
    await this.render()
  }

  static async #onNewDie (event, target) {
    event.preventDefault()

    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const { target: path } = target.dataset
    const currentDice = foundry.utils.getProperty(source, path) || {}
    const values = currentDice.value ?? {}
    const newKey = getLength(values)
    const newValue = newKey > 0 ? values[newKey - 1] : '8'

    foundry.utils.setProperty(source, `${path}.value`, { ...values, [newKey]: newValue })

    await this.#saveActorTypes(source)
    await this.render()
  }

  async #onDieChange (event) {
    event.preventDefault()

    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const dieSelect = event.currentTarget
    const path = dieSelect.dataset.target
    const targetKey = dieSelect.dataset.key
    const targetValue = dieSelect.value
    const currentDiceValues = foundry.utils.getProperty(source, `${path}.value`) ?? {}

    if (parseInt(targetValue, 10) === 0) {
      foundry.utils.setProperty(source, `${path}.value`, objectReindexFilter(currentDiceValues, (_, index) => parseInt(index, 10) !== parseInt(targetKey, 10)))
    } else {
      foundry.utils.setProperty(source, `${path}.value`, objectMapValues(currentDiceValues, (value, index) => parseInt(index, 10) === parseInt(targetKey, 10) ? targetValue : value))
    }

    await this.#saveActorTypes(source)

    await this.render()
  }

  async #onDieRemove (event) {
    event.preventDefault()

    if (event.button !== 2) return

    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const dieSelect = event.currentTarget
    const path = dieSelect.dataset.target
    const targetKey = dieSelect.dataset.key
    const currentDiceValues = foundry.utils.getProperty(source, `${path}.value`) ?? {}

    foundry.utils.setProperty(source, `${path}.value`, objectReindexFilter(currentDiceValues, (_, index) => parseInt(index, 10) !== parseInt(targetKey, 10)))

    await this.#saveActorTypes(source)

    await this.render()
  }

  static async #onViewChange (event, target) {
    event.preventDefault()

    await this.changeView(target.dataset.name, target.dataset.to)
  }
}

Hooks.on('closeActorSettings', async () => {
  await game.settings.set(
    'cortexprime-ext',
    'actorBreadcrumbs',
    {
      0: {
        active: true,
        name: 'ActorTypes',
        target: 'actorTypes',
        localize: true
      }
    }
  )
})
