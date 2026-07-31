# KYX VLR-7 Quaternius Rev1

Review-only VLR-7 visual candidate derived from the CC0 Rifle in Quaternius'
Sci-Fi Gun Pack. It is loaded only by the `staging-review` build and is not
included in the production release package.

The build:

- preserves the donor receiver, stock, grip, barrel, and rail silhouette;
- removes the donor long-range scope and keeps KYX.IO's live reflex optic;
- separates `KYX_VLR7_REVIEW_MAGAZINE` so the authority-driven reload
  presentation still moves the magazine;
- aligns to the existing muzzle, dominant-hand, and support-hand contacts;
- changes no weapon authority, damage, cadence, ammo, ADS, or hit semantics.

`build-report.json` records the exact source/output hashes and topology.
`tools/art/build-vlr7-quaternius-candidate.py` is the fail-closed rebuild
script.

Status: structurally validated staging candidate. It is not human accepted,
release eligible, or evidence of final weapon art.
