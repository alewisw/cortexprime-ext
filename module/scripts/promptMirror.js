// Lets the GM watch a player's open prompts (Select Your Dice, Plot Point usage, consumable dice,
// Give In, Paradox) and every player's current dice pool, read-only, so they can coach the
// player through their choices.
//
// Player side: each mirrored prompt is snapshotted - its rendered content, with the live form
// state baked into attributes - onto the player's OWN user flag `promptMirror.<appId>`, re-sent
// (debounced) as the player clicks and as the prompt re-renders, and cleared when it closes. A
// user flag reaches every client with no extra plumbing, exactly like the `dicePool` flag the
// GM's Player Pools list reads.
//
// GM side: the Dice Pool tray lists open prompts and pools (UserDicePool#_prepareContext) and
// re-renders when either flag changes; PromptMirrorWindow shows one prompt, sanitised.
import { getMirroredPromptKind } from './promptMirrorLogic.js'
import { PromptMirrorWindow } from '../applications/PromptMirrorWindow.js'

const NS = 'cortexprime-ext'
const FLAG = 'promptMirror'
const DEBOUNCE_MS = 150

// appId -> { app, kind, timer, observer, chain }
const watched = new Map()

// The prompt's content with its current form state written into attributes, since a clone (and
// innerHTML) only carries attributes - a ticked checkbox or a chosen <option> would otherwise come
// across as whatever the template first rendered.
const serialize = element => {
  const content = element.querySelector('.window-content') ?? element
  const clone = content.cloneNode(true)
  const live = content.querySelectorAll('input, select, textarea')
  const copied = clone.querySelectorAll('input, select, textarea')

  live.forEach((field, index) => {
    const copy = copied[index]

    if (!copy) return

    if (field.type === 'checkbox' || field.type === 'radio') {
      copy.toggleAttribute('checked', field.checked)
    } else if (field.tagName === 'SELECT') {
      ;[...field.options].forEach((option, optionIndex) => copy.options[optionIndex]?.toggleAttribute('selected', option.selected))
    } else if (field.tagName === 'TEXTAREA') {
      copy.textContent = field.value
    } else {
      copy.setAttribute('value', field.value)
    }

    copy.toggleAttribute('disabled', field.disabled)
  })

  return clone.innerHTML
}

// Writes are chained per prompt so a slow publish can never land after the prompt's own clear.
const enqueue = (entry, task) => {
  entry.chain = entry.chain.then(task).catch(error => console.warn('CP | Prompt mirror: could not publish', error))

  return entry.chain
}

const publish = entry => enqueue(entry, async () => {
  if (!watched.has(entry.app.id) || !entry.app.element) return

  await game.user.setFlag(NS, `${FLAG}.${entry.app.id}`, {
    kind: entry.kind,
    title: entry.app.title,
    html: serialize(entry.app.element),
    actorId: game.user.character?.id ?? null,
    updatedAt: Date.now()
  })
})

const schedule = entry => {
  clearTimeout(entry.timer)
  entry.timer = setTimeout(() => publish(entry), DEBOUNCE_MS)
}

const onRender = app => {
  if (game.user.isGM) return

  const kind = getMirroredPromptKind(app.element?.classList ?? app.options?.classes)

  if (!kind) return

  let entry = watched.get(app.id)

  if (!entry) {
    entry = { app, kind, timer: null, observer: null, chain: Promise.resolve() }
    watched.set(app.id, entry)

    // Clicks that only toggle classes (choosing dice), content swapped in place (a reroll, a
    // test-mode die edit) and typed or ticked values all count as a change worth re-sending.
    entry.observer = new MutationObserver(() => schedule(entry))
    entry.observer.observe(app.element, { subtree: true, childList: true, attributes: true, characterData: true })
    app.element.addEventListener('input', () => schedule(entry))
    app.element.addEventListener('change', () => schedule(entry))
  }

  schedule(entry)
}

const onClose = app => {
  const entry = watched.get(app.id)

  if (!entry) return

  watched.delete(app.id)
  clearTimeout(entry.timer)
  entry.observer?.disconnect()

  enqueue(entry, () => game.user.unsetFlag(NS, `${FLAG}.${app.id}`))
}

const refreshDicePool = () => {
  const dicePool = game.cortexprime?.UserDicePool

  if (dicePool?.rendered) dicePool.render(true)
}

export const registerPromptMirror = () => {
  Hooks.on('renderApplicationV2', onRender)
  Hooks.on('closeApplicationV2', onClose)

  Hooks.once('ready', () => {
    // A prompt can't survive a page load, so anything still published is stale.
    if (!game.user.isGM && game.user.getFlag(NS, FLAG)) {
      game.user.unsetFlag(NS, FLAG).catch(error => console.warn('CP | Prompt mirror: could not clear stale prompts', error))
    }
  })

  Hooks.on('updateUser', (user, data) => {
    if (!game.user.isGM || user.isGM) return

    const promptsChanged = foundry.utils.hasProperty(data, `flags.${NS}.${FLAG}`)
    // Including a null pool: unlike a player's own tray, the GM's Player Pools list reads null as
    // "empty" (buildPoolRows), and clearing a pool leaves it null for good.
    const poolChanged = foundry.utils.hasProperty(data, `flags.${NS}.dicePool`)

    if (promptsChanged) PromptMirrorWindow.refreshFor(user.id)
    if (promptsChanged || poolChanged) refreshDicePool()
  })

  // The Player Pools list only shows connected players.
  Hooks.on('userConnected', () => {
    if (game.user.isGM) refreshDicePool()
  })
}
