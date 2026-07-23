# Frozen V6-B export attempt 4 — float32 contact-fixture round trip

Disposition: `FAIL_BOUNDED_V6B_EXPORT_REIMPORT_AUDIT`

The sealed source contact foundation and all six body, garment, hand/contact-zone,
and non-contact rigid contracts remained intact. The only failed assertion was
`allRuntimeContactFixturesReimportAtEveryPoseWithinSealedTolerance`.

- Governing sealed rig maximum pose error: `1.6895741925311934e-7 m`
- Rev3 maximum exported/reimported contact-fixture bounds drift: `7.2e-7 m`
- Rev4/Rev5 maximum after disabling force sampling and animation-size optimization: `5.9e-7 m`
- Rev4/Rev5 GLB SHA-256: `48de08b3694c3befc913ef7f9c47257cccc3f042158c7b24b9ee811965fe8395`
- Rev5 diagnostic report SHA-256: `5ede55b59d51924239a363d3e5c34d871b4f0f57c40525deead493eb3bfb16a7`

Rev5 measured `palm.R` world-matrix drift between approximately `5.36e-7`
and `1.10e-6` across the six audit frames. The one-bone fixture skin and inverse
bind cancellation reduced the resulting fixture bounds drift, but not below the
sealed contract. No threshold was relaxed. The next revision uses mechanically
derived, per-pose runtime-only corrective morph offsets while leaving the sealed
source objects, body, rig, and accepted action unchanged.

Evidence remains at:

- `../../export-reimport-audit-rev3.json`
- `../../export-reimport-audit-rev4.json`
- `../../export-reimport-audit-rev5.json`
- `../../../../model/v6b-production-contact-candidate-rev1/export/kyx-v6b-production-contact-candidate-rev1.runtime-candidate-rev3.glb`
- `../../../../model/v6b-production-contact-candidate-rev1/export/kyx-v6b-production-contact-candidate-rev1.runtime-candidate-rev4.glb`
- `../../../../model/v6b-production-contact-candidate-rev1/export/kyx-v6b-production-contact-candidate-rev1.runtime-candidate-rev5.glb`

This frozen failure is not a G6 or human-acceptance claim.
