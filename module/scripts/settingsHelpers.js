import { applyActorTypeInheritance } from '../actor/actorTypeInheritanceLogic.js'
import { getLength, objectMapKeys, objectReduce, objectReindexFilter } from '../../lib/helpers.js'
import { confirmAction, localizer } from './foundryHelpers.js'

// removeItem/reorderItem are generic over data-setting, so actorTypes gets its inheritance
// reconcile here rather than in ActorSettings._saveActorTypes.
const reconciled = (setting, value) => setting === 'actorTypes' ? applyActorTypeInheritance(value) : value

export const collapseToggle = function (html) {
  html.find('.collapse-toggle').click(async (event) => {
    event.preventDefault()
    const $element = $(event.currentTarget)
    const $collapseValue = $element
      .next('.collapse-value')

    $collapseValue.prop('checked', !($collapseValue.is(':checked')))

    await this._onSubmit(event)
    this.render(true)
  })
}

export const displayToggle = html => {
  html.find('input.display-toggle').change((event) => {
    event.preventDefault()
    const $target = $(event.currentTarget)
    const scope = $target.data('scope')
    const selector = $target.data('selector')

    if (scope) {
      $(event.currentTarget)
        .closest(scope)
        .find(selector)
        .toggle()
    } else {
      html.find(selector).toggle()
    }
  })
}

// removeItem/reorderItem below exist in two shapes on purpose. The templates/partials that carry
// these buttons (remove-button.html, reorder.html) are rendered by applications on BOTH
// frameworks while the migration is in progress, so the work itself lives in one place and gets a
// thin wrapper for each: a jQuery binding for the appv1 apps, and an `actions` handler for the V2
// ones. Both take the button's dataset and run with `this` bound to the owning application.
// Once nothing appv1 renders these partials, the jQuery halves can go.

const applyRemoveItem = async function ({ group, itemKey, itemName, setting, stayOnPage }) {
  const confirmed = await confirmAction({
    content: `${localizer('Remove')} ${itemName}?`
  })

  if (!confirmed || !setting) return

  let settings = game.settings.get('cortexprime-ext', setting)

  const currentGroupSettings = group ? foundry.utils.getProperty(settings, group) : settings
  const groupSettingValue = objectReindexFilter(currentGroupSettings, (_, key) => key !== itemKey)

  if (group) {
    foundry.utils.setProperty(settings, group, groupSettingValue)
  } else {
    settings = groupSettingValue
  }

  await game.settings.set('cortexprime-ext', setting, reconciled(setting, settings))

  if (setting === 'actorTypes' && !stayOnPage) {
    const currentBreadcrumbs = game.settings.get('cortexprime-ext', 'actorBreadcrumbs')

    const breadcrumbsValue = objectReduce(currentBreadcrumbs, (acc, value, key, length) => {
      if (+key === length - 1) return acc

      return {
        ...acc,
        [key]: {
          ...value,
          active: +key === (length - 2)
        }
      }
    }, {})

    await game.settings.set('cortexprime-ext', 'actorBreadcrumbs', breadcrumbsValue)
  }

  this.render(true)
}

const applyReorderItem = async function ({ currentIndex, newIndex, path, setting }) {
  let settings = game.settings.get('cortexprime-ext', setting)
  const targetObject = (path || parseInt(path, 10) === 0) ? foundry.utils.getProperty(settings, path) ?? {} : settings
  const maxKey = getLength(targetObject ?? {}) - 1

  const key = +newIndex < 0
    ? maxKey
    : maxKey < +newIndex
      ? 0
      : +newIndex

  const value = objectMapKeys(targetObject, (_, targetKey) => {
    return +targetKey === +currentIndex
      ? key
      : +currentIndex > key
        ? +targetKey < +currentIndex && +targetKey >= key
          ? +targetKey + 1
          : +targetKey
        : +targetKey > +currentIndex && +targetKey <= key
          ? +targetKey - 1
          : +targetKey
  })

  if (path || parseInt(path, 10) === 0) {
    foundry.utils.setProperty(settings, path, value)
  } else {
    settings = value
  }

  await game.settings.set('cortexprime-ext', setting, reconciled(setting, settings))

  this.render(true)
}

/** appv1 binding. */
export const removeItem = function (html) {
  html.find('.remove-item').click(async event => {
    event.preventDefault()

    await applyRemoveItem.call(this, event.currentTarget.dataset)
  })
}

/** appv1 binding. */
export const reorderItem = function (html) {
  html.find('.reorder').click(async event => {
    event.preventDefault()

    await applyReorderItem.call(this, event.currentTarget.dataset)
  })
}

/** ApplicationV2 `actions` handler. */
export async function onRemoveItem (event, target) {
  event.preventDefault()

  await applyRemoveItem.call(this, target.dataset)
}

/** ApplicationV2 `actions` handler. */
export async function onReorderItem (event, target) {
  event.preventDefault()

  await applyReorderItem.call(this, target.dataset)
}
