// Open-application queries that work across BOTH application frameworks.
//
// Application V1 popout windows are registered in `ui.windows`. Application V2 windows are NOT —
// they live in `foundry.applications.instances` and never appear in `ui.windows` at all. Each of
// these runs the union of both inside the page.
//
// Nothing in THIS system is appv1 any more, but the ui.windows half still earns its place: it is
// what lets closeLeftoverWindows (e2e/foundry.js) dismiss a third-party module's V1 dialog before
// it parks itself over the UI and swallows a spec's clicks. Yendor's Scene Actors is the known
// example, and its changelog is a FormApplication.
//
// The V2 half MUST be filtered to framed windows. `foundry.applications.instances` is not the
// equivalent of `ui.windows`: it holds every live ApplicationV2, which in v13 includes all the
// core UI singletons — the sidebar, chat log, hotbar, player list, scene navigation, controls,
// HUD and all nine directories. Unfiltered, "close everything that is open" dismantles the whole
// interface at login and every later spec fails against a Foundry with no chat and no sidebar.
// Framing is the exact discriminator: every one of those singletons is frame:false, and a real
// popout window is frame:true — which is also precisely the popOut:true rule that decided what
// V1 put in `ui.windows`, so the union means the same thing on both sides.

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
