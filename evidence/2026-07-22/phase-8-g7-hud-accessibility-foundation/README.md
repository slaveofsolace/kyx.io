# Phase 8 G7 HUD/accessibility foundation evidence

Status: **NOT A G7 PASS**. This bundle freezes the strongest truthful automated
and browser-observed foundation available on 2026-07-22. The strict audit exits
1 because current manual/runtime coverage is incomplete.

## Provenance

- Repository: `C:\AI Projects\Projects\Games\evio\evio-repo`
- Branch / source commit: `main` / `81aa1d02acce8e30ba411bb895901d2d2ac6694e`
- Worktree: dirty shared multi-agent worktree (70 status entries at provenance capture)
- Host: Windows `10.0.26200`, x64
- Browser: system Chrome `150.0.7871.129`
- Browser GPU mode for these headless captures: ANGLE SwiftShader
- Preview: `http://127.0.0.1:5173/`

## Implemented foundation

- Validated, fail-safe local settings for HUD/crosshair scale and color, high
  contrast, reduced motion, reduced flash, subtitles, and visual sound cues.
- Keyboard-visible focus, dialog focus containment/restoration, pointer-loss
  input neutralization, raw-pointer fallback, and actionable lock-denial UI.
- Text/pattern LOW and CRITICAL vital states plus explicit ammo/reload labels.
- Timed subtitle DOM with speaker/text/direction semantics and a future dialogue
  hook. Offline Practice currently has no spoken dialogue source.
- Optional, rate-limited visual alternatives for explosion, damage received,
  empty weapon, blink, hostile vocalization, and hostile attack. Non-spatial
  cues use `NEARBY` or no direction; they do not reveal exact enemy positions.
- One compact, real three-ability rack: F frag, Q blink, E smoke, with numeric
  READY/EMPTY/CHARGE state and real unavailable reasons.
- Four-sector damage direction derived from actual Bot/Zombie world positions.
  Missing or degenerate source data produces no fabricated direction.
- Dormant interaction-prompt and online-only connection-warning hooks. They
  remain hidden in Offline Practice because it has no keyed interactable or
  online session.

## Automated results

- Focused accessibility/HUD tests: **9 files / 23 tests passed**.
- Adjacent input/movement/accessibility tests: **15 files / 89 tests passed**.
- Full Vitest suite: **79 files / 668 tests passed**.
- TypeScript check: pass.
- ESLint: pass.
- Vite production build: pass; the existing large-chunk warning remains.
- Observational static audit: **21 pass / 2 partial / 0 fail**.
- Strict static audit: expected exit **1**. Remaining partial static rows are
  `P8-COLOR-INDEPENDENCE` and `P8-SCALE-RESPONSIVE`.

## Browser observations

- Settings persistence capture at 1440x900 includes subtitles ON and critical
  sound indicators ON.
- Caption/audio-cue capture at 1280x720 and 125% HUD scale shows a semantic
  `FRONT` subtitle and intentionally coarse `NEARBY` hostile sound cue without
  covering crosshair, vitals, weapon, timer, or ability control.
- Combat hierarchy capture at 1280x720 shows three distinct ability states,
  unavailable reason, and `DAMAGE LEFT`; connection and interaction hooks stay
  hidden in Offline Practice.
- The caption/audio and combat hierarchy captures use disclosed deterministic
  presentation fixtures. They are not claimed as organic combat/manual proof.
- The new capture sessions recorded zero console or page errors.

## Exact remaining evidence before G7 can be claimed

1. Viewport bounds/overflow plus peripheral readability at 1280x720,
   1920x1080, 2560x1440, and 3440x1440.
2. Real browser zoom walkthroughs at 100%, 125%, and 200%; minimum/default/
   maximum HUD scale screenshots at each target viewport.
3. Complete keyboard-only menu/settings/loadout/pause/return-focus walkthrough,
   real pointer-lock denial, Escape/focus-loss recording, and no-stray-input proof.
4. Paired default/reduced-motion, default/reduced-flash, high-contrast,
   forced-colors, and combined-mode videos with comfort review.
5. Full color, grayscale, and selected color-vision simulations with critical
   state identification results.
6. Long player-name and long/localized-label clipping/overflow review.
7. Organic neutral/damage/low-health/reload/cooldown/kill/respawn state capture;
   paired audio-on/audio-muted tasks; caption timing fixture; keyed interaction
   capture when an interactable exists; online connection-warning capture when
   an online session exists.
8. Screen-reader announcement-order and priority notes for live regions.
9. Named-machine performance profile covering menu, representative combat,
   settings, and HUD scale changes: frame/main-thread p95/p99, recurring long
   tasks, DOM mutation count, renderer counters, and heap.
10. Five-second new-player readability test for health, ammo/reload, weapon,
    ability readiness, score/time, and danger direction, recording time/errors.
11. Production debug-overlay scan, finalized known-issues disposition, human
    visual review, and manifest generation only after the bundle is final.

## Reproduction commands

```powershell
node tools/a11y/audit-phase8-static.mjs
node tools/a11y/audit-phase8-static.mjs --strict
npx vitest run tests/unit/app/settings
npx vitest run tests/unit/app/movement tests/integration/movement/presentationIsolation.test.ts tests/unit/app/settings
npm run typecheck
npm run lint
npm run build
npx vitest run
```

See `tests/accessibility/PHASE8_AUDIT_MATRIX.md` for the governing matrix and
`known-issues.md` for current blockers and fixture boundaries.
