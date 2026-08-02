# VLR-7 player-eye checkpoint and Fab donor audit

Date: 2026-08-02

Status: development-only weapon/contact candidate implemented and verified;
human visual acceptance and release asset approval remain open.

## Outcome

- Enabled the existing Quaternius CC0 VLR-7 review shell in local Vite
  development as well as the isolated staging-review build. Ordinary production
  builds still exclude its source path and GLB.
- Reworked the procedural first-person contact rig to
  `profiled_two_hand_assault_suit_v9`: two explicit grip contacts, profiled
  forearms, smaller rounded palms and fingers, fitted dorsal plates, wrist
  seals, and concealed off-camera upper-arm spans.
- Reduced the local first-person muzzle flash size, opacity, light intensity,
  and duration while preserving the world-readable remote flash.
- Fixed a pre-existing Practice input defect that discarded press-and-release
  taps occurring within one 20 Hz authority tick. A tap is now published as a
  deterministic pressed/held pulse followed by its release.
- Added a bounded Playwright capture harness for hip, ADS, fire, and reload
  player-eye states.

## Human-eye verdict

- VLR-7 shell: `KEEP / REVISE`. The authored CC0 rifle is a material silhouette
  improvement over the procedural placeholder and no duplicate gun is visible.
  It is not yet owner-approved or release-eligible.
- First-person arms: `REVISE`. Contact, ADS, fire, and reload are functional,
  but the runtime arm remains procedural and does not yet meet final authored
  character quality.
- Third-person ballooned suit: `REJECT`. The pictured neck, shoulder, elbow,
  knee, and calf volumes must not be propagated into role variants. Recovery
  should use a lean shared bodysuit, fitted armor plates, visible joint gaps,
  and clear hard/soft material transitions.

## Fab acquisition boundary

The donor audit is isolated at
`D:\AI Projects\Projects\Games\evio\kyx-fab-acquisition-review-20260802`.
Six of the owner's 38 listing IDs have local Fab acquisition/download rows;
32 have no local entitlement or payload evidence. No Fab payload was copied
into this repository, selected by Three.js, committed, packaged, or deployed.

Representative inspection found:

- one 7,552-triangle axe as the strongest conversion candidate;
- one 1,001,416-triangle mining mesh requiring aggressive re-authoring;
- one 16,027-triangle bulky character rejected as the KYX player foundation;
- two byte-identical 32-triangle plane payloads rejected as invalid characters;
- one Unreal-only sample pack requiring isolated export and license review.

## Consolidated verification

| Gate | Result |
| --- | --- |
| App, Worker, and sim-source/sim TypeScript | PASS |
| Full configured ESLint surface | PASS |
| Targeted weapon/input Vitest | PASS, 2 files / 8 tests |
| Full app Vitest | PASS, 128 files / 919 tests |
| Production Vite build | PASS, 216 modules; existing chunk-size warning only |
| Production review-asset exclusion | PASS; no Quaternius path, model, or audio binary emitted in `dist` |
| Release asset validation | PASS, 0 release manifests / 0 errors / 0 warnings |
| Release provenance sentinel | PASS |
| Closed-world package verifier | PASS, 0 provenance-bearing binary artifacts |
| Desktop Practice capture | PASS, hip/ADS/fire/reload states and zero console errors |

## Evidence and nonclaims

Local player-eye evidence is preserved outside the repository at
`D:\AI Projects\Projects\Games\evio\kyx-player-eye-evidence-20260802\2026-08-02\vlr7-quaternius-first-person-v9`.
Rejected Blender extraction experiments are preserved at
`D:\AI Projects\Projects\Games\evio\kyx-rejected-art-recovery-20260802`.

- No human acceptance claim for the rifle, arms, third-person character, Fab
  donors, map, HUD, or audio.
- No Fab license receipt/tier clearance claim.
- No production packaging, Cloudflare deployment, or release approval.
