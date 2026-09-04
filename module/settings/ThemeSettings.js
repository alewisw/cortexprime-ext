import { getCurrentTheme, setCssVars } from '../scripts/foundryHelpers.js'
import { CortexApplicationV2 } from '../applications/CortexApplicationV2.js'
import defaultThemes from '../theme/defaultThemes.js'
import { resolveUpdatedPresetCurrent } from './themeSettingsLogic.js'

export default class ThemeSettings extends CortexApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'theme-settings',
    classes: ['theme-settings'],
    tag: 'form',
    position: { width: 960, height: 900, top: 200, left: 400 },
    // A localization key, not a localized string: DEFAULT_OPTIONS is evaluated at module load,
    // before game.i18n exists.
    window: { title: 'ThemeSettings', resizable: true },
    form: {
      handler: ThemeSettings.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      imagePicker: ThemeSettings.#onChangeImage,
      imageRemove: ThemeSettings.#onRemoveImage,
      refreshPreset: ThemeSettings.#onRefreshPreset,
      saveAsCustomPreset: ThemeSettings.#onSaveAsCustomPreset,
      updatePresets: ThemeSettings.#onUpdatePresets
    }
  }

  static PARTS = {
    form: { template: 'systems/cortexprime-ext/templates/theme/settings.html' }
  }

  async _prepareContext (options) {
    return {
      ...await super._prepareContext(options),
      themes: game.settings.get('cortexprime-ext', 'themes'),
      defaultVersion: defaultThemes.version
    }
  }

  // Set by _preClose so the submit it triggers doesn't try to re-render an application that is
  // already on its way out.
  #closing = false

  // appv1's submitOnClose has no ApplicationV2 equivalent. submitOnChange already commits each
  // edit, but a value typed and then closed while the field still has focus would be lost, so
  // submit once more on the way out. _preClose rather than _onClose, because it is awaited while
  // the form element still exists.
  async _preClose (options) {
    this.#closing = true

    if (this.form) await this.submit()

    return super._preClose(options)
  }

  static async #onSubmit (event, form, formData) {
    const expandedFormData = foundry.utils.expandObject(formData.object)
    const currentThemes = game.settings.get('cortexprime-ext', 'themes') ?? {}

    // Switching preset replaces the working copy wholesale; editing within a preset keeps it.
    expandedFormData.themes.currentSettings = currentThemes.current !== expandedFormData.themes.current
      ? expandedFormData.themes.current === 'custom'
        ? currentThemes.custom
        : currentThemes.list[expandedFormData.themes.current]
      : expandedFormData.themes.currentSettings

    await game.settings.set('cortexprime-ext', 'themes', foundry.utils.mergeObject(currentThemes, expandedFormData.themes))

    setCssVars(getCurrentTheme())

    if (!this.#closing) await this.render()
  }

  static async #onChangeImage (event, target) {
    event.preventDefault()

    const { targetSetting } = target.dataset
    const source = game.settings.get('cortexprime-ext', 'themes')
    const currentImage = source?.currentSettings?.[targetSetting] || null

    const imagePicker = new foundry.applications.apps.FilePicker.implementation({
      type: 'image',
      current: currentImage,
      // An arrow function, so `this` is still the application. The appv1 version used method
      // shorthand here and had to capture the instance in a local `_this`.
      callback: async newImage => {
        source.currentSettings[targetSetting] = newImage

        await game.settings.set('cortexprime-ext', 'themes', source)

        setCssVars(getCurrentTheme())

        await this.render()
      }
    })

    await imagePicker.render({ force: true })
  }

  static async #onRemoveImage (event, target) {
    event.preventDefault()

    const { targetSetting } = target.dataset
    const source = game.settings.get('cortexprime-ext', 'themes')

    source.currentSettings[targetSetting] = null

    await game.settings.set('cortexprime-ext', 'themes', source)

    setCssVars(getCurrentTheme())

    await this.render()
  }

  static async #onRefreshPreset (event, target) {
    event.preventDefault()

    const source = game.settings.get('cortexprime-ext', 'themes')

    source.currentSettings = source.current === 'custom'
      ? source.custom
      : source.list[source.current]

    await game.settings.set('cortexprime-ext', 'themes', source)

    setCssVars(getCurrentTheme())

    await this.render()
  }

  static async #onSaveAsCustomPreset (event, target) {
    event.preventDefault()

    const source = game.settings.get('cortexprime-ext', 'themes')

    source.current = 'custom'
    source.custom = source.currentSettings

    await game.settings.set('cortexprime-ext', 'themes', source)

    setCssVars(getCurrentTheme())

    await this.render()
  }

  static async #onUpdatePresets (event, target) {
    event.preventDefault()

    const source = game.settings.get('cortexprime-ext', 'themes')

    // Checked against the INCOMING list (defaultThemes.list, about to replace source.list below)
    // - a preset this update renames or removes must fall back to the default rather than stay
    // selected pointing at a name that's about to disappear. See resolveUpdatedPresetCurrent.
    source.current = resolveUpdatedPresetCurrent(source.current, defaultThemes.list, defaultThemes.current)
    source.list = defaultThemes.list
    source.version = defaultThemes.version
    source.currentSettings = source.current === 'custom'
      ? source.custom
      : source.list[source.current]

    await game.settings.set('cortexprime-ext', 'themes', source)

    setCssVars(getCurrentTheme())

    await this.render()
  }
}
