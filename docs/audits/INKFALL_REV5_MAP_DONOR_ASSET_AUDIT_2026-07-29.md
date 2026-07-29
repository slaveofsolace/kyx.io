# Inkfall Rev5 map donor asset audit — 2026-07-29

## Decision

Inkfall keeps its authored arena layout, Rev3 authority fixture, traversal
contracts, spawns, zones, and linked-world portal behavior. External assets are
visual construction donors only. They are not a replacement map and do not
gain authority from their render meshes.

The initial integration lane is CC0-only so the future public source repository
and directly delivered browser package can include transformed source and
runtime artifacts without a standalone-redistribution conflict.

## Approved donor sources

| Source | License verified | Intended use | Source |
| --- | --- | --- | --- |
| Quaternius Modular Sci-Fi Megakit | CC0 | Primary grid walls, floors, doors, columns, trims, conduits, platforms, and authored construction reference | https://quaternius.com/packs/modularscifimegakit.html |
| Quaternius Ultimate Modular Sci-Fi Pack | CC0 | Secondary interior and prop construction reference | https://quaternius.com/packs/ultimatemodularscifi.html |
| Kenney Space Station Kit | CC0 | Compact station props and readable low-cost silhouette reference | https://kenney.nl/assets/space-station-kit |
| Kenney Modular Space Kit | CC0 | Modular door, wall, transition, and animated-part reference | https://kenney.nl/assets/modular-space-kit |
| Kenney City Kit (Industrial) | CC0 | Factory and warehouse massing reference | https://kenney.nl/assets/city-kit-industrial |
| Poly Haven | CC0 | HDRI, PBR surface, and selected model donors | https://polyhaven.com/license |
| ambientCG | CC0 | PBR metal, concrete, rubber, painted panel, and grime donors | https://ambientcg.com/ |

## Fab restriction

Fab Standard assets may be used privately as visual reference or in a
non-redistributed prototype, but they are not approved for the public source
tree or raw browser asset package. The Fab Standard License permits project
incorporation and modification but prohibits standalone resale or free
redistribution. Browser-delivered GLBs and a public Git history can expose raw
source geometry too directly for this project to treat that boundary casually.

Fab assets may enter the release lane only when the individual listing carries
an independently verified redistribution-compatible license, the exact
download is hashed and ledgered, and G9 approves the intended source/built
artifact distribution mode.

Reference: https://www.fab.com/eula?lang=en

## Inkfall donor palette

The first visual batch is deliberately small:

1. load-bearing wall, floor, and ceiling modules;
2. door and portal trim modules;
3. one rail and stair family;
4. one beam/column/bracing family;
5. pipes, cable trays, and industrial utility props;
6. a restrained metal/concrete/rubber material family;
7. one custom Inkfall portal silhouette built around, not copied from, donor
   parts.

Every imported source archive and selected mesh must remain outside production
`public`, receive source URL/license/download date/SHA-256 provenance, and pass
the release ledger only after transformation and visual acceptance.

## Browser art constraints

- One coherent authored material language; no visible asset-pack collage.
- Web-optimized texture resolution with channel-packed material maps and
  compression before release.
- Shared/instanced geometry for repeated structural modules.
- Visual surfaces remain render-only until exact collision alignment is
  separately proved.
- No floating braces, disconnected truss feet, clipping walls, or decorative
  forms that overpower combat landmarks.
- Portal, spawn exits, high ground, and route families must remain legible at
  player eye height under normal hardware lighting.

## Current human-eye target

Player-eye v7 rejects the current render layer for black crush, flat cyan
spill, disconnected construction, repeated thin-beam noise, oversized hanging
rings, an unreadable Ink Channel, and unfinished first-person weapon contact.
The donor batch is scoped directly to those findings.
