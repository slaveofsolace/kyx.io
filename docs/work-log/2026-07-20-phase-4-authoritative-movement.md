# Phase 4 work log — authoritative movement

- Started: 2026-07-20 (America/Chicago)
- Baseline commit: `81aa1d02acce8e30ba411bb895901d2d2ac6694e`
- Entry gate: G2 accepted by explicit user decision on 2026-07-20
- Current gate: G3 authoritative two-browser movement
- Gate status: **IN PROGRESS — G3 NOT PASSED**
- Deployment: none performed or authorized

## Target

Complete the handoff pack's P4.1-P4.8 authoritative-movement slice without weakening the accepted Phase 3 movement/collision contract. One Durable Object room must own accepted state at a fixed 20 Hz cadence. Browsers may own input collection, local prediction, and presentation, but never identity, time, transforms, collision outcomes, or match truth.

G3 requires two isolated browsers in the same visible room, a server tick independent of input arrival, rejection of a forged transform, local prediction and remote interpolation under latency, bounded/logged reconciliation error, and passing join/leave/reconnect/full-snapshot behavior. Source code, unit tests, a nominal socket smoke, or the presence of Cloudflare packages cannot pass that gate alone.

## 2026-07-21 current update

The detailed current record is [Phase 4 expanded local G3 evidence](2026-07-21-phase-4-g3-expanded-evidence.md). The existing five-profile run and a new fourteen-profile factored-axis run now pass independent raw-artifact verification, including lifecycle, real active-socket refresh/resume, targeted outage/reorder recovery, queue/rate abuse, screenshots, and representative video. This is **expanded local evidence only**: G3 remains unaccepted because delta baselines/reliable-event ACK, slow-client backpressure, physical 120+ Hz review, production auth/origin/WSS, staging, checkpoint/hibernation, load/resource/cost observability, and human acceptance remain open.

## Accepted input boundary

Phase 4 begins from the sealed Phase 3 contract:

| Item | Accepted value |
|---|---|
| Simulation cadence | 20 Hz / 50 ms fixed step |
| Movement profile | `phase3_hypothesis_v1` |
| Movement profile hash | `8ab4ed437a4393c0` |
| Canonical movement replay hash | `66fcaf19c3fd94ad` |
| Protected Phase 2 replay hash | `d7201dfc006e72ee` |
| Canonical position | capsule lowest point in integer millimeters |
| Body radius used by current hypothesis | 350 mm |
| Real-map status | absent; Phase 3 collision fixtures remain evidence-only |

G2 acceptance authorizes Phase 4 work. It does not establish multiplayer authority, ev.io parity, final tuning, real playable content, combat authority, deployment, or G3.

## Pinned runtime/tool baseline

The manifest, lockfile, and installed package metadata must agree before any evidence seal:

| Package | Exact version | Phase 4 purpose |
|---|---:|---|
| `wrangler` | `4.112.0` | local Worker/workerd and reversible staging tooling |
| `@cloudflare/workers-types` | `5.20260719.1` | Worker/Durable Object runtime types |
| `@cloudflare/vitest-pool-workers` | `0.18.6` | real Worker-isolate integration-test pool |
| `@dimforge/rapier3d-deterministic-compat` | `0.19.3` | accepted Node/browser Phase 3 deterministic-compat adapter |
| `@dimforge/rapier3d-deterministic` | `0.19.3` | Worker-only static-WASM runtime path after local workerd rejected the compat package's dynamic WASM loading |

The two Rapier packages must remain behind one project-owned query-port contract. The Worker-only runtime change is not permission to change movement units, profile, query ordering, fixture identity, or accepted Node/browser replay behavior.

## Architecture records started

- [ADR-004 — Authoritative room and Worker/Durable Object runtime](../adr/ADR-004-authoritative-room-worker-durable-object-runtime.md) selects one Durable Object per room, SQLite only for durable lifecycle data, hibernation for lobby/idle/reconnect periods, and an intentionally awake measured timer for active simulation.
- [ADR-005 — Prediction, reconciliation, and interpolation](../adr/ADR-005-prediction-reconciliation-and-interpolation.md) separates command, predicted, authoritative, and render state; defines restore/drop/replay; and keeps correction smoothing presentation-only.

Both records are proposed until implementation and evidence satisfy their validation sections. Neither record authorizes deployment or claims G3.

## Implementation snapshot

The subsections below preserve the 2026-07-20 implementation snapshot. Use the 2026-07-21 update and linked work log for current evidence status; the historical local smoke alone is not G3.

### Runtime-independent authority core

- `src/authority/fixedTickScheduler.ts` provides monotonic 20 Hz scheduling arithmetic, a default four-tick catch-up cap, missed-tick accounting, and bounded backlog dropping.
- `src/authority/inputQueue.ts` explicitly maps wire `moveY` to simulation `moveZ`, retains intent only, rejects stale/duplicate/far-future input, and bounds queue depth and per-tick drain.
- `src/authority/room.ts` owns deterministic player ordering, trusted spawn resolution, separate new-join and transport-authenticated resume paths, connection/player/principal/reconnect binding, phase-gated input, disconnect freeze/reset behavior, one-match lifecycle, full movement snapshots, and initial metrics.
- The authority core injects the movement query port and accepted movement profile. It does not import Worker APIs.

Current provisional defaults are eight players, 40 warmup ticks, 9,600 active ticks, 200 postmatch ticks, 200 reconnect-grace ticks, 1,200 idle-expiry ticks, 128 pending commands/player, 32 drained commands/player/tick, sequence lead 1,024, and client-tick lead 200. Queue/drain ceilings are memory/work bounds, not transport abuse permission.

### Worker/Durable Object skeleton

- `worker/worker.ts` supplies health/create/room routing, an explicit Origin allowlist, a named room stub, and baseline response hardening.
- `worker/room.ts` supplies one `KyxRoom` Durable Object per normalized room code, protocol-v2 socket attachments, SQLite room/session metadata, a fixed-tick adapter, 10 Hz full movement snapshots with exact local reconciliation state, input acknowledgements, server-selected identity/spawns, opaque resume-token rotation, and fixture-backed authority.
- `worker/resumeSessions.ts` stores resume-token digests rather than plaintext credentials, rotates them atomically, rejects replay, binds a session generation to the socket attachment, and arms the current 10-second disconnect grace.
- `worker/security.ts` supplies room-code and attachment validation, bounded message/byte windows, stale-heartbeat policy, and a buffered-byte ceiling without placing tokens or principals in attachments.
- `worker/rapierRuntime.ts` isolates the Worker-only static-WASM Rapier runtime required by local workerd while the Phase 3 Node/browser adapter remains unchanged.
- `wrangler.jsonc` declares the `KYX_ROOM` binding and `new_sqlite_classes` migration; `tsconfig.worker.json` isolates Worker typechecking.

Protocol v2 now carries immutable simulation identity, client-facing opaque resume credentials, rotated resume acceptance, exact local processed-input state, and stable duplicate/replay errors. It is still not the complete product runtime contract. Public account authentication, IP/session/room/action/decompression controls, slow-client/load proof, complete storage recovery, cost measurements, delta baselines, and staging controls remain incomplete or unproved. Dirty active-room recreation fails closed rather than restoring a checkpoint. The current maintenance timer keeps lobby rooms awake, so lobby hibernation is not claimed. The flat-run fixture is a test collider, not a release arena.

### Current source-test inventory

The current main suite passes 410 tests across 38 files and the Worker-isolate suite passes 5 tests across 2 files. App and Worker typechecks, full lint, production build, the existing five-profile independent verifier, and the expanded 14-profile independent verifier pass. The deterministic P4.7 harness now has 19 immutable named profiles and the expanded successful run inventories 50 hash-verified artifacts.

The original concise smoke remains under `evidence/2026-07-20/phase-4-authority-local-smoke/verification.json`. Current raw capture, preserved failures, and independent manifests are under `evidence/2026-07-21/phase-4-g3-expanded/`.

### Verified local workerd two-browser smoke

The runtime lane completed and recorded one protocol-v2 local smoke against workerd on 2026-07-20 under `evidence/2026-07-20/phase-4-authority-local-smoke/`:

- two isolated browser contexts joined room `KYX-PC4N5C` and retained the same match across resume;
- welcome, join, full snapshot, resumed join, and resumed full snapshot all carried protocol version `2` and ruleset hash `039ae95bed7ee716`;
- connection modes were `joined`, `joined`, and `resumed`; the resumed socket retained the player identity, rotated a 43-character opaque token, and restored processed input sequence `0` after beginning at `-1`;
- authority acknowledged sequences `0` and `1`; client B observed A move from `[-1500, 0, -2000]` to `[-1500, 0, -1850]` mm and later continue from `[-1500, 0, -1250]` to `[-1500, 0, -800]` mm after resume;
- forged `SetPosition` failed with `PROTOCOL_FORBIDDEN_COMMAND`, the old token failed with `RESUME_REJECTED`, and the current token presented while its session was live failed with `DUPLICATE_SESSION`; and
- the HTTP-200 metrics snapshot at warmup tick 20 reported two players, two connected players, two accepted inputs, queue depth 1, zero listed authority-queue rejections, and zero missed ticks.

This proves the nominal local protocol-v2 join/move/peer-observation/resume/replay-rejection path exercised in that run. It does **not** prove the latency/loss/reorder matrix, full visible-UI prediction/interpolation integration, delta baselines, heartbeat/backpressure under load, checkpoint rehydration, hibernation/cost, staging security, or repeatability from a raw-log capture harness. It is not G3.

## Backlog status

| Item | Current state | Remaining exit work |
|---|---|---|
| P4.1 Worker/DO structure and attribution | **In progress** | Runtime, Worker-isolate tests, dry-run, and ADR-004 exist; finish provenance ledger, checkpoint/hibernation behavior, rollback/config review, and complete evidence. |
| P4.2 room lifecycle and fixed 20 Hz loop | **Expanded local evidence passes** | Input-independent cadence and lifecycle pass locally; hibernation, restart/checkpoint, capped degradation under load, and cost/resource proof remain. |
| P4.3 sequenced inputs/queues/acks/server collision | **Local path working** | Queue/replay/lead/forgery bounds pass locally; finish rollover, delta-baseline/reliable-event ACK, slow-client, and load evidence. |
| P4.4 snapshots/prediction/replay/interpolation | **Visible development integration working** | Restore/replay and remote interpolation/stale recovery pass the factored local matrix; finish delta/fallback, semantic resets, product-client integration, physical-FPS review, and human acceptance. |
| P4.5 transport/security controls | **Partial; local abuse pass** | Origin/schema/frame/message/byte and queue/rate abuse controls pass locally; add public authentication, production origin/CORS/WSS, decompression/IP/session/room/action controls, and slow-client proof. |
| P4.6 lifecycle joins/reconnect/version rejection | **Expanded local lifecycle passes** | Late join, real refresh, grace expiry, explicit full resync, resume/replay, and version rejection pass; deployment incompatibility, restart/checkpoint, and broader multi-session policy remain. |
| P4.7 network fault/adversarial harness | **Factored local axes pass** | Exact RTT/jitter/loss/duplication rows, reorder/outage, and modified-client abuse pass; full Cartesian interaction, slow consumer, load/soak, and resource bounds remain. |
| P4.8 two-browser proof and metrics | **Expanded local evidence sealed; G3 pending** | Raw logs, screenshots/video, metrics, and independent manifests pass; staging/physical-display/human acceptance and the remaining G3 boundaries still block the gate. |

## Aether donor boundary and immutable hashes

ADR-001 recorded these SHA-256 values because the local Aether donor is not a Git checkout:

| Candidate | SHA-256 |
|---|---|
| `src/game/movementController.ts` | `96372876B8B37D9E068D9F57CDB01307B84E9D096C9EFAEBD310CE6B158AB66F` |
| `src/game/network/multiplayerMessages.ts` | `C4C0FBD162563777C84ACDB8C02318AE18A8BAD5B367E1265E71166CD1C7716F` |
| `src/game/network/remotePlayerInterpolation.ts` | `5C4CF58930E3FDD19412A10460CD6739E7EE0F689E6EC1FF8F3941FE1B94A8C4` |
| `worker/roomProtocol.ts` | `B0E6EA85EF7055C4A6D84DB3B991B4D4F35E61CE7070CACD4DA83448D1FB5F9D` |
| `worker/durable-objects/GameRoom.ts` | `BC27BF89ED49ABB21C49EF2864F7221059A20AB4FD0E05ABFF011E0CEB0DDF08` |
| `worker/index.ts` | `EA453E72D82797EEFAE1CB5A796F89CBD962CCBC431B3BA50ABCFF606C85B4D8` |
| `tools/smoke/worker-room.mjs` | `9E67D372684C474A343DEB797223E490DFED09B47BBEDD996980F2DAED2B8A81` |
| `tools/smoke/room-socket-client.mjs` | `46064D645289BE4EEC000F52D65DE2DA9AF046D73FB40E5394622A7C084D1A7D` |

No verified Aether license was available in the audited donor snapshot. Phase 4 may independently implement architectural patterns and test ideas, but no Aether source text may be copied verbatim. Direct reuse remains blocked until license/copyright terms are verified and the migration ledger records source, hash, smallest responsibility, unit/axis conversion, rejected trust assumptions, tests, notices, and disposition.

Adopted patterns are the Worker routing shape, one-room Durable Object ownership, bounded socket attachments, lifecycle/storage seams, snapshot/event organization, remote-buffer questions, and synthetic-client proof structure. Rejected assumptions include client-authored position/velocity/grounded/fire/identity, arrival-driven simulation, transform clamping as authority, unused sequence fields, unbounded extrapolation, and nominal smoke/test counts presented as acceptance.

## Protocol v2 implementation boundary

Protocol v2 is now the implemented codec and local runtime contract. It carries immutable ruleset, movement-profile, fixture/map, and physics-adapter identity; exact local reconciliation state; server-issued opaque resume credentials; rotated resume acceptance; duplicate/live-session and replay rejection; stable full snapshots; and ordered fast press/release batches. Protocol v1 is rejected rather than silently reinterpreted.

The remaining versioned runtime work is:

1. acknowledged delta baselines, delta fallback, reliable-event acknowledgement/deduplication, and forced full resync;
2. complete late-join, idle/expired, grace-expiry, deployment-incompatibility, and restart semantics;
3. stance/locomotion plus spawn/teleport/death/resync discontinuity markers through the visible client;
4. uint32 sequence rollover, retained-history gaps, pending overflow, and replay/resync behavior in the transport-connected path;
5. complete schema/room/queue/rate/stale/incompatibility error coverage and public authentication policy;
6. measured quantization only after position/velocity/orientation error tests; and
7. checkpoint rehydration or an explicitly accepted fail-closed recovery policy before hibernation claims.

## G3 evidence still required

The gate cannot close until a sealed, reproducible run proves:

- two isolated browser contexts show the same visible room and match ID;
- the room advances at a measured 20 Hz independently of input arrival, with drift/missed/catch-up data;
- a deliberately modified client cannot forge transform, velocity, grounded state, player ID, spawn, or sequence history;
- local prediction and remote interpolation work across 0/50/100/200/350 ms RTT, 0/±15/±50 ms jitter, 0/1/3/8% loss, 0/1/5% duplication, targeted reorder bursts, and 30/60/120+ render FPS;
- reconciliation distributions, tails, snap/resync reasons, pending/buffer bounds, extrapolation/stale recovery, bandwidth, backpressure, and room CPU/memory/storage/cost inputs are logged;
- join, leave, late join, refresh, authenticated reconnect, duplicate tab, grace expiry, version rejection, missing baseline, and full resync pass;
- lobby/idle/reconnect hibernation and intentionally awake warmup/active/postmatch timing are demonstrated rather than inferred;
- Worker-pool integration starts from clean bindings/SQLite migration and security abuse tests fail closed;
- browser console/network logs and room/client metrics have no unexplained critical failures; and
- exact commands, environment versions, seeds, hashes, screenshots/video, raw logs, and an independently verifiable evidence manifest are present.

## Next execution sequence

1. Wire the tested local prediction/reconciliation/interpolation adapters into the visible game client with bounded telemetry and explicit semantic resets.
2. Finish delta/full-resync behavior, checkpoint/restart policy, heartbeat/backpressure/load controls, and the truthful hibernation boundary.
3. Extend Worker-isolate coverage for timer independence, lifecycle/recovery, security, and slow-client failure paths.
4. Build the deterministic network-fault and modified-client harness, then fix every authority or resource-bound failure.
5. Run the exact G3 two-browser matrix, capture raw logs and visible evidence in an independently verified manifest, request review, and only then update gate status.

## Deliberate limits

- `phase4_flat_run` and Phase 3 fixtures are test collision packages, not finished map content or G5.
- Health/shield placeholders in movement snapshots are not authoritative combat or G4.
- A local workerd response, a passing unit suite, or a correct two-socket transcript is valuable implementation evidence but is not the complete G3 visual/adversarial contract.
- No staging or production deployment, paid service, account mutation, destructive migration, or G3 acceptance is recorded here.
