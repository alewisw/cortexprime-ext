import { getCurrentTheme } from '../scripts/foundryHelpers.js'

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

// Base for every window in the system that isn't a Document sheet.
//
// Two things every one of them wants, so neither has to be repeated per app:
//
//  - the 'cortexprime' class on the root element, which is what scss/cortexprime.scss scopes
//    almost everything to. Subclasses add their own class alongside it; ApplicationV2 merges
//    `classes` down the inheritance chain rather than replacing it.
//  - `theme` in the render context. Nearly every template reads theme.* for its component
//    styling, and every app used to compute it identically in getData(). Subclasses that
//    override _prepareContext MUST spread super's result rather than returning a bare object,
//    or their template loses the theme and silently renders unstyled.
export class CortexApplicationV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ['cortexprime']
  }

  async _prepareContext (options) {
    return {
      ...await super._prepareContext(options),
      theme: getCurrentTheme()
    }
  }
}
