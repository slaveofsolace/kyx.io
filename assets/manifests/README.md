# Runtime asset manifests

Each `*.asset.json` file records exact runtime bytes currently present in
`public/`. The active inventory contains only project-authored Rev17 runtime
candidates. It does not make those assets release-ready: human visual acceptance
and a project distribution license remain open.

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

The current active files bind runtime hashes to a canonical project-authored
Blender source. Release validation still fails until the candidate has human
acceptance, a reviewed external glTF receipt in the active manifest format, and
the project owner selects a distribution license. Missing records must never be
guessed.

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
