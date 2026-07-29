# KYX.IO

KYX.IO is an active-development desktop-browser arena FPS built with Three.js,
Vite, TypeScript, Rapier physics, and an authoritative Cloudflare
Worker/Durable Object match service.

> [!IMPORTANT]
> This repository is a playable development integration, not a promoted public
> release. The current target is one polished Inkfall Foundry Rev5 team
> deathmatch vertical slice that behaves consistently in Practice and online at
> 2, 4, and 8 players. Production deployment is not authorized.

The current authoritative status is in
[WORK_IN_PROGRESS.md](./WORK_IN_PROGRESS.md), with gate commands and results in
[the canonical acceptance matrix](./docs/audits/KYX_CANONICAL_ACCEPTANCE_MATRIX_2026-07-28.md).

## What is playable now

- Offline Practice loads the game loop, movement, weapons, abilities, bots,
  scoring, and the practice HUD.
- The Worker owns online room allocation, movement/combat state, scoring, and
  reconnect/resume. Existing evidence covers genuine 2/4/8 occupancy on the
  prior Rev4 map state; the final Rev5 source state still needs its qualifying
  multiplayer rerun and human play review.
- Movement includes sprint, jump, crouch/slide, and Blink. Blink is fixed to Q;
  three additional ability slots are loadout-selectable.
- Rifle, sidearm, scattergun, sniper, rocket, and melee families have distinct
  gameplay and project-authored procedural presentation. Frag, launch, smoke,
  sticky, and flash grenade contracts exist with authoritative resources and
  reconnect persistence.
- Inkfall Foundry Rev5's development review route integrates the modular
  Geometry Portal art pass and a paired cyan/amber traversal portal over the
  frozen Revision 3 authority package: 339 colliders, 12 spawns, and 9 zones.
  The production package currently renders the same hash-checked authority
  fixture through its code-authored containment fallback; unaccepted map GLBs
  are not shipped.
- The compact Arena Instrument HUD candidate is integrated, but Practice/online
  convergence, accessibility captures, and owner visual acceptance remain
  open.

![Inkfall Foundry Rev5 gameplay continuity](./assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/rev5/renders/inkfall-rev5-geometry-portal-gameplay_continuity.png)

## Character truth

Rev17, Rev30, and Rev31 are preserved technical review batches, not accepted
release art. Rev30 and Rev31 were visually rejected by the owner, and Rev31 was
never wired as a live role-selected runtime family. Their binaries and
manifests now live under `assets/review/`, outside Vite's `public/` package.

The browser currently uses the existing project-authored procedural character
fallback. The next character milestone is one Assault role completed end to
end on the shared 66-bone anatomical/rig foundation: third-person silhouette,
first-person arms, locomotion/contact, weapon alignment, damage readability,
LODs/package budget, provenance, runtime selection, and player-eye browser
evidence. Only after Assault is accepted should its modular suit/helmet system
be propagated to Breacher, Recon, and Duelist.

## Run locally

Requirements:

- Node.js 20.19 or newer, below Node 25
- npm 11
- Git LFS for authored art and evidence archives

```powershell
git lfs install
npm ci
npm run dev
```

Vite prints the local URL. Run the local authoritative service in a second
terminal:

```powershell
npm run dev:authority
```

## Validation

Run coherent implementation batches before the consolidated suite:

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

`validate:assets:release` and `verify:release-package` are fail-closed. Known
text/build files are allowlisted; every other file in `dist/`, including audio,
fonts, WASM, video, archives, and unknown extensions, requires exact
active-manifest and shipped-ledger coverage plus provenance, approval, and
validation. Review candidates do not satisfy those gates.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/` | Client, Practice simulation adapters, presentation, HUD/UI, weapons, abilities, and map integration |
| `worker/` | Authoritative Cloudflare Worker and Durable Object room runtime |
| `tests/` | Unit, contract, integration, Worker, multiplayer, and browser suites |
| `assets/manifests/` | Active, release-packaged binary manifests only |
| `assets/review/` | Preserved non-shipped visual candidates and technical records |
| `assets/quarantine/` | Unresolved-rights historical bytes; never serve or package |
| `assets/source/` | Authored Blender/map sources and reproducible tooling |
| `public/` | Static files copied into the release package |
| `tools/` | Evidence capture, validation, security, and package-closure tools |
| `docs/` | Current contracts, audits, operations notes, and work logs |
| `evidence/` | Dated raw runtime and visual artifacts; large media uses Git LFS |

## Release blockers

- One character role must be visually accepted and fully runtime-integrated.
- Inkfall Rev5 needs final 2/4/8 proof and human map/play acceptance.
- HUD, audio/VFX, accessibility, and integrated gameplay feel need owner review.
- The owner must choose source distribution, built artifact distribution, or
  both, and select the repository license.
- A final source-frozen regression, G8 soak, G9 review, staging deployment, and
  rollback rehearsal must occur in that order.

The isolated staging Worker is
[kyx-io-authority-staging.suhaibabdeljaber.workers.dev](https://kyx-io-authority-staging.suhaibabdeljaber.workers.dev).
Its current contents may lag this branch; a staging URL is not proof of release
or production approval.

The project remains `UNLICENSED`. Do not publish, promote, or infer rights from
repository history. Automated passes, screenshots, and structural asset checks
remain distinct from human visual acceptance.
