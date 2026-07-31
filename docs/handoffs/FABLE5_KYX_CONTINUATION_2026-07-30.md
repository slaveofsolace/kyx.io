# Fable 5 to Codex continuation — recovered audit lane

Date: 2026-07-31

Branch: `claude/fable5-kyx-full-audit-20260730`

Canonical source merged into this lane: `49a7123518d6a24459f0bd0f293312fd7a48114e`

## Authoritative correction

The original Fable packet overclaimed its evidence. Its `13/13 completed`
summary meant only that 13 callbacks returned without throwing. It did not mean
13 predicates passed. The committed v1 evidence must be retained as historical
input, but it is not full-game acceptance proof.

The branch originally contained two Fable commits, not one:

- `7f8f241616555a7e06d40a493a46817ba34795a3` — harness, Cutline CSS, and v1 evidence;
- `3f416a777430c523acdb54f30055277d8942f219` — original continuation packet.

Canonical `49a7123` was subsequently merged into this lane at `a8e265a`. The
recovery patch upgrades the harness and this document. Use `git log` for the
resulting recovery commit rather than the stale original SHA.

## What v1 genuinely observed

- two independent local Chrome clients could create and join one authoritative
  room;
- pointer lock entered;
- a forward command displaced the authority-owned player;
- the active Assault preset exposed rifle and blade;
- rifle hip/ADS transitions rendered;
- one Blink displacement occurred;
- a hold-Tab scoreboard existed;
- three desktop viewport screenshots were captured;
- the run recorded no browser console or uncaught page errors.

Those observations are useful, but they do not approve gameplay quality.

## Invalidated v1 claims

| Original claim | Correction |
|---|---|
| Movement KEEP | Speed was null, A/D direction was not measured, and jump began ungrounded. |
| Blade fires | No melee contact, victim damage, or accepted-contact evidence was recorded. |
| All weapon roster | Only active-preset rifle and blade were reached. |
| Ability physics | Fixed-delay images did not prove ability identity, bounce, radius, detonation, damage, impairment, or victim readability. |
| Damage/kill/respawn stage complete | Combat read nonexistent `.position`, `.health`, and `.lifeState` fields and produced zero engagements. |
| Refresh-resume defect | The stage used `page.reload()`, not the secure token-resume path. It only observed refresh/rejoin behavior. |
| HUD viewport KEEP | The 1024×640 image visibly truncated ability labels. |
| Practice parity | The locator missed `#play-btn`; Practice still identifies as Iron Bastion while online uses Inkfall. |
| Performance KEEP | The 900-frame sample ended before most scripted load and covered only two headless clients. |
| Audio likely KEEP | Procedural synthesis cannot answer the owner's retro/siren complaint without human-ear evidence. |
| Portal/map/package KEEP | Those surfaces were not exercised by the v1 harness. |
| Overall 58/100 | Unsupported composite percentage removed. Component maturity must be reported by evidence layer. |

## Recovery implementation

`tools/evidence/capture-fable5-full-game-audit.mjs` v2 now:

- requires explicit `passed`, `partial`, `skipped`, `unknown`, or
  `tool_limited` results; thrown stages remain `failed`;
- records findings for partial and unknown results;
- names output from the source SHA and records the harness SHA-256;
- boots Vite in `staging-review`, matching the candidate presentation gate;
- derives movement speed from authoritative velocity, waits for grounded state,
  polls the jump arc at 60 ms, and measures signed A/D local displacement;
- records the selected preset/helmet ID and accepted attack counters without
  pretending one preset is the whole roster;
- records ability activation counters and presentation cues without assigning
  false “flight” or “detonation” labels to fixed-delay screenshots;
- uses `remoteEntities` for target position and `healthPoints`, `shieldPoints`,
  and `lifePhase` for correlated combat evidence;
- labels page reload as `refresh_rejoin`, never secure resume;
- samples frames until the entire scripted load and settle window are complete;
- measures HUD label clipping at 1920×1080, 1024×640, and 2560×1080;
- enters Practice via `#play-btn` and explicitly reports the Iron
  Bastion/Inkfall divergence;
- removes its owned temporary authority state and placeholder;
- emits a machine-readable coverage ledger that names every untested major
  surface instead of hiding omissions.

## Current player-facing truth

- Canonical `49a7123` materially improved the staging VLR-7 first-person pose
  and reduced Inkfall overhead clutter. Those captures are review candidates,
  not human acceptance.
- The live opponent body can still be the procedural block/capsule fallback.
  Candidate character families and role helmets are not yet an accepted active
  runtime.
- Practice and online are not yet one vertical slice: Practice remains Iron
  Bastion while online targets Inkfall Foundry.
- G7 Cutline HUD is integrated, but the owner has not approved its visual
  language and narrow-layout clipping has been observed.
- Audio remains largely procedural and requires an actual listening pass.
- Rev5 presentation is render art over revision-3 authority. It must not be
  described as new Rev5 collision authority.

## Exhaustive audit contract

Use `docs/audits/KYX_FULL_GAME_AUDIT_MATRIX_2026-07-31.md`. It covers boot,
input, movement, camera, Practice parity, all four roles, all six weapon
families, Blink and throwable abilities, first/third-person models, skins,
helmets, animations, damage/headshots, kill/death/respawn, scoreboard, secure
resume, remote presentation, map identity/geometry/spawns/portal/library,
HUD/UI, accessibility, audio/VFX, viewports, 2/4/8 occupancy, soak,
package/provenance, and staging.

## Recovered v2 audit result

The repaired harness was committed at
`2539f861e134aacea133773b863508d680d61901` and run once from a clean source
state. Its final packet is:

`evidence/2026-07-31/fable5-full-game-audit-2539f86`

The run recorded three passed stages, ten partial stages, no failed stages, no
browser console errors, and no uncaught page errors. It genuinely observed
two-client movement, weapon selection/accepted attacks, Blink and three
throwable activations, authority damage, kill, score, death, respawn,
scoreboard, refresh/rejoin, three HUD viewports, and Practice launch.

The evidence README contains the exact metrics and Human Brain / Human Eye
verdicts. Important rejects remain: procedural opponent, missing animation and
role-helmet proof, ADS arm/contact pose, primitive smoke/frag VFX, weak
damage/death feedback, narrow-HUD clipping, Practice/online divergence, a
one-second performance hitch, and no human-ear audio verdict.

## Required next order

1. Commit and push the final SHA-named evidence packet.
2. Merge the bounded Fable branch into canonical main after confirming the
   branch is clean and the pointer-lock CSS delta remains desired.
3. Continue one desktop Inkfall slice: real Assault body/runtime animation,
   shared Practice/online HUD and arena, then complete combat/ability/audio/VFX.
4. Run genuine final-source 2/4/8 evidence and the 30-minute soak only after
   those large changes stop.
5. Close owner license/distribution decisions and staging readiness. Production
   remains separately authorized.

## Owner-only decisions still open

- visual acceptance of map, first-person weapons, opponent body, helmet, HUD,
  menus, ability VFX, and portal;
- human-ear acceptance of movement, weapons, throwables, portal, ambience, and
  the absence of recurring sirens;
- project license and source/built/both distribution mode;
- final role/weapon exposure and arbitrary ability-loadout rules;
- production promotion after a staging walkthrough.
