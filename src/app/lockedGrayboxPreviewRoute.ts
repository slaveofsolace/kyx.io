import lockedRenderArtifactUrl from '../../assets/source/maps/inkfall-foundry/revisions/revision-2/export/render.graybox.glb?url';
import lockedCollisionArtifactUrl from '../../assets/source/maps/inkfall-foundry/revisions/revision-2/export/collision.authority.glb?url';

import {
  DEFAULT_MAP_ID,
  DEFAULT_MAP_REVISION,
  getBundledGrayboxLockRevision,
  getBundledLockedGrayboxPackageSource,
} from '../content/maps';
import {
  loadRuntimeMapPackage,
  type LoadedRuntimeMapPackage,
} from '../physics';
import type {
  LockedGrayboxPreviewRequest,
  LockedGrayboxPreviewSelection,
} from './lockedGrayboxSelection';

interface LockedGrayboxPreviewSnapshot {
  readonly schemaVersion: 1;
  readonly status: 'LOCKED_GRAYBOX_EXPLICIT_PREVIEW_READY_G5_OPEN';
  readonly selection: {
    readonly source: 'explicit_query';
    readonly explicit: true;
    readonly reference: string;
    readonly mapId: string;
    readonly mapRevision: number;
  };
  readonly catalogDefault: {
    readonly mapId: string;
    readonly mapRevision: number;
    readonly unchanged: true;
  };
  readonly package: {
    readonly displayName: string;
    readonly digest: string;
    readonly boundsMm: LoadedRuntimeMapPackage['identity']['boundsMm'];
    readonly zoneCount: number;
    readonly spawnCount: number;
    readonly authorityVolumeCount: number;
  };
  readonly assets: {
    readonly requestedSeparately: true;
    readonly render: {
      readonly role: 'render_only';
      readonly path: string;
      readonly bytes: number;
      readonly sha256: string;
      readonly meshNodeCount: number;
      readonly verified: true;
    };
    readonly authorityCollision: {
      readonly role: 'authority_collision';
      readonly path: string;
      readonly bytes: number;
      readonly sha256: string;
      readonly meshNodeCount: number;
      readonly authorityVolumeCount: number;
      readonly totalColliderCount: number;
      readonly fixtureHash: string;
      readonly verified: true;
    };
  };
  readonly productBoundary: {
    readonly loadedIntoOfflinePractice: false;
    readonly playableFromPreview: false;
    readonly shippingDefaultChanged: false;
    readonly finalArt: false;
    readonly performanceAccepted: false;
    readonly g5Passed: false;
  };
  readonly nonClaims: readonly string[];
}

interface LockedGrayboxPreviewSurface {
  readonly schemaVersion: 1;
  readonly getSnapshot: () => LockedGrayboxPreviewSnapshot;
}

declare global {
  interface Window {
    readonly __KYX_LOCKED_GRAYBOX_PREVIEW__?: LockedGrayboxPreviewSurface;
  }
}

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
    :root { color-scheme: dark; background: #070a0b; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; overflow: auto; background: #070a0b; color: #edf3ed; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .locked-map { width: min(1440px, calc(100% - 40px)); margin: 0 auto; padding: 28px 0 52px; }
    .locked-map__rail { display: flex; justify-content: space-between; align-items: center; gap: 18px; margin-bottom: 22px; }
    .locked-map__boundary { display: inline-flex; align-items: center; gap: 8px; padding: 8px 11px; border: 1px solid #e8a14b; background: #271a0a; color: #ffd08a; font: 900 10px/1 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; }
    .locked-map__return { color: #a9bbb1; font: 850 11px/1 ui-monospace, monospace; letter-spacing: .08em; text-decoration: none; text-transform: uppercase; }
    .locked-map__return:hover, .locked-map__return:focus-visible { color: #fff; }
    .locked-map__hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 28px; align-items: end; padding: 28px 0 24px; border-top: 1px solid #242b27; }
    .locked-map__kicker { margin: 0 0 8px; color: #55d9b2; font: 900 11px/1 ui-monospace, monospace; letter-spacing: .18em; text-transform: uppercase; }
    .locked-map h1 { margin: 0; font-size: clamp(42px, 7vw, 82px); line-height: .88; letter-spacing: -.06em; text-transform: uppercase; }
    .locked-map__copy { max-width: 810px; margin: 16px 0 0; color: #9caaa1; font-size: 14px; line-height: 1.65; }
    .locked-map__selection { min-width: 290px; padding: 15px; border: 1px solid #2c3832; background: #0e1411; }
    .locked-map__selection span { display: block; color: #74837a; font: 800 9px/1 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; }
    .locked-map__selection strong { display: block; margin-top: 9px; color: #f4fff8; font: 900 17px/1.25 ui-monospace, monospace; }
    .locked-map__selection em { display: block; margin-top: 7px; color: #55d9b2; font: 800 10px/1.35 ui-monospace, monospace; font-style: normal; }
    .locked-map__streams { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 4px 0 14px; }
    .asset-stream { min-width: 0; padding: 18px; border: 1px solid #2a312d; background: linear-gradient(145deg, #111613, #0c100e); box-shadow: inset 4px 0 var(--accent); }
    .asset-stream--render { --accent: #55d9b2; }
    .asset-stream--authority { --accent: #ed9c4b; }
    .asset-stream__top { display: flex; justify-content: space-between; gap: 16px; align-items: start; }
    .asset-stream__eyebrow { color: var(--accent); font: 900 10px/1 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; }
    .asset-stream__state { color: #dff8e9; font: 850 9px/1 ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; }
    .asset-stream h2 { margin: 12px 0 7px; font-size: 20px; line-height: 1.1; }
    .asset-stream__path { margin: 0; color: #809087; font: 650 10px/1.5 ui-monospace, monospace; overflow-wrap: anywhere; }
    .asset-stream__facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin-top: 15px; background: #26302a; }
    .asset-stream__fact { min-width: 0; padding: 11px; background: #0b100d; }
    .asset-stream__fact span { display: block; color: #718077; font: 750 8px/1 ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; }
    .asset-stream__fact strong { display: block; margin-top: 7px; color: #e9f0eb; font: 850 11px/1.25 ui-monospace, monospace; overflow-wrap: anywhere; }
    .locked-map__grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(310px, .65fr); gap: 14px; }
    .locked-map__panel { border: 1px solid #29312d; background: #0d110f; }
    .locked-map__panel-head { display: flex; justify-content: space-between; gap: 16px; padding: 13px 15px; border-bottom: 1px solid #29312d; color: #dfe8e2; font: 900 10px/1 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; }
    .locked-map__panel-head span:last-child { color: #758279; font-weight: 700; letter-spacing: .04em; }
    .locked-map__canvas-wrap { padding: 12px; }
    .locked-map__canvas { display: block; width: 100%; height: auto; border: 1px solid #253029; background: #080c0a; }
    .locked-map__legend { display: flex; flex-wrap: wrap; gap: 14px; padding: 0 14px 14px; color: #7d8981; font: 750 9px/1.4 ui-monospace, monospace; }
    .locked-map__legend i { display: inline-block; width: 9px; height: 9px; margin-right: 6px; background: var(--swatch); }
    .boundary-list { display: grid; gap: 1px; margin: 0; padding: 0; list-style: none; background: #29312d; }
    .boundary-list li { padding: 15px; background: #0d110f; }
    .boundary-list strong { display: block; color: #e7eee9; font: 850 11px/1.3 ui-monospace, monospace; }
    .boundary-list span { display: block; margin-top: 7px; color: #819087; font: 650 10px/1.5 ui-monospace, monospace; }
    .locked-map__nonclaim { margin: 14px 0 0; padding: 14px 15px; border: 1px solid #624625; background: #1b1309; color: #dcb579; font: 750 10px/1.55 ui-monospace, monospace; }
    .locked-map__error { width: min(720px, calc(100% - 40px)); margin: 15vh auto; padding: 26px; border: 1px solid #8b3d2d; background: #1d0b07; color: #ffc2b4; font: 750 13px/1.65 ui-monospace, monospace; }
    @media (max-width: 960px) { .locked-map__hero, .locked-map__grid { grid-template-columns: 1fr; } .locked-map__selection { min-width: 0; } }
    @media (max-width: 720px) { .locked-map { width: min(100% - 20px, 1440px); } .locked-map__rail, .asset-stream__top { align-items: flex-start; flex-direction: column; } .locked-map__streams { grid-template-columns: 1fr; } .asset-stream__facts { grid-template-columns: 1fr; } }
  `;
  return style;
}

async function fetchArtifact(url: string, role: string): Promise<Uint8Array> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${role.toUpperCase()}_FETCH_FAILED ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function drawAuthorityPlan(canvas: HTMLCanvasElement, loaded: LoadedRuntimeMapPackage): void {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('LOCKED_GRAYBOX_CANVAS_UNAVAILABLE');
  const bounds = loaded.identity.boundsMm;
  const padding = 48;
  const scale = Math.min(
    (canvas.width - padding * 2) / (bounds.maximum.x - bounds.minimum.x),
    (canvas.height - padding * 2) / (bounds.maximum.z - bounds.minimum.z),
  );
  const centerX = (bounds.minimum.x + bounds.maximum.x) / 2;
  const centerZ = (bounds.minimum.z + bounds.maximum.z) / 2;
  const project = (x: number, z: number): readonly [number, number] => Object.freeze([
    canvas.width / 2 + (x - centerX) * scale,
    canvas.height / 2 - (z - centerZ) * scale,
  ]);

  context.fillStyle = '#080c0a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#1c2721';
  context.lineWidth = 1;
  for (let x = -30_000; x <= 30_000; x += 10_000) {
    const [screenX] = project(x, 0);
    context.beginPath();
    context.moveTo(screenX, padding);
    context.lineTo(screenX, canvas.height - padding);
    context.stroke();
  }
  for (let z = -20_000; z <= 20_000; z += 10_000) {
    const [, screenY] = project(0, z);
    context.beginPath();
    context.moveTo(padding, screenY);
    context.lineTo(canvas.width - padding, screenY);
    context.stroke();
  }

  for (const solid of loaded.authority.fixture.solids) {
    if (solid.shape.type !== 'box') continue;
    const angle = (solid.rotationMilliDegrees.y / 1_000) * (Math.PI / 180);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const corners = [
      [-solid.shape.halfExtentsMm.x, -solid.shape.halfExtentsMm.z],
      [solid.shape.halfExtentsMm.x, -solid.shape.halfExtentsMm.z],
      [solid.shape.halfExtentsMm.x, solid.shape.halfExtentsMm.z],
      [-solid.shape.halfExtentsMm.x, solid.shape.halfExtentsMm.z],
    ].map(([x, z]) => project(
      solid.centerMm.x + x * cosine - z * sine,
      solid.centerMm.z + x * sine + z * cosine,
    ));
    context.beginPath();
    context.moveTo(corners[0][0], corners[0][1]);
    for (const corner of corners.slice(1)) context.lineTo(corner[0], corner[1]);
    context.closePath();
    context.fillStyle = solid.id.includes('guard_rail') || solid.id.includes('boundary')
      ? 'rgba(237, 91, 67, .48)'
      : solid.id.includes('route') || solid.id.includes('stair')
        ? 'rgba(218, 226, 219, .24)'
        : 'rgba(237, 156, 75, .28)';
    context.fill();
  }

  context.strokeStyle = '#ed9c4b';
  context.lineWidth = 2;
  const [left, top] = project(bounds.minimum.x, bounds.maximum.z);
  const [right, bottom] = project(bounds.maximum.x, bounds.minimum.z);
  context.strokeRect(left, top, right - left, bottom - top);
  context.font = '800 10px ui-monospace, monospace';
  context.textAlign = 'center';
  for (const spawn of loaded.manifest.spawns) {
    const [x, y] = project(spawn.feetPositionMm.x, spawn.feetPositionMm.z);
    context.beginPath();
    context.arc(x, y, 5, 0, Math.PI * 2);
    context.fillStyle = '#55d9b2';
    context.fill();
  }
  context.fillStyle = '#dce5df';
  for (const zone of loaded.manifest.zones) {
    const [x, y] = project(zone.centerMm.x, zone.centerMm.z);
    context.fillText(zone.callout.toUpperCase(), x, y);
  }
  context.textAlign = 'left';
  context.fillStyle = '#829088';
  context.fillText('LOCKED REVISION 2 · AUTHORITY COLLISION PLAN · X/Z MILLIMETERS', padding, 28);
}

function streamFact(label: string, value: string): HTMLElement {
  const node = element('div', 'asset-stream__fact');
  node.append(element('span', '', label), element('strong', '', value));
  return node;
}

function streamCard(
  kind: 'render' | 'authority',
  title: string,
  path: string,
  facts: readonly (readonly [label: string, value: string])[],
): HTMLElement {
  const card = element('article', `asset-stream asset-stream--${kind}`);
  const top = element('div', 'asset-stream__top');
  top.append(
    element('span', 'asset-stream__eyebrow', kind === 'render' ? 'Presentation stream' : 'Authority stream'),
    element('span', 'asset-stream__state', 'Loaded + hash verified'),
  );
  const factGrid = element('div', 'asset-stream__facts');
  for (const [label, value] of facts) factGrid.append(streamFact(label, value));
  card.append(top, element('h2', '', title), element('p', 'asset-stream__path', path), factGrid);
  return card;
}

function renderUnsupported(root: HTMLElement, request: Extract<LockedGrayboxPreviewRequest, { kind: 'unsupported' }>): void {
  const message = request.references.length === 0 ? '(empty)' : request.references.join(', ');
  const main = element('main', 'locked-map__error');
  main.id = 'locked-graybox-preview-result';
  main.setAttribute('role', 'alert');
  main.append(
    element('strong', '', 'UNSUPPORTED EXPLICIT MAP PACKAGE REQUEST'),
    element('p', '', `Requested: ${message}`),
    element('p', '', 'No map package or Offline Practice fallback was loaded.'),
  );
  const back = element('a', 'locked-map__return', 'RETURN TO OFFLINE PRACTICE');
  back.href = window.location.pathname;
  main.append(back);
  root.replaceChildren(routeStyles(), main);
  root.dataset.launchSupport = 'locked-graybox-preview';
  root.dataset.mapPreviewStatus = 'unsupported';
}

function buildSnapshot(
  selection: LockedGrayboxPreviewSelection,
  loaded: LoadedRuntimeMapPackage,
  renderBytes: Uint8Array,
  collisionBytes: Uint8Array,
): LockedGrayboxPreviewSnapshot {
  return Object.freeze({
    schemaVersion: 1,
    status: 'LOCKED_GRAYBOX_EXPLICIT_PREVIEW_READY_G5_OPEN',
    selection: Object.freeze({
      source: selection.source,
      explicit: true,
      reference: selection.reference,
      mapId: loaded.identity.id,
      mapRevision: loaded.identity.revision,
    }),
    catalogDefault: Object.freeze({
      mapId: DEFAULT_MAP_ID,
      mapRevision: DEFAULT_MAP_REVISION,
      unchanged: true,
    }),
    package: Object.freeze({
      displayName: loaded.identity.displayName,
      digest: loaded.identity.packageDigest,
      boundsMm: loaded.identity.boundsMm,
      zoneCount: loaded.manifest.zones.length,
      spawnCount: loaded.manifest.spawns.length,
      authorityVolumeCount: loaded.manifest.authorityVolumes.length,
    }),
    assets: Object.freeze({
      requestedSeparately: true,
      render: Object.freeze({
        role: loaded.manifest.artifacts.render.role,
        path: loaded.presentation.renderPath,
        bytes: renderBytes.byteLength,
        sha256: loaded.presentation.renderSha256,
        meshNodeCount: loaded.presentation.renderMeshNodeCount,
        verified: true,
      }),
      authorityCollision: Object.freeze({
        role: loaded.manifest.artifacts.collision.role,
        path: loaded.authority.collisionPath,
        bytes: collisionBytes.byteLength,
        sha256: loaded.authority.collisionSha256,
        meshNodeCount: loaded.authority.collisionMeshNodeCount,
        authorityVolumeCount: loaded.authority.authorityVolumeCount,
        totalColliderCount: loaded.authority.totalColliderCount,
        fixtureHash: loaded.authority.fixtureHash,
        verified: true,
      }),
    }),
    productBoundary: Object.freeze({
      loadedIntoOfflinePractice: false,
      playableFromPreview: false,
      shippingDefaultChanged: false,
      finalArt: false,
      performanceAccepted: false,
      g5Passed: false,
    }),
    nonClaims: Object.freeze([
      'GRAYBOX_INSPECTION_ONLY',
      'OFFLINE_PRACTICE_MAP_UNCHANGED',
      'NOT_PLAYABLE_FROM_THIS_SURFACE',
      'NOT_FINAL_ART',
      'NO_PERFORMANCE_ACCEPTANCE',
      'NO_SHIPPING_OR_DEPLOYMENT_PROMOTION',
      'G5_REMAINS_OPEN',
    ]),
  });
}

function renderPreview(
  root: HTMLElement,
  selection: LockedGrayboxPreviewSelection,
  loaded: LoadedRuntimeMapPackage,
  snapshot: LockedGrayboxPreviewSnapshot,
): void {
  const main = element('main', 'locked-map');
  main.id = 'locked-graybox-preview-result';
  const rail = element('div', 'locked-map__rail');
  rail.append(element('div', 'locked-map__boundary', 'Locked P6.7 graybox · product inspection only · G5 open'));
  const back = element('a', 'locked-map__return', '← Return to Offline Practice');
  back.href = window.location.pathname;
  rail.append(back);
  main.append(rail);

  const hero = element('header', 'locked-map__hero');
  const heading = element('div', '');
  heading.append(
    element('p', 'locked-map__kicker', 'Explicit non-default package selection'),
    element('h1', '', loaded.identity.displayName),
    element('p', 'locked-map__copy', 'This surface loads the locked revision-2 package for inspection. It verifies the presentation GLB and the separate authority-collision GLB independently. Offline Practice remains the existing Iron Bastion local slice; this preview does not replace or launch it.'),
  );
  const selectionCard = element('div', 'locked-map__selection');
  selectionCard.append(
    element('span', '', 'Selected package'),
    element('strong', '', selection.reference),
    element('em', '', `EXPLICIT @2 · CATALOG DEFAULT REMAINS ${selection.catalogDefault.mapId}@${selection.catalogDefault.mapRevision}`),
  );
  hero.append(heading, selectionCard);
  main.append(hero);

  const streams = element('section', 'locked-map__streams');
  streams.setAttribute('aria-label', 'Separately loaded map artifact streams');
  streams.append(
    streamCard('render', 'RENDER-ONLY GLB', snapshot.assets.render.path, [
      ['role', snapshot.assets.render.role],
      ['bytes', snapshot.assets.render.bytes.toLocaleString('en-US')],
      ['mesh nodes', String(snapshot.assets.render.meshNodeCount)],
      ['sha-256', snapshot.assets.render.sha256],
    ]),
    streamCard('authority', 'AUTHORITY-COLLISION GLB', snapshot.assets.authorityCollision.path, [
      ['role', snapshot.assets.authorityCollision.role],
      ['bytes', snapshot.assets.authorityCollision.bytes.toLocaleString('en-US')],
      ['mesh nodes', String(snapshot.assets.authorityCollision.meshNodeCount)],
      ['fixture', snapshot.assets.authorityCollision.fixtureHash],
    ]),
  );
  main.append(streams);

  const grid = element('section', 'locked-map__grid');
  const planPanel = element('section', 'locked-map__panel');
  const planHead = element('div', 'locked-map__panel-head');
  planHead.append(element('span', '', 'Authority-collision plan'), element('span', '', 'render meshes excluded'));
  const canvasWrap = element('div', 'locked-map__canvas-wrap');
  const canvas = element('canvas', 'locked-map__canvas');
  canvas.width = 1080;
  canvas.height = 700;
  canvas.setAttribute('aria-label', 'Top-down locked Inkfall Foundry revision 2 authority-collision plan');
  canvasWrap.append(canvas);
  const legend = element('div', 'locked-map__legend');
  for (const [label, color] of [
    ['authority geometry', 'rgba(237,156,75,.55)'],
    ['rail / boundary', '#ed5b43'],
    ['route / floor', 'rgba(218,226,219,.55)'],
    ['spawn', '#55d9b2'],
  ] as const) {
    const item = element('span', '');
    const swatch = element('i', '');
    swatch.style.setProperty('--swatch', color);
    item.append(swatch, label);
    legend.append(item);
  }
  planPanel.append(planHead, canvasWrap, legend);

  const boundaryPanel = element('aside', 'locked-map__panel');
  const boundaryHead = element('div', 'locked-map__panel-head');
  boundaryHead.append(element('span', '', 'Product boundary'), element('span', '', 'explicitly preserved'));
  const list = element('ul', 'boundary-list');
  for (const [title, copy] of [
    ['Explicit selection only', `${selection.reference} loads only after the exact mapPackage query is requested.`],
    ['Default revision unchanged', `${DEFAULT_MAP_ID}@${DEFAULT_MAP_REVISION} remains the catalog default.`],
    ['Offline Practice unchanged', 'Returning removes the query and restores the existing Iron Bastion local practice flow.'],
    ['Gate remains open', 'Final art, human playtest acceptance, performance, shipping, and deployment are not claimed.'],
  ] as const) {
    const item = element('li', '');
    item.append(element('strong', '', title), element('span', '', copy));
    list.append(item);
  }
  boundaryPanel.append(
    boundaryHead,
    list,
    element('p', 'locked-map__nonclaim', 'GRAYBOX INSPECTION ONLY · NOT PLAYABLE HERE · NOT FINAL ART · G5 REMAINS OPEN'),
  );
  grid.append(planPanel, boundaryPanel);
  main.append(grid);

  root.replaceChildren(routeStyles(), main);
  drawAuthorityPlan(canvas, loaded);
}

export async function mountLockedGrayboxPreviewRoute(
  root: HTMLElement,
  request: LockedGrayboxPreviewRequest,
): Promise<void> {
  if (request.kind === 'none') throw new Error('LOCKED_GRAYBOX_EXPLICIT_SELECTION_REQUIRED');
  if (request.kind === 'unsupported') {
    renderUnsupported(root, request);
    return;
  }
  const lockedRevision = getBundledGrayboxLockRevision(request.mapId);
  if (lockedRevision !== request.mapRevision) throw new Error('LOCKED_GRAYBOX_CATALOG_BINDING_MISMATCH');
  const source = getBundledLockedGrayboxPackageSource(request.mapId);
  if (!source) throw new Error('LOCKED_GRAYBOX_PACKAGE_NOT_BUNDLED');
  const [renderBytes, collisionBytes] = await Promise.all([
    fetchArtifact(lockedRenderArtifactUrl, 'render'),
    fetchArtifact(lockedCollisionArtifactUrl, 'authority_collision'),
  ]);
  if (renderBytes.buffer === collisionBytes.buffer) throw new Error('LOCKED_GRAYBOX_ARTIFACT_BUFFER_ALIAS');
  const loaded = await loadRuntimeMapPackage(source, {
    render: renderBytes,
    collision: collisionBytes,
  });
  if (loaded.identity.id !== request.mapId || loaded.identity.revision !== request.mapRevision) {
    throw new Error('LOCKED_GRAYBOX_SELECTED_IDENTITY_MISMATCH');
  }
  const snapshot = buildSnapshot(request, loaded, renderBytes, collisionBytes);
  Object.defineProperty(window, '__KYX_LOCKED_GRAYBOX_PREVIEW__', {
    configurable: false,
    value: Object.freeze({
      schemaVersion: 1,
      getSnapshot: () => structuredClone(snapshot),
    }),
    writable: false,
  });
  renderPreview(root, request, loaded, snapshot);
  document.title = `${loaded.identity.displayName} @2 — Locked Graybox Preview`;
  root.dataset.launchSupport = 'locked-graybox-preview';
  root.dataset.mapPreviewStatus = 'ready';
  root.dataset.mapPreviewReference = request.reference;
  root.dataset.catalogDefault = `${DEFAULT_MAP_ID}@${DEFAULT_MAP_REVISION}`;
}
