# KYX.IO overall project status — 2026-07-21

- Canonical repository: repository root
- Governing handoff: archived project handoff package
- Baseline commit: `81aa1d02acce8e30ba411bb895901d2d2ac6694e`
- Worktree policy: preserve the intentional dirty tree. No reset, clean, stash, commit, deployment, or publication was performed.
- Accepted gates: **G0, G1, and G2 only**. G3–G9 remain open until their complete contracts and required human reviews are proven.
- Last bounded update: 2026-07-22 (America/Chicago).

## Load-and-play truth

The last direct product-flow verification opens the truthful local menu and launches **Offline Practice** on legacy/local Iron Bastion with one player, seven labeled local bots, the existing HUD, weapons, abilities, timer, score, and local combat. The menu keeps `ONLINE MATCH — NOT AVAILABLE` disabled.

This is a playable prototype, not the requested release candidate:

- protocol-v2 authority remains a development evidence flow rather than the normal product match flow;
- Inkfall Foundry is development-only and is not yet the selectable finished match map;
- product runtime still uses the rejected blocky characters;
- Offline Practice combat is not the complete authoritative G4 implementation;
- no online, staging, or production deployment is claimed.

## Gate board

| Gate | Current state | Evidence boundary |
|---|---|---|
| G0–G2 | **Accepted / preserved** | Repository truth and deterministic 20 Hz movement remain the sealed baseline. Final adjacent regression is still required after later work. |
| G3 | **Successor real-local transport, lobby hibernation, and ACK-debt policy verified; gate not accepted** | The immutable `local-v12` matrix retains its stale 257/385 abuse literal, but real local `transport-v1` local-v8 independently proves exact rate/delta/reliable transport. Focused lobby/reconnect hibernation passes 18/18 independent checks. The new 3,000 ms application-level snapshot-ACK debt bound passes a real two-socket Worker-pool case: the non-acknowledging socket is evicted with code 1013 while its acknowledging peer continues. External slow-socket/staging recovery, public auth, load/resource/cost, physical-refresh/product boundaries, and final adjacent regression remain. |
| G4 | **P5.1–P5.6 bounded seams pass; P5.7 independent audit failed and correction is active; gate open** | P5.6 lifecycle/order defects are corrected and re-audited. P5.7's client-only adapter passes its focused suite, but audit found incomplete snapshot-identity validation, same-tick reconnect effect replay, missing accepted/rejected state separation, and no reduced-motion marker alternative. Those four defects are being corrected. Worker/wire correlation, rendered consumers, abuse/runtime coverage, Rapier/Inkfall binding, two-browser proof, P5.8–P5.9, and G4 acceptance remain. |
| G5 | **P6.1–P6.5 complete; P6.6 revision 2 staged but still fails four substantive checks; gate open** | Native revision 2 passes P6.2–P6.5 and broad authority regression without changing the render GLB. It fixes the measured drop-route geometry but still records one 5,100 ms route against the pinned 1,800–4,000 ms band and three retained-agent overlaps. A read-only audit rejected metric substitution, overlap exemptions, and lifecycle exclusion; a strict P6.6B tape/posture addendum is being prepared. Regression/lock, final-art room, human no-snag/fun proof, performance, and acceptance remain. |
| G6 | **V6-A accepted; V6-C visual benchmark iteration active; gate open** | V6-B rev14 and V6-C rev1 were self-rejected as visibly blockout-like. V6-C rev4 is the cleanest current benchmark, with a more coherent chest and layered guards, but its front/back limbs still read as isolated capsules, the helmet rear is orb-like, and the boots/rifle remain too smooth. It is explicitly not accepted. Retopo/UV/materials, rig/LODs/arms/contact/animations/runtime exports, performance, and human in-engine acceptance remain. |
| G7–G9 | **Open** | Final HUD/accessibility, audio/VFX, performance/soak, security/legal/staging readiness, packaging, and release regression remain. |

## G3 current evidence truth

The live expanded harness uses two isolated Chromium contexts against a local Vite client and Wrangler Durable Object. It covers RTT 0/50/100/200/350 ms, jitter 0/±15/±50 ms, loss 0/1/3/8%, duplication 0/1/5%, targeted reorder, bounded outage/recovery, 30/60/120 presentation samplers, lifecycle, real document reload/resume, and abuse probes. The 120 row is a sampler cadence, not physical 120 Hz display proof.

Current transport code has opaque versioned snapshot baselines/ticks, acknowledged deltas and fallback, bounded reliable-event resend/deduplication, future/unknown ACK rejection, rate/size/schema/origin controls, reconnect grace, token rotation, duplicate-session rejection, and attachment-cache recovery. Focused app/Worker TypeScript, lint, protocol, socket, and attachment-cache tests are green at their latest checkpoints.

The separate deterministic slow-consumer record now passes 5/5 policy tests and 3/3 Cloudflare Worker-isolate tests. Its capture SHA-256 is `43d53cff74c4d3ea0c41b702699086ebe11553768e6b7aa1f33939fd5c7d8a17`; the independent verifier was executed exactly once, passed all fifteen checks, and has SHA-256 `3310887b0605a1ba7a8cd9cb79e366567b61b37bdbb85fae9aed62655c2bb141`. This proves only deterministic/isolate behavior, not real socket saturation or G3.

The real local successor-transport capture `transport-v1` local-v8 passes against Vite, Wrangler Durable Object, Chromium, and actual WebSockets. It proves same-tick baseline identity, acknowledged delta chaining, reliable lifecycle-event resend/dedup/cumulative ACK, future/old/unknown ACK rejection, correlated and timeout full-snapshot fallback, healthy honest 20 Hz input/10 Hz ACK traffic, and the exact 385 received / 384 accepted / one rejected rate-limit boundary. The capture SHA-256 is `63bb4529f0e7e2e9725b8b893e27a9e5bbd963d88be676a5e81a984cf2f6228e`; the independent verifier was executed exactly once, passed all 34 checks, and has SHA-256 `37aa11ed96efdb3051c5782d55c19909a6ac31b53ecd7c581c803f214b6450b0`. This supersedes only the stale transport claims, not the remaining G3 boundaries.

Focused lobby/reconnect hibernation is now also implemented and sealed in the
Worker test runtime. SQLite stores bounded lobby player IDs and stable join
ordinals; state/session/socket-generation mismatches fail closed; the nearest
durable alarm handles stale sockets and reconnect expiry; starting warmup
atomically clears the checkpoint and keeps the 20 Hz active room awake. The
`local-v2` capture directly evicts a hibernatable Durable Object and passes the
three connected, disconnected-resume, and alarm-expiry flows plus Worker
typecheck, lint, and dry-run bundling. Its SHA-256 is
`c99096844a60fbe35599d1aec65a488f429be6cefe6f33c1d8e9faef88e33663`;
the exactly-once independent verifier passes 18/18 with SHA-256
`7c2ca8c673cd385721b692266f36dd256f70fe773d7f2d95d0cd09ea64cf020f`.
This is not external workerd/staging recovery, active-match checkpointing, or a
G3 pass.

Fresh attempts remain immutable:

- `local-v8` passed twelve profiles, then failed after a concurrent source edit caused a Wrangler hot reload and a room-metrics 503. Source ownership, not protocol behavior, invalidated that run.
- `local-v9` completed all profiles/lifecycle/refresh/abuse, but audit rejected its verification because stale scope text falsely said deltas were absent while its counters showed acknowledged delta snapshots.
- `local-v10` corrected that statement and added observer-B motion screenshots plus both-peer videos. Thirteen of fourteen profiles passed; targeted reorder produced one 2,000 mm peer-A reconciliation hard snap, so the matrix correctly ended `EXPANDED_LOCAL_G3_EVIDENCE_FAIL`. Source mtimes were unchanged and ports were released, making this a real behavior defect rather than test contamination.
- The defect was traced to `BoundedInputQueue`: arrival high-water state was incorrectly also used as processed-sequence state, so receiving N+1 before N made the valid N input stale. The queue now separates accepted and processed sequence tracking, deterministically drains contiguous inputs, deduplicates/sorts pending arrivals, and has a bounded four-tick gap fallback. Root independently reran the queue/room-focused suite at 17/17.
- `local-v11` showed that the product fix removed the reorder hard snap, but the harness sampled presentation twice across a mode boundary and therefore captured an extrapolated observer state. It was preserved as a truthful capture failure and was not independently verified.
- `local-v12` atomically serializes the exact observer-B presentation sample and renders a dev-only proof overlay tied to the same payload. All 14 runtime profiles pass, including RTT through 350 ms, loss through 8%, duplication through 5%, targeted reorder, outage/recovery, render cadence rows, lifecycle/reload-resume, refresh, and abuse. It contains 70 hashed artifacts; source content digest was unchanged (`7da33390333948eb72603fadbf5f978a240babb3392f90f6123c75d3e3f0d6d7`, 173 files), and owned ports were released.

The root-owned independent verifier was run exactly once against `local-v12` and returned `INDEPENDENT_EXPANDED_G3_VERIFICATION_PASS`; its artifact SHA-256 is `4bf6184415f8e743430180f3aa107cf18e1f674b103ad6295d6c5e656f97d89b`. A subsequent independent source/artifact audit found a verifier blind spot: the frozen abuse artifact records `messagesSent=257` while the captured source loop present for the run executes 385 iterations, and the verifier trusts serialized result booleans instead of independently reconciling those counts. `local-v12` and its verifier remain preserved historical evidence, but they are no longer sufficient for the broad abuse claim. Corrected tooling and a fresh v13 run are required. The explicit gate claim remains `G3_NOT_ACCEPTED`.

## G4 combat state

Revision 3 of `revamped_classic` pins the vertical-slice life/match/Auto Rifle/Impulse profile without changing the accepted revision-2 default. Historical revisions/hashes remain preserved.

P5.1 and P5.2 provide strict immutable authority services for health/shield, damage/death/respawn/spawn protection, ammo/cadence/reload/equip/recoil/spread, and stable semantic events. The exact revision-3 profile can be explicitly enabled in `AuthoritativeRoom`; legacy and G0–G2 rooms remain unchanged. Room-owned input drives rifle state, authority damage rejects forged outcomes/accessors/team damage, dead players cannot move, and respawn uses the authority spawn resolver.

P5.3 adds immutable 20 Hz pose histories with a fixed 16-sample bound, server-observed RTT median, a four-tick/200 ms cap (350 ms RTT maps to four ticks), current authority shooter/look, target-only exact-tick rewind, authority eye/muzzle ray, accepted P5.2 recoil/spread, analytic yaw-oriented hit volumes, world-occlusion ordering, team/self/dead filtering, and strict hostile-data validation. Its independent focused suite passes 15/15; combined authority tests passed 75/75 at the foundation checkpoint.

P5.3b integrates that foundation behind the exact `authoritative_hitscan_v1` capability without changing legacy tick shapes. The room records only server-observed RTT, captures all poses before resolving queued shots, uses an authority world-occlusion port, resolves simultaneous shots in stable order, and resets pose/RTT state at the correct lifecycle boundaries. Root independently reran the combined P5.2/P5.3/P5.3b suites at 28/28. This is still not live Worker/net/runtime proof.

P5.4 adds the exact `authoritative_impulse_grenade_v1` room capability: server-derived throw identity/origin/look/seed, 18,000 mm/s integer swept-sphere stepping, stable earliest contact, owner immunity through tick 5, first-contact 30-tick fuse, three-bounce limit, 120-tick lifetime, one detonation, LOS/linear 11 m radial impulse, separate 9,000/7,000 mm/s self/enemy caps, 8,000 mm/s vertical cap, zero damage, cooldown/max-active enforcement, and stable simultaneous resolution. Root independently reran its pure/room suites at 14/14. Real Inkfall/Rapier binding, Worker/wire delivery, presentation, and two-browser proof remain open; P5.5 equip/resource/teleport integration is active.

P5.5 adds the exact nested `authoritative_ability_resources_teleport_v1` seam. It exposes authority-owned loadout, equip, ammo, grenade, teleport cooldown, and lock state while leaving the accepted `phase3_hypothesis_v1@1` movement system as the sole teleport destination resolver. Success consumes the existing 160-tick cooldown; blocked/forged outcomes do not. Root independently reran both focused suites at 12/12. Worker/wire delivery, presentation, real Inkfall runtime proof, and P5.6 onward remain open.

P5.6 adds an opt-in 20 Hz authoritative TDM lifecycle, team/player score rows,
result, and ordered kill feed derived only from the accepted life ledger. Its
initial focused suites passed 14/14, but an independent audit correctly failed
the slice because an empty active room could become `idle/expired` while its
match remained `active`, and score/result sorting used locale-sensitive
`localeCompare`. The correction keeps the finite exact match authoritative
through warmup/active/postmatch even with zero players, rejects early expiry,
guards all idle/expired transitions, and uses explicit ordinal stable-ID order.
Corrected suites pass 16/16, a fresh independent re-audit passes, app/Worker
typechecks and focused lint pass, and the adjacent Worker suite passes 15/15.
P5.7 correction is active after an independent audit failure; G4 remains open.

P5.7's first client-only presentation adapter hydrates authoritative snapshots,
reconciles predicted rifle/grenade/teleport cues, projects authoritative HUD/
feed/projectile/teleport views, and exposes reduced-flash and non-audio marker
alternatives. Its focused tests pass 9/9 and the current full default suite
passes 579/579, but a fresh independent audit correctly rejected the slice.
The adapter retained only room/match identity instead of validating the full
simulation/content identity; reconnect frames could replay same-tick reload,
collision, detonation, impulse, and teleport effects; its public source states
did not distinguish accepted/rejected from confirmed/cancelled; and it omitted
reduced-motion animation/VFX alternatives. Correction and strict regression
tests are active. No rendered HUD/audio/VFX or live Worker/wire claim is made.

## Inkfall Foundry state

The immutable P6.1 hypothesis is a 72 m × 56 m × 15 m arena with nine zones, 19 nodes, 27 links, 12 spawn candidates, three strong-position hypotheses, four sight probes, and 12 route hypotheses.

P6.2/P6.3 preserve the Blender source and distinct render/collision GLBs, enforce the bounded GLB/role/basis/package contract, and build the authority fixture from collision geometry only. The current saved package contains 346 render nodes, 346 authority boxes, two authority volumes, 348 total colliders, and fixture hash `2a0a446a0b152395`.

P6.4 closes deterministic all-enemy spawn scoring and named-collider LOS across saved 2/4/8/no-safe fixtures. The package digest remains `a593ad82b2e9f713a4a8d775002c1583c0fb3dfd3acdf004ba7bd6b144173267`.

P6.5 closes the bounded authority-telemetry slice. Its 18-event fixture covers ten event families, both LOS outcomes, ordinary/teleport/drop routes, spawn choice/result/no-safe, damage/death, objective pressure, recovery/kill volumes, and 2/4/8 occupancy. The fixture SHA-256 is `4fd1d58657a9bb79bf3818a639a0bae527cdbab1571545fa5ee1137152bd3e8c`; deterministic snapshot hash is `264136593a919c7f`. Exact positions and durable identity are not retained.

P6.5 passed 9/9 focused tests and root independently reran them. Its Chromium capture loads both GLBs with zero console/page/request/HTTP/external errors, visibly renders the heat/spawn/LOS overlay, and labels P6.6/P6.7/G5/human acceptance open. Screenshot SHA-256 is `875369f28f37f15323e6ef8446fabfd38fdf1c2bd4c91de42574a9927d9895bc`. Explicit production builds exclude the development map route/evidence surface and telemetry fixture identity.

P6.6 deterministic synthetic 2/4/8-player authority tapes are implemented and verified as a partial result: 2-player PASS, 4-player PASS, and 8-player FAIL, suite hash `cec7553cd9d45701`. The final immutable evidence preserves west Archive depenetration/snags, an east 650 mm terminal rise against the 350 mm step limit, and a blocked/unsupported fixed-9 m teleport route. Root independently reran the focused suite at 8/8 and recomputed all 12 verification hashes with zero mismatches. No map package mutation has occurred. `P6_6A_BOUNDED_COLLISION_CORRECTION_APPROVAL.md` authorizes only the measured revision-2 ramp, terminal support, and local teleport corridor/landing corrections with full P6.2–P6.6 regression. These tapes remain non-human and cannot replace the required human fun/readability review. P6.7 graybox lock, representative final art, product/Worker telemetry wiring, performance, and G5 acceptance remain open.

The bounded revision-2 correction lane is now active under that approval. Revision 1 and all earlier evidence remain immutable; no topology, spawn, timing, render, or final-art changes are authorized in this pass.

Attempt 9 is now frozen as non-default native `inkfall_foundry@2`. Its P6.2
revision-2 sweep passes 15/15, native P6.3–P6.5 regression passes 44/44, and
the authority suite passes 143/143. P6.6 still fails on the 5,100 ms
`ink_teleport_flank` route and three analytical retained-agent overlaps. An
independent audit found a versioned authored idle-egress tape that removes all
three overlaps in a read-only simulation, but no timing correction yet closes
the pinned band without a downstream defect. Neither change is authorized by
P6.6A; a narrower P6.6B addendum is required before implementation.

## Character state

The user rejection remains authoritative for all current runtime characters. v2–v5b remain non-shippable because of tube/mannequin anatomy, primitive shell armor, weak hands/boots, block-built rifles, and non-credible weapon contact.

The official CC0 Human Base Mesh seed was sanitized and preserved. V6-A exists as `kyx_vanguard_v6a_anatomy_sculpt_working.blend` (SHA-256 `074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d`). Direct front/side/back/three-quarter and 5/20/40 m silhouette boards show a continuous human rather than the rejected block mannequin. The user explicitly **accepted V6-A** and authorized autonomous continuation.

V6-B construction has begun from the pinned accepted anatomy. Attempt 1 technically created separate pieces but visually regressed into cylindrical garment cages, oversized primitive-read armor, slab boots, an egg helmet, and block-built contact; it was rejected and preserved under `evidence/v6b-failures/attempt-1-blocky-construction/`. Attempt 2 retained the human anatomy but left flat disconnected panels and was also rejected. Attempt-3 rev2 changed to body-surface-derived shells and improved anatomical fit, but direct root review still rejected the oversized flat mantle, awkward face shield, simple slab limb patches, exposed-toe/separate-tread boot construction, and block-built standalone rifle. It is preserved as WIP/failure evidence; a distinct next revision is active and no V6-B/G6 acceptance is claimed.

The distinct V6-C lane has reached rev4. It replaces the earlier chest shards,
shoulder knobs, exposed feet, and slab rifle with cleaner layered forms, measured
boots, a higher helmet crown, and a shorter continuous-loft rifle. Rev4 removes
the rev3 chest-cup read and adds darker layered guards, but the front/back limbs
still read as isolated capsules, the helmet rear remains orb-like, and the boots
and rifle are too smooth. Rev4 remains an in-progress benchmark, not V6-C or G6.

G6 still requires project retopology/UVs, materials, runtime skeleton/weights, first-person arms, Auto Rifle world/viewmodel, LODs, complete clips/markers, validated GLBs/manifests/provenance, literal two-hand contact, in-engine 5/20/40 m and accessibility boards, 2/4/8-player performance, and explicit human acceptance.

## Ordered remainder

1. Complete the remaining real slow-client/backpressure, external staging recovery, public-auth, load/resource/cost, physical-refresh, and product-flow G3 boundaries; then run the source-frozen final adjacent regression while preserving all earlier captures.
2. Correct and re-audit the four P5.7 defects, then P5.8–P5.9 through Worker/wire abuse coverage, rendered consumers, two-browser authoritative combat proof, and the broader P5.1–P5.7 determinism audit.
3. Approve and execute the bounded P6.6B tape/posture correction without weakening the pinned timing/overlap gates; then lock P6.7, complete a representative final-art room, and obtain G5 human acceptance.
4. Continue V6-C until the armor and weapon read as integrated authored forms, then complete retopology, rig/LOD/animation/runtime integration and G6 human acceptance.
5. Complete G7 HUD/accessibility, G8 performance/soak, G9 security/legal/staging readiness, the expanded gameplay catalog, bots/progression/cosmetics decisions, packaging, and full G0–G9 release regression.
6. Keep production deployment on hold until the user explicitly authorizes it.
