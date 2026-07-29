# KYX.IO project notes for new sessions

Canonical repository:
`E:\AI Projects\Projects\Games\evio\evio-repo`

KYX.IO is a Three.js/Vite desktop-browser arena FPS with a Cloudflare
Worker/Durable Object authority layer. The current product target is one
polished Inkfall Foundry Rev5 team-deathmatch vertical slice that behaves
consistently in Practice and online at 2/4/8 players.

Read `WORK_IN_PROGRESS.md` and
`docs/audits/KYX_CANONICAL_ACCEPTANCE_MATRIX_2026-07-28.md` before changing
code. Newer executed evidence wins over older work-log prose.

## Safety and deployment

- Production deployment is not authorized.
- A merge or push does not authorize deployment.
- Staging follows green local gates and isolation/secrets checks.
- Production requires explicit owner authorization and a rehearsed rollback.
- Preserve dirty feature worktrees. Do not reset, clean, delete, or merge them
  without proving their relationship to canonical main.
- Keep all KYX writes on E. Do not recreate C/D project copies.

## Current product truth

- Map: Inkfall Foundry Rev5 Geometry Portal is a development-only review
  candidate over the frozen Revision 3 authority package (339 colliders,
  12 spawns, 9 zones). Production uses the hash-checked procedural containment
  fallback until the GLB art is human-accepted and release-approved.
- Online: Worker-authoritative room allocation, movement/combat, score, and
  reconnect/resume. Prior Rev4 2/4/8 proof is historical; final Rev5 proof is
  still required.
- Character: Rev17/Rev30/Rev31 are review-only and excluded from `public/`.
  Rev30 and Rev31 are owner-rejected visuals; Rev31 was never a live role
  runtime family. The browser uses the project-authored procedural fallback.
- HUD: Arena Instrument is an integrated candidate, not human-accepted.
- Desktop browser is the acceptance target. Mobile-specific polish is deferred.
- Project metadata is `UNLICENSED`; source/artifact distribution mode is not
  yet selected.

## Architecture

- `src/core/Game.js`: Practice loop and product wiring.
- `src/app/onlineAuthorityRoute.ts`: online route; split future work by
  transport/session, command adapter, prediction/reconciliation, presentation
  state, and HUD binding rather than appending more overrides.
- `src/app/onlineAuthorityThreeRuntime.ts`: online Three.js map/player/weapon
  presentation.
- `worker/`: authoritative match runtime and Durable Objects.
- `src/abilities/`, `src/weapons/`: ability and weapon contracts/presentation.
- `src/ui/` and `src/style.css`: HUD/menu surfaces. Decompose CSS into tokens,
  base shell, match HUD, menus, and accessibility; remove superseded rules.
- `assets/manifests/`: active release binary manifests only.
- `assets/review/`: non-shipped candidates and provenance-preserving records.
- `assets/quarantine/legacy-unverified/`: never import, serve, or package.

Practice and online should consume one role/loadout schema and one typed HUD
view model. The Worker owns authoritative results; clients predict/present only
within explicit contracts.

## Character recovery direction

Use the V6-A anatomy and shared 66-bone rig as a foundation, not final art.
Complete Assault end to end before other roles: continuous cyber-suit/armor,
integrated cowl and neck seal, believable material transitions, first-person
arms, locomotion/contact, weapon alignment, damage readability, LODs,
compression/package budget, provenance, runtime selection, and real player-eye
evidence. Role differences must read by silhouette at 5/20/40 m, not only color.

Candidate GLBs never belong in `public/`. Structural validation is not human
visual approval.

## Run and validate

```powershell
npm ci
npm run dev
npm run dev:authority
```

After a coherent implementation batch:

```powershell
npm run typecheck
npm run typecheck:worker
npm run typecheck:sim
npm run lint
npm run test
npm run test:worker
npm run build
npm run validate:assets:release
npm run verify:release-provenance
npm run verify:release-package
npm run audit:g9
```

The package gate allowlists known text/build outputs and treats every other
emitted file—including unknown extensions—as provenance-bearing. Such files
need exact ledger coverage, an active approved manifest, provenance, and
validation. Automated PASS, runtime proof, and human visual acceptance are
separate claims.
