# KYX.IO Fable 5 full-game audit — truthful final packet

Date: 2026-07-31

Audit branch: `claude/fable5-kyx-full-audit-20260730`

Audited source commit: `2539f861e134aacea133773b863508d680d61901`

Canonical source merged into the lane: `49a7123518d6a24459f0bd0f293312fd7a48114e`

Harness: `fable5-full-game-audit-v2`

Harness SHA-256:
`8305da85ea7decc5fde674150c3e25d2c92393a4482e4903a608efb52ec6b2db`

Authoritative machine report: `audit-report.json`

## Verdict

This packet proves a functioning local two-client browser combat foundation. It
does **not** prove a finished or visually accepted game.

Three stages passed and ten stages were partial. No stage failed by exception,
and the run recorded no browser console or uncaught page errors. A partial stage
means that a concrete subset was observed while important predicates or human
acceptance remain open; it is not a disguised pass.

Human Brain / Human Eye verdict: **REJECT as a final vertical slice; retain as a
mechanically useful integration candidate.** The authority loop is materially
ahead of the presentation layer. The biggest visible discontinuities are the
procedural block opponent, incomplete first-person contact, primitive ability
VFX, weak death/damage feedback, and the separate Iron Bastion Practice mode.

## Reproduction

From the repository root:

```powershell
D:\AI Projects\Tools\node-v22.22.0-win-x64\node.exe tools/evidence/capture-fable5-full-game-audit.mjs
```

The harness owns temporary local Vite and Worker services, creates two distinct
Chrome contexts, removes its temporary authority state, and emits a new
source-SHA-named packet. It uses `staging-review`; it does not deploy anything.

## Consolidated source verification

Run once after the final evidence documentation was assembled:

| Gate | Result |
|---|---|
| `node --check tools/evidence/capture-fable5-full-game-audit.mjs` | PASS |
| app TypeScript (`tsconfig.json`) | PASS |
| Worker TypeScript (`tsconfig.worker.json`) | PASS |
| simulation-source TypeScript (`tsconfig.sim-source.json`) | PASS |
| simulation TypeScript (`tsconfig.sim.json`) | PASS |
| ESLint on the audit harness | PASS |
| Vite production build | PASS, 203 modules transformed |

The build retained its existing large-chunk warning. The largest emitted file
was the online authority route at approximately `2,998.69 kB` uncompressed and
`979.87 kB` gzip. The warning is not hidden and no bundle-size acceptance claim
is made here.

## Stage results

| Stage | Result | What was actually observed | What remains unproved |
|---|---|---|---|
| Local services | PASS | Vite and local authority booted | Deployed build identity and staging isolation |
| Browser boot | PASS | Browser automation entered the product | Human first-use comprehension |
| Lobby cold-eye | PARTIAL | Lobby was reachable and captured | Composition and visual acceptance |
| Two-client create/join | PASS | Two independent identities joined one room | 4/8 occupancy, network diversity, external capacity |
| Movement | PARTIAL | Forward, signed left/right strafe, grounded jump, airborne phase, and landing | Acceleration, weight, camera coupling, animation, controller, and fun |
| Weapons | PARTIAL | Assault rifle and blade selection plus accepted attacks; rifle hip/ADS/fire/reload frames | Pistol, shotgun, sniper, rocket, melee contact, full role matrix, weapon feel |
| Abilities | PARTIAL | Blink preview and commit; Launch, Smoke, and Frag activation counters | Bounce/weight, damage/radius, impairment, victim readability, role-specific loadouts |
| Combat | PARTIAL | Damage, kill, score update, death state, and respawn | Headshot, damage direction, polished kill/death feedback, animation, audio |
| Scoreboard | PARTIAL | Hold-Tab scoreboard rendered | Human opacity, density, hierarchy, and obstruction verdict |
| Refresh/rejoin | PARTIAL | Browser refresh returned to the room | Secure token-rotating resume; this is explicitly not secure-resume proof |
| Performance | PARTIAL | Script-wide two-client headless frame sample | Dense combat, 4/8 clients, owner hardware, sustained stability |
| HUD viewports | PARTIAL | 1920x1080, 1024x640, and 2560x1080 captured and measured | Human visual acceptance; narrow layout has a measured defect |
| Practice parity | PARTIAL | Practice launched and its HUD rendered | Arena, weapon, opponent, and product-language convergence with online |

## Exact measured proof

### Movement

- forward displacement: `10,781.3 mm`;
- left strafe local-right delta: `-2,799.2 mm`;
- right strafe local-right delta: `+2,648.2 mm`;
- grounded before jump: true;
- airborne observed: true;
- landed after airborne: true;
- observed jump apex: approximately `2,750 mm` at the sampled position;
- observed airborne-to-ground sample: approximately `900 ms`.

These numbers prove input direction and a jump arc. They do not say the movement
feels natural, responsive, or fun. The movement profile remains labelled as a
fixture/hypothesis elsewhere in the codebase and needs an owner play verdict.

### Weapons and first-person contact

The active preset was Assault with `helmetVariantId=assault`. Its live rail
allowed only slot 0 rifle and slot 5 blade. Rifle accepted attacks increased
from 1 to 5 during the weapon probe. Blade accepted attacks increased from 0 to
1, but no victim contact/damage predicate was established for the blade.

The rifle identifies as `vertical_rifle_v1`, family `rifle`, attack model
`hitscan`, visual source `quaternius_cc0_review_rev1`, and first-person contact
mode `authored_two_hand_assault_suit_v4` with two rendered hands.

Human visual findings:

- hip composition is cleaner and less oversized than earlier revisions, but
  the weapon is still low-detail and blocky relative to the target quality;
- ADS is a reject: the forearms form a conspicuous wide V/tent shape and the
  grip/stock relationship does not look physically authored;
- the blade has no demonstrated first-person hand-contact mode;
- one Assault room is not evidence for pistol, shotgun, sniper, rocket, or the
  other role presets.

### Abilities

Blink produced an authority-bound, valid, ready preview at `2,890 mm` against a
reported `9,000 mm` maximum and then committed `2,890.6 mm` of displacement.
Launch, Smoke, and Frag activation counters each advanced exactly once.

Human visual findings:

- Blink direction is readable, but the cyan ring/beam is too thick and large
  and competes with the weapon and lower HUD;
- smoke reads as overlapping translucent geometric shells rather than a
  volumetric cloud; growth/evolution and occlusion quality remain unapproved;
- frag reads as a large clear dome with a text label rather than a weighted
  detonation, blast, debris, or shock response;
- accepted counters do not prove bounce, gravity, mass, radius, damage,
  impairment, or victim-side readability;
- the requested custom loadout rule (Blink fixed plus three player-selected
  abilities) is not yet proven as the active product contract.

### Damage, kill, death, and respawn

Both clients traversed all four authored approach waypoints. The first rifle
burst reduced the victim from 100 to 30 health. The second reduced 30 to 0. The
blue score advanced to 1, the feed sequence advanced to 1, and the victim later
returned alive at 100 health.

Only body-hit cues were observed. `headshotCueObserved=false`; no headshot
damage multiplier or differentiated color/readability proof exists in this
packet.

Human visual findings:

- the target is still the procedural red/orange block mannequin the owner has
  repeatedly rejected;
- the attacker sees a functional but generic `Target down` banner and a small
  top-right feed entry;
- the victim sees health drop without a strong directional threat indicator;
- death leaves the normal weapon/camera composition largely intact and relies
  on text, so elimination lacks a decisive visual transition;
- respawn is mechanically observed, but no authored spawn animation or camera
  recovery was judged.

### HUD and UI

The desktop HUD keeps the center relatively clear and the hold-Tab scoreboard
is compact and opaque. That is useful direction, not owner acceptance. The
visual language is still a minimal generic technical overlay and has already
been rejected by the owner as too AI-generated/mismatched.

At 1024x640 the harness measured three clipped ability labels:

- Launch: `28 px` client width vs `42 px` content width;
- Smoke: `29 px` vs `40 px`;
- Blink: `27 px` vs `30 px`.

The settings menu exposes useful controls for input, audio, render quality,
HUD scale, crosshair, contrast, reduced motion, and full-screen flash. It is
functionally coherent but reads as a flat external settings sheet rather than
an integrated in-match surface. This packet does not claim WCAG conformance or
disabled-player acceptance.

### Map and Practice

The online room matched `inkfall_foundry@3` profile/package identity. That
proves identity and contract cardinality, not map-art acceptance.

Human visual findings for Inkfall:

- functional vertical industrial traversal exists;
- the current player-eye scene still has large flat teal/gray surfaces, thick
  rectangular framing, busy linear ceiling elements, weak material variation,
  and graybox-like landmarks;
- the orange portal is a clear focal point, but traversal and reconnect
  continuity were not exercised by this run;
- full collision, bridge/support clipping, bounds, spawn LOS/fairness, and
  2/4/8 navigation remain open.

Practice launches, but it identifies as `Iron Bastion` while online uses
Inkfall. It has a different oversized glowing weapon, procedural bots, older
map language, and a separate presentation quality bar. `mapConverged=false`.
Practice and online therefore do not yet read as one game.

### Performance

- samples: `3,768`;
- measured duration: `9,830.5 ms`;
- p50: `1.9 ms`;
- p95: `3.8 ms`;
- p99: `5.6 ms`;
- worst frame: `1,034.7 ms`;
- long tasks: one, measured at `1,036 ms`;
- sampled JS heap: `80 MB` used / `138 MB` total.

The percentiles are encouraging for this two-client headless slice, but the
one-second hitch is a release blocker until attributed and removed or bounded.
This is not the required genuine 2/4/8 matrix or 30-minute soak.

## Character, skin, helmet, and animation truth

- live release character candidates remain disabled;
- opponents can render through the procedural block/capsule fallback;
- Rev30 and Rev31 are review-only candidate batches, not accepted runtime art;
- a persisted helmet ID does not prove a role helmet is rendered;
- no full skin-selection/replication flow was exercised;
- no locomotion clip, foot contact, transition, recoil, reload, melee, death,
  respawn, or remote-pose state-machine proof was captured.

These surfaces are **UNKNOWN/REJECTED**, not implicitly passed by the successful
combat authority loop.

## Audio truth

The runtime emitted audio-attempt markers for teleport, grenade, body hits, and
kill. An event marker does not judge timbre, dynamics, mix, fatigue, spatial
placement, or the reported retro/siren problem. Movement, weapon, ability,
portal, ambience, headshot, kill, death, and menu audio all require an actual
human-ear capture/listening pass. Audio remains **UNKNOWN**.

## Exhaustive coverage still owed

- full mouse-look/FOV/pointer-lock recovery and controller behavior;
- all four role presets in fresh authoritative rooms;
- pistol, shotgun, sniper, rocket, and verified melee contact;
- active authored Assault third-person body before role-family propagation;
- skins, role helmet rendering, LOD/package budget, provenance, and runtime
  animation state;
- headshot multiplier/color/cue and damage-direction feedback;
- secure token-rotating resume;
- full Inkfall traversal/collision/geometry sweep, portal traversal, and 2/4/8
  spawn safety/fairness;
- keyboard focus, captions, high contrast, reduced motion, and accessibility
  acceptance;
- actual audio capture/listening;
- genuine final-source 2/4/8 runtime matrix and 30-minute eight-client soak;
- release package closure, license/provenance, distribution mode, staging build
  identity/isolation, rollback, and owner staging approval.

## Recommended implementation order

1. Put one accepted Assault body, armor, helmet, and animation set into the live
   runtime; remove the procedural opponent from the target slice.
2. Make Practice use the same Inkfall arena, role/loadout contract, HUD view
   model, first-person presentation, and opponent model as online.
3. Re-author the rifle ADS hand/stock contact and fix the narrow HUD clipping.
4. Add decisive damage-direction, differentiated headshot, kill, death, and
   respawn presentation.
5. Replace smoke/frag primitives with authored, performant VFX and close
   throwable physics/radius/victim semantics; refine Blink scale/collision.
6. Complete a human-ear audio pass and replace the procedural retro/siren mix.
7. Exercise all four roles and weapon families only after the shared Assault
   slice is accepted.
8. Run final 2/4/8 and soak evidence only after these large changes stop.

## Nonclaims

This packet does not grant human visual acceptance, human audio acceptance,
gameplay-fun acceptance, Rev5 authority, full weapon/role coverage, secure
resume, portal traversal, spawn fairness, accessibility conformance, 2/4/8
performance, soak stability, release eligibility, staging approval, or
production approval.
