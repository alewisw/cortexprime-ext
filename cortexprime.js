import { CortexPrimeActor } from './module/entities/CortexPrimeActor.js'
import PlotPoint from './module/PlotPoint.js'
import { preloadHandlebarsTemplates } from './module/handlebars/preloadTemplates.js'
import { registerHandlebarHelpers } from './module/handlebars/helpers.js'
import { registerSettings } from './module/settings/settings.js'
import { CortexPrimeActorSheet } from './module/actor/actor-sheet.js'
import cortexPrimeHooks from './module/cortexPrimeHooks.js'

Hooks.once('init', () => {
  console.log(`CP | Initializing Cortex Prime`)

  game.cortexprime = {
    CortexPrimeActor
  }

  CONFIG.Actor.documentClass = CortexPrimeActor
  CONFIG.Dice.terms['p'] = PlotPoint

  registerHandlebarHelpers()
  preloadHandlebarsTemplates()
  registerSettings()

  // No unregisterSheet("core", ...) call: v13 registers no core Actor sheet for this system to
  // displace - verified by removing the call and confirming CONFIG.Actor.sheetClasses still
  // lists only this one, for both the base and character types. It used to reference
  // foundry.appv1.sheets.ActorSheet, the last appv1 reference left in the system.
  foundry.documents.collections.Actors.registerSheet("cortexprime-ext", CortexPrimeActorSheet, { makeDefault: true })

  cortexPrimeHooks()
})