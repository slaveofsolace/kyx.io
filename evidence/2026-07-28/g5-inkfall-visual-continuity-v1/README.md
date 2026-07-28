# Inkfall Foundry Rev4 online visual-continuity candidate

This is one focused browser capture, not a G5 acceptance or regression run.

## Captured facts

- Exact online profile: `g5-inkfall-foundry-rev4-revision-3-authority-v1`
- Exact map: `inkfall_foundry@3`
- Authority fixture hash: `6cf785c5171f2ff5`
- Authority remained 339 colliders, 12 spawns, and 9 zones.
- `renderMeshesMayBeAuthority` remained `false`.
- The project-authored continuity module contributed 311 render-only/noHit
  meshes around the existing 45-mesh Rev4 presentation asset.
- Browser console and page error lists were empty.

## Capture limitation

The capture created one room occupant. The authoritative match therefore stayed
in its waiting state and did not advance the player from the west spawn; the
four files are attempted look directions from the same spawn, not four
traversed viewpoints. `01-west-spawn-pocket-forward.png` is the useful frame.
The other three are retained so the evidence does not hide the limitation.

The committed harness now creates two isolated player contexts and requires
more than 2 meters of authoritative travel before its Press Hall frame. It was
not rerun because this lane had an explicit one-capture budget.

After viewing this capture, the candidate received a source-only exposure and
material-readability adjustment. Geometry, mesh cardinality, and authority
bindings did not change. No second visual claim is made for that adjustment.

## Nonclaims

- No human visual/fun/spawn-safety approval.
- No 2/4/8-player, performance, broad regression, staging, deployment, release,
  or G5 acceptance claim.
- The new render-only floors, walls, shell, landmarks, and understructure are
  not collision and do not change server rules.
