import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const lane = dirname(fileURLToPath(import.meta.url));
const output = join(lane, "output");
const reportPath = join(output, "character-refinement-v3-report.json");
const blendPath = join(output, "kyx_phase7_character_refinement_v3.blend");
const glbPath = join(output, "kyx_phase7_character_refinement_v3.glb");

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseGlb(bytes) {
  invariant(bytes.subarray(0, 4).toString("ascii") === "glTF", "GLB magic mismatch");
  invariant(bytes.readUInt32LE(4) === 2, "GLB version is not 2");
  invariant(bytes.readUInt32LE(8) === bytes.byteLength, "GLB declared byte length mismatch");
  const jsonBytes = bytes.readUInt32LE(12);
  invariant(bytes.readUInt32LE(16) === 0x4e4f534a, "GLB first chunk is not JSON");
  return JSON.parse(bytes.subarray(20, 20 + jsonBytes).toString("utf8").replace(/[\0 ]+$/u, ""));
}

function parsePngSize(bytes) {
  invariant(bytes.subarray(1, 4).toString("ascii") === "PNG", "Render is not a PNG");
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

const report = JSON.parse(await readFile(reportPath, "utf8"));
const glbBytes = await readFile(glbPath);
const glb = parseGlb(glbBytes);
const blend = await stat(blendPath);

invariant(report.status === "VISUAL_REFINEMENT_CANDIDATE_NOT_G6", "Status overclaims the visual gate");
invariant(report.verification?.status === "PASS", "Embedded build verification did not pass");
invariant(Object.values(report.verification.checks).every(Boolean), "One or more embedded checks failed");
invariant(report.selfCritique?.decision === "CANDIDATE_ONLY_AWAIT_HUMAN_VISUAL_REVIEW", "Human-review boundary missing");
invariant(report.limitations.some((item) => item.includes("No human visual approval or G6 claim")), "No-G6 limitation missing");
invariant(report.limitations.some((item) => item.includes("No runtime integration")), "No-runtime limitation missing");
invariant(blend.size > 100_000, "Blend source artifact is implausibly small");
invariant(report.glb.bytes === glbBytes.byteLength, "Reported GLB size mismatch");
invariant(report.glb.sha256 === sha256(glbBytes), "Reported GLB digest mismatch");
invariant((glb.meshes?.length ?? 0) >= 20, "GLB contains too few meshes");
invariant((glb.materials?.length ?? 0) >= 8, "GLB contains too few materials");
invariant((glb.animations?.length ?? 0) >= 1, "GLB presentation action missing");
invariant(report.verification.checks.anatomicalFormsPresent === true, "Anatomical garment forms missing");
invariant(report.verification.checks.contactFormsPresent === true, "Weapon-contact forms missing");

const renderEntries = report.manifest.filter((entry) => entry.path.endsWith(".png"));
invariant(renderEntries.length === 9, `Expected 9 review renders, found ${renderEntries.length}`);
for (const entry of report.manifest) {
  const bytes = await readFile(join(lane, entry.path));
  invariant(bytes.byteLength === entry.bytes, `Size mismatch: ${entry.path}`);
  invariant(sha256(bytes) === entry.sha256, `Digest mismatch: ${entry.path}`);
  if (entry.path.endsWith(".png")) {
    const [width, height] = parsePngSize(bytes);
    invariant(width === 960 && height === 960, `Unexpected render dimensions: ${entry.path}`);
  }
}

const result = {
  status: "PASS",
  candidateStatus: report.status,
  glb: {
    bytes: glbBytes.byteLength,
    sha256: sha256(glbBytes),
    meshes: glb.meshes.length,
    materials: glb.materials.length,
    skins: glb.skins?.length ?? 0,
    animations: glb.animations.length,
  },
  source: {
    meshObjects: report.source.meshObjects,
    triangles: report.source.triangles,
    connectedSuitObjects: report.source.connectedSuitObjects,
  },
  renders: renderEntries.length,
  boundaries: ["no runtime integration", "no G6 claim", "human visual review required"],
};

console.log(JSON.stringify(result, null, 2));
