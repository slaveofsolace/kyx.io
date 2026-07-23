import { hashRulesetContent, requireRuleset } from '../content';
import {
  createRapierMovementWorld,
  getPhysicsFixture,
  type RapierMovementWorld,
} from '../physics';
import {
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  hashMovementProfile,
} from '../sim';
import type { SimulationIdentityV1 } from '../net';
import {
  AuthorityEvidenceClient,
  type AuthorityEvidenceDiagnostics,
  type AuthorityEvidencePresentation,
} from './authorityEvidenceClient';
import {
  AUTHORITY_EVIDENCE_ROUTE_PATH,
  axesFromPressedKeys,
  createDevelopmentRoomCode,
  parseAuthorityEvidenceConfig,
  type AuthorityEvidenceConfig,
} from './authorityEvidenceModel';
import { createImpairedAuthorityEvidenceTransport } from './authorityEvidenceImpairment';
import {
  createBrowserAuthorityEvidenceScheduler,
  createBrowserAuthorityEvidenceTransport,
} from './authorityEvidenceTransport';

interface ReadOnlyAuthorityEvidenceSurface {
  readonly schemaVersion: 1;
  readonly getSnapshot: () => AuthorityEvidenceDiagnostics;
  /** Read-only presentation sampling seam for deterministic render-rate evidence. */
  readonly samplePresentation: () => AuthorityEvidencePresentation;
}

declare global {
  interface Window {
    readonly __KYX_AUTHORITY_EVIDENCE__?: ReadOnlyAuthorityEvidenceSurface;
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

function createStyles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    :root { color-scheme: dark; background: #050809; }
    * { box-sizing: border-box; }
    body { overflow: auto; min-height: 100vh; margin: 0; background: #050809; color: #eef4f1; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    button { font: inherit; }
    .authority-lab { width: min(1440px, calc(100% - 40px)); margin: 0 auto; padding: 34px 0 60px; }
    .authority-lab__warning { display: inline-flex; align-items: center; gap: 10px; padding: 8px 11px; border: 1px solid #f4a641; background: #291b08; color: #ffc472; font: 900 11px/1 ui-monospace, monospace; letter-spacing: .16em; text-transform: uppercase; }
    .authority-lab__warning::before { width: 8px; height: 8px; border-radius: 50%; background: currentColor; box-shadow: 0 0 14px currentColor; content: ''; }
    .authority-lab__header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 28px; margin: 22px 0 24px; }
    .authority-lab__kicker { margin: 0 0 9px; color: #51e6c1; font: 900 12px/1 ui-monospace, monospace; letter-spacing: .18em; text-transform: uppercase; }
    .authority-lab__title { max-width: 820px; margin: 0; font-size: clamp(40px, 6.2vw, 76px); line-height: .92; letter-spacing: -.055em; }
    .authority-lab__copy { max-width: 760px; margin: 19px 0 0; color: #9cafaa; font-size: 15px; line-height: 1.7; }
    .authority-lab__resume { min-width: 200px; padding: 13px 16px; border: 1px solid #51e6c1; background: #0c2821; color: #b9ffec; cursor: pointer; font: 900 11px/1 ui-monospace, monospace; letter-spacing: .11em; text-transform: uppercase; }
    .authority-lab__resume:disabled { border-color: #35413e; background: #151a19; color: #66736f; cursor: not-allowed; }
    .authority-lab__strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 1px; margin-bottom: 18px; border: 1px solid #26322f; background: #26322f; }
    .authority-lab__fact { min-height: 78px; padding: 14px; background: #0c1211; }
    .authority-lab__label { display: block; margin-bottom: 8px; color: #657771; font: 800 9px/1.2 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; }
    .authority-lab__value { overflow-wrap: anywhere; color: #e7f2ee; font: 800 12px/1.35 ui-monospace, monospace; }
    .authority-lab__status[data-state='joined'] { color: #51e6c1; }
    .authority-lab__status[data-state='failed'], .authority-lab__status[data-state='closed'] { color: #ff7767; }
    .authority-lab__grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(340px, .72fr); gap: 18px; }
    .authority-panel { overflow: hidden; border: 1px solid #26322f; background: #0b1110; box-shadow: 0 22px 70px rgba(0, 0, 0, .28); }
    .authority-panel__head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border-bottom: 1px solid #26322f; color: #dce9e5; font: 900 10px/1 ui-monospace, monospace; letter-spacing: .13em; text-transform: uppercase; }
    .authority-panel__hint { color: #6e817b; font-weight: 700; letter-spacing: .05em; }
    .authority-canvas-wrap { padding: 13px; }
    .authority-canvas { display: block; width: 100%; height: auto; border: 1px solid #20332e; background: #07100e; }
    .authority-legend { display: flex; flex-wrap: wrap; gap: 15px; padding: 0 16px 15px; color: #80918c; font: 700 10px/1.4 ui-monospace, monospace; }
    .authority-legend span::before { display: inline-block; width: 9px; height: 9px; margin-right: 7px; border-radius: 50%; background: var(--legend); content: ''; }
    .authority-stack { display: grid; gap: 18px; align-content: start; }
    .authority-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #26322f; }
    .authority-metric { min-height: 74px; padding: 13px; background: #0b1110; }
    .authority-metric strong { display: block; overflow-wrap: anywhere; color: #f2f8f6; font: 800 15px/1.3 ui-monospace, monospace; }
    .authority-identity { margin: 0; padding: 15px 16px 17px; color: #9eb2ac; font: 600 10px/1.65 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    .authority-json { max-height: 360px; overflow: auto; margin: 0; padding: 15px 16px 18px; color: #9eb2ac; font: 600 10px/1.55 ui-monospace, monospace; white-space: pre-wrap; }
    .authority-lab__error { display: none; margin: 18px 0 0; padding: 14px 16px; border: 1px solid #71372f; background: #26100d; color: #ff9a8b; font: 700 12px/1.55 ui-monospace, monospace; white-space: pre-wrap; }
    .authority-lab__error:not(:empty) { display: block; }
    .authority-lab__footer { margin: 20px 0 0; color: #62716d; font: 700 10px/1.6 ui-monospace, monospace; letter-spacing: .04em; text-transform: uppercase; }
    @media (max-width: 1020px) { .authority-lab__strip { grid-template-columns: repeat(3, 1fr); } .authority-lab__grid { grid-template-columns: 1fr; } }
    @media (max-width: 700px) { .authority-lab { width: min(100% - 22px, 1440px); padding-top: 20px; } .authority-lab__header { grid-template-columns: 1fr; align-items: start; } .authority-lab__resume { width: 100%; } .authority-lab__strip { grid-template-columns: 1fr 1fr; } .authority-panel__hint { display: none; } }
  `;
  return style;
}

function expectedIdentity(world: RapierMovementWorld): SimulationIdentityV1 {
  const ruleset = requireRuleset();
  if (
    ruleset.movementProfile.id !== PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.id
    || ruleset.movementProfile.revision !== PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.revision
  ) throw new Error('AUTHORITY_EVIDENCE_RULESET_PROFILE_MISMATCH');
  return Object.freeze({
    schemaVersion: 1,
    mapId: 'phase4_flat_run',
    rulesetId: ruleset.id,
    rulesetRevision: ruleset.revision,
    rulesetHash: hashRulesetContent(ruleset),
    movementProfileId: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.id,
    movementProfileRevision: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.revision,
    movementProfileHash: hashMovementProfile(PHASE3_HYPOTHESIS_MOVEMENT_PROFILE),
    fixtureId: world.fixture.id,
    fixtureHash: world.fixtureHash,
    physicsAdapterId: 'rapier3d_deterministic_compat',
    physicsAdapterVersion: '0.19.3',
  });
}

function createdRoomCode(): string {
  const values = new Uint32Array(6);
  crypto.getRandomValues(values);
  return createDevelopmentRoomCode([...values]);
}

function joinUrl(
  roomCode: string,
  displayName: string,
  authorityUrl: string,
  impairmentProfile: AuthorityEvidenceConfig['impairmentProfile'],
): string {
  const url = new URL(window.location.href);
  url.pathname = AUTHORITY_EVIDENCE_ROUTE_PATH;
  url.search = '';
  url.searchParams.set('mode', 'join');
  url.searchParams.set('room', roomCode);
  url.searchParams.set('displayName', displayName);
  url.searchParams.set('authorityUrl', authorityUrl);
  url.searchParams.set('impairment', impairmentProfile);
  return url.toString();
}

function renderArena(
  canvas: HTMLCanvasElement,
  presentation: AuthorityEvidencePresentation,
): void {
  const context = canvas.getContext('2d', { alpha: false });
  if (context === null) throw new Error('AUTHORITY_EVIDENCE_CANVAS_UNAVAILABLE');
  const width = canvas.width;
  const height = canvas.height;
  const padding = 48;
  const arenaExtentMm = 12_000;
  const scale = Math.min(
    (width - padding * 2) / (arenaExtentMm * 2),
    (height - padding * 2) / (arenaExtentMm * 2),
  );
  const project = (position: Readonly<{ x: number; z: number }>): [number, number] => [
    width / 2 + position.x * scale,
    height / 2 - position.z * scale,
  ];

  context.fillStyle = '#07100e';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#142b25';
  context.lineWidth = 1;
  for (let millimeters = -10_000; millimeters <= 10_000; millimeters += 2_000) {
    const [x] = project({ x: millimeters, z: 0 });
    const [, y] = project({ x: 0, z: millimeters });
    context.beginPath();
    context.moveTo(x, padding);
    context.lineTo(x, height - padding);
    context.stroke();
    context.beginPath();
    context.moveTo(padding, y);
    context.lineTo(width - padding, y);
    context.stroke();
  }
  context.strokeStyle = '#345349';
  context.lineWidth = 2;
  context.strokeRect(padding, padding, width - padding * 2, height - padding * 2);
  context.fillStyle = '#617a72';
  context.font = '700 11px ui-monospace, monospace';
  context.fillText('SERVER-AUTHORED FLAT_RUN · X/Z · 24m × 24m', padding, 27);
  context.fillText(`EST TICK ${presentation.estimatedServerTick.toFixed(2)}`, width - 170, 27);

  if (presentation.localAuthoritative !== null) {
    const [x, y] = project(presentation.localAuthoritative);
    context.strokeStyle = '#f2f7f4';
    context.lineWidth = 2;
    context.setLineDash([4, 4]);
    context.beginPath();
    context.arc(x, y, 10, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
  }
  if (presentation.localPredicted !== null) {
    const [x, y] = project(presentation.localPredicted);
    context.fillStyle = '#51e6c1';
    context.shadowColor = '#51e6c1';
    context.shadowBlur = 14;
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = '#c7fff1';
    context.font = '800 10px ui-monospace, monospace';
    context.fillText('LOCAL PREDICTED', x + 13, y - 11);
  }
  for (const remote of presentation.remotes) {
    const [x, y] = project(remote.state.feetPosition);
    context.fillStyle = '#f4a641';
    context.shadowColor = '#f4a641';
    context.shadowBlur = 12;
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = '#ffd49a';
    context.font = '800 10px ui-monospace, monospace';
    context.fillText(`${remote.entityId.slice(0, 18)} · ${remote.mode}`, x + 13, y - 11);
  }
}

function valueFact(label: string, testId: string): { root: HTMLDivElement; value: HTMLSpanElement } {
  const root = element('div', 'authority-lab__fact');
  root.append(element('span', 'authority-lab__label', label));
  const value = element('span', 'authority-lab__value', '—');
  value.dataset.testid = testId;
  root.append(value);
  return { root, value };
}

function metric(label: string): { root: HTMLDivElement; value: HTMLElement } {
  const root = element('div', 'authority-metric');
  root.append(element('span', 'authority-lab__label', label));
  const value = element('strong', '', '0');
  root.append(value);
  return { root, value };
}

export async function mountAuthorityTestRoute(body: HTMLBodyElement): Promise<void> {
  const config = parseAuthorityEvidenceConfig(window.location.search);
  const roomCode = config.roomCode ?? createdRoomCode();
  const world = await createRapierMovementWorld(getPhysicsFixture('flat_run'));
  const identity = expectedIdentity(world);
  const scheduler = createBrowserAuthorityEvidenceScheduler();
  const transport = createImpairedAuthorityEvidenceTransport({
    baseTransport: createBrowserAuthorityEvidenceTransport(),
    scheduler,
    policy: config.impairmentProfile,
  });

  const root = element('main', 'authority-lab');
  root.dataset.testid = 'authority-evidence-route';
  root.append(element('div', 'authority-lab__warning', 'DEV / G3 EVIDENCE · NOT PRODUCT ONLINE PLAY'));

  const header = element('header', 'authority-lab__header');
  const titleWrap = element('div', '');
  titleWrap.append(element('p', 'authority-lab__kicker', 'Protocol v2 · authority movement observer'));
  titleWrap.append(element('h1', 'authority-lab__title', 'Visible authority, no client-authored position.'));
  titleWrap.append(element(
    'p',
    'authority-lab__copy',
    'WASD is sampled at a fixed 20 Hz. Cyan is local deterministic prediction, the white ring is the latest exact authority reconciliation, and amber players are rendered through the remote interpolation buffer. This surface is evidence scaffolding only and does not claim G3.',
  ));
  const resumeButton = element('button', 'authority-lab__resume', 'Disconnect + resume');
  resumeButton.type = 'button';
  resumeButton.dataset.testid = 'authority-resume';
  resumeButton.disabled = true;
  header.append(titleWrap, resumeButton);
  root.append(header);

  const strip = element('section', 'authority-lab__strip');
  const statusFact = valueFact('Connection', 'authority-status');
  statusFact.value.classList.add('authority-lab__status');
  const roomFact = valueFact('Room', 'authority-room');
  const matchFact = valueFact('Match', 'authority-match');
  const playerFact = valueFact('Player', 'authority-player');
  const protocolFact = valueFact('Protocol', 'authority-protocol');
  const phaseFact = valueFact('Match phase', 'authority-match-phase');
  const impairmentFact = valueFact('Impairment', 'authority-impairment-profile');
  strip.append(
    statusFact.root,
    roomFact.root,
    matchFact.root,
    playerFact.root,
    protocolFact.root,
    phaseFact.root,
    impairmentFact.root,
  );
  root.append(strip);

  const grid = element('section', 'authority-lab__grid');
  const arenaPanel = element('section', 'authority-panel');
  const arenaHead = element('div', 'authority-panel__head');
  arenaHead.append(
    document.createTextNode('Live top-down authority diagnostic'),
    element('span', 'authority-panel__hint', 'W / A / S / D · fixed 20 Hz'),
  );
  const canvasWrap = element('div', 'authority-canvas-wrap');
  const canvas = element('canvas', 'authority-canvas');
  canvas.width = 960;
  canvas.height = 640;
  canvas.dataset.testid = 'authority-arena';
  canvas.setAttribute('aria-label', 'Top-down authority movement diagnostic');
  canvasWrap.append(canvas);
  const legend = element('div', 'authority-legend');
  for (const [label, color] of [
    ['Local predicted', '#51e6c1'],
    ['Latest authority state', '#f2f7f4'],
    ['Remote interpolated', '#f4a641'],
  ] as const) {
    const item = element('span', '', label);
    item.style.setProperty('--legend', color);
    legend.append(item);
  }
  arenaPanel.append(arenaHead, canvasWrap, legend);

  const stack = element('div', 'authority-stack');
  const metricsPanel = element('section', 'authority-panel');
  metricsPanel.append(element('div', 'authority-panel__head', 'Live counters'));
  const metricsGrid = element('div', 'authority-metrics');
  const generatedMetric = metric('Commands generated');
  const sentMetric = metric('Batches sent');
  const ackMetric = metric('Input acks');
  const snapshotMetric = metric('Snapshots full / delta');
  const reconciliationMetric = metric('Reconciliations');
  const interpolationMetric = metric('Remote interpolation frames');
  const inboundImpairmentMetric = metric('Inbound delivered / drop / dupe / reorder');
  const outboundImpairmentMetric = metric('Outbound delivered / drop / dupe / reorder');
  metricsGrid.append(
    generatedMetric.root,
    sentMetric.root,
    ackMetric.root,
    snapshotMetric.root,
    reconciliationMetric.root,
    interpolationMetric.root,
    inboundImpairmentMetric.root,
    outboundImpairmentMetric.root,
  );
  metricsPanel.append(metricsGrid);

  const impairmentPanel = element('section', 'authority-panel');
  impairmentPanel.append(element(
    'div',
    'authority-panel__head',
    'Deterministic frame impairment · client transport only',
  ));
  const impairmentOutput = element('pre', 'authority-identity');
  impairmentOutput.dataset.testid = 'authority-impairment';
  impairmentPanel.append(impairmentOutput);

  const identityPanel = element('section', 'authority-panel');
  identityPanel.append(element('div', 'authority-panel__head', 'Simulation identity · fail closed'));
  const identityOutput = element('pre', 'authority-identity');
  identityOutput.dataset.testid = 'authority-identity';
  identityPanel.append(identityOutput);

  const diagnosticsPanel = element('details', 'authority-panel');
  const diagnosticsSummary = element('summary', 'authority-panel__head', 'Frozen Playwright diagnostics');
  const diagnosticsOutput = element('pre', 'authority-json');
  diagnosticsOutput.dataset.testid = 'authority-diagnostics';
  diagnosticsPanel.append(diagnosticsSummary, diagnosticsOutput);
  stack.append(metricsPanel, impairmentPanel, identityPanel, diagnosticsPanel);
  grid.append(arenaPanel, stack);
  root.append(grid);

  const errorOutput = element('pre', 'authority-lab__error');
  errorOutput.dataset.testid = 'authority-error';
  root.append(errorOutput);
  const share = joinUrl(
    roomCode,
    `${config.displayName} Peer`,
    config.authorityUrl,
    config.impairmentProfile,
  );
  root.append(element(
    'p',
    'authority-lab__footer',
    `Create mode seeds a fresh development Durable Object route; join a second browser with: ${share}`,
  ));
  body.replaceChildren(createStyles(), root);
  body.dataset.launchSupport = 'authority-evidence';
  body.dataset.authorityStatus = 'initializing';

  let renderRequested = true;
  const client = new AuthorityEvidenceClient({
    config,
    roomCode,
    expectedIdentity: identity,
    profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
    queries: world,
    transport,
    scheduler,
    createRequestId: () => `request.${crypto.randomUUID()}`,
    onChange: () => {
      renderRequested = true;
    },
  });

  const readOnlySurface: ReadOnlyAuthorityEvidenceSurface = Object.freeze({
    schemaVersion: 1,
    getSnapshot: () => client.diagnostics(),
    samplePresentation: () => client.samplePresentation(),
  });
  Object.defineProperty(window, '__KYX_AUTHORITY_EVIDENCE__', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: readOnlySurface,
  });

  const pressedKeys = new Set<string>();
  const updateInput = (): void => client.setAxes(axesFromPressedKeys(pressedKeys));
  const keyboardHandler = (event: KeyboardEvent): void => {
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
    event.preventDefault();
    if (event.type === 'keydown') pressedKeys.add(event.code);
    else pressedKeys.delete(event.code);
    updateInput();
    renderRequested = true;
  };
  window.addEventListener('keydown', keyboardHandler);
  window.addEventListener('keyup', keyboardHandler);
  window.addEventListener('blur', () => {
    pressedKeys.clear();
    updateInput();
  });
  resumeButton.addEventListener('click', () => {
    client.requestResume();
    renderRequested = true;
  });

  let lastDiagnosticsRefresh = -Infinity;
  let animationFrame = 0;
  const render = (nowMilliseconds: number): void => {
    const presentation = client.samplePresentation();
    renderArena(canvas, presentation);
    if (renderRequested || nowMilliseconds - lastDiagnosticsRefresh >= 100) {
      const diagnostics = client.diagnostics();
      statusFact.value.textContent = diagnostics.connection.phase;
      statusFact.value.dataset.state = diagnostics.connection.phase;
      roomFact.value.textContent = diagnostics.configuration.roomCode;
      matchFact.value.textContent = diagnostics.authority.matchId ?? 'waiting';
      playerFact.value.textContent = diagnostics.authority.playerId ?? 'waiting';
      protocolFact.value.textContent = `v${diagnostics.authority.protocolVersion}`;
      phaseFact.value.textContent = diagnostics.authority.matchPhase ?? 'waiting';
      impairmentFact.value.textContent = diagnostics.configuration.impairmentProfile;
      generatedMetric.value.textContent = String(diagnostics.counters.commandsGenerated);
      sentMetric.value.textContent = String(diagnostics.counters.batchesSent);
      ackMetric.value.textContent = `${diagnostics.counters.inputAcks} · seq ${diagnostics.input.lastAcknowledgedSequence}`;
      snapshotMetric.value.textContent = `${diagnostics.counters.fullSnapshots} / ${diagnostics.counters.deltaSnapshots}`;
      reconciliationMetric.value.textContent = `${diagnostics.counters.reconciliations} · ${diagnostics.local.lastReconciliationMode ?? 'initial'}`;
      interpolationMetric.value.textContent = `${diagnostics.counters.interpolationFrames} · ${diagnostics.remote.playerCount} remote`;
      const inboundImpairment = diagnostics.impairment?.inbound.metrics;
      const outboundImpairment = diagnostics.impairment?.outbound.metrics;
      inboundImpairmentMetric.value.textContent = inboundImpairment === undefined
        ? 'unavailable'
        : `${inboundImpairment.deliveredCopies} / ${inboundImpairment.droppedPackets} / ${inboundImpairment.duplicatedPackets} / ${inboundImpairment.reorderedPackets}`;
      outboundImpairmentMetric.value.textContent = outboundImpairment === undefined
        ? 'unavailable'
        : `${outboundImpairment.deliveredCopies} / ${outboundImpairment.droppedPackets} / ${outboundImpairment.duplicatedPackets} / ${outboundImpairment.reorderedPackets}`;
      impairmentOutput.textContent = JSON.stringify(diagnostics.impairment, null, 2);
      identityOutput.textContent = JSON.stringify(diagnostics.authority.simulationIdentity, null, 2);
      diagnosticsOutput.textContent = JSON.stringify(diagnostics, null, 2);
      errorOutput.textContent = diagnostics.lastError ?? '';
      resumeButton.disabled = !diagnostics.resume.available;
      body.dataset.authorityStatus = diagnostics.connection.phase;
      renderRequested = false;
      lastDiagnosticsRefresh = nowMilliseconds;
    }
    animationFrame = requestAnimationFrame(render);
  };

  client.start();
  animationFrame = requestAnimationFrame(render);
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(animationFrame);
    window.removeEventListener('keydown', keyboardHandler);
    window.removeEventListener('keyup', keyboardHandler);
    client.dispose();
    world.dispose();
    delete (window as { __KYX_AUTHORITY_EVIDENCE__?: ReadOnlyAuthorityEvidenceSurface })
      .__KYX_AUTHORITY_EVIDENCE__;
  }, { once: true });
}
