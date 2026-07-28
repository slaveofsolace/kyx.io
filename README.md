# KYX.IO — Legacy Build

KYX.IO is an active-development browser arena FPS built with Three.js, Vite,
TypeScript, deterministic Rapier physics, and a Cloudflare Worker/Durable Object
authority layer.

> [!IMPORTANT]
> This is a playable development integration, not a promoted public release.
> Offline Practice is the easiest path to load today. Online authority,
> reconnect/resume, six weapon families, Inkfall Foundry Rev4, the Rev30
> character direction, and the replacement arena HUD are integrated or in their
> final integration lane. Human map/HUD/runtime-model acceptance, final
> source-frozen regression, public licensing, and provenance cleanup still gate
> release promotion.

See [WORK_IN_PROGRESS.md](./WORK_IN_PROGRESS.md) for the exact files and systems
being changed now.

## Current visual direction

### Rev30 player / enemy character

![Rev30 CC0 donor character, neutral three-quarter view](./evidence/2026-07-28/g6-rev30-cc0-donor/kyx-rev30-cc0-donor-neutral-full-body-three-quarter.png)

Rev30 replaces the rejected blocky character direction with a compact
charcoal/gunmetal cyber-suit, broad cyan visor, fitted gloves, continuous
knee/shin construction, and grounded boots. It adapts Irondust's CC0
“Sci-fi Soldier” donor while preserving KYX's 66-bone rig, 16-action contract,
and authored weapon sockets. The accepted asset render is shown above; live
runtime animation, external weapon contact, and final in-game visual review are
still explicit gates.

### Inkfall Foundry Rev4 / Press Archive

![Inkfall Foundry west spawn pocket](./evidence/2026-07-28/g5-inkfall-visual-continuity-v1/screenshots/01-west-spawn-pocket-forward.png)

The Rev4 technical candidate binds its render package to an authoritative
profile with 339 collision shapes, 12 spawns, 9 zones, deterministic traversal,
and 2/4/8-client runtime evidence. Human fun, sightline, readability,
spawn-safety, and final visual approval remain open. Screenshots are bounded
evidence, not automatic gate promotion.

## Run locally

Requirements:

- Node.js 20.19 or newer (below Node 25)
- npm 11
- Git LFS for the authored art and evidence archive

```powershell
git lfs install
npm ci
npm run dev
```

Vite prints the local URL. To run the local authoritative multiplayer Worker in
a second terminal:

```powershell
npm run dev:authority
```

Useful validation commands:

```powershell
npm run build
npm run typecheck
npm run typecheck:worker
npm run lint
npm run test
```

## Repository map

| Path | Purpose |
| --- | --- |
| `src/` | Game client, presentation, deterministic simulation adapters, UI, HUD, weapons, and world integration |
| `worker/` | Cloudflare Worker and Durable Object authoritative room runtime |
| `tests/` | Unit, contract, integration, multiplayer, and browser regression suites |
| `assets/` | Active asset manifests, map packages, Blender sources, exports, bounded visual audits, and clearly separated non-shipping quarantine records |
| `public/` | Runtime-served models and static game assets |
| `tools/` | Evidence capture, verification, asset validation, and runtime harnesses |
| `docs/` | Architecture decisions, design contracts, migration notes, operations, and work logs |
| `evidence/` | Dated raw and accepted validation artifacts; large media is stored with Git LFS |

## Current product state

- Offline Practice can be loaded and played locally.
- The authoritative Worker can create/join rooms and has bounded evidence for
  movement, combat, scoring, reconnect/resume with token rotation, reliable
  event recovery, hibernation, and genuine 2/4/8-client occupancy.
- Movement includes sprint, jump, crouch/slide, measured forward/back/strafe
  presentation, impulse grenade, and teleport ability paths.
- Rifle, sidearm, scattergun, sniper, rocket, and melee profiles have distinct
  project-authored presentation, muzzle or blade-tip nodes, VFX, reload/equip
  behavior, and synthesized audio.
- Inkfall Foundry Rev4's exact authority binding and render continuity are
  integrated. The earlier west-archive collision/depenetration defect is
  repaired; human map acceptance remains open.
- Rev30 is the accepted third-person art direction. Rev17 remains the retained
  first-person viewmodel and explicit legacy fallback while Rev30 runtime
  selection, animation, weapon contact, and live capture are finalized.
- Arena Instrument v3 replaces the rejected floating-card HUD/menu with compact
  edge-anchored vitals, abilities, ammo, timer/objective, and command-bay
  navigation. Responsive/accessibility capture and human acceptance remain open.
- A durable Cloudflare staging Worker is available at
  [kyx-io-authority-staging.suhaibabdeljaber.workers.dev](https://kyx-io-authority-staging.suhaibabdeljaber.workers.dev).
  It is intentionally not production promotion; see `WORK_IN_PROGRESS.md` for
  the exact deployed-source lag and refresh status.

## Artifact and contribution notes

Large `.blend`, `.glb`, image, video, trace, and archive files use Git LFS. Run
`git lfs pull` if a clone contains pointer files instead of assets.

Do not treat a screenshot, automated PASS, or committed work-in-progress label
as human visual acceptance. Preserve immutable evidence revisions and add a new
revision when correcting a sealed artifact.

The active runtime no longer fetches the six unresolved-rights legacy binaries.
Those exact historical bytes are preserved only in
`assets/quarantine/legacy-unverified/`, outside Vite's `public/` release path,
with hash-bound records and replacement notes. Do not copy quarantined files
into a build or infer ownership from their presence in repository history.

The project remains `UNLICENSED`. The owner must select the repository's public
distribution license. Six unresolved-rights historical assets remain
quarantined outside the public runtime but still exist in Git history; a public
release requires an explicit provenance/removal decision. Runtime character,
map, and HUD human acceptance are also still required before this repository can
be described as release-cleared.
