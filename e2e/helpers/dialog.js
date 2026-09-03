// Dialog interactions that work across BOTH dialog frameworks.
//
// DialogV2 renders its buttons into `footer.form-footer` as `<button data-action="yes">`, inside
// an element carrying the `dialog` class. (appv1's Dialog used `.dialog-buttons` and
// `data-button="yes"`; nothing in this system raises one of those any more.)
const YES = '.dialog button[data-action="yes"]'

/** Clicks the Yes button of whichever confirmation dialog is open. */
export async function confirmYes(page) {
  await page.locator(YES).first().click()
}

/**
 * Confirms a dialog by its button label — for dialogs whose buttons are named rather than
 * yes/no (the dice picker's "Confirm", say). Text-matching survives both frameworks.
 */
export async function confirmDialog(page, label = 'Confirm') {
  await page.locator(`.dialog button:has-text("${label}")`).first().click()
}
