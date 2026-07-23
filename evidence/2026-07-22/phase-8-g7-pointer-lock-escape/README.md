# G7 pointer-lock / Escape lifecycle

The capability probe first showed that headless Chromium could acquire pointer lock but did not perform native release for synthetic Escape. `InputManager` now provides an explicit, idempotent fallback: it neutralizes held input, requests pointer-lock exit, and allows the existing lock-change lifecycle to open the pause menu and restore focus.

Current runtime observation:

- before launch: unlocked, Start button focused;
- after launch: locked, canvas focused, movement driver running;
- after Escape: unlocked, pause menu visible, Resume button focused.

Run the evidence verifier from the repository root:

```powershell
node evidence/2026-07-22/phase-8-g7-pointer-lock-escape/verify.mjs
```

This is a bounded development-fixture result. G7 remains open for literal browser zoom and human screen-reader acceptance.
