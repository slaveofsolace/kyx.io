# VLR-7 weapon-behavior verdict — v17

Source: `ec22d2651d4290e6f7325d97f736f84cbab41a9d`

## Keep

- ADS compensation reduced the aimed viewmodel from scale `0.72` to `0.6104` while narrowing FOV from `72` to `60.58`; the center view is materially less obstructed than v16.
- The modern authoritative attack projection produced two accepted presentation events and visible recoil state.
- The reload frame was captured near peak motion at progress `0.4511` / pose mix `0.9882`.
- Two players, the complete map route, and one linked portal traversal completed on the hardware renderer with zero console or page errors.

## Revise once, then leave pose calibration

- The optic/sight line is now too low and slightly left of the crosshair. Raise and nudge the authored ADS offset right.
- Replace the opaque block optic with an open reflex frame, transparent lens, and authored reticle point.
- The fire frame proves recoil but misses the short-lived muzzle flash/tracer. Lengthen their readable lifetime modestly and capture the visible nozzle event.
- First-person capsule arms remain provisional until final shared character arms replace them.

The v17 scale/depth direction is accepted. Only sight alignment, optic construction, and muzzle-effect readability remain in this focused calibration.
