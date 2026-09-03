import defaultThemes from "../theme/defaultThemes.js"
import { applyActorTypeInheritance } from "../actor/actorTypeInheritanceLogic.js"
import { confirmAction, localizer, setCssVars } from "../scripts/foundryHelpers.js"
import { CortexApplicationV2 } from "../applications/CortexApplicationV2.js"
import {
  buildExportPayload,
  buildImportValues,
  buildResetValues,
  isImportableSettings,
  needsVersionWarning,
  resolveActiveTheme,
  resolveImportedThemes
} from "./importExportLogic.js"

export default class ImportExportSettings extends CortexApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'import-export-settings',
    classes: ['import-export-settings'],
    position: { width: 'auto', height: 'auto', top: 200, left: 400 },
    // A localization key, not a localized string: DEFAULT_OPTIONS is evaluated at module load,
    // before game.i18n exists.
    window: { title: 'ImportExportSettings', resizable: true },
    actions: {
      exportSettings: ImportExportSettings.#onExportSettings,
      resetSettings: ImportExportSettings.#onResetSettings
    }
    // Deliberately no `form` config, and no tag:'form'. The appv1 version declared
    // submitOnChange/submitOnClose with an EMPTY _updateObject, and its only input is the file
    // picker, which has no name attribute - so nothing was ever collected or saved. Every write
    // this app makes goes through game.settings directly from the handlers below.
  }

  static PARTS = {
    content: { template: 'systems/cortexprime-ext/templates/import-export-settings.html' }
  }

  async _prepareContext (options) {
    return {
      ...await super._prepareContext(options),
      ...game.settings.get('cortexprime-ext', 'importedSettings')
    }
  }

  // `change` on the file input has no `actions` equivalent, so it stays hand-wired.
  _onRender (context, options) {
    super._onRender(context, options)

    this.element.querySelector('.import-settings')
      ?.addEventListener('change', this.#onImportSettings.bind(this))
  }

  static async #onExportSettings (event, target) {
    event.preventDefault()

    const settings = buildExportPayload(
      game.system.version,
      game.settings.get('cortexprime-ext', 'themes'),
      key => game.settings.get('cortexprime-ext', key)
    )

    foundry.utils.saveDataToFile(JSON.stringify(settings, null, 2), 'json', 'my-cortex-prime-settings.json')
  }

  // Not an `actions` entry (it is a change handler, bound in _onRender), so this is an ordinary
  // private method and `this` is already the instance.
  async #onImportSettings (event) {
    event.preventDefault()

    const file = event.currentTarget.files?.[0]

    if (!file) return

    const fileReader = new FileReader()

    fileReader.onload = async () => {
      let data
      let warning

      try {
        data = JSON.parse(fileReader.result)
      } catch (error) {
        console.error(error)
        ui.notifications.error(localizer('CantReadImportFile'))
        return
      }

      if (!isImportableSettings(data)) {
        ui.notifications.error(localizer('CantReadImportFile'))
        return
      }

      if (needsVersionWarning(game.system.version, data)) {
        warning = localizer('ImportVersionWarning')
      }

      const confirmed = await confirmAction({
        content: `<div>${warning ? '<p class="my-2 pa-2 ba-2-primary">' + warning + '</p>' : ''}<p class="my-2">${localizer('ConfirmImportMessage')}</p></div>`
      })

      if (!confirmed) return

      await game.settings.set('cortexprime-ext', 'importedSettings', { currentSetting: file.name })

      for (const [key, value] of buildImportValues(data)) {
        // Reconcile on the way in, so a config exported before Actor Type inheritance existed
        // (or one edited by hand) still lands with every derived type rebuilt from its parent.
        await game.settings.set(
          'cortexprime-ext',
          key,
          key === 'actorTypes' ? applyActorTypeInheritance(value) : value
        )
      }

      const themeSettings = resolveImportedThemes(
        game.settings.get('cortexprime-ext', 'themes'),
        data
      )

      await game.settings.set('cortexprime-ext', 'themes', themeSettings)

      setCssVars(resolveActiveTheme(themeSettings))

      // Some SYNCED_SETTINGS entries are config:true and shown on Foundry's native Configure
      // Settings dialog, which only reads current values when it renders — refresh it if it's
      // already open so the imported/reset values show up without a manual close/reopen.
      if (game.settings.sheet.rendered) game.settings.sheet.render()

      ui.notifications.info(localizer('ImportSuccessMessage'))

      await this.render()
    }

    fileReader.readAsText(file)
  }

  static async #onResetSettings (event, target) {
    event.preventDefault()

    const confirmed = await confirmAction({
      content: localizer('ConfirmResetSettingsMessage')
    })

    if (!confirmed) return

    await game.settings.set('cortexprime-ext', 'importedSettings', { currentSetting: localizer('Default') })

    for (const [key, value] of buildResetValues()) {
      await game.settings.set('cortexprime-ext', key, value)
    }

    await game.settings.set('cortexprime-ext', 'themes', defaultThemes)
    setCssVars(resolveActiveTheme(defaultThemes))

    // See the matching comment in #onImportSettings: refresh Foundry's native Configure Settings
    // dialog if it's already open, since some SYNCED_SETTINGS entries are config:true there.
    if (game.settings.sheet.rendered) game.settings.sheet.render()

    ui.notifications.info(localizer('ResetSuccessMessage'))

    await this.render()
  }
}
