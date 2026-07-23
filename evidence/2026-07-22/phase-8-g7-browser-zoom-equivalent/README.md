# G7 browser zoom-equivalent layout — bounded slice

Classification: `BOUNDED_G7_ZOOM_EQUIVALENT_LAYOUT_PASS`

Gate state: `G7_OPEN`

The in-app Chromium exposes exact viewport control but not its native zoom toggle. This pass therefore represents a 1280x720 physical desktop at 100%, 125%, and 200% zoom with the corresponding CSS layout viewports: 1280x720, 1024x576, and 640x360.

The first 200% run found a genuine blocker: the app's CSS treated every viewport below 900 CSS pixels as touch-only and displayed `DESKTOP REQUIRED`, even though the browser still had keyboard/mouse input. The width condition was removed; the CSS fallback now responds only to coarse/no-hover input, while the existing JavaScript user-agent and pointer policy remains intact.

After the fix, all three layouts retain 13 visible semantic HUD elements, zero document overflow, zero measured elements outside the viewport, and no desktop-required overlay. Focused CSS regression coverage passes 3/3 across two files.

This does not close the literal native-browser-zoom or human-readability rows. Pointer-lock/focus video, organic combat states, screen-reader validation, and named-machine performance also remain open, so G7 stays open.
