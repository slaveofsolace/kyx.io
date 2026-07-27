# G7 human-designed HUD / UI review pack

Status: **implemented; explicit human visual acceptance required**

This pack documents the G7 presentation overhaul. It is evidence for review, not a claim that G7 is accepted.

## Source state

- Worktree: `C:\AI Projects\Projects\Games\evio\evio-g7-human-ui-20260726`
- Branch: `codex/g7-human-ui-20260726`
- Integrated canonical base: `145264d7d72e2dc1be63eddc355edf4e5d5e2cac`
- G7 source commit: `cadeb2b0e6773db7009499dc56231c12c98817ac`
- Before-capture source: `d324ee304ec70411c33e66ea8267410e76398c0f`
- Interactive capture URL: `http://127.0.0.1:6197`
- Browser-test URL: `http://127.0.0.1:6196`
- Reserved canonical ports left untouched: `5173`, `8787`

## Observed baseline problems

The six `before/` captures showed the same issues across menu, settings, narrow layout, HUD, pause, and scoreboard:

- Many translucent neon/glass layers competed with the map instead of forming a clear reading plane.
- Monospace, all-caps copy and tiny status labels were used indiscriminately, flattening hierarchy.
- Rounded cards, gradients, glows, scanner decoration, and micro-labels accumulated without a consistent structural purpose.
- The HUD gave health, ammo, abilities, score, timer, and secondary decoration nearly equal visual weight.
- Settings and scoreboard layouts read as dense console sheets; the narrow menu compressed rather than re-composing.
- Focus and accessibility controls existed, but presentation, spatial navigation, and controller traversal were not expressed as one coherent system.

## Authored direction

The replacement is a restrained industrial field-instrument system:

- Off-white paper surfaces sit on a near-black ink field; oxide marks the primary action, aqua marks functional/ally state, and saffron marks warning state.
- A condensed display face is reserved for titles and large values, a neutral sans face carries prose, and monospace is limited to data and key hints.
- Square geometry is the default. A single clipped corner is reserved for primary/actions and report surfaces instead of being repeated decoratively.
- Menu, settings, and loadout use solid reading planes with compact editorial grouping. Hidden launch content no longer competes behind open sheets.
- The HUD anchors timer and score at the top, survival state at bottom-left, weapon/ammo at bottom-right, and abilities at bottom-center. Each group has a distinct job and tested non-overlap.
- Pause, death, live scoreboard, and post-match report share the same paper/report grammar while preserving their different gameplay meanings.
- The online route adopts the typography, spacing, line, and color system without modifying or claiming multiplayer authority behavior.
- At 768 px the menu and settings recompose into a full-width, scrollable layout. At 1920 and 3440 px the authored scale increases instead of leaving a small desktop card adrift.
- Keyboard focus is visible and trapped within active panels/dialogs; spatial arrow navigation and standard gamepad D-pad/stick, A, and B behavior are implemented.
- Reduced-motion, reduced-flash, high-contrast, and forced-colors rules preserve text/numeric cues and remove nonessential animation.

The `avoid-ai-design` and `frontend-design` skills guided the removal of generic glass gradients, ornamental pills, excessive radii, and label clutter in favor of a specific field-report concept.

## Review matrix

| State | Before | After |
| --- | --- | --- |
| Desktop menu | `before/menu-1440x900.png` | `after/menu-1440x900.png` |
| Settings | `before/settings-1440x900.png` | `after/settings-1440x900.png` |
| Narrow menu | `before/menu-narrow-768x900.png` | `after/menu-narrow-768x900.png` |
| Narrow settings | — | `after/settings-narrow-768x900.png` |
| Gameplay HUD | `before/hud-1280x720.png` | `after/hud-1280x720.png` |
| Pause | `before/pause-1280x720.png` | `after/pause-1280x720.png` |
| Live scoreboard presentation | `before/scoreboard-1280x720.png` | `after/scoreboard-presentation-fixture-1280x720.png` |
| Loadout | — | `after/loadout-1440x900.png` |
| Online lobby presentation | — | `after/online-lobby-1440x900.png` |
| Kill feed presentation | — | `after/hud-killfeed-presentation-fixture-1280x720.png` |
| Death presentation | — | `after/death-presentation-fixture-1280x720.png` |
| Post-match presentation | — | `after/postmatch-presentation-fixture-1280x720.png` |
| Desktop scaling | — | `after/menu-1920x1080.png` |
| Ultrawide scaling | — | `after/menu-ultrawide-3440x1440.png` |
| High contrast + reduced motion | — | `after/settings-high-contrast-reduced-motion-1440x1080.png` |
| High-contrast menu | — | `after/menu-high-contrast-reduced-motion-1440x1080.png` |

`after/runtime-capture.json` is the machine-readable capture manifest. It records 16 views and zero console, page, or request failures.

## Fixture disclosure

The kill feed, scoreboard, death, and post-match captures are live browser DOM presentation fixtures produced through the actual HUD methods or existing dialog structure. They are labeled in `runtime-capture.json` and do not claim a gameplay result. The browser smoke test separately verifies the real hold-Tab scoreboard flow. The online image does not create/join a room and does not exercise authority behavior.

## Verification

See `verification.json` for the exact command matrix. Final integrated results:

- Main TypeScript check: pass
- Worker TypeScript check: pass
- ESLint: pass
- Unit suite: 74 files, 552 tests passed
- Production build: pass
- G7 browser suite: 3/3 passed on port 6196
- Runtime capture: 16/16 written with zero captured errors on port 6197
- Scope audit: no G7 edits to authority/evidence behavior, maps, character assets, Cloudflare, or GitHub deployment

The unit run retains an upstream Rapier initialization deprecation warning, and the build retains the existing large-chunk advisory; neither caused a failure.

## Non-claims and required review

- **G7 is not accepted.** A human must visually review the captures and approve or reject them.
- The screenshots are not proof of multiplayer authority correctness, map acceptance, character acceptance, or deployment readiness.
- Keyboard behavior is browser-tested and controller navigation logic is unit-tested; no physical controller hardware session is claimed.
- High-contrast and reduced-motion states are captured, but no formal WCAG certification, screen-reader acceptance session, or assistive-technology sign-off is claimed.
- Real browser zoom at 125% and 200% was not manually certified in this run; responsive and ultrawide layout behavior is covered by runtime/browser checks.
