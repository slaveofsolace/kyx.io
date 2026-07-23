# Baseline known issues

| Severity | Issue | Evidence / next gate |
|---|---|---|
| P0 | Browser-local password registration/login and local session authority remain in product code. | Phase 1: replace with password-free Local Guest Profile. |
| P0 | No authoritative multiplayer. `VITE_WS_URL` is absent, the relay is non-authoritative, and local bots are presented with human-like names/player counts. | Console/network profiles and screenshots; G3/G4 require fixed-tick two-browser authority. |
| P0 | Placeholder AdSense publisher ID executes external requests and throws repeated slot-size errors. | Local/live console and network profiles; Phase 1 must disable it. |
| P0 | Movement/collision remains a client-local circle/AABB controller. | Replace behind deterministic kinematic capsule/query seam; G2. |
| P0 | Current GLBs/procedural geometry are fragmented legacy proxies with unknown provenance. | `asset-reports/current-assets.json`; G5/G6/G9. |
| P1 | No typecheck, lint, unit, contract, integration, or browser test scripts exist at baseline. | Phase 2 toolchain/contracts; G0 remains open. |
| P1 | Minified main bundle is 979.75 kB and Vite emits a chunk-size warning. | Build output; split/lazy-load after seams exist. |
| P1 | Measured menu/gameplay draw calls are 675/516, above the candidate `<500` normal-combat target. | Interactive runtime probe; performance work remains G8. |
| P1 | Exact-resolution headless/SwiftShader recording heavily throttles RAF; its frame percentiles are capture-contaminated. | Use interactive named-hardware profiles for performance gates; video is visual evidence only. |
| P1 | Aether donor snapshot has no Git metadata, so a required source commit cannot be recorded. | ADR-001 uses SHA-256 anchors; restore provenance before copying code. |
| P2 | Handoff reference inconsistencies: `spartan.glb` materials are five, not `null`; machine adoption matrix is compressed, not a literal copy. | Direct asset audit and pack reconciliation notes. |
| P2 | No shipped audio assets exist. | Asset audit; audio pipeline is a later vertical-slice requirement. |
