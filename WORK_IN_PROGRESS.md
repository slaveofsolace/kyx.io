# Work in progress

This manifest labels incomplete areas in the current Git snapshot without
appending prose to executable source files or binary assets.

## Active now

- `assets/source/blender/phase7-character-original-v6/`,
  `assets/source/blender/phase7-character-original-v6/model/v6c-lod0-retopo-rev14/`,
  and its evidence folder — correct the visually failed-open Rev14 weapon
  contact, animation readability, and unfinished materials; then build LOD1/2,
  first-person arms, runtime integration, and occupancy performance evidence.
  *Currently being worked on.*

- `src/dev/authorityEvidenceClient.ts`, `worker/`, and the P5.15 multiplayer
  evidence harness — seal authenticated staging plus one clean, source-frozen
  2/4/8-client authoritative run after the collision correction and lobby
  reliable-event checkpoint work. *Currently being worked on.*

- `assets/source/maps/inkfall-foundry/` and the product map route — complete
  authoritative traversal, no-snag/embed/escape proof, counterplay telemetry,
  and human 2/4/8-player play review. The exact west-archive rounding regression
  is repaired and green. *Currently being worked on.*

- `public/_headers`, `wrangler.jsonc`, and
  `evidence/2026-07-25/cloudflare-release-readiness-v1/` — complete the
  authenticated full-asset Cloudflare deployment, bind the assigned HTTPS
  origin into the browser build and CORS allowlist, then capture production
  HTTP/WebSocket and rollback evidence. *Currently being worked on.*

## Open release work

- G3 authenticated staging, external capacity/resource evidence, the final
  source-frozen regression matrix, and manual acceptance.
  *Currently being worked on.*

- G4-G7 integrated gameplay, full map traversal, production character LODs and
  first-person arms, HUD/UX, audio/VFX, and accessibility acceptance.
  *Currently being worked on.*

- G8 performance/soak/package validation and G9 final release audit, repository
  provenance, public licensing, and release documentation.
  *Currently being worked on.*

## Snapshot validation

- Vite production build: PASS.
- Cloudflare Worker TypeScript check: PASS.
- Main and simulation TypeScript checks: PASS.
- ESLint across client, Worker, tests, and tools: PASS.
- Exact west-archive collision regression: PASS, 5/5.
- Adjacent physics/movement/Inkfall matrix: PASS, 109/109.
- Cloudflare Worker suite after lobby reliability persistence: PASS, 41/41.
- Rev14 official Khronos glTF validation: 0 errors, with three non-root skinned
  mesh warnings retained for product-integration review.

Last refreshed: 2026-07-25.
