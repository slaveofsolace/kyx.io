# KYX.IO G7 Cutline human-eye audit

Date: 2026-07-29
Review status: implementation candidate; **human visual acceptance still required**
Captured source commit: `3d835d094c80480df0b7a120102464d4d5c4a4ec`

## Outcome

Cutline is ready for owner review as a bounded G7 candidate. It is not self-approved.
The current implementation replaces the previously rejected bulky HUD direction with a
sparse competitive-FPS hierarchy: match state at top center, health at lower left,
weapon/ammo at lower right, and four compact ability slots at lower center. The center
sightline remains clear in normal play.

The generated inspiration boards were direction-finding evidence only. They were
explicitly rejected as production design and no generated board art, text, or icon was
integrated.

## Source-matched runtime evidence

### Offline and menu packet

Path:
`after/offline-final-source-matched-6322`

- Local origin: `http://127.0.0.1:6322`
- Captures: 17
- Runtime errors: 0 console, 0 page, 0 failed requests
- Prohibited coordinated ports untouched: `5173`, `8787`
- States: menu, settings, loadout, online-lobby resting state, normal HUD, kill feed,
  partial cooldowns, pause, scoreboard, death, postmatch, reduced motion, high
  contrast, 1280x720, 1440x900, 1920x1080, 3440x1440, and 768x900 menu layout.

The partial-cooldown frame uses the live `HUD` renderer with Blink at 35% and Smoke at
58%. It is a presentation fixture and makes no gameplay-outcome claim.

### Configured online authority packet

Path:
`after/online-final-source-matched-6323-8323`

- Frontend origin: `http://127.0.0.1:6323`
- Local authority origin: `http://127.0.0.1:8323`
- Captures: 6
- Runtime errors: 0 console, 0 page, 0 failed requests
- Two distinct local clients joined the same real room.
- Match phase: `active`
- Renderer: `three_webgl`
- Map: `inkfall_foundry@3`
- Presentation:
  `inkfall_foundry@3/press_archive/v5.0/geometry-portal-modular`
- Prohibited coordinated ports untouched: `5173`, `8787`

The online cooldown frame is authority-driven rather than staged. Two held `Z` inputs
were accepted, Frag charges moved from 2 to 1 to 0, and accepted activation count moved
from 0 to 1 to 2. The captured HUD state was `charging`, readiness was 18%, the visible
state read 6.2 seconds, and the fill was `scaleX(0.18125)`.

## Human-eye findings

### Problems corrected

- The former equal-weight card stack and bulky perimeter concept no longer frame the
  playfield.
- Practice and online now use the same four-slot ability language: fixed Q/Blink and
  selectable E/F/Z slots.
- Original line glyphs replace text-like placeholders and are shared by gameplay,
  online, and loadout surfaces.
- Ability names, state text, keys, health labels, combat feedback, and menu controls
  use a deliberate size hierarchy instead of uniformly tiny microcopy.
- Cooldowns communicate with text, dimming, amber state, and a directional fill; they
  do not depend on hue alone.
- Normal online play no longer displays the stable authority diagnostic message.
- The transient online ability message is sentence case and player-facing
  (`Frag deployed`) rather than uppercase system telemetry.
- Offline Health now follows the online hierarchy: label above the large value, then
  the state rule.
- Pause, score, death, result, and online scoreboard plates use controlled opacity.
  They preserve world context without sacrificing text contrast.
- The Tab scoreboard is compact, centered, and sufficiently opaque for player and
  team rows.
- Menu, settings, loadout, lobby, and gameplay surfaces share square geometry,
  typography, focus treatment, spacing, and cyan/amber/red semantics.

### Representative visual checks

- **1280x720:** health, ammo, weapon, and all four abilities remain readable without
  entering the central target cone.
- **1920x1080:** the HUD scales without oversized instruments or excess empty chrome.
- **3440x1440:** gameplay instruments stay within the centered reading cone rather
  than scattering to the physical display edges.
- **768x900 menu:** the desktop menu/settings composition remains operable and
  readable in the requested narrow evidence view. Mobile gameplay remains deferred.
- **Pause:** the arena and weapon remain visible through the dimmed background while
  the dialog itself maintains a strong reading surface and visible focus.
- **High contrast / reduced motion:** the existing preference contracts remain
  represented and the captured menus keep visible selection and focus states.

## Verification separation

### Compile and static pass

- `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` — PASS
- `node node_modules/typescript/bin/tsc -p tsconfig.worker.json --noEmit` — PASS
- Full ESLint over source, Worker, tests, tools, and Vitest configs — PASS

### Automated pass

- Targeted G7/HUD Vitest files — PASS, 8/8 tests
- Production Vite build — PASS
- G7 Playwright suite on alternate port `6196` — PASS, 4/4 tests

The build retained the repository's existing warning that some generated chunks exceed
500 kB. It did not produce an error.

### Runtime evidence pass

- Offline/menu packet — PASS, 17 captures, zero runtime errors
- Configured online packet — PASS, 6 captures, zero runtime errors
- Authority-driven cooldown trace — PASS

### Visual acceptance

**Pending explicit human review.** Compile results, automated checks, source-matched
captures, and this audit do not grant G7 acceptance.

## Nonclaims and remaining owner decisions

- No WCAG or formal accessibility-conformance claim is made.
- No claim is made that individual text scale, menu opacity, or HUD density matches the
  owner's final taste until the owner reviews the captures.
- No mobile gameplay acceptance claim is made; mobile is deferred.
- No map art, character/weapon art, multiplayer authority semantics, Worker gameplay
  behavior, Cloudflare configuration, deployment, or production state was changed by
  this lane.
- The owner may still request a final preference adjustment to ability glyph shape,
  HUD scale, or modal opacity after visual review.
