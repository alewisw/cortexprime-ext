// Dialog interactions that work across BOTH dialog frameworks.
//
// V1 `Dialog` renders its buttons into `.dialog-buttons` as `<button data-button="yes">`.
// DialogV2 renders them into `footer.form-footer` as `<button data-action="yes">`. Both sit
// inside an element carrying the `dialog` class, so matching either attribute keeps a spec
// working whether the dialog it drives has been migrated yet or not.
//
// Once the migration is finished the data-button half can be dropped.
const YES = '.dialog button[data-button="yes"], .dialog button[data-action="yes"]'

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
