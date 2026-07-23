# ADR-004 — Authoritative room and Worker/Durable Object runtime

- Status: Proposed — protocol-v2 local runtime and focused lobby hibernation/recovery verified; remaining G3 validation pending
- Date: 2026-07-20 (America/Chicago)
- Baseline commit: `81aa1d02acce8e30ba411bb895901d2d2ac6694e`
- Scope: P4.1-P4.3, P4.5-P4.6 runtime boundary and the room half of G3
- Deployment: none performed or authorized

## Context

G2 acceptance promoted the sealed `phase3_hypothesis_v1` movement controller to the Phase 4 baseline. It did not create multiplayer authority. The legacy `server/index.js` relay remains non-authoritative and cannot become the competitive path because it accepts client-authored outcomes and does not own a fixed simulation tick.

The Phase 4 target is one authoritative match per room. A browser may own input sampling and local prediction, but the room alone accepts identity, time, movement, collision, lifecycle, and snapshots. A WebSocket by itself is not authority; the claim must survive an intentionally modified client.

A pure authority core now exists under `src/authority/`:

- `fixedTickScheduler.ts` contains monotonic scheduling arithmetic for a 50 ms cadence, a default four-tick catch-up cap, missed-tick reporting, and backlog dropping without cadence drift;
- `inputQueue.ts` maps wire `moveY` to simulation `moveZ`, retains only intent fields, and bounds queue depth, sequence lead, client-tick lead, and commands drained per authority tick; and
- `room.ts` owns the created/lobby/warmup/active/postmatch/idle/expired lifecycle, player/connection binding, reconnect grace, deterministic player ordering, movement stepping, full snapshots, protocol entity projection, and initial room metrics.

These files are runtime-independent TypeScript. The in-progress runtime under `worker/` now includes a Worker route, named `KyxRoom` Durable Object binding, protocol-v2 WebSockets, SQLite room/session metadata, fixed-tick timer adapter, 10 Hz full snapshots, Origin checks, bounded message/byte windows, stale-socket policy, digest-only opaque resume credentials, atomic token rotation, session-generation binding, and buffered-send ceilings. Four Worker-isolate tests cover the gateway/room path, persisted pristine identity and fail-closed dirty restart, and credential digest/rotation behavior.

One local two-browser workerd smoke is sealed under `evidence/2026-07-20/phase-4-authority-local-smoke/`. It proved nominal protocol-v2 join, authoritative peer-observed movement, rotated resume with stable player/match identity, old-token replay rejection, live duplicate-session rejection, and forbidden-transform rejection in room `KYX-PC4N5C`. It did not run the network fault/load matrix or prove G3. Public account authentication, complete abuse/backpressure policy, delta snapshots, checkpoint rehydration, hibernation, cost, and staging remain absent or unproved.

## Installed dependency baseline

The root manifest, lockfile, and installed package metadata agree on:

| Package | Exact version | Role |
|---|---:|---|
| `wrangler` | `4.112.0` | local/test/staging Worker tooling |
| `@cloudflare/workers-types` | `5.20260719.1` | pinned Worker/Durable Object runtime types |
| `@cloudflare/vitest-pool-workers` | `0.18.6` | Worker-isolate integration tests |
| `@dimforge/rapier3d-deterministic-compat` | `0.19.3` | accepted Phase 3 Node/browser adapter |
| `@dimforge/rapier3d-deterministic` | `0.19.3` | Worker-only static-WASM runtime after local workerd rejected compat dynamic WASM loading |

The two Rapier packages remain behind one project-owned query-port contract; the Worker adapter may not change movement units, profile, query order, or fixture identity. Pinning tools is a prerequisite, not evidence that a Worker or Durable Object works.

## Decision

1. **Product and runtime seam.** KYX remains the product repository. `src/authority` remains a host-independent domain core; Cloudflare code adapts requests, sockets, time, storage, and observability around it. Worker APIs, environment bindings, and storage handles do not enter `src/sim` or canonical movement state.
2. **One Durable Object per room.** A stable server-selected room identifier maps to exactly one Durable Object instance for the first production path. The edge Worker routes HTTP/WebSocket requests and performs gateway checks; it never becomes a second game-state authority and never runs multiple independent copies of one room.
3. **Worker gateway.** Before a WebSocket reaches a room, the Worker must enforce the environment-specific Origin allowlist, protocol/build/content compatibility, message and connection limits, and the selected identity/session policy. Client-supplied player IDs, spawn transforms, velocity, grounded state, fixture identity, or room authority are never forwarded as accepted facts.
4. **Shared authoritative simulation.** The room advances the same pure Phase 3 movement controller and project-owned query port used by deterministic evidence. The server loads a compact authoritative collision package, never render geometry. Until Phase 6 supplies a real map package, fixture collision is evidence-only and cannot be presented as a release arena.
5. **Fixed 20 Hz cadence.** The runtime adapter samples a monotonic clock and feeds `FixedTickScheduler`. Warmup, active play, and timed postmatch transitions deliberately keep a room awake. At most four catch-up ticks run per poll by the current default; additional elapsed backlog is counted and dropped so the room cannot enter an unlimited catch-up spiral. Any change to cadence or catch-up policy requires measured evidence and a versioned decision.
6. **Hibernation boundary.** Created, lobby, idle, and reconnect-wait periods may use the Durable Objects Hibernation API only when no active simulation timer or other pending work exists. WebSocket attachments contain only bounded, versioned reconnection metadata and no token or principal. Lobby and reconnect-wait now use a persisted lobby checkpoint plus the nearest durable stale/session-expiry alarm instead of a perpetual maintenance timer; connected and disconnected reconstruction has focused Worker-isolate eviction evidence. Hibernation is not claimed during an active fixed-tick match.
7. **SQLite-backed persistence.** The Durable Object uses SQLite storage for immutable room/config/version identity, digest-only reconnect mappings, recovery state, bounded lobby player IDs/join ordinals, and future idempotent final-result records. Lobby checkpoint/session membership and current socket generations must match exactly or recovery fails closed. Active per-tick state remains in memory and is not written every tick. Recreation of a room marked `active_uncheckpointed` fails closed with `ROOM_UNAVAILABLE` rather than fabricating the same match at tick zero.
8. **Alarm policy.** Alarms are reserved for the nearest durable future callback, such as expiration or recovery housekeeping; they are not a 20 Hz simulation clock. Delivery is treated as at-least-once. Every alarm handler and persistence transition must be idempotent.
9. **Socket-owned identity.** A validated server session and the WebSocket attachment determine the player ID. `JoinAuthorityPlayerOptions.feetPosition` and yaw are internal trusted inputs for a future server spawn service only; a transport adapter must never copy them from a join message. Reconnect requires proof of a server-issued opaque resume credential, not merely knowledge of a player ID.
10. **Bounded command processing.** All frames pass through the runtime codec/schema before the room queue. Current core defaults—128 pending commands, 32 drained per player per tick, sequence lead 1,024, and client-tick lead 200—are implementation ceilings, not a complete abuse policy. Connection, IP/session, room, byte, decompressed-byte, and action-rate limits remain mandatory and must be lower or stricter where measured threat controls require it.
11. **Lifecycle ownership.** The room, not a host client, owns capacity, join/rejection, countdown, late join, reconnect grace, duplicate session, postmatch, idle, and expiration transitions. Spectator, region-selection, matchmaking, admin, and postmatch persistence policies remain explicit pending work; no client host receives game-state authority.
12. **Observability.** Development/staging telemetry records room/player counts, tick duration p50/p95/p99/max, drift and misses, queue depth/drops/rejections by reason, input-to-authority latency, snapshot bytes/messages, heartbeat/backpressure/slow-client actions, reconnect/disconnect causes, query counts, memory/storage operations, active duration, and projected cost. Current core counters are only the first subset.
13. **Security and logs.** Staging/production use HTTPS/WSS, strict Origin validation, session revalidation, per-message authorization/schema, hard frame/decompression/array/string limits, replay rejection, heartbeat/stale disconnect, bounded queues, backpressure and slow-client eviction. Routine logs exclude tokens, full payloads, PII, and anti-cheat internals.
14. **Deployment authority.** Local Worker tests and reversible staging validation are implementation work only when credentials/config already exist in scope. This ADR does not authorize a staging mutation by itself and never authorizes production deployment, paid services, account creation, or destructive migration.

## Current core defaults

| Item | Current value | Truthful interpretation |
|---|---:|---|
| Authority cadence | 20 Hz / 50 ms | inherited accepted simulation contract |
| Scheduler catch-up cap | 4 ticks | implemented in the runtime adapter; full drift/degradation distributions pending |
| Maximum players | 8 | provisional room-core default; spectator policy absent |
| Warmup | 40 ticks / 2 s | provisional |
| Active phase | 9,600 ticks / 480 s | provisional |
| Postmatch | 200 ticks / 10 s | provisional |
| Reconnect grace | 200 ticks / 10 s | opaque digest-backed resume passed one nominal local run; expiry matrix pending |
| Idle expiry | 1,200 ticks / 60 s | cleanup exists; hibernation/alarm and cost proof pending |
| Pending inputs/player | 128 | memory bound, not a transport rate limit |
| Commands/player/tick | 32 | drain ceiling, not permission for 640 commands/s |
| Sequence lead | 1,024 | simple non-wrapping comparison; rollover policy pending |
| Client tick lead | 200 ticks / 10 s | provisional rejection ceiling |

The room currently injects one query port and iterates players deterministically. Shared-world player-body collision, server spawn scoring, moving platforms, real-map collision loading, and full target occupancy cost remain unproved. The protocol projection currently supplies placeholder health/shield values for a movement-only snapshot; it is not combat authority or G4 evidence.

## Aether donor boundary and provenance

ADR-001 recorded immutable hashes because the local Aether directory is not a Git checkout. No verified Aether license was available in the audited donor snapshot. Therefore this phase may study architecture and test ideas, but it must not copy source text verbatim. Current `src/authority` code is an independent KYX implementation. Any later direct reuse is blocked until license/copyright terms are verified and the migration ledger records the exact source, smallest responsibility, unit conversion, rejected assumptions, tests, and notices.

| Aether candidate | ADR-001 SHA-256 | Pattern that may be independently adapted | Explicit rejection |
|---|---|---|---|
| `worker/roomProtocol.ts` | `B0E6EA85EF7055C4A6D84DB3B991B4D4F35E61CE7070CACD4DA83448D1FB5F9D` | bounded room message organization | client-authored transform/fire truth |
| `worker/durable-objects/GameRoom.ts` | `BC27BF89ED49ABB21C49EF2864F7221059A20AB4FD0E05ABFF011E0CEB0DDF08` | DO socket attachment, lifecycle, storage seams | arrival-driven simulation and transform clamping |
| `worker/index.ts` | `EA453E72D82797EEFAE1CB5A796F89CBD962CCBC431B3BA50ABCFF606C85B4D8` | Worker routing/deployment shape | wholesale application or trust-boundary import |
| `tools/smoke/worker-room.mjs` | `9E67D372684C474A343DEB797223E490DFED09B47BBEDD996980F2DAED2B8A81` | deterministic room smoke structure | treating a smoke test as G3 |
| `tools/smoke/room-socket-client.mjs` | `46064D645289BE4EEC000F52D65DE2DA9AF046D73FB40E5394622A7C084D1A7D` | synthetic socket-client proof shape | trusting client position, velocity, grounded, fire ray, or identity |

## Protocol v2 implementation boundary

Protocol v2 is now the implemented codec/runtime boundary. It versions immutable ruleset, movement-profile, fixture/map, physics-adapter, and build identity; carries exact local reconciliation state in full snapshots; issues and rotates opaque resume credentials; binds socket attachments to session generations without token/principal data; rejects old-token replay and live duplicate sessions with stable codes; and preserves ordered fast press/release commands. Version 1 is rejected rather than reinterpreted.

The room boundary is still incomplete until it closes semantic discontinuity markers, uint32 rollover/history-gap behavior, complete public identity and abuse controls, real slow-socket/load/resource behavior, external runtime recovery observation, staging policy, and final product-flow validation. Acknowledged delta/full-resync, reliable lifecycle-event resend/deduplication, and bounded lobby checkpoint rehydration now have separate local evidence, but they do not accept G3.

## Alternatives rejected

- **Extend the legacy Node relay.** It preserves client-authored outcomes, lacks shared movement simulation, and does not meet Worker/DO operations or threat gates.
- **Copy the Aether room wholesale.** It imports the exact client-transform trust the project is required to remove and its license/provenance is unavailable.
- **Run one room in each edge Worker instance.** Worker instances are not a stable single authority and can multiply match state.
- **Host many unrelated matches in one Durable Object.** It couples failure, capacity, persistence, and cost domains and weakens the one-room identity seam.
- **Claim hibernation during active play.** A real fixed-tick timer keeps the object awake; hiding that fact would invalidate cost and operations evidence.
- **Use alarms as the 20 Hz loop.** Alarms are not a precise high-frequency scheduler and are delivered at least once, not exactly once.
- **Persist the full simulation every tick.** It adds storage cost and latency without a demonstrated recovery requirement.
- **Accept client spawn/transform values because the core type permits coordinates.** Those parameters are trusted internal spawn inputs, never wire authority.

## Consequences and limits

- Active matches have deliberate room cost; capacity and pricing decisions require measured occupancy, duration, CPU, memory, storage, and message data.
- The host-independent authority core can run in Worker-pool tests and be replaced behind adapters, but parity must be proved against the same profile/collider identity.
- SQLite preserves immutable identity, session digests, and bounded lobby player/ordinal checkpoints. Dirty active restart deliberately fails closed; active-match checkpoint recovery is not available.
- Lobby and reconnect-wait hibernation has focused Worker-isolate eviction evidence. Active simulation deliberately remains awake, and external/staging runtime hibernation and recovery observation remain pending.
- Security limits and rejection reasons become part of a versioned operational contract, not scattered middleware defaults.
- Combat hooks are intentionally absent in Phase 4. Hardcoded health/shield projection is a movement placeholder and may not be described as server-owned combat.

## Validation required

ADR-004 is implemented only when:

- unit tests cover scheduler drift/catch-up, queue mapping/bounds, lifecycle, late join, leave, authenticated reconnect, duplicate session, version rejection, full snapshot, and stable metrics;
- Worker-pool integration tests instantiate the real Worker/DO bindings and SQLite migrations from a clean environment;
- the runtime timer advances at 20 Hz without input, records drift/missed ticks, and never runs an unbounded catch-up loop;
- idle/lobby WebSockets demonstrably hibernate while warmup/active timing remains awake and measured;
- protocol/schema/byte/rate/replay/origin/heartbeat/backpressure/slow-client abuse tests fail closed;
- server and client load the same immutable movement/ruleset/collider identity;
- two isolated browsers share one visible match ID and an intentionally modified client cannot forge movement state;
- join, leave, late join, refresh, authenticated reconnect, duplicate tab, and forced full resync pass;
- room tick and network percentiles, active duration/cost inputs, browser console/network, and exact reproduction commands are captured; and
- reversible staging security/observability checks pass if an authorized staging environment is available.

Source files, Worker-isolate tests including the focused lobby hibernation record, and the sealed local runtime captures are not a G3 pass. G3 remains pending until the complete fault/recovery, security, load/resource, product-flow, physical-review, and final-regression contract is sealed and reviewed.

## Reversal strategy

`AuthoritativeRoom`, `FixedTickScheduler`, the movement query port, protocol codecs, and a narrow runtime adapter are the reversal seams. A different room platform may replace Worker/Durable Objects only through a new ADR showing equal authority, lifecycle, persistence, threat, observability, cost, and rollback evidence. Existing protocol versions, stored records, and match evidence are migrated explicitly; they are never silently reinterpreted.
