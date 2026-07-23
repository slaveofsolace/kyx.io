# Phase 8 HUD/accessibility audit matrix

Status: **implemented foundation — G7 remains open pending the full runtime and manual matrix**

This matrix translates the Phase 8 backlog and the UI, performance, and QA
specifications into reviewable contracts. The 2026-07-22 foundation implements
validated presentation settings, keyboard focus recovery, non-color vital cues,
semantic subtitle hooks, and optional critical-sound indicators. The observational audit reports both those changes and remaining gaps;
`--strict` intentionally fails until every G7 row has current evidence.

## Current baseline findings

- Native buttons, labels, local/online truth, numeric health/ammo, status live
  regions, and pointer-loss input neutralization remain intact.
- `Tab` is intercepted only while the viewport owns pointer lock. Released
  panels and dialogs use native traversal; pause focus wraps between actions.
- Panels expose `aria-expanded`, move focus inside, and restore their trigger;
  pause/game-over dialogs focus their primary action and use visible focus rings.
- Reduced motion is persisted and scales camera bob/roll/recoil, viewmodel
  bob/sway/kick, sprint carry, and FOV pulse without changing authority state.
- The active pointer-lock path now uses the tested raw-pointer fallback and
  surfaces denial as actionable guidance in the keyboard-reachable pause dialog.
- High contrast, reduced flash, bounded HUD scale, crosshair size/color, and
  text/pattern critical vital cues are implemented.
- Subtitles now have a persisted preference plus a timed speaker/text/direction
  live region and audio dialogue hook. This build has no spoken dialogue source,
  so real caption timing/readability capture remains open.
- Optional, rate-limited critical-sound indicators are wired to explosion,
  received damage, empty weapon, blink, hostile vocalization, and hostile attack
  events without claiming exact enemy positions. Audio-muted task capture remains open.
- Core HUD now presents the actual F frag, Q blink, and E smoke abilities as one
  compact rack with numeric READY/EMPTY/CHARGE states and unavailable reasons.
- Bot and zombie damage callbacks carry their real source positions into a
  coarse front/rear/left/right indicator. The classifier returns no direction
  for missing data instead of fabricating one.
- Interaction-prompt and online-only connection-warning hooks are implemented
  but dormant in Offline Practice because the current world has no keyed
  interactables and no network session.
- Browser evidence currently covers the settings surface at 1440x900, the
  pause/HUD at 1280x720, caption/audio-cue rendering at 1280x720 and 125% HUD
  scale, and a disclosed deterministic ability/damage-state fixture at 1280x720.
  The full 1080p/1440p/ultrawide, 125%/200% browser zoom, min/max scale,
  long-string, color-vision, organic combat-state, and manual matrices remain open.

## Contract matrix

| ID | Required outcome | Current state | Automated scaffold | Evidence required before G7 |
|---|---|---|---|---|
| P8-KBM-SEMANTICS | Native desktop KBM controls and a named game viewport | Present baseline | Static markup audit; runtime accessible-name inventory | DOM snapshot and keyboard-only recording |
| P8-KBM-TAB-SCOPE | Tab changes menu focus and is intercepted only for the in-match scoreboard | Implemented; bounded focus trace captured | Static scoped-Tab detector; runtime tab sequence | Menu, settings, loadout, pause, and return-focus trace |
| P8-KBM-FOCUS-VISIBLE | Every interactive control has a visible, contrast-safe focus state | Implemented; partial screenshots | CSS contract audit; computed-style runtime probe | 720p/1080p screenshots in normal and high contrast |
| P8-KBM-FOCUS-MANAGEMENT | Panels/dialogs move and restore focus; hidden panels are not tabbable | Implemented; Escape/manual video open | Runtime focus-order and hidden-focus inventory | Open/close/Escape flow video and DOM focus log |
| P8-LOCK-NEUTRALIZE | Escape, blur, visibility loss, and lock loss release stale input | Implemented; programmatic real lock-loss captured | Static callback audit; runtime/manual transition probe | Pointer-lock/focus-loss recording with no stray fire/jump |
| P8-LOCK-RAW-FALLBACK | Raw mouse request reports support and falls back cleanly | Implemented and unit tested | Static integration audit | Supported and rejected browser permission cases |
| P8-LOCK-DENIAL-UI | Permission denial gives actionable, non-modal-spam guidance | Implemented; real denial screenshot open | Static failure-path audit | Denial screenshot, keyboard fallback, console log |
| P8-MOTION-CONTRACT | Reduced motion disables bob, kick, FOV pulse, tilt, and shake without affecting authority | Implemented; paired visual proof open | Static contract audit plus existing movement isolation tests | Normal/reduced paired capture and stable authority hash |
| P8-MOTION-CSS | Nonessential UI animation honors `prefers-reduced-motion` | Implemented; animation inventory open | CSS media-query audit; runtime animation inventory | Reduced-motion screenshots/video, no recurring animation |
| P8-FLASH-REDUCTION | Reduced-flash/photosensitivity preset bounds flashes and strobes | Implemented for full-screen damage/teleport; combat proof open | Static setting/effect audit | Effect-capped combat recording and manual review |
| P8-CONTRAST-MODE | High-contrast and forced-colors modes remain readable | High contrast implemented; forced-colors open | Static contract audit; forced-colors runtime probe | Normal/high-contrast/forced-colors component captures |
| P8-COLOR-INDEPENDENCE | Critical status is communicated with text/shape/pattern, never color alone | Vital LOW/CRITICAL text and patterns implemented; wider state audit open | Numeric/text and class-state inventory | Grayscale plus selected color-vision simulations |
| P8-SCALE-HUD | Text/HUD scale minimum and maximum are persisted and bounded | Implemented and persistence captured; min/max matrix open | Static settings/token audit | Minimum/maximum HUD screenshots at each target viewport |
| P8-SCALE-RESPONSIVE | Menus and HUD survive target sizes, long strings, and zoom | Partial | Runtime overflow/bounds probe | 1280x720, 1920x1080, 2560x1440, 3440x1440; 125%/200% browser zoom |
| P8-CAPTIONS-HOOK | Subtitles/captions setting and timed DOM region exist | Implemented and unit tested; current dialogue source absent | Static selector/settings audit plus semantic renderer tests | Caption timing/readability recording with a deterministic subtitle fixture |
| P8-AUDIO-CUE-HOOK | Critical audio-only cues have optional visual indicators | Implemented and unit tested; paired runtime proof open | Static event/DOM hook audit plus rate-limit tests | Paired audio-on/audio-muted task capture |
| P8-HUD-CORE-HIERARCHY | Crosshair, health/shield, ammo/reserve, weapon, three abilities, score/timer, conditional network warning | Implemented and unit tested; five-second task open | Static ID/state inventory; runtime visible-state probe | Five-second combat readability task with new players |
| P8-HUD-EVENT-HIERARCHY | Damage direction, hit/kill, pickup, unavailable reason, feed, respawn, and interaction prompt are event-driven | Implemented hooks; real combat/interaction fixture proof open | Static event/source inventory plus directional and semantic HUD tests | Deterministic combat event fixture screenshots/video; keyed interaction capture when an interactable exists |
| P8-HUD-LIVE-REGIONS | Critical DOM status updates have deliberate announcement priority | Partial | Static `aria-live` inventory; runtime mutation probe | Screen-reader/manual announcement notes |
| P8-DEV-OVERLAY-BOUNDARY | Debug/performance overlay is opt-in and development-only | Present baseline | Static build-boundary audit | Production bundle scan and dev screenshot |
| P8-PERF-HUD-DOM | Hot HUD updates do not rebuild the DOM per frame | Present in current hot update | Static hot-method audit; later performance profile | Main-thread p95/p99 and long-task capture in combat |
| P8-SELECTOR-CONTRACT | Stable selectors/data attributes describe component state | Foundation contract attributes added; wider state map open | Static selector audit | Browser fixtures using only documented selectors |
| P8-EVIDENCE-MATRIX | Every automated and manual claim has reproducible artifacts | Scaffolded | Matrix self-audit | Sealed README, environment, commands, results, screenshots, video, known issues |

## Runtime evidence matrix

Every row records URL/build, browser/version, OS/GPU, viewport, device scale,
quality tier, HUD scale, browser zoom, input method, accessibility modes, seed,
room/mode, and exact command.

| Dimension | Required values | Automated evidence | Manual evidence |
|---|---|---|---|
| Viewport | 1280x720, 1920x1080, 2560x1440, 3440x1440 | Bounds/overflow report plus deterministic screenshots | Peripheral readability notes |
| Browser zoom | 100%, 125%, 200% | CSS-zoom layout proxy only | Real browser zoom keyboard walkthrough |
| HUD scale | Minimum, default, maximum | Persisted value and bounds assertions | In-motion readability screenshots |
| Input | Keyboard-only, keyboard/mouse, pointer-lock denied | Focus log and action result | Pointer-lock/Escape/refocus recording |
| Modes | Default, reduced motion, reduced flash, high contrast, combined | Computed settings/style report | Paired videos and comfort notes |
| Color | Full color, grayscale, selected color-vision simulations | Component image transformations later | Status-identification task results |
| Text stress | Long player names, long/localized labels | Clipping/overflow report | Visual copy/readability review |
| HUD states | Neutral, damage, low health, reload, cooldown, kill, respawn, connection warning | Deterministic state fixture | Five-second combat readability test |
| Performance | Menu, representative combat, settings open, HUD scale changes | Frame/main-thread p95/p99, long tasks, DOM mutation count | Named-machine observation |

The **five-second** readability test asks a new player to identify health,
ammo/reload, equipped weapon, ability readiness, score/time, and the active
danger direction without pausing. Completion, errors, time, and unsolicited
confusion are recorded; impressions alone do not pass the row.

## Evidence bundle contract

The eventual `evidence/<date>/phase-8-hud-accessibility/` bundle contains:

- `README.md` with commit, dirty status, URL, build, browser, machine, seed,
  viewport/zoom/scale/modes, selectors, and reproduction commands;
- static and runtime JSON reports, TypeScript/lint/build/browser logs, and a
  list of console, page, first-party request, and WebSocket failures;
- component-focused screenshots for every matrix row, plus deterministic
  normal/grayscale/color-vision/high-contrast/reduced-mode comparisons;
- keyboard-only and pointer-lock/focus-loss videos;
- five-second readability and manual screen-reader notes;
- performance profiles with frame/main-thread p95/p99, recurring long tasks,
  DOM mutation counts, renderer counters, heap, and named hardware tier;
- `known-issues.md` with severity, owner, repro, waiver owner, and follow-up;
- a manifest generated only after the contents are final.

## Commands

Observational static audit (expected to report gaps while returning success):

```powershell
node tools/a11y/audit-phase8-static.mjs
```

Explicit runtime observation through the repository Playwright workflow:

```powershell
npx playwright test tests/accessibility/phase8-runtime.spec.ts --project=chromium-desktop
```

Strict enforcement is intentionally deferred until Phase 8 implementation:

```powershell
node tools/a11y/audit-phase8-static.mjs --strict
$env:KYX_PHASE8_A11Y_STRICT = '1'
npx playwright test tests/accessibility/phase8-runtime.spec.ts --project=chromium-desktop
```

The 2026-07-22 foundation capture uses the repository Playwright installation
and system Chrome. This is not a G7 waiver, full resolution-matrix proof, or
human visual approval.
