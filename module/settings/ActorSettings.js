import { applyActorTypeInheritance, buildActorTypeTree } from '../actor/actorTypeInheritanceLogic.js'
import { buildSystemTraitOptions } from './systemTraitsLogic.js'
import { expandNotesFieldOnEdit, localizer } from '../scripts/foundryHelpers.js'
import { getLength, objectFindKey, objectFindValue, objectMapValues, objectReduce, objectReindexFilter } from '../../lib/helpers.js'
import { removeItem, reorderItem } from '../scripts/settingsHelpers.js'

export default class ActorSettings extends FormApplication {
  constructor() {
    super()
  }

  static get defaultOptions () {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'actor-settings',
      template: 'systems/cortexprime-ext/templates/actor/settings.html',
      title: localizer('ActorSettings'),
      classes: ['cortexprime', 'actor-settings'],
      width: 600,
      height: 900,
      top: 200,
      left: 400,
      resizable: true,
      closeOnSubmit: false,
      submitOnClose: true,
      submitOnChange: true
    })
  }

  getData() {
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
      actorTypes,
      breadcrumbs,
      goBack: breadcrumbs[getLength(breadcrumbs ?? {}) - 2]?.target ?? 0
    }
  }

  // The single write path for the actorTypes setting. Reconciling here means every derived Actor
  // Type is rebuilt from its parent on any change, wherever that change came from.
  async _saveActorTypes (value) {
    await game.settings.set('cortexprime-ext', 'actorTypes', applyActorTypeInheritance(value))
  }

  async _updateObject(event, formData) {
    if (!$(event.currentTarget).hasClass('die-select')) {
      const expandedFormData = foundry.utils.expandObject(formData)
      const currentActorTypes = game.settings.get('cortexprime-ext', 'actorTypes') ?? {}

      await this._saveActorTypes(foundry.utils.mergeObject(currentActorTypes, expandedFormData.actorTypes))

      this.render(true)
    }
  }

  activateListeners(html) {
    super.activateListeners(html)
    html.find('#add-new-actor-type').click(this._addNewActorType.bind(this))
    html.find('.add-additional-tab').click(this._addAdditionalTab.bind(this))
    html.find('.add-default-note').click(this._addAdditionalTabDefaultNote.bind(this))
    html.find('.add-derived-actor-type').click(this._addDerivedActorType.bind(this))
    html.find('.add-descriptor').click(this._addDescriptor.bind(this))
    html.find('.add-simple-trait').click(this._addSimpleTrait.bind(this))
    html.find('.add-sfx').click(this._addSfx.bind(this))
    html.find('.add-sub-trait').click(this._addSubTrait.bind(this))
    html.find('.add-trait').click(this._addTrait.bind(this))
    html.find('.add-trait-set').click(this._addTraitSet.bind(this))
    html.find('.breadcrumb-name-change').change(this._breadcrumbNameChange.bind(this))
    html.find('.breadcrumb:not(.active), .go-back').click(this._breadcrumbChange.bind(this))
    html.find('.default-image').click(this._changeDefaultImage.bind(this))
    html.find('.die-select').change(this._onDieChange.bind(this))
    html.find('.die-select').on('mouseup', this._onDieRemove.bind(this))
    html.find('.duplicate-item').click(this._duplicateItem.bind(this))
    html.find('.new-die').click(this._newDie.bind(this))
    html.find('.view-change').click(this._viewChange.bind(this))
    this._lockInheritedControls(html)
    expandNotesFieldOnEdit(html)
    removeItem.call(this, html)
    reorderItem.call(this, html)
  }

  // Everything a derived Actor Type inherits is read-only: it belongs to the parent and is rebuilt
  // from it on every save. Disabled inputs aren't serialised by the form, and _updateObject merges
  // rather than replaces, so the omitted fields simply keep their reconciled parent values.
  _lockInheritedControls (html) {
    html.find('.inherited-fields').find('input, select, textarea').prop('disabled', true)
    html.find('.inherited-fields').find('button').remove()
    html.find('.inherited-row').find('.reorder, .duplicate-item, .remove-item').remove()
  }

  async _addNewActorType(event) {
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

    await this._saveActorTypes(foundry.utils.mergeObject(source, newActorType))
    await this.changeView(localizer('NewActorType'), `actorType-${newKey}`)
    this.render(true)
  }

  async _addAdditionalTab (event) {
    event.preventDefault()
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const actorTypeKey = $(event.currentTarget).data('actorType')
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

    await this._saveActorTypes(foundry.utils.mergeObject(source, newAdditionalTab))
    await this.changeView(name, `additionalTab-${actorTypeKey}-${newKey}`)
    this.render(true)
  }

  async _addAdditionalTabDefaultNote (event) {
    event.preventDefault()
    const $addButton = $(event.currentTarget)
    const path = $addButton.data('path')
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const currentDefaultNotes = foundry.utils.getProperty(source, path) || {}

    foundry.utils.setProperty(source, path,
      {
        ...currentDefaultNotes,
        [getLength(currentDefaultNotes ?? {})]: {
          label: localizer('NewSection'),
          allowRename: false,
          allowDeletion: false,
          allowEdit: false,
          value: null
        }
      })

    await this._saveActorTypes(source)
    this.render(true)
  }

  async _addDerivedActorType (event) {
    event.preventDefault()
    const { actorTypeId } = event.currentTarget.dataset
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const newKey = getLength(source ?? {})
    const name = localizer('NewDerivedActorType')

    // Only the identity and the parent link are stored - _saveActorTypes materializes the rest
    // from the parent.
    const newActorType = {
      [newKey]: {
        id: `_${Date.now()}`,
        name,
        parentId: actorTypeId
      }
    }

    await this._saveActorTypes(foundry.utils.mergeObject(source, newActorType))
    await this.changeView(name, `actorType-${newKey}`)
    this.render(true)
  }

  async _addDescriptor(event) {
    event.preventDefault()
    const $addButton = $(event.currentTarget)
    const path = $addButton.data('path')
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const currentDescriptors = foundry.utils.getProperty(source, path) || {}

    foundry.utils.setProperty(source, path,
      {
        ...currentDescriptors,
        [getLength(currentDescriptors ?? {})]: {
          label: localizer('NewDescriptor'),
          value: null
        }
      })

    await this._saveActorTypes(source)
    this.render(true)
  }

  async _addSfx(event) {
    event.preventDefault()
    const $addButton = $(event.currentTarget)
    const path = $addButton.data('path')
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const currentSfx = foundry.utils.getProperty(source, path) || {}

    foundry.utils.setProperty(source, path,
      {
        ...currentSfx,
        [getLength(currentSfx ?? {})]: {
          description: null,
          label: localizer('NewSfx'),
          unlocked: true
        }
      })

    await this._saveActorTypes(source)
    this.render(true)
  }

  async _addSubTrait(event) {
    event.preventDefault()
    const $addButton = $(event.currentTarget)
    const path = $addButton.data('path')
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const currentSubTraits = foundry.utils.getProperty(source, path) || {}


    foundry.utils.setProperty(source, path,
      {
        ...currentSubTraits,
        [getLength(currentSubTraits ?? {})]: {
          dice: { value: { 0: '8' } },
          label: localizer('NewSubTrait')
        }
      })

    await this._saveActorTypes(source)
    this.render(true)
  }

  async _addSimpleTrait (event) {
    event.preventDefault()
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const actorTypeKey = $(event.currentTarget).data('actorType')
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

    await this._saveActorTypes(foundry.utils.mergeObject(source, newSimpleTrait))
    await this.changeView(localizer('NewSimpleTrait'), `simpleTrait-${actorTypeKey}-${newKey}`)
    this.render(true)
  }

  async _addTrait (event) {
    event.preventDefault()
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const { actorType, path, traitSet } = event.currentTarget.dataset
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

    await this._saveActorTypes(source)
    await this.changeView(localizer('NewTrait'), `trait-${actorType}-${traitSet}-${newKey}`)
    this.render(true)
  }

  async _addTraitSet (event) {
    event.preventDefault()
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const actorTypeKey = $(event.currentTarget).data('actorType')
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

    await this._saveActorTypes(foundry.utils.mergeObject(source, newTraitSet))
    await this.changeView(localizer('NewTraitSet'), `traitSet-${actorTypeKey}-${newKey}`)
    this.render(true)
  }

  async _breadcrumbChange (event) {
    const currentBreadcrumbs = game.settings.get('cortexprime-ext', 'actorBreadcrumbs')

    const target = $(event.currentTarget).data('to')

    const targetKey = +objectFindKey(currentBreadcrumbs, breadcrumb => breadcrumb.target === target)

    const value = objectReduce(currentBreadcrumbs, (breadcrumbs, breadcrumb, key) => {
      if (+key > targetKey) return breadcrumbs

      breadcrumb.active = breadcrumb.target === target

      return {
        ...breadcrumbs,
        [key]: breadcrumb
      }
    }, {})

    await game.settings.set('cortexprime-ext', 'actorBreadcrumbs', value)

    await this._onSubmit(event)
    this.render(true)
  }

  async _breadcrumbNameChange (event) {
    const $nameField = $(event.currentTarget)
    const target = $nameField.data('target')
    const currentBreadcrumbs = game.settings.get('cortexprime-ext', 'actorBreadcrumbs')

    await game.settings.set('cortexprime-ext', 'actorBreadcrumbs', {
      ...objectMapValues(currentBreadcrumbs, breadcrumb => {
        if (breadcrumb.target === target) {
          breadcrumb.name = $nameField.val()
        }

        return breadcrumb
      })
    })
  }

  async _changeDefaultImage (event) {
    event.preventDefault()
    const { actorTypeIndex } = event.currentTarget.dataset
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const currentImage = source[actorTypeIndex]?.defaultImage || 'icons/svg/mystery-man.svg'
    const _this = this

    const imagePicker = new foundry.applications.apps.FilePicker.implementation({
      type: 'image',
      current: currentImage,
      async callback (newImage) {
        source[actorTypeIndex].defaultImage = newImage

        await _this._saveActorTypes(source)

        _this.render()
      }
    })

    await imagePicker.render()
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

    this.render(true)
  }

  async _duplicateItem (event) {
    event.preventDefault()
    const { id, path } = event.currentTarget.dataset
    let source = game.settings.get('cortexprime-ext', 'actorTypes')
    const targetGroup = path ? foundry.utils.getProperty(source, path) : source
    const newKey = getLength(targetGroup ?? {})
    const target = objectFindValue(targetGroup, item => item.id === id)

    const newTarget = {
      [newKey]: objectMapValues(target, (value, key) => {
        if (key === 'id') return `_${Date.now()}`

        return value
      })
    }

    if (path) {
      foundry.utils.setProperty(source, path, { ...targetGroup, ...newTarget })
    } else {
      source = foundry.utils.mergeObject(source, newTarget)
    }

    await this._saveActorTypes(source)
    this.render(true)
  }

  async _newDie (event) {
    event.preventDefault()
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const { target: path } = event.currentTarget.dataset
    const currentDice = foundry.utils.getProperty(source, path) || {}
    const values = currentDice.value ?? {}
    const newKey = getLength(values)
    const newValue = newKey > 0 ? values[newKey - 1] : '8'

    foundry.utils.setProperty(source, `${path}.value`, { ...values, [newKey]: newValue })
    await this._saveActorTypes(source)
    this.render(true)
  }

  async _onDieChange (event) {
    event.preventDefault()
    const source = game.settings.get('cortexprime-ext', 'actorTypes')
    const $dieSelect = $(event.currentTarget)
    const target = $dieSelect.data('target')
    const targetKey = $dieSelect.data('key')
    const targetValue = $dieSelect.val()
    const currentDiceValues = foundry.utils.getProperty(source, `${target}.value`) ?? {}

    if (parseInt(targetValue, 10) === 0) {
      foundry.utils.setProperty(source, `${target}.value`, objectReindexFilter(currentDiceValues, (_, index) => parseInt(index, 10) !== parseInt(targetKey, 10)))
    } else {
      foundry.utils.setProperty(source, `${target}.value`, objectMapValues(currentDiceValues, (value, index) => parseInt(index, 10) === parseInt(targetKey, 10) ? targetValue : value))
    }

    await this._saveActorTypes(source)

    await this.render(true)
  }

  async _onDieRemove (event) {
    event.preventDefault()

    if (event.button === 2) {
      const source = game.settings.get('cortexprime-ext', 'actorTypes')
      const $dieSelect = $(event.currentTarget)
      const target = $dieSelect.data('target')
      const targetKey = $dieSelect.data('key')
      const currentDiceValues = foundry.utils.getProperty(source, `${target}.value`) ?? {}

      foundry.utils.setProperty(source, `${target}.value`, objectReindexFilter(currentDiceValues, (_, index) => parseInt(index, 10) !== parseInt(targetKey, 10)))

      await this._saveActorTypes(source)

      await this.render(true)
    }
  }

  async _viewChange (event) {
    event.preventDefault()
    this.changeView($(event.currentTarget).data('name'), $(event.currentTarget).data('to'))
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
