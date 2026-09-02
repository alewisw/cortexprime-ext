// Open-application queries that work across BOTH application frameworks.
//
// Application V1 popout windows are registered in `ui.windows`. Application V2 windows are NOT —
// they live in `foundry.applications.instances` and never appear in `ui.windows` at all. While
// the system is part-migrated both registries are populated, so every spec that asks "what is
// open" or "close that window" has to look in both, or it silently stops seeing an app the
// moment that app moves to V2. Each of these runs the union inside the page.
//
// The V2 half MUST be filtered to framed windows. `foundry.applications.instances` is not the
// equivalent of `ui.windows`: it holds every live ApplicationV2, which in v13 includes all the
// core UI singletons — the sidebar, chat log, hotbar, player list, scene navigation, controls,
// HUD and all nine directories. Unfiltered, "close everything that is open" dismantles the whole
// interface at login and every later spec fails against a Foundry with no chat and no sidebar.
// Framing is the exact discriminator: every one of those singletons is frame:false, and a real
// popout window is frame:true — which is also precisely the popOut:true rule that decided what
// V1 put in `ui.windows`, so the union means the same thing on both sides.
//
// Once the migration is finished the ui.windows half can be dropped from all three.

// Serialised into page.evaluate below; kept as one string so the union is written exactly once.
const ALL_APPS = `[
  ...Object.values(window.ui?.windows ?? {}),
  ...[...(window.foundry?.applications?.instances?.values() ?? [])].filter(app => app.hasFrame)
]`

/** Names of every open application window, for diagnostics. */
export function listOpenAppNames(page) {
  return page.evaluate(`${ALL_APPS}.map(app => app.constructor?.name ?? app.id ?? 'unknown')`)
}

/**
 * Closes open application windows.
 *
 * `filter` selects which: `{}` closes everything, `{ id }` closes windows with that id, and
 * `{ hasActor: true }` closes anything holding an actor (i.e. an actor sheet).
 */
export function closeOpenApps(page, filter = {}) {
  return page.evaluate(`(async () => {
    const { id, hasActor } = ${JSON.stringify(filter)}

    for (const app of ${ALL_APPS}) {
      if (id && app.id !== id) continue
      if (hasActor && !app.actor) continue

      // A window that refuses to close is still better than failing the spec here.
      try { await app.close() } catch {}
    }
  })()`)
}

/** The actor id of the first open actor sheet, or null. */
export function openActorSheetActorId(page) {
  return page.evaluate(`${ALL_APPS}.find(app => app.actor)?.actor?.id ?? null`)
}
