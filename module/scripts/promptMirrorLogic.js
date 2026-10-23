// Pure logic behind the GM's read-only view of a player's open prompts and current dice pool
// (promptMirror.js is the Foundry side). Kept free of Foundry globals so it's unit-testable.
//
// A player's open prompt is published as a snapshot on that player's own user flag
// `promptMirror.<appId>`; their dice pool already lives on their user flag `dicePool`. Both reach
// the GM's client with no extra syncing, so everything here just shapes that data for display.
import { flattenPoolEntries } from './dicePoolValidation.js'

// The player-facing prompts the GM can mirror, keyed by the class each window carries.
export const MIRRORED_PROMPT_CLASSES = ['dice-picker', 'consumable-dice', 'plot-point-use-dialog', 'paradox-dialog', 'give-in-confirm']

// The mirrored kind for a window, from its class list, or null if it isn't one we mirror.
export const getMirroredPromptKind = classes => {
  const list = [...(classes ?? [])]

  return MIRRORED_PROMPT_CLASSES.find(kind => list.includes(kind)) ?? null
}

// `users`: plain { id, name, isGM, active, characterName, promptMirror, dicePool } objects.

// One row per open prompt across every player, oldest first so rows don't jump about.
export const buildPromptRows = users => (users ?? [])
  .filter(user => !user.isGM)
  .flatMap(user => Object.entries(user.promptMirror ?? {})
    .filter(([, snapshot]) => snapshot?.html)
    .map(([appId, snapshot]) => ({
      userId: user.id,
      appId,
      playerName: user.characterName || user.name,
      title: snapshot.title ?? '',
      kind: snapshot.kind ?? null,
      updatedAt: snapshot.updatedAt ?? 0
    })))
  .sort((a, b) => a.updatedAt - b.updatedAt)

// Each connected player's current pool, flattened to { label, dice: [faces] } - shown to the GM at
// any stage, including before anyone (the GM included) has rolled. Players with nothing in their
// pool are left out.
export const buildPoolRows = users => (users ?? [])
  .filter(user => !user.isGM && user.active)
  .map(user => ({
    userId: user.id,
    playerName: user.characterName || user.name,
    entries: flattenPoolEntries(user.dicePool?.pool)
      .map(entry => ({
        label: entry?.label ?? '',
        dice: Object.values(entry?.value ?? {}).map(face => parseInt(face, 10)).filter(face => face > 0)
      }))
      .filter(entry => entry.dice.length)
  }))
  .filter(row => row.entries.length)

// ---- Sanitising a mirrored snapshot (applied on the GM's client) ----
//
// The snapshot's HTML is written by the PLAYER's client, so the GM must never trust it: rendered
// raw, a player could run code in the GM's session. The window parses it inertly and keeps only
// what these allow. Foundry's own cleanHTML can't be used - it strips the dice SVGs.

// Removed together with everything inside them.
// (`form` is deliberately NOT here: DialogV2 wraps its whole content in one, so it is unwrapped
// like any other unlisted tag - the prompt's contents stay, the form element itself goes.)
export const DROPPED_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'template', 'noscript', 'math', 'foreignobject', 'frame', 'frameset', 'audio', 'video', 'source', 'track', 'canvas']

// Kept. Anything else not dropped above is unwrapped: its children stay, the element itself goes.
export const ALLOWED_TAGS = [
  'div', 'span', 'p', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'strong', 'em', 'b', 'i', 'u', 'small', 'br', 'hr', 'section', 'article', 'header', 'footer',
  'fieldset', 'legend', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'input', 'select', 'option', 'optgroup', 'textarea', 'button', 'img',
  'svg', 'path', 'g', 'circle', 'rect', 'polygon', 'line'
]

const ALLOWED_ATTRIBUTES = ['class', 'type', 'checked', 'selected', 'disabled', 'value', 'title', 'alt', 'src', 'viewbox', 'd', 'points', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'style']

const UNSAFE_URL = /^\s*(javascript|vbscript|data):/i

export const isAllowedTag = tag => ALLOWED_TAGS.includes(String(tag).toLowerCase())

export const isDroppedTag = tag => DROPPED_TAGS.includes(String(tag).toLowerCase())

export const isAllowedAttribute = (name, value = '') => {
  const attribute = String(name).toLowerCase()

  if (attribute.startsWith('on')) return false
  if (attribute === 'src') return !UNSAFE_URL.test(value)
  if (attribute === 'style') return !/url\s*\(|expression\s*\(|@import/i.test(value)
  if (attribute.startsWith('data-') || attribute.startsWith('aria-')) return true

  return ALLOWED_ATTRIBUTES.includes(attribute)
}
