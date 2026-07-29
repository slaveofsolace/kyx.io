# Inkfall Rev5 player-eye v10 — human-eye review

## Verdict

The source-frozen hardware run is technically credible and visibly better than
v9, but it is still a revision candidate rather than an accepted arena.

- Runtime movement/reconciliation: **KEEP**
- Rev5 authority separation: **KEEP**
- Corrected portal coordinate binding: **KEEP**
- Portal donor source and provenance: **KEEP**
- Map lighting delta from v9: **KEEP AND CONTINUE**
- Portal player-eye affordance: **REVISE**
- Structural art composition: **REVISE**
- First-person rifle presentation: **REJECT**
- Current HUD presentation: **REJECT**
- Human map/play acceptance: **BLOCKED** pending integration and owner play review

## What changed materially

- The portal donor art now maps to the same scene side as the authoritative
  trigger instead of being mirrored across arena Z.
- The obsolete red rectangular landmark is removed from Rev5.
- Each portal has one translucent active field, two guide rings, six connected
  energy arms, a grounded donor frame/base, and localized runtime light.
- Four redundant donor trusses, half the bridge support cadence, excess rail
  posts, two landing columns, two braces, and two gantry crossbars were removed.
- Exposure, fog, fill, material separation, and local portal lighting are
  brighter than v9.
- The regenerated review GLB is 3,307,028 bytes with SHA-256
  `569dcec0f06395c2e5f8419e48c86545b03c2155f6aa778c72fa1f335bc066d3`,
  24 joined render meshes, and 56,380 Rev5 triangles.

## Evidence labels

- **MEASURED:** source remained at
  `6b4a95db1d48b759c87165158207f0181caa7656`; the run used hardware D3D11
  on an RTX 4090; two isolated clients joined; the host retained its accepted
  identity and `53000` authoritative yaw; forward alignment was
  `0.9989774060650497`; there were zero browser or page errors.
- **OBSERVED:** navigable planes and the ramp are clearer than v9; support
  repetition is reduced; the corrected framed portal is visible in the distance.
  Large dark surfaces, scaffold-like structure, floating-looking roller collars,
  the blocky rifle, and the mismatched HUD remain prominent.
- **INFERRED:** map navigation should be somewhat easier than v9, but combat
  readability, portal discovery, and overall product trust are not yet strong
  enough for acceptance.
- **UNKNOWN:** close portal approach/traversal/exit quality, reconnect through a
  portal transition, opponent silhouettes and animation, weapon contact, ability
  VFX/audio, spawn safety, and fun remain outside this packet.

## Smallest coherent next batch

1. Reveal and structurally anchor the press roller so its orange collars stop
   reading as floating portal rings; improve dark-steel separation without
   flattening the atmosphere.
2. Replace one scaffold-heavy bridge bay with a finished authored assembly.
3. Bind the accepted first-person rifle and the unified restrained HUD.
4. Capture a close portal approach, activation, entry, linked exit, and
   reconnect sequence.
5. Record a short real combat/play loop for owner approval after those surfaces
   are integrated.

Automated checks and this AI visual review do not grant human acceptance.
