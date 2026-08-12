# Automation

This document describes reactive, hook-driven behavior in the Cortex Prime system — things that
happen automatically in response to game state changing, as opposed to a GM or player explicitly
clicking a button for that specific effect. It's organized by feature area, starting with
rule-set-specific automation.

## Roll undo snapshots

Every roll made during a Test, Contest or Group Challenge causes the challenge to advance
immediately and destructively — a Test drops the responder, a Contest swaps roles or ends, a Group
duel rotates the queue, and a completed initiative phase builds a randomly-ordered queue that can
never be recomputed. To make the GM's **Undo Roll** control possible, `module/scripts/rollUndo.js`
reacts to the same `flags.cortexprime.lastRoll` write every other reactor watches and stores the
active challenge *as it stood immediately before that roll* in the `rollUndoSnapshots` world
setting, keyed by actor. Like `registerHitches()` and `registerParadox()`, it is registered before
`registerRollToBeat()` and reads `getActiveChallenge()` synchronously, because rollToBeat's own
handler for that hook is what advances the thing being snapshotted.

Each roll also stamps its chat card with `flags.cortexprime.roll = { actorId, rolledAt }`. Chat
messages otherwise carry no handle back to a roll at all, and the card is deliberately created
*before* the roll record exists, so `rollDice.js` generates the `rolledAt` up front and passes it to
both.

Snapshots are overwritten per roll and deleted once used — no history is kept. Everything the undo
actually does is button-driven; see `docs/AUTOMATION.md`.

## Hitches

Whenever a player's roll is recorded (`recordRollResult` in `module/scripts/rollToBeat.js` writes
`flags.cortexprime.lastRoll` on their character) during an active Test, Contest or Group Challenge,
and any die in that roll came up 1, the **Hitches** dialog opens on the active GM's client.

The individual die faces travel on the roll record itself — `rollDice.js` already separates natural
1s from the rest when it builds the chat card, so it now passes every rolled die along as
`{ faces, result }` entries. The GM's client picks this up through the same `updateActor` hook
`rollToBeat.js` uses to advance challenges, gated on `game.users.activeGM` and de-duplicated on
`rolledAt` so the dialog opens exactly once per roll. `registerHitches()` is deliberately
registered *before* `registerRollToBeat()` in `module/cortexPrimeHooks.js`, because that handler
can clear the active challenge that this one needs to read.

Opening the dialog is the whole of the automation — it proposes nothing and changes nothing on its
own. Every consequence (new/stepped-up complications, Doom Pool dice, Plot Points, the chat
summary) is applied only when the GM clicks Confirm. See `docs/AUTOMATION.md` for the GM-facing
description of the options and the Plot Point rules.

The decision logic is pure and unit-tested in `module/scripts/hitchesLogic.js`;
`module/scripts/hitches.js` holds the hook and the actor writes, and
`module/applications/HitchesDialog.js` the dialog itself.

## Mage: The Ascension Engine

Enabled via the **Custom Rule Set** dropdown in Foundry's System Configuration (Settings →
Configure Settings), set to "Mage: The Ascension Engine". Configured via the **Mage Settings**
dialog (also in System Configuration), which maps:

- The Actor Type used for a **Location**, and which Simple Trait on it represents **Reality
  Reinforcement** and **Shielding**.
- The Actor Type used for a **Player Character**, and which Simple Trait on it represents
  **Paradox** and **Trauma**, plus which Trait Set defines **Powers**.

All of this feature's logic is isolated in `module/mage/` — `mageAscensionLogic.js` and
`paradoxLogic.js` for the pure decisions, `mageAscension.js` and `paradox.js` for the Foundry/hook
integration — and reads the core Dice Pool, Challenge, and Actor Sheet code rather than modifying
it, reacting by injecting into the already-rendered Dice Pool tray.

### The Magick / Reality Reinforcement box

Whenever the GM's Dice Pool tray has an active Challenge selected (Test, Contest, or Group) while
Mage is the active Custom Rule Set, a box appears immediately under the
Test/Contest/Group/Clear Challenge buttons with two choices:

- **Magick**: None (default), Coincidental, Coincidental Witnessed, Vulgar, Vulgar Witnessed.
- **Reality Reinforcement**: Opposes (default), Indifferent, Reinforces.

These reset to their defaults with each new world (they're not tied to a specific Challenge, so
switching Challenge type doesn't clear a choice already made for the current scene).

Whenever Magick is anything other than None, every client's Dice Pool tray (GM and Players alike)
gets an extra line under its Test/Contest/Group status line naming the current Magick, e.g.

> Test — Roll Now: ...
> Vulgar Witnessed Magick

so it's obvious to everyone at the table that a roll is being made under the effects of magick, and
which kind.

### Powers traits and Magick must agree

Whichever Player currently has a usable "Roll to Beat" (the current Test/Contest responder(s) once
the initiator has rolled, or the current Group Initiative/duel participant — never every connected
player) has their Dice Pool validated against the current Magick choice:

- Magick **None** — the pool is invalid if it contains any Trait from the Player Character's
  configured Powers Trait Set:

  > Non-Magical rolls cannot include a Power trait; the GM must mark this as a magical roll.

- Magick **anything else** — the pool is invalid unless it contains a Trait from the configured
  Powers Trait Set:

  > Magical rolls must include a Power trait; the GM marked this as a magical roll.

Either way, their roll buttons are disabled and the message is shown until the pool is corrected.

### Reality Reinforcement automatically moves between pools

Whenever Magick is anything **other than None**, and the Scene currently linked to an Actor (the
same Scene → Actor link used by the Distinction Actor floating-panel button — see Scene
Configuration) is of the configured Location Actor Type and has a value on its configured Reality
Reinforcement Simple Trait, that trait's die is automatically kept in sync between the GM's Dice
Pool and the current roller's Dice Pool (the same "current roller" as above) based on the Reality
Reinforcement choice:

| Reality Reinforcement | GM's Pool | Roller's Pool |
|---|---|---|
| Opposes | die added | die removed |
| Reinforces | die removed | die added |
| Indifferent | die removed | die removed |

The die is tracked under a fixed `Reality Reinforcement` pool source, kept up to date whenever the
Challenge, the Magick/Reality Reinforcement choice, the linked Location Actor, or its Reality
Reinforcement trait's value changes — including honoring a temporarily stepped-up/down value if
one is active. If the Location conditions above stop being met (no linked actor, wrong Actor Type,
no trait value), the die is removed from both pools.

**Vulgar Witnessed drawing extra attention:** whenever Magick is **Vulgar Witnessed** and Reality
Reinforcement is **Opposes**, every die added to the GM's pool by the rule above steps up one rung
(capped at D12, never wrapping). This only affects the die going into the GM's pool — the roller's
side is unaffected (moot for Opposes anyway, since the roller's side is always 'remove').

### Paradox and Trauma

Every roll a **Player** makes during a Test, Contest or Group Challenge while Magick is set to
anything **other than None** can earn them a Paradox die — on each roll, not just the one that
decides the challenge. A roll that wasn't scored against anyone (a Group Challenge's
initiative-phase rolls, or a Player acting as the challenge initiator) has no opposition, and earns
no Paradox at all. GM rolls never earn Paradox.

Every die size below is capped at **D12** — nothing ever steps past it.

#### 1. Base Paradox

"Steps" below means hitches the GM resolved with **Step up Paradox** in the Hitches dialog. The
Opposition's Effect Die is the largest effect die recorded by whoever the Player was rolling
against, defaulting to **D4** if they have none recorded.

| Magick | WON | LOST (not a BOTCH) | BOTCH |
|---|---|---|---|
| Coincidental / Coincidental Witnessed | none | none | **D6**, +1 step per hitch *beyond the first* |
| Vulgar | none with no steps, else a **D4** stepped up once per hitch (1→D6, 2→D8, 3→D10, 4→D12) | Opposition's Effect Die, +1 step per hitch | as LOST |
| Vulgar Witnessed | **D6**, +1 step per hitch | Opposition's Effect Die, +1 step per hitch | as LOST |

Because Coincidental magick can only earn Paradox on a BOTCH, the **Step up Paradox** option is
hidden from the Hitches dialog entirely for Coincidental rolls that aren't a BOTCH — the GM can't
spend a Plot Point on a choice that would do nothing.

Recorded in the log as `Base Paradox: <die>`. If there is no Base Paradox die, nothing further
happens — no log, no dialog.

#### 2. Shielding

If the Scene's linked Location actor has a die on its configured **Shielding** trait, it can absorb
or shrink the Paradox. Shielding applies only when there **is** a Paradox die and the Magick is
**not** Coincidental Witnessed or Vulgar Witnessed — a witnessed act is too blatant to muffle.

- Paradox **at or below** the Shielding die → the Paradox die is removed entirely.
- Paradox **one rung** above Shielding → becomes **D6**.
- Paradox **two rungs** above → becomes **D8**.
- **Three or more rungs** above → becomes **D10**.

Recorded as `Shielded Paradox: <die>`, or `Shielded Paradox: absorbed by Shielding`. If Shielding
absorbed the Paradox completely there's no dialog, but the log is still posted to chat so the table
can see the Shielding did its job.

#### 3. Final Paradox

The Paradox die is then measured against the Player's own **Paradox** Simple Trait:

- No die on the trait → Final Paradox is the Paradox die.
- Paradox die **larger** than the trait → Final Paradox is the Paradox die.
- Paradox die **equal or smaller** → the trait itself steps up one rung (D4→D6, D6→D8, D8→D10,
  D10→D12). A trait already at **D12** stays at D12 and triggers Trauma.

#### 4. Final Trauma and QUIET

Only calculated when the step above hit a D12 Paradox trait. Read the Player's **Trauma** Simple
Trait:

| Current Trauma | Final Trauma |
|---|---|
| none or D4 | D6 |
| D6 | D8 |
| D8 | D10 |
| D10 | D12 |
| D12 | D12, and **Descend into QUIET** |

Recorded as `Final Paradox: <die>`, then `Final Trauma: <die>` and `Descend into QUIET` when they
apply. Where the Player already carries a rating on the trait, the line reads as a transition
instead — `Final Paradox: D6 → D8`, `Final Trauma: D8 → D10` — so it's clear what the trait is
moving from as well as to.

#### 5. The Player's dialog

If there is a Final Paradox die, a dialog opens **on the Player's own client** (not the GM's)
showing the whole log, plus exactly one of:

- **Cannot Limit a Vulgar BOTCH** — when the Magick was Vulgar or Vulgar Witnessed and the roll was
  a BOTCH.
- **Paradox too large to Limit** — when the Final Paradox die is larger than every Powers Trait Set
  die that was in the roll. A roll containing no Powers dice at all counts as too large, since
  there's nothing to limit with.
- otherwise a checkbox, **Apply Limit to avoid paradox**.

A single **Confirm** button resolves it:

- With the Limit checked, nothing is written to the sheet and chat just reads *"Limit applied to
  avoid paradox"*.
- Otherwise the Player's Paradox trait is set to the Final Paradox die, the Trauma trait is set to
  the Final Trauma die if one was calculated, and the full log is posted to chat.

This dialog is the only place Paradox and Trauma are ever written — nothing is applied until the
Player confirms.

#### How the two clients cooperate

The GM's client is the only one that knows how many hitches were spent on Step up Paradox, and the
only one that can safely snapshot the opposition's effect dice before the challenge advances, so it
does all the calculation. It then hands the finished result to the Player on a
`flags.cortexprime.pendingParadox` flag; the Player's client renders the dialog and applies the
outcome to its own actor. The Hitches dialog announces its Paradox step count via a
`cortexprimeHitchesResolved` hook when it's confirmed — and also when it's closed without
confirming, with zero steps, so that dismissing it can't silently suppress a Paradox that the rules
say happens regardless of hitches.
