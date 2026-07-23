"""Author a connected combat silhouette from preserved V6-C rev6.

Rev7 preserves rev6 byte-for-byte and rebuilds the visual language around a
connected torso harness, overlapping joint transitions, side/rear helmet
architecture, a stronger value hierarchy, and an angular functional rifle.
Literal held contact remains reserved for the later rigged gate.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from typing import Callable

import bpy
from mathutils import Vector


OLD_PREFIX = "KYX_V6C_BENCH_R6_"
PREFIX = "KYX_V6C_BENCH_R7_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV7"
PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
PINNED_REV6_SHA256 = "bb3ec3a885ae0f36740ed979a38bcdfe6e354b93e497f29280b131f42aed89a2"

REV6_PATH = Path(__file__).with_name("author_v6c_visual_benchmark_rev6.py")
SPEC = importlib.util.spec_from_file_location("kyx_v6c_rev6_geometry_utilities", REV6_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load rev6 utilities: {REV6_PATH}")
r6 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r6)
for module in (
    r6, r6.r5, r6.r5.r4, r6.r5.r4.r3,
    r6.r5.r4.r3.r2, r6.r5.r4.r3.r2.r1, r6.base,
):
    module.PREFIX = PREFIX
    module.CHECKPOINT = CHECKPOINT
base = r6.base


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <rev6.blend> <accepted-v6a.blend> <output.blend> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rename_namespace() -> None:
    for data_group in (
        bpy.data.objects, bpy.data.meshes, bpy.data.curves,
        bpy.data.materials, bpy.data.collections,
    ):
        for datablock in list(data_group):
            if datablock.name.startswith(OLD_PREFIX):
                datablock.name = PREFIX + datablock.name[len(OLD_PREFIX):]
    for obj in bpy.data.objects:
        if obj.get("kyx_checkpoint") == "V6-C_VISUAL_BENCHMARK_REV6":
            obj["kyx_checkpoint"] = CHECKPOINT


def remove_objects(suffixes: list[str]) -> list[str]:
    removed: list[str] = []
    for suffix in suffixes:
        obj = bpy.data.objects.get(f"{PREFIX}{suffix}")
        if obj is not None:
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    return removed


def fitted_panel(
    name: str,
    source: bpy.types.Object,
    predicate: Callable[[Vector], bool],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *, offset: float = 0.0045,
    thickness: float = 0.0035,
) -> bpy.types.Object:
    obj = r6.r5.fitted_surface_from_body(
        name, source, predicate, collection, material, role,
        offset=offset, thickness=thickness,
    )
    r6.smooth_fitted_shell(obj)
    return obj


def build_connected_harness(
    body: bpy.types.Object,
    armor: bpy.types.Collection,
    equipment: bpy.types.Collection,
    steel: bpy.types.Material,
    graphite: bpy.types.Material,
    ivory: bpy.types.Material,
    red: bpy.types.Material,
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    objects.append(fitted_panel(
        f"{PREFIX}TorsoContinuousYoke", body,
        lambda p: 1.335 < p.z < 1.462 and abs(p.x) < 0.245,
        armor, steel,
        "continuous front-side-back combat yoke joining collar, scapulae, and shoulders",
        offset=0.0045, thickness=0.0040,
    ))
    objects.append(fitted_panel(
        f"{PREFIX}SternumHarnessSpine", body,
        lambda p: 1.115 < p.z < 1.405 and abs(p.x) < 0.038 and p.y < -0.038,
        armor, graphite,
        "narrow sternum spine physically overlapping yoke and waist harness",
        offset=0.0065, thickness=0.0038,
    ))
    objects.append(fitted_panel(
        f"{PREFIX}RearHarnessSpine", body,
        lambda p: 1.115 < p.z < 1.425 and abs(p.x) < 0.043 and p.y > 0.038,
        armor, graphite,
        "rear load spine joining the yoke to the waist harness",
        offset=0.0060, thickness=0.0038,
    ))
    objects.append(fitted_panel(
        f"{PREFIX}WaistLoadBand", body,
        lambda p: 1.075 < p.z < 1.155 and abs(p.x) < 0.205,
        armor, steel,
        "continuous waist load band anchoring front, side, and rear harness structure",
        offset=0.0045, thickness=0.0035,
    ))

    for side, label in ((1.0, "L"), (-1.0, "R")):
        objects.append(fitted_panel(
            f"{PREFIX}SideRibHarness_{label}", body,
            lambda p, side=side: (
                1.155 < p.z < 1.365 and 0.125 < side * p.x < 0.255
                and -0.075 < p.y < 0.095
            ),
            armor, steel,
            "side rib load panel overlapping the upper yoke and lower waist band",
            offset=0.0050, thickness=0.0038,
        ))
        objects.append(fitted_panel(
            f"{PREFIX}ShoulderHarnessBridge_{label}", body,
            lambda p, side=side: (
                1.305 < p.z < 1.465 and 0.125 < side * p.x < 0.325 and p.y < 0.045
            ),
            armor, steel,
            "continuous clavicle-to-deltoid bridge overlapping the torso yoke and arm shell",
            offset=0.0055, thickness=0.0040,
        ))
        objects.append(fitted_panel(
            f"{PREFIX}HighClavicleCeramic_{label}", body,
            lambda p, side=side: (
                1.382 < p.z < 1.456 and 0.042 < side * p.x < 0.178 and p.y < -0.035
            ),
            armor, ivory,
            "small high clavicle ceramic nested in the continuous dark yoke, above the pectoral mass",
            offset=0.0090, thickness=0.0026,
        ))
        objects.append(fitted_panel(
            f"{PREFIX}ElbowArticulationBand_{label}", body,
            lambda p, side=side: 1.095 < p.z < 1.195 and side * p.x > 0.285,
            armor, steel,
            "overlapping elbow band joining the forearm shell to the exposed upper-arm flex zone",
            offset=0.0045, thickness=0.0030,
        ))
        objects.append(fitted_panel(
            f"{PREFIX}KneeArticulationBand_{label}", body,
            lambda p, side=side: 0.625 < p.z < 0.712 and side * p.x > 0.075,
            armor, steel,
            "overlapping knee band joining thigh, patella, and tibia protection",
            offset=0.0045, thickness=0.0032,
        ))

        side_path = [
            (0.030 * side, -0.132, 1.360),
            (0.135 * side, -0.107, 1.330),
            (0.220 * side, -0.040, 1.285),
            (0.224 * side, 0.046, 1.285),
            (0.145 * side, 0.105, 1.330),
            (0.042 * side, 0.112, 1.365),
        ]
        objects.append(base.add_curve(
            f"{PREFIX}RibHarnessArc_{label}", side_path, 0.0048,
            equipment, graphite,
            "continuous rib arc physically tying front sternum, side load panel, and rear spine",
        ))
        objects.append(base.add_curve(
            f"{PREFIX}ElbowHingeRail_{label}",
            [(0.326 * side, -0.066, 1.181), (0.346 * side, -0.072, 1.151),
             (0.362 * side, -0.070, 1.116)],
            0.0025, equipment, red if label == "L" else graphite,
            "short seated hinge rail contained within the articulated elbow overlap",
        ))
        objects.append(base.add_curve(
            f"{PREFIX}KneeHingeRail_{label}",
            [(0.137 * side, -0.091, 0.694), (0.145 * side, -0.096, 0.666),
             (0.149 * side, -0.091, 0.638)],
            0.0026, equipment, red if label == "L" else graphite,
            "short seated hinge rail contained within the articulated knee overlap",
        ))
    return objects


def build_helmet_architecture(
    liner: bpy.types.Object,
    armor: bpy.types.Collection,
    equipment: bpy.types.Collection,
    steel: bpy.types.Material,
    graphite: bpy.types.Material,
    ivory: bpy.types.Material,
    cyan: bpy.types.Material,
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    for side, label in ((1.0, "L"), (-1.0, "R")):
        objects.append(fitted_panel(
            f"{PREFIX}HelmetTempleFrame_{label}", liner,
            lambda p, side=side: (
                1.545 < p.z < 1.735 and side * p.x > 0.063 and -0.085 < p.y < 0.072
            ),
            armor, steel,
            "structured temporal frame linking visor brow, crown, cowl, and rear helmet architecture",
            offset=0.0045, thickness=0.0030,
        ))
        objects.append(base.add_curve(
            f"{PREFIX}HelmetJawRail_{label}",
            [(0.083 * side, -0.151, 1.585), (0.108 * side, -0.104, 1.620),
             (0.113 * side, -0.035, 1.646), (0.106 * side, 0.030, 1.630)],
            0.0038, equipment, graphite,
            "continuous jaw-temple rail framing the visor and tying into the rear shell",
        ))
    objects.append(fitted_panel(
        f"{PREFIX}HelmetOccipitalArchitecture", liner,
        lambda p: 1.540 < p.z < 1.725 and p.y > 0.022 and abs(p.x) < 0.082,
        armor, steel,
        "centered occipital load shell overlapping both temporal frames and lower cowl",
        offset=0.0040, thickness=0.0032,
    ))
    objects.append(base.add_curve(
        f"{PREFIX}VisorCenterMullion",
        [(0.0, -0.187, 1.704), (0.0, -0.195, 1.656), (0.0, -0.183, 1.606)],
        0.0030, equipment, graphite,
        "central visor mullion breaking the single featureless shield surface",
    ))
    objects.append(base.add_curve(
        f"{PREFIX}VisorLowerFrame",
        [(-0.078, -0.171, 1.598), (-0.038, -0.187, 1.590),
         (0.0, -0.193, 1.588), (0.038, -0.187, 1.590),
         (0.078, -0.171, 1.598)],
        0.0028, equipment, graphite,
        "lower visor frame tying both temple structures into the chin seal",
    ))
    for index, x in enumerate((-0.034, 0.0, 0.034)):
        objects.append(base.add_curve(
            f"{PREFIX}OccipitalVent_{index + 1}",
            [(x, 0.071, 1.585), (x, 0.077, 1.625), (x, 0.072, 1.666)],
            0.0020, equipment, cyan if index == 1 else ivory,
            "recessed rear exhaust/readout route integrated into the occipital shell",
        ))
    return objects


def rebuild_combat_rifle(
    collection: bpy.types.Collection,
    steel: bpy.types.Material,
    graphite: bpy.types.Material,
    ivory: bpy.types.Material,
    rubber: bpy.types.Material,
    red: bpy.types.Material,
    cyan: bpy.types.Material,
) -> tuple[list[bpy.types.Object], dict[str, tuple[float, float, float]]]:
    for obj in list(collection.all_objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    objects: list[bpy.types.Object] = []
    chassis = base.add_receiver_profile(
        f"{PREFIX}AutoRifleForgedChassis",
        [(-0.565, 1.176), (-0.558, 1.258), (-0.492, 1.302),
         (-0.402, 1.296), (-0.328, 1.255), (-0.250, 1.274),
         (-0.178, 1.318), (0.115, 1.314), (0.192, 1.278),
         (0.488, 1.255), (0.542, 1.215), (0.502, 1.170),
         (0.212, 1.160), (0.142, 1.122), (-0.135, 1.123),
         (-0.213, 1.151), (-0.330, 1.151), (-0.438, 1.174)],
        0.104, collection, graphite,
        "single angular forged chassis joining stock, receiver, handguard root, and grip well",
        bevel=0.006,
    )
    chassis["continuous_primary_volume"] = True
    objects.append(chassis)
    objects.append(base.add_receiver_profile(
        f"{PREFIX}AutoRifleReceiverArmor",
        [(-0.250, 1.292), (-0.177, 1.334), (0.112, 1.330),
         (0.190, 1.286), (0.139, 1.191), (-0.205, 1.196)],
        0.116, collection, steel,
        "layered receiver armor seated across the continuous forged chassis",
        bevel=0.005,
    ))
    objects.append(base.add_receiver_profile(
        f"{PREFIX}AutoRifleVentilatedHandguard",
        [(0.112, 1.285), (0.478, 1.263), (0.530, 1.224),
         (0.472, 1.181), (0.188, 1.182), (0.103, 1.218)],
        0.115, collection, steel,
        "tapered handguard mechanically overlapped into the receiver armor and barrel root",
        bevel=0.004,
    ))
    objects.append(base.add_receiver_profile(
        f"{PREFIX}AutoRifleStockCheekPad",
        [(-0.548, 1.246), (-0.480, 1.286), (-0.384, 1.282),
         (-0.314, 1.250), (-0.366, 1.213), (-0.500, 1.215)],
        0.112, collection, ivory,
        "small indexed cheek pad seated into the structural stock rather than a broad shell",
        bevel=0.005,
    ))
    objects.append(base.add_receiver_profile(
        f"{PREFIX}AutoRifleButtPad",
        [(-0.584, 1.169), (-0.557, 1.175), (-0.550, 1.259),
         (-0.575, 1.274), (-0.596, 1.247)],
        0.112, collection, rubber,
        "angled shoulder pad overlapping the rear of the forged stock",
        bevel=0.005,
    ))
    objects.append(base.add_receiver_profile(
        f"{PREFIX}AutoRifleIntegratedGrip",
        [(-0.195, 1.157), (-0.105, 1.149), (-0.088, 1.055),
         (-0.120, 0.945), (-0.176, 0.956), (-0.213, 1.073)],
        0.076, collection, rubber,
        "canted palm grip physically seated into the receiver and chassis junction",
        bevel=0.008,
    ))
    objects.append(base.add_receiver_profile(
        f"{PREFIX}AutoRifleMagazine",
        [(-0.012, 1.151), (0.078, 1.151), (0.104, 1.035),
         (0.078, 0.914), (0.022, 0.892), (-0.018, 1.023)],
        0.072, collection, graphite,
        "curved removable magazine seated into a visible receiver well",
        bevel=0.007,
    ))
    objects.append(base.add_receiver_profile(
        f"{PREFIX}AutoRifleTopRail",
        [(-0.203, 1.316), (0.334, 1.314), (0.359, 1.339),
         (-0.181, 1.341)],
        0.072, collection, graphite,
        "continuous low top rail anchored across receiver and handguard",
        bevel=0.0025,
    ))
    objects.append(base.add_receiver_profile(
        f"{PREFIX}AutoRifleHandStop",
        [(0.268, 1.188), (0.332, 1.185), (0.328, 1.122),
         (0.291, 1.104), (0.266, 1.139)],
        0.070, collection, rubber,
        "support-hand stop joined to the underside of the ventilated handguard",
        bevel=0.005,
    ))
    objects.append(base.add_cylinder_between(
        f"{PREFIX}AutoRifleBarrel", (0.470, 0.0, 1.217), (0.742, 0.0, 1.217),
        0.010, collection, graphite,
        "barrel rooted deeply inside the handguard and continuous with the muzzle assembly",
        vertices=40,
    ))
    objects.append(base.add_cylinder_between(
        f"{PREFIX}AutoRifleMuzzle", (0.710, 0.0, 1.217), (0.815, 0.0, 1.217),
        0.020, collection, steel,
        "tapered muzzle assembly overlapping the barrel termination",
        vertices=40,
    ))
    objects.append(base.add_curve(
        f"{PREFIX}AutoRifleTriggerGuard",
        [(-0.204, -0.047, 1.139), (-0.157, -0.061, 1.177),
         (-0.096, -0.051, 1.137)],
        0.0050, collection, graphite,
        "trigger guard joined at both ends to receiver and grip junction",
    ))
    objects.append(base.add_curve(
        f"{PREFIX}AutoRifleEjectionFrame",
        [(-0.040, -0.063, 1.236), (0.092, -0.063, 1.236),
         (0.105, -0.063, 1.279), (-0.028, -0.063, 1.285),
         (-0.040, -0.063, 1.236)],
        0.0028, collection, graphite,
        "closed ejection frame seated into the receiver armor",
    ))
    for index, x in enumerate((0.205, 0.300, 0.395)):
        objects.append(base.add_curve(
            f"{PREFIX}AutoRifleHandguardVent_{index + 1}",
            [(x - 0.026, -0.061, 1.230), (x, -0.064, 1.242),
             (x + 0.026, -0.060, 1.231)],
            0.0032, collection, graphite,
            "recessed functional vent seated inside the tapered handguard",
        ))
    objects.append(base.add_curve(
        f"{PREFIX}AutoRifleIdentityRoute",
        [(-0.255, -0.064, 1.293), (-0.135, -0.066, 1.309),
         (0.005, -0.066, 1.303), (0.130, -0.063, 1.286)],
        0.0030, collection, red,
        "restrained receiver identity route following mechanical panel changes",
    ))
    objects.append(base.add_beveled_box(
        f"{PREFIX}AutoRifleStatus", (0.112, -0.065, 1.267),
        (0.050, 0.006, 0.010), collection, cyan,
        "flush status slit nested in the receiver armor", bevel=0.003,
    ))
    contact_points = {
        "primary_grip": (-0.150, -0.058, 1.035),
        "support_grip": (0.300, -0.062, 1.155),
        "shoulder": (-0.577, 0.0, 1.222),
    }
    for label, location in contact_points.items():
        witness = bpy.data.objects.new(f"{PREFIX}CONTACT_{label}", None)
        witness.location = location
        witness.empty_display_type = "SPHERE"
        witness.empty_display_size = 0.014
        witness.hide_render = True
        collection.objects.link(witness)
        base.tag(witness, "future rigged contact witness only; not literal contact proof")
    return objects, contact_points


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 4:
        raise SystemExit("Expected -- <rev6.blend> <accepted-v6a.blend> <output.blend> <report.json>")
    rev6_path, v6a_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    rev6_hash_before = sha256(rev6_path)
    v6a_hash_before = sha256(v6a_path)
    if rev6_hash_before != PINNED_REV6_SHA256:
        raise RuntimeError(f"Pinned rev6 hash mismatch: {rev6_hash_before}")
    if v6a_hash_before != PINNED_V6A_SHA256:
        raise RuntimeError(f"Pinned V6-A hash mismatch: {v6a_hash_before}")

    bpy.ops.wm.open_mainfile(filepath=str(rev6_path), load_ui=False, use_scripts=False)
    rename_namespace()
    body = bpy.data.objects.get(f"{PREFIX}ContinuousAnatomicalUndersuit")
    liner = bpy.data.objects.get(f"{PREFIX}HelmetPlanarLiner")
    armor = bpy.data.collections.get(f"{PREFIX}AuthoredArmorSurfaces")
    equipment = bpy.data.collections.get(f"{PREFIX}IntegratedEquipment")
    rifle_collection = bpy.data.collections.get(f"{PREFIX}OriginalAutoRifle")
    if body is None or liner is None or armor is None or equipment is None or rifle_collection is None:
        raise RuntimeError("Missing required renamed rev6 construction data")
    ivory = bpy.data.materials.get(f"{PREFIX}WarmIvoryCeramic")
    graphite = bpy.data.materials.get(f"{PREFIX}GraphiteStructure")
    red = bpy.data.materials.get(f"{PREFIX}SignalCoral")
    cyan = bpy.data.materials.get(f"{PREFIX}CyanReadout")
    rubber = bpy.data.materials.get(f"{PREFIX}OutsoleRubber")
    if any(material is None for material in (ivory, graphite, red, cyan, rubber)):
        raise RuntimeError("Missing required rev7 inherited material")
    steel = base.make_principled_material(
        f"{PREFIX}StructuralBlueSteel", (0.022, 0.054, 0.073, 1.0),
        metallic=0.46, roughness=0.39,
    )
    r6.r5.set_principled(ivory, (0.235, 0.175, 0.095, 1.0), roughness=0.50, metallic=0.06)
    r6.r5.set_principled(graphite, (0.004, 0.012, 0.018, 1.0), roughness=0.51, metallic=0.28)

    removed = remove_objects([
        "ClavicleCeramicInlay_L", "ClavicleCeramicInlay_R",
        "ClavicleGraphiteUnderlay_L", "ClavicleGraphiteUnderlay_R",
        "RibTailoringSeam_L", "RibTailoringSeam_R",
        "OccipitalTaperRoute_L", "OccipitalTaperRoute_R",
    ])
    replacements = build_connected_harness(body, armor, equipment, steel, graphite, ivory, red)
    replacements.extend(build_helmet_architecture(
        liner, armor, equipment, steel, graphite, ivory, cyan,
    ))
    rifle_objects, contact_points = rebuild_combat_rifle(
        rifle_collection, steel, graphite, ivory, rubber, red, cyan,
    )
    replacements.extend(rifle_objects)

    bpy.context.view_layer.update()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    rev6_hash_after = sha256(rev6_path)
    v6a_hash_after = sha256(v6a_path)
    if rev6_hash_after != rev6_hash_before or v6a_hash_after != v6a_hash_before:
        raise RuntimeError("Pinned rev6 or accepted V6-A changed during rev7 authoring")
    output_hash = sha256(output_path)

    report = {
        "schemaVersion": 1,
        "authoredUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "inputs": {
            "rev6": {"path": rev6_path.name, "sha256Before": rev6_hash_before,
                     "sha256After": rev6_hash_after, "unchanged": rev6_hash_before == rev6_hash_after},
            "acceptedV6A": {"path": v6a_path.name, "sha256Before": v6a_hash_before,
                            "sha256After": v6a_hash_after, "unchanged": v6a_hash_before == v6a_hash_after},
        },
        "output": {"path": output_path.name, "bytes": output_path.stat().st_size, "sha256": output_hash},
        "removedRev6Objects": removed,
        "contactWitnesses": {name: list(location) for name, location in contact_points.items()},
        "corrections": [
            "Built a continuous front-side-back yoke, sternum/rear spines, side rib panels, rib arcs, and waist load band.",
            "Moved ceramic chest protection high onto the clavicles so it reads as inlay within the harness, not isolated cups.",
            "Added overlapping shoulder bridges plus elbow and knee articulation bands and hinge rails.",
            "Added temporal frames, jaw rails, an occipital load shell, visor mullion/lower frame, and rear vents.",
            "Introduced a structural blue-steel middle value between near-black graphite and warm ceramic.",
            "Rebuilt the rifle as an angular forged chassis with receiver armor, ventilated handguard, cheek/butt pads, top rail, grip, magazine, hand stop, rooted barrel, and muzzle.",
        ],
        "assertions": {
            "rev6Preserved": rev6_hash_before == rev6_hash_after,
            "acceptedV6APreserved": v6a_hash_before == v6a_hash_after,
            "rifleContinuousPrimaryVolume": bool(bpy.data.objects[f"{PREFIX}AutoRifleForgedChassis"].get("continuous_primary_volume")),
            "contactWitnessCount": len(contact_points) == 3,
            "noLiteralHeldContactClaim": True,
            "noV6BObjects": not any(obj.name.startswith("KYX_V6B_") for obj in bpy.data.objects),
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
        },
        "status": "V6C_VISUAL_BENCHMARK_REV7_REQUIRES_DIRECT_VISUAL_AUDIT",
        "nonClaims": [
            "Revision 7 is a V6-C visual benchmark candidate, not V6-C or G6 acceptance.",
            "The three contact witnesses establish future intent only; no held, two-hand, or shoulder contact is claimed.",
            "No final retopology, authored UVs, texture bake, rig, animation, LOD, GLB, runtime integration, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "outputSha256": output_hash,
                      "replacements": len(replacements), "contactWitnesses": len(contact_points)}, sort_keys=True))


if __name__ == "__main__":
    main()
