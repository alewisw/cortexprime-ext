# Automation

This document describes reactive, hook-driven behavior in the Cortex Prime system — things that
happen automatically in response to game state changing, as opposed to a GM or player explicitly
clicking a button for that specific effect. It's organized by feature area, starting with
rule-set-specific automation.

## Mage: The Ascension Engine

Enabled via the **Custom Rule Set** dropdown in Foundry's System Configuration (Settings →
Configure Settings), set to "Mage: The Ascension Engine". Configured via the **Mage Settings**
dialog (also in System Configuration), which maps:

- The Actor Type used for a **Location**, and which Simple Trait on it represents **Reality
  Reinforcement** and **Shielding**.
- The Actor Type used for a **Player Character**, and which Simple Trait on it represents
  **Paradox** and **Trauma**, plus which Trait Set defines **Powers**.

All of this feature's logic is isolated in `module/mage/` (`mageAscensionLogic.js` for pure
decisions, `mageAscension.js` for the Foundry/hook integration) and never modifies the core Dice
Pool, Challenge, or Actor Sheet code it builds on — it only reads their existing exported
functions and reacts by injecting into the already-rendered Dice Pool tray.

### The Magick / Reality Reinforcement box

Whenever the GM's Dice Pool tray has an active Challenge selected (Test, Contest, or Group) while
Mage is the active Custom Rule Set, a box appears immediately under the
Test/Contest/Group/Clear Challenge buttons with two choices:

- **Magick**: None (default), Coincidental, Coincidental Witnessed, Vulgar, Vulgar Witnessed.
- **Reality Reinforcement**: Opposes (default), Indifferent, Reinforces.

These reset to their defaults with each new world (they're not tied to a specific Challenge, so
switching Challenge type doesn't clear a choice already made for the current scene).

### Non-Magical rolls can't include a Power

Whenever Magick is **None**, the Dice Pool of whichever Player currently has a usable "Roll to
Beat" (the current Test/Contest responder(s) once the initiator has rolled, or the current Group
Initiative/duel participant — never every connected player) is invalid if it contains any Trait
from the Player Character's configured Powers Trait Set. Their roll buttons are disabled and a
message is shown:

> Non-Magical rolls cannot include a Power trait; the GM must mark this as a magical roll.

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
