# Legacy relay (comparison only)

This directory preserves KYX's original WebSocket match-state relay as a
comparison fixture while the authoritative multiplayer runtime is built.

It is **not an online multiplayer server** and must never be presented or
deployed as one. The relay trusts client-authored `kill` messages, does not
simulate movement or combat, and cannot establish authoritative match truth.
It exists only to make the old protocol and its failure modes reproducible on
one developer machine.

## Containment rules

- The process always binds to `127.0.0.1`; it has no public-listen option.
- There is no `start`, `dev`, or deployment script.
- The browser application has no active environment variable that connects to
  this relay.
- CI does not launch or deploy it.
- Do not expose it through a proxy, tunnel, VPS, or public WebSocket URL.
- Do not use its timer, roster, score, or kill messages as proof of server
  authority.

## Run the historical comparison fixture

From `server/`, install the locked dependency graph and invoke the deliberately
legacy-named script:

```powershell
npm ci
npm run legacy:relay
```

The local endpoint is `ws://127.0.0.1:8787`. To avoid a local port collision,
set `LEGACY_RELAY_PORT` before starting it; the host remains loopback-only.

```powershell
$env:LEGACY_RELAY_PORT = '8790'
npm run legacy:relay
```

The direct `ws` dependency is retained so this isolated fixture remains
reproducible. The replacement multiplayer path must use a fixed server tick,
validated input commands, server-owned movement/collision/combat/scoring, and
versioned protocol contracts. Production deployment requires explicit user
authorization after the staging and authority gates pass.
