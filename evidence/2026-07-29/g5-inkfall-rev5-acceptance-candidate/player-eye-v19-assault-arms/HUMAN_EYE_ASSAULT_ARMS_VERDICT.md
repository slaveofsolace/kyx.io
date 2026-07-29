# V19 Assault first-person arms — human-eye review

Build: `272d9dff7f18cef155c72a53a45226707896084f`

Mode: paired gray-box review against v18 at 1440×900, Chromium hardware WebGL on an RTX 4090.

## Player-experience verdict

The v19 contact rig is a materially better connected and readable foundation, but its visible primitive shells and rigid reload motion are still below final first-person character quality.

## Decisions

- Contact coordinates and two-hand VLR-7 binding: **KEEP**
- Dark tapered undersuit, overlapping elbow bridge, and wrist continuity: **KEEP**
- Current dorsal gauntlet and visible procedural arm shell: **REVISE**
- Current shared rigid weapon/arm reload motion: **REVISE**
- Final human visual acceptance: **OPEN**

## Evidence labels

### OBSERVED

- V18's conspicuous elbow and wrist separation is absent in the paired v19 hip, ADS, and reload frames.
- The sleeve, gauntlet, wrist seal, and glove now read as one continuous chain.
- The broad rectangular dorsal armor remains too planar and bright under the cyan scene lighting.
- The complete arm chain still follows the weapon as a rigid assembly during reload; there is no independent support-hand release or elbow articulation.
- No inspected frame shows an arm crossing the reflex sight or penetrating the rifle receiver.

### MEASURED

- Source identity remained clean and unchanged at `272d9df`.
- Hardware renderer: RTX 4090 through D3D11.
- Contact mode: `authored_two_hand_assault_suit_v2`.
- First-person hand count: `2`.
- Held ADS FOV: `72° → 60.54°`.
- Accepted attack presentations: `2`.
- Authority reload presentations: `1`; captured at `45.17%` progress with `0.9885` pose mix.
- Linked portal traversals: `1`.
- Console errors: `0`; page errors: `0`.

### INFERRED

- Replacing only the visible shells with one authored low-poly arm/glove mesh can preserve the now-proven contact and authority behavior while removing the remaining assembled-primitive appearance.
- An independent support-hand release/return curve is the smallest motion change likely to make reload contact believable.

### UNKNOWN

- Human owner preference and acceptance.
- Rapid-recoil and complete reload-envelope clipping outside the captured stills.
- Motion quality under a real mouse-driven combat exchange.
- Final glove deformation, LOD, compression, and third-person/first-person material match.

## Important evidence limitation

The v19 fire frame was captured after the short-lived muzzle/tracer objects expired (`activeWeaponEffectCountAtFireCapture = 0`), although authority accepted two attack presentations and the recoil impulse was still active. The source-matched v18 packet remains the visual muzzle/tracer proof; v19 is the arm-geometry comparison packet.

## Smallest coherent next batch

1. Retain the exact v19 dominant and support grip markers.
2. Replace the visible primitive sleeve/gauntlet/glove shells with one authored Assault first-person arm mesh on the same contact skeleton.
3. Add one authority-timed support-hand release and return animation for reload.
4. Capture hip, held ADS, active muzzle/tracer, reload motion, recoil recovery, and a short clipping sweep once.

Automated integrity and this agent review do not grant human visual acceptance.
