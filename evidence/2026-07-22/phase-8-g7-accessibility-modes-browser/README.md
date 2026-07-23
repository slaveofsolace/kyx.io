# G7 browser accessibility modes — bounded slice

Classification: `BOUNDED_G7_ACCESSIBILITY_MODE_BROWSER_PASS`

Gate state: `G7_OPEN`

Rendered browser validation at 1280x720 covers three bounded rows:

- Forced-colors active: the pause actions, numeric vitals/ammo/timer, mode/score text, and all three ability labels remain visible with zero document overflow.
- Saved high-contrast + reduced-motion + reduced-flash profile: the body contract is applied, the flash layers remain at zero opacity, and sampled UI/HUD transitions are reduced to one microsecond.
- OS `prefers-reduced-motion: reduce` with the saved toggle off: sampled transitions are also one microsecond and the timed intro reaches its hidden end state.

The browser pass found and fixed a real cascade bug: several late visual-system transition shorthands were more specific than the former universal reduced-motion rule, leaving 120ms settings transitions. The new `#app`-scoped selectors out-rank those shorthands while retaining near-zero animation duration instead of disabling animations, so completion-driven lifecycles still run.

The focused regression test passed 2/2. This evidence does not claim G7: screen-reader review, browser zoom, human color-vision/readability review, pointer-lock/focus video, organic combat states, and named-machine performance remain open.
