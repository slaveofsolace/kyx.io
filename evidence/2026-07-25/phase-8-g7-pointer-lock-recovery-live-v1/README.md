# G7 pointer-lock recovery and 720p menu audit

Verdict: **G7 remains open.** This package proves one bounded failure/recovery
path and fixes one directly observed 1280x720 menu defect. It is not a broad
accessibility, successful pointer-lock, or final visual acceptance claim.

## Direct runtime result

The final source state was loaded at `1280x720` in the Codex in-app Chromium
browser. That browser exposes neither `document.pointerLockElement` nor
`requestPointerLock`, so starting Offline Practice exercised the unsupported
pointer-lock path:

- the live HUD and match remained visible behind a focused pause dialog;
- the dialog named the denial and told the player how to retry;
- `RESUME PRACTICE` received focus;
- `QUIT TO PRACTICE MENU` returned cleanly;
- the pause dialog closed and `START OFFLINE PRACTICE` regained focus.

This is denial-path evidence only. It does not prove a successful pointer lock.

## Defect found and corrected

The first stable menu return exposed both horizontal and vertical scrollbars on
the launch card. Browser geometry showed a one-pixel rounding mismatch:
`883x398` client size versus `884x399` scroll size.

The bounded CSS correction:

- hides horizontal overflow on the card;
- retains vertical scrolling;
- suppresses rounding-generated scrollbar chrome only on desktop viewports at
  least `981x640`, where the card content is not height-constrained;
- leaves narrower/taller-content layouts with normal visible vertical scrolling.

The final menu measured `898x398` client size versus `899x399` scroll size, with
`overflow-x: hidden`, `overflow-y: auto`, and `scrollbar-width: none`. Direct
visual inspection confirmed that the stray bars are gone.

## Evidence

- `paused-pointer-lock-denied-fixed-1280x720.png`
  - SHA-256 `906a4fc3226a451752e6eb33988c19c4ce8cf21189e9d1d1d87a9fa62ed0e380`
- `returned-menu-focus-fixed-1280x720.png`
  - SHA-256 `28636b9906658743f7a93baf30b817f88ad5e193ce28352e16f0b619e1becfca`
- `returned-menu-focus-stable-1280x720.png`
  - pre-fix defect, SHA-256
    `532d980a6df312de122956390b37a807e6c9e26527cf6ad42ed2435f3c50798b`
- `capture.json`
  - machine-readable state, geometry, diagnostics, checks, hashes, and limits.

The full reload/action diagnostic window contained two CDP diagnostic events
and zero warnings, errors, assertions, or uncaught exceptions. A final
post-scope action cycle contained no diagnostic events or problems.

## Automated checks

- Focused unit regression: 4 files and 36 tests passed.
- Phase 8 desktop Playwright probe: 2 passed and 2 strict-mode tests skipped.
- Production build: 155 modules transformed and PASS.
- The Playwright Vite server emitted one known Rapier deprecated-initialization
  warning; it is not concealed as a clean global-console claim.

## Still required for G7

- successful lock, Escape release, resume, and focus restoration in a browser
  that grants pointer lock;
- literal 125% and 200% browser zoom evidence;
- strict keyboard, reduced-motion, scale, caption, and forced-colors assertions;
- human review at the required desktop viewports.

Base commit: `19272e1f3216695479617479dcecfea7aca74e5a`. The working
tree also contained concurrent G3, G5, and Rev15 lanes; none were included in
this bounded result.

*Currently being worked on.*
