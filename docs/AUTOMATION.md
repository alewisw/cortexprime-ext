# Automation Guide

This guide explains the automated tools Cortex Prime adds on top of Foundry: the **Dice Pool**
tray, running a **Test**, **Contest**, or **Group Challenge**, and managing a **Crisis Pool** —
plus the other buttons on the floating panel at the top of the screen. It describes these
features from the perspective of a GM or player running a game, not from a developer's
perspective.

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
  roll (a Test or Contest responder, a Contest interferer, or a Group Challenge's current duelist
  — see below); automatically builds the biggest Effect die while trying to beat the designated
  Total. It always maximizes the Effect die, even when there's no way to beat the Total — in a
  Contest, a losing Effect die can still blunt the eventual winner's (see below), so it's never a
  wasted effort.

Whichever button is used, the result posts to chat as a card showing the rolled dice, Total, and
Effect die.

**Testing:** the **Select Dice Values (test mode only)** checkbox in System Configuration, off by
default, lets whoever is rolling right-click any die shown in the Roll & Select dialog and pick its
value directly from a small popup, instead of leaving it to chance. The Total, Effect Dice, chosen
selection, and even whether the roll counts as a Hitch/Botch all update to match — editing a die
across the 1/2+ boundary can turn a Botch into a normal roll or vice versa. The overridden value is
what gets posted to chat and recorded, exactly as if it had really been rolled. Meant for testing
specific scenarios (a Hitch, a Botch, an exact Total), not for regular play.

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

**Blunting the winner's Effect die:** the moment a Contest actually ends (someone finally fails
to beat the total), that losing roll's Effect die is compared against the eventual winner's
already-rolled Effect die. If the winner's Effect die is equal to or higher, it stands as
rolled. If it's lower, it steps down one size (d12 becomes d10, d10 becomes d8, and so on down
to d4, which never steps down any further). This only happens once, at the very end of the
Contest — the back-and-forth swapping along the way doesn't trigger it. It's why even a roll
that's certain to lose still maximizes its Effect die: it's the one thing that can still matter
in defeat.

**Once a Contest has started** — the first roll has happened — the GM can no longer change who's
**Roll Now** or **Roll Next** by clicking those radios. They lock for the rest of the Contest,
still updating automatically to show the correct side as the back-and-forth swaps, but no longer
clickable. This is what makes Interference (below) the intended way to shake up an already-running
Contest, rather than the GM just re-picking who's involved.

**Interference:** at any point once a Contest has started, the GM can pause it and let a third
party jump in for one roll. Below the (now-locked) Roll Now/Roll Next radios, a **Select
Interfering Character** list appears, offering anyone connected who isn't currently one of the
two people in the Contest — including the GM's own side, if the GM isn't part of this particular
Contest. Picking someone and clicking **Start Interference**:

- Pauses the Contest — both regular participants' roll buttons freeze.
- Enables the chosen interferer's roll buttons for one roll, showing them the same Target
  Total/Effect Dice preview a normal responder would see.
- Once they roll, their buttons disable again, whether they won or lost.

The GM then clicks **Resume Contest** whenever they're ready to continue, and the same button
covers both outcomes:

- If the interferer failed to beat the Target, resuming simply hands control back to the normal
  Roll Now/Roll Next pair, against the exact same Target as before — nothing else changes.
- If the interferer succeeded, resuming does the same thing, but the GM would typically use
  **Clear Challenge** instead at this point to end the Contest outright and narrate the outcome
  — beating the Target during Interference isn't itself tracked as winning the ongoing Contest.

An interference roll can still trigger Heroic Success, but it never blunts the Contest's Effect
die and never reduces an active Crisis Pool — those only ever happen through the Contest's own
back-and-forth.

## Running a Group Challenge

A Group Challenge pits three or more people against each other at once: everyone rolls once to
establish an order, then takes turns trying to knock the current leader off the top. Players are
only ever eliminated by losing a duel — winning never removes anyone from play, it just hands the
Target to whoever won and sends the previous leader back into the rotation for another turn. This
continues until only one person hasn't lost a duel.

1. The GM opens their Dice Pool tray and picks **Group**.
2. The GM checks off everyone taking part — at least three participants are required (the GM
   themselves is an eligible pick too). **Start Initiative** stays disabled, with a hint
   explaining why, until there are enough.
3. Clicking **Start Initiative** opens the Initiative phase: every checked participant's roll
   buttons enable — Roll to Beat isn't offered yet, since there's nothing to beat — and each
   rolls exactly once, in any order, whenever they're ready. The GM's status line names who's
   still pending.
4. Once everyone has rolled, the group is automatically ordered from lowest Total to highest,
   ties broken by the smaller Effect die, and any remaining tie broken at random. A chat card
   announces the order and shows the strongest roller's Total/Effect Dice as the Target — that
   person becomes the standing **champion**.
5. Dueling begins: the next participant in line rolls once, trying to beat the champion's Target,
   with the same Target Total/Effect Dice preview a Contest responder would see:
   - If they fail, they're eliminated outright, and the next person in line is up against the
     same Target.
   - If they succeed, their roll becomes the new Target and they become the champion — but the
     player they just displaced isn't eliminated. That player rejoins the back of the line to
     get another turn once it comes back around, and the next person already in line rolls
     against the new champion.
6. This keeps cycling — the champion's seat can change hands repeatedly — until enough duels have
   been lost that only one person is left in the running. A chat card announces that winner, and
   the Group Challenge clears itself automatically — no manual step needed.

At any point once dueling has started, the GM can remove any participant from the **Order** list
with the X button next to their name — including the reigning champion. Removing the champion
doesn't promote anyone in their place; the group is simply left with no Target until the GM does
something about it, typically **Clear Challenge**. Removing anyone else just skips them — the
challenge continues normally with whoever's left.

As with a Test or Contest, only whoever's turn it currently is can roll while a Group Challenge is
active — everyone else, including the champion, is locked out until it's resolved.

## Reading a roll result

Every roll posts a chat card. Beyond the dice/Total/Effect die, if a roll was checked against
someone else's (a Test/Contest response, a Contest interference, or a Group Challenge duel), the
card also shows:

- **Heroic Success** — beating the target by 5 or more, in a Test, Contest, Interference roll, or
  Group Challenge duel, steps the Effect die up one size for every full 5 points of margin
  (d4→d6→d8→d10→d12). The Effect Dice box shows the before/after step (e.g. "d6→d8"); stepping
  past d12 shows "d12→SPECIAL" instead, though the die actually recorded stays at d12 since
  there's nothing bigger to roll with. This is calculated right when the roll happens — before
  the Contest Effect-die-blunting rule below, so a Heroic Success's boosted die is what a later
  loss would have to blunt, and it's also what counts against an active Crisis Pool.
- **Target** — the total that needed to be beaten.
- **Result** — "Won", or "Lost" along with the Effect die of the roll that wasn't beaten, so it's
  clear at a glance what the responder was up against. In a Contest, if that loss was the one
  that ended it and it was big enough to blunt the winner's Effect die, this shows the Effect
  die stepping down (before and after) instead of just the one value.
- If the roll won while a Crisis Pool was active, this box instead shows what happened to the
  crisis — see below. Only a genuine Test or Contest win does this; an Interference roll or a
  Group Challenge duel never touches the Crisis Pool or blunts anyone's Effect die, even on a
  win or loss that would otherwise qualify.

## Hitches

Whenever a player rolls during a Test, Contest or Group Challenge and any die comes up **1**, a
**Hitches** dialog opens on the GM's screen — on every roll, not just the one that decides the
challenge. Nothing happens automatically: the dialog is a proposal the GM shapes and confirms.

The header reads **HITCH**, or **BOTCH** if every single die came up 1.

Below it is one row per die the player rolled, showing the die and the face it landed on. Rows
that hitched get a dropdown offering:

- **Do not activate** — leave this hitch alone (the default).
- **Introduce a D6 character complication** — reveals a box for the complication's name, added to
  the rolling player's own sheet.
- **Step up a character complication** — reveals a list of the player's existing complications,
  plus any complication another row in this same dialog is about to introduce, and a **Rename
  Complication** box. Leave the box empty (it shows the current name as its placeholder) to keep
  the name as it is; type in it to rename the complication as it steps up.
- **Introduce a D6 scene complication** / **Step up a scene complication** — identical to the two
  options above, except they act on the actor sheet linked to the currently active Scene (the same
  Scene ↔ Actor link used to open the Distinction Actor from the floating panel) instead of the
  rolling player's sheet. Only shown when the active Scene is linked to an actor other than the one
  rolling.
- **Add to the &lt;Doom Pool&gt;** — adds a die of the hitched die's own size. Only shown once a
  Doom Pool Actor and Doom Pool Trait are configured in System Configuration; the option is named
  after whatever that trait is called.
- **Step up a die in the &lt;Doom Pool&gt;** — reveals a list of die sizes currently in the Doom
  Pool plus any queued by an "Add to" row. On confirm, the lowest die at or above the size you
  picked is the one that steps up.
- **Step up Paradox** — only under the Mage rule set, and only when the GM has set Magick to
  something other than None. *This option currently awards its Plot Point but does not yet change
  the Paradox trait itself.*

At the bottom the dialog shows the **Plot Points** the player will receive and a live preview of
the outcome, split into Character Complications and (when a Scene actor is linked) Scene
Complications. Only the complications this roll actually changes are listed — untouched ones are
left out of both the preview and the chat post — alongside the Doom Pool's resulting dice. Plot
Points are counted as one per unique complication touched, character and scene counted separately
(introducing a complication and then stepping that same one up costs one point, not two), plus one
per Doom Pool add, per Doom Pool step up, and per Paradox step up — **except on a BOTCH**, where the
Plot Points total is always 0 regardless of what the GM picks. The GM's choices still apply as
normal (complications and the Doom Pool still change), only the Plot Point award is withheld.

A complication that is already at **d12** cannot be stepped up any further. It stays at d12 and is
called out as **TAKEN OUT** in the preview and the chat post — the complication on the player's
sheet is left untouched.

**Confirm** posts the summary to chat, gives the player their Plot Points, and writes the new
complications and Doom Pool. Closing the dialog without confirming changes nothing.

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
