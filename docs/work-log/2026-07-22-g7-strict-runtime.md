# 2026-07-22 — G7 strict rendered-runtime slice

- Enabled the opt-in strict Phase 8 Playwright path.
- Found that the reduced-mode test asserted controls before opening the rendered Settings panel and used a stale `reduced motion` label that did not match the product's `Camera / HUD Motion` group.
- Corrected the test to follow the real user flow and target the actual semantic Settings controls.
- Focused corrected test: 1 passed.
- Full strict desktop slice with both opt-ins enabled: 4 passed, 0 skipped, 0 failed.
- Focused ESLint: passed.
- Captured hash-pinned upper and lower Settings screenshots.
- Attempted real zoom shortcuts through the available in-app browser; no measurable browser-level zoom change was exposed, so literal zoom remains unproven.
- G7 remains open for literal browser zoom and human screen-reader acceptance.
