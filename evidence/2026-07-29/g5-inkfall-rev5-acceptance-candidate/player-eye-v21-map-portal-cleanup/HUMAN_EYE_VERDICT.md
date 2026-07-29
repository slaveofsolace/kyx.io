# Inkfall Rev5 player-eye review — v21

Verdict: **REVISE**. This source-frozen build is suitable for staging
walkthroughs, but it is not human-visually accepted as final map or weapon art.

## Test contract

- Source: `4da23a9fcb6e4d2db19450df0d68644308fb84c0`
- Mode: two isolated browser clients against the local authoritative Worker
- Renderer: RTX 4090 / ANGLE D3D11 hardware WebGL
- Review mode: gray-box interactive route plus cold-eye screenshot inspection
- Route: west spawn, weapon contact/ADS/fire/reload, press hall, ink channel,
  archive tier, lower Red Fold portal, linked upper exit

## Findings

- `MEASURED` — Source was clean at capture start and its HEAD did not change.
  Nine screenshots completed with zero console or page errors.
- `MEASURED` — The route used 339 authoritative colliders, 12 spawns, and 9
  zones. Portal traversal changed the player from the lower approach to the
  linked upper exit.
- `OBSERVED` — The duplicated cyan spawn frame, circular press roller, collars,
  floating index wheel, and duplicate first-person rifle are absent.
- `OBSERVED` — The Cutline HUD keeps the combat center clear and presents
  health, score, ammo, and four ability slots without the former diagnostic
  overlay.
- `OBSERVED` — Bridge loads read more plausibly than the previous cage-like
  revision, but several thin under-bridge members still appear visually
  detached from the player-eye route.
- `OBSERVED` — The portal aperture is legible and traversable, but its header
  light is overexposed and the translucent field lacks enough depth/motion to
  read as a finished energy surface.
- `OBSERVED` — The VLR-7 now renders as one authored two-hand presentation, but
  its silhouette and material breakup remain visibly blocky and prototype-like.
- `INFERRED` — Players can identify the ramp and portal destination, but the
  repeated dark beams and weak region contrast may make rapid orientation under
  combat pressure harder than the deterministic route suggests.
- `UNKNOWN` — Human fun, spawn safety under live combat, portal readability to
  opponents, target-hardware frame pacing, audio quality, and final owner taste
  were not established by this focused run.

## Surface decisions

- Portal authority and traversal: `KEEP`
- Cutline HUD runtime integration: `KEEP` for owner staging review
- Map geometry and lighting: `REVISE`
- Portal visual treatment: `REVISE`
- VLR-7 overlap/contact hotfix: `KEEP`
- VLR-7 final art quality: `REVISE`
- Human map/HUD/weapon acceptance: `OPEN`

## Next coherent review batch

Use the staging walkthrough to collect owner feedback on HUD density, bridge
support readability, region contrast, portal energy treatment, and rifle
silhouette. Do not promote the review-only Rev5 GLB into the release package
until that feedback is resolved and the resulting source-frozen capture is
accepted.
