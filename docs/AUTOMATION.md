# Automation Guide

This guide explains the automated tools Cortex Prime adds on top of Foundry: the **Dice Pool**
tray, running a **Test** or **Contest**, and managing a **Crisis Pool** — plus the other buttons
on the floating panel at the top of the screen. It describes these features from the perspective
of a GM or player running a game, not from a developer's perspective.

## The floating panel

A row of icons sits at the top-center of the screen — this is the floating panel. Which icons
appear depends on the viewer's role and what the GM has set up:

- **Dice Pool** — opens the viewer's personal dice pool tray (also available from the dice icon
  near the chat controls).
- **Crisis Pool** — appears once a GM has started one; shows the crisis's name and its remaining
  dice to everyone.
- **Spotlight** — appears once the GM enables it; shows whose character currently has the
  narrative spotlight.
- **Scene Distinction / Doom Pool / Scene Journal** — GM-configured buttons that open the actor
  or journal page tied to the current scene, when set up.
- **My Character** — visible only to players; opens the player's own character sheet.

## The Dice Pool tray

This is where a pool of dice is built and rolled. Traits are added to the pool from a character
sheet — adding a trait requires at least **Observer** access to that sheet; **Limited** access
allows viewing but not adding.

**GM Only**: Under the Label field, the GM has five quick **difficulty buttons** — Very Easy,
Easy, Challenging, Hard, Very Hard — each one drops a ready-made Difficulty pool (2d4 through
2d12) into the tray, replacing whatever difficulty was there before.

Once a pool has dice in it, four buttons roll it:

- **Roll & Select** — rolls, then (if three or more non-1 dice come up) lets the roller click
  which die becomes the Effect die; the other two highest dice become the Total.
- **Roll for Effect** — rolls and automatically picks the largest die as the Effect die, making
  the highest Total from the remaining dice.
- **Roll for Total** — rolls and automatically uses the two highest dice as the Total, picking
  the largest remaining die for the Effect.
- **Roll to Beat** — only appears when the GM has lined someone up to respond to someone else's
  roll (see Tests and Contests below); automatically builds the biggest Effect die while trying
  to beat the designated Total.

Whichever button is used, the result posts to chat as a card showing the rolled dice, Total, and
Effect die.

## Running a Test

A Test is a single roll where the GM (or optionally a player) rolls first, and one or more other
players try to beat the rolled Total.

1. The GM opens their Dice Pool tray and picks **Test** from the Challenge section.
2. The GM picks who rolls first — **Roll Now** — defaulting to the GM, but it can be any
   connected player.
3. The GM checks off everyone who needs to try to beat that roll — **Roll Next**. More than one
   responder can be picked.
4. The **Roll Now** person rolls. They cannot use "Roll to Beat" as they are setting the target,
   but all other roll options are available. Their Total becomes the target.
5. Everyone checked off as **Roll Next** then has their roll buttons enabled — until that point,
   all four stay disabled. Each responder rolls once, trying to beat that target; a "Target" and
   "Won/Lost" box appears on their result message indicating the outcome.
6. Once everyone who was supposed to respond has rolled, the Test completes automatically.

Anyone who isn't the roller or one of the responders has their roll buttons disabled while the
Test is active — a Test only lets its actual participants roll while it's running.

## Running a Contest

A Contest is a single head-to-head roll-off between two people.

1. The GM picks **Contest** and sets a **Roll Now** person and one **Roll Next** person.
2. **Roll Now** rolls first.
3. **Roll Next**'s roll buttons enable once that happens, and they roll, trying to beat it.
4. If they win (beating the previous total), the Contest ends there.
5. If they lose, the two sides automatically swap — the loser becomes **Roll Next**, trying to
   beat the total the other person just set — and this repeats, fully automatically, until
   someone finally wins.

As with a Test, only the two people actually in the Contest can roll while it's active.

## Reading a roll result

Every roll posts a chat card. Beyond the dice/Total/Effect die, if a roll was checked against
someone else's (a Test/Contest response), the card also shows:

- **Target** — the total that needed to be beaten.
- **Result** — "Won", or "Lost" along with the Effect die of the roll that wasn't beaten, so it's
  clear at a glance what the responder was up against.
- If the roll won while a Crisis Pool was active, this box instead shows what happened to the
  crisis — see below.

## Crisis Pool

A Crisis Pool represents an escalating danger the GM tracks as a shared pool of dice — separate
from any individual Test or Contest.

**Starting one:** the GM clicks the Crisis Pool button on the floating panel, gives it a name,
and picks its starting dice. A red-bordered card showing the crisis's name and dice immediately
appears on everyone's floating panel.

**While it's active:**

- The GM's own Dice Pool tray automatically includes the crisis's dice as a pool source, so the
  GM can roll with (or against) them like anything else. If the GM removes one of those dice from
  the pool before rolling, it stays removed until the tray is closed and reopened.
- Whenever a **player** (not the GM) wins a roll in a Test or Contest, the crisis pool shrinks
  automatically:
  - If the winning Effect die is larger than any crisis pool dice other than a D4, then the
    largest die it beats is removed from the pool.
  - Otherwise, the crisis's biggest remaining die steps down one size (a d12 becomes a d10, a
    d10 becomes a d8, and so on down to d4, at which point it's removed entirely).
  - The winning player's chat card shows exactly what happened — "Removed" or "Step Down" with
    the die icons involved.
- If that was the last die in the pool, the crisis resolves itself automatically: the card
  disappears from everyone's floating panel, the winning chat card says "Crisis Resolved," and
  the crisis's dice disappear from the GM's tray.
- A GM winning a roll never reduces the crisis pool — only player wins do.

**Editing or ending a crisis:** once a crisis is running, the floating panel button becomes
**Edit Crisis**. Clicking it reopens the same dialog, pre-filled with the crisis's current name
and dice, so the GM can add dice (escalating it), remove some, or rename it. From there:

- **Update Crisis** applies whatever changes were made.
- **End Crisis** ends it immediately — the card disappears everywhere and the crisis's dice are
  cleared out of the GM's tray.

## Other floating panel features

- **Scene Distinction Actor** — the GM links a Scene to an Actor representing that scene's
  distinctions. The button opens/closes that actor's sheet, and players automatically get
  viewing access to it only while that scene is the active one.
- **Spotlight** — the GM highlights which connected player's character currently has the
  narrative spotlight; everyone sees a card with that character's portrait and name.
- **Doom Pool** — the GM designates an actor as the shared Doom Pool; the button (visible to
  everyone) opens and closes its sheet.
- **Scene Journal** — visible only to the GM; opens the journal page linked to the active scene.
- **My Character** — visible only to players; opens the player's own assigned character sheet.
