import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const requestedOutput = process.argv[2]
  ?? 'evidence/2026-07-22/phase-6-g5-press-hall-material-export-v3-3/actual-loader-v1';
const outputDirectory = path.resolve(repoRoot, requestedOutput);
const evidenceRoot = path.resolve(repoRoot, 'evidence');
if (outputDirectory !== evidenceRoot && !outputDirectory.startsWith(`${evidenceRoot}${path.sep}`)) {
  throw new Error('OUTPUT_MUST_BE_WITHIN_EVIDENCE_ROOT');
}
try {
  await access(outputDirectory);
  throw new Error(`OUTPUT_ALREADY_EXISTS ${outputDirectory}`);
} catch (error) {
  if (error instanceof Error && error.message.startsWith('OUTPUT_ALREADY_EXISTS')) throw error;
}
await mkdir(outputDirectory, { recursive: true });

const assetRelativePath = 'assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/material-export-v3-3/export/inkfall_foundry_press_hall_material_export_v3_3.spatial-material-joined.glb';
const buildReportRelativePath = 'assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/material-export-v3-3/validation/press-hall-material-export-v3-3-build-report.json';
const manifestRelativePath = 'assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/material-export-v3-3/manifest.press-hall-material-export-v3-3.json';
const builderRelativePath = 'assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/build_press_hall_material_export_v3_3.py';
const captureScriptRelativePath = 'tools/evidence/capture-press-hall-material-export-v3-3.mjs';
const verifierScriptRelativePath = 'tools/evidence/verify-press-hall-material-export-v3-3.mjs';
const expectedAsset = {
  bytes: 13_301_752,
  sha256: '4ad11232074a794fd817114385f7256e286aefe810c76357a9b0103667874564',
  nodeCount: 29,
  meshCount: 29,
  primitiveCount: 29,
  triangleCount: 188_576,
  materialCount: 9,
};

const blenderRenders = {
  gameplay_lane: 'assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/material-export-v3-3/renders/inkfall-press-hall-v3-3-gameplay_lane-color.png',
  gameplay_north: 'assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/material-export-v3-3/renders/inkfall-press-hall-v3-3-gameplay_north-color.png',
  gameplay_south: 'assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/material-export-v3-3/renders/inkfall-press-hall-v3-3-gameplay_south-color.png',
  overhead_context: 'assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/material-export-v3-3/renders/inkfall-press-hall-v3-3-overhead_context-color.png',
};

// Values are read from the frozen v3.2 Blender camera objects. The harness applies
// Blender Z-up to glTF Y-up conversion: (x, y, z) -> (x, z, -y).
const cameraSpecs = {
  gameplay_lane: {
    position: [-15.800000190734863, -0.800000011920929, 1.7200000286102295],
    forward: [0.9971083998680115, 0.050486430525779724, 0.05679736286401749],
    up: [-0.05672469735145569, -0.002872153650969267, 0.9983857274055481],
    lens: 31,
  },
  gameplay_north: {
    position: [-11.800000190734863, -1.2999999523162842, 1.7200000286102295],
    forward: [0.8302736282348633, 0.5523431301116943, 0.0745839923620224],
    up: [-0.062098097056150436, -0.04131099209189415, 0.9972147345542908],
    lens: 38,
  },
  gameplay_south: {
    position: [11.800000190734863, 1, 1.7200000286102295],
    forward: [-0.8205806612968445, -0.5667571425437927, 0.07371342182159424],
    up: [0.06065276265144348, 0.04189165681600571, 0.9972794651985168],
    lens: 38,
  },
  overhead_context: {
    position: [-14, -6.5, 6.349999904632568],
    forward: [0.8825082778930664, 0.390825092792511, -0.26160064339637756],
    up: [0.2391943782567978, 0.10592897236347198, 0.9651762247085571],
    lens: 35,
  },
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(`CAPTURE_ASSERTION_FAILED ${message}`);
}

async function fingerprint(relativePath) {
  const bytes = await readFile(path.join(repoRoot, relativePath));
  return { bytes: bytes.byteLength, sha256: sha256(bytes) };
}

const assetBytes = await readFile(path.join(repoRoot, assetRelativePath));
const buildReport = JSON.parse(await readFile(path.join(repoRoot, buildReportRelativePath), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(repoRoot, manifestRelativePath), 'utf8'));
assert(assetBytes.byteLength === expectedAsset.bytes, 'canonical asset byte count');
assert(sha256(assetBytes) === expectedAsset.sha256, 'canonical asset SHA-256');
assert(buildReport.status === 'BOUNDED_PRESS_HALL_V3_3_EXPLICIT_MATERIAL_EXPORT_BUILD_PASS_PENDING_ACTUAL_LOADER_REVIEW', 'build report status');
assert(Object.values(buildReport.checks).every(Boolean), 'all asset build checks');
assert(buildReport.glbAudit.sha256 === expectedAsset.sha256, 'build report asset binding');
assert(manifest.export?.sha256 === expectedAsset.sha256, 'manifest asset binding');

const vendorFiles = new Map([
  ['/vendor/three.module.js', {
    path: path.join(repoRoot, 'node_modules/three/build/three.module.js'),
    type: 'text/javascript; charset=utf-8',
  }],
  ['/vendor/three.core.js', {
    path: path.join(repoRoot, 'node_modules/three/build/three.core.js'),
    type: 'text/javascript; charset=utf-8',
  }],
  ['/vendor/GLTFLoader.js', {
    path: path.join(repoRoot, 'node_modules/three/examples/jsm/loaders/GLTFLoader.js'),
    type: 'text/javascript; charset=utf-8',
  }],
  ['/vendor/RoomEnvironment.js', {
    path: path.join(repoRoot, 'node_modules/three/examples/jsm/environments/RoomEnvironment.js'),
    type: 'text/javascript; charset=utf-8',
  }],
  ['/utils/BufferGeometryUtils.js', {
    path: path.join(repoRoot, 'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'),
    type: 'text/javascript; charset=utf-8',
  }],
  ['/utils/SkeletonUtils.js', {
    path: path.join(repoRoot, 'node_modules/three/examples/jsm/utils/SkeletonUtils.js'),
    type: 'text/javascript; charset=utf-8',
  }],
]);

const harnessHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Press Hall v3.3 exact GLTFLoader harness</title>
  <style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#05080b;color:#e9f4f5;font:13px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace}
    body{display:grid;place-items:center}
    #frame{position:relative;width:960px;height:540px;background:#05080b;box-shadow:0 0 0 1px #31454c}
    canvas{display:block;width:960px;height:540px}
    #label{position:absolute;left:14px;top:12px;padding:7px 10px;background:rgba(3,8,10,.78);border:1px solid rgba(165,232,230,.42);letter-spacing:.06em;text-transform:uppercase;pointer-events:none}
    #status{position:absolute;right:14px;bottom:12px;padding:6px 9px;background:rgba(3,8,10,.78);border:1px solid rgba(255,147,116,.38);color:#bcefed;pointer-events:none}
  </style>
  <script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script>
</head>
<body data-status="loading">
  <div id="frame"><div id="label">loading exact GLB</div><div id="status">asset-only • G5/G8 open</div></div>
  <script type="module">
    import * as THREE from 'three';
    import { GLTFLoader } from '/vendor/GLTFLoader.js';
    import { RoomEnvironment } from '/vendor/RoomEnvironment.js';

    const expectedSha256 = ${JSON.stringify(expectedAsset.sha256)};
    const cameraSpecs = ${JSON.stringify(cameraSpecs)};
    const frame = document.querySelector('#frame');
    const label = document.querySelector('#label');
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.setSize(960, 540, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    frame.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080b);
    const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.05, 200);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environmentScene = new RoomEnvironment();
    const environmentTarget = pmrem.fromScene(environmentScene, 0.04);
    scene.environment = environmentTarget.texture;
    environmentScene.dispose();
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xc7ecf2, 0x160d0a, 1.25));
    const key = new THREE.DirectionalLight(0xffe0bd, 3.4);
    key.position.set(-7, 12, 7);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9ae7ed, 2.1);
    fill.position.set(10, 8, -9);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xff8a68, 1.05);
    rim.position.set(2, 5, 13);
    scene.add(rim);

    function convertBlenderVector([x, y, z]) {
      return [x, z, -y];
    }

    function verticalFovDegrees(lens) {
      return THREE.MathUtils.radToDeg(2 * Math.atan(36 / (2 * lens * (16 / 9))));
    }

    async function browserSha256(arrayBuffer) {
      const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    const loadStartedAt = performance.now();
    const response = await fetch('/asset.glb', { cache: 'no-store' });
    if (!response.ok) throw new Error('ASSET_FETCH_' + response.status);
    const arrayBuffer = await response.arrayBuffer();
    const browserHash = await browserSha256(arrayBuffer);
    if (browserHash !== expectedSha256) throw new Error('ASSET_HASH_MISMATCH_' + browserHash);
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => loader.parse(arrayBuffer, '/', resolve, reject));
    const loadDurationMs = performance.now() - loadStartedAt;
    scene.add(gltf.scene);
    gltf.scene.updateMatrixWorld(true);

    const meshes = [];
    const uniqueMaterials = new Map();
    let geometryTriangleCount = 0;
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      meshes.push(object);
      const position = object.geometry.getAttribute('position');
      geometryTriangleCount += object.geometry.index
        ? object.geometry.index.count / 3
        : (position?.count ?? 0) / 3;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) uniqueMaterials.set(material.uuid, material);
    });
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const materials = [...uniqueMaterials.values()].map((material) => ({
      name: material.name,
      type: material.type,
      colorLinear: material.color ? material.color.toArray() : null,
      metalness: material.metalness ?? null,
      roughness: material.roughness ?? null,
      emissiveLinear: material.emissive ? material.emissive.toArray() : null,
      emissiveIntensity: material.emissiveIntensity ?? null,
      map: Boolean(material.map),
    })).sort((a, b) => a.name.localeCompare(b.name));

    let currentView = null;
    let lastRendererInfo = null;
    function selectView(viewId) {
      const spec = cameraSpecs[viewId];
      if (!spec) throw new Error('UNKNOWN_VIEW_' + viewId);
      const position = new THREE.Vector3(...convertBlenderVector(spec.position));
      const forward = new THREE.Vector3(...convertBlenderVector(spec.forward)).normalize();
      const up = new THREE.Vector3(...convertBlenderVector(spec.up)).normalize();
      camera.position.copy(position);
      camera.up.copy(up);
      camera.fov = verticalFovDegrees(spec.lens);
      camera.aspect = 16 / 9;
      camera.near = 0.05;
      camera.far = 200;
      camera.updateProjectionMatrix();
      camera.lookAt(position.clone().addScaledVector(forward, 20));
      renderer.info.reset();
      renderer.render(scene, camera);
      currentView = viewId;
      lastRendererInfo = {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        points: renderer.info.render.points,
        lines: renderer.info.render.lines,
      };
      label.textContent = viewId.replaceAll('_', ' ') + ' • actual GLTFLoader';
      return { viewId, renderer: lastRendererInfo };
    }

    selectView('gameplay_lane');
    const state = {
      status: 'PRESS_HALL_V3_3_EXACT_GLTFLOADER_READY_ASSET_ONLY_G5_G8_OPEN',
      loader: 'THREE.GLTFLoader.parse(ArrayBuffer)',
      browserAsset: { bytes: arrayBuffer.byteLength, sha256: browserHash },
      loadDurationMs,
      scene: {
        meshCount: meshes.length,
        geometryTriangleCount,
        materialCount: materials.length,
        bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      },
      materials,
      productIntegrated: false,
      shippingDefaultChanged: false,
      g5Passed: false,
      g8Passed: false,
    };
    const surface = Object.freeze({
      getSnapshot: () => structuredClone({ ...state, currentView, renderer: lastRendererInfo }),
      selectView,
    });
    Object.defineProperty(window, '__PRESS_HALL_V33_EXACT_LOADER__', {
      value: surface,
      writable: false,
      configurable: false,
      enumerable: false,
    });
    document.body.dataset.status = 'ready';
  </script>
</body>
</html>`;

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/' || pathname === '/harness') {
      const bytes = Buffer.from(harnessHtml);
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': String(bytes.byteLength),
        'content-type': 'text/html; charset=utf-8',
      });
      response.end(bytes);
      return;
    }
    if (pathname === '/asset.glb') {
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': String(assetBytes.byteLength),
        'content-type': 'model/gltf-binary',
      });
      response.end(assetBytes);
      return;
    }
    const vendor = vendorFiles.get(pathname);
    if (vendor) {
      const bytes = readFileSync(vendor.path);
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': String(bytes.byteLength),
        'content-type': vendor.type,
      });
      response.end(bytes);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.stack : String(error));
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('LOCAL_SERVER_ADDRESS_MISSING');
const origin = `http://127.0.0.1:${address.port}`;

async function dataUrl(absolutePath) {
  const extension = path.extname(absolutePath).toLowerCase();
  const mime = extension === '.png' ? 'image/png' : 'application/octet-stream';
  return `data:${mime};base64,${(await readFile(absolutePath)).toString('base64')}`;
}

async function renderRuntimeBoard(context, screenshots, outputPath) {
  const board = await context.newPage();
  await board.setViewportSize({ width: 1_920, height: 1_080 });
  const panels = [];
  for (const viewId of Object.keys(cameraSpecs)) {
    panels.push(`<section><img src="${await dataUrl(screenshots[viewId])}"><div class="label">${viewId.replaceAll('_', ' ')} • actual GLTFLoader</div><div class="foot">exact SHA 4ad11232…4564 • asset-only • G5/G8 open</div></section>`);
  }
  await board.setContent(`<!doctype html><style>
    html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#05080b;color:#eff9fa;font:15px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace}
    main{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;width:1920px;height:1080px}
    section{position:relative;overflow:hidden;box-shadow:inset 0 0 0 2px #101a1f}
    img{display:block;width:100%;height:100%;object-fit:cover}
    .label,.foot{position:absolute;background:rgba(3,8,10,.82);border:1px solid rgba(170,235,234,.45);padding:7px 10px;text-transform:uppercase;letter-spacing:.045em}
    .label{left:12px;top:12px}.foot{right:12px;bottom:12px;color:#bcefed;border-color:rgba(255,147,116,.42);font-size:12px}
  </style><main>${panels.join('')}</main>`, { waitUntil: 'load' });
  await board.screenshot({ path: outputPath });
  await board.close();
}

async function renderComparisonBoard(context, screenshots, outputPath) {
  const board = await context.newPage();
  await board.setViewportSize({ width: 1_920, height: 1_080 });
  const panels = [];
  for (const viewId of Object.keys(cameraSpecs)) {
    const blender = await dataUrl(path.join(repoRoot, blenderRenders[viewId]));
    const loader = await dataUrl(screenshots[viewId]);
    panels.push(`<section><h2>${viewId.replaceAll('_', ' ')}</h2><div class="pair"><figure><img src="${blender}"><figcaption>Blender v3.3 authoring render</figcaption></figure><figure><img src="${loader}"><figcaption>Three.js GLTFLoader • exact GLB</figcaption></figure></div><p>Unsupported procedural pitting is intentionally flattened. Product integration and gate acceptance are not claimed.</p></section>`);
  }
  await board.setContent(`<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#071015;color:#eef8f8;font-family:Inter,Segoe UI,sans-serif}
    main{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;width:1920px;height:1080px}
    section{padding:14px 16px;background:linear-gradient(145deg,#09151b,#05090d);border:1px solid #29414a;overflow:hidden}
    h2{height:28px;margin:0 0 10px;color:#bdf1ef;font:700 17px/28px ui-monospace,SFMono-Regular,Consolas,monospace;text-transform:uppercase;letter-spacing:.08em}
    .pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}figure{margin:0;background:#020507;border:1px solid #3a535b}
    img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}figcaption{height:34px;padding:8px 9px;color:#d9e7e9;font:12px/18px ui-monospace,SFMono-Regular,Consolas,monospace;text-transform:uppercase}
    p{margin:12px 0 0;color:#9fb3b8;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
  </style><main>${panels.join('')}</main>`, { waitUntil: 'load' });
  await board.screenshot({ path: outputPath });
  await board.close();
}

async function imageStats(context, absolutePath) {
  const page = await context.newPage();
  await page.setContent(`<img id="image" src="${await dataUrl(absolutePath)}">`, { waitUntil: 'load' });
  const stats = await page.evaluate(() => {
    const image = document.querySelector('#image');
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context2d = canvas.getContext('2d', { willReadFrequently: true });
    context2d.drawImage(image, 0, 0);
    const pixels = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let white = 0;
    let black = 0;
    let colorful = 0;
    const count = pixels.length / 4;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      red += r;
      green += g;
      blue += b;
      if (r >= 242 && g >= 242 && b >= 242) white += 1;
      if (r <= 15 && g <= 15 && b <= 15) black += 1;
      if (Math.max(r, g, b) - Math.min(r, g, b) >= 18) colorful += 1;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      meanRgbSrgb: [red / count / 255, green / count / 255, blue / count / 255],
      nearWhiteFraction: white / count,
      nearBlackFraction: black / count,
      colorfulFraction: colorful / count,
    };
  });
  await page.close();
  return Object.fromEntries(Object.entries(stats).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.map((item) => Number(item.toFixed(6)))
      : typeof value === 'number' ? Number(value.toFixed(6)) : value,
  ]));
}

let browser;
let context;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
  });
  context = await browser.newContext({
    viewport: { width: 1_100, height: 680 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const browserDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    requestedUrls: [],
    responses: [],
  };
  page.on('console', (message) => {
    if (message.type() === 'error') browserDiagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserDiagnostics.pageErrors.push(error.message));
  page.on('request', (request) => browserDiagnostics.requestedUrls.push(request.url()));
  page.on('requestfailed', (request) => browserDiagnostics.failedRequests.push(
    `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
  ));
  page.on('response', (response) => {
    if (response.status() >= 400) browserDiagnostics.httpErrors.push(`${response.status()} ${response.url()}`);
    browserDiagnostics.responses.push({
      url: response.url(),
      status: response.status(),
      contentLength: response.headers()['content-length'] ?? null,
      contentType: response.headers()['content-type'] ?? null,
    });
  });

  const response = await page.goto(`${origin}/harness`, { waitUntil: 'networkidle', timeout: 45_000 });
  assert(response?.ok(), `harness response ${response?.status()}`);
  try {
    await page.locator('body[data-status="ready"]').waitFor({ timeout: 90_000 });
  } catch (error) {
    throw new Error(`HARNESS_READY_TIMEOUT ${JSON.stringify(browserDiagnostics)} ${error instanceof Error ? error.message : String(error)}`);
  }
  const descriptor = await page.evaluate(() => {
    const value = Object.getOwnPropertyDescriptor(window, '__PRESS_HALL_V33_EXACT_LOADER__');
    return value ? { writable: value.writable, configurable: value.configurable } : null;
  });
  const initialSnapshot = await page.evaluate(() => window.__PRESS_HALL_V33_EXACT_LOADER__.getSnapshot());
  assert(initialSnapshot.status === 'PRESS_HALL_V3_3_EXACT_GLTFLOADER_READY_ASSET_ONLY_G5_G8_OPEN', 'loader harness status');
  assert(initialSnapshot.loader === 'THREE.GLTFLoader.parse(ArrayBuffer)', 'actual loader identity');
  assert(initialSnapshot.browserAsset.bytes === expectedAsset.bytes, 'browser asset bytes');
  assert(initialSnapshot.browserAsset.sha256 === expectedAsset.sha256, 'browser WebCrypto asset hash');
  assert(initialSnapshot.scene.meshCount === expectedAsset.meshCount, 'loaded mesh count');
  assert(initialSnapshot.scene.geometryTriangleCount === expectedAsset.triangleCount, 'loaded triangle count');
  assert(initialSnapshot.scene.materialCount === expectedAsset.materialCount, 'loaded material count');
  assert(descriptor?.writable === false && descriptor?.configurable === false, 'immutable evidence surface');

  const expectedMaterials = [...buildReport.glbAudit.materials].sort((a, b) => a.name.localeCompare(b.name));
  assert(initialSnapshot.materials.map((material) => material.name).join('|') === expectedMaterials.map((material) => material.name).join('|'), 'loaded material names');
  const materialComparisons = expectedMaterials.map((expected, index) => {
    const actual = initialSnapshot.materials[index];
    const baseColorDelta = Math.max(...expected.baseColorFactor.slice(0, 3).map(
      (value, component) => Math.abs(value - actual.colorLinear[component]),
    ));
    return {
      name: expected.name,
      expectedBaseColorLinear: expected.baseColorFactor.slice(0, 3),
      actualBaseColorLinear: actual.colorLinear,
      maximumBaseColorDelta: baseColorDelta,
      expectedMetalness: expected.metallicFactor,
      actualMetalness: actual.metalness,
      expectedRoughness: expected.roughnessFactor,
      actualRoughness: actual.roughness,
      hasBaseColorMap: actual.map,
    };
  });
  assert(materialComparisons.every((entry) => entry.maximumBaseColorDelta <= 1e-6), 'loaded base colors match glTF');
  assert(materialComparisons.every((entry) => Math.abs(entry.expectedMetalness - entry.actualMetalness) <= 1e-6), 'loaded metalness values');
  assert(materialComparisons.every((entry) => Math.abs(entry.expectedRoughness - entry.actualRoughness) <= 1e-6), 'loaded roughness values');
  const whiteMaterialCount = initialSnapshot.materials.filter((material) => material.colorLinear.every((value) => value >= 0.9)).length;
  assert(whiteMaterialCount === 0, 'no instantiated white fallback materials');

  const screenshots = {};
  const viewRuntime = {};
  for (const viewId of Object.keys(cameraSpecs)) {
    viewRuntime[viewId] = await page.evaluate((id) => window.__PRESS_HALL_V33_EXACT_LOADER__.selectView(id), viewId);
    await page.waitForTimeout(180);
    const screenshotPath = path.join(outputDirectory, `actual-loader-${viewId}.png`);
    await page.locator('canvas').screenshot({ path: screenshotPath });
    screenshots[viewId] = screenshotPath;
    assert(viewRuntime[viewId].renderer.calls > 0, `${viewId} renderer calls`);
    assert(viewRuntime[viewId].renderer.triangles > 0, `${viewId} renderer triangles`);
  }

  const runtimeBoardPath = path.join(outputDirectory, 'actual-loader-four-view-board.png');
  const comparisonBoardPath = path.join(outputDirectory, 'blender-vs-actual-loader-four-view-comparison.png');
  await renderRuntimeBoard(context, screenshots, runtimeBoardPath);
  await renderComparisonBoard(context, screenshots, comparisonBoardPath);

  const screenshotEvidence = {};
  for (const [viewId, absolutePath] of Object.entries(screenshots)) {
    const bytes = await readFile(absolutePath);
    const stats = await imageStats(context, absolutePath);
    assert(bytes.byteLength > 40_000, `${viewId} screenshot payload`);
    assert(stats.nearWhiteFraction < 0.72, `${viewId} not majority white fallback`);
    assert(stats.nearBlackFraction < 0.86, `${viewId} not blank black`);
    assert(stats.colorfulFraction > 0.002, `${viewId} visible material color`);
    screenshotEvidence[viewId] = {
      path: path.relative(repoRoot, absolutePath).replaceAll('\\', '/'),
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      stats,
      camera: cameraSpecs[viewId],
      runtime: viewRuntime[viewId],
    };
  }

  const boardEvidence = {};
  for (const [id, absolutePath] of Object.entries({
    actualLoaderFourView: runtimeBoardPath,
    blenderVsActualLoader: comparisonBoardPath,
  })) {
    const bytes = await readFile(absolutePath);
    boardEvidence[id] = {
      path: path.relative(repoRoot, absolutePath).replaceAll('\\', '/'),
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      resolution: [1_920, 1_080],
    };
  }

  const assetRequests = browserDiagnostics.requestedUrls.filter((url) => new URL(url).pathname === '/asset.glb');
  const externalRequests = browserDiagnostics.requestedUrls.filter((url) => {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin !== origin;
  });
  assert(assetRequests.length === 1, 'one exact asset request');
  assert(externalRequests.length === 0, 'no external requests');
  assert(browserDiagnostics.consoleErrors.length === 0, 'browser console errors');
  assert(browserDiagnostics.pageErrors.length === 0, 'browser page errors');
  assert(browserDiagnostics.failedRequests.length === 0, 'browser failed requests');
  assert(browserDiagnostics.httpErrors.length === 0, 'browser HTTP errors');

  const sourcePaths = [
    assetRelativePath,
    buildReportRelativePath,
    manifestRelativePath,
    builderRelativePath,
    captureScriptRelativePath,
    verifierScriptRelativePath,
    ...Object.values(blenderRenders),
  ];
  const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async (relativePath) => (
    [relativePath, await fingerprint(relativePath)]
  ))));
  const threePackage = JSON.parse(await readFile(path.join(repoRoot, 'node_modules/three/package.json'), 'utf8'));
  const capture = {
    schemaVersion: 1,
    status: 'PRESS_HALL_V3_3_ACTUAL_GLTFLOADER_CAPTURE_PASS_ASSET_ONLY_G5_G8_OPEN',
    capturedAt: new Date().toISOString(),
    scope: 'PRESS_HALL_V3_3_EXPLICIT_MATERIAL_EXPORT_ACTUAL_LOADER_COMPARISON_ONLY',
    outputDirectory: path.relative(repoRoot, outputDirectory).replaceAll('\\', '/'),
    asset: {
      path: assetRelativePath,
      ...expectedAsset,
      generator: buildReport.glbAudit.asset.generator,
      explicitBaseColorFactorCount: buildReport.glbAudit.explicitBaseColorFactorCount,
      baseColorTextureReferenceCount: buildReport.glbAudit.baseColorTextureReferenceCount,
      imageCount: buildReport.glbAudit.imageCount,
    },
    harness: {
      origin,
      loader: initialSnapshot.loader,
      threeVersion: threePackage.version,
      browserAsset: initialSnapshot.browserAsset,
      loadDurationMs: initialSnapshot.loadDurationMs,
      scene: initialSnapshot.scene,
      evidenceSurfaceDescriptor: descriptor,
      softwareRendererRequested: true,
      browserVersion: browser.version(),
      host: {
        machineName: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
      },
    },
    materialAudit: {
      explicitFamilyCount: expectedMaterials.length,
      instantiatedMaterialCount: initialSnapshot.materials.length,
      instantiatedWhiteFallbackMaterialCount: whiteMaterialCount,
      exactBaseColorMatch: materialComparisons.every((entry) => entry.maximumBaseColorDelta <= 1e-6),
      comparisons: materialComparisons,
      loaded: initialSnapshot.materials,
    },
    network: {
      requestCount: browserDiagnostics.requestedUrls.length,
      assetRequestCount: assetRequests.length,
      externalRequests,
      responses: browserDiagnostics.responses,
    },
    browserDiagnostics,
    screenshots: screenshotEvidence,
    boards: boardEvidence,
    blenderComparisonSource: Object.fromEntries(Object.entries(blenderRenders).map(([viewId, relativePath]) => [
      viewId,
      { path: relativePath, diagnosticsVsFrozenV32: buildReport.imageDiagnosticsVsFrozenV32[viewId] },
    ])),
    sources,
    assessment: {
      exactAssetShaThroughActualGltfLoader: 'PASS',
      instantiatedMaterialValuesMatchGltf: 'PASS',
      whiteFallbackRegression: 'PASS_IN_ISOLATED_ASSET_HARNESS',
      fourViewRuntimeCapture: 'PASS',
      directBlenderComparisonBoard: 'PROVIDED_PENDING_HUMAN_ACCEPTANCE',
      productIntegration: 'NOT_PERFORMED',
      shippingDefault: 'UNCHANGED',
      runtimePerformance: 'NOT_PROFILED_FOR_GATE',
      collisionNoSnag: 'NOT_PROVEN',
      humanVisualAcceptance: 'NOT_PERFORMED',
      humanPlaytestAcceptance: 'NOT_PERFORMED',
      g5: 'OPEN',
      g8: 'OPEN',
    },
    nonClaims: [
      'G5_NOT_PASSED',
      'G8_NOT_PASSED',
      'FINAL_ART_NOT_ACCEPTED',
      'NOT_PRODUCT_INTEGRATED',
      'NOT_SHIPPING_DEFAULT',
      'NO_RUNTIME_PERFORMANCE_GATE_CLAIM',
      'NO_COLLISION_NO_SNAG_CLAIM',
      'HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED',
      'HUMAN_PLAYTEST_ACCEPTANCE_NOT_PASSED',
      'NO_DEPLOYMENT_OR_PUBLISHING',
    ],
  };
  await writeFile(path.join(outputDirectory, 'capture.json'), `${JSON.stringify(capture, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({
    status: capture.status,
    outputDirectory,
    asset: capture.asset,
    harness: capture.harness,
    materialAudit: {
      explicitFamilyCount: capture.materialAudit.explicitFamilyCount,
      instantiatedMaterialCount: capture.materialAudit.instantiatedMaterialCount,
      instantiatedWhiteFallbackMaterialCount: capture.materialAudit.instantiatedWhiteFallbackMaterialCount,
      exactBaseColorMatch: capture.materialAudit.exactBaseColorMatch,
    },
    screenshots: capture.screenshots,
    boards: capture.boards,
    assessment: capture.assessment,
  }, null, 2)}\n`);
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}
