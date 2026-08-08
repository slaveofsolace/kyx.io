import {
  LOCAL_INKFALL_PRACTICE_TICK_MILLISECONDS,
  LocalInkfallPracticeHost,
  type AuthorityFullSnapshot,
  type LOCAL_INKFALL_PRACTICE_HOST_ID,
  RELAY_AUTHORITY_FIXTURE,
  RELAY_AUTHORITY_FIXTURE_HASH,
  RELAY_AUTHORITY_IDENTITY,
  RELAY_AUTHORITY_SPAWNS,
  RELAY_PORTAL_PRESENTATION_DEFINITIONS,
} from '../authority';
import { RELAY_AUTHORITY_COMPATIBILITY } from './relayVisualContinuity';
import { AudioManager } from '../core/AudioManager.js';
import { GameSettings } from '../core/GameSettings.js';
import { PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../sim';
import type { ReliableEvent } from '../net';
import { CaptionCueOverlay } from '../ui/CaptionCueOverlay.js';
import { HUD } from '../ui/HUD.js';
import { requestPointerLockWithRawFallback } from './movement/pointerLock';
import { LocalInkfallPracticeInputBuffer } from './localInkfallPracticeInput';
import { createLocalInkfallPracticePresentation } from './localInkfallPracticePresentation';
import {
  createOnlineAuthorityThreeRuntime,
  type OnlineAuthorityThreeRuntime,
} from './onlineAuthorityThreeRuntime';
import { resolveOnlineBlinkPreview } from './onlineBlinkPreview';

const MAXIMUM_AUTHORITY_STEPS_PER_FRAME = 5;
const MAXIMUM_FRAME_DELTA_MILLISECONDS = 250;
const RELIABLE_EVENT_RETENTION = 256;

interface LocalPracticeDiagnosticsV1 {
  readonly schemaVersion: 1;
  readonly status: 'ready' | 'paused' | 'disposed';
  readonly hostId: typeof LOCAL_INKFALL_PRACTICE_HOST_ID;
  readonly serverTick: number;
  readonly lifecycle: string;
  readonly playerCount: number;
  readonly botCount: number;
  readonly mapId: string;
  readonly fixtureId: string;
  readonly fixtureHash: string;
  readonly acceptedInputs: number;
  readonly missedSchedulerTicks: number;
  readonly pointerLocked: boolean;
  readonly aimHeld: boolean;
  readonly recentReliableEvents: number;
  readonly portalAuthorityCapabilityId: string | null;
  readonly recentPortalTraversalEvents: number;
  readonly launch: Readonly<{
    readonly acceptedThrowCount: number;
    readonly collisionCount: number;
    readonly detonationCount: number;
    readonly impulseAppliedCount: number;
    readonly terminalContactSameTick: boolean;
    readonly lastCollision: Readonly<{
      readonly eventId: string;
      readonly authorityTick: number;
      readonly bounceCount: number;
      readonly settled: boolean;
    }> | null;
    readonly lastDetonation: Readonly<{
      readonly eventId: string;
      readonly authorityTick: number;
      readonly reason: 'collision' | 'fuse' | 'lifetime';
    }> | null;
  }>;
  readonly localAuthoritativePlayer: Readonly<{
    readonly playerId: string;
    readonly feetPosition: Readonly<{ x: number; y: number; z: number }>;
    readonly velocity: Readonly<{ x: number; y: number; z: number }>;
    readonly teleportCooldownTicksRemaining: number;
  }>;
  readonly render3d: ReturnType<OnlineAuthorityThreeRuntime['diagnostics']>;
}

declare global {
  interface Window {
    __KYX_LOCAL_PRACTICE__?: Readonly<{
      schemaVersion: 1;
      getSnapshot: () => LocalPracticeDiagnosticsV1;
    }>;
  }
}

function requireElement<T extends Element>(selector: string, type: { new(): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) {
    throw new Error(`LOCAL_INKFALL_PRACTICE_DOM_MISSING:${selector}`);
  }
  return element;
}

function displayPlayerName(playerId: string, localPlayerId: string): string {
  if (playerId === localPlayerId) return 'You';
  const ordinal = /([0-9]+)$/u.exec(playerId)?.[1] ?? '?';
  return `Bot ${Number(ordinal) || ordinal}`;
}

function createEntryGate(): Readonly<{
  root: HTMLElement;
  status: HTMLElement;
  enter: HTMLButtonElement;
  exit: HTMLAnchorElement;
}> {
  const root = document.createElement('section');
  root.id = 'local-practice-gate';
  root.className = 'local-practice-gate';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-labelledby', 'local-practice-gate-title');
  root.innerHTML = `
    <div class="local-practice-gate__index">Relay / local authority</div>
    <h1 id="local-practice-gate-title">Enter the arena</h1>
    <p class="local-practice-gate__brief">Eight combatants share one exact 20 Hz authority simulation. Escape releases mouse capture.</p>
    <dl class="local-practice-gate__controls">
      <div><dt>Move</dt><dd>W A S D</dd></div>
      <div><dt>Fight</dt><dd>Mouse / R / 1–6</dd></div>
      <div><dt>Mobility</dt><dd>Space / Shift / C</dd></div>
      <div><dt>Abilities</dt><dd>Hold Q / E / F / Z</dd></div>
    </dl>
  `;
  const status = document.createElement('p');
  status.className = 'local-practice-gate__status';
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'Arena ready. Capture the mouse to begin.';
  const actions = document.createElement('div');
  actions.className = 'local-practice-gate__actions';
  const enter = document.createElement('button');
  enter.type = 'button';
  enter.className = 'local-practice-gate__enter';
  enter.textContent = 'Enter arena';
  const exit = document.createElement('a');
  exit.className = 'local-practice-gate__exit';
  exit.href = '/';
  exit.textContent = 'Return to menu';
  actions.append(enter, exit);
  root.append(status, actions);
  return Object.freeze({ root, status, enter, exit });
}

function hideLauncherChrome(): void {
  for (const selector of [
    '#connect-screen',
    '#top-nav',
    '#center-play',
    '.nav-panel',
    '#pause-menu',
    '#gameover-menu',
    '#leaderboard-overlay',
    '#scoreboard-overlay',
    '#desktop-required-overlay',
  ]) {
    document.querySelectorAll(selector).forEach((element) => element.classList.add('hidden'));
  }
}

export async function mountLocalInkfallPracticeRoute(
  body: HTMLBodyElement,
): Promise<void> {
  const canvas = requireElement('#game-canvas', HTMLCanvasElement);
  const app = requireElement('#app', HTMLDivElement);
  hideLauncherChrome();
  document.title = 'KYX.IO — Relay Practice';
  document.querySelector('meta[name="description"]')?.setAttribute(
    'content',
    'Local-authority KYX.IO combat practice in the Relay visual candidate.',
  );
  body.dataset.launchSupport = 'local-relay-practice-authority';
  body.dataset.localPracticeStatus = 'loading';
  canvas.dataset.pointerLock = 'inactive';

  const gate = createEntryGate();
  app.append(gate.root);
  const hud = new HUD();
  hud.show();
  hud.showPracticeStatus(true, 7, 'Relay · Local authority');
  const input = new LocalInkfallPracticeInputBuffer();
  const host = await LocalInkfallPracticeHost.create({ botCount: 7 });
  const gameplayAudio = new AudioManager();
  const settings = GameSettings.snapshot();
  gameplayAudio.setVolume(settings.volume);
  const captionRegion = document.getElementById('caption-region');
  const audioCueRegion = document.getElementById('audio-cue-region');
  const captionCues = captionRegion instanceof HTMLElement
    && audioCueRegion instanceof HTMLElement
    ? new CaptionCueOverlay({ document, captionRegion, audioCueRegion })
    : null;
  captionCues?.setPreferences(settings);
  let renderer: OnlineAuthorityThreeRuntime;
  try {
    renderer = await createOnlineAuthorityThreeRuntime(canvas, {
      presentationFixture: RELAY_AUTHORITY_FIXTURE,
      presentationIdentity: {
        mapReference: 'relay@1',
        presentationReference: 'relay@1/open-sky/v2',
        fixtureHash: RELAY_AUTHORITY_FIXTURE_HASH,
        colliderCardinality: RELAY_AUTHORITY_IDENTITY.colliderCardinality,
        spawnCount: RELAY_AUTHORITY_SPAWNS.length,
        zoneCount: 0,
        spawnPocketContainmentCount: 2,
        authorityCompatibility: RELAY_AUTHORITY_COMPATIBILITY,
      },
      showStaticWorldPortals: true,
      staticWorldPortalDefinitions: RELAY_PORTAL_PRESENTATION_DEFINITIONS,
      onWorldPortalAudio: ({ local }) => {
        if (!local) return;
        gameplayAudio.resume();
        gameplayAudio.playTeleportDeparture();
        gameplayAudio.playTeleportArrival(0.105);
        captionCues?.showAudioCue({
          id: 'world-portal',
          text: 'Portal transit',
          direction: 'none',
          priority: 'status',
          durationMs: 900,
          minIntervalMs: 300,
        });
      },
    });
  } catch (error) {
    captionCues?.dispose();
    host.dispose();
    throw error;
  }

  let previousSnapshot: AuthorityFullSnapshot = host.snapshot;
  let snapshot: AuthorityFullSnapshot = previousSnapshot;
  let recentEvents = [] as ReliableEvent[];
  let accumulatorMilliseconds = 0;
  let previousFrameMilliseconds = performance.now();
  let animationFrame = 0;
  let disposed = false;
  let pointerLocked = false;
  let scoreboardOpen = false;
  let lastScoreboardRefreshAt = 0;
  const recentHeadshots = new Map<string, number>();

  const showGate = (message: string): void => {
    if (disposed) return;
    gate.status.textContent = message;
    gate.root.classList.remove('hidden');
    gate.enter.focus();
    body.dataset.localPracticeStatus = 'paused';
  };
  const hideGate = (): void => {
    gate.root.classList.add('hidden');
    canvas.focus();
    body.dataset.localPracticeStatus = 'ready';
  };
  const processEvents = (events: readonly ReliableEvent[]): void => {
    for (const event of events) {
      if (
        event.actorId === host.localPlayerId
        && event.presentation?.kind === 'impulse_grenade_throw_accepted'
      ) {
        gameplayAudio.resume();
        gameplayAudio.playGrenadeThrow('launch');
      } else if (
        event.actorId === host.localPlayerId
        && event.presentation?.kind === 'impulse_grenade_detonated'
      ) {
        gameplayAudio.resume();
        gameplayAudio.playLaunchDetonation();
      } else if (event.kind === 'damageApplied' && event.presentation?.kind === 'damage_applied') {
        if (event.actorId === host.localPlayerId) {
          const headshot = event.presentation.hitRegion === 'head';
          hud.flashHitmarker(headshot);
          if (headshot) {
            recentHeadshots.set(event.targetId ?? '', event.serverTick);
            hud.showHeadshotFlair();
          }
        }
        if (event.targetId === host.localPlayerId) hud.flashDamage();
      } else if (event.kind === 'playerKilled') {
        const actor = displayPlayerName(event.actorId ?? 'unknown', host.localPlayerId);
        const target = displayPlayerName(event.targetId ?? 'unknown', host.localPlayerId);
        hud.addKillFeed(`${actor} eliminated ${target}`);
        if (event.actorId === host.localPlayerId) {
          const headshotTick = recentHeadshots.get(event.targetId ?? '');
          hud.showKillConfirmation({
            target,
            points: 100,
            headshot: headshotTick !== undefined && event.serverTick - headshotTick <= 1,
          });
        }
      } else if (
        event.actorId === host.localPlayerId
        && (
          event.kind === 'worldPortalTraversed'
          || event.presentation?.kind === 'teleport_resource_confirmed'
        )
      ) {
        hud.flashTeleport();
      } else if (
        event.targetId === host.localPlayerId
        && event.presentation?.kind === 'throwable_ability_event'
        && event.presentation.phase === 'flash_applied'
      ) {
        hud.showFlashEffect(
          (event.presentation.flashIntensityPermille ?? 680) / 1_000,
          (event.presentation.flashDurationTicks ?? 22) / 20,
        );
      } else if (
        event.actorId === host.localPlayerId
        && event.kind === 'abilityRejected'
      ) {
        const reason = event.presentation?.kind === 'throwable_ability_event'
          || event.presentation?.kind === 'teleport_resource_rejected'
          ? event.presentation.reason
          : 'Ability unavailable';
        hud.showAbilityUnavailable('Ability', reason ?? 'Unavailable');
      }
    }
  };

  const renderScoreboard = (nowMilliseconds: number): void => {
    const shouldOpen = input.scoreboardHeld && pointerLocked;
    if (!shouldOpen) {
      if (scoreboardOpen) hud.hideScoreboard();
      scoreboardOpen = false;
      return;
    }
    if (scoreboardOpen && nowMilliseconds - lastScoreboardRefreshAt < 200) return;
    const combat = createLocalInkfallPracticePresentation({
      snapshot,
      localPlayerId: host.localPlayerId,
    }).combat.snapshot;
    const rows = [...combat.players].map((player) => ({
      name: displayPlayerName(player.playerId, host.localPlayerId),
      kills: 0,
      score: combat.match.teamScores.find(({ teamId }) => teamId === player.teamId)?.score ?? 0,
      deaths: player.deathOrdinal,
      kd: player.deathOrdinal === 0 ? '0.0' : '0.0',
      isYou: player.playerId === host.localPlayerId,
    }));
    hud.showScoreboard(rows, 'Relay · Local authority');
    scoreboardOpen = true;
    lastScoreboardRefreshAt = nowMilliseconds;
  };

  const render = (nowMilliseconds: number): void => {
    if (disposed) return;
    const elapsed = Math.min(
      MAXIMUM_FRAME_DELTA_MILLISECONDS,
      Math.max(0, nowMilliseconds - previousFrameMilliseconds),
    );
    previousFrameMilliseconds = nowMilliseconds;
    if (pointerLocked && document.visibilityState !== 'hidden') {
      accumulatorMilliseconds += elapsed;
      let steps = 0;
      while (
        accumulatorMilliseconds >= LOCAL_INKFALL_PRACTICE_TICK_MILLISECONDS
        && steps < MAXIMUM_AUTHORITY_STEPS_PER_FRAME
      ) {
        previousSnapshot = snapshot;
        const step = host.step(input.consume());
        snapshot = step.snapshot;
        processEvents(step.reliableEvents);
        recentEvents.push(...step.reliableEvents);
        if (recentEvents.length > RELIABLE_EVENT_RETENTION) {
          recentEvents = recentEvents.slice(-RELIABLE_EVENT_RETENTION);
        }
        accumulatorMilliseconds -= LOCAL_INKFALL_PRACTICE_TICK_MILLISECONDS;
        steps += 1;
      }
      if (accumulatorMilliseconds >= LOCAL_INKFALL_PRACTICE_TICK_MILLISECONDS) {
        const missed = Math.floor(
          accumulatorMilliseconds / LOCAL_INKFALL_PRACTICE_TICK_MILLISECONDS,
        );
        host.authority.recordMissedSchedulerTicks(missed);
        accumulatorMilliseconds %= LOCAL_INKFALL_PRACTICE_TICK_MILLISECONDS;
      }
    } else {
      accumulatorMilliseconds = 0;
    }
    const projection = createLocalInkfallPracticePresentation({
      snapshot,
      previousSnapshot,
      interpolationAlpha: pointerLocked
        ? accumulatorMilliseconds / LOCAL_INKFALL_PRACTICE_TICK_MILLISECONDS
        : 1,
      localPlayerId: host.localPlayerId,
      recentEvents,
      aimHeld: input.aimHeld,
    });
    const authoritativeLocal = snapshot.players.find(
      ({ playerId }) => playerId === host.localPlayerId,
    )?.movement.player;
    const blinkPreview = authoritativeLocal === undefined
      ? null
      : resolveOnlineBlinkPreview({
          active: input.blinkPreviewHeld,
          feetPosition: authoritativeLocal.feetPosition,
          yawMilliDegrees: authoritativeLocal.yawMilliDegrees,
          pitchMilliDegrees: authoritativeLocal.pitchMilliDegrees,
          stance: authoritativeLocal.stance,
          cooldownTicksRemaining: authoritativeLocal.teleportCooldownTicksRemaining,
        }, PHASE3_HYPOTHESIS_MOVEMENT_PROFILE, host.world);
    renderer.render({
      nowMilliseconds,
      presentation: projection.presentation,
      combat: projection.combat,
      localYawMilliDegrees: projection.localMovement.yawMilliDegrees,
      localPitchMilliDegrees: projection.localMovement.pitchMilliDegrees,
      localSpeedMillimetersPerSecond: Math.hypot(
        projection.localMovement.velocity.x,
        projection.localMovement.velocity.z,
      ),
      aimHeld: input.aimHeld,
      blinkPreview,
    });
    hud.render(projection.hud);
    hud.showPracticeStatus(true, host.botPlayerIds.length, 'Relay · Local authority');
    renderScoreboard(nowMilliseconds);
    body.dataset.localPracticeServerTick = String(snapshot.serverTick);
    body.dataset.localPracticePlayerCount = String(snapshot.players.length);
    body.dataset.localPracticeMapId = snapshot.identity.mapId;
    animationFrame = requestAnimationFrame(render);
  };

  const requestEntry = async (): Promise<void> => {
    gameplayAudio.resume();
    gate.status.textContent = 'Capturing mouse…';
    const accepted = await requestPointerLockWithRawFallback(canvas);
    if (!accepted) showGate('Mouse capture was denied. Click Enter arena to try again.');
  };
  const keyHandler = (event: KeyboardEvent): void => {
    if (!pointerLocked) return;
    if (input.handleKey(event.code, event.type === 'keydown', event.repeat)) {
      event.preventDefault();
    }
  };
  const pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    if (!pointerLocked) {
      void requestEntry();
      return;
    }
    gameplayAudio.resume();
    input.handlePointerButton(event.button, true);
  };
  const pointerUp = (event: PointerEvent): void => {
    input.handlePointerButton(event.button, false);
  };
  const pointerMove = (event: MouseEvent): void => {
    if (pointerLocked) input.addPointerLook(event.movementX, event.movementY);
  };
  const pointerLockChange = (): void => {
    pointerLocked = document.pointerLockElement === canvas;
    canvas.dataset.pointerLock = pointerLocked ? 'active' : 'inactive';
    if (pointerLocked) hideGate();
    else {
      input.neutralize();
      hud.hideScoreboard();
      scoreboardOpen = false;
      showGate('Practice paused. Capture the mouse to continue.');
    }
  };
  const neutralize = (): void => input.neutralize();
  const visibilityHandler = (): void => {
    if (document.visibilityState === 'hidden') neutralize();
  };
  const preventContextMenu = (event: MouseEvent): void => event.preventDefault();

  gate.enter.addEventListener('click', requestEntry);
  window.addEventListener('keydown', keyHandler);
  window.addEventListener('keyup', keyHandler);
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerUp);
  window.addEventListener('blur', neutralize);
  document.addEventListener('mousemove', pointerMove);
  document.addEventListener('pointerlockchange', pointerLockChange);
  document.addEventListener('visibilitychange', visibilityHandler);
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('contextmenu', preventContextMenu);

  const diagnostics = (): LocalPracticeDiagnosticsV1 => {
    const metrics = host.authority.metricsSnapshot();
    const localPlayer = snapshot.players.find(
      ({ playerId }) => playerId === host.localPlayerId,
    );
    if (localPlayer === undefined) {
      throw new Error('LOCAL_INKFALL_PRACTICE_LOCAL_PLAYER_MISSING');
    }
    const authoritativeMovement = localPlayer.movement.player;
    const localLaunchEvents = recentEvents.filter((event) => (
      event.actorId === host.localPlayerId
      && event.presentation?.kind.startsWith('impulse_grenade_') === true
    ));
    const collisionEvent = [...localLaunchEvents].reverse().find(
      (event) => event.presentation?.kind === 'impulse_grenade_collision',
    );
    const detonationEvent = [...localLaunchEvents].reverse().find(
      (event) => event.presentation?.kind === 'impulse_grenade_detonated',
    );
    const collision = collisionEvent?.presentation?.kind === 'impulse_grenade_collision'
      ? collisionEvent.presentation
      : null;
    const detonation = detonationEvent?.presentation?.kind === 'impulse_grenade_detonated'
      ? detonationEvent.presentation
      : null;
    const countLaunchEvents = (kind: string): number => localLaunchEvents.filter(
      (event) => event.presentation?.kind === kind,
    ).length;
    return Object.freeze({
      schemaVersion: 1,
      status: disposed ? 'disposed' : pointerLocked ? 'ready' : 'paused',
      hostId: host.hostId,
      serverTick: snapshot.serverTick,
      lifecycle: snapshot.lifecycle,
      playerCount: snapshot.players.length,
      botCount: host.botPlayerIds.length,
      mapId: snapshot.identity.mapId,
      fixtureId: snapshot.identity.fixtureId,
      fixtureHash: snapshot.identity.fixtureHash,
      acceptedInputs: metrics.acceptedInputs,
      missedSchedulerTicks: metrics.missedSchedulerTicks,
      pointerLocked,
      aimHeld: input.aimHeld,
      recentReliableEvents: recentEvents.length,
      portalAuthorityCapabilityId: host.authority.worldPortalCapabilityId,
      recentPortalTraversalEvents: recentEvents.filter(
        ({ kind, actorId }) => (
          kind === 'worldPortalTraversed' && actorId === host.localPlayerId
        ),
      ).length,
      launch: Object.freeze({
        acceptedThrowCount: countLaunchEvents('impulse_grenade_throw_accepted'),
        collisionCount: countLaunchEvents('impulse_grenade_collision'),
        detonationCount: countLaunchEvents('impulse_grenade_detonated'),
        impulseAppliedCount: countLaunchEvents('impulse_grenade_impulse_applied'),
        terminalContactSameTick: collision !== null
          && detonation !== null
          && collision.authorityTick === detonation.authorityTick,
        lastCollision: collision === null
          ? null
          : Object.freeze({
              eventId: collision.eventId,
              authorityTick: collision.authorityTick,
              bounceCount: collision.bounceCount,
              settled: collision.settled,
            }),
        lastDetonation: detonation === null
          ? null
          : Object.freeze({
              eventId: detonation.eventId,
              authorityTick: detonation.authorityTick,
              reason: detonation.reason,
            }),
      }),
      localAuthoritativePlayer: Object.freeze({
        playerId: localPlayer.playerId,
        feetPosition: Object.freeze({ ...authoritativeMovement.feetPosition }),
        velocity: Object.freeze({ ...authoritativeMovement.velocity }),
        teleportCooldownTicksRemaining:
          authoritativeMovement.teleportCooldownTicksRemaining,
      }),
      render3d: renderer.diagnostics(),
    });
  };
  Object.defineProperty(window, '__KYX_LOCAL_PRACTICE__', {
    configurable: true,
    enumerable: false,
    value: Object.freeze({ schemaVersion: 1 as const, getSnapshot: diagnostics }),
  });

  body.dataset.localPracticeStatus = 'paused';
  gate.status.textContent = 'Arena ready. Capture the mouse to begin.';
  animationFrame = requestAnimationFrame(render);
  window.addEventListener('pagehide', () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(animationFrame);
    gate.enter.removeEventListener('click', requestEntry);
    window.removeEventListener('keydown', keyHandler);
    window.removeEventListener('keyup', keyHandler);
    window.removeEventListener('pointerup', pointerUp);
    window.removeEventListener('pointercancel', pointerUp);
    window.removeEventListener('blur', neutralize);
    document.removeEventListener('mousemove', pointerMove);
    document.removeEventListener('pointerlockchange', pointerLockChange);
    document.removeEventListener('visibilitychange', visibilityHandler);
    canvas.removeEventListener('pointerdown', pointerDown);
    canvas.removeEventListener('contextmenu', preventContextMenu);
    if (document.pointerLockElement === canvas) void document.exitPointerLock();
    hud.hide();
    captionCues?.dispose();
    renderer.dispose();
    host.dispose();
    gate.root.remove();
    delete window.__KYX_LOCAL_PRACTICE__;
    body.dataset.localPracticeStatus = 'disposed';
  }, { once: true });
}
