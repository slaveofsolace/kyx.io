# G4, G6, and G7 canonical integration

Status: integrated and pushed candidate work; human gate acceptance remains
separate.

This checkpoint combines the completed G4 authority/combat implementation with
the completed G6 Rev17 character candidate and G7 field-instrument UI candidate.
It does not promote either visual candidate to an accepted/default release
asset.

## Canonical commit map

- G4 authoritative grenade runtime: `62ed549`
- G4 retained source-frozen evidence: `283be5d`
- G6 Rev17 authored source/evidence: `d7e5be6`
- G6 opt-in runtime wiring: `62a25a5`
- G6 candidate handoff: `33e0783`
- G7 field-instrument implementation: `2eb1012`
- G7 visual-review evidence: `b8ebc3e`
- Integrated lint/truth cleanup: the commit containing this file

The G6 branch merge commit was intentionally not copied; only its three bounded
candidate commits were integrated. Rev17 remains available solely through the
documented `?g6Candidate=rev17` opt-in and does not replace the default asset.

## Combined verification

- Main suite: 89 files, 739 tests passed.
- Worker suite: 10 files, 42 tests passed.
- Main, Worker, simulation-source, and simulation typechecks passed.
- TypeScript/tool lint and every integrated JavaScript file passed.
- Production build passed.
- Production truth surface: 54 checks passed.
- Phase 2 boundary verifier: 10 checks passed.
- Legacy relay verifier: 28 checks passed.
- Asset validator: 0 errors and 37 disclosed warnings.
- G7 live-browser smoke: 3 tests passed.
- G4 retained eight-client source-frozen verifier remains `PASS`.

## Acceptance boundaries

- G3 and G4 have executable acceptance candidates but still require the
  explicit human acceptance strings required by the governing handoff.
- G5 remains open in its dedicated map task and is not included in this
  checkpoint.
- G6 Rev17 is structurally/runtime validated but remains opt-in and requires
  explicit human visual acceptance. First-person hand/magazine retargeting,
  every-frame contact review, and distance-based LOD transitions remain open.
- G7 is implemented and browser-tested but requires explicit human visual
  acceptance. Its presentation fixtures do not claim gameplay outcomes.
- No Cloudflare deployment or release-candidate claim is made by this
  integration checkpoint.
