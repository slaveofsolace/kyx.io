import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import lockedRenderArtifactUrl from '../../assets/source/maps/inkfall-foundry/revisions/revision-2/export/render.graybox.glb?url';
import lockedCollisionArtifactUrl from '../../assets/source/maps/inkfall-foundry/revisions/revision-2/export/collision.authority.glb?url';

import {
  DEFAULT_MAP_ID,
  DEFAULT_MAP_REVISION,
  getBundledMapPackageSource,
  sha256Hex,
} from '../content/maps';
import {
  loadRuntimeMapPackage,
  type LoadedRuntimeMapPackage,
} from '../physics';
import { INKFALL_AUTHORITY_MAP_IDENTITY_V2 } from '../authority/inkfallMapIdentity';
import type {
  PressHallArtRevision,
  PressHallInspectionRequest,
  PressHallInspectionSelection,
} from './pressHallInspectionSelection';

interface ArtConfig {
  readonly revision: PressHallArtRevision;
  readonly url: string;
  readonly sourcePath: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly explicitBaseColorFactorCount: number;
}

const pressHallV32JoinedArtifactUrl = new URL(
  '../../assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/readability-v3-2/export/inkfall_foundry_press_hall_readability_v3_2.spatial-material-joined.glb',
  import.meta.url,
).href;
const pressHallV33JoinedArtifactUrl = new URL(
  '../../assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/material-export-v3-3/export/inkfall_foundry_press_hall_material_export_v3_3.spatial-material-joined.glb',
  import.meta.url,
).href;

const ART_CONFIGS: Readonly<Record<PressHallArtRevision, ArtConfig>> = Object.freeze({
  '3.2': Object.freeze({
    revision: '3.2',
    url: pressHallV32JoinedArtifactUrl,
    sourcePath: 'assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/readability-v3-2/export/inkfall_foundry_press_hall_readability_v3_2.spatial-material-joined.glb',
    sha256: '56cbd313e3fd2166c70ce6cca614e02f08fd027acf2b0a43749cf076c46f8119',
    bytes: 13_300_676,
    explicitBaseColorFactorCount: 0,
  }),
  '3.3': Object.freeze({
    revision: '3.3',
    url: pressHallV33JoinedArtifactUrl,
    sourcePath: 'assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/material-export-v3-3/export/inkfall_foundry_press_hall_material_export_v3_3.spatial-material-joined.glb',
    sha256: '4ad11232074a794fd817114385f7256e286aefe810c76357a9b0103667874564',
    bytes: 13_301_752,
    explicitBaseColorFactorCount: 9,
  }),
});
const ART_NODE_COUNT = 29;
const ART_MESH_COUNT = 29;
const ART_PRIMITIVE_COUNT = 29;
const ART_TRIANGLE_COUNT = 188_576;
const ART_MATERIAL_COUNT = 9;
const ART_MATERIAL_NAMES = Object.freeze([
  'V3_AQUA_INDICATOR',
  'V3_CAST_IRON',
  'V3_CHIPPED_SAFETY_RED',
  'V3_GARDEN_FRAGMENT',
  'V3_GREASED_LINKAGE',
  'V3_INK_BLACK',
  'V3_USED_CERAMIC',
  'V3_WORN_AMBER',
  'V3_WORN_STEEL',
].sort());
const WARMUP_FRAME_COUNT = 60;
const PROFILE_FRAME_COUNT = 180;

type InspectionView = 'gameplay' | 'north' | 'south' | 'overhead';

interface RendererFacts {
  readonly calls: number;
  readonly triangles: number;
  readonly lines: number;
  readonly points: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number | null;
}

interface FrameSummary {
  readonly count: number;
  readonly minimumMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maximumMs: number;
  readonly meanMs: number;
}

interface HeapFacts {
  readonly usedJsHeapBytes: number;
  readonly totalJsHeapBytes: number;
  readonly jsHeapLimitBytes: number;
}

interface GlbDocumentFacts {
  readonly generator: string | null;
  readonly materialNames: readonly string[];
  readonly materials: readonly {
    readonly name: string;
    readonly baseColorFactor: readonly number[] | null;
    readonly metallicFactor: number;
    readonly roughnessFactor: number;
  }[];
  readonly explicitBaseColorFactorCount: number;
  readonly baseColorTextureReferenceCount: number;
  readonly imageCount: number;
  readonly textureCount: number;
  readonly extensionsUsed: readonly string[];
}

interface ArtInspectionFacts {
  readonly nodeCount: number;
  readonly meshCount: number;
  readonly primitiveCount: number;
  readonly triangleCount: number;
  readonly materialCount: number;
  readonly materials: readonly {
    readonly name: string;
    readonly colorLinear: readonly number[] | null;
    readonly metalness: number | null;
    readonly roughness: number | null;
  }[];
}

interface RuntimeMaterialAudit {
  readonly instantiatedMaterialCount: number;
  readonly whiteFallbackMaterialCount: number;
  readonly maximumBaseColorDelta: number | null;
  readonly maximumMetalnessDelta: number | null;
  readonly maximumRoughnessDelta: number | null;
  readonly instantiatedValuesMatchExplicitGltf: boolean | null;
}

interface CameraSweepState {
  status: 'not_started' | 'running' | 'complete';
  startedAtMs: number | null;
  completedAtMs: number | null;
  durationMs: number | null;
  completedSegments: number;
}

interface RuntimeState {
  readonly selection: PressHallInspectionSelection;
  readonly artConfig: ArtConfig;
  readonly artBytes: Uint8Array;
  readonly artSha256: string;
  readonly documentFacts: GlbDocumentFacts;
  readonly artFacts: ArtInspectionFacts;
  readonly runtimeMaterialAudit: RuntimeMaterialAudit;
  readonly loadedMap: LoadedRuntimeMapPackage;
  readonly sceneBounds: THREE.Box3;
  readonly artRendererFacts: RendererFacts;
  readonly overlayRendererFacts: RendererFacts;
  readonly loadTiming: {
    readonly fetchMs: number;
    readonly hashMs: number;
    readonly parseMs: number;
    readonly authorityValidationMs: number;
    readonly totalMs: number;
  };
  readonly frameProfile: FrameSummary;
  readonly heapBefore: HeapFacts | null;
  readonly heapAfter: HeapFacts | null;
  readonly host: ReturnType<typeof browserHostFacts>;
  readonly runtimeErrors: string[];
  readonly cameraSweep: CameraSweepState;
  currentView: InspectionView;
  authorityOverlayVisible: boolean;
}

interface PressHallInspectionSurface {
  readonly schemaVersion: 1;
  readonly getSnapshot: () => unknown;
  readonly selectView: (view: InspectionView) => void;
  readonly setAuthorityOverlay: (visible: boolean) => void;
  readonly startCameraSweep: () => Promise<void>;
}

declare global {
  interface Window {
    readonly __KYX_PRESS_HALL_INSPECTION__?: PressHallInspectionSurface;
  }
}

const VIEW_PRESETS: Readonly<Record<InspectionView, {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}>> = Object.freeze({
  gameplay: Object.freeze({ position: [-15.8, 1.72, 0.8] as const, target: [0, 2.62, 0] as const }),
  north: Object.freeze({ position: [-11.8, 1.72, 1.3] as const, target: [0, 2.78, -6.55] as const }),
  south: Object.freeze({ position: [11.8, 1.72, -1] as const, target: [0, 2.78, 7.15] as const }),
  overhead: Object.freeze({ position: [-14, 6.35, 6.5] as const, target: [0, 2.2, 0.3] as const }),
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
    :root { color-scheme: dark; background: #07090a; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #07090a; color: #eef3ed; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .ph-runtime__canvas { position: fixed; inset: 0; display: block; width: 100%; height: 100%; outline: none; }
    .ph-runtime__ui { position: fixed; inset: 0; z-index: 2; pointer-events: none; display: grid; grid-template-rows: auto 1fr auto; padding: 18px; }
    .ph-runtime__rail { display: flex; align-items: start; justify-content: space-between; gap: 18px; }
    .ph-runtime__boundary { max-width: min(760px, 74vw); padding: 10px 12px; border: 1px solid rgba(255,177,84,.75); background: rgba(24,14,5,.91); color: #ffd398; font: 900 10px/1.45 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; box-shadow: 0 12px 35px rgba(0,0,0,.34); }
    .ph-runtime__return { pointer-events: auto; padding: 10px 12px; border: 1px solid rgba(183,204,193,.34); background: rgba(8,12,10,.86); color: #d9e4dc; font: 850 10px/1 ui-monospace, monospace; letter-spacing: .08em; text-decoration: none; text-transform: uppercase; }
    .ph-runtime__panel { align-self: center; width: min(360px, calc(100vw - 36px)); padding: 17px; border: 1px solid rgba(121,147,132,.44); background: linear-gradient(150deg, rgba(7,12,10,.94), rgba(12,17,14,.88)); box-shadow: 0 18px 45px rgba(0,0,0,.45); backdrop-filter: blur(9px); }
    .ph-runtime__kicker { margin: 0 0 8px; color: #65e2bb; font: 900 9px/1 ui-monospace, monospace; letter-spacing: .16em; text-transform: uppercase; }
    .ph-runtime__panel h1 { margin: 0; font-size: 28px; line-height: .94; letter-spacing: -.04em; text-transform: uppercase; }
    .ph-runtime__identity { margin: 11px 0 0; color: #9caba2; font: 700 9px/1.55 ui-monospace, monospace; overflow-wrap: anywhere; }
    .ph-runtime__facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin-top: 13px; background: rgba(104,128,114,.28); }
    .ph-runtime__fact { min-width: 0; padding: 9px; background: rgba(4,8,6,.82); }
    .ph-runtime__fact span { display: block; color: #718179; font: 800 7px/1 ui-monospace, monospace; letter-spacing: .09em; text-transform: uppercase; }
    .ph-runtime__fact strong { display: block; margin-top: 6px; color: #edf5ef; font: 900 10px/1.25 ui-monospace, monospace; }
    .ph-runtime__controls { pointer-events: auto; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 13px; }
    .ph-runtime__controls button { appearance: none; padding: 8px 9px; border: 1px solid #34443b; background: #111a15; color: #aebdb4; font: 850 8px/1 ui-monospace, monospace; letter-spacing: .07em; text-transform: uppercase; cursor: pointer; }
    .ph-runtime__controls button:hover, .ph-runtime__controls button:focus-visible, .ph-runtime__controls button[aria-pressed='true'] { border-color: #61dcb7; color: #f4fff8; background: #153128; }
    .ph-runtime__profile { margin: 12px 0 0; color: #8fa098; font: 750 8px/1.55 ui-monospace, monospace; }
    .ph-runtime__footer { justify-self: end; max-width: min(690px, calc(100vw - 36px)); padding: 9px 11px; border: 1px solid rgba(212,148,65,.45); background: rgba(24,14,5,.88); color: #d7b07b; font: 850 8px/1.5 ui-monospace, monospace; letter-spacing: .08em; text-align: right; text-transform: uppercase; }
    .ph-runtime__error { width: min(760px, calc(100% - 40px)); margin: 14vh auto; padding: 28px; border: 1px solid #963f2d; background: #210c07; color: #ffc3b4; font: 750 13px/1.65 ui-monospace, monospace; white-space: pre-wrap; }
    @media (max-width: 720px) { .ph-runtime__ui { padding: 10px; } .ph-runtime__boundary { max-width: 66vw; } .ph-runtime__panel { align-self: end; } .ph-runtime__footer { display: block; max-width: 100%; padding: 6px 8px; font-size: 7px; line-height: 1.35; text-align: left; } }
  `;
  return style;
}

function rendererFacts(renderer: THREE.WebGLRenderer): RendererFacts {
  const info = renderer.info;
  const possiblePrograms = (info as unknown as { readonly programs?: readonly unknown[] }).programs;
  return Object.freeze({
    calls: info.render.calls,
    triangles: info.render.triangles,
    lines: info.render.lines,
    points: info.render.points,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: possiblePrograms?.length ?? null,
  });
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function summarizeFrames(samples: readonly number[]): FrameSummary {
  if (samples.length === 0) throw new Error('PRESS_HALL_FRAME_PROFILE_EMPTY');
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

function heapFacts(): HeapFacts | null {
  const memory = (performance as Performance & {
    readonly memory?: {
      readonly usedJSHeapSize: number;
      readonly totalJSHeapSize: number;
      readonly jsHeapSizeLimit: number;
    };
  }).memory;
  if (!memory) return null;
  return Object.freeze({
    usedJsHeapBytes: memory.usedJSHeapSize,
    totalJsHeapBytes: memory.totalJSHeapSize,
    jsHeapLimitBytes: memory.jsHeapSizeLimit,
  });
}

function browserHostFacts(renderer: THREE.WebGLRenderer) {
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const navigatorWithMemory = navigator as Navigator & { readonly deviceMemory?: number };
  return Object.freeze({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGb: navigatorWithMemory.deviceMemory ?? null,
    viewport: Object.freeze({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    }),
    webgl: Object.freeze({
      version: String(gl.getParameter(gl.VERSION)),
      shadingLanguageVersion: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
      vendor: debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : null,
      renderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null,
    }),
  });
}

async function fetchBytes(url: string, role: string): Promise<Uint8Array> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${role.toUpperCase()}_FETCH_FAILED ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function parseGltf(bytes: Uint8Array): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const buffer = bytes.slice().buffer;
    new GLTFLoader().parse(
      buffer,
      new URL('.', window.location.href).href,
      (gltf) => resolve(gltf.scene),
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    );
  });
}

function inspectGlbDocument(bytes: Uint8Array): GlbDocumentFacts {
  if (bytes.byteLength < 20) throw new Error('PRESS_HALL_GLB_HEADER_TRUNCATED');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    throw new Error('PRESS_HALL_GLB_HEADER_INVALID');
  }
  if (view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a) {
    throw new Error('PRESS_HALL_GLB_LENGTH_OR_JSON_CHUNK_INVALID');
  }
  const jsonLength = view.getUint32(12, true);
  if (20 + jsonLength > bytes.byteLength) throw new Error('PRESS_HALL_GLB_JSON_TRUNCATED');
  const json = JSON.parse(
    new TextDecoder('utf-8', { fatal: true })
      .decode(bytes.subarray(20, 20 + jsonLength))
      .replace(/[\u0000\u0020]+$/u, ''),
  ) as {
    readonly asset?: { readonly generator?: unknown };
    readonly materials?: readonly {
      readonly name?: unknown;
      readonly pbrMetallicRoughness?: {
        readonly baseColorFactor?: unknown;
        readonly baseColorTexture?: unknown;
        readonly metallicFactor?: unknown;
        readonly roughnessFactor?: unknown;
      };
    }[];
    readonly images?: readonly unknown[];
    readonly textures?: readonly unknown[];
    readonly extensionsUsed?: readonly unknown[];
  };
  const materials = Array.isArray(json.materials) ? json.materials : [];
  const materialFacts = materials.map((material, index) => {
    const pbr = material.pbrMetallicRoughness;
    const baseColor = Array.isArray(pbr?.baseColorFactor)
      && pbr.baseColorFactor.length === 4
      && pbr.baseColorFactor.every((value: unknown) => (
        typeof value === 'number' && Number.isFinite(value)
      ))
      ? Object.freeze([...pbr.baseColorFactor] as number[])
      : null;
    return Object.freeze({
      name: typeof material.name === 'string' ? material.name : `material_${index}`,
      baseColorFactor: baseColor,
      metallicFactor: typeof pbr?.metallicFactor === 'number' ? pbr.metallicFactor : 1,
      roughnessFactor: typeof pbr?.roughnessFactor === 'number' ? pbr.roughnessFactor : 1,
    });
  });
  return Object.freeze({
    generator: typeof json.asset?.generator === 'string' ? json.asset.generator : null,
    materialNames: Object.freeze(materialFacts.map((material) => material.name)),
    materials: Object.freeze(materialFacts),
    explicitBaseColorFactorCount: materials.filter((material) => (
      Array.isArray(material.pbrMetallicRoughness?.baseColorFactor)
    )).length,
    baseColorTextureReferenceCount: materials.filter((material) => (
      material.pbrMetallicRoughness?.baseColorTexture !== undefined
    )).length,
    imageCount: Array.isArray(json.images) ? json.images.length : 0,
    textureCount: Array.isArray(json.textures) ? json.textures.length : 0,
    extensionsUsed: Object.freeze((Array.isArray(json.extensionsUsed) ? json.extensionsUsed : [])
      .filter((extension): extension is string => typeof extension === 'string')),
  });
}

function inspectArt(root: THREE.Object3D): ArtInspectionFacts {
  let nodeCount = 0;
  let meshCount = 0;
  let primitiveCount = 0;
  let triangleCount = 0;
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object.parent === root) nodeCount += 1;
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    meshCount += 1;
    const groups = mesh.geometry.groups.length;
    primitiveCount += Math.max(1, groups);
    const position = mesh.geometry.getAttribute('position');
    const indexCount = mesh.geometry.index?.count ?? position?.count ?? 0;
    triangleCount += Math.floor(indexCount / 3);
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of meshMaterials) materials.add(material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });
  const facts = Object.freeze({
    nodeCount,
    meshCount,
    primitiveCount,
    triangleCount,
    materialCount: materials.size,
    materials: Object.freeze([...materials].map((material) => {
      const pbr = material as THREE.MeshStandardMaterial;
      return Object.freeze({
        name: material.name,
        colorLinear: pbr.color ? Object.freeze(pbr.color.toArray()) : null,
        metalness: typeof pbr.metalness === 'number' ? pbr.metalness : null,
        roughness: typeof pbr.roughness === 'number' ? pbr.roughness : null,
      });
    }).sort((left, right) => left.name.localeCompare(right.name))),
  });
  if (facts.nodeCount !== ART_NODE_COUNT
    || facts.meshCount !== ART_MESH_COUNT
    || facts.primitiveCount !== ART_PRIMITIVE_COUNT
    || facts.triangleCount !== ART_TRIANGLE_COUNT
    || facts.materialCount !== ART_MATERIAL_COUNT) {
    throw new Error(`PRESS_HALL_ART_STRUCTURE_MISMATCH ${JSON.stringify(facts)}`);
  }
  return facts;
}

function auditRuntimeMaterials(
  documentFacts: GlbDocumentFacts,
  artFacts: ArtInspectionFacts,
  artConfig: ArtConfig,
): RuntimeMaterialAudit {
  const whiteFallbackMaterialCount = artFacts.materials.filter((material) => (
    material.colorLinear?.every((value) => value >= 0.9)
  )).length;
  if (artConfig.explicitBaseColorFactorCount === 0) {
    return Object.freeze({
      instantiatedMaterialCount: artFacts.materials.length,
      whiteFallbackMaterialCount,
      maximumBaseColorDelta: null,
      maximumMetalnessDelta: null,
      maximumRoughnessDelta: null,
      instantiatedValuesMatchExplicitGltf: null,
    });
  }
  const instantiatedByName = new Map(artFacts.materials.map((material) => [material.name, material]));
  const comparisons = documentFacts.materials.map((expected) => {
    const actual = instantiatedByName.get(expected.name);
    if (!actual || !expected.baseColorFactor || !actual.colorLinear
      || actual.metalness === null || actual.roughness === null) {
      throw new Error(`PRESS_HALL_RUNTIME_MATERIAL_MISSING ${expected.name}`);
    }
    return Object.freeze({
      baseColorDelta: Math.max(...expected.baseColorFactor.slice(0, 3).map(
        (value, component) => Math.abs(value - actual.colorLinear![component]),
      )),
      metalnessDelta: Math.abs(expected.metallicFactor - actual.metalness),
      roughnessDelta: Math.abs(expected.roughnessFactor - actual.roughness),
    });
  });
  const audit = Object.freeze({
    instantiatedMaterialCount: artFacts.materials.length,
    whiteFallbackMaterialCount,
    maximumBaseColorDelta: Math.max(...comparisons.map((entry) => entry.baseColorDelta)),
    maximumMetalnessDelta: Math.max(...comparisons.map((entry) => entry.metalnessDelta)),
    maximumRoughnessDelta: Math.max(...comparisons.map((entry) => entry.roughnessDelta)),
    instantiatedValuesMatchExplicitGltf: comparisons.every((entry) => (
      entry.baseColorDelta <= 1e-6
      && entry.metalnessDelta <= 1e-6
      && entry.roughnessDelta <= 1e-6
    )),
  });
  if (audit.instantiatedMaterialCount !== ART_MATERIAL_COUNT
    || audit.whiteFallbackMaterialCount !== 0
    || !audit.instantiatedValuesMatchExplicitGltf) {
    throw new Error(`PRESS_HALL_RUNTIME_MATERIAL_DRIFT ${JSON.stringify(audit)}`);
  }
  return audit;
}

function mapEulerQuaternion(rotation: Readonly<{ x: number; y: number; z: number }>): THREE.Quaternion {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(rotation.x / 1_000),
    THREE.MathUtils.degToRad(rotation.y / 1_000),
    THREE.MathUtils.degToRad(rotation.z / 1_000),
    'XYZ',
  );
  const mapQuaternion = new THREE.Quaternion().setFromEuler(euler);
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
    new THREE.Vector3(center.x / 1_000, center.y / 1_000, -center.z / 1_000),
    mapEulerQuaternion(rotation),
    new THREE.Vector3(
      (halfExtents.x * 2) / 1_000,
      (halfExtents.y * 2) / 1_000,
      (halfExtents.z * 2) / 1_000,
    ),
  );
}

function createAuthorityOverlay(loaded: LoadedRuntimeMapPackage): THREE.Group {
  const group = new THREE.Group();
  group.name = 'REVISION_2_AUTHORITY_INSPECTION_OVERLAY_NOT_ART_AUTHORITY';

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const solidMaterial = new THREE.MeshBasicMaterial({
    color: 0xffa449,
    transparent: true,
    opacity: 0.16,
    wireframe: true,
    depthWrite: false,
  });
  const solids = new THREE.InstancedMesh(
    unitBox,
    solidMaterial,
    loaded.authority.fixture.solids.length,
  );
  solids.name = 'LOCKED_REVISION_2_AUTHORITY_SOLIDS';
  loaded.authority.fixture.solids.forEach((solid, index) => {
    if (solid.shape.type !== 'box') throw new Error('PRESS_HALL_AUTHORITY_NON_BOX_UNSUPPORTED');
    solids.setMatrixAt(index, matrixForFixture(
      solid.centerMm,
      solid.rotationMilliDegrees,
      solid.shape.halfExtentsMm,
    ));
  });
  solids.instanceMatrix.needsUpdate = true;
  group.add(solids);

  const volumeMaterial = new THREE.MeshBasicMaterial({
    color: 0xff3f52,
    transparent: true,
    opacity: 0.18,
    wireframe: true,
    depthWrite: false,
  });
  const volumes = new THREE.InstancedMesh(
    unitBox,
    volumeMaterial,
    loaded.authority.fixture.volumes.length,
  );
  volumes.name = 'LOCKED_REVISION_2_AUTHORITY_VOLUMES';
  loaded.authority.fixture.volumes.forEach((volume, index) => {
    if (volume.shape.type !== 'box') throw new Error('PRESS_HALL_AUTHORITY_VOLUME_NON_BOX');
    volumes.setMatrixAt(index, matrixForFixture(
      volume.centerMm,
      volume.rotationMilliDegrees,
      volume.shape.halfExtentsMm,
    ));
  });
  volumes.instanceMatrix.needsUpdate = true;
  group.add(volumes);

  const spawnGeometry = new THREE.ConeGeometry(0.12, 0.42, 10);
  const spawnMaterial = new THREE.MeshBasicMaterial({ color: 0x5ce2bb });
  const spawns = new THREE.InstancedMesh(
    spawnGeometry,
    spawnMaterial,
    loaded.manifest.spawns.length,
  );
  spawns.name = 'LOCKED_REVISION_2_SPAWN_MARKERS';
  loaded.manifest.spawns.forEach((spawn, index) => {
    spawns.setMatrixAt(index, new THREE.Matrix4().makeTranslation(
      spawn.feetPositionMm.x / 1_000,
      spawn.feetPositionMm.y / 1_000 + 0.21,
      -spawn.feetPositionMm.z / 1_000,
    ));
  });
  spawns.instanceMatrix.needsUpdate = true;
  group.add(spawns);
  return group;
}

function fact(label: string, value: string): HTMLElement {
  const node = element('div', 'ph-runtime__fact');
  node.append(element('span', '', label), element('strong', '', value));
  return node;
}

function renderUnsupported(
  root: HTMLElement,
  request: Extract<PressHallInspectionRequest, { kind: 'unsupported' }>,
): void {
  const requested = request.references.length > 0 ? request.references.join(', ') : '(empty)';
  const main = element('main', 'ph-runtime__error');
  main.id = 'press-hall-inspection-result';
  main.setAttribute('role', 'alert');
  main.textContent = [
    'UNSUPPORTED PRESS HALL ART INSPECTION REQUEST',
    '',
    `Requested: ${requested}`,
    '',
    'No art, authority package, or Offline Practice fallback was loaded.',
  ].join('\n');
  const back = element('a', 'ph-runtime__return', 'RETURN TO OFFLINE PRACTICE');
  back.href = window.location.pathname;
  main.append(document.createElement('br'), back);
  root.replaceChildren(routeStyles(), main);
  root.dataset.launchSupport = 'press-hall-inspection';
  root.dataset.pressHallStatus = 'unsupported';
}

function buildSnapshot(state: RuntimeState) {
  const size = state.sceneBounds.getSize(new THREE.Vector3());
  const minimum = state.sceneBounds.min;
  const maximum = state.sceneBounds.max;
  const revisionToken = state.artConfig.revision.replace('.', '_');
  return Object.freeze({
    schemaVersion: 1,
    status: `PRESS_HALL_V${revisionToken}_RUNTIME_INSPECTION_READY_G5_G8_OPEN`,
    selection: Object.freeze({
      source: state.selection.source,
      explicit: true,
      reference: state.selection.reference,
      mapId: state.selection.mapId,
      mapRevision: state.selection.mapRevision,
      artRevision: state.selection.artRevision,
      exportVariant: state.selection.exportVariant,
    }),
    catalogDefault: Object.freeze({
      mapId: DEFAULT_MAP_ID,
      mapRevision: DEFAULT_MAP_REVISION,
      unchanged: true,
    }),
    art: Object.freeze({
      role: 'presentation_only',
      path: state.artConfig.sourcePath,
      requestUrl: new URL(state.artConfig.url, window.location.href).pathname,
      bytes: state.artBytes.byteLength,
      sha256: state.artSha256,
      expectedSha256: state.artConfig.sha256,
      hashVerified: true,
      loadedBy: 'THREE.GLTFLoader.parse',
      nodeCount: state.artFacts.nodeCount,
      meshCount: state.artFacts.meshCount,
      primitiveCount: state.artFacts.primitiveCount,
      triangleCount: state.artFacts.triangleCount,
      materialCount: state.artFacts.materialCount,
      textureCount: state.documentFacts.textureCount,
      materialEncoding: Object.freeze({
        generator: state.documentFacts.generator,
        names: state.documentFacts.materialNames,
        explicitBaseColorFactorCount: state.documentFacts.explicitBaseColorFactorCount,
        baseColorTextureReferenceCount: state.documentFacts.baseColorTextureReferenceCount,
        imageCount: state.documentFacts.imageCount,
        textureCount: state.documentFacts.textureCount,
        extensionsUsed: state.documentFacts.extensionsUsed,
        runtimeColorParityWithBlenderReview: state.documentFacts.explicitBaseColorFactorCount > 0
          || state.documentFacts.baseColorTextureReferenceCount > 0,
        instantiatedMaterialCount: state.runtimeMaterialAudit.instantiatedMaterialCount,
        whiteFallbackMaterialCount: state.runtimeMaterialAudit.whiteFallbackMaterialCount,
        maximumBaseColorDelta: state.runtimeMaterialAudit.maximumBaseColorDelta,
        maximumMetalnessDelta: state.runtimeMaterialAudit.maximumMetalnessDelta,
        maximumRoughnessDelta: state.runtimeMaterialAudit.maximumRoughnessDelta,
        instantiatedValuesMatchExplicitGltf: state.runtimeMaterialAudit.instantiatedValuesMatchExplicitGltf,
      }),
      boundsMeters: Object.freeze({
        minimum: Object.freeze({ x: minimum.x, y: minimum.y, z: minimum.z }),
        maximum: Object.freeze({ x: maximum.x, y: maximum.y, z: maximum.z }),
        size: Object.freeze({ x: size.x, y: size.y, z: size.z }),
      }),
    }),
    authorityAlignment: Object.freeze({
      role: 'separate_authority_fixture_overlay',
      mapId: state.loadedMap.identity.id,
      mapRevision: state.loadedMap.identity.revision,
      packageDigest: state.loadedMap.identity.packageDigest,
      fixtureHash: state.loadedMap.authority.fixtureHash,
      collisionSha256: state.loadedMap.authority.collisionSha256,
      solidColliderCount: state.loadedMap.authority.fixture.solids.length,
      authorityVolumeCount: state.loadedMap.authority.fixture.volumes.length,
      spawnCount: state.loadedMap.manifest.spawns.length,
      zoneCount: state.loadedMap.manifest.zones.length,
      artGeometryMayBeAuthority: false,
      overlayVisible: state.authorityOverlayVisible,
      coordinateBinding: 'map X/Y/Z millimeters -> glTF X/Y/-Z meters',
    }),
    renderer: Object.freeze({
      artOnly: state.artRendererFacts,
      artPlusAuthorityOverlay: state.overlayRendererFacts,
      profileOverlayVisible: true,
    }),
    performance: Object.freeze({
      warmupFrames: WARMUP_FRAME_COUNT,
      measuredFrames: PROFILE_FRAME_COUNT,
      frameTimes: state.frameProfile,
      loadTimingMs: state.loadTiming,
      heapBefore: state.heapBefore,
      heapAfter: state.heapAfter,
      namedBrowserHost: state.host,
      qualification: 'BOUNDED_HEADLESS_BROWSER_RUNTIME_PROFILE_NOT_FINAL_NAMED_HARDWARE_SOAK',
    }),
    camera: Object.freeze({
      currentView: state.currentView,
      presetCount: Object.keys(VIEW_PRESETS).length,
      sweep: Object.freeze({
        kind: 'camera_only_visual_readability_sweep',
        status: state.cameraSweep.status,
        completedSegments: state.cameraSweep.completedSegments,
        durationMs: state.cameraSweep.durationMs,
        collisionNoSnagClaim: false,
      }),
    }),
    browserRuntimeErrors: Object.freeze([...state.runtimeErrors]),
    productBoundary: Object.freeze({
      explicitNonDefaultInspection: true,
      loadedIntoOfflinePractice: false,
      playableMatch: false,
      shippingDefaultChanged: false,
      artGeometryUsedForAuthority: false,
      performanceAccepted: false,
      humanAccepted: false,
      g5Passed: false,
      g8Passed: false,
    }),
    nonClaims: Object.freeze([
      'G5_NOT_PASSED',
      'G8_NOT_PASSED',
      'FINAL_ART_NOT_ACCEPTED',
      'HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED',
      'HUMAN_PLAYTEST_ACCEPTANCE_NOT_PASSED',
      ...(state.artConfig.revision === '3.2'
        ? ['RUNTIME_GLTF_COLOR_PARITY_WITH_BLENDER_REVIEW_NOT_PROVEN']
        : ['RUNTIME_MATERIAL_ENCODING_PRESENT_HUMAN_COLOR_ACCEPTANCE_NOT_PASSED']),
      'NO_COLLISION_NO_SNAG_CLAIM_FROM_CAMERA_SWEEP',
      'NOT_SHIPPING_DEFAULT',
      'NO_DEPLOYMENT_OR_PUBLISHING_AUTHORIZATION_USED',
    ]),
  });
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function frameProfile(): Promise<FrameSummary> {
  for (let index = 0; index < WARMUP_FRAME_COUNT; index += 1) await nextFrame();
  const samples: number[] = [];
  let previous = await nextFrame();
  for (let index = 0; index < PROFILE_FRAME_COUNT; index += 1) {
    const now = await nextFrame();
    samples.push(now - previous);
    previous = now;
  }
  return summarizeFrames(samples);
}

export async function mountPressHallInspectionRoute(
  root: HTMLElement,
  request: PressHallInspectionRequest,
): Promise<void> {
  if (request.kind === 'none') throw new Error('PRESS_HALL_EXPLICIT_SELECTION_REQUIRED');
  if (request.kind === 'unsupported') {
    renderUnsupported(root, request);
    return;
  }
  const artConfig = ART_CONFIGS[request.artRevision];
  if (!artConfig || artConfig.revision !== request.artRevision) {
    throw new Error(`PRESS_HALL_ART_REVISION_NOT_CONFIGURED ${request.artRevision}`);
  }
  const totalStartedAt = performance.now();
  const runtimeErrors: string[] = [];
  window.addEventListener('error', (event) => runtimeErrors.push(event.message), { passive: true });
  window.addEventListener('unhandledrejection', (event) => runtimeErrors.push(String(event.reason)), { passive: true });

  const source = getBundledMapPackageSource(request.mapId, request.mapRevision);
  if (!source) throw new Error('PRESS_HALL_REVISION_2_PACKAGE_NOT_BUNDLED');
  const fetchStartedAt = performance.now();
  const [artBytes, lockedRenderBytes, lockedCollisionBytes] = await Promise.all([
    fetchBytes(artConfig.url, `press_hall_v${artConfig.revision}_joined_art`),
    fetchBytes(lockedRenderArtifactUrl, 'locked_revision_2_render'),
    fetchBytes(lockedCollisionArtifactUrl, 'locked_revision_2_collision'),
  ]);
  const fetchEndedAt = performance.now();
  if (artBytes.byteLength !== artConfig.bytes) {
    throw new Error(`PRESS_HALL_ART_SIZE_MISMATCH expected=${artConfig.bytes} actual=${artBytes.byteLength}`);
  }
  const hashStartedAt = performance.now();
  const artSha256 = await sha256Hex(artBytes);
  const hashEndedAt = performance.now();
  if (artSha256 !== artConfig.sha256) {
    throw new Error(`PRESS_HALL_ART_HASH_MISMATCH expected=${artConfig.sha256} actual=${artSha256}`);
  }
  const documentFacts = inspectGlbDocument(artBytes);
  if (documentFacts.materialNames.length !== ART_MATERIAL_COUNT
    || documentFacts.materialNames.slice().sort().join('|') !== ART_MATERIAL_NAMES.join('|')
    || documentFacts.explicitBaseColorFactorCount !== artConfig.explicitBaseColorFactorCount
    || documentFacts.baseColorTextureReferenceCount !== 0
    || documentFacts.imageCount !== 0
    || documentFacts.textureCount !== 0) {
    throw new Error(`PRESS_HALL_GLB_MATERIAL_DOCUMENT_MISMATCH ${JSON.stringify(documentFacts)}`);
  }

  const authorityStartedAt = performance.now();
  const loadedMap = await loadRuntimeMapPackage(source, {
    render: lockedRenderBytes,
    collision: lockedCollisionBytes,
  });
  const authorityEndedAt = performance.now();
  if (loadedMap.identity.id !== INKFALL_AUTHORITY_MAP_IDENTITY_V2.mapId
    || loadedMap.identity.revision !== INKFALL_AUTHORITY_MAP_IDENTITY_V2.mapRevision
    || loadedMap.identity.packageDigest !== INKFALL_AUTHORITY_MAP_IDENTITY_V2.packageDigest
    || loadedMap.authority.fixtureHash !== INKFALL_AUTHORITY_MAP_IDENTITY_V2.fixtureHash
    || loadedMap.authority.fixture.solids.length !== INKFALL_AUTHORITY_MAP_IDENTITY_V2.colliderCardinality) {
    throw new Error('PRESS_HALL_REVISION_2_AUTHORITY_IDENTITY_MISMATCH');
  }

  const parseStartedAt = performance.now();
  const art = await parseGltf(artBytes);
  const artFacts = inspectArt(art);
  const runtimeMaterialAudit = auditRuntimeMaterials(documentFacts, artFacts, artConfig);
  const parseEndedAt = performance.now();
  art.name = `PRESS_HALL_V${artConfig.revision.replace('.', '_')}_PRESENTATION_ONLY`;

  const canvas = element('canvas', 'ph-runtime__canvas');
  canvas.id = 'press-hall-runtime-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', `Interactive Press Hall v${artConfig.revision} joined-art runtime inspection viewport`);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1012);
  scene.fog = new THREE.Fog(0x0b1012, 35, 78);
  scene.add(art);
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x20150d, 1.85));
  const key = new THREE.DirectionalLight(0xffe1bd, 3.1);
  key.position.set(-12, 18, 11);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8acddd, 2.0);
  fill.position.set(14, 8, -9);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xff7557, 1.1);
  rim.position.set(0, 4, 13);
  scene.add(rim);

  const authorityOverlay = createAuthorityOverlay(loadedMap);
  scene.add(authorityOverlay);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 160);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 0.5;
  controls.maxDistance = 80;
  controls.maxPolarAngle = Math.PI * 0.49;
  let currentView: InspectionView = 'gameplay';
  let state: RuntimeState | null = null;
  function selectView(view: InspectionView): void {
    if (!(view in VIEW_PRESETS)) throw new Error(`PRESS_HALL_UNKNOWN_VIEW ${view}`);
    const preset = VIEW_PRESETS[view];
    camera.position.fromArray(preset.position);
    controls.target.fromArray(preset.target);
    controls.update();
    currentView = view;
    if (state) state.currentView = view;
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-press-hall-view]')) {
      button.setAttribute('aria-pressed', String(button.dataset.pressHallView === view));
    }
  }
  selectView('gameplay');

  const ui = element('main', 'ph-runtime__ui');
  ui.id = 'press-hall-inspection-result';
  const rail = element('div', 'ph-runtime__rail');
  rail.append(element('div', 'ph-runtime__boundary', 'Explicit non-default runtime inspection · presentation art + separate revision-2 authority overlay · G5 / G8 open'));
  const back = element('a', 'ph-runtime__return', '← Offline Practice');
  back.href = window.location.pathname;
  rail.append(back);
  ui.append(rail);

  const panel = element('section', 'ph-runtime__panel');
  panel.append(
    element('p', 'ph-runtime__kicker', 'Inkfall Foundry · Press Hall candidate'),
    element('h1', '', `Press Hall v${artConfig.revision}`),
    element('p', 'ph-runtime__identity', `${request.reference}\nart ${artConfig.sha256}\nauthority ${loadedMap.identity.packageDigest}\nfixture ${loadedMap.authority.fixtureHash}`),
  );
  const facts = element('div', 'ph-runtime__facts');
  const callsFact = fact('art calls', 'profiling');
  const frameFact = fact('frame p95', 'profiling');
  facts.append(
    callsFact,
    fact('triangles', ART_TRIANGLE_COUNT.toLocaleString('en-US')),
    frameFact,
    fact('primitives', String(ART_PRIMITIVE_COUNT)),
    fact('colliders', String(loadedMap.authority.fixture.solids.length)),
    fact('payload', `${(artConfig.bytes / 1_000_000).toFixed(2)} MB`),
  );
  panel.append(facts);
  const controlsRow = element('div', 'ph-runtime__controls');
  for (const view of Object.keys(VIEW_PRESETS) as InspectionView[]) {
    const button = element('button', '', view);
    button.type = 'button';
    button.dataset.pressHallView = view;
    button.setAttribute('aria-pressed', String(view === 'gameplay'));
    button.addEventListener('click', () => selectView(view));
    controlsRow.append(button);
  }
  const overlayButton = element('button', '', 'authority overlay');
  overlayButton.type = 'button';
  overlayButton.id = 'press-hall-authority-overlay';
  overlayButton.setAttribute('aria-pressed', 'true');
  controlsRow.append(overlayButton);
  const sweepButton = element('button', '', 'run camera sweep');
  sweepButton.type = 'button';
  sweepButton.id = 'press-hall-camera-sweep';
  controlsRow.append(sweepButton);
  panel.append(controlsRow);
  const profileText = element('p', 'ph-runtime__profile', `LOADING VERIFIED GLB · ${ART_NODE_COUNT} NODES · ${ART_PRIMITIVE_COUNT} PRIMITIVES\nAuthority boxes are inspection overlays only; render geometry is never authority.`);
  panel.append(profileText);
  ui.append(panel);
  ui.append(element('p', 'ph-runtime__footer', 'Camera sweep is visual-only · no collision/no-snag claim · not final art · no human acceptance · not shipping default · G5 and G8 remain open'));
  root.replaceChildren(routeStyles(), canvas, ui);

  let disposed = false;
  function animate(): void {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
  const resize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  };
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pagehide', () => {
    disposed = true;
    controls.dispose();
    renderer.dispose();
    window.removeEventListener('resize', resize);
  }, { once: true });

  const originalOverlayVisibility = authorityOverlay.visible;
  authorityOverlay.visible = false;
  renderer.render(scene, camera);
  const artRendererFacts = rendererFacts(renderer);
  authorityOverlay.visible = true;
  renderer.render(scene, camera);
  const overlayRendererFacts = rendererFacts(renderer);
  authorityOverlay.visible = originalOverlayVisibility;
  if (artRendererFacts.calls < 1
    || artRendererFacts.calls > ART_PRIMITIVE_COUNT
    || artRendererFacts.triangles < 1
    || artRendererFacts.triangles > ART_TRIANGLE_COUNT) {
    throw new Error(`PRESS_HALL_RENDERER_FACT_MISMATCH ${JSON.stringify(artRendererFacts)}`);
  }

  const heapBefore = heapFacts();
  const measuredFrameProfile = await frameProfile();
  const heapAfter = heapFacts();
  const cameraSweep: CameraSweepState = {
    status: 'not_started',
    startedAtMs: null,
    completedAtMs: null,
    durationMs: null,
    completedSegments: 0,
  };
  state = {
    selection: request,
    artConfig,
    artBytes,
    artSha256,
    documentFacts,
    artFacts,
    runtimeMaterialAudit,
    loadedMap,
    sceneBounds: new THREE.Box3().setFromObject(art),
    artRendererFacts,
    overlayRendererFacts,
    loadTiming: Object.freeze({
      fetchMs: fetchEndedAt - fetchStartedAt,
      hashMs: hashEndedAt - hashStartedAt,
      parseMs: parseEndedAt - parseStartedAt,
      authorityValidationMs: authorityEndedAt - authorityStartedAt,
      totalMs: performance.now() - totalStartedAt,
    }),
    frameProfile: measuredFrameProfile,
    heapBefore,
    heapAfter,
    host: browserHostFacts(renderer),
    runtimeErrors,
    cameraSweep,
    currentView,
    authorityOverlayVisible: authorityOverlay.visible,
  };

  function setAuthorityOverlay(visible: boolean): void {
    authorityOverlay.visible = Boolean(visible);
    state!.authorityOverlayVisible = authorityOverlay.visible;
    overlayButton.setAttribute('aria-pressed', String(authorityOverlay.visible));
  }
  overlayButton.addEventListener('click', () => setAuthorityOverlay(!authorityOverlay.visible));

  let sweepPromise: Promise<void> | null = null;
  function startCameraSweep(): Promise<void> {
    if (sweepPromise) return sweepPromise;
    sweepPromise = (async () => {
      cameraSweep.status = 'running';
      cameraSweep.startedAtMs = performance.now();
      cameraSweep.completedSegments = 0;
      sweepButton.disabled = true;
      const sequence: readonly InspectionView[] = ['gameplay', 'north', 'overhead', 'south', 'gameplay'];
      for (let index = 0; index < sequence.length; index += 1) {
        selectView(sequence[index]);
        const segmentStarted = performance.now();
        while (performance.now() - segmentStarted < 420) await nextFrame();
        if (index > 0) cameraSweep.completedSegments += 1;
      }
      cameraSweep.completedAtMs = performance.now();
      cameraSweep.durationMs = cameraSweep.completedAtMs - cameraSweep.startedAtMs!;
      cameraSweep.status = 'complete';
      sweepButton.textContent = 'camera sweep complete';
      profileText.textContent += `\nVisual camera sweep complete: ${cameraSweep.completedSegments} segments / ${cameraSweep.durationMs.toFixed(1)} ms. No collision claim.`;
    })();
    return sweepPromise;
  }
  sweepButton.addEventListener('click', () => void startCameraSweep());

  Object.defineProperty(window, '__KYX_PRESS_HALL_INSPECTION__', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      schemaVersion: 1,
      getSnapshot: () => structuredClone(buildSnapshot(state!)),
      selectView,
      setAuthorityOverlay,
      startCameraSweep,
    }),
  });
  callsFact.querySelector('strong')!.textContent = String(artRendererFacts.calls);
  frameFact.querySelector('strong')!.textContent = `${measuredFrameProfile.p95Ms.toFixed(2)} ms`;
  profileText.textContent = [
    `VERIFIED + PARSED · ART ${artRendererFacts.calls} CALLS / ${artRendererFacts.triangles.toLocaleString('en-US')} TRIANGLES`,
    `WITH AUTHORITY OVERLAY · ${overlayRendererFacts.calls} CALLS / ${loadedMap.authority.fixture.solids.length} LOCKED SOLIDS`,
    `FRAME ${measuredFrameProfile.count} SAMPLES AFTER ${WARMUP_FRAME_COUNT} WARMUP · P50 ${measuredFrameProfile.p50Ms.toFixed(2)} · P95 ${measuredFrameProfile.p95Ms.toFixed(2)} · P99 ${measuredFrameProfile.p99Ms.toFixed(2)} MS`,
    artConfig.revision === '3.2'
      ? `RUNTIME MATERIAL BLOCKER · ${documentFacts.explicitBaseColorFactorCount}/${ART_MATERIAL_COUNT} EXPLICIT BASE COLORS · ${documentFacts.baseColorTextureReferenceCount} BASE-COLOR TEXTURES`
      : `RUNTIME MATERIAL VERIFIED · ${documentFacts.explicitBaseColorFactorCount}/${ART_MATERIAL_COUNT} EXPLICIT BASE COLORS · ${runtimeMaterialAudit.whiteFallbackMaterialCount} WHITE FALLBACKS · MAX COLOR DELTA ${runtimeMaterialAudit.maximumBaseColorDelta}`,
    'Authority boxes are inspection overlays only; render geometry is never authority.',
  ].join('\n');
  document.title = `Press Hall v${artConfig.revision} — Runtime Inspection`;
  root.dataset.launchSupport = `press-hall-v${artConfig.revision.replace('.', '-')}-inspection`;
  root.dataset.pressHallStatus = 'ready';
  root.dataset.pressHallReference = request.reference;
  root.dataset.catalogDefault = `${DEFAULT_MAP_ID}@${DEFAULT_MAP_REVISION}`;
}
