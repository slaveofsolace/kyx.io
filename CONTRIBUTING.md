# Contributing

KYX.IO is an active game-development repository. Keep changes focused on the
current desktop vertical slice and preserve the separation between compile
success, automated validation, runtime evidence, and manual visual/playtest
review.

## Development setup

```powershell
git lfs install
npm ci
npm run dev
```

Use `npm run dev:authority` in a second terminal when working on online rooms.
Configuration belongs in ignored `.env.local` or `.env.staging` files; commit
only documented placeholders such as `.env.example`.

## Change discipline

- Build coherent feature batches before running the consolidated gate.
- Keep the Worker authoritative for movement, combat, score, resource, and
  reconnect outcomes.
- Keep Practice and online behavior on shared schemas and presentation models.
- Do not add candidate binaries to `public/`.
- Do not commit machine-specific paths, credentials, account identifiers, or
  private deployment URLs.
- Do not import third-party code or assets without a documented license and
  provenance record.
- Preserve historical evidence and rejected candidates in their designated
  non-shipped locations.

## Validation

Before proposing an integration, run:

```powershell
npm run typecheck
npm run typecheck:worker
npm run typecheck:sim
npm run lint
npm run test
npm run test:worker
npm run build
npm run validate:assets:release
npm run verify:release-provenance
npm run verify:release-package
npm run audit:g9
```

Use browser captures and multiplayer/soak evidence only for a source-frozen
candidate. Include exact commands, results, evidence paths, known limitations,
and any remaining product decision in the change description.

## Art and content

The release package is fail-closed. Every packaged binary needs exact manifest
and shipped-ledger coverage, provenance, approval, integrity, and validation.
Unaccepted art belongs under `assets/review/` or another explicitly non-shipped
source location. Unresolved-rights content belongs under `assets/quarantine/`
and must never be served, copied into a build, or used as a donor.

The repository is currently `UNLICENSED`. A contribution does not establish
permission to redistribute the project or any bundled asset.
