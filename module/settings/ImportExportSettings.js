import defaultThemes from "../theme/defaultThemes.js"
import { applyActorTypeInheritance } from "../actor/actorTypeInheritanceLogic.js"
import { confirmAction, localizer, setCssVars } from "../scripts/foundryHelpers.js"
import {
  buildExportPayload,
  buildImportValues,
  buildResetValues,
  isImportableSettings,
  needsVersionWarning,
  resolveActiveTheme,
  resolveImportedThemes
} from "./importExportLogic.js"

export default class ImportExportSettings extends FormApplication {
  constructor() {
    super()
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'import-export-settings',
      template: 'systems/cortexprime-ext/templates/import-export-settings.html',
      title: localizer('ImportExportSettings'),
      classes: ['cortexprime', 'import-export-settings'],
      width: 'auto',
      height: 'auto',
      top: 200,
      left: 400,
      resizable: true,
      closeOnSubmit: false,
      submitOnClose: true,
      submitOnChange: true
    })
  }

  getData() {
    return game.settings.get('cortexprime-ext', 'importedSettings')
  }

  async _updateObject(event, formData) {
  }

  activateListeners(html) {
    super.activateListeners(html)
    html.find('.export-settings').click(this._exportSettings.bind(this))
    html.find('.import-settings').change(this._importSettings.bind(this))
    html.find('.reset-settings').click(this._resetSettings.bind(this))
  }

  async _exportSettings(event) {
    event.preventDefault()

    const settings = buildExportPayload(
      game.system.version,
      game.settings.get('cortexprime-ext', 'themes'),
      key => game.settings.get('cortexprime-ext', key)
    )

    await foundry.utils.saveDataToFile(JSON.stringify(settings, null, 2), 'json', 'my-cortex-prime-settings.json')
  }

  async _importSettings(event) {
    event.preventDefault()
    const file = $(event.currentTarget).prop('files')[0]

    if (file) {
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

        if (confirmed) {
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
            await game.settings.get('cortexprime-ext', 'themes'),
            data
          )

          await game.settings.set('cortexprime-ext', 'themes', themeSettings)

          setCssVars(resolveActiveTheme(themeSettings))

          // Some SYNCED_SETTINGS entries are config:true and shown on Foundry's native Configure
          // Settings dialog, which only reads current values when it renders — refresh it if it's
          // already open so the imported/reset values show up without a manual close/reopen.
          if (game.settings.sheet.rendered) game.settings.sheet.render()

          ui.notifications.info(localizer('ImportSuccessMessage'))

          this.render(true)
        }
      }

      fileReader.readAsText(file)
    }
  }

  async _resetSettings (event) {
    event.preventDefault()

    const confirmed = await confirmAction({
      content: localizer('ConfirmResetSettingsMessage')
    })

    if (confirmed) {
      await game.settings.set('cortexprime-ext', 'importedSettings', { currentSetting: localizer('Default') })

      for (const [key, value] of buildResetValues()) {
        await game.settings.set('cortexprime-ext', key, value)
      }

      await game.settings.set('cortexprime-ext', 'themes', defaultThemes)
      setCssVars(resolveActiveTheme(defaultThemes))

      // See the matching comment in _importSettings: refresh Foundry's native Configure Settings
      // dialog if it's already open, since some SYNCED_SETTINGS entries are config:true there.
      if (game.settings.sheet.rendered) game.settings.sheet.render()

      ui.notifications.info(localizer('ResetSuccessMessage'))

      this.render(true)
    }
  }
}