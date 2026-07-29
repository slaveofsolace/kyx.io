# G6 Rev31 role helmet family candidate

Date: 2026-07-28

Branch: `codex/role-helmet-variants-20260728`

Disposition: candidate only; human acceptance and browser integration pending.

## Outcome

The rejected Rev30 silhouette was not reused. Rev31 returns to the slimmer
Material Flow body through its proven Rev24 animated runtime descendant and
adds four closed helmet variants using the exact integration IDs:

| `helmetVariantId` | Presentation | Weapon family |
| --- | --- | --- |
| `assault` | Assault / Rifle | rifle |
| `breacher` | Breacher / Shotgun | shotgun |
| `recon` | Recon / Sniper | sniper |
| `duelist` | Duelist / Melee | melee |

The variants share the same fitted body, segmented chest/abdomen language,
cyber-cowl, tapered shell, visor/chin layout, 66-bone rig, and 16 animation
clips. Breacher reinforces the brow and jaw, Recon adds flush sensor modules,
and Duelist uses a narrower guarded face spine. No exposed skin, antennae,
spikes, oversized shoes, or open crown/face gaps are authored.

## Visual corrections completed during this lane

The first authored render was rejected internally before commit because it
read as a cuboid helmet. The second render fixed the head silhouette and pose
but exposed a square abdomen bridge and inherited floor witness. Rev3 is the
only packet retained for integration:

- tapered head-shaped faceted shell instead of a cuboid or bubble;
- neutral rest/A-pose for silhouette review;
- rifle-contact witness rendered separately;
- continuous waist gasket and three shallow overlapping abdomen bands;
- compact footwear;
- no floor witness dot;
- no black occluder in Recon or Duelist;
- all four role front/side/three-quarter views manually inspected.

## Runtime and structural proof

Four distinct GLBs were exported and independently reopened from their exact
runtime bytes. Every export contains:

- one 66-bone armature;
- 16 Rev17-compatible actions, including the required ten third-person clips;
- 100 percent head-weighting for every role helmet vertex;
- a complete cowl/shell/crown/faceplate/visor/chin/temple/cheek/neck-seal set;
- a distinct SHA-256 from the other role variants.

The direct-GLB validator generated 16 views: three neutral views and one
separate weapon-contact view for each role. All structural assertions passed.

Commands:

```powershell
blender --background <rev24-master.blend> `
  --python assets/source/blender/phase7-character-original-v6/scripts/author_role_helmet_variants_rev31.py `
  -- <rev24-master.blend> <rev31-master.blend> `
  public/candidates/g6-role-helmets-rev31 `
  evidence/2026-07-28/g6-role-helmets-rev31/author-export-report.json

blender --background --factory-startup `
  --python assets/source/blender/phase7-character-original-v6/scripts/validate_render_role_helmet_variants_rev31.py `
  -- public/candidates/g6-role-helmets-rev31 `
  evidence/2026-07-28/g6-role-helmets-rev31/renders-rev3 `
  evidence/2026-07-28/g6-role-helmets-rev31/direct-glb-validation-rev3.json
```

## Evidence

- `evidence/2026-07-28/g6-role-helmets-rev31/author-export-report.json`
- `evidence/2026-07-28/g6-role-helmets-rev31/direct-glb-validation-rev3.json`
- `evidence/2026-07-28/g6-role-helmets-rev31/renders-rev3/`
- `public/candidates/g6-role-helmets-rev31/manifest.json`
- `assets/manifests/g6-rev31-role-*-character-lod0.asset.json`

## Non-claims and remaining integration

- Human visual acceptance remains explicit and pending.
- Static and sampled-action evidence does not prove every-frame clipping
  freedom in the actual browser arena.
- The browser selection layer must load the manifest asset for the active
  `helmetVariantId`.
- Equipped project weapons must hide/replace the embedded contact rifle.
- Distinct Rev31 LOD1/LOD2 exports, final first-person arms, live role switching,
  multiplayer population proof, and performance acceptance remain outside this
  isolated asset lane.
