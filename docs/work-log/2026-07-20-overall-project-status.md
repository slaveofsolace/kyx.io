# KYX.IO overall project status — 2026-07-20

- Baseline commit: `81aa1d02acce8e30ba411bb895901d2d2ac6694e`
- Worktree policy: active user/agent changes are intentionally preserved; no reset, clean, stash, commit, or deployment was performed.
- Gate decision in this document: **none**. This is a current-state checkpoint, not acceptance evidence.

## What loads and plays now

Running `npm run dev` opens a truthful local-build menu. `START OFFLINE PRACTICE` launches **Iron Bastion** with one local player, seven local bots, the existing HUD, weapons, abilities, timer, score, and local gameplay loop. This is the currently usable prototype path.

That path is not the finished revamp:

- `ONLINE MATCH — NOT AVAILABLE` remains disabled in the visible menu;
- Offline Practice still represents the legacy/local gameplay integration, not the new Durable Object authority path;
- the accepted Phase 3 movement stack is available through its development bridge and evidence fixtures, but is not yet the default complete game controller;
- the intended original map, Inkfall Foundry, is not loaded by the game;
- current runtime player/bot art remains visually rejected as too blocky/shape-built;
- local combat content is playable, but authoritative Phase 5 combat has not been implemented.

The local authority can be run separately with `npm run dev:authority`. It now supports a real protocol-v2 room and movement flow, but the visible game client is not yet connected to it.

## Gate board

| Gate / phase | State | Evidence boundary |
|---|---|---|
| G0–G2 / Phases 0–3 | **Accepted / sealed** | Repository preservation, truth surfaces, architecture boundary, deterministic 20 Hz movement/collision, and the accepted Phase 3 replay hash are sealed. |
| G3 / Phase 4 authority | **In progress** | Protocol v2, immutable simulation identity, Worker/Durable Object authority, secure resume rotation, prediction/interpolation cores, and one nominal two-browser local smoke are implemented. Fault-matrix and visible-client proof remain. |
| G4 / Phase 5 combat | **Not started** | Existing Offline Practice combat is not authoritative G4 combat. |
| G5 / Phase 6 map | **P6.1 prework only** | Inkfall Foundry topology, callouts, route hypotheses, spawns, and sizing seed exist; no runtime graybox/collider/map package or playtest exists. |
| G6 / Phase 7 art | **Candidate prework only** | Blender export/verification lanes exist, but current candidates are not human-approved or integrated. |
| G7+ / HUD, finish, expansion, release | **Not started as gated production** | A static HUD audit exists; integrated redesign, accessibility, audio, optimization, soak, release QA, and deployment remain. |

## Phase 4 implementation state

Implemented and locally verified:

- protocol v2 with strict schemas and immutable map/ruleset/profile/fixture/physics identity;
- fixed 20 Hz authoritative room simulation with trusted server spawns and bounded sequenced input queues;
- 10 Hz full snapshots with exact local reconciliation state and input acknowledgements;
- opaque digest-only 43-character resume credentials, atomic rotation, replay rejection, duplicate-session rejection, and a 10-second disconnect grace window;
- local prediction restore/drop/replay and bounded history;
- remote tick interpolation, out-of-order/duplicate handling, bounded extrapolation, and stale/discontinuity policies;
- fail-closed active-room restart when no authoritative checkpoint exists;
- local two-browser join/move/peer-observation/disconnect/resume/continued-movement smoke, including forged `SetPosition` rejection.

The sealed nominal smoke is under `evidence/2026-07-20/phase-4-authority-local-smoke/`. It is explicitly not G3.

Still required for G3:

1. connect the protocol-v2 transport, prediction, reconciliation, and interpolation cores to a visible two-client authority route;
2. run deterministic latency, jitter, loss, duplication, and reorder profiles;
3. publish reconciliation-error distributions, interpolation/extrapolation behavior, queue/room/client timing, and bounded-threshold results;
4. capture repeatable two-browser screenshots/video/raw logs and a verified evidence manifest;
5. close remaining transport/runtime gaps such as full resync policy, heartbeat/load behavior, and any gate-required WSS/staging evidence;
6. make an explicit G3 review decision. No later gate is implicitly accepted by this work.

## Inkfall Foundry map state

The original-map seed is complete enough to begin grayboxing when gate order allows it:

- 72 m × 56 m × 15 m planned envelope;
- three connected route families: Press Hall, Ink Channel, and Archive Walk;
- nine named navigation zones/callouts;
- 19 topology nodes and 27 links;
- 12 spawn candidates;
- three strong-position hypotheses with at least three graph approaches;
- four sightline probes and 12 calculated route hypotheses;
- traversal sizing derived from the accepted Phase 3 movement profile;
- validated JSON seed and written graybox brief.

This is design arithmetic, not a playable map. P6.2–P6.7 still require the Blender graybox, separate authoritative collider package, loader/zones/spawns/volumes, spawn scoring and debug views, telemetry, 2/4/8-player playtests, topology revision, and graybox lock before beauty work.

## Current verification snapshot

The current Phase 4 implementation passed application, Worker, and simulation typechecks; full lint; 282 unit tests; 66 contract tests; four Worker-isolate tests; the production Vite build; and a Wrangler 4.112.0 dry run. Protocol v2 is 86/86, the client netcode set is 17/17, and the authority/security subset is 20/20. The accepted Phase 3 `flat_run_fixed_20hz_v1` replay recomputed twice at `66fcaf19c3fd94ad`, matching the sealed record.

These checks establish implementation health. They do not substitute for G3's visible impaired-network play evidence or for any later visual, map, combat, performance, accessibility, or release gate.

## Execution order from here

1. Finish and review G3 authoritative movement.
2. Implement and review G4 authoritative Auto Rifle plus one projectile/deployable ability slice.
3. Build, instrument, and playtest the Inkfall Foundry graybox for G5.
4. Approve an integrated character/weapon/environment benchmark, then produce the asset/animation/VFX lane for G6.
5. Complete HUD/UX/accessibility, audio, map finish, performance, full catalog expansion, soak/security/legal evidence, and only then consider an authorized deployment.
