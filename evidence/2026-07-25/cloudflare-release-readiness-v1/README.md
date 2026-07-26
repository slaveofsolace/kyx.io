# Cloudflare release-readiness checkpoint

Date: 2026-07-25 (America/Chicago)

Commit under test: `a3a679aafdcd9748b711ccfa3e7491fc27981db6`

Dirty state under test: `public/_headers` added by this checkpoint.

## Outcome

The production Vite bundle and the existing Cloudflare Worker/Durable Object
package now carry an explicit Workers Static Assets security-header policy.
Wrangler parses the policy as two valid rules, serves the application under the
policy, keeps hashed assets immutable, and still routes `/health` through the
Worker.

This is a release-readiness checkpoint, not a G9 pass. A live staging URL,
production-origin allowlist update, browser/room smoke test, rollback exercise,
and explicit final gate review remain required.

## Configuration

- Worker entry: `worker/worker.ts`
- Static asset directory: `dist`
- SPA fallback: `single-page-application`
- Worker-first paths: `/health`, `/api/*`
- Durable Object binding: `KYX_ROOM` / `KyxRoom`
- Static header source: `public/_headers`

The static policy provides CSP, clickjacking, MIME-sniffing, referrer,
permissions, opener, and resource isolation controls. `style-src
'unsafe-inline'` remains narrowly enabled because the current online route
intentionally creates runtime style elements. Script execution remains
self-only.

## Verification

| Check | Result |
|---|---|
| `vite build` | PASS, 155 modules |
| `_headers` copied to `dist` | PASS |
| `wrangler deploy --dry-run --outdir .wrangler/dry-run --env=` | PASS |
| Wrangler static header parsing | PASS, 2 valid rules |
| `GET /health` through local Wrangler | PASS, HTTP 200 and `roomBinding: true` |
| `GET /` through local Wrangler | PASS, HTTP 200 with full static policy |
| Hashed main JS cache policy | PASS, one-year immutable |
| Browser boot under the policy | PASS, title/canvas/offline shell rendered |
| Browser console | No CSP errors; one non-fatal WebGL precision warning |

Exact response observations are in
[`local-smoke.json`](./local-smoke.json), and reproduction commands are in
[`commands.txt`](./commands.txt).

## Deployment state

`wrangler whoami --json` returned `{"loggedIn":false}`. The official Cloudflare
sign-in page is open for the user. A full anonymous temporary deployment is not
an equivalent fallback because two required Inkfall Foundry GLBs are each about
13.3 MB, above the temporary-deployment per-asset limit.

After authentication:

1. Deploy the current exact commit and capture the assigned HTTPS origin.
2. Add that origin to `ALLOWED_ORIGINS`.
3. Build with `VITE_KYX_AUTHORITY_ORIGIN` set to the same HTTPS origin.
4. Re-run the dry run and deploy the resulting exact source state.
5. Smoke-test `/`, `/health`, a hashed asset, SPA `/online`, room creation,
   socket connection, reconnect, and rollback.

*Currently being worked on.*
