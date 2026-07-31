# KYX.IO full-game audit matrix

Date: 2026-07-31

Canonical source anchor: `49a7123518d6a24459f0bd0f293312fd7a48114e`

Audit branch: `claude/fable5-kyx-full-audit-20260730`

This is the exhaustive audit contract for the desktop-first Inkfall vertical
slice. It deliberately separates four verdict layers:

1. source and contract correctness;
2. observed browser-runtime behavior;
3. authoritative 2/4/8-player convergence;
4. human visual, auditory, and gameplay acceptance.

A callback returning, an input being accepted, a screenshot existing, or an
asset validator passing does not automatically grant gameplay or visual PASS.
Every runtime result must be `passed`, `failed`, `partial`, `skipped`,
`unknown`, or `tool_limited`, with its predicate, expected value, observed
value, evidence path, errors, nonclaims, and required follow-up.

## Runtime and player-experience matrix

| Surface | Source/runtime anchor | Automated predicate | Current verified state / nonclaim | Human gate |
|---|---|---|---|---|
| Build identity | `worker/worker.ts`, `wrangler.jsonc`, Pages health metadata | UI, Worker, profile, assets, and endpoint identify one commit | Local boot exists; deployed identity is not part of the Fable local harness | Reject visibly mixed/stale revisions |
| Lobby/create/join | `src/app/onlineAuthorityRoute.ts` | Fresh room, second-client join, two unique identities, zero runtime errors | Two-client local create/join is observed | First-use clarity and polish |
| Input | `src/app/onlineAuthorityInput.ts` | W/S, A/D, Space, Shift, C, Q/E/F/Z, fire, ADS, reload, slots, and blur-release map correctly | Only exercised keyboard/mouse inputs are sampled; controller is unknown | Comfort and accidental activation |
| Movement | `src/sim/movement/profile.ts`, online snapshot | Forward/back and signed A/D, authoritative velocity, grounded jump arc and landing, collision | Repaired probe measures forward, signed strafe, jump and landing; movement feel remains unapproved | Acceleration, weight, momentum, camera coupling, fun |
| Camera | Three runtime diagnostics | Pointer lock, stable yaw/pitch, no reacquisition jump, exact hip/ADS FOV restore | Pointer-lock entry is observed; full camera recovery and feel are unknown | Mouse feel and motion comfort |
| Practice/online parity | `src/ui/hudViewModel.ts`, Practice, online route | Equivalent game state yields equivalent arena/loadout/HUD/ability semantics | Practice still identifies as Iron Bastion while online uses Inkfall | Same-game coherence |
| Role presets | `src/loadouts/combatPresets.ts`, `src/authority/combat/loadoutRequest.ts` | Four fresh rooms receive exact weapons, Blink plus three abilities, and helmet ID; forged hybrid rejected | Schema exists; exhaustive four-role runtime proof is absent | Role value and balance |
| Weapon roster | `src/authority/combat/weaponFoundation.ts`, `src/weapons/KyxArmoryPresentation.ts` | Rifle, pistol, shotgun, sniper, rocket, melee: equip, accepted attack, hit/contact, ammo, reload, interrupt, ADS where applicable | Fable run covers only weapons exposed by the active preset | Model, grip, muzzle, recoil, distinct feel |
| First-person model | Three first-person diagnostics | Exactly one weapon, intended hand/contact rig, no duplicate mesh, stable pose/FOV | Canonical `49a7123` improves VLR-7 composition; human acceptance remains open | Scale, clipping, contact and regression check |
| Third-person body | `src/player/HumanSoldier.js`, `src/player/PreviewCharacter.js` | Runtime selects an accepted authored body and live pose state, not fallback | Character candidates are disabled; procedural fallback remains live | Anatomy, armor continuity, feet, gloves, visor, helmet |
| Skins/cosmetics | Avatar construction and persisted selection | Cosmetic persists and replicates without weakening team readability | No complete independent skin-selection runtime was found | Material quality and identity |
| Role helmets | `combatPresets.ts`, `createPlayerAvatar()` | Preset helmet module is rendered and replicated on the shared body | Helmet IDs exist, but live avatar selection is primarily team/fallback-driven | Silhouette distinction beyond color |
| Animation | `src/player/Rev17Character.js` and active avatar | Idle/walk/sprint/backpedal/strafe/jump/fall/land/crouch/fire/reload/equip/melee/hit/death clips transition without NaNs | Candidate clips exist; active online authored-animation proof is absent | Foot planting, weight, contact, transitions |
| Blink | `src/app/onlineBlinkPreview.ts` and authority movement | Hold preview uses exact authority range/cost/cooldown/eligibility; release succeeds/rejects safely | Preview and one displacement are observed; cross-layer constants require reconciliation | Destination confidence, readability, sound |
| Frag | ability authority runtime | Charge, gravity, bounce count, fuse, detonation, radius, falloff, occlusion | Generic counters/screenshots are not full frag proof | Weight, bounce and warning clarity |
| Smoke | smoke field authority/presentation | Exact field radius/lifetime/occlusion and smooth temporal expansion | Activation can be observed; radius, smoothness, victim view remain open | Tactical readability and visual quality |
| Flash | ability authority runtime | Visible eligible enemies impaired; friendlies/occluded/out-of-radius excluded | Not exercised by the active Assault run | Comfort, counterplay and clarity |
| Sticky | ability authority runtime | Attachment persists/follows target, no bounce, correct detonation/damage | Not exercised by the active Assault run | Contact clarity and believability |
| Launch grenade | ability authority runtime | Gravity, bounce, zero damage, exact impulse | Activation counter alone is insufficient | Direct ev.io behavior comparison, usability, feel |
| Damage/headshots | `src/authority/combat/rewindHitscan.ts`, presentation adapter | Victim durability changes, region=`head`, multiplier and distinct cue correlate to one event | Repaired combat probe uses `healthPoints`/`shieldPoints` and recent cues; headshot scenario still needs deliberate setup | Color, intensity and satisfaction |
| Kill/death/respawn | combat life/TDM authority | One lethal event, one death ordinal/feed/score mutation, respawn eligibility and restored state | Repaired probe attempts the full correlated sequence; evidence rerun pending | Banner size/timing, death clarity, pacing |
| Scoreboard/match | online scoreboard and TDM authority | Tab opens only while held, closes on release, scores and phases converge once | Presence is observed; opacity/density/hierarchy unapproved | Obstruction and scan speed |
| Secure resume | `worker/resumeSessions.ts`, `worker/resumeToken.ts` | Product Resume preserves identity/state, rotates token, rejects old token, no duplicate cue | Page refresh is explicitly not treated as secure resume | Recovery trust and rubber-banding |
| Remote players | Three runtime `remoteEntities` | Correct remote count, interpolation, pose/team/movement/weapon state on every client | Two-client remote count is observed; model/animation quality is not | Opponent readability at 5/20/40 m |
| Map identity | `src/app/inkfallRev5CandidateBinding.ts`, package validator | Exact map/profile/hash plus 339 colliders, 12 spawns, 9 zones | Rev5 render presentation is bound over revision-3 authority; not “Rev5 authority” | Actual Rev5 appearance |
| Map geometry | Rev5 continuity/readability modules | Player-driven routes find no clipping, tunneling, snagging, floating support, or bounds escape | Canonical batch reduced ceiling clutter and replaced the hanging press block; complete traversal is open | Bridge/wall clipping, scale, landmarks, sightlines |
| Spawns | `src/authority/spawn/inkfallSpawnAuthority.ts` | 2/4/8 LOS, cover, egress, route pressure, repeat-spawn avoidance | Capsule-clear package exists; live combat fairness is not accepted | Spawn traps and fairness |
| Portal | Inkfall portal authority and presentation | Both directions, blocked exit fail-closed, cooldown, reconnect continuity, one cue | Portal capability exists; this Fable harness does not traverse it | Destination predictability, visuals, audio |
| Map library | `src/content/maps/library.ts` | Original/legacy sections label playable vs catalog-only accurately | External ev.io legacy entries are rights-blocked catalog items, not imported maps | Navigation and content selection |
| HUD | `src/ui/hudViewModel.ts`, `src/ui/kyx-cutline.css` | Health/ammo/cooldown/score/team/life/connectivity equal authority and never conflict | G7 Cutline is integrated; measured label clipping is now reported | Non-AI visual language, hierarchy, restraint |
| Menus/UI | `src/ui/MainMenu.js` | Settings/loadout/maps/pause/death/result persistence and focus | Only a subset is captured by the Fable route | Typography, density, consistency, polish |
| Accessibility | preferences, caption, focus and controller modules | Keyboard/controller nav, persisted high contrast/reduced motion/flash, captions, zoom/resize | No WCAG or disabled-player acceptance claim | Disabled-player review |
| Audio | `src/core/AudioManager.js`, online FX, portal | One authority event → one correctly located/lifecycled cue; no duplicate/siren loop | Audio is substantially procedural; automation cannot settle the retro complaint | Human-ear timbre, weight, fatigue and mix |
| VFX | weapon/ability/portal presentation | Event-position correlation, correct muzzle/contact origin, cleanup, reduced-motion variant | Some presentation diagnostics exist; comprehensive visual evidence does not | Smoke, flash, muzzle, headshot, kill, portal quality |
| Viewports | Cutline browser route | 1920×1080, 1440×900, 1024×640, 2560×1080 without clipping/overflow | Repaired harness measures label clipping instead of assuming fit | Human approval at each desktop viewport |
| 2/4/8 runtime | existing population capture/verifier | Unique occupants, 1/3/7 remotes, movement/combat/abilities/portal/resume, convergent authority, ≥240 frame samples/client | Existing Rev4 candidate proof is not final Rev5 source-frozen proof | Combat-density readability and hitching |
| Soak | `tests/worker/authorityFullOccupancySoak.test.ts`, G8 route | Final-source 30-minute eight-client run without divergence/stalls/duplicate events/resume corruption | Final 30-minute soak remains open | Late-session degradation and fatigue |
| Package/provenance | release verifier, asset manifests, G9 | Every shipped binary ledgered, validated, approved, hash-covered; candidates excluded; no secrets | Runtime testing does not close legal/package decisions | Owner license and distribution mode |
| Staging/deploy | Pages/Worker configs and rollback guide | Exact staging build ID, isolated bindings, health/two-client smoke, rehearsed rollback | Stable staging exists; this audit does not deploy | Owner staging walkthrough; production separately authorized |

## Stop-the-line product findings

- Candidate character families are not the live player/opponent model. The
  shipped route can still render a blocky procedural fallback.
- Role-preset helmet IDs are not proof that different authored helmet modules
  are selected and replicated at runtime.
- Ability choices are currently preset-linked, not the requested arbitrary
  fixed-Blink plus player-selected three-of-five system.
- Pistol and rocket implementations exist but are not current role-primary
  selections. One active-preset audit cannot claim the six-weapon roster.
- Browser refresh/rejoin and secure token resume are different tests.
- Practice/online convergence is presently false at the arena level.
- External ev.io maps are not cleared for playable redistribution.
- Procedural sound generation requires an actual player-ear review; graph or
  source inspection cannot approve the mix.
- Visual acceptance remains owner/human-gate work even when runtime metrics are
  green.

## Required play itinerary

1. Play deployed KYX and publicly accessible ev.io side by side for observable
   behavior only; do not copy proprietary code or assets.
2. Run four fresh two-client rooms, one for each role preset.
3. Traverse a fixed Inkfall route forward, backward, strafing, jumping,
   crouching, sliding, and Blinking.
4. Exercise every equipped weapon and ability against a real victim client.
5. Capture torso hit, headshot, lethal headshot, kill, death, and respawn.
6. Inspect first-person contact and opponents at 5 m, 20 m, and 40 m.
7. Walk the perimeter, bridge, vertical routes, all spawn regions, and both
   portal directions.
8. Exercise actual secure Resume during combat and cooldowns.
9. Repeat at genuine 2/4/8 occupancy with active combat and abilities.
10. Run the final 30-minute soak only after the source is frozen.
11. Close package/provenance/security, deploy to staging, and obtain an owner
    walkthrough. Production requires a later explicit authorization.
