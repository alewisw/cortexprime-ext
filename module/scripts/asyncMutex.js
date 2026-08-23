// A per-key async mutex.
//
// This codebase mutates several pieces of shared state (the dice-pool flag, the activeChallenge
// setting) with a "read the current value, compute a new one, write it back whole" cycle spread
// across many small handlers, and none of it is locked. That's fine for a human, who naturally
// waits for a re-render before the next click - but two overlapping callers (an automated test
// firing actions back-to-back, or in principle two near-simultaneous real clicks) can interleave:
// the second one's read lands before the first one's write has, so its own write clobbers the
// first with a stale base and silently discards whatever it just did.
//
// runExclusive(key, fn) queues callers sharing the same key so their fn() calls always run one at
// a time, never overlapping - closing that gap without every caller having to hand-manage
// ordering itself. Keyed rather than global so unrelated resources (the dice pool vs. the active
// challenge) never wait on each other.
const queues = new Map()

export const runExclusive = (key, fn) => {
  const previous = queues.get(key) ?? Promise.resolve()

  // Wait for whatever's ahead in this key's queue to SETTLE (success or failure) before this
  // call's fn() starts - a failed operation must not leave the queue stuck forever.
  const run = previous.then(() => {}, () => {}).then(fn)

  // What the NEXT caller under this key waits on. Deliberately swallows this run's own outcome
  // (success or failure) so one failing operation can't stall everything queued behind it - the
  // caller of THIS runExclusive still sees the real outcome via the returned `run` promise.
  queues.set(key, run.then(() => {}, () => {}))

  return run
}
