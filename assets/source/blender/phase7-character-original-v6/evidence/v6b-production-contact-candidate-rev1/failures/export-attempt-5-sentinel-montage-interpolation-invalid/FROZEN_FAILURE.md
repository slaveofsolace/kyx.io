# Frozen V6-B export attempt 5 — sentinel montage interpolation invalid

Disposition: `FAIL_BOUNDED_V6B_EXPORT_REIMPORT_AUDIT`

Revisions 6 and 7 proved that the six unrelated deformation audit poses cannot
be represented honestly as one continuously interpolated gameplay animation.
They are deformation sentinels only.

Rev6 exported a real glTF animation carrying the complete rig and runtime
corrective data (`52` translation, `52` rotation, `52` scale, and `8` morph
weight channels). Its between-pose evaluation failed the fixed body, garment,
hand-zone, and contact contracts. The bind-to-accepted midpoint alone reached
`7.30256 mm` body p95 and `260.39106 mm` body maximum deviation; the garment
p95 reached `26.9983 mm` and included a catastrophically invalid outlier.

Rev7 added mechanically generated midpoint corrective keys and audited quarter
probes. The quarter and midpoint probes still failed badly: body p95 reached
`146.15899 mm`, garment p95 reached `157.58078 mm`, and body maximum deviation
remained `260.04359 mm`. Densifying this artificial montage would conceal the
semantic error rather than produce a real locomotion or combat clip.

- Rev6 report SHA-256: `0ba538a810b9252b88548d11458a4ffd8631f1a0dde158bb9a87080ddb1cf814`
- Rev6 GLB SHA-256: `0f798d98d46d3326216351ac43311c6ff8ba287b2cf1a8b0b55b5e00e5002d57`
- Rev7 report SHA-256: `f4e1bb61a5c6431b4f800b5e87b7853f85c1082228429784ee2237b5422905f8`
- Rev7 GLB SHA-256: `24ecc9d691012414c12e606d5a0e3a4c1e3e05f3279a3a1c11c01778328820df`

Evidence remains at:

- `../../export-reimport-audit-rev6.json`
- `../../export-reimport-audit-rev7.json`
- `../../../../model/v6b-production-contact-candidate-rev1/export/kyx-v6b-production-contact-candidate-rev1.runtime-candidate-rev6.glb`
- `../../../../model/v6b-production-contact-candidate-rev1/export/kyx-v6b-production-contact-candidate-rev1.runtime-candidate-rev7.glb`

Resolution: export six independent, named `STEP`/held diagnostic clips. This is
not a claim that idle, walk, run, fire, reload, or any other gameplay animation
exists. No threshold or sealed source was changed, and no G6 claim is made.
