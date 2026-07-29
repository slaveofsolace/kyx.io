# Non-shipped asset review workspace

This directory preserves candidate binaries, manifests, and provenance
references that are intentionally excluded from the browser runtime and Vite's
`public/` release package.

- `runtime-candidates/` contains exact review bytes for Rev17, Rev30, and
  Rev31. They are not runtime URLs.
- `manifests/` contains their technical candidate records. A record here is
  not an active release manifest.
- Rev30 and Rev31 have owner visual decisions of **rejected**. Rev17 is a
  superseded rig/anatomical reference, not accepted final art.

Only an explicitly accepted, provenance-cleared asset may move into `public/`
and receive a matching active manifest under `assets/manifests/`. The release
asset validator and closed-world package verifier both fail if supported
binary bytes enter the package without exact active manifest and shipped-ledger
coverage.
