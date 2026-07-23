# V6-B Rev12 bounded runtime checkpoint

Status: `PASS_BOUNDED_V6B_EXPORT_RUNTIME_CANDIDATE_NOT_G6`

Rev12 is the first candidate in this correction sequence to pass every fixed
source, topology, rig, material, animation-structure, body, garment,
hand/contact-zone, non-contact rigid, and exact contact-fixture assertion after
a fresh GLB reimport.

- Maximum fixture bounds drift: `1.2e-7 m`
- Governing sealed maximum: `1.6895741925311934e-7 m`
- GLB bytes: `18,685,160`
- GLB SHA-256: `eb767552e6af30025e6514b4d5c8e71fd3ad6ab3d168208c4450ab1dc6b1eb5a`
- Audit report SHA-256: `b4ec2a07cdaf6a04676cc31b326ff13626f922a7393cad012d6a35bc3a80176c`
- Fresh reimport blend SHA-256: `68a7f6431517611e76c7ef2cbe4c21cda916378f258dbfed5d00635208df73b4`
- Export/audit script SHA-256: `5be2a0fa0bc50baa53c47982f88e39a55c6187833e2dd292e92e0d6491d4e953`

The sealed source and candidate remained unchanged:

- Sealed Rev11b source SHA-256: `029ce233dca6ed2119ac0810e07e4392090f0866dde78da04bed390d9a3e0ec0`
- Candidate blend before/after SHA-256: `ac953f87d40677cedc20a2374c7e9fc3bdda541216b200abfe769b00a8b0318a`
- Accepted body geometry SHA-256: `2e7786391838bb9f443f78a78043fe5631e234f253184f86f61eeee648637d12`
- Accepted body topology: `10,582` vertices / `21,170` edges / `10,590` polygons
- Rig: `52` bones, including all `30` digit bones

The GLB contains exactly six independent named `STEP`/held diagnostic clips.
Each has `164` glTF animation channels: `52` translation, `52` rotation, `52`
scale, and `8` morph-weight channels. Three's GLTFLoader exposes `169` tracks
per clip because the weight channels fan out across `13` rendered morph meshes.

The isolated Three endpoint loaded the actual Rev12 GLB with HTTP 200, exposed
all six clip controls, selected each corresponding `THREE.AnimationClip`, and
captured six distinct canvas images plus the full pose sheet. There were no
page exceptions, console errors, or HTTP errors. See:

- `runtime-proof-rev12/runtime-proof-report.json`
- `runtime-proof-rev12/v6b-rev12-accepted-contact-three.png`
- `runtime-proof-rev12/v6b-rev12-three-runtime-six-pose-sheet.png`

G6 remains open. No production gameplay clips exist yet. The required third-
person inventory remains idle, walk, run, jump start, airborne loop, land,
primary fire, reload, hit reactions, and death. The required first-person arm
inventory remains idle, walk sway, run sway, primary fire, and reload. The six
diagnostic holds do not satisfy any of those gaps, and `public/player.glb` was
not replaced.
