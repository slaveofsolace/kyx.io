# Phase 2 toolchain and contract evidence

Local date: 2026-07-19 (America/Chicago)  
Capture timestamps: 2026-07-20 UTC  
Repository: `C:\AI Projects\Projects\Games\evio\evio-repo`  
Baseline commit: `81aa1d02acce8e30ba411bb895901d2d2ac6694e` (`main`)  
Browser evidence URL: `http://127.0.0.1:4176/`

## Outcome

The Phase 2 foundation passes a clean pinned install and the browser-inclusive 10-stage aggregate gate. Deterministic simulation, content, protocol, renderer diagnostics, development-route exclusion, and asset intake are executable contracts with hostile-input and production-boundary checks.

This evidence does not claim final movement/collision, authoritative multiplayer, combat, content tuning, production-approved assets, performance acceptance, final visuals, or deployment. The current shipping-facing experience remains Offline Practice.

## Reproduction

```powershell
$node = 'C:\Users\suhai\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:KYX_PNPM_CLI = 'C:\Users\suhai\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.mjs'
& $node tools/evidence/capture-phase2-check.mjs
```

The harness pins npm 11.18.0, runs `npm ci --no-audit`, runs `npm run check:full`, confirms that quarantined assets fail the release validator, and recaptures the deterministic route and renderer diagnostics. The Vite evidence child binds only to IPv4 loopback and is terminated by exact process handle.

## Verification summary

| Check | Result |
|---|---|
| Clean package-lock install | Pass |
| Aggregate stages | 10/10 |
| Vitest | 110/110 |
| Playwright projects | 6/6 |
| Legacy relay containment | 28/28 |
| Phase 1 truth surface | 54/54 |
| Phase 2 production boundary | 10/10 |
| Asset development validator | 6 manifests, 0 errors, 33 warnings |
| Asset release validator | Expected failure; quarantined manifests rejected |
| Dedicated browser evidence | 18/18 |
| Canonical replay | tick 6, 2 entities, 6 events, `d7201dfc006e72ee` |
| Production deployment | Not performed |

The machine-readable `phase2-check-summary.json` records assertions, package versions, key-file SHA-256 values, known open gates, and the no-deployment flag.
The same one-command harness then generates `phase2-manifest.json` and invokes a separate verifier, which writes `../phase2-manifest-verification.json` outside the sealed root to avoid a self-referential manifest.

## Browser evidence

- `browser/screenshots/phase2-determinism-route-1600x900.png` shows the isolated deterministic route with exact canonical results.
- `browser/screenshots/phase2-renderer-metrics-menu-1600x900.png` shows the desktop menu/runtime context while the paired JSON records the read-only renderer metrics published on the canvas data hook.
- `browser/phase2-browser-summary.json` records checks, requests, sockets, console/page/request failures, renderer metrics, route values, and exact child cleanup.
- Vite diagnostic warnings caused by Playwright screenshot readback are recorded as browser-driver messages, not hidden; the summary has zero application console errors, page errors, failed requests, or application sockets.

Both screenshots were directly inspected by the agent. They are visual evidence, not human visual approval or hardware performance measurements.

## Evidence index

- `README.md`
- `npm-version.log`
- `npm-ci.log`
- `check-full.log`
- `asset-release-gate.log`
- `browser-evidence.log`
- `phase2-check-summary.json`
- `browser/phase2-browser-summary.json`
- `browser/vite.stdout.log`
- `browser/vite.stderr.log`
- `browser/screenshots/phase2-determinism-route-1600x900.png`
- `browser/screenshots/phase2-renderer-metrics-menu-1600x900.png`
- `phase2-manifest.json`
- `../phase2-manifest-verification.json` (independent result outside the sealed root)

`phase2-manifest.json` excludes itself and hashes every other evidence file. Its entry set, byte counts, and SHA-256 values are independently rechecked after generation.

## Known open gates

- The production main chunk still triggers the known 932.34 kB warning.
- Ruleset records remain `contract_only` with unresolved tuning intentionally `null`.
- Legacy assets are quarantined: provenance/approval unresolved, external glTF reports absent, and GLB texture memory unmeasured.
- Phase 2 has no collision controller, authoritative room, combat authority, final asset set, or production deployment.
