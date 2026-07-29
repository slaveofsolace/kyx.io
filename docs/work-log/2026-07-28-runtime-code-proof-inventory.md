# KYX.IO runtime and code proof inventory

Date: 2026-07-28
Canonical branch: `main`
Audited commit: `d4e0217f7bda3c7fb16376a07f9b389981a869c2` plus the explicitly listed
uncommitted integration fixes
Disposition: active integration checkpoint, not a release or visual acceptance

## Proof vocabulary

- **Built** means executable code or a runtime asset exists in the canonical
  working tree.
- **Automated proof** means a relevant test, build, schema check, or structural
  inspection executed successfully.
- **Runtime proof** means the behavior was directly observed through the running
  product or a real multi-client harness.
- **Accepted** means the project owner explicitly approved the visible or audible
  result. Code and tests cannot grant this status.

## Current validation anchor

- The consolidated pre-heartbeat app run passed 111 files / 831 tests.
- The consolidated Worker run passed 13 files / 49 tests.
- App, Worker, simulation-source, and simulation typechecks passed.
- ESLint passed.
- Production and staging Vite builds passed at 205 transformed modules.
- The current 8-player authority snapshot is 11,087 bytes, down from 23,302
  bytes, under the unchanged 16,384-byte protocol cap.
- The later lobby-heartbeat fix passed its focused 12-test client suite, app
  typecheck, and a live in-app browser check that remained `JOINED` for more
  than 36 seconds.
- These checks prove engineering properties. They do not accept UI, map art,
  model appearance, animation, weapon contact, sound quality, or gameplay feel.

## Product inventory

| Area | What is built | Best current proof | What remains or is uncertain |
|---|---|---|---|
| Offline practice | Menu, loadout, practice modes, bots, HUD, pause/settings, game over, leaderboard, movement, weapons, abilities, audio, VFX | Broad app tests and historical browser captures | Current final-source full playthrough has not been human accepted; practice and online presentation still diverge |
| Online room flow | Create/join room, protocol-v2 WebSocket, fail-closed identity/profile checks, authoritative snapshots/events, combat room, resume-token rotation | Live Rev5 room loaded locally; Worker suite and real eight-client soak passed | Current local integration is not deployed; external staging/capacity proof on this exact source is open |
| Idle online connection | Joined clients now send a bounded protocol ping even while a solo room remains in `lobby` | `tests/unit/dev/authorityEvidence.test.ts`; live browser remained `JOINED` past the former 30-second timeout | Longer idle/hibernation and deployed-network verification still open |
| Online movement | Deterministic 20 Hz Rapier capsule controller: walk, sprint, crouch, jump, coyote time, buffer, slide, air steering, step/slope handling | Movement unit/integration suites and historical population proof | Active profile is still named a hypothesis/fixture and has no human ev.io-feel approval; offline and online tuning differ |
| Reconnect/resume | Player/match/movement/life/armory/abilities/projectiles/smoke/reliable events persist; token rotates; identity mismatch fails closed | Worker reconnect tests and historical real-client resume proof | No current Rev5 portal-traverse then disconnect/resume/event-dedup runtime proof |
| Inkfall Foundry Rev5 | 2.8 MB render-only GLB, 23 meshes, 41,780 triangles, 11 materials over frozen Rev3 authority | Build manifest, ten authored renders, live browser reports 23 render meshes | Still a clean modular/blockout-like art direction; no human fun/readability/final-visual acceptance |
| Map authority | Frozen Rev3 package: 339 colliders, 12 declared spawns, 9 zones, empty pickup set | Profile validation, collision tests, historical Rev4 2/4/8 run | Fresh source-frozen Rev5 2/4/8 3D performance/play proof is absent; spawn fallback can still choose an exposed candidate if every option fails LOS |
| World portal | Paired lower/upper portal, edge-entry, safe destination/headroom/ground/kill-volume checks, cooldown/no ping-pong, reliable event, VFX/audio/caption | Portal unit tests and presentation-wire tests | No live Worker/browser traversal capture; portal versus Blink cooldown policy still needs a design decision |
| Weapon authority | Six online families: rifle, pistol, shotgun, sniper, rocket, melee; server-owned cadence, ammo, reload/equip, rewind, occlusion, barrel clearance, projectiles and melee | Weapon, rewind, room, Worker, and snapshot tests | No online ADS/scope path found; full six-family combat has no current human runtime acceptance |
| Online weapon art | Six distinct procedural Three.js models with real muzzle or blade-tip nodes, reload motion, flashes, tracers/pellets, rocket backblast/trail, melee arc | Six-weapon geometry gallery and source contracts | Gallery is presentation-only; models are procedural rather than artist-authored; contact/scale/readability still need live review |
| Offline weapons | Twenty definitions spanning hitscan, pellet, rocket, melee, ADS/recoil/projectiles/splash | Weapon source and app tests | Critical visible bug: the retained Rev17 first-person rifle hides every non-melee model, so different guns can all look like the same rifle; melee lacks an accepted first-person hand/grip |
| Headshots/combat feedback | Server analytic head/torso/limb volumes, family multipliers, distinct headshot markers/damage/kill feed; practice compact kill card and Tab scoreboard | Rewind/presentation tests and historical combat captures | Online has no equivalent Tab scoreboard and uses a generic authority banner instead of the practice kill card; HUD implementations are structurally separate |
| Ability loadout | Q locked Blink; E/F/Z choose three unique abilities from Launch, Frag, Smoke, Sticky, Flash; two charges and sequential recharge; persistence and reconnect | Loadout schemas, persistence/Worker tests, smoke reconnect test | No current runtime artifact exercises all five selectable abilities; Frag/Sticky/Flash resolution lacks direct focused unit coverage |
| Blink | Offline hold-preview ring/range/blocked destination, then commit; online authoritative capsule-safe teleport | Offline renderer/source tests; historical online teleport event | Serious parity mismatch: offline metadata is 22 m / 5 s while online is immediate 9 m / 8 s; online has no held destination preview or target-intent protocol |
| Launch grenade | Gravity, bounce/friction, collision-started fuse, radial impulse with no damage | Authority source and historical legacy Launch runtime proof | Final one-to-one ev.io-like feel, weight, and audio remain human judgments |
| Frag grenade | Gravity/bounce/fuse, radial falloff damage | Authority implementation | No direct focused resolution test or current live capture |
| Smoke grenade | Smooth offline expansion, 5.88 m radius, ten-second lifetime; online field presentation | Smoke charge/reconnect test | Online smoke is not consulted by hitscan authority, so it does not physically block shots; live smoothness and sound are unaccepted |
| Sticky grenade | Surface/player attachment, follows player, fuse and falloff damage | Authority implementation | No direct focused resolution test or current live capture |
| Flash grenade | LOS/occlusion calculation and impairment timer; local overlay | Authority implementation | Offline suppresses bots, but online authority does not suppress input/aim/fire; no current live capture |
| Player model | Rev30 CC0-donor cyber-suit is the current third-person runtime fallback; 66-bone rig, 16 clips, weapon socket; Rev17 is first-person/fallback | Exact GLB reimport/structure report and four historical Blender renders | Rev30 was rejected as the final visual direction. A recovered slimmer body plus assault, breacher, recon, and duelist closed helmets is in active integration; live animation/contact/performance and LOD acceptance remain open |
| Enemy models | Practice bots and online remotes currently reuse the temporary Rev30 fallback with tint/armor variants | Runtime selection/config tests | Final enemy presentation must inherit the accepted role-driven body/helmet system or gain a separately authored silhouette; survival zombies still use an unaccepted procedural primitive rig |
| Animation | Authored idle/walk/run/jump/air/land/fire/reload/hit/death plus first-person clips; directional movement, backpedal, strafe lean, turn/aim layering, support-hand IK | Action-contract and presentation tests; Blender action renders | Equip, melee, and throws use procedural accents; first-person reload authored clip is disabled; bot death uses tilt/fade; no complete in-game animation sequence is human accepted |
| Weapon contact | Third-person weapon attaches at right-hand socket, real muzzle points forward, non-melee support hand is bounded | Matrix/contract tests and static weapon-ready render | Live clipping, hand placement, nozzle alignment, and animation contact on Rev30 remain unproven |
| Audio | Tactical synthesized cues for weapon/reload/movement/jump/land/throw/bounce/detonation/smoke/teleport/hit/headshot/kill/UI/enemies; prior timed siren removed | Source/tests verify cue routing and visual alternatives | Still oscillator/noise synthesis, not recorded sound assets; offline and online engines differ; no recording, mix/loudness report, or human listening acceptance |
| VFX | Muzzle flashes, shells, tracers, projectiles, rocket effects, impacts, hit/headshot/kill cues, smoke, flash, portal, Blink preview | Source/unit tests and historical presentation captures | Current full-source live capture across every family/ability is absent; reduced-flash behavior needs final visual review |
| HUD/menu | Current match-instrument stylesheet covers practice menus/HUD/settings and styles the online shell; abilities, ammo, health, score, feed, captions, connection warnings exist | Source semantics/accessibility tests and the live screenshot | Explicitly rejected by the project owner: too many uniform bordered cards/rails, all-caps micro-labels, repeated accent stripes, and dev telemetry in the player plane; online/practice HUDs are not one structure |
| Accessibility | HUD/crosshair scale/color, high contrast, reduced motion/flash, subtitles, visual audio cues, keyboard focus, controller navigation, ARIA/live regions | Unit/accessibility tests | Current rejected UI has no fresh sealed responsive/accessibility capture; mobile controls exist but launch target is desktop |
| Performance | Historical Rev4 2/4/8 proof used eight Chrome processes and recorded no greater-than-50 ms frames/long tasks/missed ticks; current Worker soak is healthy | Rev4 evidence packet and current Worker tests | Historical proof does not qualify Rev5 3D; large production chunks remain, including a roughly 2.52 MB physics chunk before compression |
| Security/readiness | Strict schemas, message cap, identity checks, token rotation, CSP/deployment readiness work, Worker dry runs | G9 audit/tests and build checks | Final public license choice and provenance evidence for six legacy assets remain release blockers |
| Documentation/Git | README/WIP/upstream audit updated; `main` contains the accepted lane commits through Rev5 | Git history and work logs | Current integration fixes/evidence are not yet committed/pushed; configured origin is `slaveofsolace/Ev.io-Legacy-Build`, not the earlier requested `SabbleDabble` URL |
| Cloudflare | Staging and production Workers answer HTTP 200 | Live health checks on 2026-07-28 | Staging is 29 commits behind local HEAD and production 37 behind; neither has Rev5/current abilities/audio/HUD/fixes; deployment is intentionally paused while the rejected UI is replaced |

## Current visual acceptance truth

- **Map:** structurally improved and runtime-loadable, but not final accepted art.
- **Character:** Rev30 remains a technically integrated fallback but is visually
  rejected as final; the slimmer four-helmet role direction is not yet
  integrated or accepted.
- **Animations/contact:** implemented contracts and actions, not visually accepted in the
  current runtime.
- **Weapons:** six online silhouettes exist; full in-game family presentation not accepted.
- **HUD/UI:** explicitly rejected in live review.
- **Audio:** routed and changed, but not listening-tested or accepted.

## Immediate major-change order

1. Replace the rejected online/practice presentation with one player-first HUD and
   move all audit/profile/hash/collider/transport detail behind an explicit
   diagnostics drawer.
2. Fix first-person weapon presentation so shotgun, sniper, rocket, and melee do
   not collapse to the Rev17 rifle.
3. Make online Blink use a held destination preview and reconcile its range and
   cooldown contract.
4. Complete online smoke/flash gameplay authority and add direct Frag/Sticky/Flash
   resolution coverage.
5. Integrate the recovered slimmer body and four role helmets, then capture live
   animation/contact and repair the clipping/contact failures shown by that
   runtime proof. Do not spend additional visual-polish passes on Rev30.
6. Exercise the Rev5 portal end to end, then run one final source-frozen Rev5
   2/4/8 product/performance pass.
7. Commit/push, deploy to staging, request human visual/play/audio acceptance,
   then promote only the accepted build.
