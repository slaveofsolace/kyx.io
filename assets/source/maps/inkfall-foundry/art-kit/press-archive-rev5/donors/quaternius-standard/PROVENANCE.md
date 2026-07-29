# Inkfall Rev5 Quaternius CC0 geometry donors

This directory contains a deliberately small, geometry-only derivative set
from the free **Quaternius Modular Sci-Fi MegaKit Standard**. It is a donor
construction vocabulary for Inkfall Foundry—not a replacement map and not an
authority source.

- Creator: Quaternius
- Official pack page: https://quaternius.com/packs/modularscifimegakit.html
- Official Standard download page: https://quaternius.itch.io/modular-sci-fi-megakit
- License: CC0 1.0 Universal
- Download date: 2026-07-29
- Downloaded ZIP bytes: 48,563,245
- Downloaded ZIP SHA-256: `4ca9acbc7a13e7baa48e24c4853b779889b7ab21587004c36668826e705c8a10`

The checked-in GLBs were produced by
`prepare_geometry_only_donors.py`. The conversion strips every upstream
material, texture, light, camera, and animation. Inkfall supplies its own
materials, placement, lighting, composition, portal treatment, and gameplay
contract.

The generated `geometry-only-donor-manifest.json` records exact hashes for
each selected upstream glTF/bin pair and each derived GLB. None of these donor
meshes contains collision or changes the frozen Revision 3 collision, spawn,
zone, or portal-authority contract.
