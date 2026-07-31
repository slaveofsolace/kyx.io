# Cloudflare staging preview

This directory defines the neutral-name Cloudflare Pages frontend used for
staging review. Static game assets are served by Pages. Requests under
`/api/*` and `/health` are forwarded through the `KYX_AUTHORITY` service
binding to the isolated `kyx-io-authority-staging` Worker.

The browser therefore uses one origin and does not receive the authority
Worker hostname in its JavaScript bundle.

From the repository root:

```powershell
npm run build:staging
npm run typecheck:pages
npm run deploy:staging:pages
```

`build:staging` uses the dedicated `staging-review` Vite mode. That mode
includes the exact current Inkfall review GLB and verifies its digest before
deployment. The normal `build` command remains the release package: it excludes
unapproved review art and continues through the fail-closed release-package
gate.

Cloudflare account selection is supplied by the operator environment and is
never committed. This project is staging-only, is marked `noindex`, and does
not authorize a production deployment.
