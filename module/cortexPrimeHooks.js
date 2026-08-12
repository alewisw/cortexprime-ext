import { FloatingPanel } from './applications/FloatingPanel.js'
import { UserDicePool } from './applications/UserDicePool.js'
import { localizer, setCssVars } from './scripts/foundryHelpers.js'
import rollDice from './scripts/rollDice.js'
import { registerCrisisPool } from './scripts/crisisPoolPanel.js'
import { registerDoomPool } from './scripts/doomPool.js'
import { registerHitches } from './scripts/hitches.js'
import { registerMageAscension } from './mage/mageAscension.js'
import { registerParadox } from './mage/paradox.js'
import { registerMigrateNotesToTabs } from './scripts/migrateNotesToTabs.js'
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
  registerMyCharacter()
  registerRollToBeat()
  registerSceneDistinctionActor()
  registerSceneJournal()
  registerSpotlight()

  Hooks.once('diceSoNiceReady', dice3d => {
    dice3d.addSystem({ id: 'cp-pp', name: 'Cortex Prime Plot Point' }, false)
    const ppLabel = 'systems/cortexprime/assets/plot-point/plot-point.png'
    dice3d.addDicePreset({
      type: 'dp',
      labels: [ppLabel, ppLabel],
      system: 'standard',
    }, 'd2')
  })

  Hooks.once('ready', async () => {
    const themes = game.settings.get('cortexprime', 'themes')
    const theme = themes.current === 'custom' ? themes.custom : themes.list[themes.current]
    setCssVars(theme)
    if (game.settings.get('cortexprime', 'WelcomeSeen') === false) {
      if (game.user.isGM) {
        const seeWelcome = await new Promise(resolve => {
          new Dialog(
            {
              title: localizer('WelcomeTitle'),
              content: `<div class="bkg-lighter-grey ba-2-primary mb-4 pa-2"><p>${localizer('SettingsMessage')}</p></div>`,
              buttons: {
                ok: {
                  label: localizer("Okay"),
                  callback: () => resolve(true)
                }
              },
              default: "ok",
              close: () => resolve(false),
            },
            {
              width: 500,
              height: 'auto',
            }
          ).render(true)
        })

        if (seeWelcome) {
          await game.settings.set('cortexprime', 'WelcomeSeen', true)
        }
      }
    }

    const $rollPrivacy = $(document.querySelector('#roll-privacy'))

    if ($rollPrivacy) {
      const $dicePoolButton = $(
        `<button class="control dice-pool-control ui-control fa-solid fa-dice icon" type="button" data-control="dice-pool" aria-label="${game.i18n.localize("DicePool")}">
          </button>`
      )

      $rollPrivacy
        .prepend($dicePoolButton)
      $rollPrivacy
        .find('.dice-pool-control')
        .on('click', async () => {
          await game.cortexprime.UserDicePool.toggle()
        })
    }
  })

  Hooks.on('ready', async () => {
    game.cortexprime.UserDicePool = new UserDicePool()
    await game.cortexprime.UserDicePool.initPool()

    game.cortexprime.FloatingPanel = new FloatingPanel()
    await game.cortexprime.FloatingPanel.render(true)
  })

  Hooks.on('renderChatMessageHTML', async (message, html, data) => {
    const $html = $(html)
    const $rollResult = $html.find('.roll-result').first()

    if ($rollResult) {
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

        const html = await foundry.applications.handlebars.renderTemplate(`systems/cortexprime/templates/partials/dice/d${dieRating}.html`, {
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
