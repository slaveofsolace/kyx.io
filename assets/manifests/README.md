# Active release asset manifests

This directory is the closed-world manifest inventory for supported binary
files shipped from `public/`. It is intentionally empty while no character or
other binary asset has both release approval and human visual acceptance.

Rev17, Rev30, and Rev31 records and exact bytes are preserved under
`assets/review/`; they are review-only, excluded from the browser runtime, and
not copied by Vite. Rev30 and Rev31 are rejected visual candidates. A commit
title or structural validator result cannot make them runtime-integrated or
human-approved.

The six unresolved-rights legacy binaries and their historical records are
preserved under `assets/quarantine/legacy-unverified/`. Quarantined files are
outside `public/`, excluded from release packaging, and intentionally ignored by
the active runtime validator.

- `node tools/assets/validate-manifests.mjs` verifies schema-critical fields,
  file hashes/sizes, supported kind/extension pairs, GLB/PNG structure,
  measured counts, IDs, duplicate paths, and a recursive inventory proving
  every supported `.glb`/`.png` beneath `public/` has exactly one manifest.
- `node tools/assets/validate-manifests.mjs --release` additionally requires
  verified provenance, an approved disposition, release eligibility, and the
  initial per-asset primitive/triangle budgets. An arbitrary or unsupported
  file cannot become eligible merely by recording its hash.
- `node tools/assets/verify-release-package.mjs` scans the built `dist/`
  directory, allowlists known text/build outputs, and treats every other file
  as provenance-bearing. Audio, fonts, WASM, video, archives, and unknown
  extensions therefore require exact agreement among the package, active
  manifests, and `assets/provenance/shipped-assets.g9.json`.

Zero active manifests is valid only while the supported binary inventory in
both `public/` and `dist/` is also empty. The moment a supported binary is
added, missing or ineligible records fail closed.

For a future GLB, `structuralInspector: "kyx_binary_inspector_v1"` means the
project parsed the container and remeasured the recorded counts. It is not the
Khronos glTF Validator. Release mode separately requires a passing external
validator and a hashed `externalGltfReport` receipt bound to the runtime asset.
A status string by itself is not evidence.

Runtime assets and validator reports are resolved through the filesystem before
their containment is trusted. Direct symlink files are rejected, and a public
directory symlink cannot hide assets from the release inventory.

The Phase 2 GLB inspector does not measure GPU texture residency. GLB manifests
therefore record `estimatedTextureBytes: null`, emit an explicit development
warning, and remain release-ineligible until a real measurement is supported.
PNG memory is estimated from its validated dimensions. Likewise, a non-null
`waiverId` is not yet trusted: release mode rejects it until the validator gains
an evidence-backed, owned rationale and follow-up record.
