# G9 security, legal, and deployment readiness

Status as of 2026-07-28: **controls pass only when the executable audit passes;
public release remains blocked.**

## What is controlled

- `package.json` and the lockfile identify this project as `UNLICENSED`; no
  public project license has been selected. `private: true` also prevents an
  accidental npm package publication.
- `assets/provenance/shipped-assets.g9.json` covers every `.glb` and image
  binary shipped from `public/`, with an exact byte count and SHA-256.
- The four Rev17 exports are the only shipped binaries and have project-original
  provenance evidence. Their interim default use removes the unresolved legacy
  dependency but does not grant G6 or human visual acceptance.
- Six legacy binaries remain blocked pending owner attestation or a verifiable
  license, but none are shipped or runtime-addressable. Their exact bytes and
  records are preserved under `assets/quarantine/legacy-unverified/`.
- Player/menu, weapon, enemy, and Sakura-skin runtime paths now use either the
  project-authored Rev17 candidate or existing procedural builders.
- Static browser CSP permits only the exact production and staging Worker
  HTTPS/WSS origins. Worker JSON, preflight, and proxied non-WebSocket API
  responses share the same defensive response headers.
- `env.staging` uses a distinct Worker name, an explicitly repeated
  `KYX_ROOM` binding, and a staging-only origin allowlist.

Run the control audit with:

```powershell
node tools/security/audit-g9-readiness.mjs
```

The audit exits non-zero for a control failure. A successful audit deliberately
reports `releaseStatus: BLOCKED` until the known legal and human-review blockers
are cleared. Dependency license-field coverage is inventory evidence, not a
legal compatibility opinion.

## Release blockers

1. The project owner must select and add a root project license before public
   release.
2. Rev17 still requires the separate G6 human visual acceptance; provenance
   clearance does not grant visual acceptance or default promotion.
3. G7 HUD/UI has been rejected by the project owner and must not be promoted or
   deployed as final.

The quarantined legacy files are no longer release-package blockers because
they are outside `public/` and have no live code reference. Their rights remain
unresolved, so the quarantine itself must not be redistributed as a release
asset or used to claim ownership.

No Cloudflare deployment was performed for this G9 work.
