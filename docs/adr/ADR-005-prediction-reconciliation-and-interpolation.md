# ADR-005 — Prediction, reconciliation, and interpolation

- Status: Proposed — protocol v2/runtime/client substantially implemented; G3 validation pending
- Date: 2026-07-20; updated 2026-07-21 (America/Chicago)
- Baseline commit: `81aa1d02acce8e30ba411bb895901d2d2ac6694e`
- Scope: P4.3-P4.4, P4.7-P4.8 and the client half of G3
- Deployment: none performed or authorized

## Context

G2 accepted the deterministic `phase3_hypothesis_v1` movement profile and collision-query contract. It did not prove multiplayer feel. Phase 4 must let a local player respond immediately while preserving the Durable Object room as the only accepted movement authority, and it must present remote players smoothly without turning interpolation into simulated truth.

The repository now contains a protocol-v2 Worker/Durable Object runtime, bounded local prediction/reconciliation and remote-presentation adapters, deterministic network impairment, and real two-browser local evidence. The visible authority route exposes these domains and their metrics. This is a substantial implementation, but it is still development evidence rather than a release client or an accepted G3 contract.

Prediction, authority, and presentation must remain distinct. A visually smooth client is not proof of correctness, and an authoritative state must not be moved gradually through collision merely to conceal a correction.

## Decision

### 1. Maintain four explicit state domains

Every local-player implementation keeps these concepts separate:

1. **command state** — bounded, sequenced player intent waiting for acknowledgement;
2. **predicted simulation state** — the immediate result of applying accepted local intent through the same movement profile and collision-query semantics;
3. **authoritative state** — the room snapshot at a named server tick and processed-command acknowledgement; and
4. **render state** — a presentation-only transform that may converge toward predicted/authoritative state without changing collision, command history, or room truth.

Remote players have authoritative samples and a render state; they do not run local command prediction. Any debug overlay must label these domains rather than display one ambiguous `position`.

### 2. Send intent, never an outcome

The browser may send only bounded input commands: sequence, client tick, normalized movement axes, look deltas, held/pressed/released intent bits, and selected slot where applicable. It may not send an accepted transform, velocity, grounded result, collision normal, spawn point, player identity, damage result, or room tick.

Wire `moveY` is converted explicitly to simulation `moveZ`; it is not an implicit axis alias. A press and release observed between two send intervals are emitted as two ordered commands so a fast tap is not erased by batching. Sequence generation, batching, retry, and reconnect behavior are deterministic and bounded.

### 3. Use a bounded pending-command ring

The client assigns one monotonically ordered command sequence and records the exact normalized command applied to prediction. The pending ring has a measured hard capacity. It never grows without limit and never silently overwrites unacknowledged commands.

On capacity pressure, sequence ambiguity, history gap, incompatible ruleset/profile/collider identity, or acknowledgement outside retained history, the client stops guessing and requests a full resynchronization. It reports a stable diagnostic reason and temporarily presents the last safe authoritative state according to the stale-state policy.

Protocol v2 must define uint32 rollover ordering before a wrap can be treated as normal. Until then, approaching rollover requires an explicit reconnect/resync boundary rather than naïve numeric comparison.

### 4. Predict with the same accepted movement contract

Local prediction calls the same pure movement controller, accepted profile identity, fixed-step duration, unit conversion, and equivalent project-owned collision package as authority. The browser does not introduce frame-rate-scaled acceleration, a second collider radius, an alternate step order, or a render-engine collision result.

Render frames may sample or interpolate predicted results, but simulation advances only in fixed 50 ms steps for the initial 20 Hz contract. Multiple render frames must not create additional simulation steps. The client records the movement profile ID/revision/hash, ruleset revision/hash, map/fixture collision hash, and adapter/build identity used for each network session once protocol v2 carries them.

### 5. Reconcile by restore, discard, and replay

When an authoritative local-player sample arrives:

1. validate protocol/session/content identity and server-tick ordering;
2. find the authoritative `lastProcessedInputSequence` in retained history;
3. replace canonical local simulation state immediately with the authoritative state at that acknowledgement;
4. discard every pending command at or before the acknowledgement exactly once;
5. replay remaining commands in sequence through the same predictor and collision package; and
6. measure the before/after positional, velocity, facing, grounded, and stance error.

The room acknowledgement means “processed into this authoritative state,” not merely “packet received.” Old or duplicate snapshots may contribute transport metrics but cannot roll state backward. A delta whose acknowledged baseline is missing is rejected and replaced by a full-snapshot request.

### 6. Correct collision immediately and smooth only presentation

Authoritative/predicted simulation state corrects immediately. It is never eased through walls, floors, ledges, or other players. Only the render transform may smooth a small non-semantic correction over a short, measured window.

The initial visible-position hypothesis is that routine correction should remain below 15% of the accepted body radius. With the current 350 mm radius that is 52.5 mm. This is a test hypothesis, not a passed threshold or a guarantee. G3 evidence must publish the correction distribution and identify any correction above the chosen threshold by cause.

Render smoothing is cancelled and the view snaps on semantic discontinuities: spawn, teleport, death/respawn, map or profile resync, full recovery after an unreplayable history gap, or any correction that would cross collision or exceed the measured snap threshold. Camera accessibility effects remain presentation-only and cannot modify authoritative or predicted body state.

### 7. Buffer remote authoritative samples by server tick

Each remote entity uses a bounded, ordered snapshot buffer keyed by server tick. Rendering intentionally trails the newest server sample by a measured interpolation delay. Position and orientation interpolate between surrounding authoritative samples; velocity may inform interpolation only within the validated model.

Packet arrival time does not drive animation or locomotion state. Animation derives from interpolated movement state plus reliable semantic events. Duplicate and out-of-order samples are handled deterministically. A new spawn/teleport/death/resync marker clears incompatible history rather than drawing through the world.

During a brief missing-sample interval, extrapolation is optional, short, bounded, and presentation-only. After the tested limit the remote render freezes, fades, or shows a stale diagnostic; it does not continue indefinitely. Recovery converges or snaps according to measured error and the semantic-discontinuity rule.

### 8. Keep remote collision policy explicit

Remote render proxies are not authoritative colliders. The local predictor must not let a delayed visual proxy decide shared player-body outcomes. If Phase 4 enables server-owned player-to-player collision, prediction uses a separately versioned approximation and accepts correction; otherwise player bodies remain non-blocking until shared-world collision is deliberately designed and tested.

### 9. Begin snapshots at 10–20 Hz and measure

Authority remains 20 Hz. Snapshot cadence begins within 10–20 Hz and is selected from measured bandwidth, correction, interpolation, CPU, and packet-loss behavior. Correctness precedes delta compression or binary encoding. Full snapshots are required on join, authenticated reconnect, incompatible/missing baseline, and explicit resync.

Quantization is introduced only after positional/angular/velocity error tests set an acceptable bound. Reliable semantic events retain stable IDs and acknowledgement/deduplication behavior independent from movement snapshot delivery.

### 10. Instrument the feel claim

Development/staging telemetry records, at minimum:

- command sequence, generated/sent/processed timing, pending-ring depth, batch size, resend/drop/resync reason;
- snapshot server tick, arrival spacing, buffer depth, interpolation delay, extrapolation duration, duplicate/reorder/loss observations;
- reconciliation positional/velocity/facing magnitude before replay, after replay, render correction duration, and semantic snap reason; and
- render frame rate alongside simulation cadence so visual stability is not confused with authority stability.

Routine production logs omit raw tokens, PII, full input streams, and anti-cheat internals. Client reconciliation telemetry is untrusted operational evidence and never changes authority.

## Required invariants

- A command is applied at most once per simulation step and removed only by an unambiguous processed acknowledgement or explicit resync.
- Replaying the same authoritative state and pending command suffix through the same profile/collider yields the same predicted state within the accepted deterministic contract.
- Snapshot arrival cannot move the authority clock backward.
- Render smoothing never writes simulation position, velocity, grounded state, command history, or outgoing protocol state.
- A stale or extrapolated remote render can never become accepted room state.
- A client-authored transform is rejected at schema/direction boundaries and ignored by authority even from an intentionally modified client.
- Joining, reconnecting, and version resynchronizing begin from a full authoritative state, not a guessed delta.
- Buffers, replay work, extrapolation time, correction duration, and per-frame processing all have hard bounds.

## Current implementation boundary

Protocol v2 is the implemented codec/runtime contract. It carries immutable
ruleset, movement-profile, fixture/map, and physics-adapter identity; bounded
`inputBatch` and exact processed-sequence acknowledgement; full snapshots with
local reconciliation state; server-owned identity and spawns; opaque digest-only
resume credentials with atomic rotation; duplicate/live-session and replay
rejection; and an explicit correlated `requestFullSnapshot` exchange with a
500 ms request bound. Protocol v1 is rejected rather than reinterpreted.

The development client now has a bounded pending-command history,
restore/drop/replay reconciliation, presentation-only correction, an ordered
remote buffer with interpolation/extrapolation/stale modes, fast press/release
preservation, and detailed counters. The visible authority route connects these
adapters to the local Worker runtime and exposes read-only diagnostic and
presentation-sampling surfaces. Nineteen immutable impairment profiles exist:
five original stress profiles plus fourteen exact matrix-axis profiles.

The current boundary remains deliberately incomplete:

- the Worker emits full snapshots only; versioned delta-baseline ownership,
  acknowledgement, missing-baseline fallback, and reliable-event
  acknowledgement/deduplication remain open;
- uint32 sequence rollover and semantic spawn/teleport/death/version reset
  markers are not complete across the transport-connected product path;
- slow-consumer/backpressure saturation, public authentication, production
  origin/CORS and secure WSS policy, staging rollback, load/soak, and resource
  observability are unproved; and
- active-room checkpoint recovery and hibernation are absent. An active
  uncheckpointed Worker restart fails closed instead of reconstructing guessed
  state.

`src/authority/inputQueue.ts` currently limits pending inputs to 128, drains at most 32 commands per player per tick, limits sequence lead to 1,024, and limits client-tick lead to 200. Those server-side ceilings are not the client history policy, transport rate limits, or permission to send 640 commands per second.

## Aether donor boundary and provenance

ADR-001 recorded immutable hashes because the local Aether source is not a Git checkout. No verified license was available in the audited donor snapshot. The following files may inform independently implemented patterns and tests only; no source text may be copied verbatim. Direct reuse remains blocked until license/copyright terms are verified and the migration ledger records the smallest reused responsibility, source hash, unit/axis conversion, rejected assumptions, tests, notices, and disposition.

| Aether candidate | ADR-001 SHA-256 | Pattern that may be independently adapted | Explicit rejection |
|---|---|---|---|
| `src/game/movementController.ts` | `96372876B8B37D9E068D9F57CDB01307B84E9D096C9EFAEBD310CE6B158AB66F` | command-history and replay test questions | donor movement constants or render-engine collision as KYX truth |
| `src/game/network/multiplayerMessages.ts` | `C4C0FBD162563777C84ACDB8C02318AE18A8BAD5B367E1265E71166CD1C7716F` | message-family organization and acknowledgement vocabulary | client-authored position, velocity, grounded, fire, or identity |
| `src/game/network/remotePlayerInterpolation.ts` | `5C4CF58930E3FDD19412A10460CD6739E7EE0F689E6EC1FF8F3941FE1B94A8C4` | ordered remote-buffer and stale-state test ideas | arrival-driven animation and unbounded extrapolation |
| `worker/roomProtocol.ts` | `B0E6EA85EF7055C4A6D84DB3B991B4D4F35E61CE7070CACD4DA83448D1FB5F9D` | snapshot/event separation | any protocol that accepts transform outcomes |
| `tools/smoke/room-socket-client.mjs` | `46064D645289BE4EEC000F52D65DE2DA9AF046D73FB40E5394622A7C084D1A7D` | synthetic client orchestration shape | treating nominal smoke output as latency or adversarial proof |

## Remaining protocol-v2 blockers

Protocol v2 must not be silently extended or reinterpreted. Remaining revisions
must preserve compatibility policy and resolve at least:

1. ruleset revision/content hash, movement profile ID/revision/hash, fixture/map collision hash, physics adapter identity, and client/server build compatibility;
2. authenticated server-issued resume credentials, grace/expiry, duplicate replacement, and stable rejection codes;
3. separate room lifecycle and match phase semantics, including late join, idle/expired, and deployment-version rejection;
4. full/delta snapshot baseline acknowledgement, safe delta fallback, reliable-event acknowledgement/deduplication, and explicit full resync;
5. precise local processed-acknowledgement meaning when a snapshot includes multiple players or no new local command;
6. stance/locomotion and semantic discontinuity markers for spawn, teleport, death/respawn, and version resync;
7. uint32 sequence rollover, retained-history gaps, pending-buffer overflow, and replay/resync state machines;
8. stable transport-visible schema, room, queue, rate, replay, stale, and incompatibility errors;
9. quantization rules only after measured position/velocity/orientation error tests; and
10. browser integration that preserves an ordered fast press/release split through batching and authority processing.

## Network test matrix

The replay/interpolation harness and two real browser contexts cover at least:

| Dimension | Required values |
|---|---|
| RTT | 0, 50, 100, 200, 350 ms |
| Jitter | 0, ±15, ±50 ms |
| Loss | 0, 1, 3, 8% |
| Duplication | 0, 1, 5% |
| Reordering | targeted bursts around input and snapshot baselines |
| Render frame rate | 30, 60, 120+ FPS with simulation fixed at 20 Hz |
| Lifecycle | join, late join, refresh, authenticated reconnect, duplicate tab, full resync, version rejection |
| Abuse | forged transform/player ID, replay, sequence lead, queue flood, oversized/invalid message, slow client |

Tests assert bounded divergence and queues, monotonic authority, no duplicate command/effect application, deterministic recovery/failure messages, stable remote presentation, and no unbounded CPU or memory growth. Exact commands, seeds, profile/collider hashes, room/match ID, raw metrics, browser console/network logs, and video must accompany the summary.

## Local evidence through 2026-07-21

The existing five-profile local run independently verifies as
`INDEPENDENT_FIVE_PROFILE_VERIFICATION_PASS`. A second stable-window run covers
all required axis values, targeted reordering, bounded outage recovery,
30/60/120 presentation-sampler cadences, lifecycle/refresh/resume, and the
modified-client abuse set. It independently verifies as
`INDEPENDENT_EXPANDED_G3_VERIFICATION_PASS`; all 50 successful-run artifact
hashes and sizes match, and five earlier failed attempts remain preserved.

This evidence is intentionally narrower than gate acceptance. It is a local
HTTP/WS factored-axis sweep, not the 540-case Cartesian product; 120 Hz is an
explicit sampler rather than physical monitor/video proof; and delta baselines,
slow-client backpressure, public authentication, production origin/WSS,
checkpoint/hibernation, staging, load/soak, CPU/memory/storage/cost
observability, and human visual acceptance remain open. The evidence retains
`gateClaim: G3_NOT_ACCEPTED` and performs no deployment.

## Alternatives rejected

- **No local prediction.** Input-latency feel would scale directly with RTT and would not meet the intended competitive response.
- **Trust client movement and clamp large deltas.** This remains client-authored state, ties authority to packet arrival, and fails an intentionally modified client.
- **Smooth the canonical collider toward authority.** It can pass through geometry and makes presentation policy alter simulation truth.
- **Predict against render-engine collision.** Different geometry, units, or query order creates systematic reconciliation drift.
- **Use packet arrival directly for remote rendering.** Jitter becomes animation jitter and reordering can move entities backward.
- **Extrapolate until another packet arrives.** Outages produce unbounded false motion and large recovery corrections.
- **Copy Aether implementation text.** The donor license is unavailable and its trust assumptions do not meet this authority contract.
- **Optimize binary/deltas before measuring JSON.** It obscures correctness and recovery failures before bandwidth establishes a need.

## Consequences and limits

- The client carries bounded replay history and two movement representations: canonical predicted/authoritative state and presentation state.
- Predictor parity makes movement profile and collision-package identity part of the network compatibility contract.
- Interpolation deliberately adds a small amount of remote presentation latency; the selected delay is an evidence-backed tuning value, not a hidden constant.
- Server-owned player-body collision, moving platforms, real-map collision, combat prediction, and lag compensation require separate decisions and evidence.
- A low average correction is insufficient; tails, semantic snaps, loss recovery, and modified-client results must be visible.

## Validation and G3 status

ADR-005 is implemented only when the exact G3 contract passes:

- two isolated browsers show the same visible match/room;
- the server tick advances independently of input arrival;
- a forged transform is rejected and cannot change accepted state;
- local prediction and remote interpolation remain proven under the required latency/loss/reorder matrix;
- reconciliation errors are bounded, logged, and tied to the selected profile/collider identity; and
- join, leave, authenticated reconnect, and full snapshot/resync pass.

The evidence must also show bounded history/buffers, fast-tap preservation,
stale/extrapolation recovery, browser console/network health, room/client
metrics, and one reproducible command. No runtime deployment was performed. The
local evidence above is substantive but bounded and cannot accept G3 while the
listed protocol, slow-client, staging, resource, and human-review rows remain
open. G3 remains pending.

## Reversal strategy

The input source, prediction history, authoritative snapshot stream, reconciliation policy, and remote presentation buffer remain narrow adapters around the shared simulation contract. Thresholds and transport encoding may change through versioned evidence. Replacing the algorithm requires a new ADR and parity tests; existing protocol versions, metrics, and captured evidence are never silently reinterpreted.
