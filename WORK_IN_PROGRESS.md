# Work in progress

This manifest labels incomplete areas in the current Git snapshot without
appending prose to executable source files or binary assets.

## Active now

- `assets/source/maps/inkfall-foundry/` and
  `tests/integration/movement/inkfallCanonicalTraversalSnag.test.ts` — isolate
  and repair the deterministic west archive collision/depenetration defect,
  publish a new immutable collision revision, and prove zero recovery.
  *Currently being worked on.*

- `assets/source/blender/phase7-character-original-v6/scripts/author_export_v6c_lod0_retopo_rev14.py`,
  `assets/source/blender/phase7-character-original-v6/model/v6c-lod0-retopo-rev14/`,
  and its evidence folder — finish the fresh export/reimport/runtime audit for
  the 42k-triangle, three-primitive Rev14 character LOD0 candidate.
  *Currently being worked on.*

- `src/ui/HUD.js`, `src/ui/MainMenu.js`, `src/style.css`, and supporting UI
  modules — consolidate the in-game HUD and menus into the current KYX.IO
  industrial tactical visual language, including responsive and accessibility
  behavior. *Currently being worked on.*

- `src/dev/authorityEvidenceClient.ts`, `worker/`, and the P5.15 multiplayer
  evidence harness — seal one clean 2/4/8-client authoritative run after the map
  correction. *Currently being worked on.*

- `public/_headers`, `wrangler.jsonc`, and
  `evidence/2026-07-25/cloudflare-release-readiness-v1/` — complete the
  authenticated full-asset Cloudflare deployment, bind the assigned HTTPS
  origin into the browser build and CORS allowlist, then capture production
  HTTP/WebSocket and rollback evidence. *Currently being worked on.*

## Open release work

- G3 lobby reliable-event durability, external capacity/slow-consumer evidence,
  the full regression matrix, and manual acceptance. *Currently being worked on.*

- G4-G7 integrated gameplay, full map traversal, production character LODs and
  first-person arms, HUD/UX, audio/VFX, and accessibility acceptance.
  *Currently being worked on.*

- G8 performance/soak/package validation and G9 final release audit, repository
  provenance, public licensing, and release documentation.
  *Currently being worked on.*

## Snapshot validation

- Vite production build: PASS.
- Cloudflare Worker TypeScript check: PASS.
- ESLint across client, Worker, tests, and tools: PASS.
- Main TypeScript check: NOT CLEAN — 12 diagnostics are localized to the
  unfinished exact-pose collision probe in
  `tests/integration/movement/inkfallCanonicalTraversalSnag.test.ts`. The probe
  is intentionally committed for continuity and must be made type-clean when
  the immutable repair candidate is locked. *Currently being worked on.*

Last refreshed: 2026-07-25.
