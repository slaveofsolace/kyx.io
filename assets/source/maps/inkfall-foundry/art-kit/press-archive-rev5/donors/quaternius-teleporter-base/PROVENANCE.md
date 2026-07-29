# Quaternius Teleporter Base donor

This directory preserves one small, authored portal-machine donor for the
Inkfall Foundry Rev5 review candidate.

- Creator: Quaternius
- Original listing: https://poly.pizza/m/OIezStCmak
- License on the original listing: CC0 1.0 Universal / Public Domain
- Original format: binary glTF (`.glb`)
- Retrieved: 2026-07-29
- Original file SHA-256:
  `29a296a33fc557c3765fec79cf06d6a262949b1fe6adca4c69ca7b2d3ecb2ac3`
- Original preview SHA-256:
  `deaa5fe4134cccbe6139d7c8a29d1d2bfa482f057ac5420c5f668ae9b8cbab88`

The original GLB contains one mesh, three material primitives, 556 triangles,
and no images or textures. `prepare_geometry_only_donor.py` verifies those
facts, bakes the imported world transform, and separates the three source
material groups into named, material-free `darkgrey`, `main`, and `accent`
parts. The derived GLB is 31,776 bytes with SHA-256
`6af6e49c34fe4f75f93d928db2d43a6402609bbc8aa7b447d8d16e563b000391`.

The Rev5 builder treats those parts as render-only donor geometry, assigns
local Inkfall cast-iron, worn-steel, and endpoint-accent materials, and never
uses the donor as collision, trigger, spawn, zone, or gameplay authority.

`donor-manifest.json` is the fail-closed source contract. The generated
`geometry-only/geometry-only-donor-manifest.json` records the derivation.
