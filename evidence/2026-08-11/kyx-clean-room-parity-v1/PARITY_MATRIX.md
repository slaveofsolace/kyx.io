# KYX.IO clean-room gameplay parity matrix

Working gate for product source `17f55d52c812b2d03a5ca5b32bdcc858c0dab94b` on 2026-08-12. Statuses describe the canonical product paths, not isolated fixtures or review routes.

Legend: `COMPLETE` is source-integrated and runtime-evidenced; `PARTIAL` exists but misses an acceptance-critical behavior; `MOCK` is simulated or presentation-only; `DISCONNECTED` is implemented outside the canonical loop; `MISSING` has no qualifying implementation.

| Surface | Status | KYX evidence | Clean-room target / next gate |
| --- | --- | --- | --- |
| Cold launch to play | COMPLETE | `/` mounts the authority-only canonical lobby. Its primary action routes a configured build to a fresh online Relay room and truthfully falls back to local 1+7 Practice when authority is unavailable. Installed-Chrome proof covers both decisions. Legacy `Game` remains reachable only through explicit historical/development paths. | Preserve through staging and verify the allocated room reaches controllable play. |
| Desktop input truth | COMPLETE | Desktop/touch launch detection and bounded pointer-lock recovery are integrated and source-matched in the current staging build. | Preserve; retest at 1440x900 and 1920x1080. |
| Local 8-player authority | COMPLETE | `LocalInkfallPracticeHost` creates one local player plus seven deterministic bots on the shared 20 Hz authority room. | Preserve while online population is closed. |
| Online shared authority | PARTIAL | The Durable Object owns movement, combat, snapshots, loadouts, damage, score, respawn, late join and resume. Installed Chrome proved 2/4/8 clients, human takeover, seven deterministic fill bots, three arena renderers and resume. The source-matched eight-client soak sustained 19.967 Hz, 30 ms tick p99 and converged a live kill 8/8. | Repeat the same checks against immutable remote staging and add shaped latency/jitter/loss. |
| Client prediction/reconciliation | PARTIAL | Full multiplayer proof covers predicted movement, authority reconciliation, snapshot acknowledgement and identity-preserving resume with token rotation. | Bound visible correction under representative latency/jitter/loss on remote staging. |
| Six-weapon combat | PARTIAL | Practice and online authority expose canonical slots 0-5 regardless of opening preset; invalid slot 6 fails closed. Installed Chrome selects, fires, consumes ammo and reloads every weapon, and the full browser suite is green. | Add per-weapon hit/headshot/kill and player-eye cadence/recoil/range evidence. |
| Abilities | PARTIAL | Blink plus Launch/impulse, smoke, flash and sticky throwable authority/presentation paths exist. Installed Chrome activates every selectable family through Breacher and Recon, proving IDs, acceptance counts, charges/cooldown and spawned effects. Blink quick taps are resolved synchronously from current authority state. | Prove recipient VFX/audio/rejection clarity and dense-combat readability. |
| Damage / death / respawn | PARTIAL | Server authority, reliable events and automatic respawn are integrated. Practice produces real damage/kills; the eight-client soak proves a live kill converges to every client. | Measure source-matched death-to-control timing and spawn safety on staging. |
| Score / kill feed / scoreboard | COMPLETE | Authority player ledger projects K/D/A to Practice and online; HUD kill feed and terminal result use authority data. | Preserve through rematch and reconnect. |
| Match clock / win / post-match | COMPLETE | Authority and both player-facing routes cover warmup, active, postmatch, completed, score/time results, terminal input latch and accessible result actions. | Preserve in remote staging and Human Eye evidence. |
| Next match momentum | COMPLETE | Practice atomically swaps to a fresh 1+7 authority match in the mounted runtime. Online allocates a fresh same-origin room, preserves the preset, replaces client/world in-shell and rotates the arena without page reload; allocation failure keeps the old terminal session usable. | Remote staging proof and Human Eye timing only. |
| Map breadth and rotation | PARTIAL | Relay, Switchyard and Crownpoint are original source-defined authority fixtures with distinct spawns, collision, elevation, landmarks, bot profiles and fixture-bound renderers. `a844d36`/`17f55d5` add distinct freight/signal and indigo/cyan/gold identities using render-only frames, orbital landmarks and signal fins; authority fixtures remain unchanged. Installed Chrome proves all renderers and deterministic fresh-room rotation. | Recapture the source-matched staging build and obtain Human Eye/traversal/combat acceptance on each map. |
| Map traversal / verticality | PARTIAL | Relay has multi-tier routes and portals; Switchyard and Crownpoint add distinct authority collision, landmarks, elevation and routes. Local Worker browser proof verifies spawn and movement. The prior staging capture proved movement on every layout, but its non-Relay player-eye read remained graybox-grade and did not prove full-route combat pressure. | Source-matched traversal/combat captures on every layout at representative desktop viewports. |
| Bots | PARTIAL | Practice and Worker share one deterministic combat brain. It now scores threats, finishes vulnerable enemies, disengages when critically wounded, uses weapon-specific spacing and ready Blink/abilities; Worker movement remains constrained to eight map-authored safe patrol lanes. App/Worker typechecks, 18 authority/integration tests and 19 Worker tests pass. | Add line-of-sight/cover routing, bounded difficulty tiers and remote combat/Human Eye evidence without reviving blind chase. |
| HUD / combat feedback | PARTIAL | Crosshair, health, ammo, score/time, cooldowns, damage, hit/headshot/kill and kill feed exist. | Stress readability under dense effects, damage and different resolutions. |
| Audio / VFX | PARTIAL | Weapon/ability/portal/damage presentation routing and audio manager paths exist. | Runtime mix, spatial ownership, recipient cues, captions and reduced-motion evidence. |
| Player/opponent presentation | PARTIAL | First/third-person armory presentation exists; current release default retains procedural fallback and review characters remain unaccepted. | One provenance-clear Assault character with Human Eye acceptance and contact/animation proof. |
| Pause / pointer-lock recovery | COMPLETE | Bounded raw-to-standard pointer-lock flow, denial/timeout/late-lock handling and result latching are integrated. | Preserve across rematch and online session transitions. |
| Reconnect / late join | COMPLETE | Deterministic resume restores player identity and snapshot state, rotates the token, handles loadout-lock races and survives the eight-client soak without eviction/backpressure. | Preserve under remote latency shaping. |
| Mobile truth | COMPLETE | Mobile/touch is explicitly unsupported rather than pretending to offer controls. | Keep the truthful unsupported screen in full browser coverage. |
| Performance budget | PARTIAL | Builds and renderer metrics exist; prior package audit reported large GLB/chunk payloads. | Cold/warm load, frame-time percentiles and combat-density budgets on staging. |
| Accessibility | PARTIAL | Keyboard focus, dialog semantics, captions/audio cues and settings hooks exist. | Full keyboard menus, contrast, reduced motion, non-audio cues, remap and text-scale run. |
| Persistence / settings | PARTIAL | Settings/loadout persistence exists locally; session resume exists online. | Corrupt-state recovery and version migration tests. |
| Asset provenance / release | PARTIAL | Provenance sentinels and staging package verifier exist; release closed-world package still fails closed on review GLBs and owner/license decisions. | Resolve asset ledger and distribution mode without promoting rejected review assets. |
| CSP / security | COMPLETE | Same-origin authority and the G9 control gate pass; local `blob:` URLs are classified as local rather than external. Release policy still fails closed on unrelated owner decisions. | Preserve after final package/deploy. |

## Current P0 implementation order

1. Build and package an immutable source-matched staging candidate.
2. Run remote health/allocation, authority lifecycle and three-map staging checks.
3. Perform Human Eye review of entry, combat, death/respawn, scoreboard, post-match and every arena.

## Explicit nonclaims

- This matrix does not claim visual, audio, accessibility, performance, map, character, release, or production acceptance.
- Prior ev.io observations are behavioral reference only. No ev.io code, protocol, assets, geometry, branding, audio or text are part of KYX.
- `PARTIAL` never means shippable; it means the underlying capability exists but its canonical integration or evidence is incomplete.
