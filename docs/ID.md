# Identity: how IDs work for Actor Types and Actors

How an "id" is minted, copied, matched and relied on across Actor Types (world configuration) and
Actors / Actor Sheets (per-document data). Written from the code as it stands; every claim below
names the file that decides it.

The short version:

- There are **two unrelated id systems**: Foundry document ids, and the system's own
  `_<timestamp>` config ids. Only the second one is ours.
- An Actor stores a **snapshot copy** of its Actor Type, not a reference. Config ids are the only
  thing stitching the snapshot back to the live configuration.
- A **derived Actor Type gets a new id of its own and keeps every inner id of its parent
  verbatim.** That is the most consequential fact in this document.
- Only five kinds of thing carry an id at all (Actor Type, Trait Set, Trait, Simple Trait,
  Additional Tab). Everything else — Sub-Traits, SFX, Descriptors, Assets, Complications, Default
  Sections, Notes — is matched by **index or label**.

---

## 1. Two id namespaces

| Namespace | Shape | Minted by | Examples |
|---|---|---|---|
| Foundry document ids | 16-char alphanumeric | Foundry, on document creation | `actor.id`, `scene.id`, `user.id`, `message.id` |
| System config ids | `_` + `Date.now()` ms | This system, in settings/sheet handlers | `_1787047140985`, plus shipped literals `_1`, `_2`, `_11` … |

Foundry ids identify *documents*: which Actor is the Doom Pool actor (`doomPoolActorId`), who is in
a challenge (`initiatorId` / `responderIds` in `module/scripts/rollToBeat.js`), which Actor is linked
to a Scene (`flags.cortexprime-ext.linkedActorId`).

System config ids identify *structure inside* an Actor Type. They exist because that structure is
stored as index-keyed maps (`traitSets.0`, `traitSets.1`, …) whose indices are unstable — reorder or
delete rewrites them — and because the same structure is copied onto Actors, where it then drifts
from the configuration it came from.

One deliberate hybrid: the GM is the literal string `'gm'` in every challenge/target list
(`getRollToBeatTargets`, `module/scripts/rollToBeat.js:79`), sitting in the same id space as real
Actor document ids.

---

## 2. Where config ids are minted

Every one is `` `_${Date.now()}` ``. There is no central mint, no counter, no uniqueness check.

| Producer | File | What gets the id |
|---|---|---|
| New Actor Type | `module/settings/ActorSettings.js:162` | the Actor Type |
| New **derived** Actor Type | `module/settings/ActorSettings.js:229` | the child Actor Type (plus `parentId` = parent's id) |
| New Additional Tab | `module/settings/ActorSettings.js:184` | the tab |
| New Simple Trait | `module/settings/ActorSettings.js:313` | the Simple Trait |
| New Trait Set | `module/settings/ActorSettings.js:366` | the Trait Set |
| New Trait (settings side) | `module/settings/ActorSettings.js:339` | the Trait |
| Duplicate anything | `module/settings/ActorSettings.js:454` | **only the top-level `id` of the duplicated object** — see §6 |
| New custom Trait (Actor sheet) | `module/actor/actor-sheet.js:513` | the Actor's own `customTraits` entry |
| Migrated Notes tab | `module/scripts/migrateNotesToTabsLogic.js:9` | derived, not random: `` `_notes-${actorTypeId}` `` |
| Shipped defaults | `module/actor/defaultActorTypes.js` | hand-written literals `_1`, `_2`, `_11`, `_12`, `_13`, `_21` … |

The migration id is the only *deterministic* id in the system, and deliberately so: re-running the
migration must not produce a second Notes tab.

---

## 3. What carries an id, and what doesn't

| Structure | Has `id`? | Matched by |
|---|---|---|
| Actor Type | yes | id |
| Trait Set | yes | id |
| Trait (inside a Trait Set) | yes | id, within its Trait Set |
| Simple Trait | yes\* | id |
| Additional Tab | yes | id |
| Default Section (inside a tab) | **no** | `label` (`mergeActorTypeData`) |
| Actor's Notes section | **no** | `label` |
| Sub-Trait | **no** | index |
| SFX | **no** | index |
| Descriptor | **no** | index |
| Asset | **no** | index |
| Complication | **no** | index |
| Dice entry (`dice.value.N`) | **no** | index |

\* except in the shipped defaults — see §9.1.

The rule that emerges: **anything the GM configures once and Actors must track across edits has an
id; anything an Actor owns outright is positional.** Coherent, but it is why renaming a Default
Section in settings orphans the Actor's copy rather than renaming it, and why reordering Sub-Traits
on an Actor Type cannot be reconciled onto existing Actors.

---

## 4. The copy that makes ids necessary: `system.actorType`

`template.json` gives an Actor exactly one system field: `actorType`, initially `null`.

When a type is first chosen, `_actorTypeConfirm` (`module/actor/actor-sheet.js:214`) writes the
**whole configured Actor Type object** onto the Actor:

```js
await this.actor.update({
  img: actorType.defaultImage,
  'system.actorType': actorType,          // full snapshot, ids included
  'system.pp.value': actorType.hasPlotPoints ? 1 : 0
})
```

From that moment the Actor holds a private copy. It gains per-Actor values (dice, descriptions,
`shutdown` flags, notes, custom traits, assets, complications) and does **not** track later edits to
the configuration. The copied ids are the entire linkage back to settings:

| Consumer | Looks up by | Where |
|---|---|---|
| "Update Settings" button | Actor Type id → config, then per-entry ids | `actor-sheet.js:769`, `mergeActorTypeData` |
| Actor Type picker (current selection) | Actor Type id → config index | `actor-sheet.js:104` |
| System Traits (Mage etc.) | Actor Type id → config, then Simple Trait id → Actor index | `module/settings/systemTraits.js`, `systemTraitsLogic.js:107` |
| Doom Pool | `doomPoolTraitId` → Actor's Simple Trait id | `module/scripts/hitches.js:29` |
| Dice Pool composition rules | pool entry `traitSetId` → Trait Set in settings | `module/scripts/dicePoolValidation.js:40` |
| Mage Powers / Paradox | tagged Trait Set ids → pool entry `traitSetId` | `mageAscensionLogic.js:69`, `paradox.js:132` |
| Notes migration | `_notes-<actorTypeId>` → Actor's tab id | `migrateNotesToTabs.js:33` |

`mergeActorTypeData` (`module/actor/actorTypeChangeLogic.js`) is what all of this rests on:
**structure from settings, values from the Actor, matched entry-by-entry on `id`.** Entries the
configuration no longer defines are dropped; entries only the configuration has arrive at their
configured defaults.

`computeActorTypeChange` adds one rule on top: `IDENTITY_KEYS = ['id', 'name', 'parentId',
'traitSetEdit']` are taken from the **new** type only, and deleted when the new type lacks them, so
a type change can never leave a stale identity behind.

---

## 5. Derived Actor Types — same ids or different?

**Both, precisely and deliberately.**

`applyActorTypeInheritance` / `computeDerivedActorType`
(`module/actor/actorTypeInheritanceLogic.js:70`) rebuilds a child from its parent on *every* write
to the `actorTypes` setting:

```js
const { children, hasChildren, inherited, parentName, ...parentFields } = structuredClone(parent)

return {
  ...parentFields,          // every parent field, ids and all
  id: child.id,             // child keeps its OWN Actor Type id
  name: child.name,
  parentId: child.parentId,
  traitSets:      mergeContainers(parent.traitSets,      child.traitSets,      'traits'),
  simpleTraits:   mergeCollection(parent.simpleTraits,   child.simpleTraits),
  additionalTabs: mergeContainers(parent.additionalTabs, child.additionalTabs, 'defaultNotes')
}
```

So:

| Element | Child's id vs parent's |
|---|---|
| The Actor Type itself | **different** — its own `_<timestamp>`, minted at `ActorSettings.js:229` |
| Inherited Trait Set | **identical** (`structuredClone`, plus an `inherited: true` stamp) |
| Inherited Trait inside it | **identical** |
| Inherited Simple Trait | **identical** |
| Inherited Additional Tab | **identical** |
| The child's *own* additions | new ids, minted normally, no `inherited` stamp |

`configs/mage.json` shows this exactly. Every Tradition (`The Verbena` `_1787358412647`,
`The Order of Hermes` `_1787358016513`, …) has a distinct Actor Type id and
`parentId: _1767322477683`, while all thirteen carry the *same* `Distinctions` (`_1784978821236`),
`Values` (`_1767322484291`), `Skills` (`_1784978960886`), `Paradox` (`_1784980204269`) and `Notes`
(`_1786624946207`) ids as the `Tradition Mage` parent. Each Tradition's own `Powers` Trait Set has
an id unique to it.

### 5.1 Consequences of shared inner ids

**Load-bearing:**

- **Switching an Actor between parent and child preserves nearly everything.**
  `mergeActorTypeData` matches on id, so a `Tradition Mage` promoted to `The Verbena` keeps every
  Distinction, Value, Skill, Paradox rating and tab note, and simply gains the Powers set.
  `actorTypeChangeLogic.js`'s header comment calls this out as the reason the same function serves
  both "Update Settings" and "change type".
- **Propagation is id-driven, not position-driven.** `mergeNested` re-attaches a child's own
  additions to the parent container **matched by that container's id**
  (`actorTypeInheritanceLogic.js:46`), so a parent renaming or reordering a Trait Set keeps the
  child's extra Traits attached. A parent *deleting* a container takes the child's additions inside
  it along with it.
- **System Trait tags survive inheritance.** `getSystemTraitSetIds` deduplicates precisely because
  a derived Actor Type inherits its parent's Trait Set id verbatim (`systemTraitsLogic.js`) —
  tagging `Powers` on a parent tags it for every child, once.

**Things to know:**

- **A Trait Set id does not identify an Actor Type.** `getAllTraitSets` flattens every Trait Set
  across every Actor Type, and `dicePoolValidation.js:40` takes the **first** id match. A parent
  with thirteen children contributes thirteen extra identical entries — harmless because they *are*
  identical, but the lookup is first-match, not unique-match.
- **An id alone cannot tell you whether an element is inherited.** Only the `inherited: true` stamp
  can, and that stamp is rebuilt on every save. Read-only is enforced in the DOM
  (`#lockInheritedControls`, `ActorSettings.js`), not by id.
- **Inheritance is single level and self-healing.** A type whose parent is missing, is itself
  derived, or is itself is left untouched (`applyActorTypeInheritance:91`) — it degrades into an
  ordinary editable Actor Type rather than disappearing.

---

## 6. Duplication — what changes and what doesn't

`#onDuplicateItem` (`ActorSettings.js:445`) is the copy path for Actor Types, Trait Sets, Simple
Traits and Traits:

```js
const newTarget = {
  [newKey]: objectMapValues(item, (value, key) => key === 'id' ? `_${Date.now()}` : value)
}
```

`objectMapValues` is **shallow** (`lib/helpers.js:102`), so a duplicate gets a fresh id at its own
level and **every nested id is copied verbatim**:

| Duplicated | New id | Nested ids |
|---|---|---|
| Actor Type | yes | all Trait Sets, Traits, Simple Traits, Tabs keep the **source's** ids |
| Trait Set | yes | all its Traits keep the source's ids |
| Trait / Simple Trait | yes | nothing nested carries ids |

A duplicated Actor Type therefore behaves like a derived one for id-matching purposes — switching an
Actor between the original and its duplicate preserves everything — but **without** the `parentId`
link or the `inherited` stamps, so nothing propagates and both halves stay freely editable. See
§9.2.

Duplicating a *derived* type also copies its `parentId`, producing a second child of the same
parent. That reads as correct.

---

## 7. Import / export, and the shipped defaults

- Export writes the `actorTypes` setting verbatim (`buildExportPayload`, driven off
  `SYNCED_SETTINGS`); import writes it back verbatim. **Ids are payload, never regenerated.**
- That is what makes `configs/mage.json` work: it ships pre-tagged System Traits whose ids match the
  Actor Types in the same file.
- It is also the failure mode: importing a config into a world whose Actors were built from
  *locally created* Actor Types replaces the configuration with one whose ids no existing Actor
  matches. Those Actors keep working (they hold complete snapshots) but silently lose their link —
  "Update Settings" reports `MissingActorTypeMessage` (`actor-sheet.js:771`), System Trait
  resolution falls back to a tag on the Actor's own copy (`resolveSystemSimpleTraitIndex`), and the
  type picker shows nothing selected.
- The shipped defaults use short literal ids (`_1`, `_2`, `_11` …). They cannot collide with
  `_<timestamp>` ids, but they do collide across sibling collections: the Scene type has
  `traitSets.0.id === '_21'` and `simpleTraits.0.dice.id === '_21'`. Different namespaces, so
  nothing breaks today.

---

## 8. Identities that deliberately aren't ids

Worth knowing before assuming "everything is matched by id":

| Thing | Identity used | File |
|---|---|---|
| Dice Pool entry → the trait it came from | `traitPath`, an **index path** (`system.actorType.traitSets.0.traits.1.dice`) | `dicePoolTraitLogic.js:63` |
| Dice Pool entry → its Trait Set | `traitSetId`, a **stable id** | `actor-sheet.js:498` |
| Dice Pool grouping | the **Actor's name**, not its id (`_setTraitInPool(this.actor.name, …)`) | `actor-sheet.js:459` |
| Default Section ↔ Actor's note | `label` | `actorTypeChangeLogic.js` |
| Sheet tab selection | Additional Tab `id`, sheet-instance state only | `templates/actor/actor-sheet.html:34` |
| Challenge participants | Actor document id, or `'gm'` | `rollToBeat.js:79` |

The pool's mixed identity is intentional but fragile at the edges: `traitPath` survives a re-render
but not a reorder or deletion of traits on the Actor, whereas `traitSetId` survives both. A pool
entry built before a trait is deleted keeps pointing at whatever slid into that index.

---

## 9. Observations worth a decision (no code changed)

### 9.1 The shipped Scene "Doom Pool" Simple Trait has no `id`

`module/actor/defaultActorTypes.js` puts an id **inside** the dice object of Scene's only Simple
Trait, not on the trait itself:

```js
simpleTraits: { 0: { dice: { id: '_21', value: { 0: '6', 1: '6' } }, label: 'Doom Pool', … } }
```

Every other Simple Trait producer (`ActorSettings.js:313`) puts `id` at the top level, and every
consumer reads it there. On a fresh world using the shipped Scene type:

- The Doom Pool settings dropdown renders `<option value="">`
  (`templates/settings/doom-pool.html:17`), so `doomPoolTraitId` saves empty and `getDoomPool()`
  returns `null` (`hitches.js:23`) — the shipped Doom Pool trait cannot be wired up as the Doom
  Pool.
- `mergeActorTypeData` matches Simple Traits with `matchId === id`; with `id` undefined on both
  sides that comparison is `undefined === undefined`, i.e. **true**, so a second id-less Simple
  Trait would take the first one's values.

`configs/mage.json` is unaffected — its Simple Traits were created through the UI and are correctly
id'd.

### 9.2 Shallow re-id on duplicate

See §6. Duplicating an Actor Type yields two Actor Types sharing every inner id. If that is intended
("a duplicate stays interchangeable with its source for existing Actors") it deserves a comment
beside `#onDuplicateItem`, because the code reads as an oversight. If it isn't intended, the fix is
a deep re-id walk, and it needs a decision about Actors already built from the source.

### 9.3 `_notes-<actorTypeId>` doesn't reach Actors of derived types

`migrateNotesToTabs` computes the target tab id from the **Actor's own** type id
(`migrateNotesToTabs.js:33`), but a derived type's inherited Notes tab carries the **parent's** id
(§5). For an Actor on a derived type, `computeMigratedActorNotes` never finds the tab and the old
top-level notes stay where they are. Narrow in practice — a world old enough to need this migration
predates derived types — but the assumption it encodes ("an Actor Type's inner ids derive from its
own id") is exactly the one inheritance breaks.

### 9.4 `Date.now()` uniqueness

Two ids minted in the same millisecond collide. Reachable only by two GMs clicking simultaneously on
different clients, or by scripted creation; not by a human clicking twice. Flagged as a known
property rather than a bug — `foundry.utils.randomID()` would remove the question entirely, at the
cost of unreadable ids in exported configs.

---

## 10. Rules of thumb for new code

1. **Match on id, never on index**, for anything crossing the settings ↔ Actor boundary. Indices
   are rewritten by reorder and delete.
2. **Read configuration from settings, position from the Actor.** `resolveSystemSimpleTraitIndex`
   (`systemTraitsLogic.js`) is the reference implementation: config comes from the live Actor Type,
   the Actor is used only to locate the matching id. That is what lets a settings change reach
   existing Actors with no per-Actor resync.
3. **Never assume a config id is unique across Actor Types.** Derived types and duplicates both
   break that. Deduplicate (`getSystemTraitSetIds`) or knowingly accept first-match.
4. **Never derive one id from another** (§9.3). Store the link.
5. **Adding an id to a structure that lacks one is a data migration**, not a field addition —
   existing Actors hold id-less snapshots, and their merge behaviour changes the moment the
   configuration side gains ids.
6. Anything new stored in the `actorTypes` setting is automatically deep-cloned into every derived
   type and reconciled on every write. Free, but it also means it can never be child-specific unless
   it lives in a collection `applyActorTypeInheritance` treats as append-only.
