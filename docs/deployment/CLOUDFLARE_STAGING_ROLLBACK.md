# Cloudflare staging and rollback runbook

This runbook separates compile-only verification from mutating operations.
Nothing in G9 authorizes a deployment or rollback.

Cloudflare documents that environment variables and bindings are
non-inheritable, so `wrangler.jsonc` repeats the staging variables and
`KYX_ROOM` Durable Object binding explicitly:

- production Worker: `kyx-io-authority`;
- staging Worker: `kyx-io-authority-staging`;
- staging origin:
  `https://kyx-io-authority-staging.suhaibabdeljaber.workers.dev`.

References:

- [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Wrangler Worker commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
- [Worker rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
- [Static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)

## Safe compile-only checks

These commands compile and emit local artifacts without uploading or deploying:

```powershell
node node_modules/wrangler/bin/wrangler.js deploy --env="" --dry-run --outdir .wrangler/g9-production-dry-run
node node_modules/wrangler/bin/wrangler.js deploy --env staging --dry-run --outdir .wrangler/g9-staging-dry-run
```

Before any approved staging deployment, require all of the following:

1. G9 control audit passes.
2. Build, typechecks, lint, and Worker tests pass.
3. The candidate UI has current human acceptance.
4. The staging `BUILD_ID` identifies the candidate being evaluated.
5. An authorized operator confirms the intended account and Worker name.

## Mutating staging operation — approval required

The following command is documented only; it was not run:

```powershell
node node_modules/wrangler/bin/wrangler.js deploy --env staging --message "Approved KYX.IO staging candidate"
```

After an approved deploy, record the deployment/version IDs, UTC time, source
commit, operator, health result, browser smoke result, and rollback target in
the release evidence.

## Rollback — approval required and immediately mutating

Cloudflare states that rollback immediately creates a new deployment and makes
the selected version active. Durable Object data and bindings are not reverted;
a rollback can fail or behave incompatibly after binding or migration changes.

Inspect the staging deployment history first:

```powershell
node node_modules/wrangler/bin/wrangler.js deployments list --env staging --json
node node_modules/wrangler/bin/wrangler.js versions list --env staging --json
```

After explicit approval, roll back to the recorded known-good staging version:

```powershell
node node_modules/wrangler/bin/wrangler.js rollback <VERSION_ID> --env staging --message "Approved rollback to known-good staging version"
```

Do not roll back across an incompatible Durable Object migration. If migration
compatibility is uncertain, stop and review the target version's bindings and
schema before changing traffic.
