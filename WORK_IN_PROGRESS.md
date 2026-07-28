# Work in progress

This manifest labels incomplete areas in the current Git snapshot without
appending prose to executable source files or binary assets.

## Active now

- `public/candidates/g6-rev30-cc0-donor/` is the visually accepted character
  asset direction: a cohesive charcoal/gunmetal cyber-suit adapted from
  Irondust's CC0 Sci-fi Soldier donor, with broad visor, fitted gloves,
  continuous knee/shin construction, grounded boots, and the unchanged Rev17
  66-bone / 16-action / weapon-socket contract. The source, provenance notice,
  reproducible Blender exporter, exact-reimport report, and four review renders
  are committed. Runtime selection, shared low-poly loading, final weapon
  attachment, and live animation review are still being integrated.
  *Currently being worked on.*

- `src/app/weaponPresentationRuntime.ts` and the project-authored weapon model
  catalog now provide distinct rifle, sidearm, scattergun, sniper, rocket, and
  phase-saber presentation with authored muzzle/blade-tip nodes, event-driven
  muzzle flash, pellet/tracer/impact effects, rocket backblast/trail/detonation,
  reload motion, and synthesized audio. Third-person socket/contact integration
  with the accepted Rev30 character remains active.
  *Currently being worked on.*

- `worker/`, `tests/worker/authorityFullOccupancySoak.test.ts`, and the
  multiplayer evidence harness — the local eight-client movement/combat/resume
  run was green on the prior integrated snapshot; authenticated production
  staging, external capacity evidence, and the final source-frozen rerun remain
  open.
  *Currently being worked on.*

- `assets/source/maps/inkfall-foundry/` and the product map route — complete
  Rev4 art, exact Rev3 authority binding, 339 colliders, 12 spawns, 9 zones,
  server-owned distance/occluded-LOS spawn selection, and render-only foundry
  continuity are integrated. Technical 2/4/8 occupancy evidence exists; human
  fun, sightline, spawn-safety, and final visual acceptance remain open.
  *Currently being worked on.*

- `docs/audits/NOTHEREBUTAFK_EVIO_AUDIT_2026-07-27.md` records the completed
  targeted audit through upstream `92b9716`. The useful ideas are routed as
  independently implemented validation or visual-language references; no
  upstream source, assets, spawn coordinates, or network implementation have
  been merged. Upstream push remains disabled.

- `src/ui/g7-arena-instrument.css` replaces the rejected card-heavy HUD with a
  compact edge-anchored arena instrument: cyan suit/team telemetry, amber
  actions/warnings, integrated timer/objective rails, compact abilities, and a
  bottom-left command-bay menu. Final responsive/accessibility capture and
  human acceptance are still open. *Currently being worked on.*

## Open release work

- G3: authenticated staging, external capacity/resource evidence, the final
  source-frozen regression matrix, and manual acceptance.
  *Currently being worked on.*

- G4: the bounded local eight-client authority soak is integrated and green;
  production staging and the complete 3D online product path remain open.
  *Currently being worked on.*

- G5: the Rev4 technical integration candidate is present, but it is not yet a
  human-accepted final map.
  *Currently being worked on.*

- G6: Rev30 model art is accepted for integration; runtime default selection,
  directional/aim animation polish, final weapon contact, online 3D avatar
  integration, and live visual review remain open.
  *Currently being worked on.*

- G7: the replacement arena-instrument source is integrated. Final capture,
  responsive/accessibility review, and human acceptance remain open.
  *Currently being worked on.*

- G8: restart resources remain stable in the bounded five-restart proof and the
  capture cadence is repaired; a fresh qualifying 30-minute soak on the final
  integrated visual build is still required. *Currently being worked on.*

- G9: security/readiness controls are integrated; public license selection and
  missing provenance evidence for six legacy assets still block release.
  *Currently being worked on.*

## Validation cadence

- Broad regression is intentionally deferred until the current model,
  animation/contact, HUD/UI, and runtime-integration batch is assembled.
- Previously captured authority, reconnect, performance, and release evidence
  remains historical support only; it does not validate the new integrated
  source.
- The Rev30 Blender export has passed exact GLB reimport with 66 bones,
  16 actions, zero donor Cannon geometry, and socket/nozzle matrix delta below
  `7e-7`. Root visual review accepted the four asset renders.
- One local menu/HUD capture of Arena Instrument v3 loaded without browser
  console/page errors; final multi-size/accessibility capture is still pending.
- Cloudflare deployment is paused until the major-change batch is integrated and
  the single consolidated validation pass completes.

Last refreshed: 2026-07-28 during the canonical major-change integration batch.
