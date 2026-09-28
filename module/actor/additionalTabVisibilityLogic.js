// Pure decision logic for which Additional Tabs a user may see on an actor sheet.
//
// An Additional Tab flagged `ownerOnly` renders only for users with Owner permission on the actor
// (actor.isOwner - always true for a GM). This is render-only: Foundry still sends the full actor
// data to every client, so it hides the tab as a matter of table etiquette, not security.
//
// The same rule is written inline in templates/actor/actor-sheet.html, because the sheet can't
// filter the tabs in JS - their index is used by the update paths and has to stay the real one.
// Keep the two in step.

export const isAdditionalTabVisible = (tab, isOwner) => !tab?.ownerOnly || !!isOwner

// The sheet's active tab, unless it names an Additional Tab this user can no longer see (flagged
// owner-only, or ownership revoked, while they had it open) - then back to Traits rather than
// rendering an empty body.
export const resolveActiveTab = (activeTab, additionalTabs, isOwner) => {
  const tab = Object.values(additionalTabs ?? {}).find(({ id } = {}) => id === activeTab)

  return tab && !isAdditionalTabVisible(tab, isOwner) ? 'traits' : activeTab
}
