# KYX.IO final-completion gap matrix

Date: 2026-08-24  
Source checkpoint inspected: `ff261ea994181f6243c8a82baa4f327f380394c2` plus Worker preview batch 05
Classification: exact current-source inventory; historical documents are not treated as current runtime proof

## Current verified playable core

- Worker-authoritative 20 Hz rooms, input validation, replay/reconnect state, room restart checkpoints, rate limits, reliable events, delta snapshots, movement, combat, damage, death, respawn, score, results, and three-arena rotation exist.
- Relay, Switchyard, and Crownpoint have distinct authority map bindings and browser-visible renderers.
- The shipping player route remains `team_deathmatch`. The Worker now also has an explicit, restart-safe Free For All preview runtime on persistent authority maps; it is not exposed by the menu or gateway. Both use the lifecycle lobby, warmup, active, postmatch, and completed; terminal reasons are score limit and time limit.
- Six Worker-authoritative weapon families exist: rifle, sidearm, shotgun, sniper, rocket, and melee. Local/offline presentation defines 20 procedural weapon variants, but those variants are not a shared online authority catalog.
- Six server-modeled abilities exist: Blink, Launch, Frag, Smoke, Sticky, and Flash. Blink is fixed and three of the other five are selectable.
- Local Relay practice has deterministic bots and shares substantial movement/combat/presentation code with online play.

## Exact completion gaps

| Product area | Current source truth | Required completion |
| --- | --- | --- |
| Arenas | Relay, Switchyard, Crownpoint rotate online. Inkfall revisions remain inspection/development material. | Human-accept all three shipping arenas; author and accept one original large Battle Royale arena plus mode-specific objective/spawn/navigation data. |
| Modes | The player route exposes TDM only. FFA is a `worker_preview_runtime` with fail-closed public selection, versioned mode persistence, Relay multi-client play, and active restart proof, but no menu/gateway/practice/browser/HUD acceptance. Other required identities are fail-closed foundation definitions. `src/core/GameModes.js` offers offline deathmatch and a local zombie-labeled practice mode; these are not the online contract. | Add negotiated mode to the shared client contract, route and fully accept FFA, then implement Instagib, CTF, Search and Destroy, Last Team Standing, Survival, Zombie Survival, Battle Royale, and custom/private rule loops; every loop must cover objective, elimination/respawn, result, rematch, rotation, reconnect, and spectator behavior. |
| Spectating/rematch | Reconnect and three-arena continuation exist. No authority spectator role or player-voted/requested rematch contract exists. | Server-owned spectator permissions/camera targets, join-in-progress policy, elimination transition, rematch consensus, and abuse/reconnect tests. |
| Weapons | Six online families; 20 offline procedural definitions. Online equip/reload/ammo/contact/recoil presentation exists, but online and offline inventories are not one catalog. | Add burst/beam, SMG, grenade launcher, guided launcher, pickups/loot tiers, and reconcile one shared practice/online weapon contract and player-eye acceptance. |
| Abilities/upgrades | Blink, Launch, Frag, Smoke, Sticky, Flash. | Double/triple jump, stamina and movement upgrades, proximity/trip mines, handling/ammo upgrades, pickups, persistence, and shared practice/online acceptance. |
| Accounts | `UserAccount.js` deliberately stores only a local guest display name and removes legacy browser credentials. | Optional username/passkey identity, recovery codes, one-time guest-progress claim, authenticated sessions, revocation, recovery and replay/rate-limit tests. |
| Persistence | No D1 binding or product D1 schema. Durable Object SQLite persists room runtime/reconnect/loadout checkpoints only. | D1 profiles, loadouts, achievements, match history, inventory, cosmetics, credits, leaderboards, clans, blocks/mutes/reports, maps, migrations, restart tests, and retention policy. |
| Progression/store | `Achievements.js`, `BattlePass.js`, and `Shop.js` are legacy localStorage-only/client-authorable UI code. They are not valid authority or persistent-product implementations. | Replace or disable client-authored progression; consume only signed, idempotent match receipts; play-earned soft-credit cosmetics only; rejection/replay/restart tests. Premium battle-pass semantics are outside the target. |
| Parties/social/moderation | Room Durable Objects exist; party, clan, block, mute, report, and moderation services do not. | Party Durable Object, authenticated membership/invites, D1 social graphs and moderation queues, abuse/rate-limit/restart tests. |
| Map editor | Runtime package validation and development inspection routes exist; there is no authenticated product editor or publication workflow. | Modular editor, private playtest, deterministic validation, versioning, moderation, rollback, approval, and public listing. |
| Receipts/security | Room authority owns match truth, but no signed authority match-receipt issue/consume path exists. | Versioned signed receipt, key rotation, expiry, idempotency, D1 transaction consumption, duplicate/tamper/restart/adverse-network tests. |
| Assets/rights | Release package currently ships zero provenance-bearing binary assets and six historical candidates remain quarantined. | Every newly considered external candidate must pass Resource Pilfer; no candidate is release-admitted without license chain, quarantine inspection, runtime proof, human acceptance, and ledger admission. |
| Acceptance | Typecheck/lint/unit/Worker/build/browser/multiplayer gates are green for the current slice. | Per-feature positive/rejection/reconnect/restart matrices; source-frozen 2/4/8; real 30-minute soak; adverse network; performance/cost; desktop/ultrawide/narrow/high-contrast/reduced-motion/controller; Human Eye and Human Brain passes. |

## Preserved-history reconciliation

The six non-equivalent commits on the old integration re-audit line were compared against the current tree. Their runtime, release-audit, multiplayer, and soak files are older or superseded by the current implementations. One proven unique artifact remained: `tests/browser/weapon-model-catalog.spec.ts` from commit `86870ee1d74eb5421e70fdf8187bef3f52f2daad`. It was restored unchanged and passes in both configured browser projects. No stale runtime or release claim was imported.

## Coherent implementation order

1. Remove current security/toolchain audit findings without changing gameplay dependency majors.
2. Define and integrate an authority-owned mode/rules contract, beginning with FFA and Instagib through the existing deathmatch lifecycle, then objective and elimination policies.
3. Add spectator/rematch/custom-room contracts so every subsequent mode inherits the full lifecycle.
4. Reconcile the shared weapon/ability/pickup contract and build the Battle Royale arena and rules.
5. Add identity, signed match receipts, D1 progression, parties/social/moderation, then the authenticated editor.
6. Complete source-frozen soak/performance/accessibility and human gameplay acceptance before any release decision.

## Nonclaims

- This matrix is not a claim that the requested final product is complete.
- Automated green status is not human visual or gameplay acceptance.
- No deployment, release, project-license selection, third-party entitlement acceptance, or external asset admission occurred.
