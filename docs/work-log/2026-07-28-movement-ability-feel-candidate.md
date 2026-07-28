# Movement and ability feel candidate — 2026-07-28

## Scope

This isolated candidate improves the existing KYX.IO movement/ability path
without changing the accepted `phase3_hypothesis_v1` movement profile, trusting
client physics, adding an ability, or touching Blender/model assets.

The batch keeps walking, strafe, backpedal, sprint, jump, crouch, slide,
teleport, and Impulse Grenade outcomes server-owned. It changes how input and
authoritative movement facts reach presentation:

- Render-frame mouse deltas accumulate until the next 20 Hz command and are
  consumed exactly once after a successful send. Held keyboard/controller look
  remains an explicit continuous per-tick input. Rapid pointer events no longer
  overwrite each other or persist through a timer into multiple commands.
- Additive protocol-v2 player movement facts carry canonical grounded, stance,
  and locomotion state on snapshot entities.
- Remote interpolation consumes those facts. Elevated Inkfall floors no longer
  make a grounded remote look airborne, and crouch/slide are no longer erased.
- Snapshot delta identity includes the movement facts, so a stance/locomotion
  transition is delivered even when position and velocity do not change.
- Presentation derives signed local forward/right velocity, eight-way travel
  sector, strafe lean, and backpedal gait direction from measured
  authority/interpolated velocity plus yaw. Packet timing and client input do
  not choose animation direction.
- The online HumanSoldier receives the measured strafe signal instead of a
  constant zero. The signal is also exposed in the online preview diagnostics
  for later gait/animation evidence.

Legacy protocol-v2 player snapshots that omit the additive `movement` object
retain the prior conservative fallback for compatibility. Current server rooms
always emit the authoritative object.

## Preserved authority boundaries

- Movement position, velocity, collision, grounded state, stance, slide state,
  teleport destination, and Impulse Grenade displacement remain room facts.
- Browser input remains bounded axes, look deltas, button edges, and slot
  selection. No transform, physics outcome, or animation claim is accepted.
- The movement profile ID, revision, hash, speeds, acceleration, jump impulse,
  slide timing, teleport range/cooldown, and ability resources are unchanged.
- Directional/gait data is presentation-only and never enters canonical state
  or collision.

## Deferred claims and product choices

- This candidate does not claim final movement balance, ev.io parity, human
  feel approval, final animation quality, or a release gate.
- The authored model still needs visual review of its actual forward,
  backpedal, strafe, jump, slide, teleport, and impulse reactions. This batch
  supplies truthful state/direction signals; it does not author new clips.
- Backpedal gait direction is exposed but not yet used to reverse or select an
  authored clip. That needs a visual decision against the accepted model.
- No new sprint direction policy, variable jump height, ledge assist, slide
  cancel, stamina system, or ability was invented.
- Consolidated offline/online regression and performance work remains deferred
  until the other major model/map/HUD/security batches are assembled.
