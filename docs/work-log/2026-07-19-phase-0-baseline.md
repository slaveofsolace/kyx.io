# Checkpoint P0 — Baseline is reproducible and evidenced

Date/time: 2026-07-19 America/Chicago / 2026-07-20 UTC  
Commit/branch at start: `81aa1d02acce8e30ba411bb895901d2d2ac6694e`, `main`  
Worktree before: clean  
Ruleset/protocol/content/map versions: legacy undeclared / no protocol authority / procedural map

## Outcome

The unchanged audited application can be installed from its lockfiles, built, launched, entered as a practice match, compared with the public build, and inspected through reproducible evidence commands. The repository now has a development-only renderer/frame probe, a browser capture harness, a complete current-asset audit, a hash-manifest generator, target Node/npm policy, and ADR-001.

## Scope completed

- Requirements: P0.1–P0.8 evidence foundation.
- Changed modules: `src/main.js`, `package.json`, `package-lock.json`, `.nvmrc`, `tools/assets/`, `tools/evidence/`, `docs/`, `evidence/`.
- Legacy path removed/quarantined: none; this checkpoint preserves the baseline.

## Decisions

- Decision: KYX remains the shell; Aether is a hash-anchored selective donor; server authority, kinematic controller, `revamped_classic`, Blender/glTF, and desktop-first boundaries are binding.
- Evidence/reason: canonical handoff plus direct KYX/Aether inventory and runtime capture.
- Alternatives rejected: wholesale Aether/React migration, client-transform trust, dynamic-body player, shader-only art rescue, mobile-first breadth.
- Reversal path: all new evidence tooling is isolated; migration proceeds behind seams.
- ADR: `docs/adr/ADR-001-product-foundation-and-authority.md`.

## Verification

| Command/test | Result | Evidence path |
|---|---|---|
| Root/server lockfile installs | Pass | `evidence/2026-07-19/phase-0-baseline/commands.txt` |
| Vite production build | Pass with chunk warning | same |
| Local/public browser capture | Pass | `evidence/2026-07-19/phase-0-baseline/screenshots/` |
| 30-second gameplay segment | Pass | `evidence/2026-07-19/phase-0-baseline/video/` |
| Current asset audit | 6/6 parsed | `evidence/2026-07-19/phase-0-baseline/asset-reports/current-assets.json` |
| Evidence SHA-256 manifest | Pass | `evidence/2026-07-19/phase-0-baseline/baseline-manifest.json` |

## Runtime/visual proof

- Reproduction: commands in evidence README/commands file.
- Match: local-only simulated deathmatch; no authoritative room.
- Viewport: exact 1920×1080 screenshots; interactive performance sample at 1818×1080.
- Console/network: local/public JSON plus interactive browser observations.

## Metrics

| Metric | Baseline | Candidate budget | Pass |
|---|---:|---:|---|
| Gameplay draw calls | 516 | <500 | No |
| Menu draw calls | 675 | <500 reference | No |
| Gameplay triangles | 110,664 | <1.5M | Yes |
| Interactive gameplay frame p95 | 7.5 ms | ≤16.67 ms | Session-only pass |
| Public cold transfer | ~6.69 MB | first shell ≤2.5 MB | No |
| Current asset bytes | 6.16 MB | informational baseline | — |

## Security/accessibility/provenance impact

- Authority/abuse: no change; existing client authority remains documented as unsafe.
- Accessibility: no change; baseline only.
- External assets: none added.
- External endpoints observed: Google Fonts and placeholder Google advertising/quality endpoints.

## Remaining issues

See `evidence/2026-07-19/phase-0-baseline/known-issues.md`. G0 remains open until the required static/test/browser check path exists.

## Next slice

Phase 1 truth/containment: remove password collection, disable placeholder ads, label the mode Offline Practice, remove fabricated connected-player claims, quarantine local economy authority, and keep a clean build/browser check.

## User authority needed

None for the next local, reversible slice. Production deployment remains unauthorized.
