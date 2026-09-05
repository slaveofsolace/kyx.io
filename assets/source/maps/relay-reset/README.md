# Relay architecture comparison

Three local review treatments share the frozen Relay authority fixture and the
camera in `docs/review/RELAY_CREATIVE_RESET_2026-09-05.md`. This is original
construction work for the current project; no external model, texture, font or
material payload is imported. Existing Inkfall Rev5 donor manifests were inspected
as historical pipeline evidence only; their protected payloads are not reused.

The exposed communications deck uses service ribs and plate cassettes. The ceramic
utility campus uses broad sealed shells, recessed access doors and dark load paths.
The compact transmitter workshop uses folded housings and removable shutter bays.
All three preserve the same routes, cover, elevations, portals, spawn clearances,
lighting and material roles. A construction treatment is provisional until it is
seen with the actor and rifle in the running gameplay camera.

`prepare-layout.mjs` reads the current authority module into `layout.json` without
editing it. `build-relay-reset.py` creates editable Blender files and GLBs with
render-only meshes. Blender 5.1.2 is the local authoring tool. The meshes carry
authority anchor names; render geometry never creates authority colliders.

Initial review scope: cover modules, the complete upper bridge, the spawn exit
shoulders, service gate surroundings and the north transmitter. Terrain and
lighting are supplied by the existing runtime. All exports remain unaccepted
development candidates; no release admission is implied.

The baseline screenshot is a real `/practice` capture at 1707 x 863. It precedes
the camera/input repair and is not the controlled post-repair comparison.

## Collision and encounter observations

- Current cover heights are 1.3 m and 2.4 m; spawn shoulder walls are 2.1 m.
- The upper decks top out at 3.93 m; the lower service floor is at -3 m.
- Both primary spawns look into an open central lane. A future pickup at the
  existing center datum would be contestable from both connector exits, but the
  long exposed approach needs measured time-to-damage before selecting a weapon.
- Suggested first pickup experiment: one limited-ammo precision sidearm at the
  center datum, using existing authority pickup contracts. It is a proposal only;
  no spawn, pickup, mode, collision or weapon state is changed by this map lane.
- Current renderer ramp Euler Z negation conflicts with the authoritative ramp
  slope. The parent integration owner is reviewing that source defect. Exports use
  the correct reflected quaternion rather than copying the old render transform.

Unknown: owner visual preference, human encounter quality, target hardware cost,
and portal combat readability. Static dimensions and a GLB import cannot resolve
those judgments.
