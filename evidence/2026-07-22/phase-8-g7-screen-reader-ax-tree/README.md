# G7 Chromium accessibility-tree slice

This bounded slice records the rendered Chromium accessibility tree for the practice menu, the pointer-lock-denied paused HUD, and production caption/audio-cue live regions.

Run:

```powershell
node evidence/2026-07-22/phase-8-g7-screen-reader-ax-tree/verify.mjs
```

Expected classification: `BOUNDED_BROWSER_AX_TREE_PASS` with three cases and two hash-pinned screenshots.

This does not close G7. It is not human NVDA, JAWS, or VoiceOver acceptance, and the cue text was stimulated through a temporary in-page instance of the production `CaptionCueOverlay` class. No application source was mutated for the stimulus. Literal browser zoom and human readability review also remain open.
