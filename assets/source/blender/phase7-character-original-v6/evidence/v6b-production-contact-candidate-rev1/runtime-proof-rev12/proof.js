import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const GLB_URL = "/assets/source/blender/phase7-character-original-v6/model/v6b-production-contact-candidate-rev1/export/kyx-v6b-production-contact-candidate-rev1.runtime-candidate-rev12.glb";
const POSES = [
  ["V6B_DIAG_BIND_REST_HOLD_NOT_G6", "Bind / rest", "Neutral deformation sentinel"],
  ["V6B_DIAG_ACCEPTED_CONTACT_HOLD_NOT_G6", "Accepted contact", "Sealed rifle-contact pose"],
  ["V6B_DIAG_FIRING_SHOULDER_EXTREME_HOLD_NOT_G6", "Firing shoulder", "Shoulder stress sentinel"],
  ["V6B_DIAG_TRIGGER_WRIST_DIGIT_EXTREME_HOLD_NOT_G6", "Trigger / wrist / digits", "Right-hand articulation sentinel"],
  ["V6B_DIAG_SUPPORT_HAND_EXTREME_HOLD_NOT_G6", "Support hand", "Foregrip contact sentinel"],
  ["V6B_DIAG_LOCOMOTION_LEG_BEND_HOLD_NOT_G6", "Leg bend", "Lower-body deformation sentinel"],
];

const canvas = document.querySelector("#viewport");
const status = document.querySelector("#load-status");
const selectedChip = document.querySelector("#selected-chip");
const buttonsRoot = document.querySelector("#pose-buttons");
const sheetRoot = document.querySelector("#pose-sheet");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.34;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x081316);
scene.fog = new THREE.FogExp2(0x081316, 0.095);
const camera = new THREE.PerspectiveCamera(32, canvas.clientWidth / canvas.clientHeight, 0.01, 1000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minPolarAngle = Math.PI * 0.18;
controls.maxPolarAngle = Math.PI * 0.78;

scene.add(new THREE.HemisphereLight(0xcdfaf2, 0x17222c, 2.2));
scene.add(new THREE.AmbientLight(0xc8dfdc, 1.15));
const key = new THREE.DirectionalLight(0xe8fff9, 5.2);
key.position.set(3.5, 6.5, 4.5);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight(0x52d5ff, 4.2);
rim.position.set(-4, 3, -4);
scene.add(rim);
const warm = new THREE.PointLight(0xffb76c, 32, 9, 2);
warm.position.set(2.5, 2.2, -1.2);
scene.add(warm);

const grid = new THREE.GridHelper(12, 24, 0x2d817b, 0x17383a);
grid.material.opacity = 0.42;
grid.material.transparent = true;
scene.add(grid);

let root;
let mixer;
let clipsByName = new Map();
let selectedName = null;
let frameCount = 0;
let modelStats = {};

function frameModel(object) {
  object.updateMatrixWorld(true);
  // Use the audited human-scale envelope. Conservative Three geometry bounds
  // include every corrective morph extreme simultaneously, even inactive ones,
  // and therefore are not valid camera framing data for this diagnostic GLB.
  const box = new THREE.Box3(
    new THREE.Vector3(-0.85, -0.12, -0.9),
    new THREE.Vector3(0.85, 1.92, 0.9),
  );
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const center = sphere.center.clone();
  const radius = Math.max(sphere.radius, 0.35);
  controls.target.copy(center).add(new THREE.Vector3(0, radius * 0.06, 0));
  camera.position.copy(center).add(new THREE.Vector3(radius * 1.25, radius * 0.28, radius * 2.0));
  camera.near = Math.max(radius / 200, 0.005);
  camera.far = radius * 50;
  camera.updateProjectionMatrix();
  controls.minDistance = radius * 0.6;
  controls.maxDistance = radius * 6;
  controls.update();
  grid.position.y = box.min.y - radius * 0.012;
  window.__V6B_PROOF__.bounds = {
    min: box.min.toArray(),
    max: box.max.toArray(),
    center: center.toArray(),
    radius,
    camera: camera.position.toArray(),
    target: controls.target.toArray(),
    near: camera.near,
    far: camera.far,
  };
}

function renderNow() {
  controls.update();
  renderer.render(scene, camera);
  frameCount += 1;
}

function selectClip(name) {
  const clip = clipsByName.get(name);
  if (!clip) throw new Error(`Missing exported clip: ${name}`);
  mixer.stopAllAction();
  const action = mixer.clipAction(clip);
  action.reset();
  action.enabled = true;
  action.setEffectiveWeight(1);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  action.time = Math.min(clip.duration * 0.5, clip.duration);
  action.paused = true;
  mixer.update(0);
  root.updateMatrixWorld(true);
  selectedName = name;
  const pose = POSES.find(([clipName]) => clipName === name);
  selectedChip.textContent = pose?.[1] ?? name;
  document.querySelectorAll(".pose-button").forEach((button) => button.classList.toggle("active", button.dataset.clip === name));
  renderNow();
  window.__V6B_PROOF__.selected = name;
  window.__V6B_PROOF__.selectionCount += 1;
  return { name, duration: clip.duration, tracks: clip.tracks.length };
}

function makeButtons() {
  for (const [name, label, detail] of POSES) {
    const button = document.createElement("button");
    button.className = "pose-button";
    button.dataset.clip = name;
    button.innerHTML = `<b>${label}</b><span>${detail}</span>`;
    button.addEventListener("click", () => selectClip(name));
    buttonsRoot.append(button);
  }
}

async function buildPoseSheet() {
  sheetRoot.replaceChildren();
  const original = selectedName;
  for (const [name, label, detail] of POSES) {
    selectClip(name);
    renderNow();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const figure = document.createElement("figure");
    figure.className = "pose-card";
    figure.dataset.clip = name;
    const img = document.createElement("img");
    img.alt = `${label} GLB diagnostic pose`;
    img.src = renderer.domElement.toDataURL("image/png");
    const caption = document.createElement("figcaption");
    caption.innerHTML = `<b>${label}</b><span>${detail} · 164 glTF channels / 169 Three tracks</span>`;
    figure.append(img, caption);
    sheetRoot.append(figure);
  }
  if (original) selectClip(original);
  window.__V6B_PROOF__.sheetReady = true;
}

makeButtons();
window.__V6B_PROOF__ = {
  loaded: false,
  sheetReady: false,
  glbUrl: GLB_URL,
  expectedClipNames: POSES.map(([name]) => name),
  clipNames: [],
  selected: null,
  selectionCount: 0,
  frameCount: 0,
  errors: [],
  stats: {},
  selectClip,
};

new GLTFLoader().load(
  GLB_URL,
  async (gltf) => {
    root = gltf.scene;
    scene.add(root);
    mixer = new THREE.AnimationMixer(root);
    clipsByName = new Map(gltf.animations.map((clip) => [clip.name, clip]));
    const missing = POSES.map(([name]) => name).filter((name) => !clipsByName.has(name));
    if (missing.length) throw new Error(`Required clips missing: ${missing.join(", ")}`);

    let meshes = 0;
    let skinnedMeshes = 0;
    let maxBones = 0;
    let materials = 0;
    let morphMeshes = 0;
    root.traverse((object) => {
      if (object.isMesh) {
        meshes += 1;
        object.castShadow = true;
        object.receiveShadow = true;
        materials += Array.isArray(object.material) ? object.material.length : (object.material ? 1 : 0);
      }
      if (object.isSkinnedMesh) {
        skinnedMeshes += 1;
        maxBones = Math.max(maxBones, object.skeleton?.bones?.length ?? 0);
      }
      if (object.morphTargetInfluences?.length) morphMeshes += 1;
    });
    modelStats = { meshes, skinnedMeshes, maxBones, materials, morphMeshes };
    const first = POSES[0][0];
    selectClip(first);
    // Frame only after the first exported action has replaced the GLB's
    // authoring-time morph defaults. Those defaults are not a runtime pose.
    frameModel(root);
    renderNow();

    document.querySelector("#stat-clips").textContent = gltf.animations.length;
    document.querySelector("#stat-channels").textContent = clipsByName.get(first).tracks.length;
    document.querySelector("#stat-bones").textContent = maxBones;
    document.querySelector("#stat-meshes").textContent = meshes;
    status.textContent = `Loaded Rev12 GLB · ${gltf.animations.length} named held clips · ${meshes} meshes · no fallback asset`;
    status.className = "ready";
    window.__V6B_PROOF__.loaded = true;
    window.__V6B_PROOF__.clipNames = gltf.animations.map((clip) => clip.name);
    window.__V6B_PROOF__.clipTrackCounts = Object.fromEntries(gltf.animations.map((clip) => [clip.name, clip.tracks.length]));
    window.__V6B_PROOF__.clipTrackNames = Object.fromEntries(gltf.animations.map((clip) => [clip.name, clip.tracks.map((track) => track.name)]));
    window.__V6B_PROOF__.stats = modelStats;
    await buildPoseSheet();
  },
  undefined,
  (error) => {
    const message = error?.message ?? String(error);
    status.textContent = `Runtime proof failed: ${message}`;
    status.className = "error";
    window.__V6B_PROOF__.errors.push(message);
  },
);

function animate() {
  requestAnimationFrame(animate);
  renderNow();
  window.__V6B_PROOF__.frameCount = frameCount;
}
animate();

window.addEventListener("resize", () => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});
