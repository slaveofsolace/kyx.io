# KYX.IO Legacy Build

KYX.IO is an active-development browser arena FPS built with Three.js, Vite,
TypeScript, deterministic Rapier physics, and a Cloudflare Worker/Durable Object
authority layer.

> [!IMPORTANT]
> This repository is a transparent development snapshot, not a release
> candidate. Formal acceptance is currently G0-G2 complete; G3-G9 remain open.
> Offline Practice is the safest playable path. Online authority is implemented
> and under test. The known Inkfall Foundry west-archive rounding defect is
> repaired, but authenticated staging and the clean 2/4/8-player release run
> remain open.

See [WORK_IN_PROGRESS.md](./WORK_IN_PROGRESS.md) for the exact files and systems
being changed now.

## Current visual direction

### Character visual gate — open

The Rev14 image previously shown here was historical audit evidence, not the
current target, and has been removed from the project overview. Rev17 is the
newer feature-gated runtime candidate, but direct review still finds its
anatomy, armor construction, materials, and weapon contact below the intended
production bar. A new correction pass is in progress; no character image will
be presented here as the current direction until it clears direct runtime and
human visual review.

### Inkfall Foundry / Press Hall

![Press Hall product-loader proof](./evidence/2026-07-22/phase-6-g5-press-hall-runtime-v3-3/product-runtime-v1/product-runtime-art-only-four-view-board.png)

These images are bounded development evidence. They do not, by themselves,
promote a release gate.

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
| `assets/` | Asset manifests, map packages, Blender sources, exports, and bounded visual audits |
| `public/` | Runtime-served models and static game assets |
| `tools/` | Evidence capture, verification, asset validation, and runtime harnesses |
| `docs/` | Architecture decisions, design contracts, migration notes, operations, and work logs |
| `evidence/` | Dated raw and accepted validation artifacts; large media is stored with Git LFS |

## Current product state

- Offline Practice can be loaded and played locally.
- The authoritative Worker can create and join rooms and has passed bounded
  movement, combat, score, reconnect, reliable-event recovery, hibernation, and
  multi-client demonstrations.
- The deterministic west-archive collision/depenetration failure is repaired
  and covered by an exact-pose regression. The clean 2/4/8-client manifest and
  human map acceptance are still open.
- Rev17 passes bounded Blender export/reimport, glTF parser, and feature-gated
  runtime checks, but direct visual review remains failed-open for anatomy,
  armor construction, materials, weapon contact, and animation readability.
  It is not approved for default promotion.
- The Inkfall Foundry graybox and Press Hall art package are present, but map,
  character, HUD, audio/VFX, accessibility, performance, and final human review
  gates are not yet complete.
- The Cloudflare Worker + Static Assets package passes local smoke and dry-run
  checks. A durable public deployment is not live because this workstation is
  not authenticated to Cloudflare.

## Artifact and contribution notes

Large `.blend`, `.glb`, image, video, trace, and archive files use Git LFS. Run
`git lfs pull` if a clone contains pointer files instead of assets.

Do not treat a screenshot, automated PASS, or committed work-in-progress label
as human visual acceptance. Preserve immutable evidence revisions and add a new
revision when correcting a sealed artifact.

Licensing and provenance will receive a final audit before this repository is
made public.
