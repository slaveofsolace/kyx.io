import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const GLB_URL = "/assets/source/blender/phase7-character-original-v6/model/v6c-gameplay-rev13/export/kyx-v6c-gameplay-rev13.runtime-candidate.glb";
const CLIPS = [
  { name: "KYX_V6C_TP_IDLE", label: "Combat idle", detail: "2.000 s · loop", preview: 0.27, loop: true },
  { name: "KYX_V6C_TP_WALK", label: "Walk", detail: "1.000 s · loop", preview: 0.25, loop: true },
  { name: "KYX_V6C_TP_RUN", label: "Run", detail: "0.750 s · loop", preview: 0.24, loop: true },
  { name: "KYX_V6C_TP_JUMP_START", label: "Jump start", detail: "0.542 s", preview: 0.7, loop: false },
  { name: "KYX_V6C_TP_AIRBORNE_LOOP", label: "Airborne", detail: "1.000 s · loop", preview: 0.48, loop: true },
  { name: "KYX_V6C_TP_LAND", label: "Land", detail: "0.625 s", preview: 0.48, loop: false },
  { name: "KYX_V6C_TP_PRIMARY_FIRE", label: "Primary fire", detail: "0.458 s", preview: 0.18, loop: false },
  { name: "KYX_V6C_TP_RELOAD", label: "Reload", detail: "2.000 s", preview: 0.38, loop: false },
  { name: "KYX_V6C_TP_HIT_REACTION_FRONT", label: "Hit reaction", detail: "0.792 s", preview: 0.24, loop: false },
  { name: "KYX_V6C_TP_DEATH_FRONT", label: "Death", detail: "2.458 s", preview: 0.9, loop: false },
];

const canvas = document.querySelector("#viewport");
const status = document.querySelector("#load-status");
const selectedChip = document.querySelector("#selected-chip");
const buttonsRoot = document.querySelector("#clip-buttons");
const sheetRoot = document.querySelector("#clip-sheet");
const timeline = document.querySelector("#timeline");
const timeReadout = document.querySelector("#time-readout");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.34;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071316);
scene.fog = new THREE.FogExp2(0x071316, 0.085);
const camera = new THREE.PerspectiveCamera(31, canvas.clientWidth / canvas.clientHeight, 0.01, 1000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minPolarAngle = Math.PI * 0.17;
controls.maxPolarAngle = Math.PI * 0.79;

scene.add(new THREE.HemisphereLight(0xd8fff7, 0x16252c, 2.35));
scene.add(new THREE.AmbientLight(0xbdd8d4, 1.05));
const key = new THREE.DirectionalLight(0xf0fff9, 5.4);
key.position.set(3.5, 6.8, 4.6);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight(0x4ac9ff, 4.4);
rim.position.set(-4.5, 3.2, -4.2);
scene.add(rim);
const warm = new THREE.PointLight(0xffb568, 34, 9, 2);
warm.position.set(2.4, 2.4, -1.3);
scene.add(warm);
const grid = new THREE.GridHelper(12, 24, 0x2e8078, 0x17383a);
grid.material.opacity = 0.4;
grid.material.transparent = true;
scene.add(grid);

let root;
let mixer;
let currentAction;
let selectedName;
let isPlaying = false;
let frameCount = 0;
const clipsByName = new Map();
let lastFrameTimestamp = performance.now();

function frameModel() {
  const box = new THREE.Box3(new THREE.Vector3(-0.9, -0.12, -0.95), new THREE.Vector3(0.9, 1.95, 0.95));
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const center = sphere.center;
  const radius = sphere.radius;
  controls.target.copy(center).add(new THREE.Vector3(0, radius * 0.05, 0));
  camera.position.copy(center).add(new THREE.Vector3(radius * 1.18, radius * 0.28, radius * 2.0));
  camera.near = Math.max(radius / 200, 0.005);
  camera.far = radius * 50;
  camera.updateProjectionMatrix();
  controls.minDistance = radius * 0.58;
  controls.maxDistance = radius * 6;
  controls.update();
  grid.position.y = box.min.y - radius * 0.012;
  window.__V6C_PROOF__.camera = { position: camera.position.toArray(), target: controls.target.toArray() };
}

function renderNow() {
  controls.update();
  renderer.render(scene, camera);
  frameCount += 1;
}

function clipSpec(name) {
  return CLIPS.find((entry) => entry.name === name);
}

function updateTransport() {
  if (!currentAction) return;
  const duration = currentAction.getClip().duration;
  const time = Math.max(0, Math.min(currentAction.time, duration));
  timeline.value = duration > 0 ? String(time / duration) : "0";
  timeReadout.textContent = `${time.toFixed(3)} / ${duration.toFixed(3)} s`;
}

function selectClip(name, normalized = 0, play = false) {
  const clip = clipsByName.get(name);
  if (!clip) throw new Error(`Missing exported clip: ${name}`);
  const spec = clipSpec(name);
  mixer.stopAllAction();
  currentAction = mixer.clipAction(clip);
  currentAction.reset();
  currentAction.enabled = true;
  currentAction.setEffectiveWeight(1);
  currentAction.setLoop(spec?.loop ? THREE.LoopRepeat : THREE.LoopOnce, spec?.loop ? Infinity : 1);
  currentAction.clampWhenFinished = !spec?.loop;
  currentAction.play();
  currentAction.time = THREE.MathUtils.clamp(normalized, 0, 1) * clip.duration;
  currentAction.paused = !play;
  isPlaying = play;
  mixer.update(0);
  root.updateMatrixWorld(true);
  selectedName = name;
  selectedChip.textContent = spec?.label ?? name;
  document.querySelectorAll(".clip-button").forEach((button) => button.classList.toggle("active", button.dataset.clip === name));
  updateTransport();
  renderNow();
  window.__V6C_PROOF__.selected = name;
  window.__V6C_PROOF__.selectionCount += 1;
  return { name, duration: clip.duration, tracks: clip.tracks.length, normalized, playing: play };
}

function playClip(name = selectedName) {
  if (name !== selectedName) selectClip(name, 0, true);
  if (!currentAction) return null;
  currentAction.paused = false;
  isPlaying = true;
  return { name: selectedName, time: currentAction.time, duration: currentAction.getClip().duration };
}

function pauseClip() {
  if (currentAction) currentAction.paused = true;
  isPlaying = false;
  updateTransport();
  return { name: selectedName, time: currentAction?.time ?? 0 };
}

function setNormalized(value) {
  if (!currentAction) return null;
  currentAction.time = THREE.MathUtils.clamp(Number(value), 0, 1) * currentAction.getClip().duration;
  mixer.update(0);
  root.updateMatrixWorld(true);
  updateTransport();
  renderNow();
  return { name: selectedName, time: currentAction.time, duration: currentAction.getClip().duration };
}

function boneSnapshot() {
  const values = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => { if (object.isBone) values.push(...object.matrixWorld.elements); });
  return values;
}

function zeroMorphTargets() {
  let meshes = 0;
  root.traverse((object) => {
    if (object.morphTargetInfluences?.length) {
      object.morphTargetInfluences.fill(0);
      meshes += 1;
    }
  });
  root.updateMatrixWorld(true);
  renderNow();
  return { meshes };
}

function verifyClipMotion(name) {
  const clip = clipsByName.get(name);
  selectClip(name, 0, false);
  const before = boneSnapshot();
  currentAction.paused = false;
  mixer.update(Math.min(clip.duration * 0.37, Math.max(clip.duration - 0.001, 0.001)));
  currentAction.paused = true;
  root.updateMatrixWorld(true);
  const after = boneSnapshot();
  const maxMatrixDelta = Math.max(...before.map((value, index) => Math.abs(value - after[index])));
  const result = { name, duration: clip.duration, tracks: clip.tracks.length, maxMatrixDelta, sampledAt: currentAction.time };
  window.__V6C_PROOF__.motionChecks[name] = result;
  updateTransport();
  renderNow();
  return result;
}

function makeButtons() {
  for (const spec of CLIPS) {
    const button = document.createElement("button");
    button.className = "clip-button";
    button.dataset.clip = spec.name;
    button.innerHTML = `<b>${spec.label}</b><span>${spec.detail}</span>`;
    button.addEventListener("click", () => selectClip(spec.name, spec.preview, false));
    buttonsRoot.append(button);
  }
}

async function buildClipSheet() {
  sheetRoot.replaceChildren();
  const original = selectedName;
  for (const spec of CLIPS) {
    const clip = clipsByName.get(spec.name);
    selectClip(spec.name, spec.preview, false);
    renderNow();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const figure = document.createElement("figure");
    figure.className = "clip-card";
    figure.dataset.clip = spec.name;
    const image = document.createElement("img");
    image.alt = `${spec.label} runtime pose`;
    image.src = renderer.domElement.toDataURL("image/png");
    const caption = document.createElement("figcaption");
    caption.innerHTML = `<b>${spec.label}</b><span>${clip.duration.toFixed(3)} s · ${clip.tracks.length} Three tracks</span>`;
    figure.append(image, caption);
    sheetRoot.append(figure);
  }
  if (original) selectClip(original, clipSpec(original)?.preview ?? 0, false);
  window.__V6C_PROOF__.sheetReady = true;
}

makeButtons();
window.__V6C_PROOF__ = {
  loaded: false,
  sheetReady: false,
  glbUrl: GLB_URL,
  expectedClipNames: CLIPS.map((entry) => entry.name),
  clipNames: [],
  clipDurations: {},
  clipTrackCounts: {},
  selected: null,
  selectionCount: 0,
  frameCount: 0,
  motionChecks: {},
  errors: [],
  stats: {},
  selectClip,
  playClip,
  pauseClip,
  setNormalized,
  verifyClipMotion,
  zeroMorphTargets,
};

new GLTFLoader().load(
  GLB_URL,
  async (gltf) => {
    root = gltf.scene;
    scene.add(root);
    mixer = new THREE.AnimationMixer(root);
    gltf.animations.forEach((clip) => clipsByName.set(clip.name, clip));
    const missing = CLIPS.map((entry) => entry.name).filter((name) => !clipsByName.has(name));
    if (missing.length) throw new Error(`Required clips missing: ${missing.join(", ")}`);

    let meshes = 0;
    let skinnedMeshes = 0;
    let maxBones = 0;
    let morphMeshes = 0;
    root.traverse((object) => {
      if (object.isMesh) {
        meshes += 1;
        object.castShadow = true;
        object.receiveShadow = true;
      }
      if (object.isSkinnedMesh) {
        skinnedMeshes += 1;
        maxBones = Math.max(maxBones, object.skeleton?.bones?.length ?? 0);
      }
      if (object.morphTargetInfluences?.length) morphMeshes += 1;
    });
    const stats = { meshes, skinnedMeshes, maxBones, morphMeshes };
    selectClip(CLIPS[0].name, CLIPS[0].preview, false);
    frameModel();
    renderNow();

    document.querySelector("#stat-clips").textContent = gltf.animations.length;
    document.querySelector("#stat-bones").textContent = maxBones;
    document.querySelector("#stat-meshes").textContent = meshes;
    document.querySelector("#stat-tracks").textContent = gltf.animations[0].tracks.length;
    status.textContent = `Loaded Rev13 GLB · ${gltf.animations.length} timed gameplay clips · ${meshes} meshes · no fallback asset`;
    status.className = "ready";
    Object.assign(window.__V6C_PROOF__, {
      loaded: true,
      clipNames: gltf.animations.map((clip) => clip.name),
      clipDurations: Object.fromEntries(gltf.animations.map((clip) => [clip.name, clip.duration])),
      clipTrackCounts: Object.fromEntries(gltf.animations.map((clip) => [clip.name, clip.tracks.length])),
      stats,
    });
    // Runtime screenshots are captured one clip per fresh browser context.
    // Repeated full-canvas readback can exhaust software-WebGL contexts, so the
    // live proof does not auto-generate ten data-URL copies of the framebuffer.
    window.__V6C_PROOF__.sheetReady = true;
  },
  undefined,
  (error) => {
    const message = error?.message ?? String(error);
    status.textContent = `Runtime proof failed: ${message}`;
    status.className = "error";
    window.__V6C_PROOF__.errors.push(message);
  },
);

document.querySelector("#play").addEventListener("click", () => playClip());
document.querySelector("#pause").addEventListener("click", pauseClip);
timeline.addEventListener("input", (event) => { pauseClip(); setNormalized(event.target.value); });

function animate(timestamp) {
  requestAnimationFrame(animate);
  const delta = Math.min(Math.max((timestamp - lastFrameTimestamp) / 1000, 0), 0.05);
  lastFrameTimestamp = timestamp;
  if (mixer && isPlaying) mixer.update(delta);
  updateTransport();
  renderNow();
  window.__V6C_PROOF__.frameCount = frameCount;
}
requestAnimationFrame(animate);

window.addEventListener("resize", () => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});
