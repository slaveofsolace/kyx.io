# Human Eye audit — Assault Rev39 directional motion v4

## Verdict

TECHNICAL PASS / VISUAL ITERATE.

This packet closes the known additive cross-step regression and proves that the
visible review character selects gait clips at a cadence matched to its requested
speed. It does not visually accept Rev39, prove world-space foot locking, or
approve the current locomotion as final character animation.

## What the live runtime proves

- The source-matched staging runtime loaded `rev39-armored-restore-v1`.
- Right strafe requested 3.2 m/s, selected the authored run clip at
  `0.5818181818x`, and projected 3.2000000000000006 m/s; cadence error was below
  0.05 m/s.
- Backpedal requested 2.4 m/s, selected the authored walk clip in reverse at
  `-1.1162790698x`, and projected 2.4 m/s; cadence error was zero.
- Seven of seven remote avatars retained the candidate model, authored
  locomotion, selected-weapon attachment, support-hand contact, and skeletal
  stance contract.
- No remote avatar used whole-body crouch squash.
- The selected first-person weapon remained overlap-free.
- The bounded run recorded zero console, page, request, or runtime errors.

## Human visual findings

OBSERVED: the earlier alternating thigh-offset cross-step is absent in the
captured strafe sequence. The legs no longer visibly scissor through the center
line as a separate procedural layer fights the authored clip. Backpedal direction
and clip reversal are also coherent across the sampled frames.

OBSERVED: the animation is still visibly provisional. The unarmed turntable
exposes rigid, high arm carriage and mannequin-like upper-body motion. The body
has a pinched waist, weak chest and shoulder mass, and insufficient material
breakup. The pose silhouette changes, but these still frames cannot demonstrate
that each foot remains locked to a stable world-space contact during actual
translation.

INFERRED: at player distance the cadence correction should reduce obvious foot
skate, but weapon-ready upper-body layering and actual moving-world capture are
still required before the motion can look combat-ready.

UNKNOWN: true planted-foot error in centimeters, transition quality under rapid
direction changes, slope contact, and simultaneous aim/fire/reload locomotion.

## Required continuation

Use the qualified CC0 Irondust 66-bone body and animation payload as the donor for
one stronger Assault derivative. Preserve the shared rig and sockets, strengthen
the chest/shoulder/waist proportions, integrate cohesive cyber armor, add true
LOD1/LOD2, and then prove translated strafe/backpedal with planted contacts and a
weapon-ready upper-body layer. Do not propagate a four-role family from Rev39.

## Nonclaims

- No owner or human visual acceptance is claimed.
- Rev39 remains staging-review-only and release-ineligible.
- No true world-space foot lock, final first-person arms, or final combat
  locomotion set is claimed.
- This is not a 2/4/8 performance soak, production package, or deployment proof.
