# KYX.IO strict goal completion contract — 2026-07-20

This checkpoint translates the governing handoff and active goal into a completion audit. It makes **no new gate decision**. A row is complete only when its named current-state evidence proves the whole requirement; source presence, a passing narrow test, a design document, or an unreviewed render is not enough.

## Final outcome

The repository must yield one cohesive, polished, desktop-browser arena FPS release candidate that a reviewer can load and play. It must preserve the accepted G0–G2 baseline while completing authoritative online movement and combat, Inkfall Foundry, a production-quality hero/weapon/animation pipeline, final HUD/accessibility/audio/VFX, performance/soak, security/legal/staging readiness, and regression-proof packaging. Production deployment remains outside authorization.

## Current playable truth

- `npm run dev` currently exposes a truthful menu.
- `START OFFLINE PRACTICE` launches the legacy/local Iron Bastion loop with one player, seven bots, weapons, abilities, HUD, timer, and score.
- `ONLINE MATCH — NOT AVAILABLE` remains disabled in the product menu.
- The protocol-v2 authority path is currently a separate development evidence route, not the complete visible game.
- Inkfall Foundry is not loaded by the game.
- Current runtime characters are visually rejected as blocky/shape-built.
- Existing local combat is not authoritative G4 combat.

## Gate completion matrix

| Gate | Current state | Evidence that exists | Evidence still required before pass |
|---|---|---|---|
| G0 — repository integrity | **Accepted baseline; release rerun required** | Preserved dirty-tree inventory, pinned toolchain, baseline/check evidence, ADR/work logs | Fresh clean-install-equivalent, typecheck, lint, complete tests, build, selected browser run, secret scan, and implementation-matched ADR/work log at release candidate revision |
| G1 — truthful/safe shell | **Accepted / sealed** | Guest/offline truth surfaces, ads/external containment, local progression boundary, first-party browser checks | Re-run adjacent regression after final menu/auth/network integration |
| G2 — deterministic movement | **Accepted / sealed** | Fixed 20 Hz fixtures/tapes, stable canonical replay hash `66fcaf19c3fd94ad`, movement profile hash `8ab4ed437a4393c0`, camera/simulation separation | Preserve hashes or explicitly version/re-accept intentional movement changes; re-run on the real map and final client |
| G3 — authoritative two-browser movement | **In progress; not passed** | Protocol v2, immutable identity, Durable Object fixed-step authority, intent-only inputs, resume rotation/replay rejection, prediction/reconciliation, remote interpolation, real Worker socket integration, nominal two-browser development route, deterministic impairment core | Reproducible visible two-browser matrix proving same room/match, input-independent tick, forged transform rejection, bounded reconciliation, interpolation under specified RTT/jitter/loss/duplication/reordering and render-rate points, join/leave/late join/reconnect/full-state recovery, browser/room health, and independently verified evidence manifest |
| G4 — authoritative combat/ability | **Not started** | Legacy Offline Practice weapons/abilities only; movement snapshots contain non-combat placeholders | Server-owned life/shield/health, Auto Rifle, one projectile/deployable ability, ammo/cooldown/origin/hit/damage/death/respawn/timer/score, rewind policy, abuse/loss/reorder proof, confirmed HUD/VFX/audio, and two-browser latency capture |
| G5 — real original map | **P6.1 complete as prework; P6.2 active; gate open** | Inkfall Foundry topology/callouts/route hypotheses/layout seed; deterministic Blender graybox/collider lane in production | Independently loadable render and separate authoritative collision packages, map schema/loader, zones/spawns/pickups/kill/recovery volumes, spawn scoring/debug, measured routes/sightlines, no snag/embed/escape, counterplay for every strong position, 2/4/8 playtests and revisions, locked graybox, plus one representative final-art room |
| G6 — hero art/animation benchmark | **Concept/candidate prework; current runtime and v2/v3 candidates rejected** | Rejected benchmark history, reproducible Blender experiments, valid v3 export, new original model-sheet reference | Human-approved concept; authored non-generator-looking LOD0–2 character; canonical skeleton/rig/retarget/sockets; dedicated first-person arms; authored Auto Rifle world/viewmodel; full required first/third-person clip matrix and markers; cel/PBR/outline pipeline; valid glTF/manifests/provenance; deformation/contact/clipping review; close/mid/far, grayscale, quality/color-vision captures; 2/4/8 performance |
| G7 — HUD/accessibility | **Not passed** | Truthful shell and existing legacy HUD provide a behavioral baseline | Authored manga-print design tokens/icon family, final HUD/crosshair/settings/loadout flow, keyboard focus and pointer-lock recovery, HUD scale/high contrast/color-safe cues, reduced motion/camera/flash, audio accessibility, all target resolutions/zoom, browser/manual evidence, and removal of superseded generic UI |
| G8 — performance/soak | **Not started as a release gate** | Narrow build/test metrics and some deterministic counters | Named hardware/browser tiers, frame p95/p99, Worker tick/CPU/memory/storage/bandwidth/cost inputs, hitch/long-task report, 30-minute client/room soak with no material growth, payload/cache budgets, entity/effect caps, LOD/culling/instancing/pooling/shader warmup, and post-art adjacent-gate regression |
| G9 — security/legal/deployment readiness | **Partial controls; gate open** | Worker schema/size/rate/origin/replay/session controls and selected abuse tests; donor reuse boundary documented | Complete WebSocket threat/slow-client/abuse suite, public auth policy, staging CSP/security headers, complete asset/source/license/provenance ledger, originality/trademark review, staging and rollback drill, completion certificate, and explicit production authorization or documented hold |

## Ordered implementation remainder

1. Close Phase 4/G3 without weakening the accepted movement identity.
2. Implement and prove Phase 5/G4 authoritative combat and one ability.
3. Integrate, instrument, playtest, and lock the Inkfall Foundry graybox for the graybox portion of G5.
4. Approve one integrated hero/Auto Rifle/animation/material benchmark and representative finished room before any mass asset production.
5. Complete the authored HUD/UX/accessibility strike and close G7.
6. Finish and optimize Inkfall Foundry, then close full G5 and G8 with post-art regression.
7. Expand the complete gameplay catalog through the same data/authority/evidence contracts; do not create parallel legacy systems.
8. Finish honest bots, progression/cosmetics boundaries, and complete offline/online flows.
9. Run Phase 12 release hardening, full G0–G9 audit, completion certificate, staging and rollback evidence; leave production awaiting explicit authorization.

## Character visual rejection boundary

The latest v3 Blender render is a useful anatomical step but remains rejected. It still reads as a procedural mannequin because limbs are tube-like, torso plates appear attached rather than constructed, helmet/boots/pelvis are simplified primitive forms, and the rifle is visibly box-assembled. A valid GLB does not override that review. The new model sheet at `assets/source/characters/kyx-vanguard/concept/kyx-vanguard-model-sheet-v1.png` is a modeling target only and does not pass P7.1 or G6.

## Map truth boundary

The Inkfall Foundry design seed establishes a 72 m × 56 m × 15 m hypothesis, nine named zones, graph topology, spawn candidates, strong-position counters, sightline probes, and route hypotheses. None of those design facts proves that the arena loads, collides, plays well, avoids spawn traps, supports every movement tool, or meets performance. Those claims require runtime packages and measured playtests.

## Acceptance policy

- Keep every accepted gate evidence directory immutable; version intentional contract changes.
- Preserve failing artifacts and exact reproduction steps.
- Do not infer visual quality from triangle counts, mesh counts, a successful export, or an automated manifest.
- Do not infer broad runtime completion from unit tests or a development-only route.
- Human review remains mandatory where the handoff names visual or playtest acceptance.
- No deployment, publication, paid-service mutation, destructive migration, reset, clean, stash, or unrelated overwrite is authorized by this contract.
