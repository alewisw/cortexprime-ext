// Builds a single Document#update() payload that REPLACES one or more objects under `path`
// wholesale, using Foundry's forced-replacement key (`path.==target`).
//
// A plain update merges, so an object that shrinks (a die removed from a pool, a section deleted
// from a tab) would keep its stale keys. This used to be handled by two updates - unset the object
// with `path.-=target`, then set the new one - because combining `-=` and a set of the same key in
// one update drops the set. That gap between the two writes was the bug: a second click landing in
// it read the empty mid-gap state and its write-back merged over existing data, and a refresh or
// disconnect in it left the object deleted outright. `==` replaces in one write, so there is no gap.
//
// Kept free of Foundry globals so it's unit-testable.
export const replaceAt = (path, entries) => Object.fromEntries(
  Object.entries(entries).map(([target, value]) => [`${path}.==${target}`, value])
)
