# Attempt 1 — camera orientation/framing failure

Status: **preserved failure; not current review evidence**

The initial baseline render script aimed cameras at world origin even though the selected vendor asset retained its original layout offset on X. As a result, only the side plate contained the anatomy; front, back, and three-quarter showed empty background/floor.

The four PNGs and original `baseline-render-report.json` in this directory are the exact failed outputs. Their hashes remain in that report. They were preserved before the current render files were regenerated.

Attempt 2 derives the target from the body world-space bounds and asserts, for every view:

- the projected body bounds are in front of the camera;
- bounds remain inside horizontal and vertical frame margins;
- projected width and height are meaningful;
- projected center is within tolerance;
- the saved PNG has sufficient bright-body occupancy in the central review region.

The current `../../baseline-render-report.json` records all assertions and is still labeled CC0 anatomy sculpt-seed prework, not final KYX and not G6.
