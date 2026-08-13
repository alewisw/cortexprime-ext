import defaultThemes from "../theme/defaultThemes.js"
import { localizer, setCssVars } from "../scripts/foundryHelpers.js"
import { SYNCED_SETTINGS } from "./syncedSettings.js"

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

    const { current, custom } = game.settings.get('cortexprime-ext', 'themes')

    const settings = {
      cortexPrimeVersion: game.system.version,
      theme: { current, custom }
    }

    for (const { key } of SYNCED_SETTINGS) {
      settings[key] = game.settings.get('cortexprime-ext', key)
    }

    await saveDataToFile(JSON.stringify(settings, null, 2), 'json', 'my-cortex-prime-settings.json')
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

        if (!data?.cortexPrimeVersion && !data?.actorTypes) {
          ui.notifications.error(localizer('CantReadImportFile'))
          return
        }

        if (game.system.version !== data?.cortexPrimeVersion) {
          warning = localizer('ImportVersionWarning')
        }

        let confirmed

        await Dialog.confirm({
          title: localizer('AreYouSure'),
          content: `<div>${warning ? '<p class="my-2 pa-2 ba-2-primary">' + warning + '</p>' : ''}<p class="my-2">${localizer('ConfirmImportMessage')}</p></div>`,
          yes: () => { confirmed = true },
          no: () => { confirmed = false },
          defaultYes: false
        })

        if (confirmed) {
          await game.settings.set('cortexprime-ext', 'importedSettings', { currentSetting: file.name })

          for (const { key, default: fallback } of SYNCED_SETTINGS) {
            await game.settings.set('cortexprime-ext', key, data[key] ?? fallback)
          }

          const themeSettings = await game.settings.get('cortexprime-ext', 'themes')

          const { current, custom } = data.theme ?? {}

          themeSettings.current = current ?? 'Default'
          themeSettings.custom = custom ?? themeSettings.custom

          await game.settings.set('cortexprime-ext', 'themes', themeSettings)

          const theme = themeSettings.current === 'custom' ? themeSettings.custom : themeSettings.list[themeSettings.current]

          setCssVars(theme)

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

    let confirmed

    await Dialog.confirm({
      title: localizer('AreYouSure'),
      content: localizer('ConfirmResetSettingsMessage'),
      yes: () => { confirmed = true },
      no: () => { confirmed = false },
      defaultYes: false
    })

    if (confirmed) {
      await game.settings.set('cortexprime-ext', 'importedSettings', { currentSetting: localizer('Default') })

      for (const { key, default: fallback } of SYNCED_SETTINGS) {
        await game.settings.set('cortexprime-ext', key, fallback)
      }

      await game.settings.set('cortexprime-ext', 'themes', defaultThemes)
      const theme = defaultThemes.current === 'custom' ? defaultThemes.custom : defaultThemes.list[defaultThemes.current]
      setCssVars(theme)

      // See the matching comment in _importSettings: refresh Foundry's native Configure Settings
      // dialog if it's already open, since some SYNCED_SETTINGS entries are config:true there.
      if (game.settings.sheet.rendered) game.settings.sheet.render()

      ui.notifications.info(localizer('ResetSuccessMessage'))

      this.render(true)
    }
  }
}