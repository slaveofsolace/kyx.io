# KYX.IO — Legacy Build

KYX.IO is an active-development browser arena FPS built with Three.js, Vite,
TypeScript, deterministic Rapier physics, and a Cloudflare Worker/Durable Object
authority layer.

> [!IMPORTANT]
> This is a playable development integration, not a promoted public release.
> Offline Practice is the easiest path to load today. Online authority,
> reconnect/resume, six weapon families, Inkfall Foundry Rev5, the temporary
> Rev30 runtime character, and the replacement arena HUD are integrated or in
> their final integration lane. The final character direction is now a slimmer
> shared cyber-suit with assault, breacher, recon, and duelist helmet variants
> bound to browser-first combat presets. Human map/HUD/runtime-model acceptance, final
> source-frozen regression, public licensing, and provenance cleanup still gate
> release promotion.

See [WORK_IN_PROGRESS.md](./WORK_IN_PROGRESS.md) for the exact files and systems
being changed now.

## Current visual direction

### Role-driven player / enemy character

![Temporary Rev30 runtime fallback, neutral three-quarter view](./evidence/2026-07-28/g6-rev30-cc0-donor/kyx-rev30-cc0-donor-neutral-full-body-three-quarter.png)

Rev30 is the currently integrated third-person fallback, not the accepted final
character. The project owner rejected its overall revision after preferring an
earlier, slimmer armor silhouette and several prior closed-helmet studies. The
active replacement keeps the proven 66-bone rig, 16-action contract, and weapon
sockets while building four readable helmet identities: assault/rifle,
breacher/shotgun, recon/sniper, and duelist/melee. The image above documents the
temporary runtime state only. New source renders, in-game animation/contact,
clipping review, and explicit human visual acceptance remain required.

### Inkfall Foundry Rev5 / Geometry Portal

![Inkfall Foundry Rev5 gameplay continuity](./assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/rev5/renders/inkfall-rev5-geometry-portal-gameplay_continuity.png)

Rev5 removes the bridge/wall interpenetration and loose floating construction,
loads a 2.8 MB modular render package, and adds a paired cyan/amber portal with
server-owned traversal, safe destinations, cooldown protection, VFX, audio, and
captions. It retains the frozen Revision 3 authority package with 339 collision
shapes, 12 spawns, and 9 zones. Rev4's 2/4/8-client proof remains historical;
fresh Rev5 multiplayer performance plus human fun, sightline, spawn-safety,
readability, and visual approval remain open.

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
npm run build:staging
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
  presentation, fixed Blink on Q, and three selectable E/F/Z ability slots.
  Launch, frag, smoke, sticky, and flash grenades use two-charge authoritative
  resources with gravity, bounce/stick behavior, reconnect persistence, and
  presentation cues.
- Rifle, sidearm, scattergun, sniper, rocket, and melee profiles have distinct
  project-authored presentation, muzzle or blade-tip nodes, VFX, reload/equip
  behavior, and synthesized audio.
- Inkfall Foundry Rev5's exact render binding and paired world portal are
  integrated over the unchanged Revision 3 collision authority. The earlier
  bridge/wall interpenetration and loose floating geometry are removed; human
  map acceptance and fresh Rev5 2/4/8 runtime proof remain open.
- Rev30 remains the temporary third-person runtime fallback and is not the
  accepted final art direction. The active replacement uses the recovered
  slimmer armor body with four loadout-driven closed helmets; Rev17 remains the
  retained first-person fallback until the replacement passes live animation,
  weapon-contact, clipping, and visual review.
- Arena Instrument v3 replaces the rejected floating-card HUD/menu with compact
  edge-anchored vitals, abilities, ammo, timer/objective, and command-bay
  navigation. Responsive/accessibility capture and human acceptance remain open.
- Desktop browser play is the current product acceptance target. The existing
  mobile-responsive base remains functional, but dedicated mobile arena,
  control, model, and layout polish is deferred until the browser game is
  complete and accepted.
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
