# Foundry Command UI/HUD revamp

Deployment checkpoint for the KYX.IO local practice shell. This pass replaces
the generic cyan-glass presentation with an industrial command-console system
while preserving the existing gameplay, settings, accessibility, and HUD DOM
contracts.

## Captured surfaces

- `before/` — pre-revamp menu, settings, and in-practice HUD.
- `after/menu-1440x900.png` and `after/menu-1280x720.png` — settled menu after
  the boot overlay completes.
- `after/settings-1440x900.png` and `after/settings-1280x720.png` — top of the
  expanded 760px calibration panel.
- `after/settings-bottom-1440x900.png` and
  `after/settings-bottom-1280x720.png` — scrolled state proving the Save action
  remains reachable.
- `after/hud-1440x900.png` and `after/hud-1280x720.png` — live practice HUD,
  captured after the game and bots initialized.
- `after/hud-high-contrast-140-1440x900.png` and
  `after/hud-high-contrast-140-1280x720.png` — maximum supported HUD scale with
  high contrast enabled.
- `after/menu-reduced-motion-1440x900.png` — reduced-motion menu state.

## Verification

| Check | Result |
| --- | --- |
| Vite production build | PASS |
| Worker TypeScript | PASS, 0 diagnostics |
| Simulation TypeScript | PASS, 0 diagnostics |
| ESLint | PASS, 296 files, 0 warnings/errors |
| UI/accessibility unit suite | PASS, 32/32 |
| Keyboard focus and settings containment | PASS |
| Reduced-motion infinite-animation check | PASS, none running |
| Forced-colors capability probe | PASS |
| Runtime console/page errors across captures | PASS, none |
| 140% HUD scale viewport bounds | PASS at 1440x900 and 1280x720 |

The main TypeScript project still reports 12 diagnostics, all localized to the
active exact-pose collision probe in
`tests/integration/movement/inkfallCanonicalTraversalSnag.test.ts`. That
separate known work item is recorded in `WORK_IN_PROGRESS.md`.

This is a deployment-ready UI/HUD checkpoint, not a claim that formal G7
acceptance is closed. *Currently being worked on.*
