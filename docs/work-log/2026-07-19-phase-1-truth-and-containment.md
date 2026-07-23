# Checkpoint P1 — Truthful local shell and contained legacy relay

Date/time: 2026-07-19 America/Chicago / 2026-07-20 UTC  
Baseline commit/branch: `81aa1d02acce8e30ba411bb895901d2d2ac6694e`, `main`  
Starting state: Phase 0 evidence/tooling was present as uncommitted work over the clean audited baseline  
Ruleset/protocol/content/map: Offline Practice / no production protocol authority / legacy procedural Iron Bastion

## Outcome

The active browser product now presents only a password-free local guest profile, local loadout/settings, and an eight-minute Offline Practice round for one local player and seven explicitly labeled bots. Advertising, third-party page resources, fabricated online presence, economy/progression, the legacy relay, and touch controls are absent from the active production entry graph. Unsupported mobile clients receive a Desktop Required boundary.

This checkpoint does not complete the product and does not add an authoritative server. The procedural arena and current gameplay remain a contained legacy slice for later simulation, map, art, accessibility, performance, and multiplayer replacement work.

## Scope completed

| Item | Completed result |
|---|---|
| P1.1 | Login/register became the same Local Guest Profile route with one display-name input and no password/email field. `kyx_local_profile` stores only a versioned `local_guest` name. The migration retains only a validated active/sole display name and scrubs credential-bearing legacy keys. |
| P1.2 | Removed active AdSense/ad slots, provider identifiers, external fonts, and external page subresources; advertising is disabled with no provider. |
| P1.3 | Renamed the local mode to Offline Practice; fixed the visible roster at one local player plus seven `PRACTICE BOT NN` opponents; removed fake joins, public-lobby/player-count language, and invented bot scoreboard values. |
| P1.4 | Hid/quarantined economy, store, battle pass, achievements, rarity perks, inventory, coin rewards, and shared-progression claims from active runtime. Economy authority is `none`. |
| P1.5 | Added desktop-development-only product/version/environment diagnostics; the production build omits the visible diagnostic. |
| P1.6 | Replaced dynamic HTML parser sinks throughout `src/` with validation, `textContent`, `replaceChildren`, and explicit DOM/SVG construction. Repository scan found no `innerHTML` or `insertAdjacentHTML` use under `src/`. |
| P1.7 | Removed browser relay wiring and active `NetClient`/`ServerSim`; converted `server/` to a documented, hard-loopback, non-authoritative comparison fixture with a dedicated smoke verifier. Converted the historical deploy workflow into manual build verification only. |
| P1.8 | Added desktop-only launch gating. Mobile/coarse-pointer contexts do not construct the game and cannot expose the dormant touch-control path. |

Changed areas include the three entry pages, `src/config/productConfig.js`, local profile flow, game/mode/bot/HUD/menu paths, safe DOM construction, styles, server containment, workflow/environment documentation, Phase 1 verifiers, capture tooling, evidence, and ADR-009.

## Decisions

- Decision: the current executable is a local-only practice product until real server authority exists.
- Identity/persistence: one local display-name record; no password, verified identity, shared account, stats, or credential migration.
- Economy: disabled with authority `none`; local loadout/settings are convenience state, not progression.
- Relay: reproducible only on `127.0.0.1` and never a production/multiplayer claim.
- Mobile: visible non-launch boundary, not partial touch support.
- Deployment: no production deployment, proxy, tunnel, VPS mutation, secret use, purchase, or external-account action occurred.
- ADR: `docs/adr/ADR-009-identity-persistence-and-economy-boundary.md`. ADR-002 remains reserved for the Phase 2 simulation tick/units/determinism decision.

## Verification

| Command/test | Result | Evidence |
|---|---|---|
| Bundled Node: Vite build, then `tools/verify/truth-surface.mjs` | Pass: production build plus 54/54 static truth checks | verifier console; `tools/verify/truth-surface.mjs` |
| Bundled Node: `tools/verify/legacy-relay-smoke.mjs` | Pass: 28/28; loopback HTTP/WS only; exact child terminated | verifier console; `tools/verify/legacy-relay-smoke.mjs` |
| Development browser capture, `127.0.0.1:4173` | Pass: 75/75 | `evidence/2026-07-19/phase-1-truth/phase1-truth-summary.json` |
| Production-preview browser capture, `127.0.0.1:4174` | Pass: 75/75 | `evidence/2026-07-19/phase-1-truth/production/phase1-truth-summary.json` |
| `rg -n "innerHTML|insertAdjacentHTML" src` | Pass: no matches | local verification |
| `git diff --check` | Pass; Windows line-ending notices only | local verification |

The browser harness used Chromium 149.0.7827.55, seeded application randomness with `19072026`, captured 1920×1080 desktop and 390×844 mobile evidence, and exercised fresh, returning, and one-way legacy migration paths. Both environments recorded same-origin application traffic, zero application WebSockets, zero page errors, zero console errors, zero HTTP errors, and zero failed requests.

## Runtime and visual proof

- Home/menu: Offline Practice, one local player/seven bots, disabled Online Match, no currency surface.
- Profile: fresh/returning Local Guest Profile, a single display-name field, and visible local-only disclosure.
- Migration: `Migrated Ranger` retained; legacy credential marker and legacy account/session stores removed.
- Gameplay: local HUD, explicit practice-bot nameplates, no join claims or currency.
- Scoreboard: one factual local row and seven bot rows whose unavailable defeats/scores are em dashes rather than fabricated values.
- Mobile: Desktop Required overlay; no game/HUD/mobile controls; development diagnostics absent.

Automated assertions initially passed while screenshot review exposed two composition defects. First, the map-intro card and practice-launch card were visible together; menu/profile initialization was deferred until the intro dismissed, then development and production evidence were recaptured. Second, the dev-only diagnostics chip overlapped the lower-left health HUD; it was moved to a clear top-left position and suppressed for unsupported mobile, then the application was rebuilt and both development and production evidence were recaptured again.

## Evidence integrity

- First post-intro-fix development summary SHA-256: `9BA8B31DBCAE874653C2DA824B5B2C34D151AA62B25E2DDD97E6A270346E2B90` (superseded by the diagnostics-overlap recapture).
- Final development summary SHA-256: `64F7219CF25246A42A7A5E6607DAD22E9784365AF28437129C39F81FA0846F48`.
- First post-intro-fix production summary SHA-256: `74B163615BDE3D4564AC4F068FF6B1D9D60011E4DAF2BFFAF650E368DF22FB25` (superseded by the final rebuild/recapture).
- Final production-preview summary SHA-256: `9C7D49284A40DB32DDB17A68A9B887F6E54A7FB14151053C3FDB671731388E11`.

## Static-check exclusion boundary

The 54-check verifier follows reachable imports from `src/main.js`, `src/loginPage.js`, and `src/registerPage.js`, then checks the recursively referenced built JS/CSS. It excludes unreachable legacy source, `server/`, evidence, binary assets, and source maps. Dormant economy/progression and mobile modules still on disk are therefore not certified as product capabilities. The separate relay smoke test verifies containment and reproducibility only; it does not prove server authority.

## Security, accessibility, and provenance impact

- Security/privacy: password collection and legacy credential retention removed; display names normalized/validated and rendered as text; no external application requests observed.
- Authority/abuse: misleading authority surfaces removed, but no authoritative runtime exists yet.
- Accessibility: the profile uses labels, error live regions, and keyboard-native controls; mobile receives a readable non-launch boundary. Full accessibility testing remains later work.
- Provenance/assets: no new external assets were added; baseline asset provenance gaps remain unchanged.

## Remaining issues

- The Vite build still reports a main-chunk size above the 500 kB warning threshold; Phase 1 did not perform code splitting or asset-budget work.
- Offline simulation, movement, combat, bot logic, procedural map, and current art are still legacy client-local implementations.
- Dormant legacy economy/progression/mobile files need later disposition and are outside the active-entry verifier boundary.
- Typecheck, lint, unit/contract/integration suites, deterministic simulation, and the aggregate release check remain Phase 2 and later work.
- Online authority, shared identity/persistence, economy, and production deployment remain unavailable and unapproved.

## Next slice

Phase 2 toolchain and contracts: incremental strict TypeScript, repeatable aggregate checks, canonical units/tick/deterministic RNG, versioned command/state/event and ruleset contracts, content/runtime validation, and Node-only pure simulation seams.

## User authority needed

None for local, reversible Phase 2 work. Any production deployment or external service/account action still requires explicit user authorization.
