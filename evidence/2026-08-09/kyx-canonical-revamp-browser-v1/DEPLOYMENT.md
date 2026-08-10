# KYX.IO Canonical Revamp — Staging Deployment Receipt

Deployment date: 2026-08-09 (America/Chicago)

Application build commit: `51161552326fbf1d39986dc74b113e99a62b9319`

Scope: tester-grade staging only; no production product release

## Authority worker

- Worker: `kyx-io-authority-staging`
- Version: `a3e5f813-497c-4a66-a7d7-c3e7ff518765`
- Tag: `canonical-revamp-5116155`
- URL: `https://kyx-io-authority-staging.suhaibabdeljaber.workers.dev`
- `/health`: HTTP 200 after deployment

## Pages review project

- Project: `kyx-io-preview`
- Deployment: `941036a0-616a-43dc-9337-9dde36341945`
- Immutable URL: `https://941036a0.kyx-io-preview.pages.dev`
- Stable tester URL: `https://kyx-io-preview.pages.dev`
- Both URLs returned HTTP 200 after deployment.

Cloudflare labels the `main` branch of this dedicated preview project as its
production environment. That label does not promote this WIP to the KYX.IO
production product; the project, review assets, and evidence remain staging-only.

## Live smoke result

The immutable deployment completed the same menu → Relay → Practice → pointer
lock → movement/jump/fire route used locally:

- presentation: `relay@1/open-sky/v5`
- map: `relay`
- server tick: 183
- accepted inputs: 1,464
- missed scheduler ticks: 0
- accepted attacks: 1
- 12 observed GLB responses, all HTTP 200
- console/page/request errors: 0/0/0

Evidence is under `live/`; visual and product nonclaims remain in
`HUMAN_EYE_AUDIT.md`.
