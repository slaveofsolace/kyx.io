# Runtime asset manifests

Each `*.asset.json` file records exact runtime bytes currently present in
`public/`. The default third-person runtime is the accepted Rev30 adaptation of
Irondust's CC0 **Sci-fi Soldier**. Its one low-poly LOD0 file is shared by the
player and enemy loader slots; no duplicate Rev30 LOD1/LOD2 binary is stored or
claimed. The project-authored Rev17 character files remain available as the
explicit `?g6Candidate=rev17` fallback and as historical evidence. Rev17 also
remains the active first-person asset because Rev30 did not author a dedicated
first-person derivative.

Runtime selection does not make the inventory release-ready. The embedded pale
Rev30 rifle is a diagnostic contact witness pending replacement by the runtime
weapon-attachment lane, external glTF validation is still open, and the project
distribution license remains undecided.

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

The current active files bind runtime hashes to either a canonical
project-authored Blender source or the canonical Rev30 CC0 adaptation source.
Release validation still fails until every active asset has a reviewed external
glTF receipt in the active manifest format, runtime presentation blockers are
closed, and the project owner selects a distribution license. Missing records
must never be guessed.

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
