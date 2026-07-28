# G5 Inkfall Foundry Rev4 online visual-continuity candidate

## Isolation

- Base: canonical `685e8633fd24b456e3a86bac03f08486580615ce`
- Branch: `codex/inkfall-visual-continuity-20260728`
- Worktree:
  `C:\AI Projects\Projects\Games\evio\evio-inkfall-visual-continuity-20260728`
- No merge, push, or deployment was performed.

## Major presentation change

`src/app/inkfallRev4VisualContinuity.ts` is a project-authored,
procedural Three.js dressing module. It replaces the small inline spawn canopy
builder with one cohesive render-only foundry volume:

- continuous foundation bed, lower lattice, perimeter shell, segmented roof,
  wall ribs, ceiling trusses, and recessed visual decks;
- visible pier/brace understructure beneath the upper archive tier;
- cyan west and orange east spawn rooms with canopies, medallions, chevrons,
  exit frames, and bounded local lighting;
- a central press gantry, roller, and index wheel;
- paired Ink Channel vats, pipe rack, and cool route language;
- connected Archive Walk supports, shelving, paper bales, and warm bands;
- distinct Red Fold and Paper Drop crosslink landmarks;
- repeated material/light rhythm along long walls and sightlines; and
- the existing audited authority-aligned spawn cladding whitelist.

The live runtime hook is intentionally small so the parallel weapon lane can
merge with low conflict: one import, one builder call, and background/fog
tuning.

## Authority preservation

- The Rev3 fixture is read but never mutated.
- Every generated object, including lights and groups, is marked:
  `presentationRole=render_only`,
  `renderMeshesMayBeAuthority=false`, and `noHit=true`.
- No map package, collider fixture, spawn, zone, Worker, movement, combat, or
  server-rule file changed.
- Focused runtime diagnostics observed the same 339 colliders, 12 spawns, 9
  zones, fixture hash `6cf785c5171f2ff5`, and
  `renderMeshesMayBeAuthority=false`.
- The continuity module produced 311 render-only meshes around the existing
  45-mesh Rev4 presentation asset.

## Bounded verification

- Direct module TypeScript compile: pass.
- Final exact-source Vite production build: pass, 174 modules.
- Capture harness syntax check: pass.
- One focused online Chrome capture: room creation and WebSocket join
  succeeded; no browser console/page errors; authority counts remained exact.

The one capture used a single room occupant, so the match stayed waiting and
the attempted Press/Ink/Archive views remained at the west spawn. The useful
frame is
`evidence/2026-07-28/g5-inkfall-visual-continuity-v1/screenshots/01-west-spawn-pocket-forward.png`.
The evidence README retains the limitation. The reusable harness now creates
two isolated player contexts and asserts authoritative travel, but was not
rerun under the one-capture budget.

## Nonclaims

- No human visual, fun, readability, or spawn-safety approval.
- No 2/4/8-player, broad regression, performance, staging, deployment, release,
  or G5 acceptance claim.
- No external code, geometry, textures, or other assets were used.
