# KYX.IO clean-room gameplay parity matrix

Working gate for source `6d9ad20f370a0e7b29871c12d5dccf80f169e16a` on 2026-08-11. Statuses describe the canonical shipped paths, not isolated fixtures or review routes.

Legend: `COMPLETE` is source-integrated and runtime-evidenced; `PARTIAL` exists but misses an acceptance-critical behavior; `MOCK` is simulated or presentation-only; `DISCONNECTED` is implemented outside the canonical loop; `MISSING` has no qualifying implementation.

| Surface | Status | KYX evidence | Clean-room target / next gate |
| --- | --- | --- | --- |
| Cold launch to play | PARTIAL | `/` launches a menu, `/practice` is the current playable authority route, and `/online` is a separate preview. `src/main.js` still mounts legacy `Game` on the default document. | One canonical product path with one clear play action and no competing legacy simulation. |
| Desktop input truth | COMPLETE | Desktop/touch launch detection and bounded pointer-lock recovery are integrated and source-matched in the current staging build. | Preserve; retest at 1440x900 and 1920x1080. |
| Local 8-player authority | COMPLETE | `LocalInkfallPracticeHost` creates one local player plus seven deterministic bots on the shared 20 Hz authority room. | Preserve while online population is closed. |
| Online shared authority | PARTIAL | Durable Object room owns movement/combat/snapshots, reconnect, late join, loadouts, damage, score and respawn. Match start still depends on human connections and has no server bot fill. | Fill open slots deterministically on the Worker and replace bots as humans join without trusting clients. |
| Client prediction/reconciliation | PARTIAL | Online client has prediction, interpolation, resume and snapshot acknowledgement coverage. | Add representative latency/jitter/loss gameplay proof and bound visible correction. |
| Six-weapon combat | PARTIAL | Six authority slots and differentiated weapon profiles exist; preset restrictions and several focused tests exist. Canonical player-facing runtime exposes role-owned subsets rather than proving every weapon in one session. | Deterministic fire/reload/swap/empty/hit/headshot/kill tests for all six, plus runtime feel evidence. |
| Abilities | PARTIAL | Blink, Launch/impulse, smoke/flash/throwable authority and presentation paths exist. | Exercise every selectable ability from user and recipient perspectives with cooldown, rejection, VFX and audio evidence. |
| Damage / death / respawn | PARTIAL | Server authority, reliable events and local auto-respawn are integrated; Practice bots produce real damage/kills. | Measure death-to-control timing, spawn safety and online two-client behavior. |
| Score / kill feed / scoreboard | COMPLETE | Authority player ledger projects K/D/A to Practice and online; HUD kill feed and terminal result use authority data. | Preserve through rematch and reconnect. |
| Match clock / win / post-match | PARTIAL | Warmup, active, postmatch, completed and score/time results exist in authority, Practice and online presentation. | Continue into the next match without a page reload and prove automatic/manual transition. |
| Next match momentum | PARTIAL | Practice now prepares and atomically swaps to a fresh 1+7 authority match inside the mounted runtime, preserving the preset and only disposing the completed host after success. Online still navigates to a new create URL. | Prove the Practice transition in-browser, then create/rejoin the online replacement room without reloading the shell. |
| Map breadth and rotation | MISSING | Relay is the product default. Inkfall revisions and Iron Bastion exist as legacy/review/compatibility paths, not three accepted canonical maps with rotation. | Three independent layouts with authority fixtures, visual identity, spawn proofs, rotation and player-eye acceptance. |
| Map traversal / verticality | PARTIAL | Relay has multi-tier routes and portals with authority collision; prior captures found route/readability problems and later source corrections. | Source-matched full traversal and combat-pressure evidence on every accepted layout. |
| Bots | PARTIAL | Practice bots aim in yaw/pitch, choose range behavior, fire, strafe, jump, use abilities and rotate four presets. They are absent from Worker rooms and do not yet prove strategic navigation/cover. | Shared deterministic server bot agent with navigation, target/cover decisions and bounded difficulty. |
| HUD / combat feedback | PARTIAL | Crosshair, health, ammo, score/time, cooldowns, damage, hit/headshot/kill and kill feed exist. | Stress readability under dense effects, damage and different resolutions. |
| Audio / VFX | PARTIAL | Weapon/ability/portal/damage presentation routing and audio manager paths exist. | Runtime mix, spatial ownership, recipient cues, captions and reduced-motion evidence. |
| Player/opponent presentation | PARTIAL | First/third-person armory presentation exists; current release default retains procedural fallback and review characters remain unaccepted. | One provenance-clear Assault character with Human Eye acceptance and contact/animation proof. |
| Pause / pointer-lock recovery | COMPLETE | Bounded raw-to-standard pointer-lock flow, denial/timeout/late-lock handling and result latching are integrated. | Preserve across rematch and online session transitions. |
| Reconnect / late join | PARTIAL | Resume tokens, snapshot restore/full snapshot and late join paths are implemented and tested at protocol level. | Live two-client disconnect/reconnect proof during combat and post-match transition. |
| Mobile truth | COMPLETE | Mobile/touch is explicitly unsupported rather than pretending to offer controls. | Keep the truthful unsupported screen in full browser coverage. |
| Performance budget | PARTIAL | Builds and renderer metrics exist; prior package audit reported large GLB/chunk payloads. | Cold/warm load, frame-time percentiles and combat-density budgets on staging. |
| Accessibility | PARTIAL | Keyboard focus, dialog semantics, captions/audio cues and settings hooks exist. | Full keyboard menus, contrast, reduced motion, non-audio cues, remap and text-scale run. |
| Persistence / settings | PARTIAL | Settings/loadout persistence exists locally; session resume exists online. | Corrupt-state recovery and version migration tests. |
| Asset provenance / release | PARTIAL | Provenance sentinels and staging package verifier exist; release closed-world package still fails closed on review GLBs and owner/license decisions. | Resolve asset ledger and distribution mode without promoting rejected review assets. |
| CSP / security | PARTIAL | Same-origin authority and security gates exist; prior G9 audit had a `blob:` CSP policy/audit mismatch. | Reconcile policy and gate, then rerun G9. |

## Current P0 implementation order

1. Replace Practice page reload with an in-runtime authoritative rematch.
2. Reuse the transition contract for online fresh-room re-entry without reloading the shell.
3. Move deterministic bot fill into shared authority and run it in Worker rooms.
4. Retire the default legacy `Game` path only after the canonical route proves cold-launch through next-match.

## Explicit nonclaims

- This matrix does not claim visual, audio, accessibility, performance, map, character, release, or production acceptance.
- Prior ev.io observations are behavioral reference only. No ev.io code, protocol, assets, geometry, branding, audio or text are part of KYX.
- `PARTIAL` never means shippable; it means the underlying capability exists but its canonical integration or evidence is incomplete.
