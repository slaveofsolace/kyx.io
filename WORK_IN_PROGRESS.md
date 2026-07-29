# Work in progress

This manifest labels incomplete areas in the current Git snapshot without
appending prose to executable source files or binary assets.

## Active now

- The complete KYX/evio project family was migrated from
  `C:\AI Projects\Projects\Games\evio` to
  `E:\AI Projects\Projects\Games\evio` on 2026-07-28. The move preserved all
  30 Git worktrees, branch/HEAD state, untracked Blender sources and runtime
  evidence, and rebuilt package junctions against E. C retains only empty
  directory stubs held open by the current Codex task; no duplicate project
  payload remains there, and no evio/KYX copy was found on D.

- `public/candidates/g6-rev30-cc0-donor/` remains the current runtime
  third-person player/enemy asset, but the project owner rejected Rev30 as the
  final visual direction on 2026-07-28. Its legal source, reproducible Blender
  exporter, 66-bone / 16-action / weapon-socket compatibility, and exact
  reimport evidence remain useful engineering foundations only. The active
  replacement keeps one coherent, simpler athletic armor body and introduces
  distinct rifle/assault, shotgun/breacher, sniper/recon, and melee/duelist
  helmet identities bound to preset weapon-and-ability loadouts. Rev17 remains
  the first-person viewmodel and explicit third-person fallback until the
  replacement variants are integrated and visually accepted.
  *Currently being worked on.*

- `src/weapons/KyxArmoryPresentation.ts`,
  `src/app/onlineAuthorityThreeRuntime.ts`, and
  `src/app/onlineWeaponPresentationFx.ts` provide distinct rifle, sidearm,
  scattergun, sniper, rocket, and phase-saber presentation with authored
  muzzle/blade-tip nodes, event-driven
  muzzle flash, pellet/tracer/impact effects, rocket backblast/trail/detonation,
  reload motion, and synthesized audio. Third-person weapons now replace the
  embedded diagnostic rifle, attach to the right-hand grip, drive the real
  muzzle/nozzle, and use bounded support-hand contact. Live review remains open.
  *Currently being worked on.*

- `worker/`, `tests/worker/authorityFullOccupancySoak.test.ts`, and the
  multiplayer evidence harness — the local eight-client movement/combat/resume
  run was green on the prior integrated snapshot; authenticated production
  staging, external capacity evidence, and the final source-frozen rerun remain
  open.
  *Currently being worked on.*

- `assets/source/maps/inkfall-foundry/` and the product map route — Rev5
  geometry cleanup and its 2.8 MB modular render package are integrated over
  the exact Rev3 authority binding with 339 colliders, 12 spawns, and 9 zones.
  The bridge/wall interpenetration and loose floating construction are removed.
  A paired cyan/amber portal now has fail-closed server traversal, safe
  destinations, cooldown protection, VFX, audio, and captions. Rev4's 2/4/8
  proof is historical; fresh Rev5 runtime/performance proof plus human fun,
  sightline, spawn-safety, and final visual acceptance remain open.
  *Currently being worked on.*

- `docs/audits/NOTHEREBUTAFK_EVIO_FOLLOWUP_2026-07-28.md` extends the completed
  read-only audit through upstream `8675cc8`, including its newly merged gait,
  action, viewmodel, and HUD commits. The useful ideas are routed as
  independently implemented validation or visual-language references; no
  upstream source, CSS, assets, constants, spawn coordinates, or network
  implementation have been merged. Upstream push remains disabled.

- `src/ui/kyx-match-instrument.css` and `src/app/onlineAuthorityRoute.ts` now
  place the online arena full-screen with edge-aligned health, ammo, weapon,
  ability, score, event-feed, and held-Tab roster overlays. Room controls and
  developer telemetry are isolated behind explicit drawers instead of occupying
  the player plane; the practice HUD received the same de-card treatment. Fresh
  1440x900 and narrow live captures are in
  `evidence/2026-07-28/g7-arena-visor-v1/`. This is a replacement candidate, not
  human-accepted G7, and menu/loadout convergence plus final accessibility
  review remain open. *Currently being worked on.*

- The browser/desktop build is now the product acceptance target. Mobile keeps
  its existing functional responsive fallback, but dedicated mobile layout,
  controls, and polish are deferred until the browser arena, role models,
  animations, weapons, abilities, and online match loop form a coherent
  playable game. *Currently being worked on.*

- `src/dev/authorityEvidenceClient.ts` now sends the protocol's bounded `ping`
  heartbeat while a joined client is waiting in the one-player lobby. Before
  this fix the Rev5 room loaded correctly but the Worker closed an otherwise
  idle socket after 30 seconds. The focused 12-test client regression and app
  typecheck pass, and the in-app browser remained `JOINED` beyond 36 seconds;
  the capture is
  `evidence/2026-07-28/inkfall-rev5-live-integration/06-online-rev5-lobby-heartbeat-36s.png`.

## Open release work

- G3: authenticated staging, external capacity/resource evidence, the final
  source-frozen regression matrix, and manual acceptance.
  *Currently being worked on.*

- G4: the bounded local eight-client authority soak is integrated and green;
  production staging and the complete 3D online product path remain open.
  *Currently being worked on.*

- G5: the Rev5 geometry/portal integration candidate is present over the frozen
  Rev3 authority package, but it is not yet a human-accepted final map and does
  not yet have source-frozen Rev5 2/4/8 performance proof.
  *Currently being worked on.*

- G6: Rev30 default loading, directional/aim/action presentation, and external
  weapon contact are integrated, but Rev30 is no longer the accepted art
  direction. Four loadout-driven helmet variants over a simpler coherent armor
  body, live online/offline animation/contact capture, performance evidence,
  and human visual-animation acceptance remain open.
  *Currently being worked on.*

- G7: the rejected card/dashboard HUD has been replaced locally by the
  arena-visor candidate with fresh live captures and a compact held-Tab roster.
  Loadout/menu integration, final online/practice convergence,
  responsive/accessibility review, and human acceptance remain open.
  *Currently being worked on.*

- G8: restart resources remain stable in the bounded five-restart proof and the
  capture cadence is repaired; a fresh qualifying 30-minute soak on the final
  integrated visual build is still required. *Currently being worked on.*

- G9: security/readiness controls are integrated; public license selection and
  missing provenance evidence for six legacy assets still block release.
  *Currently being worked on.*

## Validation cadence

- Major browser-game changes are being assembled before the next consolidated
  regression: role models and loadouts, distinct first-person weapons,
  destination-preview Blink, the arena-visor HUD, and Rev5 map/runtime
  integration. No earlier isolated sentinel is being promoted as proof of that
  future integrated source.
- Previously captured authority, reconnect, performance, and release evidence
  remains historical support only; it does not validate the new integrated
  source.
- The Rev30 Blender export passed exact GLB reimport with 66 bones, 16 actions,
  zero donor Cannon geometry, and socket/nozzle matrix delta below `7e-7`, but
  those engineering results do not override the later owner rejection of its
  visual direction.
- The consolidated pre-heartbeat app run passed 111 files / 831 tests; the
  Worker run passed 13 files / 49 tests, all app/Worker/simulation typechecks,
  lint, and both production and staging builds passed. The later lobby
  heartbeat patch passed its focused 12 tests plus app typecheck and live
  36-second socket check. These are engineering checks, not UI, map, model,
  animation, audio, or gameplay-feel acceptance.
- Cloudflare deployment is paused until the major-change batch is integrated and
  the single consolidated validation pass completes.

Last refreshed: 2026-07-28 during the canonical major-change integration batch.
