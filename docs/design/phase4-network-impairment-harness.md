# Phase 4 deterministic network impairment harness

`src/client/netcode/networkImpairment.ts` provides the P4.7 test/dev seam for
synthetic one-way latency, jitter, loss, duplication, and reordering. It uses
either a fixed xorshift32 seed or one explicit directive per send. The harness
never reads a host clock, creates a timer, or uses host randomness: callers pass
monotonic integer milliseconds to `send` and `drain`.

Important contracts:

- configuration is exact-key validated, detached, and deeply frozen;
- queued delivery copies have a hard capacity and an overflowing send is never
  partially accepted;
- a scripted schedule fails closed when exhausted;
- equal-time deliveries use insertion order, while delivery metadata retains
  the exact synthetic time even when the caller drains coarsely;
- metrics distinguish requested reorder impairment from actual first-copy
  delivery inversion and expose packet/copy, latency, and queue-depth totals;
- two directions or two peers use separate harness instances so each stream has
  an explicit independent seed/schedule.

The default payload cloner assumes the input is already immutable. Runtime
adapters carrying mutable payloads must provide the factory's cloner callback.

This harness and its focused unit scenarios are controlled infrastructure only.
They do **not** constitute a G3 claim: G3 still requires the complete two-client
runtime, reconnect, sustained impairment/chaos, metrics, and evidence matrix.

## Finite named browser-evidence profiles

The visible authority route exposes 19 immutable profiles. The original five
(`nominal`, `latency-jitter`, `loss`, `reorder-duplicate`, and
`combined-stress`) remain unchanged for repeatability. Fourteen additional
profiles provide exact, finite G3-axis rows:

| Profile family | Exact rows |
|---|---|
| `matrix-rtt-*` | 0, 50, 100, 200, and 350 ms symmetric RTT; each direction receives half the named delay |
| `matrix-jitter-*` | +/-15 and +/-50 ms around 60 ms one-way base latency |
| `matrix-loss-*` | 1%, 3%, and 8% seeded gameplay-frame loss |
| `matrix-duplicate-*` | 1% and 5% seeded duplication with a 7 ms duplicate-copy delay |
| `matrix-targeted-reorder` | a finite 512-send script; every twelfth gameplay frame is delayed by 140 ms over a 20 ms baseline |
| `matrix-outage-recovery` | a finite 512-send inbound script; ordinals 24 through 41 are dropped, then delivery resumes |

The zero jitter/loss/duplication rows are supplied by the exact-zero RTT
profiles in the evidence manifest. These are factored axis sweeps, not the
540-case Cartesian product of every RTT, jitter, loss, and duplication
combination. The expanded capture must state that boundary explicitly.

The visible authority route deliberately separates its WebSocket-reliable
lifecycle/control lane from its synthetic lossy gameplay lane. `hello`,
`welcome`, join/resume requests and acceptances, notices, errors, match state,
reliable events, `requestFullSnapshot`, and the correlated full snapshot that
answers that request bypass synthetic loss, duplication, reordering, and delay.
The first full snapshot on every connection is also delivered before gameplay
impairment activates; after that point periodic `fullSnapshot`,
`deltaSnapshot`, `inputBatch`, and `inputAck` frames use the named directional
impairment profile. Diagnostics expose every reliable-control, explicit-resync,
and bootstrap bypass count. This models a reliable session bootstrap plus a
deliberately harsh lossy data plane; it does not claim that TCP WebSocket frames
themselves are lost on a real network, nor does it test handshake-loss retry or
request-id idempotency.

The current Worker emits full snapshots only. A correlated explicit full-resync
exchange is implemented and rate-bounded, but acknowledged delta baselines,
missing-baseline fallback, and reliable-event acknowledgement remain open.
