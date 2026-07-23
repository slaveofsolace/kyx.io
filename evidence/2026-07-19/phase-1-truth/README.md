# Phase 1 truth and containment evidence

Local date: 2026-07-19 (America/Chicago)  
Capture timestamps: 2026-07-20 UTC  
Repository: `C:\AI Projects\Projects\Games\evio\evio-repo`  
Baseline commit: `81aa1d02acce8e30ba411bb895901d2d2ac6694e` (`main`)  
Development URL: `http://127.0.0.1:4173/`  
Production-preview URL: `http://127.0.0.1:4174/`  
Browser/seed: Chromium 149.0.7827.55 / `19072026`

## Outcome

The active development and built entry surfaces pass the Phase 1 truthful-shell checks: password-free Local Guest Profile, Offline Practice for one local player and seven explicit bots, no active ads or external subresources, no fabricated online presence or currency, no application WebSocket, and a Desktop Required mobile boundary.

This evidence is a G1 truth/containment result. It is not evidence of an authoritative server, production multiplayer, shared persistence/economy, final gameplay, final art, performance acceptance, accessibility completion, or production readiness. No production deployment or external mutation was performed.

## Reproduction

The captures used the Codex bundled Node runtime. In PowerShell:

```powershell
$node = 'C:\Users\suhai\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node node_modules/vite/bin/vite.js build
& $node tools/verify/truth-surface.mjs
& $node tools/verify/legacy-relay-smoke.mjs
```

Run the development server and capture in separate terminals:

```powershell
& $node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort
& $node tools/evidence/capture-phase1-truth.mjs --base-url=http://127.0.0.1:4173/ --output-dir=evidence/2026-07-19/phase-1-truth --width=1920 --height=1080 --seed=19072026
```

Build, run the production preview, and capture it:

```powershell
& $node node_modules/vite/bin/vite.js build
& $node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4174 --strictPort
& $node tools/evidence/capture-phase1-truth.mjs --base-url=http://127.0.0.1:4174/ --output-dir=evidence/2026-07-19/phase-1-truth/production --width=1920 --height=1080 --seed=19072026
```

These servers bind only to IPv4 loopback. Stop the exact server process after capture. The evidence harness uses SwiftShader and reduced motion for deterministic inspection; its screenshots are visual/truth evidence, not hardware performance measurements or pixel-determinism claims.

## Verification summary

| Check | Result |
|---|---|
| Vite production build | Pass; main chunk remains above Vite's 500 kB warning threshold |
| Static production truth surface | 54 passed, 0 failed |
| Legacy relay containment smoke | 28 passed, 0 failed |
| Development browser suite | 75 passed, 0 failed |
| Production-preview browser suite | 75 passed, 0 failed |
| Development application network | Same-origin only; zero application WebSockets, page errors, console errors, HTTP errors, or failed requests |
| Production-preview application network | 47 requests, all same-origin; zero application WebSockets, page errors, console errors, HTTP errors, or failed requests |
| Source DOM parser sinks | No `innerHTML` or `insertAdjacentHTML` under `src/` |

The development server's Vite HMR socket is recorded separately by the harness and is not an application WebSocket. Production preview opens no WebSocket.

## Browser scenarios

Both suites cover:

- a fresh home with no pre-existing local profile;
- fresh and returning `/login` plus returning `/register`, each with one nickname input and no password control;
- a canonical `kyx_local_profile` record and a one-way legacy migration that retains only `Migrated Ranger` while removing credential material and legacy account/session keys;
- returning home with Offline Practice primary, Online Match disabled, one local player/seven bots, and no currency surface;
- live practice HUD with explicit `PRACTICE BOT NN` nameplates;
- a practice scoreboard with factual local values and em dashes for unavailable bot defeats/scores;
- a 390×844 touch/mobile context that does not construct the game and shows only Desktop Required.

## Manual visual review and recapture history

Automated checks do not establish visual approval by themselves. The 1920×1080 and 390×844 screenshots were inspected directly.

1. The first otherwise-passing run showed the map-intro card and practice-launch card simultaneously. Menu/profile initialization was moved until after the intro dismissal, and both development and production suites were recaptured.
2. Review of that development gameplay capture showed the dev-only diagnostic chip overlapping the lower-left health HUD. The chip was moved to a clear top-left position and gated off for unsupported mobile, then the application was rebuilt and both suites were recaptured again. The final development screenshots show no chip/HUD/timer overlap and the mobile screenshot contains no diagnostic.

## Summary integrity

| Artifact | SHA-256 | Status |
|---|---|---|
| `phase1-truth-summary.json` | `9BA8B31DBCAE874653C2DA824B5B2C34D151AA62B25E2DDD97E6A270346E2B90` | Superseded development summary after the first visual fix |
| `phase1-truth-summary.json` | `64F7219CF25246A42A7A5E6607DAD22E9784365AF28437129C39F81FA0846F48` | Final development recapture after diagnostic-overlap fix |
| `production/phase1-truth-summary.json` | `74B163615BDE3D4564AC4F068FF6B1D9D60011E4DAF2BFFAF650E368DF22FB25` | Superseded production summary after the first visual fix |
| `production/phase1-truth-summary.json` | `9C7D49284A40DB32DDB17A68A9B887F6E54A7FB14151053C3FDB671731388E11` | Final fresh production recapture |

The superseded hashes document the review/fix sequence; the current files on disk must match the rows labeled final.

## Evidence index

Development:

- `phase1-truth-summary.json`
- `dev-server.stdout.log`, `dev-server.stderr.log`
- `screenshots/phase1-fresh-home-1920x1080.png`
- `screenshots/phase1-login-fresh-1920x1080.png`
- `screenshots/phase1-register-returning-1920x1080.png`
- `screenshots/phase1-login-returning-1920x1080.png`
- `screenshots/phase1-returning-home-1920x1080.png`
- `screenshots/phase1-gameplay-1920x1080.png`
- `screenshots/phase1-scoreboard-1920x1080.png`
- `screenshots/phase1-profile-migrated-1920x1080.png`
- `screenshots/phase1-mobile-desktop-required-390x844.png`

Production preview:

- `production/phase1-truth-summary.json`
- `production/preview-server.stdout.log`, `production/preview-server.stderr.log`
- the same nine screenshot names under `production/screenshots/`

## Static and relay boundaries

The 54-check truth verifier follows imports reachable from `src/main.js`, `src/loginPage.js`, and `src/registerPage.js`, then recursively inspects the three built entry pages and their referenced JS/CSS. Unreachable legacy source, `server/`, evidence, binary assets, and source maps are excluded. Generic third-party bundle vocabulary is not treated as a first-party violation; emitted bundles use high-signal leak signatures.

Dormant economy/progression and touch modules can therefore remain on disk without being certified as shipped capabilities. They must stay unreachable or be removed in a later disposition pass. `server/` is verified separately: the 28-check smoke test proves fixed loopback binding, dependency reproducibility, containment headers/banner, direct local WebSocket behavior, and exact child cleanup. It does not prove server authority.

## Known issue

The production build still emits a main JavaScript chunk above Vite's 500 kB warning threshold. Bundle splitting, asset budgets, deterministic simulation, authoritative networking, authored-map replacement, final visual design, and broader QA remain later phases.
