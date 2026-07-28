# Work in progress

This manifest labels incomplete areas in the current Git snapshot without
appending prose to executable source files or binary assets.

## Active now

- `assets/source/blender/phase7-character-original-v6/`,
  `assets/source/blender/phase7-character-original-v6/model/v6c-character-rev17/`,
  `src/player/Rev17Character.js`, and the corresponding G6 evidence — replace
  the still-failed-open Rev17 anatomy, armor, materials, hands, and weapon
  contact with a substantive Rev18 correction pass. Rev17 is feature-gated and
  must not be promoted as the final player model.
  *Currently being worked on.*

- `src/weapons/WeaponSystem.js`, `src/player/Rev17Character.js`, and the
  first-person melee viewmodel — reproduce and remove the extra legacy mesh
  shown over the sword without regressing the rifle viewmodel or third-person
  hand socket. *Currently being worked on.*

- `worker/`, `tests/worker/authorityFullOccupancySoak.test.ts`, and the
  multiplayer evidence harness — the local eight-client movement/combat/resume
  run is green on the integrated tree; authenticated production staging,
  external capacity evidence, and full 3D online presentation remain open.
  *Currently being worked on.*

- `assets/source/maps/inkfall-foundry/` and the product map route — complete
  authoritative traversal, no-snag/embed/escape proof, counterplay telemetry,
  and human 2/4/8-player play review. The Rev3 review candidate and exact
  west-archive rounding regression are present, but the human product gate is
  still open. *Currently being worked on.*

- `docs/audits/NOTHEREBUTAFK_EVIO_AUDIT_2026-07-27.md` records the completed
  targeted audit through upstream `436da5b`. Its first bounded adoption
  candidate is part of the active sword/viewmodel correction; the shared
  local/remote character renderer and Inkfall visual-language references remain
  future adaptation work. Upstream push remains disabled.

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
- Application Vitest regression on integrated `f3b89d7`: PASS, 768/768.
- Cloudflare Worker regression excluding the dedicated soak: PASS, 43/43.
- Integrated eight-client authority soak: PASS, 1/1; 20.009 Hz, authority tick
  p99 25 ms / max 36 ms, 8/8 combat convergence, resume preserved, and zero
  rate rejects, backpressure episodes, evictions, tick failures, or decode
  errors.
- Rev17 Blender/export/Khronos and bounded runtime checks: technically green;
  direct character visual review: FAILED/OPEN.
- Cloudflare deployment: PAUSED. The rejected G7 presentation and incomplete
  product gates must not be published as the replacement build.

Last refreshed: 2026-07-27.
