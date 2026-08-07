import ActorSettings from './ActorSettings.js'
import DoomPoolSettings from './DoomPoolSettings.js'
import ImportExportSettings from './ImportExportSettings.js'
import defaultActorTypes from '../actor/defaultActorTypes.js'
import defaultThemes from '../theme/defaultThemes.js'
import ThemeSettings from './ThemeSettings.js'

import { localizer } from '../scripts/foundryHelpers.js'

export const registerSettings = () => {
  game.settings.registerMenu('cortexprime', 'ActorSettings', {
    hint: localizer('ActorSettingsH'),
    icon: 'fa-solid fa-user-cog',
    label: localizer('ActorSettings'),
    name: localizer('ActorSettings'),
    restricted: true,
    type: ActorSettings
  })

  game.settings.register('cortexprime', 'actorTypes', {
    name: localizer('ActorTypes'),
    default: defaultActorTypes,
    scope: 'world',
    type: Object,
    config: false,  
  })

  game.settings.register('cortexprime', 'actorBreadcrumbs', {
    name: localizer('ActorBreadcrumbs'),
    default: { 0: { active: true, name: 'ActorTypes', localize: true, target: 'actorTypes' } },
    scope: 'world',
    type: Object,
    config: false,
  })

  game.settings.registerMenu('cortexprime', 'DoomPoolSettings', {
    hint: localizer('DoomPoolSettingsH'),
    icon: 'fa-solid fa-skull',
    label: localizer('DoomPoolSettings'),
    name: localizer('DoomPoolSettings'),
    restricted: true,
    type: DoomPoolSettings
  })

  game.settings.register('cortexprime', 'doomPoolActorId', {
    name: localizer('DoomPoolActor'),
    default: '',
    scope: 'world',
    type: String,
    config: false,
  })

  game.settings.register('cortexprime', 'lastGmRoll', {
    name: localizer('LastGmRoll'),
    default: {},
    scope: 'world',
    type: Object,
    config: false,
  })

  game.settings.register('cortexprime', 'activeChallenge', {
    name: localizer('ActiveChallenge'),
    default: {},
    scope: 'world',
    type: Object,
    config: false,
  })

  game.settings.register('cortexprime', 'crisisPool', {
    name: localizer('CrisisPool'),
    default: { active: false, name: '', dice: [] },
    scope: 'world',
    type: Object,
    config: false,
  })

  game.settings.registerMenu("cortexprime", "ImportExportSettings", {
    name: localizer('ImportExportSettings'),
    hint: localizer('ImportExportSettingsHint'),
    icon: 'fa-solid fa-file-import',
    label: localizer('ImportExportSettings'),
    restricted: true,
    type: ImportExportSettings
  })

  game.settings.register('cortexprime', 'rollResultSourceCollapsed', {
    name: localizer('RollResultSourceCollapsed'),
    hint: localizer('RollResultSourceCollapsedHint'),
    label: localizer('RollResultSourceCollapsed'),
    default: false,
    type: Boolean,
    config: true
  })

  game.settings.register('cortexprime', 'importedSettings', {
    name: localizer('ImportedSettings'),
    default: { currentSetting: localizer('Default') },
    scope: 'world',
    type: Object,
    config: false,
  })

  game.settings.register("cortexprime", "WelcomeSeen", {
    name: localizer('WelcomeSeen'),
    hint: localizer('WelcomSeenHint'),
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  })

  game.settings.register('cortexprime', 'activeDistinctionActorId', {
    name: localizer('ActiveDistinctionActorId'),
    default: '',
    scope: 'world',
    type: String,
    config: false,
  })

  game.settings.register('cortexprime', 'spotlightActorId', {
    name: localizer('SpotlightActorId'),
    default: '',
    scope: 'world',
    type: String,
    config: false,
  })

  game.settings.register('cortexprime', 'spotlightEnabled', {
    name: localizer('SpotlightEnabled'),
    hint: localizer('SpotlightEnabledHint'),
    default: true,
    scope: 'world',
    type: Boolean,
    config: true,
  })

  game.settings.registerMenu('cortexprime', 'ThemeSettings', {
    hint: localizer('ThemeSettingsH'),
    icon: 'fa-solid fa-user-cog',
    label: localizer('ThemeSettings'),
    name: localizer('ThemeSettings'),
    restricted: true,
    type: ThemeSettings
  })

  game.settings.register('cortexprime', 'themes', {
    name: localizer('Themes'),
    default: defaultThemes,
    scope: 'world',
    type: Object,
    config: false,
  })
}
