import {
  PHYSICS_FIXTURE_TAPE_SCHEMA_VERSION,
  assertPhysicsFixtureTapeResult,
  getPhysicsFixtureTape,
  runPhysicsFixtureTape,
  summarizePhysicsFixtureTapeResult,
} from '../physics';
import {
  type MovementReplayResult,
  type MovementReplaySample,
} from '../sim';

export const MOVEMENT_TEST_ROUTE_PATH = '/__test__/movement' as const;
const MOVEMENT_FIXTURE_TAPE_ID = 'flat_run_fixed_20hz_v1' as const;

interface MovementLabTrajectoryPoint {
  readonly authorityTick: number;
  readonly xMm: number;
  readonly zMm: number;
  readonly grounded: boolean;
}

function freezeJson<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) {
      freezeJson(child);
    }
    Object.freeze(value);
  }
  return value;
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function runFixtureTape(): Promise<MovementReplayResult> {
  const result = await runPhysicsFixtureTape(MOVEMENT_FIXTURE_TAPE_ID);
  assertPhysicsFixtureTapeResult(MOVEMENT_FIXTURE_TAPE_ID, result);
  return result;
}

function repeatFingerprint(result: MovementReplayResult): string {
  const tape = getPhysicsFixtureTape(MOVEMENT_FIXTURE_TAPE_ID);
  return JSON.stringify(summarizePhysicsFixtureTapeResult(tape, result));
}

function trajectoryFor(
  samples: readonly MovementReplaySample[],
): readonly MovementLabTrajectoryPoint[] {
  return Object.freeze(
    samples.map((sample) =>
      Object.freeze({
        authorityTick: sample.authorityTick,
        xMm: sample.feetPosition.x,
        zMm: sample.feetPosition.z,
        grounded: sample.grounded,
      }),
    ),
  );
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

function renderTrajectory(
  canvas: HTMLCanvasElement,
  samples: readonly MovementLabTrajectoryPoint[],
): void {
  const context = canvas.getContext('2d', { alpha: false });
  if (context === null) throw new Error('MOVEMENT_LAB_2D_CONTEXT_UNAVAILABLE');

  const width = canvas.width;
  const height = canvas.height;
  const padding = 58;
  const xValues = samples.map((sample) => sample.xMm);
  const zValues = samples.map((sample) => sample.zMm);
  const minimumX = Math.min(...xValues);
  const maximumX = Math.max(...xValues);
  const minimumZ = Math.min(...zValues);
  const maximumZ = Math.max(...zValues);
  const xRange = Math.max(1_000, maximumX - minimumX);
  const zRange = Math.max(1_000, maximumZ - minimumZ);
  const xMargin = xRange * 0.12;
  const zMargin = zRange * 0.12;
  const plotMinimumX = minimumX - xMargin;
  const plotMaximumX = maximumX + xMargin;
  const plotMinimumZ = minimumZ - zMargin;
  const plotMaximumZ = maximumZ + zMargin;
  const projectX = (x: number): number =>
    padding
    + ((x - plotMinimumX) / (plotMaximumX - plotMinimumX))
      * (width - padding * 2);
  const projectZ = (z: number): number =>
    height
    - padding
    - ((z - plotMinimumZ) / (plotMaximumZ - plotMinimumZ))
      * (height - padding * 2);

  context.fillStyle = '#071018';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#173344';
  context.lineWidth = 1;
  for (let index = 0; index <= 6; index += 1) {
    const x = padding + ((width - padding * 2) * index) / 6;
    const y = padding + ((height - padding * 2) * index) / 6;
    context.beginPath();
    context.moveTo(x, padding);
    context.lineTo(x, height - padding);
    context.stroke();
    context.beginPath();
    context.moveTo(padding, y);
    context.lineTo(width - padding, y);
    context.stroke();
  }

  context.strokeStyle = '#31d6c4';
  context.lineWidth = 4;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.beginPath();
  samples.forEach((sample, index) => {
    const x = projectX(sample.xMm);
    const y = projectZ(sample.zMm);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();

  for (const sample of samples) {
    if (sample.grounded) continue;
    context.fillStyle = '#f2c14e';
    context.beginPath();
    context.arc(projectX(sample.xMm), projectZ(sample.zMm), 3, 0, Math.PI * 2);
    context.fill();
  }

  const start = samples[0];
  const end = samples[samples.length - 1];
  if (start === undefined || end === undefined) {
    throw new Error('MOVEMENT_LAB_TRAJECTORY_EMPTY');
  }
  for (const [sample, color, label] of [
    [start, '#8ef0a5', 'START'],
    [end, '#ff6b4a', 'END'],
  ] as const) {
    const x = projectX(sample.xMm);
    const y = projectZ(sample.zMm);
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8f4f8';
    context.font = '700 12px ui-monospace, monospace';
    context.fillText(label, x + 11, y - 10);
  }

  context.fillStyle = '#7292a4';
  context.font = '600 12px ui-monospace, monospace';
  context.fillText('TOP-DOWN X / Z · millimeters', padding, 27);
  context.fillText('Gold samples = airborne', width - 222, 27);
}

function createStyles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    :root { overflow-x: hidden; overflow-y: auto; height: auto; min-height: 100%; color-scheme: dark; background: #050b10; }
    * { box-sizing: border-box; }
    body { overflow: visible; height: auto; margin: 0; min-height: 100vh; background: radial-gradient(circle at 75% 5%, #143243 0, transparent 36%), #050b10; color: #e7f0f4; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .movement-lab { width: min(1160px, calc(100% - 36px)); margin: 0 auto; padding: 46px 0 64px; }
    .movement-warning { display: inline-flex; padding: 8px 11px; border: 1px solid #ff6b4a; background: #2b130f; color: #ff9a82; font: 900 11px/1 ui-monospace, monospace; letter-spacing: .16em; text-transform: uppercase; }
    .movement-kicker { margin: 24px 0 10px; color: #31d6c4; font: 900 13px/1 ui-monospace, monospace; letter-spacing: .2em; text-transform: uppercase; }
    .movement-title { max-width: 860px; margin: 0; color: #f8fbfc; font-size: clamp(42px, 7vw, 82px); line-height: .91; letter-spacing: -.055em; }
    .movement-copy { max-width: 760px; margin: 24px 0 28px; color: #a8bbc5; font-size: 16px; line-height: 1.7; }
    .movement-status { display: inline-flex; align-items: center; gap: 9px; color: #8ef0a5; font: 900 12px/1 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; }
    .movement-status::before { width: 9px; height: 9px; border-radius: 50%; background: currentColor; box-shadow: 0 0 16px currentColor; content: ''; }
    .movement-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(250px, .75fr); gap: 18px; margin-top: 30px; }
    .movement-panel { border: 1px solid #243b48; background: rgba(8, 19, 27, .9); box-shadow: 0 24px 80px rgba(0, 0, 0, .24); }
    .movement-panel-header { margin: 0; padding: 16px 18px; border-bottom: 1px solid #243b48; color: #dbe9ef; font: 900 12px/1 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; }
    .movement-canvas-wrap { padding: 14px; }
    .movement-canvas { display: block; width: 100%; height: auto; border: 1px solid #1c3544; background: #071018; }
    .movement-caption { margin: 12px 4px 2px; color: #718995; font: 500 12px/1.5 ui-monospace, monospace; }
    .movement-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #243b48; }
    .movement-stat { min-height: 94px; padding: 17px; background: #08131b; }
    .movement-stat-label { display: block; margin-bottom: 9px; color: #6f8a99; font: 800 10px/1.25 ui-monospace, monospace; letter-spacing: .1em; text-transform: uppercase; }
    .movement-stat-value { overflow-wrap: anywhere; color: #f2f8fa; font: 800 18px/1.25 ui-monospace, monospace; }
    .movement-json { margin-top: 18px; border: 1px solid #243b48; background: #08131b; }
    .movement-json summary { padding: 17px 19px; cursor: pointer; color: #31d6c4; font: 900 12px/1 ui-monospace, monospace; letter-spacing: .1em; text-transform: uppercase; }
    .movement-output { overflow: auto; max-height: 620px; margin: 0; padding: 20px; border-top: 1px solid #243b48; color: #c5d5dc; font: 600 12px/1.65 ui-monospace, monospace; }
    .movement-footer { margin: 20px 0 0; color: #6f8490; font: 600 11px/1.6 ui-monospace, monospace; text-transform: uppercase; }
    @media (max-width: 780px) { .movement-lab { width: min(100% - 24px, 1160px); padding-top: 24px; } .movement-grid { grid-template-columns: 1fr; } .movement-title { font-size: clamp(40px, 15vw, 66px); } }
  `;
  return style;
}

export async function mountMovementTestRoute(body: HTMLBodyElement): Promise<void> {
  const tape = getPhysicsFixtureTape(MOVEMENT_FIXTURE_TAPE_ID);
  const firstRun = await runFixtureTape();
  const secondRun = await runFixtureTape();
  if (repeatFingerprint(firstRun) !== repeatFingerprint(secondRun)) {
    throw new Error('MOVEMENT_LAB_REPEAT_MISMATCH');
  }
  const replaySummary = summarizePhysicsFixtureTapeResult(tape, firstRun);

  const trajectory = trajectoryFor(firstRun.envelope.samples);
  const payload = freezeJson({
    schemaVersion: 1,
    evidence: {
      label: tape.expected.envelope.evidenceLabel,
      surface: 'FIXTURE LAB',
      productStatus: 'NON_PRODUCT',
      route: MOVEMENT_TEST_ROUTE_PATH,
    },
    tape: {
      schemaVersion: PHYSICS_FIXTURE_TAPE_SCHEMA_VERSION,
      id: tape.id,
      simulationRateHz: tape.simulationRateHz,
      tickDurationMs: 1_000 / tape.simulationRateHz,
      frameCount: tape.frames.length,
    },
    identity: jsonClone(tape.identity),
    hash: {
      firstRun: firstRun.finalHash,
      secondRun: secondRun.finalHash,
      recorded: tape.expected.finalHash,
      repeatConfirmed: true,
      recordedMatch: firstRun.finalHash === tape.expected.finalHash,
    },
    envelope: jsonClone(replaySummary.envelope),
    measurements: jsonClone(replaySummary.measurements),
    queryMetrics: jsonClone(replaySummary.envelope.queries),
    trajectory,
  });

  document.title = 'KYX.IO - Movement Fixture Lab';
  document.documentElement.lang = 'en';
  body.dataset.launchSupport = 'movement-fixture-lab';
  body.dataset.movementStatus = 'pass';
  body.dataset.movementHash = firstRun.finalHash;
  Object.defineProperty(window, '__KYX_MOVEMENT_LAB_RESULT__', {
    value: payload,
    writable: false,
    configurable: false,
    enumerable: false,
  });

  const main = element('main', 'movement-lab');
  const warning = element(
    'div',
    'movement-warning',
    'Non-product evidence route · development only',
  );
  const kicker = element('p', 'movement-kicker', 'Hypothesis · Fixture Lab');
  const title = element('h1', 'movement-title', 'Movement envelope, not product movement.');
  const copy = element(
    'p',
    'movement-copy',
    'A versioned 20 Hz command tape runs twice against the real deterministic Rapier flat_run fixture. This isolated lab does not construct Game, WebGL, audio, storage, or network systems and is not the live P3.9 product bridge.',
  );
  const status = element('div', 'movement-status', 'Two independent fixture runs agree');
  status.setAttribute('role', 'status');

  const grid = element('div', 'movement-grid');
  const trajectoryPanel = element('section', 'movement-panel');
  trajectoryPanel.setAttribute('aria-labelledby', 'trajectory-title');
  const trajectoryTitle = element('h2', 'movement-panel-header', 'Top-down fixed-tick trajectory');
  trajectoryTitle.id = 'trajectory-title';
  const canvasWrap = element('div', 'movement-canvas-wrap');
  const canvas = element('canvas', 'movement-canvas');
  canvas.id = 'movement-trajectory';
  canvas.width = 920;
  canvas.height = 520;
  canvas.setAttribute(
    'aria-label',
    'Top-down trajectory of the flat run movement fixture in millimeters',
  );
  const caption = element(
    'p',
    'movement-caption',
    `${trajectory.length} canonical samples · X/Z plane · 2D canvas only`,
  );
  canvasWrap.append(canvas, caption);
  trajectoryPanel.append(trajectoryTitle, canvasWrap);

  const statPanel = element('section', 'movement-panel');
  statPanel.setAttribute('aria-labelledby', 'authority-title');
  const statTitle = element('h2', 'movement-panel-header', 'Authority envelope');
  statTitle.id = 'authority-title';
  const stats = element('div', 'movement-stats');
  for (const [label, value] of [
    ['Final state hash', firstRun.finalHash],
    ['Authority tape', `${tape.frames.length} ticks / ${replaySummary.envelope.elapsedMilliseconds} ms`],
    ['Planar distance', `${firstRun.envelope.planarDistanceTravelledMm} mm`],
    ['Maximum speed', `${firstRun.envelope.maximumPlanarSpeedMmPerSecond} mm/s`],
    ['Query calls', String(firstRun.envelope.queries.moveCapsuleCalls)],
    ['Fixture identity', `${firstRun.finalState.identity.fixtureId}@${firstRun.finalState.identity.fixtureHash}`],
  ] as const) {
    const stat = element('div', 'movement-stat');
    stat.append(
      element('span', 'movement-stat-label', label),
      element('strong', 'movement-stat-value', value),
    );
    stats.append(stat);
  }
  statPanel.append(statTitle, stats);
  grid.append(trajectoryPanel, statPanel);

  const details = element('details', 'movement-json');
  details.id = 'movement-json-details';
  const summaryElement = element('summary', '', 'Inspect immutable JSON');
  const output = element('pre', 'movement-output', JSON.stringify(payload, null, 2));
  output.id = 'movement-result';
  details.append(summaryElement, output);
  const footer = element(
    'p',
    'movement-footer',
    'HYPOTHESIS · FIXTURE LAB · NON-PRODUCT · exact development path only · not live P3.9 wiring',
  );

  main.append(warning, kicker, title, copy, status, grid, details, footer);
  body.replaceChildren(createStyles(), main);
  renderTrajectory(canvas, trajectory);
}
