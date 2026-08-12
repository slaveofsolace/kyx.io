# KYX.IO clean-room gameplay parity matrix

Working gate for source `31e24cefd905bd3f1282119e55d110dba0f6c57b` on 2026-08-12. Statuses describe the canonical product paths, not isolated fixtures or review routes.

Legend: `COMPLETE` is source-integrated and runtime-evidenced; `PARTIAL` exists but misses an acceptance-critical behavior; `MOCK` is simulated or presentation-only; `DISCONNECTED` is implemented outside the canonical loop; `MISSING` has no qualifying implementation.

| Surface | Status | KYX evidence | Clean-room target / next gate |
| --- | --- | --- | --- |
| Cold launch to play | COMPLETE | `/` mounts the authority-only canonical lobby. Its primary action routes a configured build to a fresh online Relay room and truthfully falls back to local 1+7 Practice when authority is unavailable. Installed-Chrome proof covers both decisions. Legacy `Game` remains reachable only through explicit historical/development paths. | Preserve through staging and verify the allocated room reaches controllable play. |
| Desktop input truth | COMPLETE | Desktop/touch launch detection and bounded pointer-lock recovery are integrated and source-matched in the current staging build. | Preserve; retest at 1440x900 and 1920x1080. |
| Local 8-player authority | COMPLETE | `LocalInkfallPracticeHost` creates one local player plus seven deterministic bots on the shared 20 Hz authority room. | Preserve while online population is closed. |
| Online shared authority | PARTIAL | Durable Object owns movement/combat/snapshots/reconnect/late join/loadouts/damage/score/respawn. Relay starts as eight stable authority slots: one human plus seven server bots, deterministic human takeover, reconnect reservation, exact checkpoint/scoreboard coverage, and safe map-authored patrols. An eight-browser source-matched local proof completed. | Remote staging proof; add representative latency/reconnect and bot checkpoint rehydration coverage. |
| Client prediction/reconciliation | PARTIAL | Online client has prediction, interpolation, resume and snapshot acknowledgement coverage. | Add representative latency/jitter/loss gameplay proof and bound visible correction. |
| Six-weapon combat | PARTIAL | Practice and online authority now expose the canonical slots 0-5 regardless of opening role preset; invalid slot 6 still fails closed. A focused installed-Chrome run selected and exercised fire/ammo/reload semantics for all six before a later test-only restoration assertion failed, and the restoration correction is statically green. | Repeat the corrected full browser contract once in the consolidated gate, then add hit/headshot/kill and player-eye feel evidence for every weapon. |
| Abilities | PARTIAL | Blink, Launch/impulse, smoke/flash/sticky throwable authority and presentation paths exist. Practice diagnostics now expose canonical IDs, activation counts, charges, cooldowns and spawned effects. Installed Chrome confirmed the correct role loadout IDs; the activation loop itself remains unproven after a test-only ID mismatch consumed the bounded retry. | Run the corrected activation contract in the consolidated browser gate, then prove recipient VFX/audio/rejection behavior. |
| Damage / death / respawn | PARTIAL | Server authority, reliable events and local auto-respawn are integrated; Practice bots produce real damage/kills. | Measure death-to-control timing, spawn safety and online two-client behavior. |
| Score / kill feed / scoreboard | COMPLETE | Authority player ledger projects K/D/A to Practice and online; HUD kill feed and terminal result use authority data. | Preserve through rematch and reconnect. |
| Match clock / win / post-match | PARTIAL | Warmup, active, postmatch, completed and score/time results exist in authority, Practice and online presentation. | Continue into the next match without a page reload and prove automatic/manual transition. |
| Next match momentum | PARTIAL | Practice prepares and atomically swaps to a fresh 1+7 authority match inside the mounted runtime. Online now allocates a fresh same-origin room and replaces the completed client/world in the existing shell. Both preserve the selected preset and fail closed on replacement errors. | Prove both transitions in source-matched desktop and remote runtime evidence; keep the old session usable when allocation itself fails. |
| Map breadth and rotation | PARTIAL | Relay, Switchyard and Crownpoint are three original, source-defined authority fixtures with distinct spawns, bot profiles and fixture-bound renderers. Fresh-room continuation rotates Relay -> Switchyard -> Crownpoint deterministically. Installed Chrome joined and moved in both new maps with seven Worker bots. | Prove an actual match-ending next-match transition through all three, then complete Human Eye acceptance and remote staging proof. |
| Map traversal / verticality | PARTIAL | Relay has multi-tier routes and portals; Switchyard and Crownpoint add distinct authority collision, landmarks, elevation and routes. Local Worker browser proof verifies spawn and movement, but not full-route combat pressure or Human Eye acceptance. | Source-matched traversal/combat captures on every layout at representative desktop viewports. |
| Bots | PARTIAL | Practice and Worker share one deterministic combat brain. It now scores threats, finishes vulnerable enemies, disengages when critically wounded, uses weapon-specific spacing and ready Blink/abilities; Worker movement remains constrained to eight map-authored safe patrol lanes. App/Worker typechecks, 18 authority/integration tests and 19 Worker tests pass. | Add line-of-sight/cover routing, bounded difficulty tiers and remote combat/Human Eye evidence without reviving blind chase. |
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

1. Prove the corrected six-weapon and role-ability browser contracts in the consolidated run.
2. Prove actual win -> post-match -> fresh-room map rotation without a page reload.
3. Run source-matched remote lifecycle, latency/reconnect, performance and Human Eye gates.

## Explicit nonclaims

- This matrix does not claim visual, audio, accessibility, performance, map, character, release, or production acceptance.
- Prior ev.io observations are behavioral reference only. No ev.io code, protocol, assets, geometry, branding, audio or text are part of KYX.
- `PARTIAL` never means shippable; it means the underlying capability exists but its canonical integration or evidence is incomplete.
