# Frozen V6-B export attempt 8 — held-NLA one-ULP boundary

Disposition: `FAIL_BOUNDED_V6B_EXPORT_REIMPORT_AUDIT`

Rev10 and Rev11 passed every contract except the exact contact-fixture maximum. Rev10's
reported maximum was `1.7e-7 m`, one float32 quantization step above the fixed
sealed maximum `1.6895741925311934e-7 m`. The affected samples were the same
GripContact fixture in the identical accepted-contact, support-hand, and
locomotion-leg-bend rifle holds. Rev11's smaller uniform correction remained on
the same quantized Y bound while moving another axis by one ULP, proving that a
uniform translation cannot select the missing midpoint. No tolerance rounding
or relaxation was used.

- Rev10 report SHA-256: `1bd3d67321d4950f244c8cf04068a6f5172b841dc7b9f7647abab3d68d634bd4`
- Rev10 GLB SHA-256: `428526a337541b5ec1f320ec9cc54833f76583497b591040ba02df0d5756395b`
- Rev11 report SHA-256: `714b3d216d6ffa4866a5b0d66cddf279307aa316a9b40a0ca9deb1365f307845`
- Rev11 GLB SHA-256: `191af049783ba5a158a0627f0cf99fc42e72f82cc8c84884e42e0daaab1358e8`

Evidence remains at:

- `../../export-reimport-audit-rev10.json`
- `../../export-reimport-audit-rev11.json`
- `../../../../model/v6b-production-contact-candidate-rev1/export/kyx-v6b-production-contact-candidate-rev1.runtime-candidate-rev10.glb`
- `../../../../model/v6b-production-contact-candidate-rev1/export/kyx-v6b-production-contact-candidate-rev1.runtime-candidate-rev11.glb`

The next revision applies a smooth, mechanically derived two-ULP inset to only
the positive-Y half of that runtime fixture in those three pose morphs. This
resolves the asymmetric serialized max bound without moving the already-passing
min bound. The sealed source, candidate blend, body, rig, threshold, six clip
definitions, and diagnostic-only scope remain unchanged. No G6 claim is made.
