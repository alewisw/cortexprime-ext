import { CortexApplicationV2 } from './CortexApplicationV2.js'
import { localizer } from '../scripts/foundryHelpers.js'
import { isAllowedAttribute, isAllowedTag, isDroppedTag } from '../scripts/promptMirrorLogic.js'

const NS = 'cortexprime-ext'

// Rebuilds a player-supplied snapshot from scratch, keeping only allowlisted tags/attributes (see
// promptMirrorLogic.js). DOMParser documents are inert: nothing in them runs while this walks it.
export const sanitizeMirrorHtml = html => {
  const doc = new DOMParser().parseFromString(`<body>${html ?? ''}</body>`, 'text/html')

  const clean = node => {
    for (const child of [...node.children]) {
      const tag = child.tagName.toLowerCase()

      if (isDroppedTag(tag)) {
        child.remove()
        continue
      }

      clean(child)

      if (!isAllowedTag(tag)) {
        child.replaceWith(...child.childNodes)
        continue
      }

      for (const { name, value } of [...child.attributes]) {
        if (!isAllowedAttribute(name, value)) child.removeAttribute(name)
      }
    }
  }

  clean(doc.body)

  return doc.body.innerHTML
}

// The GM's read-only copy of one player's open prompt, opened from the Dice Pool tray. Reads the
// player's `promptMirror.<appId>` user flag (published by promptMirror.js), re-renders as it
// changes, and closes itself once the player's prompt is gone.
export class PromptMirrorWindow extends CortexApplicationV2 {
  constructor ({ userId, appId }) {
    super({ id: `prompt-mirror-${userId}-${appId}` })

    this.userId = userId
    this.appId = appId
  }

  static DEFAULT_OPTIONS = {
    classes: ['prompt-mirror-window'],
    position: { width: 520, height: 'auto' },
    window: { resizable: true }
  }

  static PARTS = {
    content: { template: 'systems/cortexprime-ext/templates/dialog/prompt-mirror.html' }
  }

  get snapshot () {
    return game.users.get(this.userId)?.getFlag(NS, `promptMirror.${this.appId}`) ?? null
  }

  get title () {
    const user = game.users.get(this.userId)
    const playerName = user?.character?.name || user?.name || ''

    return `${playerName}: ${this.snapshot?.title ?? ''} (${localizer('ReadOnly')})`
  }

  async _prepareContext (options) {
    return {
      ...await super._prepareContext(options),
      html: sanitizeMirrorHtml(this.snapshot?.html)
    }
  }

  // Opens (or brings forward) the mirror for one prompt.
  static open (userId, appId) {
    const existing = foundry.applications.instances.get(`prompt-mirror-${userId}-${appId}`)

    if (existing) return existing.render({ force: true })

    return new PromptMirrorWindow({ userId, appId }).render({ force: true })
  }

  // Called when a player's promptMirror flag changes: re-render each open mirror of theirs, or
  // close it if that prompt has gone.
  static refreshFor (userId) {
    for (const app of foundry.applications.instances.values()) {
      if (!(app instanceof PromptMirrorWindow) || app.userId !== userId) continue

      if (!app.snapshot?.html) app.close()
      else app.render()
    }
  }
}
