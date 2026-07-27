import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import revision3RenderArtifactUrl from '../../assets/source/maps/inkfall-foundry/revisions/revision-3/export/render.graybox.glb?url';
import revision3CollisionArtifactUrl from '../../assets/source/maps/inkfall-foundry/revisions/revision-3/export/collision.authority.glb?url';

import { INKFALL_AUTHORITY_MAP_IDENTITY_V3 } from '../authority/inkfallMapIdentity';
import {
  getBundledMapPackageSource,
  type MapVector3Millimeters,
} from '../content/maps';
import {
  loadRuntimeMapPackage,
  type LoadedRuntimeMapPackage,
} from '../physics';
import {
  INKFALL_REV3_ROUTE_DEFINITIONS,
  INKFALL_REV3_SIGHTLINE_DEFINITIONS,
  runInkfallRev3ReviewAudit,
} from './inkfallRev3ReviewAudit';
import type {
  InkfallRev3ReviewRequest,
  InkfallRev3ReviewSelection,
} from './inkfallRev3ReviewSelection';
import { PRESS_HALL_INSPECTION_SEARCH } from './pressHallInspectionSelection';

type ReviewView =
  | 'overview'
  | 'mid'
  | 'sniper_west'
  | 'sniper_east'
  | 'shotgun_west'
  | 'shotgun_east'
  | 'spawns'
  | 'verticality';

interface FrameSummary {
  readonly count: number;
  readonly minimumMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maximumMs: number;
  readonly meanMs: number;
}

interface ReviewRuntimeState {
  currentView: ReviewView;
  collisionOverlayVisible: boolean;
  audit: Awaited<ReturnType<typeof runInkfallRev3ReviewAudit>> | null;
  frameProfile: FrameSummary | null;
  runtimeErrors: string[];
}

interface InkfallRev3ReviewSurface {
  readonly schemaVersion: 1;
  readonly getSnapshot: () => unknown;
  readonly selectView: (view: ReviewView) => void;
  readonly setCollisionOverlay: (visible: boolean) => void;
  readonly runAudit: () => Promise<unknown>;
}

declare global {
  interface Window {
    readonly __KYX_INKFALL_REV3_REVIEW__?: InkfallRev3ReviewSurface;
  }
}

const VIEW_PRESETS: Readonly<Record<ReviewView, {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}>> = Object.freeze({
  overview: Object.freeze({
    position: [0, 56, 43] as const,
    target: [0, 0, 0] as const,
  }),
  mid: Object.freeze({
    position: [0, 21, 27] as const,
    target: [0, 1.2, 3.8] as const,
  }),
  sniper_west: Object.freeze({
    position: [-14, 1.72, 4] as const,
    target: [14, 1.6, 3] as const,
  }),
  sniper_east: Object.freeze({
    position: [14, 1.72, 4] as const,
    target: [-14, 1.6, 3] as const,
  }),
  shotgun_west: Object.freeze({
    position: [-9.2, 1.65, 3.4] as const,
    target: [-3.1, 1.3, 3] as const,
  }),
  shotgun_east: Object.freeze({
    position: [9.2, 1.65, 3.4] as const,
    target: [3.1, 1.3, 3] as const,
  }),
  spawns: Object.freeze({
    position: [0, 74, 2] as const,
    target: [0, 0, 0] as const,
  }),
  verticality: Object.freeze({
    position: [38, 24, -34] as const,
    target: [0, 2, 0] as const,
  }),
});

function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  node.className = className;
  node.textContent = text;
  return node;
}

function routeStyles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      color-scheme: dark;
      --g5-paper: #e9e4d6;
      --g5-dim: #9a968c;
      --g5-black: #090908;
      --g5-panel: #11110f;
      --g5-rule: #3c3a33;
      --g5-amber: #ffb000;
      --g5-red: #ef4b32;
      --g5-cyan: #50dfd2;
    }
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: var(--g5-black);
      color: var(--g5-paper);
      font-family: Bahnschrift, "Arial Narrow", Arial, sans-serif;
    }
    .g5-map__canvas {
      position: fixed;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      outline: none;
    }
    .g5-map__shell {
      position: fixed;
      inset: 0;
      z-index: 2;
      pointer-events: none;
      display: grid;
      grid-template-columns: minmax(300px, 348px) 1fr;
      grid-template-rows: auto 1fr auto;
      gap: 12px;
      padding: 14px;
    }
    .g5-map__status-rail {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: auto 1fr auto;
      min-height: 42px;
      border: 1px solid rgba(255,176,0,.7);
      background: rgba(9,9,8,.92);
      box-shadow: 0 8px 30px rgba(0,0,0,.35);
    }
    .g5-map__status-code,
    .g5-map__status-copy,
    .g5-map__return {
      display: flex;
      align-items: center;
      min-height: 40px;
      padding: 0 13px;
      font: 800 10px/1 Consolas, ui-monospace, monospace;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    .g5-map__status-code {
      background: var(--g5-amber);
      color: #111;
    }
    .g5-map__status-copy {
      color: #d3c7a9;
      background: repeating-linear-gradient(
        -45deg,
        rgba(255,176,0,.035) 0,
        rgba(255,176,0,.035) 5px,
        transparent 5px,
        transparent 10px
      );
    }
    .g5-map__return {
      pointer-events: auto;
      border-left: 1px solid #555044;
      color: var(--g5-paper);
      text-decoration: none;
    }
    .g5-map__return:hover,
    .g5-map__return:focus-visible {
      background: var(--g5-paper);
      color: #111;
      outline: none;
    }
    .g5-map__panel {
      align-self: start;
      pointer-events: auto;
      border: 1px solid var(--g5-rule);
      background: rgba(12,12,10,.94);
      box-shadow: 10px 10px 0 rgba(0,0,0,.24);
    }
    .g5-map__panel::before {
      content: "G5 / MAP REVIEW";
      display: block;
      padding: 8px 12px;
      border-bottom: 1px solid var(--g5-rule);
      color: var(--g5-amber);
      font: 800 9px/1 Consolas, ui-monospace, monospace;
      letter-spacing: .2em;
    }
    .g5-map__identity {
      padding: 14px 14px 12px;
      border-bottom: 1px solid var(--g5-rule);
    }
    .g5-map__kicker {
      margin: 0 0 7px;
      color: var(--g5-red);
      font: 900 10px/1 Consolas, ui-monospace, monospace;
      letter-spacing: .16em;
      text-transform: uppercase;
    }
    .g5-map__identity h1 {
      margin: 0;
      font-size: clamp(31px, 3.3vw, 48px);
      font-stretch: condensed;
      font-weight: 900;
      letter-spacing: -.055em;
      line-height: .84;
      text-transform: uppercase;
    }
    .g5-map__identity h1 span {
      display: block;
      color: var(--g5-amber);
      font-size: .56em;
      letter-spacing: .02em;
      line-height: 1.15;
    }
    .g5-map__intent {
      margin: 12px 0 0;
      color: #aaa598;
      font: 700 10px/1.55 Consolas, ui-monospace, monospace;
    }
    .g5-map__facts {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1px;
      background: var(--g5-rule);
    }
    .g5-map__fact {
      min-width: 0;
      padding: 9px 10px;
      background: #0d0d0b;
    }
    .g5-map__fact span,
    .g5-map__audit span,
    .g5-map__performance span {
      display: block;
      color: #77746c;
      font: 800 7px/1 Consolas, ui-monospace, monospace;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    .g5-map__fact strong {
      display: block;
      margin-top: 6px;
      color: var(--g5-paper);
      font: 900 10px/1.1 Consolas, ui-monospace, monospace;
      overflow-wrap: anywhere;
    }
    .g5-map__audit {
      padding: 11px 13px;
      border-bottom: 1px solid var(--g5-rule);
      background: #12100a;
    }
    .g5-map__audit strong {
      display: block;
      margin-top: 7px;
      color: var(--g5-amber);
      font: 900 10px/1.45 Consolas, ui-monospace, monospace;
      text-transform: uppercase;
    }
    .g5-map__audit[data-state="pass"] strong { color: var(--g5-cyan); }
    .g5-map__audit[data-state="fail"] strong { color: #ff755d; }
    .g5-map__performance {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px;
      align-items: baseline;
      padding: 7px 13px;
      border-bottom: 1px solid var(--g5-rule);
      background: #0d0d0b;
    }
    .g5-map__performance strong {
      color: #c7c1b3;
      font: 800 8px/1.35 Consolas, ui-monospace, monospace;
      text-align: right;
      text-transform: uppercase;
    }
    .g5-map__controls {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      padding: 1px;
      background: var(--g5-rule);
    }
    .g5-map__controls button,
    .g5-map__art-link {
      appearance: none;
      min-height: 39px;
      padding: 8px 9px;
      border: 0;
      background: #121210;
      color: #aaa69b;
      font: 800 8px/1.2 Consolas, ui-monospace, monospace;
      letter-spacing: .08em;
      text-align: left;
      text-decoration: none;
      text-transform: uppercase;
      cursor: pointer;
    }
    .g5-map__controls button:hover,
    .g5-map__controls button:focus-visible,
    .g5-map__controls button[aria-pressed="true"],
    .g5-map__art-link:hover,
    .g5-map__art-link:focus-visible {
      outline: 1px solid var(--g5-amber);
      outline-offset: -1px;
      background: #292008;
      color: #fff3cf;
    }
    .g5-map__controls button[data-action="audit"] {
      background: var(--g5-amber);
      color: #111;
    }
    .g5-map__controls button[data-action="overlay"][aria-pressed="true"] {
      background: #173b37;
      color: var(--g5-cyan);
    }
    .g5-map__art-link {
      display: flex;
      align-items: center;
      background: #21110d;
      color: #ff8c79;
    }
    .g5-map__legend {
      grid-column: 2;
      grid-row: 2;
      align-self: end;
      justify-self: end;
      display: grid;
      gap: 7px;
      padding: 10px 12px;
      border: 1px solid rgba(84,81,72,.8);
      background: rgba(9,9,8,.86);
      color: #a6a095;
      font: 800 8px/1 Consolas, ui-monospace, monospace;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .g5-map__legend i {
      display: inline-block;
      width: 16px;
      height: 3px;
      margin-right: 8px;
      vertical-align: middle;
      background: var(--swatch);
    }
    .g5-map__footer {
      grid-column: 1 / -1;
      display: flex;
      justify-content: space-between;
      gap: 20px;
      padding: 9px 12px;
      border: 1px solid rgba(84,81,72,.8);
      background: rgba(9,9,8,.9);
      color: #89857c;
      font: 800 8px/1.35 Consolas, ui-monospace, monospace;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .g5-map__footer strong { color: var(--g5-red); }
    .g5-map__error {
      width: min(760px, calc(100% - 40px));
      margin: 12vh auto;
      padding: 26px;
      border: 1px solid #b23f2d;
      background: #1c0b08;
      color: #ffc1b4;
      font: 750 13px/1.65 Consolas, ui-monospace, monospace;
      white-space: pre-wrap;
    }
    @media (max-width: 820px) {
      .g5-map__shell {
        grid-template-columns: 1fr;
        padding: 8px;
      }
      .g5-map__status-rail { grid-template-columns: auto 1fr; }
      .g5-map__return { display: none; }
      .g5-map__panel { width: min(340px, calc(100vw - 16px)); }
      .g5-map__legend { display: none; }
      .g5-map__footer { font-size: 7px; }
      .g5-map__footer span:last-child { display: none; }
    }
    @media (max-height: 780px) and (min-width: 821px) {
      .g5-map__shell { gap: 7px; padding: 9px; }
      .g5-map__status-rail { min-height: 34px; }
      .g5-map__status-code,
      .g5-map__status-copy,
      .g5-map__return { min-height: 32px; padding-inline: 10px; }
      .g5-map__identity { padding: 9px 11px 8px; }
      .g5-map__identity h1 { font-size: clamp(27px, 2.8vw, 38px); }
      .g5-map__intent { margin-top: 7px; font-size: 8px; line-height: 1.35; }
      .g5-map__fact { padding: 6px 8px; }
      .g5-map__fact strong { margin-top: 4px; font-size: 9px; }
      .g5-map__audit { padding: 7px 10px; }
      .g5-map__audit strong { margin-top: 4px; font-size: 8px; line-height: 1.3; }
      .g5-map__performance { padding: 5px 10px; }
      .g5-map__controls button,
      .g5-map__art-link { min-height: 31px; padding: 5px 8px; font-size: 7px; }
      .g5-map__legend { padding: 7px 9px; gap: 5px; }
      .g5-map__footer { padding: 6px 9px; font-size: 7px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; }
    }
  `;
  return style;
}

async function fetchBytes(url: string, role: string): Promise<Uint8Array> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${role.toUpperCase()}_FETCH_FAILED ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function parseGltf(bytes: Uint8Array): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      bytes.slice().buffer,
      new URL('.', window.location.href).href,
      (gltf) => resolve(gltf.scene),
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    );
  });
}

function mapVector(source: MapVector3Millimeters): THREE.Vector3 {
  return new THREE.Vector3(source.x / 1_000, source.y / 1_000, -source.z / 1_000);
}

function mapPlanPoint(source: Readonly<{ x: number; z: number }>, yMm: number): THREE.Vector3 {
  return new THREE.Vector3(source.x / 1_000, yMm / 1_000, -source.z / 1_000);
}

function mapEulerQuaternion(rotation: Readonly<{ x: number; y: number; z: number }>): THREE.Quaternion {
  const mapQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(rotation.x / 1_000),
    THREE.MathUtils.degToRad(rotation.y / 1_000),
    THREE.MathUtils.degToRad(rotation.z / 1_000),
    'XYZ',
  ));
  return new THREE.Quaternion(
    -mapQuaternion.x,
    -mapQuaternion.y,
    mapQuaternion.z,
    mapQuaternion.w,
  ).normalize();
}

function matrixForFixture(
  center: Readonly<{ x: number; y: number; z: number }>,
  rotation: Readonly<{ x: number; y: number; z: number }>,
  halfExtents: Readonly<{ x: number; y: number; z: number }>,
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    mapVector(center),
    mapEulerQuaternion(rotation),
    new THREE.Vector3(
      (halfExtents.x * 2) / 1_000,
      (halfExtents.y * 2) / 1_000,
      (halfExtents.z * 2) / 1_000,
    ),
  );
}

function createCollisionOverlay(loaded: LoadedRuntimeMapPackage): THREE.Group {
  const group = new THREE.Group();
  group.name = 'REVISION_3_SEPARATE_AUTHORITY_OVERLAY';
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffb000,
    transparent: true,
    opacity: 0.13,
    wireframe: true,
    depthWrite: false,
  });
  const solids = new THREE.InstancedMesh(
    unitBox,
    material,
    loaded.authority.fixture.solids.length,
  );
  loaded.authority.fixture.solids.forEach((solid, index) => {
    if (solid.shape.type !== 'box') throw new Error('INKFALL_REV3_NON_BOX_COLLIDER');
    solids.setMatrixAt(index, matrixForFixture(
      solid.centerMm,
      solid.rotationMilliDegrees,
      solid.shape.halfExtentsMm,
    ));
  });
  solids.instanceMatrix.needsUpdate = true;
  group.add(solids);

  const changedMaterial = new THREE.MeshBasicMaterial({
    color: 0xef4b32,
    transparent: true,
    opacity: 0.5,
    wireframe: true,
    depthWrite: false,
  });
  for (const solid of loaded.authority.fixture.solids.filter(({ id }) => (
    id === 'map_collision_module_press_baffle_w_inner'
    || id === 'map_collision_module_press_baffle_e_inner'
  ))) {
    if (solid.shape.type !== 'box') continue;
    const mesh = new THREE.Mesh(unitBox, changedMaterial);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(matrixForFixture(
      solid.centerMm,
      solid.rotationMilliDegrees,
      solid.shape.halfExtentsMm,
    ));
    mesh.name = `${solid.id}_OPEN_MID_REVISION`;
    group.add(mesh);
  }
  return group;
}

function cylinderBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  color: number,
): THREE.Mesh {
  const delta = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, delta.length(), 10),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88 }),
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.clone().normalize(),
  );
  return mesh;
}

function createReviewGuides(loaded: LoadedRuntimeMapPackage): THREE.Group {
  const group = new THREE.Group();
  group.name = 'REVISION_3_REVIEW_GUIDES_NOT_AUTHORITY';

  for (const definition of INKFALL_REV3_SIGHTLINE_DEFINITIONS) {
    const isLane = definition.intent === 'sniper_lane';
    const guide = cylinderBetween(
      mapPlanPoint(definition.start, 1_600),
      mapPlanPoint(definition.end, 1_600),
      isLane ? 0.055 : 0.035,
      isLane ? 0xef4b32 : 0xffb000,
    );
    guide.name = definition.id;
    guide.userData.reviewKind = isLane ? 'sniper' : 'cover';
    group.add(guide);
  }
  for (const definition of INKFALL_REV3_ROUTE_DEFINITIONS) {
    const guide = cylinderBetween(
      mapVector({ x: definition.start[0], y: definition.start[1] + 180, z: definition.start[2] }),
      mapVector({ x: definition.end[0], y: definition.end[1] + 180, z: definition.end[2] }),
      0.045,
      0x50dfd2,
    );
    guide.name = definition.id;
    guide.userData.reviewKind = 'route';
    group.add(guide);
  }

  const spawnGeometry = new THREE.OctahedronGeometry(0.75, 0);
  const spawnMaterial = new THREE.MeshBasicMaterial({ color: 0x78f28b });
  const spawns = new THREE.InstancedMesh(
    spawnGeometry,
    spawnMaterial,
    loaded.manifest.spawns.length,
  );
  loaded.manifest.spawns.forEach((spawn, index) => {
    const position = mapVector(spawn.feetPositionMm);
    position.y += 0.9;
    spawns.setMatrixAt(index, new THREE.Matrix4().makeTranslation(
      position.x,
      position.y,
      position.z,
    ));
  });
  spawns.instanceMatrix.needsUpdate = true;
  spawns.name = 'revision_3_spawn_candidates';
  spawns.userData.reviewKind = 'spawn';
  group.add(spawns);
  return group;
}

function rendererFacts(renderer: THREE.WebGLRenderer) {
  const possiblePrograms = (
    renderer.info as unknown as { readonly programs?: readonly unknown[] }
  ).programs;
  return Object.freeze({
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    lines: renderer.info.render.lines,
    points: renderer.info.render.points,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: possiblePrograms?.length ?? null,
  });
}

function hostFacts(renderer: THREE.WebGLRenderer) {
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return Object.freeze({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
    viewport: Object.freeze({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    }),
    webgl: Object.freeze({
      version: String(gl.getParameter(gl.VERSION)),
      vendor: debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : null,
      renderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null,
    }),
  });
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

async function profileFrames(): Promise<FrameSummary> {
  for (let index = 0; index < 30; index += 1) await nextFrame();
  const samples: number[] = [];
  let previous = await nextFrame();
  for (let index = 0; index < 120; index += 1) {
    const current = await nextFrame();
    samples.push(current - previous);
    previous = current;
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return Object.freeze({
    count: sorted.length,
    minimumMs: sorted[0],
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maximumMs: sorted.at(-1)!,
    meanMs: sorted.reduce((total, value) => total + value, 0) / sorted.length,
  });
}

function fact(label: string, value: string): HTMLElement {
  const item = element('div', 'g5-map__fact');
  item.append(element('span', '', label), element('strong', '', value));
  return item;
}

function renderUnsupported(
  root: HTMLElement,
  request: Extract<InkfallRev3ReviewRequest, { readonly kind: 'unsupported' }>,
): void {
  const failure = element('pre', 'g5-map__error');
  failure.id = 'inkfall-rev3-review-result';
  failure.setAttribute('role', 'alert');
  failure.textContent = [
    'UNSUPPORTED INKFALL REVISION 3 REVIEW REQUEST',
    '',
    `Requested: ${request.references.join(', ') || '(empty)'}`,
    '',
    'No map package or Offline Practice fallback was loaded.',
  ].join('\n');
  document.body.dataset.inkfallRev3Status = 'unsupported';
  root.replaceChildren(routeStyles(), failure);
}

function assertSelection(
  request: InkfallRev3ReviewRequest,
): asserts request is InkfallRev3ReviewSelection {
  if (request.kind !== 'selected') throw new Error('INKFALL_REV3_EXPLICIT_SELECTION_REQUIRED');
}

export async function mountInkfallRev3ReviewRoute(
  root: HTMLElement,
  request: InkfallRev3ReviewRequest,
): Promise<void> {
  if (request.kind === 'none') throw new Error('INKFALL_REV3_EXPLICIT_SELECTION_REQUIRED');
  if (request.kind === 'unsupported') {
    renderUnsupported(root, request);
    return;
  }
  assertSelection(request);

  const runtime: ReviewRuntimeState = {
    currentView: 'overview',
    collisionOverlayVisible: false,
    audit: null,
    frameProfile: null,
    runtimeErrors: [],
  };
  window.addEventListener('error', (event) => runtime.runtimeErrors.push(event.message), {
    passive: true,
  });
  window.addEventListener('unhandledrejection', (event) => (
    runtime.runtimeErrors.push(String(event.reason))
  ), { passive: true });

  const source = getBundledMapPackageSource(request.mapId, request.mapRevision);
  if (!source) throw new Error('INKFALL_REV3_PACKAGE_NOT_BUNDLED');
  const fetchStartedAt = performance.now();
  const [renderBytes, collisionBytes] = await Promise.all([
    fetchBytes(revision3RenderArtifactUrl, 'revision_3_render'),
    fetchBytes(revision3CollisionArtifactUrl, 'revision_3_collision'),
  ]);
  const fetchMs = performance.now() - fetchStartedAt;
  const authorityStartedAt = performance.now();
  const loaded = await loadRuntimeMapPackage(source, {
    render: renderBytes,
    collision: collisionBytes,
  });
  const authorityValidationMs = performance.now() - authorityStartedAt;
  if (
    loaded.identity.id !== INKFALL_AUTHORITY_MAP_IDENTITY_V3.mapId
    || loaded.identity.revision !== INKFALL_AUTHORITY_MAP_IDENTITY_V3.mapRevision
    || loaded.identity.packageDigest !== INKFALL_AUTHORITY_MAP_IDENTITY_V3.packageDigest
    || loaded.authority.fixtureHash !== INKFALL_AUTHORITY_MAP_IDENTITY_V3.fixtureHash
    || loaded.authority.fixture.solids.length !== INKFALL_AUTHORITY_MAP_IDENTITY_V3.colliderCardinality
  ) {
    throw new Error('INKFALL_REV3_AUTHORITY_IDENTITY_MISMATCH');
  }
  const parseStartedAt = performance.now();
  const renderScene = await parseGltf(renderBytes);
  const parseMs = performance.now() - parseStartedAt;
  renderScene.name = 'INKFALL_FOUNDRY_REVISION_3_RENDER_ONLY';

  const canvas = element('canvas', 'g5-map__canvas');
  canvas.id = 'inkfall-rev3-review-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute(
    'aria-label',
    'Interactive Inkfall Foundry Revision 3 map review viewport',
  );
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090908);
  scene.fog = new THREE.Fog(0x090908, 58, 105);
  scene.add(renderScene);
  scene.add(new THREE.HemisphereLight(0xd8e2e4, 0x28160c, 1.7));
  const keyLight = new THREE.DirectionalLight(0xffd39b, 2.8);
  keyLight.position.set(-24, 36, 20);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x73e6da, 1.45);
  fillLight.position.set(28, 14, -20);
  scene.add(fillLight);
  const collisionOverlay = createCollisionOverlay(loaded);
  collisionOverlay.visible = false;
  scene.add(collisionOverlay);
  const reviewGuides = createReviewGuides(loaded);
  scene.add(reviewGuides);

  const camera = new THREE.PerspectiveCamera(
    61,
    window.innerWidth / window.innerHeight,
    0.05,
    180,
  );
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 0.7;
  controls.maxDistance = 105;
  controls.maxPolarAngle = Math.PI * 0.495;

  const shell = element('main', 'g5-map__shell');
  shell.id = 'inkfall-rev3-review-result';
  const statusRail = element('header', 'g5-map__status-rail');
  statusRail.append(
    element('div', 'g5-map__status-code', 'G5 · REV 3'),
    element(
      'div',
      'g5-map__status-copy',
      'Explicit non-default review route · automated proof ≠ human acceptance',
    ),
  );
  const back = element('a', 'g5-map__return', 'Offline Practice');
  back.href = window.location.pathname;
  statusRail.append(back);
  shell.append(statusRail);

  const panel = element('section', 'g5-map__panel');
  const identity = element('div', 'g5-map__identity');
  const title = element('h1', '', 'Inkfall');
  title.append(element('span', '', 'Open Mid / Rev 3'));
  identity.append(
    element('p', 'g5-map__kicker', 'Sniper distance · shotgun breach'),
    title,
    element(
      'p',
      'g5-map__intent',
      'Two 28.0 m eye-height lanes now cross Press mid. Shortened inner baffles remain hard cover for close-entry counterplay.',
    ),
  );
  panel.append(identity);
  const facts = element('div', 'g5-map__facts');
  facts.append(
    fact('revision', String(loaded.identity.revision)),
    fact('colliders', String(loaded.authority.fixture.solids.length)),
    fact('spawns', String(loaded.manifest.spawns.length)),
    fact('zones', String(loaded.manifest.zones.length)),
    fact('render', loaded.presentation.renderSha256.slice(0, 8)),
    fact('fixture', loaded.authority.fixtureHash),
  );
  panel.append(facts);
  const auditStatus = element('div', 'g5-map__audit');
  auditStatus.dataset.state = 'running';
  auditStatus.append(
    element('span', '', 'Product-browser authority audit'),
    element('strong', '', 'Running collision / route / spawn / volume checks…'),
  );
  panel.append(auditStatus);
  const performanceStatus = element('div', 'g5-map__performance');
  performanceStatus.append(
    element('span', '', 'Live frame profile'),
    element('strong', '', 'Sampling 120 frames…'),
  );
  panel.append(performanceStatus);
  const controlsNode = element('div', 'g5-map__controls');
  const viewLabels: Readonly<Record<ReviewView, string>> = Object.freeze({
    overview: '01 / Overview',
    mid: '02 / Open mid',
    sniper_west: '03 / Sniper W→E',
    sniper_east: '04 / Sniper E→W',
    shotgun_west: '05 / Shotgun west',
    shotgun_east: '06 / Shotgun east',
    spawns: '07 / Spawn audit',
    verticality: '08 / Verticality',
  });
  const viewButtons = new Map<ReviewView, HTMLButtonElement>();
  for (const view of Object.keys(VIEW_PRESETS) as ReviewView[]) {
    const button = element('button', '', viewLabels[view]);
    button.type = 'button';
    button.dataset.reviewView = view;
    button.setAttribute('aria-pressed', String(view === 'overview'));
    controlsNode.append(button);
    viewButtons.set(view, button);
  }
  const overlayButton = element('button', '', 'Collision overlay');
  overlayButton.type = 'button';
  overlayButton.dataset.action = 'overlay';
  overlayButton.setAttribute('aria-pressed', 'false');
  controlsNode.append(overlayButton);
  const auditButton = element('button', '', 'Re-run audit');
  auditButton.type = 'button';
  auditButton.dataset.action = 'audit';
  controlsNode.append(auditButton);
  const artLink = element('a', 'g5-map__art-link', 'Representative final-art room ↗');
  artLink.href = `${window.location.pathname}${PRESS_HALL_INSPECTION_SEARCH}`;
  controlsNode.append(artLink);
  panel.append(controlsNode);
  shell.append(panel);

  const legend = element('aside', 'g5-map__legend');
  legend.setAttribute('aria-label', 'Review guide legend');
  const legendEntries = [
    ['#ef4b32', 'Sniper sightline'],
    ['#50dfd2', 'Traversable breach route'],
    ['#ffb000', 'Retained counter-cover'],
    ['#78f28b', 'Spawn candidate'],
  ] as const;
  for (const [color, label] of legendEntries) {
    const row = element('span', '');
    const swatch = element('i', '');
    swatch.style.setProperty('--swatch', color);
    row.append(swatch, document.createTextNode(label));
    legend.append(row);
  }
  shell.append(legend);
  const footer = element('footer', 'g5-map__footer');
  footer.append(
    element(
      'span',
      '',
      'Open-mid hypothesis · default remains Iron Bastion · teleport remains contract-only',
    ),
    element('span', '', 'Human 2 / 4 / 8 playtest: Required · G5: Open'),
  );
  shell.append(footer);
  const telemetryOutput = element('output', '');
  telemetryOutput.id = 'inkfall-rev3-review-snapshot';
  telemetryOutput.hidden = true;
  telemetryOutput.setAttribute('aria-hidden', 'true');
  root.replaceChildren(routeStyles(), canvas, shell, telemetryOutput);

  function selectView(view: ReviewView): void {
    const preset = VIEW_PRESETS[view];
    if (!preset) throw new Error(`INKFALL_REV3_UNKNOWN_VIEW ${view}`);
    camera.position.fromArray(preset.position);
    controls.target.fromArray(preset.target);
    controls.update();
    runtime.currentView = view;
    for (const guide of reviewGuides.children) {
      const kind = String(guide.userData.reviewKind ?? '');
      guide.visible = (
        view === 'overview'
        || view === 'mid'
        || (view === 'sniper_west' && (
          guide.name === 'sniper_lane_west_to_east'
          || guide.name === 'west_baffle_counter_cover'
        ))
        || (view === 'sniper_east' && (
          guide.name === 'sniper_lane_east_to_west'
          || guide.name === 'east_baffle_counter_cover'
        ))
        || (view === 'shotgun_west' && (
          guide.name === 'west_shotgun_breach'
          || guide.name === 'west_baffle_counter_cover'
        ))
        || (view === 'shotgun_east' && (
          guide.name === 'east_shotgun_breach'
          || guide.name === 'east_baffle_counter_cover'
        ))
        || (view === 'spawns' && kind === 'spawn')
        || (view === 'verticality' && (kind === 'route' || kind === 'spawn'))
      );
    }
    for (const [candidate, button] of viewButtons) {
      button.setAttribute('aria-pressed', String(candidate === view));
    }
  }
  function setCollisionOverlay(visible: boolean): void {
    collisionOverlay.visible = Boolean(visible);
    runtime.collisionOverlayVisible = collisionOverlay.visible;
    overlayButton.setAttribute('aria-pressed', String(collisionOverlay.visible));
  }
  let auditPromise: Promise<Awaited<ReturnType<typeof runInkfallRev3ReviewAudit>>> | null = null;
  async function runAudit() {
    if (auditPromise) return auditPromise;
    document.body.dataset.inkfallRev3Audit = 'running';
    auditStatus.dataset.state = 'running';
    auditStatus.querySelector('strong')!.textContent = (
      'Running collision / route / spawn / volume checks…'
    );
    auditPromise = runInkfallRev3ReviewAudit(loaded)
      .then((audit) => {
        runtime.audit = audit;
        const routePasses = audit.routes.filter(({ passed }) => passed).length;
        const sightlinePasses = audit.sightlines.filter(({ passed }) => passed).length;
        auditStatus.dataset.state = audit.allChecksPassed ? 'pass' : 'fail';
        auditStatus.querySelector('strong')!.textContent = [
          audit.allChecksPassed ? 'Automated pass / G5 open' : 'Automated fault / G5 open',
          `${routePasses}/${audit.routes.length} routes`,
          `${sightlinePasses}/${audit.sightlines.length} sightlines`,
          `${audit.spawnAndVolumes.spawns.filter(({ passed }) => passed).length}/12 spawns`,
        ].join(' · ');
        document.body.dataset.inkfallRev3Audit = audit.allChecksPassed ? 'pass' : 'fail';
        publishSnapshot();
        return audit;
      })
      .finally(() => {
        auditPromise = null;
      });
    return auditPromise;
  }
  for (const [view, button] of viewButtons) {
    button.addEventListener('click', () => selectView(view));
  }
  overlayButton.addEventListener(
    'click',
    () => setCollisionOverlay(!runtime.collisionOverlayVisible),
  );
  auditButton.addEventListener('click', () => {
    void runAudit();
  });
  selectView('overview');

  let animationFrame = 0;
  const renderFrame = () => {
    controls.update();
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(renderFrame);
  };
  renderFrame();
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize, { passive: true });

  const loadTiming = Object.freeze({
    fetchMs,
    authorityValidationMs,
    parseMs,
    totalMs: fetchMs + authorityValidationMs + parseMs,
  });
  const getSnapshot = () => Object.freeze({
    schemaVersion: 1,
    status: runtime.audit?.allChecksPassed
      ? 'REV3_PRODUCT_BROWSER_REVIEW_READY_G5_OPEN'
      : 'REV3_PRODUCT_BROWSER_REVIEW_NOT_READY_G5_OPEN',
    selection: Object.freeze({
      source: request.source,
      explicit: true,
      reference: request.reference,
    }),
    catalogDefault: Object.freeze({
      ...request.catalogDefault,
      unchanged: true,
    }),
    identity: Object.freeze({
      mapId: loaded.identity.id,
      mapRevision: loaded.identity.revision,
      packageDigest: loaded.identity.packageDigest,
      fixtureHash: loaded.authority.fixtureHash,
      renderSha256: loaded.presentation.renderSha256,
      collisionSha256: loaded.authority.collisionSha256,
    }),
    currentView: runtime.currentView,
    collisionOverlayVisible: runtime.collisionOverlayVisible,
    audit: runtime.audit,
    performance: Object.freeze({
      loadTiming,
      frameProfile: runtime.frameProfile,
      renderer: rendererFacts(renderer),
      host: hostFacts(renderer),
    }),
    runtimeErrors: Object.freeze([...runtime.runtimeErrors]),
    productBoundary: Object.freeze({
      explicitReviewRouteOnly: true,
      loadedIntoOfflinePractice: false,
      shippingDefaultChanged: false,
      humanPlaytestAccepted: false,
      performanceAccepted: false,
      g5Passed: false,
    }),
    nonClaims: Object.freeze([
      'AUTOMATED_PRODUCT_BROWSER_AUDIT_NOT_HUMAN_PLAYTEST',
      'REPRESENTATIVE_FINAL_ART_ROOM_SEPARATE_REVIEW_ROUTE',
      'REVISION_3_NOT_DEFAULT',
      'REVISION_3_NOT_PROMOTED',
      'G5_NOT_PASSED',
    ]),
  });
  const publishSnapshot = () => {
    telemetryOutput.textContent = JSON.stringify(getSnapshot());
  };
  const surface: InkfallRev3ReviewSurface = Object.freeze({
    schemaVersion: 1 as const,
    getSnapshot,
    selectView,
    setCollisionOverlay,
    runAudit,
  });
  Object.defineProperty(window, '__KYX_INKFALL_REV3_REVIEW__', {
    configurable: true,
    enumerable: false,
    value: surface,
    writable: false,
  });

  publishSnapshot();
  await runAudit();
  runtime.frameProfile = await profileFrames();
  performanceStatus.querySelector('strong')!.textContent = [
    `P50 ${runtime.frameProfile.p50Ms.toFixed(2)}ms`,
    `P95 ${runtime.frameProfile.p95Ms.toFixed(2)}ms`,
    `${renderer.info.render.calls} calls`,
    `${renderer.info.render.triangles.toLocaleString('en-US')} tris`,
  ].join(' · ');
  publishSnapshot();
  document.body.dataset.launchSupport = 'inkfall-rev3-explicit-review';
  document.body.dataset.inkfallRev3Status = 'ready';

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(animationFrame);
    window.removeEventListener('resize', resize);
    controls.dispose();
    renderer.dispose();
    delete (window as { __KYX_INKFALL_REV3_REVIEW__?: InkfallRev3ReviewSurface })
      .__KYX_INKFALL_REV3_REVIEW__;
  }, { once: true });
}
