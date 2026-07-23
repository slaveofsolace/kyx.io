import renderArtifactUrl from '../../assets/source/maps/inkfall-foundry/export/render.graybox.glb?url';
import collisionArtifactUrl from '../../assets/source/maps/inkfall-foundry/export/collision.authority.glb?url';
import savedSpawnFixtures from '../../assets/source/maps/inkfall-foundry/runtime/spawn-fixtures.p6-4.v1.json';
import savedTelemetryFixtures from '../../assets/source/maps/inkfall-foundry/runtime/telemetry-fixtures.p6-5.v1.json';

import {
  createInkfallSpawnAuthority,
  type AuthoritySpawnSelectionInputV1,
  type AuthoritySpawnSelectionResultV1,
} from '../authority/spawn';
import {
  createInkfallAuthorityTelemetry,
  type InkfallTelemetrySnapshotV1,
} from '../authority/telemetry';
import { getBundledMapPackageSource } from '../content/maps';
import {
  loadRuntimeMapPackage,
  type LoadedRuntimeMapPackage,
} from '../physics';

interface ReadOnlyMapEvidenceSnapshot {
  readonly schemaVersion: 1;
  readonly status: 'P6.5_AUTHORITY_TELEMETRY_FIXTURE_G5_NOT_PASSED';
  readonly mapId: string;
  readonly mapRevision: number;
  readonly displayName: string;
  readonly packageDigest: string;
  readonly boundsMm: LoadedRuntimeMapPackage['identity']['boundsMm'];
  readonly renderPath: string;
  readonly renderSha256: string;
  readonly renderMeshNodeCount: number;
  readonly authorityCollisionPath: string;
  readonly authorityCollisionSha256: string;
  readonly authorityCollisionMeshNodeCount: number;
  readonly authorityVolumeCount: number;
  readonly totalAuthorityColliderCount: number;
  readonly fixtureHash: string;
  readonly spawnCount: number;
  readonly zoneCount: number;
  readonly pickupCount: number;
  readonly triggerCount: number;
  readonly renderMeshesMayBeAuthority: false;
  readonly spawnAuthority: {
    readonly status: 'P6.4_DETERMINISTIC_AUTHORITY_FIXTURE_G5_NOT_PASSED';
    readonly fixtureSetId: 'inkfall_foundry_p6_4';
    readonly scenarioId: 'ffa_visual_score_pressure';
    readonly expectedDecisionHash: string;
    readonly decision: AuthoritySpawnSelectionResultV1;
    readonly fixtureResults: readonly {
      readonly id: string;
      readonly status: AuthoritySpawnSelectionResultV1['status'];
      readonly selectedSpawnId: string | null;
      readonly decisionHash: string;
    }[];
  };
  readonly telemetry: InkfallTelemetrySnapshotV1;
  readonly remaining: readonly string[];
}

interface ReadOnlyMapEvidenceSurface {
  readonly schemaVersion: 1;
  readonly getSnapshot: () => ReadOnlyMapEvidenceSnapshot;
}

declare global {
  interface Window {
    readonly __KYX_MAP_EVIDENCE__?: ReadOnlyMapEvidenceSurface;
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

function styles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    :root { color-scheme: dark; background: #07090b; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; overflow: auto; background: #07090b; color: #edf0ec; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .map-lab { width: min(1480px, calc(100% - 38px)); margin: 0 auto; padding: 28px 0 56px; }
    .map-lab__boundary { display: inline-block; padding: 8px 10px; border: 1px solid #f29c46; background: #24170b; color: #ffc47f; font: 900 10px/1 ui-monospace, monospace; letter-spacing: .15em; text-transform: uppercase; }
    .map-lab__header { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 26px; align-items: end; margin: 20px 0 22px; }
    .map-lab__kicker { margin: 0 0 8px; color: #ef6349; font: 900 12px/1 ui-monospace, monospace; letter-spacing: .18em; text-transform: uppercase; }
    .map-lab__title { margin: 0; font-size: clamp(38px, 6vw, 74px); line-height: .92; letter-spacing: -.055em; }
    .map-lab__copy { max-width: 810px; margin: 16px 0 0; color: #a8aea9; font-size: 14px; line-height: 1.65; }
    .map-lab__identity { max-width: 390px; color: #8f9992; font: 700 10px/1.55 ui-monospace, monospace; text-align: right; overflow-wrap: anywhere; }
    .map-lab__facts { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 1px; margin-bottom: 16px; border: 1px solid #292e2c; background: #292e2c; }
    .map-fact { min-height: 78px; padding: 13px; background: #101311; }
    .map-fact span { display: block; margin-bottom: 8px; color: #757d78; font: 800 9px/1.2 ui-monospace, monospace; letter-spacing: .1em; text-transform: uppercase; }
    .map-fact strong { display: block; color: #eef2ed; font: 850 14px/1.25 ui-monospace, monospace; overflow-wrap: anywhere; }
    .map-lab__grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(310px, .62fr); gap: 16px; }
    .map-panel { border: 1px solid #292e2c; background: #0e1110; }
    .map-panel__head { display: flex; justify-content: space-between; gap: 15px; padding: 13px 15px; border-bottom: 1px solid #292e2c; color: #d9ded9; font: 900 10px/1 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; }
    .map-panel__head span:last-child { color: #747d77; font-weight: 700; letter-spacing: .04em; }
    .map-canvas-wrap { padding: 12px; }
    .map-canvas { display: block; width: 100%; height: auto; border: 1px solid #292e2c; background: #090d0b; }
    .map-legend { display: flex; flex-wrap: wrap; gap: 14px; padding: 0 15px 14px; color: #7f8983; font: 700 10px/1.4 ui-monospace, monospace; }
    .map-legend i { display: inline-block; width: 9px; height: 9px; margin-right: 6px; background: var(--swatch); }
    .map-boundary-list { margin: 0; padding: 7px 15px 17px 34px; color: #a6afa8; font: 650 12px/1.65 ui-monospace, monospace; }
    .map-boundary-list strong { color: #f0b06f; }
    .map-json { max-height: 410px; overflow: auto; margin: 0; padding: 14px 15px 18px; color: #91a199; font: 600 10px/1.55 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    .spawn-score-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; border-top: 1px solid #292e2c; background: #292e2c; }
    .spawn-score { min-height: 92px; padding: 12px 14px; background: #101311; }
    .spawn-score--selected { box-shadow: inset 4px 0 #48cba8; }
    .spawn-score--rejected { box-shadow: inset 4px 0 #ef6349; }
    .spawn-score strong { display: block; color: #eff4ef; font: 850 11px/1.35 ui-monospace, monospace; }
    .spawn-score span { display: block; margin-top: 6px; color: #849089; font: 650 9px/1.5 ui-monospace, monospace; overflow-wrap: anywhere; }
    @media (max-width: 1100px) { .map-lab__facts { grid-template-columns: repeat(4, 1fr); } .map-lab__grid { grid-template-columns: 1fr; } }
    @media (max-width: 700px) { .map-lab { width: min(100% - 20px, 1480px); } .map-lab__header { grid-template-columns: 1fr; } .map-lab__identity { text-align: left; } .map-lab__facts { grid-template-columns: 1fr 1fr; } }
  `;
  return style;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`MAP_ARTIFACT_FETCH_FAILED ${response.status} ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

function createSnapshot(
  loaded: LoadedRuntimeMapPackage,
  spawnDecision: AuthoritySpawnSelectionResultV1,
  expectedDecisionHash: string,
  fixtureResults: ReadOnlyMapEvidenceSnapshot['spawnAuthority']['fixtureResults'],
  telemetry: InkfallTelemetrySnapshotV1,
): ReadOnlyMapEvidenceSnapshot {
  return Object.freeze({
    schemaVersion: 1,
    status: 'P6.5_AUTHORITY_TELEMETRY_FIXTURE_G5_NOT_PASSED',
    mapId: loaded.identity.id,
    mapRevision: loaded.identity.revision,
    displayName: loaded.identity.displayName,
    packageDigest: loaded.identity.packageDigest,
    boundsMm: loaded.identity.boundsMm,
    renderPath: loaded.presentation.renderPath,
    renderSha256: loaded.presentation.renderSha256,
    renderMeshNodeCount: loaded.presentation.renderMeshNodeCount,
    authorityCollisionPath: loaded.authority.collisionPath,
    authorityCollisionSha256: loaded.authority.collisionSha256,
    authorityCollisionMeshNodeCount: loaded.authority.collisionMeshNodeCount,
    authorityVolumeCount: loaded.authority.authorityVolumeCount,
    totalAuthorityColliderCount: loaded.authority.totalColliderCount,
    fixtureHash: loaded.authority.fixtureHash,
    spawnCount: loaded.manifest.spawns.length,
    zoneCount: loaded.manifest.zones.length,
    pickupCount: loaded.manifest.pickups.length,
    triggerCount: loaded.manifest.triggers.length,
    renderMeshesMayBeAuthority: false,
    spawnAuthority: Object.freeze({
      status: 'P6.4_DETERMINISTIC_AUTHORITY_FIXTURE_G5_NOT_PASSED',
      fixtureSetId: 'inkfall_foundry_p6_4',
      scenarioId: 'ffa_visual_score_pressure',
      expectedDecisionHash,
      decision: spawnDecision,
      fixtureResults,
    }),
    telemetry,
    remaining: Object.freeze([
      'P6.6 authoritative movement tapes and 2/4/8-player playtests',
      'P6.7 graybox lock and modular art-kit dimensions',
      'G5 final-art room, metrics, no-snag proof, and human playtest acceptance',
    ]),
  });
}

function colliderColor(id: string): string {
  if (id.includes('spawn')) return 'rgba(72, 203, 168, .42)';
  if (id.includes('guard_rail') || id.includes('boundary')) return 'rgba(239, 99, 73, .52)';
  if (id.includes('route') || id.includes('stair')) return 'rgba(220, 224, 216, .24)';
  return 'rgba(239, 176, 111, .28)';
}

type Point2 = readonly [x: number, y: number];

function fixtureQuaternion(rotation: Readonly<{ x: number; y: number; z: number }>) {
  const x = (rotation.x / 1_000) * (Math.PI / 180) * 0.5;
  const y = (rotation.y / 1_000) * (Math.PI / 180) * 0.5;
  const z = (rotation.z / 1_000) * (Math.PI / 180) * 0.5;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  return Object.freeze({
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  });
}

function rotateFixtureCorner(
  corner: Readonly<{ x: number; y: number; z: number }>,
  quaternion: ReturnType<typeof fixtureQuaternion>,
) {
  const crossX = quaternion.y * corner.z - quaternion.z * corner.y;
  const crossY = quaternion.z * corner.x - quaternion.x * corner.z;
  const crossZ = quaternion.x * corner.y - quaternion.y * corner.x;
  const tx = 2 * crossX;
  const ty = 2 * crossY;
  const tz = 2 * crossZ;
  return Object.freeze({
    x: corner.x + quaternion.w * tx + (quaternion.y * tz - quaternion.z * ty),
    y: corner.y + quaternion.w * ty + (quaternion.z * tx - quaternion.x * tz),
    z: corner.z + quaternion.w * tz + (quaternion.x * ty - quaternion.y * tx),
  });
}

function convexHull(points: readonly Point2[]): readonly Point2[] {
  const ordered = [...points].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const cross = (origin: Point2, left: Point2, right: Point2) => (
    (left[0] - origin[0]) * (right[1] - origin[1])
    - (left[1] - origin[1]) * (right[0] - origin[0])
  );
  const half = (input: readonly Point2[]) => {
    const output: Point2[] = [];
    for (const point of input) {
      while (output.length >= 2 && cross(output.at(-2)!, output.at(-1)!, point) <= 0) output.pop();
      output.push(point);
    }
    return output;
  };
  const lower = half(ordered);
  const upper = half([...ordered].reverse());
  return Object.freeze([...lower.slice(0, -1), ...upper.slice(0, -1)]);
}

function drawMap(
  canvas: HTMLCanvasElement,
  loaded: LoadedRuntimeMapPackage,
  spawnDecision: AuthoritySpawnSelectionResultV1,
  spawnInput: AuthoritySpawnSelectionInputV1,
  telemetry: InkfallTelemetrySnapshotV1,
): void {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('MAP_DEBUG_CANVAS_UNAVAILABLE');
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

  context.fillStyle = '#090d0b';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#1e2823';
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
    const quaternion = fixtureQuaternion(solid.rotationMilliDegrees);
    const corners: Point2[] = [];
    for (const localX of [-solid.shape.halfExtentsMm.x, solid.shape.halfExtentsMm.x]) {
      for (const localY of [-solid.shape.halfExtentsMm.y, solid.shape.halfExtentsMm.y]) {
        for (const localZ of [-solid.shape.halfExtentsMm.z, solid.shape.halfExtentsMm.z]) {
          const rotated = rotateFixtureCorner({ x: localX, y: localY, z: localZ }, quaternion);
          corners.push(project(solid.centerMm.x + rotated.x, solid.centerMm.z + rotated.z));
        }
      }
    }
    const hull = convexHull(corners);
    if (hull.length < 3) continue;
    context.beginPath();
    context.moveTo(hull[0][0], hull[0][1]);
    for (const point of hull.slice(1)) context.lineTo(point[0], point[1]);
    context.closePath();
    context.fillStyle = colliderColor(solid.id);
    context.fill();
  }

  const heatCellSize = telemetry.units.heatCellMillimeters;
  for (const heat of telemetry.heatCells) {
    const minimumX = bounds.minimum.x + heat.location.cellX * heatCellSize.x;
    const minimumZ = bounds.minimum.z + heat.location.cellZ * heatCellSize.z;
    const [left, top] = project(minimumX, minimumZ + heatCellSize.z);
    const [right, bottom] = project(minimumX + heatCellSize.x, minimumZ);
    const activity = heat.occupancySamples * 12
      + heat.damagePoints
      + heat.deaths * 120
      + heat.exposureTicks * 3
      + Math.round(heat.objectivePressurePermille / 4)
      + heat.volumeEvents * 30;
    const alpha = Math.min(0.72, 0.18 + activity / 1_000);
    context.fillStyle = `rgba(250, 151, 68, ${alpha.toFixed(3)})`;
    context.fillRect(left, top, right - left, bottom - top);
    context.strokeStyle = 'rgba(255, 204, 138, .82)';
    context.lineWidth = 1;
    context.strokeRect(left, top, right - left, bottom - top);
  }

  context.strokeStyle = '#f06349';
  context.lineWidth = 2;
  const [boundsLeft, boundsTop] = project(bounds.minimum.x, bounds.maximum.z);
  const [boundsRight, boundsBottom] = project(bounds.maximum.x, bounds.minimum.z);
  context.strokeRect(
    boundsLeft,
    boundsTop,
    boundsRight - boundsLeft,
    boundsBottom - boundsTop,
  );
  for (const evaluation of spawnDecision.evaluations) {
    if (evaluation.set !== 'deathmatch_candidate') continue;
    const [spawnX, spawnY] = project(evaluation.feetPositionMm.x, evaluation.feetPositionMm.z);
    for (const enemy of evaluation.enemies) {
      const player = spawnInput.players.find(({ id }) => id === enemy.enemyId);
      if (!player) continue;
      const [enemyX, enemyY] = project(player.feetPositionMm.x, player.feetPositionMm.z);
      const visibleSamples = Number(enemy.standingLineOfSight) + Number(enemy.crouchedLineOfSight);
      context.beginPath();
      context.moveTo(enemyX, enemyY);
      context.lineTo(spawnX, spawnY);
      context.strokeStyle = visibleSamples === 0
        ? 'rgba(72, 203, 168, .72)'
        : visibleSamples === 2
          ? 'rgba(239, 99, 73, .88)'
          : 'rgba(239, 176, 111, .86)';
      context.lineWidth = visibleSamples === 0 ? 1 : 2;
      context.setLineDash(visibleSamples === 0 ? [5, 5] : []);
      context.stroke();
    }
  }
  context.setLineDash([]);
  context.font = '800 10px ui-monospace, monospace';
  context.textAlign = 'center';
  for (const spawn of loaded.manifest.spawns) {
    const [x, y] = project(spawn.feetPositionMm.x, spawn.feetPositionMm.z);
    const evaluation = spawnDecision.evaluations.find(({ spawnId }) => spawnId === spawn.id);
    if (evaluation?.set === 'deathmatch_candidate') {
      context.beginPath();
      context.arc(x, y, spawnDecision.selected?.spawnId === spawn.id ? 11 : 8, 0, Math.PI * 2);
      context.strokeStyle = spawnDecision.selected?.spawnId === spawn.id
        ? '#ffffff'
        : evaluation.eligible ? '#48cba8' : '#ef6349';
      context.lineWidth = spawnDecision.selected?.spawnId === spawn.id ? 3 : 2;
      context.stroke();
    }
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.fillStyle = spawn.set === 'deathmatch_candidate' ? '#efb06f' : '#48cba8';
    context.fill();
    if (evaluation?.set === 'deathmatch_candidate') {
      context.fillStyle = '#f1f4ef';
      context.fillText(String(evaluation.score), x, y - 13);
    }
  }
  context.fillStyle = '#d7ded8';
  for (const zone of loaded.manifest.zones) {
    const [x, y] = project(zone.centerMm.x, zone.centerMm.z);
    context.fillText(zone.callout.toUpperCase(), x, y);
  }
  context.textAlign = 'left';
  context.fillStyle = '#8d9a92';
  context.fillText('P6.5 AUTHORITY TELEMETRY HEAT + P6.4 SPAWN / LOS · X/Z · INTEGER MILLIMETERS', padding, 27);
}

function fact(label: string, value: string): HTMLElement {
  const node = element('div', 'map-fact');
  node.append(element('span', '', label), element('strong', '', value));
  return node;
}

export async function mountMapTestRoute(root: HTMLElement): Promise<void> {
  const source = getBundledMapPackageSource('inkfall_foundry', 1);
  if (!source) throw new Error('MAP_PACKAGE_NOT_BUNDLED');
  const [render, collision] = await Promise.all([
    fetchBytes(renderArtifactUrl),
    fetchBytes(collisionArtifactUrl),
  ]);
  const loaded = await loadRuntimeMapPackage(source, { render, collision });
  const visualFixture = savedSpawnFixtures.scenarios
    .find(({ id }) => id === 'ffa_visual_score_pressure');
  if (!visualFixture) throw new Error('P6_4_VISUAL_FIXTURE_MISSING');
  const spawnAuthority = createInkfallSpawnAuthority(loaded);
  const fixtureDecisions = savedSpawnFixtures.scenarios.map((fixture) => {
    const decision = spawnAuthority.select(fixture.input);
    const selectedSpawnId = decision.selected?.spawnId ?? null;
    if (decision.status !== fixture.expected.status
      || selectedSpawnId !== fixture.expected.selectedSpawnId
      || decision.decisionHash !== fixture.expected.decisionHash) {
      throw new Error(`P6_4_FIXTURE_DECISION_MISMATCH ${fixture.id}`);
    }
    return Object.freeze({
      id: fixture.id,
      status: decision.status,
      selectedSpawnId,
      decisionHash: decision.decisionHash,
      decision,
    });
  });
  const visualDecision = fixtureDecisions
    .find(({ id }) => id === visualFixture.id);
  if (!visualDecision) throw new Error('P6_4_VISUAL_DECISION_MISSING');
  const spawnDecision = visualDecision.decision;
  const fixtureResults = Object.freeze(fixtureDecisions.map(({ id, status, selectedSpawnId, decisionHash }) => (
    Object.freeze({ id, status, selectedSpawnId, decisionHash })
  )));
  if (spawnDecision.decisionHash !== visualFixture.expected.decisionHash) {
    throw new Error('P6_4_VISUAL_FIXTURE_DECISION_MISMATCH');
  }
  const telemetryAuthority = createInkfallAuthorityTelemetry(loaded);
  const telemetryEvents = savedTelemetryFixtures.events.map((event) => ({
    schemaVersion: savedTelemetryFixtures.schemaVersion,
    mapId: savedTelemetryFixtures.mapId,
    mapRevision: savedTelemetryFixtures.mapRevision,
    packageDigest: savedTelemetryFixtures.packageDigest,
    fixtureHash: savedTelemetryFixtures.fixtureHash,
    authorityRateHz: savedTelemetryFixtures.authorityRateHz,
    producer: savedTelemetryFixtures.producer,
    ...event,
  }));
  const acceptedTelemetry = telemetryAuthority.appendBatch(telemetryEvents);
  const telemetrySnapshot = telemetryAuthority.snapshot();
  if (acceptedTelemetry.length !== savedTelemetryFixtures.expected.eventCount
    || telemetrySnapshot.snapshotHash !== savedTelemetryFixtures.expected.snapshotHash) {
    throw new Error('P6_5_TELEMETRY_FIXTURE_MISMATCH');
  }
  const visualInput = visualFixture.input as unknown as AuthoritySpawnSelectionInputV1;
  const snapshot = createSnapshot(
    loaded,
    spawnDecision,
    visualFixture.expected.decisionHash,
    fixtureResults,
    telemetrySnapshot,
  );
  Object.defineProperty(window, '__KYX_MAP_EVIDENCE__', {
    configurable: false,
    value: Object.freeze({
      schemaVersion: 1,
      getSnapshot: () => structuredClone(snapshot),
    }),
    writable: false,
  });

  const main = element('main', 'map-lab');
  main.id = 'map-package-result';
  main.append(element('div', 'map-lab__boundary', 'P6.3 runtime fixture + P6.4 spawn scoring + P6.5 authority telemetry · G5 not passed'));
  const header = element('header', 'map-lab__header');
  const heading = element('div', '');
  heading.append(
    element('p', 'map-lab__kicker', 'Verified saved package'),
    element('h1', 'map-lab__title', loaded.identity.displayName),
    element(
      'p',
      'map-lab__copy',
      'Both GLBs passed exact SHA-256 verification. The diagram uses only converted authority boxes. P6.4 overlays the saved all-enemy fixture; P6.5 adds privacy-safe quantized heat cells from the pinned route, spawn, combat, sightline, occupancy, objective, recovery, and kill-volume journal.',
    ),
  );
  header.append(
    heading,
    element(
      'div',
      'map-lab__identity',
      `map ${loaded.identity.id}@${loaded.identity.revision}\npackage ${loaded.identity.packageDigest}\nfixture ${loaded.authority.fixtureHash}`,
    ),
  );
  main.append(header);

  const facts = element('section', 'map-lab__facts');
  facts.setAttribute('aria-label', 'Loaded map package facts');
  facts.append(
    fact('Map bounds', '72 × 56 × 15 m'),
    fact('Render nodes', String(snapshot.renderMeshNodeCount)),
    fact('Collision boxes', String(snapshot.authorityCollisionMeshNodeCount)),
    fact('Authority volumes', String(snapshot.authorityVolumeCount)),
    fact('Total colliders', String(snapshot.totalAuthorityColliderCount)),
    fact('Spawn candidates', String(snapshot.spawnCount)),
    fact('Zones', String(snapshot.zoneCount)),
    fact('P6.4 selected', spawnDecision.selected?.spawnId ?? 'NO SAFE SPAWN'),
    fact('P6.5 events', String(snapshot.telemetry.buffer.acceptedEvents)),
    fact('Heat cells', String(snapshot.telemetry.heatCells.length)),
  );
  main.append(facts);

  const grid = element('section', 'map-lab__grid');
  const mapPanel = element('section', 'map-panel');
  const mapHead = element('div', 'map-panel__head');
  mapHead.append(element('span', '', 'P6.5 telemetry heat + P6.4 score / LOS'), element('span', '', 'read-only authority fixtures'));
  const canvasWrap = element('div', 'map-canvas-wrap');
  const canvas = element('canvas', 'map-canvas');
  canvas.width = 1120;
  canvas.height = 760;
  canvas.setAttribute('aria-label', 'Top-down Inkfall Foundry authority collider debug view');
  canvasWrap.append(canvas);
  const legend = element('div', 'map-legend');
  for (const [label, color] of [
    ['route/floor', 'rgba(220,224,216,.55)'],
    ['rail/boundary', '#ef6349'],
    ['spawn geometry', '#48cba8'],
    ['authored module', '#efb06f'],
    ['occluded LOS ray', 'rgba(72,203,168,.72)'],
    ['direct LOS reject', '#ef6349'],
    ['P6.5 quantized heat cell', '#fa9744'],
  ] as const) {
    const item = element('span', '');
    const swatch = element('i', '');
    swatch.style.setProperty('--swatch', color);
    item.append(swatch, label);
    legend.append(item);
  }
  const scoreList = element('div', 'spawn-score-list');
  for (const evaluation of spawnDecision.evaluations
    .filter(({ set }) => set === 'deathmatch_candidate')) {
    const row = element('div', [
      'spawn-score',
      spawnDecision.selected?.spawnId === evaluation.spawnId ? 'spawn-score--selected' : '',
      evaluation.eligible ? '' : 'spawn-score--rejected',
    ].filter(Boolean).join(' '));
    row.append(
      element('strong', '', `${evaluation.spawnId} · ${evaluation.score}`),
      element('span', '', evaluation.eligible
        ? `ELIGIBLE · ${evaluation.enemies.length}/${evaluation.enemies.length} enemies aggregated`
        : `REJECT · ${evaluation.rejectionReasons.join(', ')}`),
      element('span', '', `distance ${evaluation.components.enemyDistanceSafety} · LOS ${evaluation.components.lineOfSightExposure} · aim ${evaluation.components.recentEnemyAimAlignment} · arrival ${evaluation.components.enemyTravelArrivalPressure} · death ${evaluation.components.recentDeathLocation} · use ${evaluation.components.recentSpawnUse} · objective ${evaluation.components.objectiveProximityPressure}`),
    );
    scoreList.append(row);
  }
  mapPanel.append(mapHead, canvasWrap, legend, scoreList);

  const side = element('aside', 'map-panel');
  const sideHead = element('div', 'map-panel__head');
  sideHead.append(element('span', '', 'Acceptance boundary'), element('span', '', 'explicitly open'));
  const boundaryList = element('ol', 'map-boundary-list');
  for (const remaining of snapshot.remaining) {
    const item = element('li', '');
    item.textContent = remaining;
    boundaryList.append(item);
  }
  const jsonHead = element('div', 'map-panel__head');
  jsonHead.append(element('span', '', 'Read-only runtime surface'), element('span', '', '__KYX_MAP_EVIDENCE__'));
  side.append(sideHead, boundaryList, jsonHead, element('pre', 'map-json', JSON.stringify(snapshot, null, 2)));
  grid.append(mapPanel, side);
  main.append(grid);

  root.replaceChildren(styles(), main);
  drawMap(canvas, loaded, spawnDecision, visualInput, telemetrySnapshot);
  root.dataset.launchSupport = 'map-package-evidence';
  root.dataset.mapStatus = 'ready';
}
