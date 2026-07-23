# ADR-009 — Identity, persistence, and economy boundary

- Status: Accepted
- Date: 2026-07-19 (America/Chicago)
- Baseline commit: `81aa1d02acce8e30ba411bb895901d2d2ac6694e`
- Scope: P1.1–P1.8 and G1 truthful/safe shell

## Context

The baseline application was a local client that presented password-based accounts, placeholder advertising, human-like bot presence, online-player counts, and client-local economy/progression as though those surfaces were backed by a real service. Its optional WebSocket relay trusted client-authored kills and did not simulate movement or combat. None of those paths established account, match, inventory, or currency authority.

Phase 1 must make the currently runnable product honest and contain unsafe paths without pretending that later multiplayer, simulation, art, or release work is complete.

## Decision

| Backlog item | Accepted decision |
|---|---|
| P1.1 | Replace login and registration with one password-free Local Guest Profile flow. Persist only `{ kind: "local_guest", version: 1, displayName }` under `kyx_local_profile`. A one-way migration may retain a validated display name from the active or sole legacy account, but it scrubs `sio_accounts` and `sio_session` from local/session storage and never migrates credentials, stats, currency, or progression. |
| P1.2 | Disable advertising in product configuration and remove ad scripts, slots, provider identifiers, external fonts, and other third-party subresources from active entry pages. No advertising provider is configured. |
| P1.3 | Present the current match only as **Offline Practice**: one local player, seven explicitly named `PRACTICE BOT NN` opponents, and an eight-minute local round. Online Match is visible only as disabled/unavailable. Remove fabricated join/leave events, human-slot state, public-lobby language, randomized bot scores, and online population claims. |
| P1.4 | Set economy authority to `none` and remove economy, store, battle-pass, achievement, rarity-perk, inventory, and currency mutation/UI paths from the active production entry graph. Local loadout and settings remain device-local conveniences, not shared progression. |
| P1.5 | Show `KYX.IO 1.0.0-phase1 · LOCAL DEV · OFFLINE PRACTICE` only when `import.meta.env.DEV` and desktop launch support are both true. Production builds do not populate or reveal the diagnostic output. |
| P1.6 | Eliminate `innerHTML` and `insertAdjacentHTML` use under `src/`. Dynamic names and results use validated values plus `textContent`; repeated UI uses `replaceChildren` and explicit DOM/SVG construction. |
| P1.7 | Remove the relay from the browser path and delete the active `NetClient`/`ServerSim` modules. Preserve `server/` only as a loopback comparison fixture: hard-coded `127.0.0.1`, direct locked `ws` dependency, the explicit `legacy:relay` command, a non-authoritative banner, and no public-host override. The historical deployment workflow filename remains, but its contents perform only a manual static build verification and consume no deployment secrets. |
| P1.8 | Make the launch desktop keyboard/mouse only. Unsupported mobile/coarse-pointer clients do not construct `Game`; they receive a Desktop Required boundary. The old touch-control source remains unreachable and has no active markup or styling. |

`PRODUCT_CONFIG` is the executable containment declaration: `launchMode: "offline_practice"`, one local player, seven bots, eight minutes, advertising disabled, economy disabled with authority `none`, legacy relay disabled, and desktop-only launch.

## Authority boundaries

Phase 1 adds no server authority. Offline Practice owns facts only inside one local browser process. Its score, bots, loadout, and profile are not online identity, shared persistence, matchmaking, anti-cheat, or authoritative progression.

The legacy relay remains explicitly non-authoritative. It accepts historical client-authored messages and is retained only to reproduce the old protocol and its failure modes on loopback. A future online path still requires fixed-tick server simulation, validated input commands, server-owned movement/collision/combat/scoring, versioned protocol contracts, staging evidence, and the authority gates from ADR-001.

## Verification boundary

`tools/verify/truth-surface.mjs` follows the active import graph rooted at `src/main.js`, `src/loginPage.js`, and `src/registerPage.js`, checks the three source pages, and recursively checks the JavaScript/CSS emitted from the three built pages. Its 54 checks cover configuration, password-free profile surfaces, active-source and emitted-runtime containment, same-origin markup, and build freshness.

The static result does **not** certify unreachable legacy source, `server/`, evidence files, binary assets, or source maps. Dormant files such as `src/core/Shop.js`, `src/core/BattlePass.js`, `src/core/Achievements.js`, `src/core/RarityPerks.js`, `src/ui/InventoryPanel.js`, and `src/ui/MobileControls.js` may remain for later disposition but are not launchable product capabilities. Bundled third-party code is checked with high-signal leak signatures rather than generic vocabulary. The legacy relay is checked separately by its 28-check loopback smoke test.

## Alternatives rejected

- Keeping local passwords and labeling them prototype accounts: credential collection would still imply security and identity guarantees that do not exist.
- Renaming bots without removing population, join, or score fabrication: the overall product claim would remain misleading.
- Exposing the legacy relay as early multiplayer: loopback containment does not make client-authored kills authoritative.
- Deleting every legacy module immediately: broad deletion would increase regression risk before replacement seams and tests exist.
- Launching the dormant touch path: desktop quality and authority gates have not passed.
- Reusing the historical deployment workflow for production: production deployment remains explicitly unauthorized.

## Consequences

- The runnable product is narrower but truthful: local profile, local loadout/settings, and Offline Practice only.
- Online play, ads, economy, progression, and mobile launch cannot be restored with copy alone; each requires an approved design and its own authority, security, accessibility, and QA evidence.
- Dormant source remains technical debt with an explicit exclusion boundary, not hidden shipped functionality.
- The production bundle still exceeds Vite's 500 kB chunk-warning threshold; Phase 1 records but does not solve bundle splitting or asset budgets.

## Validation

- The production build plus `tools/verify/truth-surface.mjs`, executed with the pinned bundled Node runtime, reported **54 passed, 0 failed**.
- `tools/verify/legacy-relay-smoke.mjs`, executed with the same runtime, reported **28 passed, 0 failed** and terminated its exact child process.
- Development capture at `127.0.0.1:4173`: **75/75** browser checks passed.
- Production-preview capture at `127.0.0.1:4174`: **75/75** browser checks passed.
- Both captures covered fresh/returning/local-migration profile flows, same-origin requests, no application WebSocket, Offline Practice HUD/nameplates/scoreboard, no fabricated currency, and the mobile Desktop Required boundary.
- Manual screenshot review found the map-intro card and practice-launch card visible together. Profile/menu initialization was deferred until the intro dismissed, and both evidence suites were recaptured. A second review found the dev-only diagnostics chip overlapping the bottom-left health HUD; it was moved to a clear top-left position and suppressed on unsupported mobile, then the application was rebuilt and both suites were recaptured again.

Evidence and hashes are indexed in `evidence/2026-07-19/phase-1-truth/README.md`.

## Reversal strategy

Containment is implemented at entry-graph and configuration seams. A later authoritative service can replace the local profile/match adapters without reviving misleading UI. Re-enabling any quarantined path requires its own accepted ADR and evidence; reverting to password collection, fake online presence, client-owned economy, public relay exposure, or mobile launch is not an acceptable rollback.
