# KYX.IO

KYX.IO is a work-in-progress desktop-browser arena FPS built with Three.js,
TypeScript, Rapier physics, Vite, and an authoritative Cloudflare
Worker/Durable Object match service.

The current milestone is one polished team-deathmatch vertical slice on Relay,
an original open-sky KYX arena. Practice and online now select the same Relay
authority profile and are being closed onto one movement, loadout, HUD,
character, weapon, ability, and feedback contract before the project expands
to more original maps or mobile-specific polish.

## Playable scope

- Offline Practice includes movement, bots, scoring, weapons, abilities, and
  the match HUD.
- Online rooms use Worker-authoritative allocation, simulation, combat,
  scoring, and reconnect/resume.
- Movement includes sprint, jump, crouch, slide, and Blink.
- Rifle, sidearm, shotgun, sniper, launcher, and melee gameplay families are
  implemented. Rights-cleared Quaternius review assets now cover the six world
  and first-person weapon families; final contact and presentation acceptance
  remains open.
- Frag, launch, smoke, sticky, and flash grenade contracts are implemented.
- The map library separates the playable Relay original candidate, the
  retained Iron Bastion legacy practice arena, and external map references
  that are not bundled.
- The Cutline HUD/UI system is integrated across the main menu, Practice, and
  online surfaces. Its final manual visual and accessibility review is open;
  automated checks or captures do not grant visual acceptance.

This is a development build, not a promoted release. See
[PROJECT_STATUS.md](./PROJECT_STATUS.md) for the current component-level state.

## Run locally

Requirements:

- Node.js 22 or newer, below Node 25
- npm 11
- Git LFS for authored art and evidence media

```powershell
git lfs install
npm ci
npm run dev
```

Vite prints the local client URL. To run online authority locally, start a
second terminal:

```powershell
npm run dev:authority
```

## Verification

The routine repository gate runs the following consolidated suite:

```powershell
npm run typecheck
npm run typecheck:worker
npm run typecheck:pages
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

The 30-minute authority soak and browser evidence captures are intentionally
separate final-candidate gates. Automated checks, runtime evidence, and manual
visual/playtest review are reported as distinct results.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/` | Client, Practice simulation, presentation, HUD/UI, weapons, abilities, and maps |
| `worker/` | Authoritative match runtime and Durable Objects |
| `cloudflare/pages-preview/` | Neutral-name, staging-only Pages frontend and private authority proxy |
| `tests/` | Unit, contract, integration, Worker, multiplayer, and browser tests |
| `assets/manifests/` | Active release-asset manifests |
| `assets/review/` | Preserved, non-release visual candidates |
| `assets/quarantine/` | Unresolved-rights content that must never ship |
| `assets/source/` | Authored Blender/map sources and reproducible tooling |
| `public/` | Static files copied into the release package |
| `tools/` | Validation, evidence, security, and package-closure tooling |
| `docs/` | Architecture, audits, operations notes, and historical work records |
| `evidence/` | Dated runtime and visual evidence; large media uses Git LFS |

## Asset and map policy

Release-packaged binary assets must have exact manifest and ledger coverage,
documented provenance, approval, integrity checks, and validation. Review
candidates remain outside `public/`.

External map downloads are references only unless written redistribution and
adaptation rights are documented. No ev.io map geometry, textures, audio, or
layout data is bundled in this repository.

## Contributing and release status

Development conventions are documented in
[CONTRIBUTING.md](./CONTRIBUTING.md). The project remains `UNLICENSED` while
the source/artifact distribution model and project license are being selected.
Do not redistribute project code or assets until that decision is recorded.
