import {
  LOCAL_INKFALL_PRACTICE_TICK_MILLISECONDS,
  LocalInkfallPracticeHost,
  type AuthorityFullSnapshot,
  type LOCAL_INKFALL_PRACTICE_HOST_ID,
  RELAY_AUTHORITY_FIXTURE,
  RELAY_AUTHORITY_FIXTURE_HASH,
  RELAY_AUTHORITY_IDENTITY,
  RELAY_AUTHORITY_MAP_BINDING,
  RELAY_AUTHORITY_SPAWNS,
  RELAY_PORTAL_PRESENTATION_DEFINITIONS,
  kyxWeaponProfile,
  kyxWeaponProfileForSlot,
} from '../authority';
import { RELAY_AUTHORITY_COMPATIBILITY } from './relayVisualContinuity';
import { AudioManager } from '../core/AudioManager.js';
import { GameSettings } from '../core/GameSettings.js';
import { Loadout } from '../core/Loadout.js';
import { combatPresetAuthorityWeaponSlots } from '../loadouts';
import {
  clampMilliDegrees,
  MOVEMENT_PITCH_MAX_MILLI_DEGREES,
  MOVEMENT_PITCH_MIN_MILLI_DEGREES,
  normalizeYawMilliDegrees,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
} from '../sim';
import type { ReliableEvent } from '../net';
import { CaptionCueOverlay } from '../ui/CaptionCueOverlay.js';
import { HUD } from '../ui/HUD.js';
import type { AbilityLoadoutUiSlot } from '../abilities/abilityLoadout';
import { requestConfirmedPointerLock } from './movement/pointerLock';
import {
  LOCAL_PRACTICE_GOAL_SUMMARY,
  LOCAL_PRACTICE_GOAL_TITLE,
  LOCAL_PRACTICE_MODE_LABEL,
  LOCAL_PRACTICE_POINTER_LOCK_TIMEOUT_MILLISECONDS,
  localPracticeAbilityGuideRows,
} from './localPracticeEntryGate';
import { LocalInkfallPracticeInputBuffer } from './localInkfallPracticeInput';
import { createLocalInkfallPracticePresentation } from './localInkfallPracticePresentation';
import {
  createAuthorityPracticeMatchResultViewModel,
  createAuthorityScoreboardRows,
} from './authorityHudProjection';
import {
  createOnlineAuthorityThreeRuntime,
  type OnlineAuthorityThreeRuntime,
} from './onlineAuthorityThreeRuntime';
import {
  isOnlineBlinkPreviewCommitEligible,
  resolveOnlineBlinkPreview,
  type OnlineBlinkPreview,
} from './onlineBlinkPreview';

const MAXIMUM_AUTHORITY_STEPS_PER_FRAME = 5;
const MAXIMUM_FRAME_DELTA_MILLISECONDS = 250;
const RELIABLE_EVENT_RETENTION = 256;

interface LocalPracticeDiagnosticsV1 {
  readonly schemaVersion: 1;
  readonly status: 'ready' | 'paused' | 'result' | 'disposed';
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
  readonly entryGateState:
    | 'ready'
    | 'pending'
    | 'denied'
    | 'timed_out'
    | 'active'
    | 'result'
    | 'disposed';
  readonly aimHeld: boolean;
  readonly recentReliableEvents: number;
  readonly loadout: Readonly<{
    readonly combatPresetId: string;
    readonly primaryWeaponSlot: number;
    readonly allowedWeaponSlots: readonly number[];
    readonly authoritativeSelectedWeaponSlot: number;
    readonly authoritativeSelectedWeaponId: string | null;
    readonly abilitySlots: readonly string[];
  }>;
  readonly match: Readonly<{
    readonly phase: string;
    readonly activeTicksRemaining: number;
    readonly teamScores: readonly Readonly<{ readonly teamId: string; readonly score: number }>[];
    readonly playerScores: readonly Readonly<{
      readonly playerId: string;
      readonly teamId: string;
      readonly kills: number;
      readonly deaths: number;
      readonly assists: number;
    }>[];
    readonly damageEventCount: number;
    readonly killEventCount: number;
    readonly localLifePhase: string;
    readonly localDeathOrdinal: number;
    readonly localSpawnOrdinal: number;
    readonly localRespawnEligibleAtTick: number | null;
    readonly result: Readonly<{
      readonly reason: 'score_limit' | 'time_limit';
      readonly winningTeamId: string | null;
      readonly draw: boolean;
    }> | null;
  }>;
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
    readonly yawMilliDegrees: number;
    readonly pitchMilliDegrees: number;
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

function createResultStatRow(label: string, value: string | number): HTMLDivElement {
  const row = document.createElement('div');
  const valueNode = document.createElement('span');
  row.append(document.createTextNode(label), valueNode);
  valueNode.textContent = String(value);
  return row;
}

function createEntryGate(
  abilitySlots: readonly AbilityLoadoutUiSlot[],
  weaponControlLabel: string,
): Readonly<{
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
    <div class="local-practice-gate__index">${LOCAL_PRACTICE_MODE_LABEL}</div>
    <h1 id="local-practice-gate-title">${LOCAL_PRACTICE_GOAL_TITLE}</h1>
    <p class="local-practice-gate__brief">${LOCAL_PRACTICE_GOAL_SUMMARY}</p>
    <dl class="local-practice-gate__controls">
      <div><dt>Move</dt><dd>W A S D</dd></div>
      <div><dt>Fight</dt><dd>Mouse / R</dd></div>
      <div><dt>Weapons</dt><dd>${weaponControlLabel}</dd></div>
      <div><dt>Mobility</dt><dd>Space / Shift / C</dd></div>
      <div><dt>Pause</dt><dd>Escape</dd></div>
    </dl>
  `;
  const abilityGuide = document.createElement('div');
  abilityGuide.className = 'local-practice-gate__abilities';
  abilityGuide.setAttribute('aria-label', 'Selected abilities');
  for (const ability of localPracticeAbilityGuideRows(abilitySlots)) {
    const row = document.createElement('div');
    const key = document.createElement('kbd');
    const copy = document.createElement('p');
    const name = document.createElement('strong');
    const meaning = document.createElement('span');
    key.textContent = ability.inputLabel;
    name.textContent = ability.name;
    meaning.textContent = ability.meaning;
    if (ability.locked) name.dataset.locked = 'true';
    copy.append(name, meaning);
    row.append(key, copy);
    abilityGuide.appendChild(row);
  }
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
  root.append(abilityGuide, status, actions);
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
  const resultDialog = requireElement('#gameover-menu', HTMLDivElement);
  const resultTitle = requireElement('#gameover-title', HTMLHeadingElement);
  const resultStats = requireElement('#gameover-stats', HTMLDivElement);
  const rematchButton = requireElement('#restart-btn', HTMLButtonElement);
  const menuButton = requireElement('#menu-btn', HTMLButtonElement);
  hideLauncherChrome();
  document.title = 'KYX.IO — Relay Practice';
  document.querySelector('meta[name="description"]')?.setAttribute(
    'content',
    'Play KYX.IO team deathmatch practice in the Relay arena.',
  );
  body.dataset.launchSupport = 'local-relay-practice-authority';
  body.dataset.localPracticeStatus = 'loading';
  canvas.dataset.pointerLock = 'inactive';

  const combatPreset = Loadout.getCombatPreset();
  const allowedWeaponSlots = combatPresetAuthorityWeaponSlots(combatPreset);
  const abilityUiSlots = Loadout.getAbilityUiSlots() as readonly AbilityLoadoutUiSlot[];
  const weaponControlLabel = allowedWeaponSlots
    .map((slot) => {
      const family = kyxWeaponProfileForSlot(slot)?.family ?? 'weapon';
      return `${family[0]?.toUpperCase() ?? ''}${family.slice(1)} ${slot + 1}`;
    })
    .join(' / ');
  const gate = createEntryGate(abilityUiSlots, weaponControlLabel);
  app.append(gate.root);
  const hud = new HUD();
  hud.hide();
  hud.showPracticeStatus(true, 7, LOCAL_PRACTICE_MODE_LABEL);
  const input = new LocalInkfallPracticeInputBuffer({
    initialSelectedSlot: combatPreset.authorityPrimaryWeaponSlot,
    allowedSelectedSlots: allowedWeaponSlots,
  });
  const host = await LocalInkfallPracticeHost.create({
    botCount: 7,
    combatPresetId: combatPreset.id,
  });
  body.dataset.combatPresetId = combatPreset.id;
  body.dataset.helmetVariantId = combatPreset.helmetVariantId;
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
        mapReference: RELAY_AUTHORITY_MAP_BINDING.mapReference,
        presentationReference: RELAY_AUTHORITY_MAP_BINDING.presentationReference,
        fixtureHash: RELAY_AUTHORITY_FIXTURE_HASH,
        colliderCardinality: RELAY_AUTHORITY_IDENTITY.colliderCardinality,
        spawnCount: RELAY_AUTHORITY_SPAWNS.length,
        zoneCount: RELAY_AUTHORITY_MAP_BINDING.zones.length,
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
  let latestBlinkPreview: OnlineBlinkPreview | null = null;
  let scoreboardOpen = false;
  let matchResultShown = false;
  let entryRequestPending = false;
  let entryRequestOrdinal = 0;
  let entryRequestController: AbortController | null = null;
  let entryGateState: LocalPracticeDiagnosticsV1['entryGateState'] = 'ready';
  let lastScoreboardRefreshAt = 0;
  const recentHeadshots = new Map<string, number>();

  const projectedBlinkLook = (
    player: AuthorityFullSnapshot['players'][number]['movement']['player'],
  ): Readonly<{ yawMilliDegrees: number; pitchMilliDegrees: number }> => ({
    yawMilliDegrees: normalizeYawMilliDegrees(
      player.yawMilliDegrees + input.pendingLookYawMilliDegrees,
    ),
    pitchMilliDegrees: clampMilliDegrees(
      player.pitchMilliDegrees + input.pendingLookPitchMilliDegrees,
      MOVEMENT_PITCH_MIN_MILLI_DEGREES,
      MOVEMENT_PITCH_MAX_MILLI_DEGREES,
    ),
  });

  const showGate = (
    message: string,
    state: Extract<
      LocalPracticeDiagnosticsV1['entryGateState'],
      'ready' | 'denied' | 'timed_out'
    > = 'ready',
  ): void => {
    if (disposed || matchResultShown) return;
    entryGateState = state;
    gate.status.textContent = message;
    gate.root.classList.remove('hidden');
    hud.hideScoreboard();
    hud.hideLeaderboard();
    hud.hide();
    scoreboardOpen = false;
    if (!gate.enter.disabled) gate.enter.focus();
    body.dataset.localPracticeStatus = 'paused';
  };
  const hideGate = (): void => {
    entryGateState = 'active';
    gate.root.classList.add('hidden');
    hud.show();
    canvas.focus();
    body.dataset.localPracticeStatus = 'ready';
  };
  const cancelEntryRequest = (): void => {
    entryRequestOrdinal += 1;
    entryRequestPending = false;
    gate.enter.disabled = false;
    entryRequestController?.abort();
    entryRequestController = null;
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
    if (matchResultShown) {
      if (scoreboardOpen) hud.hideScoreboard();
      scoreboardOpen = false;
      return;
    }
    const shouldOpen = input.scoreboardHeld && pointerLocked;
    if (!shouldOpen) {
      if (scoreboardOpen) hud.hideScoreboard();
      scoreboardOpen = false;
      return;
    }
    if (scoreboardOpen && nowMilliseconds - lastScoreboardRefreshAt < 200) return;
    const rows = createAuthorityScoreboardRows(
      snapshot.match?.playerScores ?? [],
      host.localPlayerId,
    ).map((row) => ({
      ...row,
      name: displayPlayerName(row.playerId, host.localPlayerId),
    }));
    hud.showScoreboard(rows, LOCAL_PRACTICE_MODE_LABEL);
    scoreboardOpen = true;
    lastScoreboardRefreshAt = nowMilliseconds;
  };

  const presentMatchResult = (): boolean => {
    if (matchResultShown || snapshot.match?.result === null || snapshot.match === undefined) {
      return false;
    }
    const result = createAuthorityPracticeMatchResultViewModel({
      result: snapshot.match.result,
      playerScores: snapshot.match.playerScores,
      localPlayerId: host.localPlayerId,
    });
    matchResultShown = true;
    entryGateState = 'result';
    cancelEntryRequest();
    input.neutralize();
    accumulatorMilliseconds = 0;
    gate.root.classList.add('hidden');
    hud.hideScoreboard();
    hud.hideLeaderboard();
    hud.hide();
    scoreboardOpen = false;
    resultTitle.textContent = result.title;
    resultStats.replaceChildren(
      createResultStatRow('Final score', `${result.localTeamScore}-${result.opposingTeamScore}`),
      createResultStatRow('Match end', result.reasonLabel),
      createResultStatRow('Eliminations', result.kills),
      createResultStatRow('Deaths', result.deaths),
      createResultStatRow('Assists', result.assists),
      createResultStatRow('K/D', result.kd),
    );
    resultDialog.inert = false;
    resultDialog.classList.remove('hidden');
    body.dataset.localPracticeStatus = 'result';
    body.dataset.localPracticeResult = result.outcome;
    if (document.pointerLockElement === canvas) void document.exitPointerLock();
    queueMicrotask(() => rematchButton.focus());
    return true;
  };

  const render = (nowMilliseconds: number): void => {
    if (disposed) return;
    const elapsed = Math.min(
      MAXIMUM_FRAME_DELTA_MILLISECONDS,
      Math.max(0, nowMilliseconds - previousFrameMilliseconds),
    );
    previousFrameMilliseconds = nowMilliseconds;
    if (pointerLocked && !matchResultShown && document.visibilityState !== 'hidden') {
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
      interpolationAlpha: pointerLocked && !matchResultShown
        ? accumulatorMilliseconds / LOCAL_INKFALL_PRACTICE_TICK_MILLISECONDS
        : 1,
      localPlayerId: host.localPlayerId,
      recentEvents,
      aimHeld: input.aimHeld,
    });
    const authoritativeLocal = snapshot.players.find(
      ({ playerId }) => playerId === host.localPlayerId,
    )?.movement.player;
    const previewLook = authoritativeLocal === undefined
      ? null
      : projectedBlinkLook(authoritativeLocal);
    latestBlinkPreview = authoritativeLocal === undefined || previewLook === null
      ? null
      : resolveOnlineBlinkPreview({
          active: input.blinkPreviewHeld,
          feetPosition: authoritativeLocal.feetPosition,
          yawMilliDegrees: previewLook.yawMilliDegrees,
          pitchMilliDegrees: previewLook.pitchMilliDegrees,
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
      blinkPreview: latestBlinkPreview,
    });
    hud.render(projection.hud);
    hud.showPracticeStatus(true, host.botPlayerIds.length, LOCAL_PRACTICE_MODE_LABEL);
    renderScoreboard(nowMilliseconds);
    const localCombatPlayer = projection.combat.snapshot.players.find(
      ({ playerId }) => playerId === host.localPlayerId,
    );
    const localScore = snapshot.match?.playerScores.find(
      ({ playerId }) => playerId === host.localPlayerId,
    );
    const authoritativeWeaponSlot = localCombatPlayer?.selectedWeaponSlot
      ?? combatPreset.authorityPrimaryWeaponSlot;
    body.dataset.localPracticeMatchPhase = projection.combat.snapshot.match.phase;
    body.dataset.localPracticeLifePhase = localCombatPlayer?.lifePhase ?? 'unknown';
    body.dataset.localPracticeKills = String(localScore?.kills ?? 0);
    body.dataset.localPracticeDeaths = String(localScore?.deaths ?? 0);
    body.dataset.localPracticeAssists = String(localScore?.assists ?? 0);
    body.dataset.localPracticeWeaponSlot = String(authoritativeWeaponSlot);
    body.dataset.localPracticeServerTick = String(snapshot.serverTick);
    body.dataset.localPracticePlayerCount = String(snapshot.players.length);
    body.dataset.localPracticeMapId = snapshot.identity.mapId;
    presentMatchResult();
    animationFrame = requestAnimationFrame(render);
  };

  const requestEntry = async (): Promise<void> => {
    if (disposed || matchResultShown || entryRequestPending) return;
    const requestOrdinal = ++entryRequestOrdinal;
    const requestController = new AbortController();
    entryRequestController = requestController;
    entryRequestPending = true;
    entryGateState = 'pending';
    gate.enter.disabled = true;
    gameplayAudio.resume();
    gate.status.textContent = 'Capturing mouse…';
    const result = await requestConfirmedPointerLock(
      canvas,
      document,
      LOCAL_PRACTICE_POINTER_LOCK_TIMEOUT_MILLISECONDS,
      requestController.signal,
    );
    if (requestOrdinal !== entryRequestOrdinal) return;
    entryRequestPending = false;
    entryRequestController = null;
    gate.enter.disabled = false;
    if (disposed || matchResultShown) {
      if (document.pointerLockElement === canvas) void document.exitPointerLock();
      return;
    }
    if (result.ok || document.pointerLockElement === canvas) {
      hideGate();
      return;
    }
    if (result.reason === 'timeout') {
      showGate('Mouse capture did not complete. Click Enter arena to try again.', 'timed_out');
    } else if (result.reason !== 'aborted') {
      showGate('Mouse capture was denied. Click Enter arena to try again.', 'denied');
    }
  };
  const keyHandler = (event: KeyboardEvent): void => {
    if (!pointerLocked || matchResultShown) return;
    const authoritativeLocal = snapshot.players.find(
      ({ playerId }) => playerId === host.localPlayerId,
    )?.movement.player;
    const currentLook = authoritativeLocal === undefined
      ? undefined
      : projectedBlinkLook(authoritativeLocal);
    if (input.handleKey(
      event.code,
      event.type === 'keydown',
      event.repeat,
      isOnlineBlinkPreviewCommitEligible(latestBlinkPreview, currentLook),
    )) {
      event.preventDefault();
    }
  };
  const pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    if (matchResultShown) return;
    if (!pointerLocked) {
      void requestEntry();
      return;
    }
    gameplayAudio.resume();
    input.handlePointerButton(event.button, true);
  };
  const pointerUp = (event: PointerEvent): void => {
    if (matchResultShown) return;
    input.handlePointerButton(event.button, false);
  };
  const pointerMove = (event: MouseEvent): void => {
    if (pointerLocked && !matchResultShown) {
      input.addPointerLook(event.movementX, event.movementY);
    }
  };
  const pointerLockChange = (): void => {
    pointerLocked = document.pointerLockElement === canvas;
    canvas.dataset.pointerLock = pointerLocked ? 'active' : 'inactive';
    if (matchResultShown) {
      input.neutralize();
      accumulatorMilliseconds = 0;
      hud.hideScoreboard();
      scoreboardOpen = false;
      gate.root.classList.add('hidden');
      body.dataset.localPracticeStatus = 'result';
      if (pointerLocked) void document.exitPointerLock();
      queueMicrotask(() => rematchButton.focus());
      return;
    }
    if (pointerLocked) {
      cancelEntryRequest();
      hideGate();
    }
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
  const requestRematch = (): void => window.location.reload();
  const returnToMenu = (): void => window.location.assign('/');

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
  rematchButton.addEventListener('click', requestRematch);
  menuButton.addEventListener('click', returnToMenu);

  const diagnostics = (): LocalPracticeDiagnosticsV1 => {
    const metrics = host.authority.metricsSnapshot();
    const localPlayer = snapshot.players.find(
      ({ playerId }) => playerId === host.localPlayerId,
    );
    if (localPlayer === undefined) {
      throw new Error('LOCAL_INKFALL_PRACTICE_LOCAL_PLAYER_MISSING');
    }
    if (
      snapshot.match === undefined
      || localPlayer.combat === undefined
      || localPlayer.combat.abilityLoadout === undefined
    ) {
      throw new Error('LOCAL_INKFALL_PRACTICE_COMBAT_MISSING');
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
      status: disposed
        ? 'disposed'
        : matchResultShown
          ? 'result'
          : pointerLocked ? 'ready' : 'paused',
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
      entryGateState,
      aimHeld: input.aimHeld,
      recentReliableEvents: recentEvents.length,
      loadout: Object.freeze({
        combatPresetId: combatPreset.id,
        primaryWeaponSlot: combatPreset.authorityPrimaryWeaponSlot,
        allowedWeaponSlots,
        authoritativeSelectedWeaponSlot: localPlayer.combat.armory.selectedSlot,
        authoritativeSelectedWeaponId: localPlayer.combat.armory.weapons.find(
          ({ weaponId }) => (
            kyxWeaponProfile(weaponId).slot === localPlayer.combat?.armory.selectedSlot
          ),
        )?.weaponId ?? null,
        abilitySlots: Object.freeze([...localPlayer.combat.abilityLoadout.loadout.slots]),
      }),
      match: Object.freeze({
        phase: snapshot.match.phase,
        activeTicksRemaining: snapshot.match.activeTicksRemaining,
        teamScores: Object.freeze(snapshot.match.teamScores.map((score) => Object.freeze({
          teamId: score.teamId,
          score: score.score,
        }))),
        playerScores: Object.freeze(snapshot.match.playerScores.map((score) => Object.freeze({
          playerId: score.playerId,
          teamId: score.teamId,
          kills: score.kills,
          deaths: score.deaths,
          assists: score.assists,
        }))),
        damageEventCount: recentEvents.filter(({ kind }) => kind === 'damageApplied').length,
        killEventCount: recentEvents.filter(({ kind }) => kind === 'playerKilled').length,
        localLifePhase: localPlayer.combat.life.phase,
        localDeathOrdinal: localPlayer.combat.life.deathOrdinal,
        localSpawnOrdinal: localPlayer.combat.life.spawnOrdinal,
        localRespawnEligibleAtTick: localPlayer.combat.life.respawnEligibleAtTick,
        result: snapshot.match.result === null
          ? null
          : Object.freeze({
              reason: snapshot.match.result.reason,
              winningTeamId: snapshot.match.result.winningTeamId,
              draw: snapshot.match.result.draw,
            }),
      }),
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
        yawMilliDegrees: authoritativeMovement.yawMilliDegrees,
        pitchMilliDegrees: authoritativeMovement.pitchMilliDegrees,
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

  showGate('Arena ready. Capture the mouse to begin.');
  animationFrame = requestAnimationFrame(render);
  window.addEventListener('pagehide', () => {
    if (disposed) return;
    disposed = true;
    entryGateState = 'disposed';
    cancelEntryRequest();
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
    rematchButton.removeEventListener('click', requestRematch);
    menuButton.removeEventListener('click', returnToMenu);
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
