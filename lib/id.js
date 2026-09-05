// Mints system config IDs — Actor Types, Trait Sets, Traits, Simple Traits, Additional Tabs, Plot
// Point Uses and an Actor's own custom Traits. See docs/ID.md for what these IDs are and how they
// are matched.
//
// Replaces a bare `_${Date.now()}`, which returned the SAME id twice for any two allocations inside
// one millisecond. `lastStamp` makes the stamp strictly increasing within this client: a second
// call in the same millisecond borrows from the next one rather than repeating. The random block
// covers the one case a counter can't — two GM clients minting in the same millisecond.
//
// The `-` is load-bearing: it is what guarantees a new id can never equal a legacy `_<digits>` id
// already stored in a world or in configs/mage.json. Nothing probabilistic about it.
const RADIX = 36
const RANDOM_CHARS = 3
const RANDOM_RANGE = RADIX ** RANDOM_CHARS

let lastStamp = 0

const nextStamp = () => {
  lastStamp = Math.max(Date.now(), lastStamp + 1)

  return lastStamp
}

const randomBlock = () => Math.floor(Math.random() * RANDOM_RANGE)
  .toString(RADIX)
  .padStart(RANDOM_CHARS, '0')

export const newId = () => `_${nextStamp().toString(RADIX)}-${randomBlock()}`
