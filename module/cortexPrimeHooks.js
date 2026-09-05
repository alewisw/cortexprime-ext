import { FloatingPanel } from './applications/FloatingPanel.js'
import { UserDicePool } from './applications/UserDicePool.js'
import { getCurrentTheme, localizer, setCssVars } from './scripts/foundryHelpers.js'
import rollDice from './scripts/rollDice.js'
import { registerCrisisPool } from './scripts/crisisPoolPanel.js'
import { registerDoomPool } from './scripts/doomPool.js'
import { registerHitches } from './scripts/hitches.js'
import { registerMageAscension } from './mage/mageAscension.js'
import { registerParadox } from './mage/paradox.js'
import { registerMigrateNotesToTabs } from './scripts/migrateNotesToTabs.js'
import { registerMigrateSectionPermissions } from './scripts/migrateSectionPermissions.js'
import { registerMyCharacter } from './scripts/myCharacter.js'
import { registerRollToBeat } from './scripts/rollToBeat.js'
import { registerRollUndo } from './scripts/rollUndo.js'
import { registerSceneDistinctionActor } from './scripts/sceneDistinctionActor.js'
import { registerSceneJournal } from './scripts/sceneJournal.js'
import { registerSpotlight } from './scripts/spotlight.js'

export default () => {
  registerCrisisPool()
  registerDoomPool()
  // Must be registered before registerRollToBeat() — both listen to updateActor for the same
  // lastRoll write, and rollToBeat's handler can clear the active challenge that this one needs
  // to read to know the roll happened during a Test/Contest/Group.
  registerHitches()
  // Same reason as registerHitches() above — it reads the active challenge and the opposition's
  // recorded effect dice on the updateActor hook, both of which rollToBeat's handler advances.
  registerParadox()
  // Same reason again — it snapshots the active challenge as each roll lands, which is only the
  // pre-roll state if it runs before rollToBeat's handler advances it.
  registerRollUndo()
  registerMageAscension()
  registerMigrateNotesToTabs()
  // After registerMigrateNotesToTabs() — it reads additionalTabs, which on a world still on the
  // old top-level-notes layout won't exist yet on this same ready. Harmless either order (both are
  // idempotent and self-heal on the next reload), but this ordering lets a single reload catch both.
  registerMigrateSectionPermissions()
  registerMyCharacter()
  registerRollToBeat()
  registerSceneDistinctionActor()
  registerSceneJournal()
  registerSpotlight()

  Hooks.once('diceSoNiceReady', dice3d => {
    dice3d.addSystem({ id: 'cp-pp', name: 'Cortex Prime Plot Point' }, false)
    const ppLabel = 'systems/cortexprime-ext/assets/plot-point/plot-point.png'
    dice3d.addDicePreset({
      type: 'dp',
      labels: [ppLabel, ppLabel],
      system: 'standard',
    }, 'd2')
  })

  // Injects the Dice Pool toggle button into the chat log's roll-privacy control row (the same
  // row Foundry's own d20-icon privacy dropdown lives in). Registered below on BOTH 'ready' (the
  // first paint) and 'renderChatLog' (every one after) — ui.chat.render() rebuilds that row's DOM
  // from scratch, and both Foundry's own periodic sidebar refreshes and rollUndo.js's fallback
  // "can't find this roll's own card, so refresh the whole log" path call it, either of which
  // would otherwise silently drop this button after the very first render.
  //
  // Idempotent: bails out if the button is already there, so a render that didn't actually
  // replace #roll-privacy's DOM (or a 'ready'/'renderChatLog' double-fire) never ends up with two.
  const injectDicePoolButton = () => {
    const $rollPrivacy = $(document.querySelector('#roll-privacy'))

    if (!$rollPrivacy.length || $rollPrivacy.find('.dice-pool-control').length) return

    const $dicePoolButton = $(
      `<button class="control dice-pool-control ui-control fa-solid fa-dice icon" type="button" data-control="dice-pool" aria-label="${game.i18n.localize("DicePool")}">
        </button>`
    )

    $rollPrivacy.prepend($dicePoolButton)
    $rollPrivacy
      .find('.dice-pool-control')
      .on('click', async () => {
        await game.cortexprime.UserDicePool.toggle()
      })
  }

  Hooks.once('ready', async () => {
    const theme = getCurrentTheme()
    setCssVars(theme)
    if (game.settings.get('cortexprime-ext', 'WelcomeSeen') === false) {
      if (game.user.isGM) {
        // Dismissing the dialog rather than acknowledging it means "not seen", same as before.
        const seeWelcome = await foundry.applications.api.DialogV2.wait({
          window: { title: localizer('WelcomeTitle') },
          position: { width: 500 },
          content: `<div class="bkg-lighter-grey ba-2-primary mb-4 pa-2"><p>${localizer('SettingsMessage')}</p></div>`,
          buttons: [
            { action: 'ok', label: 'Okay', default: true, callback: () => true }
          ],
          close: () => false
        }) === true

        if (seeWelcome) {
          await game.settings.set('cortexprime-ext', 'WelcomeSeen', true)
        }
      }
    }

    injectDicePoolButton()
  })

  Hooks.on('renderChatLog', injectDicePoolButton)

  Hooks.on('ready', async () => {
    game.cortexprime.UserDicePool = new UserDicePool()
    await game.cortexprime.UserDicePool.initPool()

    game.cortexprime.FloatingPanel = new FloatingPanel()
    await game.cortexprime.FloatingPanel.render(true)
  })

  Hooks.on('renderChatMessageHTML', async (message, html, data) => {
    const $html = $(html)
    const $rollResult = $html.find('.roll-result').first()

    if ($rollResult.length) {
      const $chatMessage = $rollResult.closest('.chat-message')
      
      $chatMessage
        .addClass('roll-message')
        .prepend('<div class="message-background"></div><div class="message-image"></div>')

      const $messageHeader = $chatMessage.find('.message-header').first()

      $messageHeader.children().wrapAll('<div class="message-header-content"></div>')
      $messageHeader.prepend('<div class="message-header-image"></div><div class="message-header-background"></div>')

      const $dice = $rollResult.find('.die')

      for await (const die of $dice) {
        const $die = $(die)
        const data = $die.data()

        const { dieRating, type, value: number } = data

        const html = await foundry.applications.handlebars.renderTemplate(`systems/cortexprime-ext/templates/partials/dice/d${dieRating}.html`, {
          type,
          number
        })
        $die.html(html)
      }

      $html
        .find('.source-header')
        .click(function () {
          const $source = $(this)
          $source
            .find('.fa')
            .toggleClass('fa-chevron-down fa-chevron-up')
          $source
            .siblings('.source-content')
            .toggleClass('hide')
        })

      const getPool = $html => {
        return $html.find('.source').get().reduce((sources, source) => {
          const $source = $(source)
          return {
            ...sources,
            [$source.data('source')]: $source
              .find('.dice-tag')
              .get()
              .reduce((dice, die, dieIndex) => {
                const $die = $(die)
                return {
                  ...dice,
                  [dieIndex]: {
                    label: $die.data('label'),
                    value: $die.find('.die').get()
                      .reduce((diceValues, dieValue, dieValueIndex) => {
                        return {
                          ...diceValues,
                          [dieValueIndex]: $(dieValue).data('die-rating')
                        }
                      }, {})
                  }
                }
              }, {})
          }
        }, {})
      }
      $rollResult.find('.re-roll').click(async (event) => {
        event.preventDefault()
        const pool = getPool($rollResult)
        await rollDice(pool)
      })
      $rollResult.find('.send-to-pool').click(async (event) => {
        event.preventDefault()
        const pool = getPool($rollResult)
        await game.cortexprime.UserDicePool._setPool(pool)
      })

      // Foundry's chat log scrolls to the bottom based on this message's height at insertion
      // time — before the dice-hydration above has finished growing empty die placeholders into
      // real artwork — so a message that ends up taller than its placeholder is left with its
      // bottom below the fold. Re-sync the scroll once hydration settles, but only for a message
      // that's genuinely new; this hook also re-fires for older messages scrolling into view
      // while paging through history, and we don't want to yank the view to the bottom while
      // someone's reading back.
      //
      // Walking up to the nearest actually-overflowing ancestor (rather than assuming a fixed
      // #chat-log id/depth) keeps this working regardless of how Foundry's own chat log markup
      // is structured — that structure changed significantly with the ApplicationV2 sidebar
      // rewrite, and ui.chat.scrollBottom() alone was not enough to fix this.
      if (game.messages.contents.at(-1)?.id === message.id) {
        let scrollParent = $chatMessage[0]?.parentElement

        while (scrollParent && scrollParent.scrollHeight <= scrollParent.clientHeight) {
          scrollParent = scrollParent.parentElement
        }

        if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight
      }
    }
  })
}
