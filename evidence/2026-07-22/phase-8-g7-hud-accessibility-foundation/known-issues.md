# G7 known issues and open evidence

| Severity | State | Issue / boundary | Reproduction or required closure | Owner / waiver |
|---|---|---|---|---|
| Gate blocker | Open | Full viewport, zoom, and min/default/max HUD-scale matrix is absent. | Execute every size/zoom/scale row in `tests/accessibility/PHASE8_AUDIT_MATRIX.md`; record overflow and readability. | G7 review; no waiver |
| Gate blocker | Open | Color independence is not proved across the wider active/ready inventory. | Run grayscale and selected color-vision identification tasks, including ability states. | G7 review; no waiver |
| Gate blocker | Open | No five-second new-player readability test or human visual approval exists. | Run the defined task with completion time, errors, and unsolicited confusion. | Human reviewer; no waiver |
| Gate blocker | Open | Caption and sound-cue captures are deterministic fixtures, not paired task evidence. | Record caption timing plus the same critical task with audio on and muted. | G7 review; no waiver |
| Gate blocker | Open | Offline Practice has no spoken dialogue, keyed interactable, or network session. Corresponding hooks cannot receive organic proof here. | Use explicit deterministic fixtures without overstating them, or capture on a future real content/session source. | Content/network owners; no waiver |
| Gate blocker | Open | Screen-reader ordering, forced-colors behavior, long strings, combined modes, and named-machine performance are unmeasured. | Complete the remaining runtime/manual rows and attach artifacts. | G7 review; no waiver |
| Major | Open | Headless Chrome did not release a real pointer lock from synthetic Playwright Escape in the earlier foundation session. Programmatic lock loss did restore focus correctly. | Capture a human Escape/focus-loss recording and real denial flow. | Input QA; no waiver |
| Advisory | Open | Production build emits an existing warning for chunks over 500 kB. | Profile named-machine startup/runtime before deciding whether code splitting is required. | Performance owner |
| Evidence boundary | Open | Shared worktree was dirty and concurrently edited; commit hash is provenance, not a clean evidence commit. | Re-run/seal on the final integration commit and generate the manifest last. | Release owner; no waiver |
