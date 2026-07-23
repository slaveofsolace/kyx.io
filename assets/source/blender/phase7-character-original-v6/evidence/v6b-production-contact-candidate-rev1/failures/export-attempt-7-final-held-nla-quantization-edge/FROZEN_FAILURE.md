# Frozen V6-B export attempt 7 — final held-NLA quantization edge

Disposition: `FAIL_BOUNDED_V6B_EXPORT_REIMPORT_AUDIT`

Rev9 passed every source-seal, topology, rig, material, animation-structure,
body, garment, hand/contact-zone, and non-contact rigid contract. It reduced the
maximum fresh-GLB-reimport contact-fixture bounds drift from Rev8's `4.6e-7 m`
to `1.8e-7 m`, but the governing maximum remained the unchanged
`1.6895741925311934e-7 m`. The miss was therefore
`1.104258074688066e-8 m`; the threshold was not rounded or relaxed.

- Rev9 report SHA-256: `2b054d71793c2fceb04f9be5dd3d9eacd0db4824b1c91905b63ad42b6d41da65`
- Rev9 GLB SHA-256: `847b548e79426c8e225d612e5fee084b6df1f7484d19a1e26678fc0fbf1cafb7`

Evidence remains at:

- `../../export-reimport-audit-rev9.json`
- `../../../../model/v6b-production-contact-candidate-rev1/export/kyx-v6b-production-contact-candidate-rev1.runtime-candidate-rev9.glb`

The next revision applies the same negative midpoint-of-min/max-drift rule to
the frozen Rev9 residual on runtime fixture morphs only. The sealed source,
candidate blend, accepted body, 52-bone rig, fixed tolerance, and six diagnostic
clip definitions remain unchanged. No G6 claim is made.
