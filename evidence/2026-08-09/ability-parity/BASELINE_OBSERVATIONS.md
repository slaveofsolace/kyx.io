# Source-blind baseline observations

Build: `520d94c5c9bd54b5b138ca25a116a1781f3e3356`

Runtime: `http://127.0.0.1:6419/`, local loopback, Windows desktop browser

Observation order: captured before ability implementation or tests were opened.

## OBSERVED

- The Quick Play surface describes Relay Practice as using the same map, movement, loadout, HUD, combat presentation, and shared authority as online.
- Practice presents Blink in fixed slot `Q`, with custom slots `E = Launch`, `F = Smoke`, and `Z = Frag`.
- Launch, Smoke, and Frag each present `2/2` ready charges in the frozen baseline.
- The entry dialog identifies an exact 20 Hz authority simulation and hold-to-use ability inputs.
- The local page loaded successfully and reached the Practice entry dialog.
- Browser runtime warnings were limited to a deprecated initialization signature and Three.js shadow-map deprecation during this pass.

## MEASURED

- Candidate HEAD at capture: `520d94c5c9bd54b5b138ca25a116a1781f3e3356`.
- Local HTTP response: `200`.
- Canonical dirty entries preserved: `109`; candidate source remained at the clean baseline before evidence files.

## TOOL_LIMITED / UNKNOWN

- The in-app browser could not acquire pointer lock after one semantic click and one coordinate retry. Per the playtest stop rule, no further brute-force input was attempted.
- Baseline projectile trajectory, gravity, contact count, detonation timing, self/target impulse, smoke expansion cadence/radius, Blink obstruction truth, and audio output remain unobserved in this agent-controlled baseline.
- No Human visual, gameplay, or audio acceptance is recorded.

## Evidence

- `baseline-runtime/menu-loaded.png`
- `baseline-runtime/practice-entry.png`
- `baseline-runtime/pointer-lock-tool-limit.png`
- `BASELINE_TEST_CONTRACT.md`
