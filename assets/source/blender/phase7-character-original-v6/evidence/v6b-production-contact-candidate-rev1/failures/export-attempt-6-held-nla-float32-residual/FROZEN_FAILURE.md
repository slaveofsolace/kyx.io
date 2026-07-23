# Frozen V6-B export attempt 6 — held-NLA float32 contact residual

Disposition: `FAIL_BOUNDED_V6B_EXPORT_REIMPORT_AUDIT`

Rev8 corrected the semantic structure of the exported evidence. The GLB
contains exactly six named, independent two-frame `STEP`/held diagnostic clips.
Each clip contains `164` channels: `52` translation, `52` rotation, `52` scale,
and `8` runtime corrective morph-weight channels. Fresh Blender GLB reimport
passed the body, garment, hand/contact-zone, non-contact rigid, source-seal,
rig, topology, material, and animation-structure contracts.

The sole remaining failure was deterministic float32/NLA serialization drift
on the six isolated contact fixtures. Maximum bounds drift was `4.6e-7 m`
against the unchanged sealed maximum `1.6895741925311934e-7 m`.

- Rev8 report SHA-256: `fb1c06c18748d135a026c4a8ac4e33392fec21d5e91083fd31ed24d3bfc1580d`
- Rev8 GLB SHA-256: `e6490e8afda77a47516dfe5a5f6e2205af3866812f573f1d7d22f1464f0936cb`

Evidence remains at:

- `../../export-reimport-audit-rev8.json`
- `../../../../model/v6b-production-contact-candidate-rev1/export/kyx-v6b-production-contact-candidate-rev1.runtime-candidate-rev8.glb`

The next revision applies a mechanically derived, per-pose runtime-fixture-only
residual pre-compensation. It does not alter the sealed source, candidate blend,
accepted body, rig, fixed tolerance, or the diagnostic-only status of the six
clips. No G6 claim is made.
