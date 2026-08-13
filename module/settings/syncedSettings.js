import defaultActorTypes from "../actor/defaultActorTypes.js"
import defaultMageSettings from "./defaultMageSettings.js"
import defaultPlotPointUses from "../actor/defaultPlotPointUses.js"

// Every world-scope, GM-authored setting that the Import/Export tool should sync. Add new
// world settings here — and only here — so export/import/reset can never drift out of sync
// the way doomPoolActorId/doomPoolTraitId once did.
// rollResultSourceCollapsed is deliberately excluded: it's client-scoped (a personal display
// preference), not world config. themes is handled separately in ImportExportSettings.js since
// only its current/custom fields are GM-authored (list/version are static presets).
export const SYNCED_SETTINGS = [
  { key: 'actorTypes', default: defaultActorTypes },
  { key: 'customRuleSet', default: 'none' },
  { key: 'mageSettings', default: defaultMageSettings },
  { key: 'plotPointUses', default: defaultPlotPointUses },
  { key: 'doomPoolActorId', default: '' },
  { key: 'doomPoolTraitId', default: '' },
  { key: 'testModeSelectDiceValues', default: false },
  { key: 'spotlightEnabled', default: true },
]
