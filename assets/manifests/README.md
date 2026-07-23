# Runtime asset manifests

Each `*.asset.json` file records the exact runtime bytes currently present in
`public/`. These manifests describe legacy evidence; they do not make an asset
release-ready.

- `node tools/assets/validate-manifests.mjs` verifies schema-critical fields,
  file hashes/sizes, supported kind/extension pairs, GLB/PNG structure,
  measured counts, IDs, duplicate paths, and a recursive inventory proving
  every supported `.glb`/`.png` beneath `public/` has exactly one manifest.
- `node tools/assets/validate-manifests.mjs --release` additionally requires
  verified provenance, an approved disposition, release eligibility, and the
  initial per-asset primitive/triangle budgets. An arbitrary or unsupported
  file cannot become eligible merely by recording its hash.

The current files intentionally use `runtime_snapshot` hashes and unresolved
provenance. Missing creator, source, acquisition, license, or reviewer records
must never be guessed. Release validation therefore fails until authored
replacement assets or documented rights evidence are reviewed.

`structuralInspector: "kyx_binary_inspector_v1"` means the project parsed the
GLB/PNG container and remeasured the recorded counts. It is not the Khronos
glTF Validator. All current GLBs explicitly record
`externalGltfValidator: "not_run"`; release mode requires that status to become
`passed` and requires an `externalGltfReport` receipt bound to both the report
bytes and runtime asset hash. The report must be a complete, non-truncated
official-shape result whose declared error/warning/info/hint counts exactly
match its message severities. A status string by itself is not evidence.

Runtime assets and validator reports are resolved through the filesystem before
their containment is trusted. Direct symlink files are rejected, and a public
directory symlink cannot hide assets from the release inventory.

The Phase 2 GLB inspector does not measure GPU texture residency. GLB manifests
therefore record `estimatedTextureBytes: null`, emit an explicit development
warning, and remain release-ineligible until a real measurement is supported.
PNG memory is estimated from its validated dimensions. Likewise, a non-null
`waiverId` is not yet trusted: release mode rejects it until the validator gains
an evidence-backed, owned rationale and follow-up record.
