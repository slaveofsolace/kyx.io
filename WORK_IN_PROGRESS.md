# Work in progress

This manifest labels incomplete areas in the current Git snapshot without
appending prose to executable source files or binary assets.

## Active now

- `assets/source/blender/phase7-character-original-v6/model/v6c-character-rev18/`
  and `evidence/2026-07-27/g6-rev18-character-remediation/` preserve the latest
  rejected character candidate on public `main`. Rev19 is active in the
  isolated `codex/g6-rev19-true-remodel-20260727` lane and is not part of the
  public snapshot yet. Its first exact-GLB attempt preserved the technical
  contracts but was immediately rejected for block-built armor, dome-backed
  helmet construction, tube anatomy, disconnected fingers, weak weapon contact,
  and a primitive rifle. Rev17 remains the opt-in runtime path; no revision is
  the final player model.
  *Currently being worked on.*

- `src/weapons/WeaponSystem.js` now explicitly hides the invalid 15-primitive
  legacy blockout arm whenever the sword is active, while preserving both
  default and Rev17 rifle paths. The correction and before/after evidence are
  published on `main`. Authored first-person melee arms, a closed grip, and the
  final melee animation/contact pass remain G6 work.
  *Currently being worked on.*

- `worker/`, `tests/worker/authorityFullOccupancySoak.test.ts`, and the
  multiplayer evidence harness — the local eight-client movement/combat/resume
  run is green on the integrated tree; authenticated production staging,
  external capacity evidence, and full 3D online presentation remain open.
  *Currently being worked on.*

- `assets/source/maps/inkfall-foundry/` and the product map route — complete
  authoritative traversal, no-snag/embed/escape proof, counterplay telemetry,
  and human 2/4/8-player play review. The Rev3 review candidate and exact
  west-archive rounding regression are present. A bounded, non-default Rev4
  authored-art expansion is active in an isolated lane, but the human product
  gate is still open. *Currently being worked on.*

- `docs/audits/NOTHEREBUTAFK_EVIO_AUDIT_2026-07-27.md` records the completed
  targeted audit through upstream `92b9716`. The useful ideas are routed as
  independently implemented validation or visual-language references; no
  upstream source, assets, spawn coordinates, or network implementation have
  been merged. Upstream push remains disabled.

- The rejected G7 HUD remains unchanged on the default path. An opt-in
  Foundry Tactical replacement is active in an isolated lane using a dense,
  hard-edged industrial instrument language rather than generic glass panels
  or ornamental glow. *Currently being worked on.*

## Open release work

- G3: authenticated staging, external capacity/resource evidence, the final
  source-frozen regression matrix, and manual acceptance.
  *Currently being worked on.*

- G4: the bounded local eight-client authority soak is integrated and green;
  production staging and the complete 3D online product path remain open.
  *Currently being worked on.*

- G5: Inkfall Rev3 is a review candidate, not a human-accepted final map.
  *Currently being worked on.*

- G6: movement/socket and semantic-action contracts are integrated; final
  model quality, authored equip/melee/ability clips, close-contact review,
  hidden-view action clocks, and online 3D avatar integration remain open.
  *Currently being worked on.*

- G7: the current HUD/UI has been rejected and will not be deployed. A
  replacement visual direction and full UX/accessibility acceptance remain
  open. *Currently being worked on.*

- G8: restart resources remain stable in the bounded five-restart proof and the
  capture cadence is repaired; a fresh qualifying 30-minute soak on the final
  integrated visual build is still required. *Currently being worked on.*

- G9: security/readiness controls are integrated; public license selection and
  missing provenance evidence for six legacy assets still block release.
  *Currently being worked on.*

## Snapshot validation

- Vite production build: PASS.
- Main and Cloudflare Worker TypeScript checks: PASS.
- ESLint across client, Worker, tests, and tools: PASS.
- Application Vitest regression on the integrated melee correction: PASS,
  772/772.
- Cloudflare Worker regression excluding the dedicated soak: PASS, 43/43.
- Integrated eight-client authority soak: PASS, 1/1; 20.009 Hz, authority tick
  p99 25 ms / max 36 ms, 8/8 combat convergence, resume preserved, and zero
  rate rejects, backpressure episodes, evictions, tick failures, or decode
  errors.
- Rev17 Blender/export/Khronos and bounded runtime checks: technically green;
  direct character visual review: FAILED/OPEN.
- Rev18 isolated Blender/export evidence: five exact GLBs with zero Khronos
  errors, 67 bones, 17 actions, and a 0.020736 m sampled melee contact bound;
  direct character visual review: IMPROVED BUT FAILED/OPEN, not runtime/default.
- Rev19 attempt 1 isolated Blender/export evidence: exact 24,012-triangle LOD0,
  67 bones, 15 sockets, and 17 actions; direct character visual review:
  FAILED/ITERATING, not committed, runtime, default, or G6 accepted.
- Cloudflare deployment: PAUSED. The rejected G7 presentation and incomplete
  product gates must not be published as the replacement build.

Last refreshed: 2026-07-27 at canonical `c213def`.
