# NotHereButAfk/Ev.io G5 Rev4 read-only audit

Date: 2026-07-28

Repository: `https://github.com/NotHereButAfk/Ev.io`

Fetched remote: `upstream` with its push URL disabled.

Current fetched `main`: `39b65ade16828e02e7ba23809efe9b4d567e9b54`
(`fix: match first-person arm to equipped armor`, 2026-07-27 23:49:17
-0400).

## Branch and commit comparison

The current `main` contains the relevant arena and presentation branches. The
latest fetched branch tips reviewed for this ownership pass were:

| Ref | Commit | Relevant delta |
| --- | --- | --- |
| `upstream/codex/winter-graveyard-map` | `490e045bd98538f4676008339c5dd5fea74e1ddc` | Procedural Winter-Graveyard massing in `src/world/World.js`; 462 insertions and 61 deletions across six files |
| `upstream/codex/evio-animation-feedback` | `92b9716deb1fb7e00ea2576c6834a27331b90e78` | Avatar, weapon, HUD, and animation feedback; 304 insertions and 17 deletions across nine files |
| `upstream/codex/evio-arena-recreation` | `d2ddb75528be92b1ae20b04c87cacb736a5935fc` | Procedural arena landmark pass; 257 insertions and 33 deletions across four files |
| `upstream/main` and `upstream/codex/viewmodel-armor-match` | `39b65ade16828e02e7ba23809efe9b4d567e9b54` | First-person armor/viewmodel consistency; 92 insertions and 16 deletions across five files |

These changes are architectural and visual references only. Their monolithic
procedural world does not provide KYX.IO's independently hashed render and
authoritative collision artifacts, versioned map package, zones, spawns,
telemetry, Durable Object identity, or reconnect checkpoint contract.

## Provenance and license decision

At the fetched head, upstream `package.json` declares `ISC`, but the repository
tree has no `LICENSE` or `COPYING` file and the README contains no license
statement. That is not enough provenance to adopt code or assets into this
`UNLICENSED` project.

No upstream source, coordinates, text, geometry, images, audio, or other assets
were copied or scaffolded in this pass. No upstream commit was cherry-picked.
Inkfall Rev4 uses only existing KYX.IO-authored and hash-pinned repository
artifacts. The upstream audit influenced route-language review and the decision
to retain KYX.IO's separate collision/render and Cloudflare Durable Object
architecture.

## Primary technical references

- Cloudflare Durable Object WebSocket best practices and hibernation API:
  `https://developers.cloudflare.com/durable-objects/best-practices/websockets/`
- Cloudflare Durable Object lifecycle and reconstitution:
  `https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/`
- Rapier JavaScript character controller:
  `https://rapier.rs/docs/user_guides/javascript/character_controller/`
- Rapier determinism:
  `https://rapier.rs/docs/user_guides/javascript/determinism/`
- Playwright isolated BrowserContext contract:
  `https://playwright.dev/docs/api/class-browsercontext`

These references informed implementation and verification strategy only; they
do not contribute copied project source or assets.
