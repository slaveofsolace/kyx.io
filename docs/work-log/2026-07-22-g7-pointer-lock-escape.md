# 2026-07-22 — G7 pointer-lock / Escape lifecycle

- Ran the opt-in pointer-lock probe and reproduced a headless/embedded-runtime gap: pointer lock acquired, but synthetic Escape did not release it or open pause.
- Added an explicit Escape fallback that neutralizes held input and requests pointer-lock exit without preventing native browser behavior.
- Added a focused unit regression for held-input release and explicit pointer-lock exit.
- Strengthened the browser probe with assertions for unlock, pause visibility, and Resume focus, plus a screenshot attachment.
- Focused unit suite: 3 passed.
- Combined strict browser suite with both opt-ins: 4 passed, 0 skipped, 0 failed.
- Focused lint: passed.
- G7 remains open for literal browser zoom and human screen-reader acceptance.
