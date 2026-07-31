# Checkpoint P2 - Toolchain, deterministic contracts, and truthful asset gates

Date/time: 2026-07-19 America/Chicago / 2026-07-20 UTC  
Baseline commit/branch: `81aa1d02acce8e30ba411bb895901d2d2ac6694e`, `main`  
Starting state: Phase 0 and Phase 1 work remained uncommitted over the audited baseline  
Deployment: none

## Outcome

Phase 2 establishes a reproducible strict-TypeScript/test toolchain and versioned seams for deterministic simulation, content, protocol, renderer diagnostics, and asset intake. A clean pinned `npm ci` followed by the browser-inclusive aggregate gate is the checkpoint proof. Malformed or hostile content/protocol objects fail closed, the canonical replay runs without DOM or host authority, and development-only diagnostics are absent from production output.

This is foundation work, not a claim that the game already has final movement, collision, combat, bots, maps, art, authoritative rooms, or production multiplayer. The active product remains the Phase 1 Offline Practice slice while later phases replace its legacy gameplay paths behind measured gates.

## Scope completed

| Item | Completed result |
|---|---|
| P2.1 | Added strict incremental TypeScript configurations, explicit path aliases, a source-only simulation config with no DOM/Node ambient types, and a separate Node test config. |
| P2.2 | Added pinned TypeScript, ESLint, Vitest, and Playwright tooling; unit/contract/integration/browser/multiplayer/asset scripts; broad TypeScript and tool-script linting; and repeatable `check`/`check:full` orchestration. `check:full` is the checkpoint gate because it includes browsers. |
| P2.3 | Added branded integer authority units, a fixed 20 Hz/50 ms tick profile, explicit 40 Hz evaluation profile, intent-only commands, versioned seeded RNG, stable ordering/integration, canonical replay serialization, and a literal replay hash. Recursive purity gates prevent nested simulation modules from importing host/presentation services or reading wall-clock state. |
| P2.4 | Added the JSON-first `revamped_classic` schema/catalog/loader with strict unknown/missing/type/range/policy validation, detached descriptor snapshots, hostile-object rejection, universal schema-v1 20 Hz enforcement, and recursively frozen output. Tuning that lacks evidence remains `null` and records remain `contract_only`. |
| P2.5 | Added protocol v1 message families, bounded UTF-8 JSON codecs, integer unit limits, version/direction checks, intent/authority separation, stable errors, accessor-safe detached snapshots, and recursive output freezing. No transport or socket was added. |
| P2.6 | Added typed renderer metrics and lifecycle cleanup, a development-only deterministic route, production-boundary verification, Playwright coverage, and loopback browser evidence. The route does not construct the game, WebGL, audio, storage, or networking. |
| P2.7 | Added six quarantined legacy asset manifests, a schema, structural/hash/count inspection, strict kind/extension rules, PNG CRC checks, and a release gate. GLB release requires a report receipt bound to runtime bytes plus measured texture memory; unresolved provenance, approval, waivers, reports, and measurements fail release. |
| P2.8 | Added ADR-002, ADR-006, and the Phase 2 migration ledger. No Aether implementation code was copied. |

## Canonical contracts

| Contract | Phase 2 value |
|---|---|
| Authority cadence | 20 Hz / 50 ms |
| Position / velocity / angle | integer millimeters / millimeters per second / milli-degrees |
| RNG | `mulberry32-v1`, explicit seed and stream key |
| Canonical replay seed | `kyx-phase2-foundation-v1` |
| Replay result | tick 6, 2 entities, 6 events, hash `d7201dfc006e72ee` |
| Ruleset | `revamped_classic`, schema 1, revision 1, `contract_only` |
| Protocol | JSON v1, 16 KiB maximum message, intent-only client authority |
| Asset state | 6 quarantined manifests; development inspection only; release rejected |

## Verification

| Gate | Result | Evidence |
|---|---|---|
| Pinned clean install | Pass: npm 11.18.0 and `npm ci --no-audit` | `evidence/2026-07-19/phase-2-toolchain-contracts/npm-version.log`, `npm-ci.log` |
| Browser-inclusive aggregate | Pass: 10/10 stages | `check-full.log`, `phase2-check-summary.json` |
| Vitest | Pass: 110/110 across 8 files | `check-full.log` |
| Content / protocol | Pass: 20/20 and 64/64, including adversarial accessor/freeze/catalog cases | `check-full.log` |
| Browser projects | Pass: 6/6 | `check-full.log` |
| Legacy relay containment | Pass: 28/28 | `check-full.log` |
| Phase 1 truth surface | Pass: 54/54 | `check-full.log` |
| Phase 2 production boundary | Pass: 10/10 | `check-full.log` |
| Asset development validation | Pass: 6 manifests, 0 errors, 33 explicit warnings | `check-full.log` |
| Asset release validation | Expected rejection; 50 errors for quarantined assets | `asset-release-gate.log` |
| Browser evidence capture | Pass: 18/18; exact loopback child terminated | `browser/phase2-browser-summary.json`, screenshots |
| Evidence integrity | Independently hashed manifest with no missing/extra/hash/size mismatches | `phase2-manifest.json`, `evidence/2026-07-19/phase2-manifest-verification.json` |

The final evidence summary and manifest are authoritative if a narrative count ever drifts.

## Reproduction

The evidence harness uses the repository-supported Node runtime:

```powershell
node tools/evidence/capture-phase2-check.mjs
```

The harness performs the clean install, `npm run check:full`, expected release-asset rejection, and a fresh browser recapture. The browser evidence server binds only to `127.0.0.1:4176` and the harness terminates the exact child process.

## Adversarial review fixes

An independent source review found and verified fixes for four real boundary defects: protocol validation/serialization could observe different getter values; a pre-frozen content root could leave mutable nested records; schema-v1 TypeScript and runtime tick-rate acceptance disagreed; and inherited object keys could traverse the ruleset catalog. The accepted implementation snapshots only enumerable data properties without invoking accessors, returns detached recursively frozen graphs, fixes v1 at 20 Hz, and uses a `Map` catalog. Focused live probes confirmed zero getter reads and stable error paths.

The same review tightened the simulation purity scan to recurse, broadened tool lint coverage, made browser inclusion explicit, and hardened asset release evidence. It also corrected two claims: Phase 2 has compatible wire/simulation units but no axis adapter yet, and future replay/network formats must add a ruleset revision or immutable content hash before they can retain full content identity.

## Runtime and visual proof

- `/__test__/determinism` displays the exact replay cadence, tick, entity/event counts, and literal hash in a clean technical surface.
- The desktop game menu publishes read-only renderer metrics through `canvas.dataset.kyxDevMetrics` for the test harness without leaking a mutable `window.game` handle; the visible badges provide development/runtime context rather than displaying the metric payload.
- The production build contains none of the deterministic-route path, seed, hash, presentation copy, renderer hook, or local-development signature.
- The two 1600x900 screenshots were directly inspected after capture. This is agent review evidence, not a human visual-approval claim.

## Asset truth boundary

Development validation reports 33 warnings rather than hiding unresolved work. The legacy GLBs have unresolved provenance/approval, no external glTF Validator report, and no measured texture-memory figure. Their geometry/count/hash measurements are useful intake facts, but the local binary inspector is not the Khronos validator. PNG and GLB kind/extension pairs are strict. A nonempty waiver ID cannot suppress warnings or release budget failures until an owned rationale/follow-up evidence workflow exists.

## Remaining issues

- The Vite production build retains the known 932.34 kB main-chunk warning.
- Ruleset gameplay values remain deliberately `contract_only`; unresolved tuning and presentation fields remain `null`.
- No explicit wire `moveY` to simulation ground-plane `moveZ` adapter exists yet; it must be documented and tested before P4.
- Replay/network records do not yet carry ruleset revision/content hash identity.
- Collision, capsule occupancy, slopes/steps, crouch/slide, teleport validation, authoritative rooms, combat, final maps/art, accessibility acceptance, performance budgets, and production deployment remain open.

## Next slice

Phase 3 movement/collision vertical slice: compact deterministic fixture maps, an isolated query/controller seam, grounded movement and collision edge cases, real crouch/slide/teleport occupancy, movement tapes/metrics, and a feature-flagged render bridge. The legacy controller must remain available until G2 evidence passes.

## User authority needed

None for local, reversible Phase 3 implementation. Production deployment, external services/accounts, purchases, secrets, or irreversible external actions remain unauthorized.
