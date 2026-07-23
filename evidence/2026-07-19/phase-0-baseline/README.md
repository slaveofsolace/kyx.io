# Phase 0 baseline evidence

Local date: 2026-07-19 (America/Chicago)  
Capture timestamps: 2026-07-20 UTC  
Repository: `C:\AI Projects\Projects\Games\evio\evio-repo`  
Baseline commit: `81aa1d02acce8e30ba411bb895901d2d2ac6694e` (`main`, `origin/main`, ahead 0/behind 0)  
Ruleset/map at baseline: legacy undeclared rules / procedural Iron-Bastion presentation  
Local URL: `http://127.0.0.1:5999/`  
Public audit URL: `https://mistyrose-boar-758424.hostingersite.com/`

## Outcome

The audited KYX commit is reproducible from its lockfile and produces a playable local practice match. The baseline is now protected by exact repository/toolchain records, fixed-resolution menu/gameplay captures, a 30-second gameplay video segment, console/network/runtime profiles, a complete file-coverage structural audit of current public assets, an artifact hash manifest, and ADR-001.

This is baseline evidence, not a G0 pass. The repository did not initially provide `typecheck`, `lint`, `test`, or browser-check scripts, and the current product still has critical truth/security findings.

## Reproduction

The repository owns an npm v3 lockfile. This machine used the Codex bundled Node 24.14.0 runtime and an npm 11.18.0 CLI resolved in the bundled pnpm cache. The target repository policy is Node 20.19.0 through `<25` and npm 11.

```powershell
$runtimeRoot = 'C:\Users\suhai\.cache\codex-runtimes\codex-primary-runtime\dependencies'
$env:PATH = "$runtimeRoot\node\bin;$runtimeRoot\bin\fallback;" + $env:PATH
pnpm dlx npm@11.18.0 ci --no-audit --no-fund
pnpm dlx npm@11.18.0 run build
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5999 --strictPort
node tools/evidence/capture-baseline.mjs --url=http://127.0.0.1:5999/ --label=local --output=evidence/2026-07-19/phase-0-baseline --duration-ms=30000 --width=1920 --height=1080 --seed=19072026
node tools/assets/audit-assets.mjs --input=public --output=evidence/2026-07-19/phase-0-baseline/asset-reports/current-assets.json
node tools/evidence/build-manifest.mjs evidence/2026-07-19/phase-0-baseline
```

The public build is read-only. The exact 1920×1080 public capture used the same harness with `--record-video=false`. Both captures install a seeded Mulberry32 `Math.random` stream before application scripts execute (`seed=19072026`). This controls application RNG inputs; it does not claim pixel-identical output because asynchronous loads, timers, animation frames, and third-party scripts are not deterministic.

## Build/install result

| Check | Result |
|---|---|
| Initial Git status | Clean; 75 tracked files; no `node_modules/` or `dist/` |
| Root `npm ci` | Pass; 18 packages installed |
| Server `npm ci` | Pass; one package installed (`ws`) |
| Initial `npm run build` | Pass; Vite 8.0.16, 71 modules, 415 ms |
| Latest preserved `npm run build` | Pass; Vite 8.0.16, 71 modules, 407 ms |
| Server syntax | Pass: `node --check server/index.js` |
| Post-install tracked status | Clean before evidence/harness work; ignored install/build outputs only |

Build warning: the minified main chunk is 979.75 kB (258.12 kB gzip), above Vite's 500 kB warning threshold. Total `dist/` bytes measured 7,287,566.

## Runtime measurements

The exact-resolution Playwright runs use Chrome 149.0.7827.55 and SwiftShader. Frame timing under hidden/headless video capture is heavily throttled and is not a hardware performance gate. Draw/triangle counters come from a development-only Three.js probe that sums all post-processing passes. The runtime JSON contains one-second sampled metric snapshots, not a raw per-frame trace.

The in-app interactive Chromium run at 1818×1080 is the representative responsiveness sample for this session:

| State | Draw calls | Triangles | Geometries | Textures | Programs | Scene objects | Frame p95 | Frame p99 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Menu | 675 | 110,968 | 1,562 | 39 | 25 | 1,891 | 7.3 ms | 9.3 ms |
| Gameplay | 516 | 110,664 | 2,011 | 53 | 26 | 2,043 | 7.5 ms | 11.0 ms |

The candidate normal-combat draw-call budget is `<500`; gameplay is already over it and the menu is materially over it. These figures are one-session measurements, not universal hardware claims.

## Network/console findings

| Capture | Requests | Encoded transfer | External origins | Failed requests | Key result |
|---|---:|---:|---:|---:|---|
| Local Vite cold load | 86 | 13,812,409 bytes | 8 external + localhost | 0 network failures | Dev source modules plus all GLBs; external ads still execute |
| Public cold load | 27 | 6,687,249 bytes | 8 external + public host | 0 network failures | Five GLBs dominate transfer; external ads still execute |

The interactive browser also observed one blocked Google CSP/ORB request locally. Console evidence repeatedly reports:

- `[net] no VITE_WS_URL configured — using local-only match simulation`;
- placeholder `ca-pub-XXXXXXXXXXXXXXXX` AdSense requests;
- repeated `adsbygoogle.push()` slot-size errors;
- one Three.js shader precision warning locally.

Each network JSON now includes start/response/finish timing and encoded bytes for every requested GLB/image/audio asset, while each runtime JSON retains all browser resource timing entries. The two page exceptions in each automated capture are structured as `TagError` with the opaque minified message `Y`; the baseline cannot attribute them more precisely, while the interactive console ties the visible repeated errors to placeholder advertising.

Despite the local-only message, the match HUD displays `3/8` or `5/8 PLAYERS` and bots receive human-like names. This is the Phase 1 truth/containment target, not proof of multiplayer.

## Asset audit

`asset-reports/current-assets.json` provides structural file coverage for every GLB/image/audio file under `public/`:

- 6 assets, 6,161,565 bytes;
- 5 GLBs, 1 PNG, 0 audio files, 0 structural-parse failures;
- `weapons.glb`: 386 primitives / 28,920 estimated triangles;
- `player.glb`: 209 primitives / 21,916 estimated triangles, no skin/animation;
- `zombie.glb`: 122 primitives / 2,430 estimated triangles, no materials/skin/animation;
- `soldier.glb`: 2 primitives, 49 unique joints, only Idle/Run/TPose/Walk;
- `spartan.glb`: five materials (the handoff reference recorded this as `null`, now corrected by direct inspection);
- the sole PNG is `public/textures/sakura/wrap.png`, 512×512;
- provenance remains unknown/unrecorded for all current assets.

This is not the later full asset validation schema: detailed vertex/morph/key/influence counts, bounds and scale, semantic sockets/clips, validator findings, provenance IDs, and budget/waiver outcomes remain P2.7/P7.9 work.

## Evidence index

- `screenshots/local-menu-1920x1080.png`
- `screenshots/local-gameplay-1920x1080.png`
- `screenshots/live-menu-1920x1080.png`
- `screenshots/live-gameplay-1920x1080.png`
- `video/local-baseline-with-30s-gameplay.webm` — 1920×1080 VP8, 25 fps, 61.56 seconds total including boot/menu and 30 seconds of gameplay
- `profiles/local-runtime.json`, `profiles/live-runtime.json`
- `network/local-network.json`, `network/live-network.json`
- `local-console.json`, `live-console.json`
- `asset-reports/current-assets.json`
- `environment.json`, `repository-state.json`, `dependency-inventory.json`, `commands.txt`, `install-build.log`, `known-issues.md`, `git-state-before.txt`, `git-state-after.txt`
- `baseline-manifest.json` — generated SHA-256 index of the evidence tree

## Gate status

Phase-0 preservation and evidence artifacts exist, and the current app remains reproducible. G0 is still **open** because typecheck, lint, unit/contract/integration/browser suites and the aggregate `check` path do not exist yet. No production deployment or external mutation was performed.
