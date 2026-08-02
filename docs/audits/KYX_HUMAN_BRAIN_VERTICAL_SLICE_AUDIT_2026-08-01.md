# KYX.IO Human Brain vertical-slice audit — 2026-08-01

## Verdict

KYX does not presently have one broken feature. It has several overlapping
implementations of the same product. A route, fallback, build mode, or
presentation adapter can select a different rule, HUD, model, audio cue, map
binding, or reconnect path from the one that was tested. That is the main
reason individual gates can pass while direct play still feels inconsistent.

The immediate release strategy is therefore convergence, not expansion:

1. one authoritative gameplay contract;
2. one Inkfall Practice/online slice;
3. one shared presentation model;
4. one accepted Assault character and weapon-contact set;
5. one source-frozen 2/4/8 matrix and soak.

Automated PASS, runtime observation, and human acceptance remain distinct.

## Direct observations

- **OBSERVED — ev.io:** direct Windows Chrome play entered a public
  Drought/Brazil Deathmatch. Sprint moved the player. Holding/pressing Q
  exposed an orange destination marker; left-click commitment produced one
  immediate cyan-white Impulse resolution and player displacement, with no
  visible rebound sequence. The HUD kept the center clear and used a sparse
  top timer, lower-left status/abilities, and lower-right weapon/ammunition
  structure.
- **OBSERVED — deployed KYX:** the current public preview can enter and move in
  legacy Iron Bastion Practice, but this is not the new Inkfall route. A large
  blocky bot initially occluded most of the camera. The HUD and world use a
  different hierarchy from the new candidate systems.
- **MEASURED — local Inkfall, initial diagnosis:** sustained forward-sprint
  input moved the local authority player more than 400 mm and exceeded 1,000
  mm/s horizontal velocity before an authority depenetration abort. Expanded
  diagnostics later isolated actor `practice.bot.03` at tick 163, wedged
  between the east-choice guard rail and node collider.
- **MEASURED — local Inkfall, same-day correction:** Revision 4 changes only
  the implicated rail collision envelope, increases its platform clearance
  from approximately 292 mm to 421 mm, and preserves all other collision,
  render, spawn, zone, and trigger content. Two byte-identical 1+7-player
  simulations reached 300 ticks without the former abort. This is bounded
  deterministic proof, not a human play verdict or a final soak.
- **MEASURED — public Impulse data:** ev.io node 355 declares
  `bounceOfWalls=false`, `bounceOfGround=false`, and `gravity=0.048`. At 20 Hz,
  the public value maps to approximately 19.2 m/s^2.
- **OBSERVED — pre-correction KYX:** the dedicated Impulse authority used zero
  gravity, three rebounds, and a post-contact fuse. A generic Launch contract
  separately used gravity and five rebounds. The user-visible mismatch was
  therefore a real mechanics defect, not merely animation.

Detailed claims, alternatives, and reopen conditions live in
`KYX_EVIO_COMPARATIVE_GAMEPLAY_LEDGER_2026-07-31.json`.

## Causal model

```text
parallel candidate lanes
        |
        v
old and new rules/renderers/assets remain reachable
        |
        v
each narrow test validates its own implementation
        |
        v
route, fallback, reconnect, or package selects another implementation
        |
        v
player sees bounce, clipping, retro audio, block enemies, mismatched HUD,
visual-only utility, missing assets, or duplicate identity
```

## Ranked findings

| Priority | Surface | Evidence state | What is wrong or unproven | Player consequence | Required convergence |
| --- | --- | --- | --- | --- | --- |
| P0 | Launch / Impulse | Implemented; consolidated automated gate green; player-eye feel unverified | Authority v2 now uses gravity, world-only first contact, zero bounce, no player-body collision, v2 checkpoints, deterministic event order, and coalesced presentation | The known rule mismatch is closed in code, but strength, arc, camera, animation, audio, and repeated-use feel can still miss the intent | Source-frozen Practice and online player-eye play, then tune presentation without reopening terminal-contact semantics |
| P0 | Inkfall movement/collision | Corrected; bounded deterministic runtime green; human traversal unverified | Revision 4 corrects the isolated east-choice rail seam; two byte-identical 1+7 simulations reached 300 ticks | The former deterministic abort is removed inside the tested window, but broader routes and long-duration stability remain unproven | Player-eye traversal through the corrected lane, then the final exact-source 2/4/8 matrix and soak |
| P0 | Practice versus online | Observed | Legacy Iron Bastion, local Inkfall, and online paths remain separate products | Fixes and feel do not reliably transfer between modes | Make the local Inkfall authority route the sole desktop Practice product and share commands, rules, HUD, assets, and events with the Worker |
| P0 | Smoke | Source-observed | Smoke fields are replicated/rendered but rewind hitscan and AI sight do not consume authoritative occlusion | Opaque smoke can be shot through as though absent | One server-owned smoke-volume query for hitscan, bots, spectators, reconnect, and Practice |
| P0 | Flash | Implemented; consolidated automated gate green; player-eye effect unverified | Authority now owns LOS, distance, facing, exact intensity/duration, reliable semantics and reconnect expiry; reduced-flash preserves timing with low-luminance obstruction | The prior transparent reduced-flash advantage and direction-agnostic exposure are closed in code, but visual comfort, audio and opponent readability remain unapproved | Capture direct/side/away and luminous/low-luminance player-eye cases, then tune presentation without adding hidden aim jitter or input theft |
| P0 | Ability loadouts | Source-observed | Fixed role trios reject the promised locked-Blink plus three selectable abilities model | The advertised customization loop does not exist | One schema: Q locked to Blink; three unique selectable ability slots validated by menu, persistence, Practice, and Worker |
| P1 | Map render versus authority | Partially corrected; broad convergence and human acceptance open | Revision 4 now binds corrected collision and runtime identity for the known rail seam while preserving Rev5 render/spawn/zone content; other visual-authority mismatches remain plausible | The known east-choice wedge is fixed, but invisible blockers, clipped bridges, floating pieces, and unsafe sightlines may remain elsewhere | Freeze the full Rev5 structure, audit all render/collision overlays, then complete representative player-eye traversal and 2/4/8 spawn review |
| P1 | Spawns | Source-observed | A no-safe-spawn result can fail open to a rejected/locked candidate | Spawn deaths can occur at 8-player occupancy | Defer spawn, spectate/retry, or use designed spawn protection; never silently choose unsafe geometry |
| P1 | Characters/roles | Observed | Runtime can select procedural/team-colored fallbacks instead of a role-owned accepted character | Enemies look blocky and their weapon/ability threat is unreadable | Finish one Assault body/helmet/rig/LOD/runtime path, transmit role identity, then propagate modular silhouettes only after acceptance |
| P1 | Animation/contact | Source-observed and unverified | Technical clips exist, but visible directional locomotion and only one rifle contact rig are proven | Foot sliding, wrong strafe/backpedal, floating grips, weapon overlap, and odd sword attachments remain possible | Assault locomotion, air/land/slide, equip/reload/melee/hit/death plus weapon-specific first-person sockets |
| P1 | Weapon roster | Source-observed | Six authority/presentation families do not equal six exposed, reviewable loadout weapons | Completion percentage overstates what can be played | Expose each weapon truthfully through presets/secondary/pickup rules or remove it from release claims |
| P1 | ADS/scope | Source-observed | `aimHeld` is largely presentation state, without one Worker-owned ballistic/mobility contract | Zoom can change without spread, handling, or sniper semantics | Authoritative weapon-specific ADS state, FOV, movement/spread/recoil, scope and reconnect behavior |
| P1 | Hit/headshot/kill feedback | Implemented but player-eye unverified | Damage multipliers exist, but correlated impact color, audio, banner, victim direction, and scoreboard feedback are not proven together | Correct damage can still feel weak or confusing | Drive the entire feedback chain from one event id and capture body hit, headshot, kill, assist, and death cases |
| P1 | Audio | Source-observed and user-rejected | Core, route, and weapon FX own separate procedural paths | Retro timbre, duplicate cues, inconsistent loudness/spatialization, and fatigue | One event-deduplicated spatial audio bus with licensed/owned sampled cues, priority/ducking, captions, and restrained ambience |
| P1 | Reconnect | Measured and source-observed | Secure resume exists, but browser recovery can lose in-memory identity and create a ghost | Refresh can duplicate a player instead of resuming | Bounded `sessionStorage`, Resume-before-Join, token rotation/replay rejection, ghost expiry, and UI recovery proof |
| P1 | Bots | Unknown/partially observed | Seven deterministic bots exist; navigation, target visibility, utility understanding, weapon roles, and spawn behavior are not human-proven | Practice can be technically populated but strategically meaningless | Bot sight uses smoke/flash, safe navigation and portal traversal, role-aware combat, difficulty parameters, and stuck recovery |
| P1 | Movement feel | Measured but unaccepted | Numeric motion exists; current profile is still described as a hypothesis fixture | Valid movement can feel floaty, light, or animation-disconnected | One repeatable itinerary comparing start/stop, strafe, backpedal, jump, landing, slide and Impulse; tune once, then lock |
| P2 | HUD/UI | Source-observed and visually unaccepted | Shared values coexist with separate Practice/online markup and accumulated CSS | Menus and combat HUD can still feel mismatched or AI-assembled | One typed view model and component hierarchy; clear center; diagnostics drawer; remove superseded CSS instead of adding overrides |
| P2 | Onboarding/settings | Unknown | Input prompts, sensitivity, bindings, ability teaching, loadout explanation, and recovery messaging are not source-frozen play-approved | A first-time player may not understand how to enter, move, aim, use abilities, or recover | First-session flow, control rebinding, sensitivity/ADS scale, concise ability previews, and failure recovery |
| P2 | Accessibility | Automated but human-unaccepted | Reduced motion, contrast, captions, focus and scale toggles exist without one final shared-HUD review | Options may toggle while combat remains unreadable or uncomfortable | Keyboard-only, 200% scale, high contrast, reduced motion/flash, color-independent teams, captions and photosensitivity review |
| P2 | Performance | Measured risk | Prior evidence includes one approximately 1,035 ms long task and a multi-megabyte route chunk | A visible one-second freeze can survive good p95/p99 averages | Attribute GLB decode, module import, audio init, GC and shader startup before final matrix; warm/cold evidence separately |
| P2 | Packaging/build truth | Source-observed | Staging-review asset paths and fallbacks can differ from release packaging | An accepted preview model/map/gun can disappear in release | Exact accepted hashes in the release ledger; same assets in staging and release; fail closed on unapproved binaries |
| P2 | Legal/provenance | Decision pending | External inspiration and candidate packs require exact licenses, attribution and distribution-mode closure | A good asset can block public release | Preserve source URLs/licenses/hashes/modification records; owner decides source, built artifact, or both |

## Consequence ladders

### If smoke becomes authoritative, then what?

Immediate: rewind hitscan and bots must query the same volume. Behavioral:
players can cross lanes and disengage. Counterplay: attackers may prefire,
reposition vertically, wait out duration, or use a future reveal tool. Systemic:
spectators, reconnect, Practice, captions, VFX density, bot perception, and
performance must reproduce the same start/end ticks. Failure: smoke that is
visually present but authority-expired becomes dishonest; authority-active
smoke rendered late becomes unfair. Recovery: field ids and exact ticks drive
both simulation and presentation.

### If Flash gains real impairment, then what?

Immediate: it needs a defined effect rather than an arbitrary white overlay.
Behavioral: players turn away, break line of sight, or pre-position cover.
Counterplay: facing/distance/occlusion matter. Systemic: the Worker owns the
effect while clients offer reduced-white/reduced-motion modes that preserve
competitive timing. Failure: blocking all input feels like loss of control;
visual-only flash has no tactical truth. The first testable family should
affect aim stability and information clarity without stealing basic movement.

### If custom abilities are enabled, then what?

Immediate: Q remains Blink and E/F/Z become three unique choices. Behavioral:
players express route/control/damage preferences. Counterplay: silhouettes,
loadout UI, cooldown tells and combat events must expose enough information to
read likely threats. Systemic: persistence, validation, reconnect, bots,
scoreboard and helmet/role presentation cannot each invent defaults. Failure:
one dominant trio erases customization or a reconnect silently changes slots.

### If one Assault character replaces the fallback, then what?

Immediate: every live path must select the same approved asset and rig.
Behavioral: players learn target scale, facing and weapon threat by silhouette.
Systemic: first-person arms, third-person locomotion, sockets, hit capsules,
head location, LODs, skinning, compression, package budget and provenance must
be accepted together. Failure: a polished mesh with wrong collision/contact is
worse than an honest prototype because it lies about where shots and hands
connect.

## Selected correction sequence

1. **IMPLEMENTED / VERIFY IN PLAY:** canonical Launch v2; automated gates are
   green, while player-eye feel and online presentation remain open.
2. **CORRECTED / VERIFY AT SCALE:** the isolated Inkfall east-choice rail
   penetration is removed in Revision 4 and two deterministic 300-tick 1+7
   runs; final traversal, 2/4/8 matrix, and soak remain open.
3. **REVISE:** make local Inkfall the single Practice route and prove one
   uninterrupted combat loop.
4. **PARTIALLY IMPLEMENTED / VERIFY IN PLAY:** authoritative smoke now blocks
   every server hitscan family and Flash owns LOS/distance/facing plus exact
   presentation timing. Bot/spectator smoke convergence, player-eye Flash,
   ability-preset truth, ADS and correlated combat feedback remain open.
5. **REVISE:** one shared HUD component tree and one audio event bus.
6. **REVISE:** Rev5 matching collision/spawns/portal and human map review.
7. **REVISE:** one accepted Assault character, animations and exposed weapon
   contacts before role-family expansion.
8. **VERIFY:** 2/4/8 online matrix, reconnect, cold/warm performance and
   30-minute soak on the exact final source.
9. **OWNER DECISION:** visual/play acceptance, distribution mode, staging, then
   separately production.

## What is not yet known

- Whether any other Inkfall route contains a comparable render/collision or
  KCC seam outside the corrected east-choice rail and 300-tick test window.
- Correct human-feel tuning for Launch impulse strength, self-affect, cooldown,
  throw animation, audio and camera response after no-bounce semantics land.
- Whether Rev5 geometry provides safe 2/4/8 sightlines and spawns after render
  and collision are version-matched.
- Whether smoke and Flash should affect every weapon/bot identically or have
  explicit counters.
- Whether the current character/weapon candidate packs meet the owner's visual
  bar from first-person and enemy distance views.
- Whether the one-second hitch originates in decode, import, audio, shader or
  garbage collection.

Those are experiments to run, not assumptions to hide behind completion
percentages.
