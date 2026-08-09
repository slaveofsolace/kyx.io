# G6 Assault Rev39 directional motion — 2026-08-09

Parent checkpoint: `33ec76f4c37ffb97435c4f2990c7e117fb1b076e`.

## Implemented

- Added deterministic idle/walk/run clip selection from requested planar speed.
- Matched authored gait playback rate to movement speed and exposed projected
  cadence speed/error through presentation diagnostics.
- Preserved negative clip playback for backpedal.
- Removed the additive alternating thigh-Z strafe term that reintroduced a
  cross-step over the authored gait.
- Reduced procedural-fallback lateral step and lower-body yaw amplitudes.
- Added staging-only forward, right-strafe, and backward review overrides without
  changing Worker movement authority.
- Extended the player-eye harness with timed directional sequences and fail-closed
  cadence assertions.

## Consolidated verification

- `git diff --check` — pass
- app TypeScript — pass
- targeted ESLint — pass
- focused Vitest — 4 files / 15 tests — pass
- staging-review Vite build — 229 modules — pass
- staging package closure — `STAGING_REVIEW_PACKAGE_VERIFIED`
- bounded Chrome runtime — pass, pointer lock acquired, zero runtime errors
- right strafe — run clip, 3.2 m/s projected, cadence error below 0.05 m/s
- backpedal — reverse walk clip, 2.4 m/s projected, cadence error zero
- remote candidate/clip/weapon/support contact/stance contract — 7/7 each
- whole-body squash count — 0

Final evidence:
`evidence/2026-08-09/g6-assault-rev39-directional-motion-v4`.

## Human status

Technical pass, visual iterate. The additive cross-step defect is absent and
speed-to-cadence matching is measured. The current upper-body motion remains
stiff and unarmed, while the underlying Rev39 silhouette retains the pinched
waist and weak torso mass. Still-frame samples do not prove true world-space foot
locking.

## Next action

Adapt the already-qualified CC0 Irondust body/animation donor into one stronger
armored Assault candidate with the same 66-bone rig, coherent weapon-ready
locomotion, and distinct LOD1/LOD2. Keep unverified CAD/Fab candidates quarantined
or reference-only until their rights and entitlement are proven.
