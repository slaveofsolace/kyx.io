# ev.io reference provenance and clean-room boundary

Disposition: `REFERENCE ONLY`

Checked: 2026-08-09

Publisher/source: Enthusiast Gaming Inc., official public ev.io pages

## Controlling sources

- Official changelog: https://ev.io/changelog
- Official EULA: https://ev.io/terms-of-use
- Official game page (not automated): https://ev.io/

## Rights and access boundary

The EULA permits ordinary participation but restricts distribution of the client and game elements, and explicitly forbids automated-script interaction with the game. Therefore:

- The public ev.io client was not automated, scraped, downloaded, copied, or imported.
- No ev.io code, audio, VFX, images, geometry, data, naming, or distinctive implementation entered this workspace.
- Only abstract rules stated in the official changelog inform a clean-room KYX implementation.

## OBSERVED from the official changelog text

- The impulse grenade was described as launching the user when thrown at the ground and sending an enemy flying when thrown at them.
- Historical grenade notes tie fuse behavior to meaningful surface contact and distinguish landed behavior from mid-air detonation.
- Smoke was described as sticking to surfaces, and a later fix restored its intended concealment of health bars.
- The changelog records a distinct rejection sound for an unavailable grenade and removal of a duplicate teleport cue to avoid ambiguity.
- Sticky grenades were described as shootable, and the original ability contract separated one utility choice from two damage choices.

These are publisher-authored historical statements, not a current interactive measurement of ev.io.

## INFERRED clean-room principles

- Launch impulse should be directional and predictable for both the user and recipient, with contact acting as the readable authority boundary.
- A grenade should communicate a short ballistic commitment, one meaningful contact/settle sequence, then consequence; repeated toy-like bouncing weakens prediction and weight.
- Smoke growth should be continuous in perceived radius, reach full tactical coverage quickly enough to matter, and preserve visibility semantics consistently for all clients.
- Initiation, rejection, contact, detonation, and tail should be distinct event roles; overlapping or looping cues can lie about state.
- Ability presentation may anticipate intent, but irreversible consequence and cooldown/charge commitment must follow authority.

## UNKNOWN and nonclaims

- The current live ev.io tuning, exact ranges, forces, radii, cooldowns, waveforms, effect geometry, and network implementation were not measured.
- Historical changelog statements do not grant reuse rights or prove present-day behavior.
- This document does not claim parity acceptance; it only records reference distance and provenance.
