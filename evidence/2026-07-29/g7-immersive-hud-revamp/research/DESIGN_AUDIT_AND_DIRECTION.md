# KYX.IO G7 HUD/UI research and direction

Date: 2026-07-29  
Branch baseline: `codex/g7-immersive-hud-20260729` at `1c6f889e0a87f54de2081df39de18188d61ad344`  
Review status: direction selected for implementation; **not human accepted**

## Scope and evidence

This audit covers the desktop-browser HUD and surrounding match presentation only. It does not approve or alter map art, character or weapon assets, authority behavior, Worker gameplay semantics, Cloudflare configuration, or deployment.

Source and runtime evidence inspected:

- Current practice route markup, `HUD.js`, loadout/settings/menu code, UI styles, and keyboard/controller focus helpers.
- Current online route, its typed authority snapshots, separately-built online HUD, reconnect state, lobby, death state, and Tab scoreboard.
- Source-frozen G5 player-eye packet:
  `evio-repo/evidence/2026-07-29/g5-inkfall-rev5-acceptance-candidate/player-eye-v7`.
- Fresh local practice and online runtime on non-canonical ports, plus the before captures in:
  `evidence/2026-07-29/g7-immersive-hud-revamp/before`.
- Historical G7 packets were treated as evidence of prior attempts, not as accepted visual direction.

## Observed problems

### Global presentation

- The normal match view lacks a single dominant information hierarchy. Health, weapon, abilities, score, map label, room label, and preview status appear as separate widgets rather than one instrument.
- Large menu and lobby surfaces use equal-weight panels, broad empty card areas, uppercase micro-labels, monospace text, and repeated outlined boxes. The result reads as a generated sci-fi dashboard rather than an authored arena game.
- Typography is not role-based. Labels, instructions, status, and telemetry often use the same case, weight, and spacing.
- Cyan, amber, red, white, transparency, border treatments, and radii do not have strict semantic ownership.
- Normal player flows expose product and development language such as preview status and detailed room diagnostics. Those messages compete with match state and reduce immersion.
- The world-to-HUD transition has no coherent physical idea. Individual cards float over the scene instead of feeling like one peripheral competitive instrument.

### HUD surface/state audit

| Surface | Current observation | Required correction |
| --- | --- | --- |
| Health and shield | Bottom-left is peripheral but shield, health, and energy share similar visual weight. Damage hierarchy is weak. | Shield reads first while present; exposed health becomes unmistakable. Use size, order, fill, and warning shape, not color alone. |
| Ammo, weapon, ADS | Magazine, reserve, weapon rail, reload, input hints, and ADS state compete in one busy corner. | Magazine is dominant; reserve and weapon name are subordinate; reload/empty/ADS get one clear state line. |
| Four ability slots | Practice has four slots but the cells are small. Online composes a separate three-ability treatment and omits a strong locked Blink presentation. | Q/Blink is always visible and mechanically locked. E/F/Z use the same geometry and expose ready, cooldown, charges, unavailable, and selected-kit state. |
| Loadout selection | Authority-safe combat presets bind weapon, helmet, and three abilities. Current E/F/Z rows are disabled, so the UI says “preset” rather than feeling selectable. | Make each E/F/Z slot operable through compatible package selection and clearly disclose the linked weapon/helmet/ability change. Do not permit invalid authority combinations. |
| Blink preview/lock | The data contract is correct, but the visual treatment is weak and inconsistent between practice, loadout, and online. | Use one lock notch and one Q key treatment everywhere. “Locked” is a loadout fact, not a gameplay warning. |
| Score, timer, team, objective | Top score and timer are small and visually faint. Extra top-corner labels compete with them. | One compact top-center bridge owns score, timer, and objective. No map marketing or preview text during play. |
| Hit feedback | Existing confirmation is present but visually close to other center feedback. | Keep hit feedback at the reticle and momentary. Use shape/weight changes for armor, health, and headshot. |
| Headshot feedback | Not sufficiently distinct from a normal kill at movement speed. | A short amber calibration tick plus a compact `Headshot` label; never a large medal card. |
| Kill banner | The banner is readable but behaves like a generic floating panel. | Use one brief ruled stamp below the sightline with target name or concise event only. |
| Kill feed | Rows are small and decorative identifiers compete with the combat event. | Limit visible rows, align killer/event/victim, highlight the local player with an opaque background, and retire rows quickly. |
| Tab scoreboard | Current practice/online treatments differ and can occupy too much visual area or use weak transparency. | One compact, sufficiently opaque table with clear team grouping and local-player row. Hold-to-view remains unchanged. |
| Damage direction | Directional arcs exist, but their broad decorative form competes with the scene. | Use short high-contrast edge ticks in the incoming direction. Reduced-flash mode removes bloom/pulse. |
| Connection/reconciliation | Useful authority state is mixed with product/dev vocabulary. Fatal failures can dump technical strings into the player-facing surface. | Stable state stays quiet. Reconnect is one calm player-safe line. Fatal state offers Retry and Return; technical codes remain in debug/log detail only. |
| Menus and practice launch | Oversized card, repeated labels, and empty area make the launch surface feel like a template. | Compact two-column command surface: mode promise and primary action first, session facts second. |
| Online lobby | Very large blank page and verbose preview/disclaimer copy overwhelm Create/Join. | Compact create/join panel, restrained scope note, explicit focus order, and technical diagnostics only when debug is requested. |
| Loadout | Long panel and equal-weight chips make kit choice slow to scan. | Four visible ability sockets beside four coherent kit choices; selected package and consequences stated once. |
| Settings | Tall modal can exceed the viewport and gives every control equal weight. | Two-column desktop grouping, sticky save/close rail, readable labels, bounded internal scrolling, and visible keyboard/controller focus. |
| Pause | Functional focus handling exists, but the dialog is visually detached from the HUD language. | Small solid instrument, primary Resume action, no decorative glass. |
| Spectator/death/respawn | Death/result surfaces use generic modal presentation; online status can become technical. | Clear eliminated/spectating/respawn hierarchy, killer/state first, countdown second, safe action last. |
| Accessibility | High contrast, reduced motion, reduced flash, captions, visual audio cues, HUD scale, and focus helpers already exist. | Preserve the contracts; ensure every state survives without animation and without hue-only meaning. |
| 16:9 and ultrawide | 1280×720 is crowded at the lower edge. Ultrawide can scatter HUD elements too far apart. | Use a centered maximum HUD safe zone with clamped side margins; keep gameplay instruments within a 16:9 reading cone on ultrawide. |

## Primary reference research

These references are used to extract interaction and hierarchy principles. No trademarked art, icons, layouts, or brand styling will be copied.

### ev.io — ability/loadout clarity and obstruction control

- The official game surface exposes abilities as a first-class route, and its changelog documents one utility plus two damage-grenade choices:
  https://ev.io/
  and
  https://ev.io/changelog
- The same changelog records removing blocking invincibility copy, shrinking versus boxes, improving health-bar presentation, and restoring a concise respawn timer.
- Extracted principle: ability choices must be understandable before spawn, while match copy must get out of the player’s sightline.

### Quake Champions — arena glanceability and configurable grouping

- Official HUD updates added crosshair scaling, outline colors, objective/distance markers, hit-color/scale controls, damage-number aggregation, and the ability to place ability information near either vitals or ammo:
  https://quake.bethesda.net/en/news/2RC4KZ6FhD1xuO05coZSFw
  and
  https://quake.bethesda.net/en/news/2WsLdFFKtoQRmjvrKUebWA
- Official scoreboard changes kept rank ordering truthful and added useful K/D information without forcing the local player to the top:
  https://quake.bethesda.net/de/news/2OMv5RdI1hGdDtT5cCRdiQ
- Extracted principle: large numerals, stable grouping, and configurable reading position beat decorative instrumentation.

### Halo Infinite — shield hierarchy, cooldown affordance, and safe zones

- Halo Support defines the shield as the primary light-blue bar and reveals yellow health beneath it only after damage. Shield depletion adds red flash and sound:
  https://support.halowaypoint.com/hc/en-us/articles/24284987877524-Shields-in-Halo-Infinite
- Equipment cooldown uses a fill band, darkens while unavailable, and returns to bright with a short audio cue:
  https://support.halowaypoint.com/hc/en-us/articles/26608497528596-Equipment-in-Halo-Infinite
- Accessibility settings expose HUD opacity, event-feed background, outline controls, sensory effects, and horizontal/vertical display margins:
  https://support.halowaypoint.com/hc/en-us/articles/4408122295444-Accessibility-Features-in-Halo-Infinite
  and
  https://support.halowaypoint.com/hc/en-us/articles/4407649252116-Guide-to-Halo-Infinite-Game-Settings
- Extracted principle: layered protection needs layered hierarchy; cooldown needs fill plus luminance; ultrawide needs explicit display margins.

### Valorant — predictable combat feedback zones

- Riot’s official 12.05 notes describe assist banners, expanded kill-feed causality, and predictable left/right placement for buffs and debuffs:
  https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-12-05/
- The official beginner guide ties round state, economy, abilities, weapon choice, objective, and communication into one preparation-to-action flow:
  https://playvalorant.com/en-us/news/announcements/beginners-guide/
- Extracted principle: combat feedback becomes faster to parse when each event type owns one consistent zone and only displays causal information.

### Apex Legends — differentiated ability cadence

- EA’s official guide distinguishes passive, tactical, and ultimate roles and their different cadence:
  https://help.ea.com/en/articles/apex-legends/abilities/
- Official updates explicitly add timers where an otherwise hidden refuel delay affects readiness:
  https://www.ea.com/games/apex-legends/apex-legends/news/space-hunt-event
- Extracted principle: a slot needs to communicate what kind of resource it is, whether it is available, and when it returns, not merely display an icon.

### Splitgate — portal/threat readability

- The official “Portals With a Purpose” article prioritizes clarity and counterplay. It uses distinct blocked-state effects, subtle movement trails, and differentiated audio for portal threats:
  https://www.splitgate.com/news/portals-with-a-purpose/
- The launch overview describes moving away from a bright playful UI toward a focused classic-arena identity and making menu sounds purposeful:
  https://www.splitgate.com/news/splitgate-arena-reloaded-launch-overview/
- Extracted principle: unique movement information should be subtle but immediately actionable, with redundant visual/audio cues rather than permanent decoration.

### The Finals — objective and team-state priority

- The official game page states each mode as a short sequence of objective verbs and describes playstyles as coherent specialization/weapon/gadget bundles:
  https://www.reachthefinals.com/
- Official patch notes reduce ping lifetime to cut clutter, improve distance scaling, and add scoreboard/HUD party indicators:
  https://www.reachthefinals.com/patchnotes/10-00
- Extracted principle: objective and team state should be expressed as the next action, and coherent packages are easier to learn than loose collections of choices.

## Inspiration boards

The generated boards are visual-direction evidence only. They are not production sprites, integration evidence, or proof of visual quality.

1. `boards/01-visor-edge.png` — rejected: bulky visor frame and oversized instruments.
2. `boards/02-ink-ledger.png` — rejected: literal paper treatment and large blocks.
3. `boards/03-tournament-signal.png` — rejected: still too much simultaneous UI and a visible scoreboard in normal play.
4. `boards/04-field-caliper.png` — rejected by the owner: bulky perimeter framing and excessive visual complexity.
5. `boards/05-cutline-corrective.png` — corrective direction: slim peripheral numerals, short rules, and an intentionally empty playfield.

## Selected direction: Cutline

Direction E replaces the rejected Field Caliper direction and is selected for implementation.

Why:

- It removes the permanent visor border, large blocks, and visual density the owner rejected.
- It reserves roughly three quarters of the viewport for the arena and weapon, including the full combat cone.
- It uses position, large numerals, short rules, and a single state tick instead of panel chrome.
- It gives health, ammo, score, abilities, and feed strict maximum footprints that remain plausible at 1280×720.
- It supports an accessible state grammar: filled/empty, bright/dim, shortened/full underline, text, and numerals work without relying on hue.
- It can be implemented with DOM/CSS tokens and real runtime data; no generated image asset is needed.

Literal board elements rejected during translation:

- Ability cells become even slimmer than the corrective board; no filled tiles in the shipped resting state.
- The headshot word is shorter-lived and closer to the reticle than the board suggests.
- No fake weapon art or generated icons.
- No fourth-slot lock shown during gameplay; Blink is the fixed Q slot and E/F/Z remain the three selectable package slots.

## Implementation grammar

### Typography

- UI/body: system humanist sans (`Segoe UI Variable`, `Segoe UI`, sans-serif).
- Scores, time, health, ammo, and cooldown numbers: `Bahnschrift`, `Arial Narrow`, sans-serif with tabular numerals.
- Monospace: debug drawer and technical identifiers only.
- Sentence case for actions and status. Uppercase reserved for one- to three-character key glyphs and short match abbreviations.

### Spacing and geometry

- 4px base; 8/12/16/24/32px primary intervals.
- 0–2px corner radius. No clipped container silhouettes in the resting HUD.
- No backdrop blur. Tiny local backplates appear only where live world contrast requires them.
- HUD elements stay inside a centered `1920px` maximum reading cone, with clamped safe margins.

### Color semantics

- Carbon: structure/background.
- Warm white: stable information.
- Cyan: shield, local team, selected/ready.
- Amber: objective, cooldown in progress, reload, warning.
- Red: incoming damage, exposed health critical state, fatal error only.
- State is never conveyed by color alone.

### Motion

- 90–160ms state changes; no ornamental entrance sequences during play.
- Kill/headshot feedback uses one scale or opacity change, never both plus glow.
- Reduced motion removes translation/scale and keeps direct opacity/state changes.
- Reduced flash removes pulsing exposure and uses a static warning notch.

### Signature move

One six-pixel diagonal cut appears at the active end of health, shield, reload, and cooldown rules. A matching short cut appears at the relevant screen edge for damage direction. It is a state mark, never a frame or ornament.

## Explicit rejection list

- Generic neon sci-fi cards and cyan-on-purple gradient soup.
- Glassmorphism, backdrop blur, and low-contrast translucent scoreboards.
- Rounded dashboard tiles, pill buttons, and inconsistent radii.
- Indiscriminate monospace, all-caps labels, and letter-spaced paragraphs.
- Meaningless micro-labels, fake telemetry, preview badges, and room diagnostics in normal play.
- Repeated corner brackets, diagonal cuts on every box, and ornamental full-screen frames.
- Bulky visor borders, ruler edges, caliper frames, and oversized instrument clusters from the rejected Direction D board.
- Giant menu hero cards with empty area.
- Hue-only cooldown, damage, team, or focus states.
- Center-screen medals, banners, and effects that obscure target reacquisition.
- Generated board imagery, generated text, or generated icons as production assets.

## Acceptance boundary

The selected direction authorizes an implementation candidate only. Compile success, automated browser checks, source-matched screenshots, and this rationale cannot grant visual acceptance. G7 remains pending explicit human review of the real runtime captures.
