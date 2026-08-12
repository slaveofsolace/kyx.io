# KYX.IO canonical runtime map

Source checkpoint: `ce6500d` on `agent/relay-playable-slice-wip` (2026-08-12). This map separates product runtime code from retained compatibility, review, fixture, and development surfaces.

| Surface | Canonical path | Supporting authority/runtime | Classification and note |
| --- | --- | --- | --- |
| Browser entry | `src/main.js` -> `src/app/canonicalLobbyRoute.ts` | `src/app/onlineAuthorityAvailability.ts` | CANONICAL. `/` chooses configured online play or the same authority-backed offline Practice loop. |
| Local play | `src/app/localInkfallPracticeRoute.ts` | `src/authority/localInkfallPracticeHost.ts`, `src/app/localInkfallPracticeInput.ts`, `src/app/onlineAuthorityThreeRuntime.ts` | CANONICAL offline fallback. One local player plus seven deterministic authority bots; no legacy `Game` scoring authority. |
| Online lobby/session | `src/app/onlineAuthorityRoute.ts` | `src/app/onlineAuthorityRoomApi.ts`, `src/dev/authorityEvidenceClient.ts`, `src/dev/authorityEvidenceTransport.ts` | CANONICAL configured runtime. Same-origin room create/verify/join, input, prediction, resume, result, and in-shell continuation. The `authorityEvidence*` names are historical; these modules are product-connected. |
| Server authority | `worker/index.ts`, `worker/room.ts` | `src/authority/room.ts`, `src/authority/inkfallRoomFactory.ts`, `worker/resumeSessions.ts` | CANONICAL. Durable Object owns movement, loadout, combat, life, score, clock, bots, checkpoints, resume and snapshots. |
| Networking | `src/net/protocol.ts`, `src/net/schemas.ts` | `src/client/netcode/*`, `src/app/onlineAuthorityResumeSession.ts` | CANONICAL. Versioned full/delta snapshot and reliable-event path; prediction/interpolation/reconciliation are client-only presentation, never score authority. |
| Player movement/aim | `src/sim/movement/*`, `src/sim/step.ts`, `src/sim/commands.ts` | local/online input bridges and `src/app/movement/*` | CANONICAL deterministic 20 Hz authority movement with browser prediction and bounded pointer-lock recovery. |
| Weapons | `src/authority/combat/weaponFoundation.ts`, `src/authority/combat/weaponCatalog.ts`, weapon-specific authority modules | `src/app/onlineWeaponPresentationFx.ts`, `src/weapons/*` | CANONICAL authority armory slots 0-5. Some `src/weapons/*.js` code also supports the retained legacy client and must not be treated as authority. |
| Abilities | `src/authority/combat/abilityLoadoutRuntime.ts`, `abilityResources.ts`, `impulseGrenade.ts` | `src/abilities/*`, Blink in `src/sim/movement/controller.ts`, presentation routing in app | CANONICAL authority cooldown/charge/projectile/smoke/flash path. Review/resource fixtures are not separate gameplay implementations. |
| Damage/life/respawn | `src/authority/combat/combatLife.ts`, hitscan/projectile integrations in `src/authority/room.ts` | Worker/local zero-trust input and respawn orchestration | CANONICAL. Server resolves hits, damage, assists, death, protection and respawn. |
| Score/match lifecycle | `src/authority/combat/tdmMatch.ts` | `src/app/authorityHudProjection.ts`, local/online result dialogs | CANONICAL 40-kill / eight-minute TDM with warmup, post-match, K/D/A, fresh match continuation. |
| Bots | `src/authority/deterministicCombatBot.ts` | `worker/relayBotSlots.ts`, local host | CANONICAL shared combat brain. Adaptive threat/health/range tactics feed Practice movement or Worker map-safe patrol lanes. `src/entities/BotManager.js` is LEGACY client simulation. |
| Maps/rotation | `src/authority/relayAuthority.ts`, `src/authority/originalArenaAuthority.ts` | `src/app/relayVisualContinuity.ts`, `originalArenaVisualContinuity.ts`, `onlineAuthorityProfiles.ts`, `onlineArenaRotation.ts`, Worker profile bindings | CANONICAL: Relay, Switchyard, Crownpoint. Rotation is fresh-room and deterministic. Inkfall and locked-graybox routes are COMPATIBILITY/REVIEW only. |
| HUD/results | local/online routes plus `src/app/authorityHudProjection.ts` | `src/ui/HUD.js`, `src/ui/CaptionCueOverlay.js` | CANONICAL player-facing data is projected from authority snapshots/events. |
| Audio/VFX | `src/app/onlineWeaponPresentationFx.ts`, ability/presentation routers, `src/core/AudioManager.js` | Three runtime and caption overlay | CONNECTED but acceptance PARTIAL: event ownership exists; dense-combat mix and recipient clarity still need player-eye evidence. |
| Persistence | `src/core/GameSettings.js`, `src/core/Loadout.js`, `src/app/onlineAuthorityResumeSession.ts` | browser local/session storage | CANONICAL local settings/loadout and bounded online resume. Account progression is MISSING. |
| Cloudflare | `wrangler.toml`, `worker/*`, `cloudflare/pages-preview/functions/*` | package/verifier scripts under `tools/` | CANONICAL staging path. Production deployment remains forbidden by the current goal. |
| Tests | `tests/unit`, `tests/integration`, `tests/worker`, `tests/multiplayer`, `tests/browser`, `tests/accessibility` | Playwright/Vitest configs | MIXED. Runtime tests are evidence only; `__test__` browser routes and fixture builders never count as product capability. |
| Packaging/provenance | `package.json`, `vite.config.*`, `tools/verify-*`, provenance ledgers | staging-review build mode | CONNECTED, release-blocked. Review GLBs and unresolved owner/license/distribution decisions remain fail-closed. |

## Retained noncanonical surfaces

- `src/core/Game.js`, `src/entities/BotManager.js`, and its old managers are a legacy client simulation. It is not the authority source of truth and is excluded from the canonical primary route.
- `src/app/inkfallRev3ReviewRoute.ts`, `pressHallInspectionRoute.ts`, `lockedGrayboxPreviewRoute.ts`, and explicit review installers are inspection-only.
- `src/app/*TestRoute.ts`, `/__test__/*`, development movement bridges, and evidence scripts are fixture/development surfaces.
- Inkfall revision profiles remain compatibility paths for old room links. They do not count toward the accepted three-map product rotation.
- Blender character revisions and their evidence/model roots are unrelated preserved WIP. None is promoted by this gameplay batch.

## Consolidation rule

New gameplay behavior belongs in the shared authority/simulation modules above and must be consumed by both local Practice and Worker rooms. Do not reconnect legacy `Game.js`, clone combat logic into route code, or count presentation fixtures as server behavior.
