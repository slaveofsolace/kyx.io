# G5 bounded product map-selection slice

Date: 2026-07-22

Status: **`G5_PRODUCT_MAP_SELECTION_EVIDENCE_READY_G5_OPEN`**. The product now
offers a visible, explicit inspection path for the locked non-default
`inkfall_foundry@2` graybox package. This is a load/inspection slice only. It
does not promote revision 2 to the catalog or shipping default, does not load
the map into Offline Practice, and does not pass G5.

## Product-visible path

The existing Iron Bastion Offline Practice card now has a secondary action:

`INSPECT LOCKED INKFALL FOUNDRY @2`

The action requests the exact query
`?mapPackage=inkfall_foundry%402`. Ordinary launches have no map-package
request. Unsupported or duplicate explicit requests render a bounded error and
do not silently fall through into Offline Practice.

The resulting inspection surface visibly reports:

- explicit selected identity `inkfall_foundry@2`;
- unchanged catalog default `inkfall_foundry@1`;
- separately requested and verified `render_only` and `authority_collision`
  GLBs;
- locked package digest
  `77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520`;
- render SHA-256
  `90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634`,
  613,564 bytes, and 346 mesh nodes;
- collision SHA-256
  `cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e`,
  604,228 bytes, 339 mesh nodes, and fixture hash `bf85e42731fd088e`;
- a top-down plan drawn only from the converted authority fixture;
- clear `not playable`, `not final art`, `G5 open`, and return/default
  boundaries.

The read-only browser evidence surface is
`window.__KYX_LOCKED_GRAYBOX_PREVIEW__`. Its descriptor is non-writable and
non-configurable. The selection constants are split from the package catalog so
the ordinary product entry imports only a 30-byte constants chunk; the package
manifest, loader, and GLBs remain behind the dynamically selected preview.

## Verification

- Strict selection unit tests: **2/2**.
- Adjacent map/package/lock/physics matrix: **20/20** across four files.
- Application TypeScript: **PASS**.
- Focused source/test/evidence-tool lint: **PASS**.
- Production build: **PASS** (the pre-existing `Game` chunk remains above the
  500 kB advisory threshold).
- Direct Chromium capture: two distinct same-origin GLB paths, no console
  errors, page errors, failed requests, HTTP errors, or external requests.
- Independent evidence verification: **31/31**.

The checked browser spec is present at
`tests/browser/locked-graybox-preview.spec.ts`. The immutable capture uses the
same Playwright browser library directly because this host's bundled Node path
is not accepted by the repository Playwright runner's shell-based web-server
launcher. No browser-spec runner PASS is claimed.

The first capture target, `runs/local-v1`, remains empty after its pre-output
assertion treated Vite's module URL-resolution request and its binary request as
four different artifacts. The corrected capture normalizes those four requests
to two distinct GLB paths and writes only to later immutable roots. `local-v2`
records the pre-code-split implementation. `local-v3` is source-frozen but its
entry screenshot caught the existing menu text-reveal transition. The capture
wait was tightened without changing product code; final stable visual evidence
is `local-v4`.

## Immutable evidence

- `evidence/2026-07-22/phase-6-g5-product-map-selection/runs/local-v4/capture.json`
  - SHA-256 `d90afcb074ed04ec8501eafa9452a5ee846d6dad151959a41ed9fb521ffa23b1`
- `evidence/2026-07-22/phase-6-g5-product-map-selection/runs/local-v4/locked-graybox-preview.png`
  - SHA-256 `6cc7e99a7505da1b5d08e9a14a5f2b27eae483f89cba49e3863ef260b87a7ecc`
- `evidence/2026-07-22/phase-6-g5-product-map-selection/runs/local-v4/product-entry-selection.png`
  - SHA-256 `b2820049ce16300ab9f8a347dc11d991844713b92d58d8d2ef803e2ceaf7f772`
- `evidence/2026-07-22/phase-6-g5-product-map-selection/verification-local-v4.json`
  - status
    `INDEPENDENT_G5_PRODUCT_MAP_SELECTION_VERIFICATION_READY_G5_OPEN`
  - 31/31 checks
  - SHA-256 `3349ad5c01c0b86a2fa7d5add2f14055598a4eb95efbec9af0b69c0fd88e8862`

## Explicit nonclaims and remainder

- `DEFAULT_MAP_REVISION` remains `1`.
- Offline Practice still loads the existing Iron Bastion local slice.
- `inkfall_foundry@2` is not playable from the preview.
- No final-art room, human fun/readability acceptance, post-art performance,
  shipping-default, deployment, or full G5 claim is made.
- G5 still needs the representative final-art room, human playtest acceptance,
  post-art no-snag/counterplay/metrics regression, performance capture, and
  explicit gate review.
