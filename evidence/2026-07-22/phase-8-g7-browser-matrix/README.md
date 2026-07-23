# G7 browser matrix — bounded viewport/HUD-scale slice

Classification: `BOUNDED_G7_VIEWPORT_AND_HUD_SCALE_BROWSER_PASS`

Gate state: `G7_OPEN`

The genuine offline-practice HUD was captured in Codex's in-app Chromium at four target viewports and all three supported HUD scale endpoints/profiles. All 12 cases had zero document overflow, zero visible semantic HUD elements outside the viewport, and the same 13 visible ARIA/role-bearing HUD elements.

The embedded browser denied pointer lock, so the captures show the real paused-practice layer over a live local match. This is suitable for layout-boundary validation, not keyboard/pointer-lock acceptance or organic combat-state readability.

The minimum profile was selected and saved through the visible HUD Scale control. Browser range interaction would not move from the minimum to the maximum in this environment, so the maximum `sio_settings` value was set through scoped CDP and the page was reloaded. The app then normalized and visibly applied `--hud-scale: 1.4` before measurement. No product source was modified by this operation.

Still open for G7: 100/125/200% browser zoom, forced-colors, reduced-motion/flash behavior, grayscale/color-vision review, long strings, screen-reader pass, pointer-lock/focus videos, organic low-health/reload/damage/caption states, named-machine performance, and human five-second readability.

Verify with:

```powershell
node .\verify.mjs
```
