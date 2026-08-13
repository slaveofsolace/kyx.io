import { hashRulesetContent, requireRuleset } from '../content';
import { AudioManager } from '../core/AudioManager.js';
import { GameSettings } from '../core/GameSettings.js';
import {
  authorityLoadoutForCombatPreset,
  createAuthorityLoadoutRequestMessage,
  RELAY_PORTAL_PRESENTATION_DEFINITIONS,
} from '../authority';
import {
  ABILITY_ID,
  ABILITY_PRESENTATION,
} from '../abilities/abilityLoadout';
import { Loadout } from '../core/Loadout.js';
import { UserAccount } from '../core/UserAccount.js';
import { CANONICAL_ARENA_AUTHORITY_WEAPON_SLOTS } from '../loadouts';
import {
  applyCombatPresentationReliableEvent,
  applyCombatPresentationWireHydration,
  createCombatPresentationAdapter,
  type CombatPresentationAdapterV1,
  type CombatPresentationIntentV1,
} from '../client';
import {
  createRapierMovementWorld,
  getPhysicsFixture,
  type RapierMovementWorld,
} from '../physics';
import type { SimulationIdentityV1 } from '../net';
import type { CombatSnapshotV1, ReliableEvent } from '../net';
import { deriveRev17AuthorityAction } from '../player/rev17ActionContract.js';
import { CaptionCueOverlay } from '../ui/CaptionCueOverlay.js';
import {
  createOnlineHudViewModel,
} from '../ui/hudViewModel';
import { createAbilityGlyph } from '../ui/abilityGlyph';
import {
  INTENT_BUTTON,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  hashMovementProfile,
} from '../sim';
import {
  AuthorityEvidenceClient,
  type AuthorityEvidenceDiagnostics,
  type AuthorityEvidencePresentation,
} from '../dev/authorityEvidenceClient';
import {
  axesFromPressedKeys,
  type AuthorityEvidenceConfig,
} from '../dev/authorityEvidenceModel';
import {
  createBrowserAuthorityEvidenceScheduler,
  createBrowserAuthorityEvidenceTransport,
} from '../dev/authorityEvidenceTransport';
import {
  createOnlineCombatRoom,
  createOnlineAuthorityMapCombatRoom,
  verifyOnlineAuthorityMapCombatRoom,
  type OnlineAuthorityMapRoomProof,
} from './onlineAuthorityGateway';
import { classifyAuthorityDamageDirection } from './authorityDamageDirection';
import {
  isOnlineAuthorityInputCode,
  onlineAuthorityInputButtonsFromPressedKeys,
  onlineAuthorityWeaponSlotFromCode,
} from './onlineAuthorityInput';
import { createOnlineAuthorityWorld } from './onlineAuthorityInkfallWorld';
import {
  clearOnlineAuthorityResumeCredential,
  createOnlineAuthorityResumeBinding,
  persistOnlineAuthorityResumeCredential,
  readOnlineAuthorityResumeCredential,
} from './onlineAuthorityResumeSession';
import {
  isOnlineBlinkPreviewCommitEligible,
  resolveOnlineBlinkPreview,
  type OnlineBlinkPreview,
} from './onlineBlinkPreview';
import {
  createOnlineAuthorityThreeRuntime,
  type OnlineAuthorityThreeDiagnostics,
  type OnlineAuthorityThreeRuntime,
} from './onlineAuthorityThreeRuntime';
import {
  ONLINE_CROWNPOINT_REV1_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID,
  ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
  ONLINE_SWITCHYARD_REV1_COMBAT_PROFILE_ID,
  type OnlineAuthorityProfileSelection,
} from './onlineAuthorityProfiles';
import { nextOnlineArenaProfile } from './onlineArenaRotation';
import {
  classifyOnlineAuthorityPresentationEvent,
  selectOnlineAbilityPresentationAudioOwner,
  type OnlineAbilityPresentationAudioEvent,
} from './onlineAuthorityPresentationRouting';
import {
  createAuthorityAbilityHudInputs,
  createAuthorityMatchResultViewModel,
  createAuthorityScoreboardRows,
} from './authorityHudProjection';
import {
  ONLINE_AUTHORITY_PATH,
  defaultOnlineProfile,
  onlineCreatePath,
  onlineJoinPath,
  parseOnlineAuthorityRequest,
  protocolDisplayName,
  type OnlineAuthorityAvailability,
} from './onlineAuthoritySelection';

interface OnlinePreviewSnapshot {
  readonly schemaVersion: 1;
  readonly productStatus: 'PRE_RELEASE_COMBAT_PREVIEW';
  readonly roomCode: string;
  readonly connection: AuthorityEvidenceDiagnostics['connection']['phase'];
  readonly matchId: string | null;
  readonly playerId: string | null;
  readonly remotePlayers: number;
  readonly fullSnapshots: number;
  readonly deltaSnapshots: number;
  readonly commandsGenerated: number;
  readonly inputAcks: number;
  readonly reconciliations: number;
  readonly resumeSuccesses: number;
  readonly combat: AuthorityEvidenceDiagnostics['combat'];
  readonly inputBridge: Readonly<{
    pressedKeys: readonly string[];
    axes: Readonly<{ moveX: number; moveY: number }>;
    heldButtons: number;
    jump: boolean;
    sprint: boolean;
    crouch: boolean;
    primaryFire: boolean;
    aimHeld: boolean;
    blinkPreviewHeld: boolean;
    selectedWeaponSlot: number;
  }>;
  readonly blinkPreview: OnlineBlinkPreview | null;
  readonly localAuthoritativePlayerId: string | null;
  readonly localPredictedPosition: Readonly<{ x: number; y: number; z: number }> | null;
  readonly localAuthoritativePosition: Readonly<{ x: number; y: number; z: number }> | null;
  readonly localPredictedVelocity: Readonly<{ x: number; y: number; z: number }> | null;
  readonly localAuthoritativeVelocity: Readonly<{ x: number; y: number; z: number }> | null;
  readonly localPredictedGrounded: boolean | null;
  readonly localAuthoritativeGrounded: boolean | null;
  readonly localPredictedLocomotion: 'grounded' | 'airborne' | 'sliding' | null;
  readonly localAuthoritativeLocomotion: 'grounded' | 'airborne' | 'sliding' | null;
  readonly localAuthoritativeYawMilliDegrees: number | null;
  readonly localPredictedYawMilliDegrees: number | null;
  readonly localPredictedPitchMilliDegrees: number | null;
  readonly localPredictionErrorMillimeters: number | null;
  readonly localPredictionHistoryCommands: number;
  readonly remoteEntities: readonly Readonly<{
    entityId: string;
    interpolationMode: AuthorityEvidencePresentation['remotes'][number]['mode'];
    position: Readonly<{ x: number; y: number; z: number }>;
    grounded: boolean;
    stance: 'standing' | 'crouched';
    locomotion: 'grounded' | 'airborne' | 'sliding';
    travelSector: AuthorityEvidencePresentation['remotes'][number]['state']['locomotionSignal']['sector'];
    forwardSpeedMillimetersPerSecond: number;
    rightSpeedMillimetersPerSecond: number;
  }>[];
  readonly remotePositions: readonly Readonly<{ x: number; y: number; z: number }>[];
  readonly lastError: string | null;
  readonly render3d: OnlineAuthorityThreeDiagnostics | null;
  readonly presentation: Readonly<{
    status: 'waiting' | 'ready' | 'failed';
    hydrationCount: number;
    intentCount: number;
    confirmedIntentCount: number;
    rejectedIntentCount: number;
    duplicateAuthorityEvents: number;
    staleAuthorityEvents: number;
    lastCue:
      | 'snapshot'
      | 'body'
      | 'head'
      | 'head_kill'
      | 'shield'
      | 'kill'
      | 'grenade_throw'
      | 'grenade_collision'
      | 'grenade_detonation'
      | 'grenade_impulse'
      | 'teleport'
      | 'teleport_rejected'
      | null;
    lastAuthorityEventId: string | null;
    audioCueAttempts: number;
    recentCues: readonly Readonly<{
      cue: Exclude<OnlinePreviewSnapshot['presentation']['lastCue'], null>;
      source: CombatPresentationIntentV1['source'];
      authorityEventId: string | null;
      authorityTick: number | null;
      hudMarker: string | null;
      vfxMarker: string | null;
      audioMarker: string | null;
      renderedHud: true;
      renderedVfx: boolean;
      audioAttempted: boolean;
    }>[];
  }>;
  readonly roomVerification?: Readonly<{
    roomProfile: OnlineAuthorityProfileSelection;
    mapBinding: OnlineAuthorityMapRoomProof['mapBinding'];
    simulationIdentity: SimulationIdentityV1;
    identityChecks: number;
  }>;
}

declare global {
  interface Window {
    readonly __KYX_ONLINE_PREVIEW__?: Readonly<{
      schemaVersion: 1;
      getSnapshot: () => OnlinePreviewSnapshot;
    }>;
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

function createShell(): { readonly root: HTMLElement; readonly content: HTMLElement } {
  const root = element('main', 'online-preview');
  root.dataset.testid = 'online-preview-route';
  const bar = element('header', 'online-preview__bar');
  const brand = element('a', 'online-preview__brand');
  brand.href = '/';
  brand.setAttribute('aria-label', 'KYX.IO home');
  brand.append(document.createTextNode('KYX'), element('span', '', '.IO'));
  const meta = element('div', 'online-preview__bar-meta');
  meta.append(
    element('span', 'online-preview__status-dot', 'Online'),
    element('span', '', 'Guest session'),
  );
  const back = element('a', 'online-preview__back', 'Offline practice');
  back.href = '/';
  meta.append(back);
  bar.append(brand, meta);
  const content = element('div', 'online-preview__content');
  root.append(bar, content);
  return { root, content };
}

function appendScopeNotice(
  parent: HTMLElement,
  mapProfile: OnlineAuthorityProfileSelection | null = null,
): void {
  const notice = element('details', 'online-preview__scope');
  notice.append(
    element('summary', '', 'Technical scope'),
    element(
      'span',
      '',
      mapProfile === ONLINE_RELAY_REV1_COMBAT_PROFILE_ID
        ? 'Relay Revision 1: the browser and Worker share the same 56-collider arena, eight spawns, paired portal authority, combat, and secure resume contract. Environment art, balance, and human play approval remain work in progress.'
        : mapProfile === ONLINE_SWITCHYARD_REV1_COMBAT_PROFILE_ID
          ? 'Switchyard Revision 1: an original eight-spawn freight arena with server-owned collision, combat, bots, score, respawn, and secure resume. Visual and balance acceptance remain work in progress.'
        : mapProfile === ONLINE_CROWNPOINT_REV1_COMBAT_PROFILE_ID
          ? 'Crownpoint Revision 1: an original eight-spawn vertical arena with server-owned collision, combat, bots, score, respawn, and secure resume. Visual and balance acceptance remain work in progress.'
        : mapProfile === ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID
          ? 'Retired Foundry Revision 4 compatibility profile retained only for persisted rooms and checkpoints.'
        : mapProfile === ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID
          ? 'Retired Revision 3 compatibility profile retained only for persisted rooms and checkpoints.'
        : mapProfile === ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID
          ? 'Legacy authority preview: movement, rifle hitscan occlusion, grenade collision and radial occlusion use the hash-locked P5.10 Rapier fixture. It is retained for compatibility evidence, not current map presentation.'
        : 'Authoritative revision-3 combat preview: movement, rifle, health, team score, feed, respawn, grenade state, remote interpolation, and secure resume. Matchmaking, progression, real-map grenade collision, and release readiness are not included yet.',
    ),
  );
  parent.append(notice);
}

function renderNotice(
  content: HTMLElement,
  title: string,
  copy: string,
  mapProfile: OnlineAuthorityProfileSelection = defaultOnlineProfile(),
  actionLabel = 'Back to online',
  actionPath: string = ONLINE_AUTHORITY_PATH,
): void {
  content.replaceChildren(
    element('p', 'online-preview__eyebrow', 'Online'),
    element('h1', 'online-preview__title', 'Room unavailable.'),
  );
  appendScopeNotice(content, mapProfile);
  const notice = element('section', 'online-preview__notice');
  notice.append(element('h2', '', title), element('p', '', copy));
  const action = element('button', 'online-preview__primary', actionLabel);
  action.type = 'button';
  action.addEventListener('click', () => window.location.assign(actionPath));
  notice.append(action);
  content.append(notice);
}

function renderLanding(
  content: HTMLElement,
  availability: OnlineAuthorityAvailability,
  selectedProfile?: OnlineAuthorityProfileSelection,
): void {
  content.replaceChildren(
    element('p', 'online-preview__eyebrow', 'Online'),
    element('h1', 'online-preview__title', 'Create or join a room.'),
    element(
      'p',
      'online-preview__intro',
      'Guest sessions use server-owned movement, combat, score, and respawn.',
    ),
  );
  const configured = availability.kind === 'configured';
  const profileOption = element('label', 'online-preview__profile-option');
  const profileCheckbox = document.createElement('input');
  profileCheckbox.type = 'radio';
  profileCheckbox.name = 'online-arena-profile';
  profileCheckbox.required = true;
  const selectedLegacyProfile = selectedProfile !== undefined
    && selectedProfile !== ONLINE_RELAY_REV1_COMBAT_PROFILE_ID
    && selectedProfile !== ONLINE_SWITCHYARD_REV1_COMBAT_PROFILE_ID
    && selectedProfile !== ONLINE_CROWNPOINT_REV1_COMBAT_PROFILE_ID
    ? selectedProfile
    : ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID;
  profileCheckbox.checked = selectedProfile !== undefined
    && selectedProfile !== ONLINE_RELAY_REV1_COMBAT_PROFILE_ID
    && selectedProfile !== ONLINE_SWITCHYARD_REV1_COMBAT_PROFILE_ID
    && selectedProfile !== ONLINE_CROWNPOINT_REV1_COMBAT_PROFILE_ID;
  profileCheckbox.disabled = !configured;
  profileCheckbox.dataset.testid = 'online-inkfall-profile';
  const profileCopy = element('span', '');
  profileCopy.append(
    element('strong', '', 'Legacy arena'),
    element(
      'span',
      '',
      'Older collision compatibility preview.',
    ),
  );
  profileOption.append(profileCheckbox, profileCopy);
  const relayProfileOption = element('label', 'online-preview__profile-option');
  const relayProfileCheckbox = document.createElement('input');
  relayProfileCheckbox.type = 'radio';
  relayProfileCheckbox.name = 'online-arena-profile';
  relayProfileCheckbox.required = true;
  relayProfileCheckbox.checked = selectedProfile === undefined
    || selectedProfile === ONLINE_RELAY_REV1_COMBAT_PROFILE_ID;
  relayProfileCheckbox.disabled = !configured;
  relayProfileCheckbox.dataset.testid = 'online-relay-rev1-profile';
  const relayProfileCopy = element('span', '');
  relayProfileCopy.append(
    element('strong', '', 'Relay'),
    element(
      'span',
      '',
      'Current shared Practice/online arena and linked portals.',
    ),
  );
  relayProfileOption.append(relayProfileCheckbox, relayProfileCopy);
  const switchyardProfileOption = element('label', 'online-preview__profile-option');
  const switchyardProfileCheckbox = document.createElement('input');
  switchyardProfileCheckbox.type = 'radio';
  switchyardProfileCheckbox.name = 'online-arena-profile';
  switchyardProfileCheckbox.required = true;
  switchyardProfileCheckbox.checked = selectedProfile === ONLINE_SWITCHYARD_REV1_COMBAT_PROFILE_ID;
  switchyardProfileCheckbox.disabled = !configured;
  switchyardProfileCheckbox.dataset.testid = 'online-switchyard-rev1-profile';
  const switchyardProfileCopy = element('span', '');
  switchyardProfileCopy.append(
    element('strong', '', 'Switchyard'),
    element('span', '', 'Freight lanes, container cover, and a contested raised deck.'),
  );
  switchyardProfileOption.append(switchyardProfileCheckbox, switchyardProfileCopy);
  const crownpointProfileOption = element('label', 'online-preview__profile-option');
  const crownpointProfileCheckbox = document.createElement('input');
  crownpointProfileCheckbox.type = 'radio';
  crownpointProfileCheckbox.name = 'online-arena-profile';
  crownpointProfileCheckbox.required = true;
  crownpointProfileCheckbox.checked = selectedProfile === ONLINE_CROWNPOINT_REV1_COMBAT_PROFILE_ID;
  crownpointProfileCheckbox.disabled = !configured;
  crownpointProfileCheckbox.dataset.testid = 'online-crownpoint-rev1-profile';
  const crownpointProfileCopy = element('span', '');
  crownpointProfileCopy.append(
    element('strong', '', 'Crownpoint'),
    element('span', '', 'Four approach lanes converge on a high central crown.'),
  );
  crownpointProfileOption.append(crownpointProfileCheckbox, crownpointProfileCopy);
  const profilePicker = element('details', 'online-preview__profile-picker');
  profilePicker.hidden = !configured;
  profilePicker.append(
    element('summary', '', 'Arena profile'),
    relayProfileOption,
    switchyardProfileOption,
    crownpointProfileOption,
    profileOption,
  );
  content.append(profilePicker);
  const chosenProfile = (): OnlineAuthorityProfileSelection | undefined => {
    if (relayProfileCheckbox.checked) return ONLINE_RELAY_REV1_COMBAT_PROFILE_ID;
    if (switchyardProfileCheckbox.checked) return ONLINE_SWITCHYARD_REV1_COMBAT_PROFILE_ID;
    if (crownpointProfileCheckbox.checked) return ONLINE_CROWNPOINT_REV1_COMBAT_PROFILE_ID;
    return selectedLegacyProfile;
  };
  const lobby = element('section', 'online-preview__lobby');
  const createCard = element('article', 'online-preview__lobby-card');
  createCard.append(
    element('span', 'online-preview__card-number', 'Host'),
    element('h2', 'online-preview__card-title', 'Create room'),
    element(
      'p',
      'online-preview__card-copy',
      'Start a new arena and share its short room code.',
    ),
  );
  const createButton = element('button', 'online-preview__primary', 'Create room');
  createButton.type = 'button';
  createButton.disabled = !configured;
  createButton.dataset.testid = 'online-create-room';
  createButton.addEventListener('click', () => window.location.assign(onlineCreatePath(chosenProfile())));
  createCard.append(createButton);

  const joinCard = element('article', 'online-preview__lobby-card');
  joinCard.append(
    element('span', 'online-preview__card-number', 'Join'),
    element('h2', 'online-preview__card-title', 'Join room'),
    element(
      'p',
      'online-preview__card-copy',
      'Enter the room code shared by another player.',
    ),
  );
  const form = element('form', '');
  const joinRow = element('div', 'online-preview__join-row');
  const input = element('input', 'online-preview__input');
  input.type = 'text';
  input.inputMode = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.maxLength = 10;
  input.placeholder = 'KYX-ABC234';
  input.setAttribute('aria-label', 'Room code');
  input.disabled = !configured;
  input.dataset.testid = 'online-room-code';
  const joinButton = element('button', 'online-preview__secondary', 'Join room');
  joinButton.type = 'submit';
  joinButton.disabled = !configured;
  joinButton.dataset.testid = 'online-join-room';
  const error = element('p', 'online-preview__form-error');
  error.setAttribute('role', 'alert');
  input.addEventListener('input', () => {
    const selectionStart = input.selectionStart;
    input.value = input.value.toUpperCase().replace(/\s+/gu, '');
    if (selectionStart !== null) input.setSelectionRange(selectionStart, selectionStart);
    error.textContent = '';
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      window.location.assign(onlineJoinPath(input.value, chosenProfile()));
    } catch {
      error.textContent = 'Enter a valid code such as KYX-ABC234.';
    }
  });
  joinRow.append(input, joinButton);
  form.append(joinRow, error);
  joinCard.append(form);
  lobby.append(createCard, joinCard);
  content.append(lobby);

  const endpoint = element('p', 'online-preview__endpoint');
  if (availability.kind === 'configured') {
    endpoint.textContent = `Ready as ${protocolDisplayName(UserAccount.getDisplayName())}`;
  } else if (availability.kind === 'invalid') {
    endpoint.textContent = 'Online is unavailable in this build.';
    endpoint.title = availability.reason;
  } else {
    endpoint.textContent = 'Online is unavailable in this build.';
    endpoint.title = 'VITE_KYX_AUTHORITY_ORIGIN is not configured.';
  }
  content.append(endpoint);
  appendScopeNotice(content, selectedProfile ?? defaultOnlineProfile());
}

function expectedIdentity(
  world: RapierMovementWorld,
  mapId: 'phase4_flat_run' | 'inkfall_foundry' | 'relay' | 'switchyard' | 'crownpoint' = 'phase4_flat_run',
): SimulationIdentityV1 {
  const ruleset = requireRuleset('revamped_classic', 3);
  if (
    ruleset.movementProfile.id !== PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.id
    || ruleset.movementProfile.revision !== PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.revision
  ) throw new Error('ONLINE_PREVIEW_RULESET_PROFILE_MISMATCH');
  return Object.freeze({
    schemaVersion: 1,
    mapId,
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

interface OnlineCombatView {
  readonly snapshot: CombatSnapshotV1 | null;
  readonly recentEvents: readonly ReliableEvent[];
  readonly localPlayerId: string | null;
}

function renderArena(
  canvas: HTMLCanvasElement,
  presentation: AuthorityEvidencePresentation,
  combat: OnlineCombatView,
  inkfallRevision2: boolean,
): void {
  const context = canvas.getContext('2d', { alpha: false });
  if (context === null) throw new Error('ONLINE_PREVIEW_CANVAS_UNAVAILABLE');
  const width = canvas.width;
  const height = canvas.height;
  const padding = 48;
  const arenaExtentMillimeters = inkfallRevision2 ? 45_000 : 12_000;
  const scale = Math.min(
    (width - padding * 2) / (arenaExtentMillimeters * 2),
    (height - padding * 2) / (arenaExtentMillimeters * 2),
  );
  const project = (position: Readonly<{ x: number; z: number }>): [number, number] => [
    width / 2 + position.x * scale,
    height / 2 - position.z * scale,
  ];

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#071216');
  gradient.addColorStop(1, '#05090d');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#112a30';
  context.lineWidth = 1;
  const gridExtentMillimeters = inkfallRevision2 ? 40_000 : 10_000;
  const gridStepMillimeters = inkfallRevision2 ? 10_000 : 2_000;
  for (
    let millimeters = -gridExtentMillimeters;
    millimeters <= gridExtentMillimeters;
    millimeters += gridStepMillimeters
  ) {
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
  context.strokeStyle = '#27505a';
  context.lineWidth = 2;
  context.strokeRect(padding, padding, width - padding * 2, height - padding * 2);
  context.fillStyle = '#58717a';
  context.font = '800 10px ui-monospace, monospace';
  context.fillText(
    inkfallRevision2
      ? 'INKFALL FOUNDRY @2 · HASH-LOCKED SERVER COLLISION · 90M VIEW'
      : 'SERVER-AUTHORED COMBAT PLANE · 24M × 24M',
    padding,
    27,
  );
  context.fillText(`TICK ${presentation.estimatedServerTick.toFixed(1)}`, width - 112, 27);

  const positions = new Map<string, Readonly<{ x: number; z: number }>>();
  if (combat.localPlayerId !== null && presentation.localPredicted !== null) {
    positions.set(combat.localPlayerId, presentation.localPredicted);
  }
  for (const remote of presentation.remotes) positions.set(remote.entityId, remote.state.feetPosition);

  for (const event of combat.recentEvents) {
    if (presentation.estimatedServerTick - event.serverTick > 12) continue;
    const actor = event.actorId === null ? null : positions.get(event.actorId);
    if (actor === null || actor === undefined) continue;
    const [actorX, actorY] = project(actor);
    if (event.kind === 'damageApplied' && event.targetId !== null) {
      const target = positions.get(event.targetId);
      if (target !== undefined) {
        const [targetX, targetY] = project(target);
        context.strokeStyle = '#fff2a8';
        context.lineWidth = 3;
        context.shadowColor = '#ffd166';
        context.shadowBlur = 15;
        context.beginPath();
        context.moveTo(actorX, actorY);
        context.lineTo(targetX, targetY);
        context.stroke();
        context.shadowBlur = 0;
      }
    } else if (
      event.kind === 'shotAccepted'
      || event.kind === 'weaponAttackAccepted'
    ) {
      context.strokeStyle = '#f8ffff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(actorX, actorY, 17, 0, Math.PI * 2);
      context.stroke();
    }
  }

  for (const projectile of combat.snapshot?.projectiles ?? []) {
    const [x, y] = project({ x: projectile.xMillimeters, z: projectile.zMillimeters });
    const pulse = 6 + Math.sin(presentation.estimatedServerTick * .7) * 2;
    context.fillStyle = '#c889ff';
    context.shadowColor = '#b95fff';
    context.shadowBlur = 22;
    context.beginPath();
    context.arc(x, y, pulse, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = '#f0d7ff';
    context.beginPath();
    context.arc(x, y, 12, 0, Math.PI * 2);
    context.stroke();
  }
  for (const field of combat.snapshot?.smokeFields ?? []) {
    const [x, y] = project({ x: field.xMillimeters, z: field.zMillimeters });
    const expansionLinear = Math.max(
      0,
      Math.min(1, (presentation.estimatedServerTick - field.spawnedAtTick) / 27),
    );
    const expansion = expansionLinear * expansionLinear * (3 - 2 * expansionLinear);
    const fade = Math.max(
      0,
      Math.min(1, (field.expiresAtTick - presentation.estimatedServerTick) / 30),
    );
    const radius = Math.max(2, field.radiusMillimeters * scale * expansion);
    const smoke = context.createRadialGradient(x, y, radius * 0.2, x, y, radius);
    smoke.addColorStop(0, `rgba(154, 178, 184, ${0.5 * fade})`);
    smoke.addColorStop(0.65, `rgba(93, 117, 124, ${0.28 * fade})`);
    smoke.addColorStop(1, 'rgba(44, 58, 63, 0)');
    context.fillStyle = smoke;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  for (const projectile of combat.snapshot?.abilityProjectiles ?? []) {
    const [x, y] = project({ x: projectile.xMillimeters, z: projectile.zMillimeters });
    const color = projectile.abilityId === 'smoke_grenade_v1'
      ? '#a6bec3'
      : projectile.abilityId === 'flash_grenade_v1'
        ? '#7fe7ff'
        : projectile.abilityId === 'sticky_grenade_v1' ? '#ff9a69' : '#ff6552';
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 15;
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
  }

  if (presentation.localAuthoritative !== null) {
    const [x, y] = project(presentation.localAuthoritative);
    context.strokeStyle = '#f3fbfd';
    context.lineWidth = 2;
    context.setLineDash([4, 4]);
    context.beginPath();
    context.arc(x, y, 11, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
  }
  if (combat.snapshot !== null) {
    for (const player of combat.snapshot.players) {
      const position = positions.get(player.playerId);
      if (position === undefined) continue;
      const [x, y] = project(position);
      const local = player.playerId === combat.localPlayerId;
      const semanticAction = deriveRev17AuthorityAction(
        player,
        combat.recentEvents,
        presentation.estimatedServerTick,
      );
      const color = player.teamId === 'team_blue' ? '#14e0ff' : '#ff6570';
      context.strokeStyle = color;
      context.fillStyle = color;
      context.shadowColor = color;
      context.shadowBlur = local ? 20 : 12;
      context.lineWidth = local ? 4 : 3;
      if (player.lifePhase === 'dead') {
        context.beginPath();
        context.moveTo(x - 9, y - 9);
        context.lineTo(x + 9, y + 9);
        context.moveTo(x + 9, y - 9);
        context.lineTo(x - 9, y + 9);
        context.stroke();
      } else {
        context.beginPath();
        context.arc(x, y, local ? 11 : 9, 0, Math.PI * 2);
        context.fill();
        const forward = player.teamId === 'team_blue' ? -1 : 1;
        context.beginPath();
        context.moveTo(x, y + forward * 18);
        context.lineTo(x - 5, y + forward * 10);
        context.lineTo(x + 5, y + forward * 10);
        context.closePath();
        context.fill();

        // Action glyphs are derived only from validated authority snapshot and
        // reliable-event data. They do not predict or create gameplay state.
        context.save();
        context.strokeStyle = '#eefbff';
        context.fillStyle = '#eefbff';
        context.lineWidth = 2;
        context.shadowBlur = 0;
        if (semanticAction.kind === 'fire') {
          context.beginPath();
          context.moveTo(x, y + forward * 13);
          context.lineTo(x, y + forward * 28);
          context.stroke();
        } else if (semanticAction.kind === 'reload') {
          context.beginPath();
          context.arc(x, y, local ? 17 : 15, -Math.PI * 0.8, Math.PI * 0.8);
          context.stroke();
        } else if (semanticAction.kind === 'ability') {
          context.beginPath();
          context.moveTo(x, y - 20);
          context.lineTo(x + 6, y - 14);
          context.lineTo(x, y - 8);
          context.lineTo(x - 6, y - 14);
          context.closePath();
          context.stroke();
        } else if (semanticAction.kind === 'equip') {
          context.strokeRect(x - 15, y - 15, 30, 30);
        }
        context.restore();
      }
      context.shadowBlur = 0;
      context.fillStyle = '#071013';
      context.fillRect(x - 17, y - 27, 34, 5);
      context.fillStyle = player.healthPoints > 30 ? '#62eda0' : '#ff6b70';
      context.fillRect(x - 17, y - 27, 34 * (player.healthPoints / 100), 5);
      context.fillStyle = '#eefbff';
      context.font = '900 10px ui-monospace, monospace';
      const label = local ? 'YOU' : 'PEER';
      const state = player.lifePhase === 'dead'
        ? `DOWN · ${Math.max(0, (player.respawnEligibleAtTick ?? 0) - Math.floor(presentation.estimatedServerTick))}T`
        : `${semanticAction.kind.toUpperCase()} · ${player.healthPoints} HP · ${player.magazineRounds}`;
      context.fillText(`${label} · ${state}`, x + 17, y - 11);
    }
  } else {
    if (presentation.localPredicted !== null) {
      const [x, y] = project(presentation.localPredicted);
      context.fillStyle = '#14e0ff';
      context.beginPath();
      context.arc(x, y, 7, 0, Math.PI * 2);
      context.fill();
    }
    for (const remote of presentation.remotes) {
      const [x, y] = project(remote.state.feetPosition);
      context.fillStyle = '#ffd166';
      context.beginPath();
      context.arc(x, y, 7, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function fact(label: string): { readonly root: HTMLElement; readonly value: HTMLElement } {
  const root = element('div', 'online-session__fact');
  const value = element('strong', '', '—');
  root.append(element('span', '', label), value);
  return { root, value };
}

function metric(label: string): { readonly root: HTMLElement; readonly value: HTMLElement } {
  const root = element('div', 'online-session__metric');
  const value = element('strong', '', '0');
  root.append(element('span', '', label), value);
  return { root, value };
}

type OnlineSessionBinding =
  | Readonly<{ kind: 'flat_run_revision_3' }>
  | Readonly<{
      kind: 'authority_map';
      proof: OnlineAuthorityMapRoomProof;
    }>;

interface OnlineSessionController {
  dispose(): void;
}

type OnlineSessionContinuation = (
  profile: OnlineAuthorityProfileSelection,
) => Promise<void>;

async function mountSession(
  body: HTMLBodyElement,
  content: HTMLElement,
  authorityOrigin: string,
  roomCode: string,
  mode: AuthorityEvidenceConfig['mode'],
  sessionBinding: OnlineSessionBinding,
  continueToNextMatch: OnlineSessionContinuation,
): Promise<OnlineSessionController> {
  let disposed = false;
  body.dataset.onlineHud = 'arena-visor-v1';
  const selectedCombatPreset = Loadout.getCombatPreset();
  const allowedAuthorityWeaponSlots = new Set<number>(
    CANONICAL_ARENA_AUTHORITY_WEAPON_SLOTS,
  );
  body.dataset.combatPresetId = selectedCombatPreset.id;
  body.dataset.helmetVariantId = selectedCombatPreset.helmetVariantId;
  body.dataset.onlineHud = 'cutline-v1';
  const developmentDiagnosticsVisible =
    new URLSearchParams(window.location.search).get('debug') === '1';
  content.classList.add('online-preview__content--session');
  const displayName = protocolDisplayName(UserAccount.getDisplayName());
  const mapProof = sessionBinding.kind === 'authority_map'
    ? sessionBinding.proof
    : null;
  const mapProfile = mapProof?.roomProfile ?? null;
  const mapRuntime = mapProof !== null;
  const relayRuntime = mapProfile === ONLINE_RELAY_REV1_COMBAT_PROFILE_ID;
  const originalArenaRuntime = mapProfile === ONLINE_SWITCHYARD_REV1_COMBAT_PROFILE_ID
    || mapProfile === ONLINE_CROWNPOINT_REV1_COMBAT_PROFILE_ID;
  const threeDimensionalMap = relayRuntime
    || originalArenaRuntime
    || mapProfile === ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID
    || mapProfile === ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID;
  const mapDisplayName = mapProof !== null && 'displayName' in mapProof.mapBinding
    ? mapProof.mapBinding.displayName
    : relayRuntime ? 'Relay' : 'Authoritative arena';
  const world = mapProof !== null
    ? await createOnlineAuthorityWorld(mapProof.mapBinding)
    : await createRapierMovementWorld(getPhysicsFixture('flat_run'));
  const identity = expectedIdentity(
    world,
    mapProof?.mapBinding.mapId ?? 'phase4_flat_run',
  );
  const resumeBinding = createOnlineAuthorityResumeBinding({
    authorityOrigin,
    roomCode,
    profileId: mapProfile ?? 'flat_run_revision_3',
    mapId: identity.mapId,
    fixtureHash: identity.fixtureHash,
  });
  const initialResumeCredential = readOnlineAuthorityResumeCredential(
    window.sessionStorage,
    resumeBinding,
  );
  body.dataset.onlineInitialConnectionIntent = initialResumeCredential === null
    ? 'join'
    : 'resume';
  const scheduler = createBrowserAuthorityEvidenceScheduler();
  const config: AuthorityEvidenceConfig = Object.freeze({
    authorityUrl: authorityOrigin,
    mode,
    roomCode: mode === 'join' ? roomCode : null,
    displayName,
    impairmentProfile: 'nominal',
  });

  const head = element('section', 'online-session__head');
  const title = element('div', '');
  title.append(
    element(
      'p',
      'online-preview__eyebrow',
      relayRuntime || originalArenaRuntime
        ? `${mapDisplayName} · Online`
        : threeDimensionalMap
        ? 'Compatibility arena · Online'
        : mapRuntime
          ? 'Legacy map · Online'
        : 'Online match',
    ),
    element(
      'h1',
      '',
      mapDisplayName,
    ),
    element(
      'p',
      'online-session__instructions',
      threeDimensionalMap
        ? 'Click the arena to capture the pointer. WASD moves; Shift sprints; Space jumps; C crouches; 1–6 equip; E/F/Z use abilities; Q Blinks.'
        : mapRuntime
          ? 'Click the arena to focus. WASD moves; Shift sprints; Space jumps; C crouches; E/F/Z use abilities; Q Blinks.'
          : 'Click the arena to focus. Movement, combat, score and life state resolve on the server.',
    ),
  );
  const room = element('div', 'online-session__room');
  room.append(
    element('span', 'online-session__room-label', 'Room code'),
    element('strong', 'online-session__room-code', roomCode),
  );
  head.append(title, room);

  const profileBanner = mapRuntime ? element('section', 'online-session__profile') : null;
  if (profileBanner !== null && mapProof !== null) {
    profileBanner.dataset.testid = 'online-profile-binding';
    profileBanner.append(
      element('strong', '', 'Opt-in profile verified'),
      element(
        'code',
        '',
        `${mapProof.roomProfile} · ${mapProof.mapBinding.mapReference} · ${mapProof.mapBinding.fixtureId} / ${mapProof.mapBinding.fixtureHash} · ${mapProof.mapBinding.colliderCardinality} colliders`,
      ),
    );
  }

  const facts = element('section', 'online-session__facts');
  const connectionFact = fact('Connection');
  const matchFact = fact('Ruleset');
  const playerFact = fact('Player');
  const peersFact = fact('Remote players');
  const phaseFact = fact('Match phase');
  const tickFact = fact('Server tick');
  connectionFact.value.dataset.testid = 'online-connection';
  matchFact.value.dataset.testid = 'online-match';
  playerFact.value.dataset.testid = 'online-player';
  peersFact.value.dataset.testid = 'online-remotes';
  facts.append(
    connectionFact.root,
    matchFact.root,
    playerFact.root,
    peersFact.root,
    phaseFact.root,
    tickFact.root,
  );

  const grid = element('section', 'online-session__grid');
  const arenaPanel = element('section', 'online-session__panel');
  const arenaHead = element(
    'div',
    'online-session__panel-head',
    relayRuntime || originalArenaRuntime
      ? mapDisplayName
      : mapRuntime
        ? 'Legacy arena'
        : 'Online arena',
  );
  arenaHead.append(element(
    'span',
    '',
    threeDimensionalMap
      ? `Click for mouse look · WASD · ${selectedCombatPreset.roleLabel} + blade · M1 fire · M2 ADS · R reload · E/F/Z abilities · Q Blink`
      : 'WASD + air steer · Shift sprint · Space jump · C/Ctrl crouch + slide · Mouse/Arrows look · M1 fire · M2 ADS · R reload · E/F/Z abilities · Q Blink',
  ));
  const canvasWrap = element('div', 'online-session__canvas-wrap');
  const canvas = element('canvas', 'online-session__canvas');
  canvas.width = threeDimensionalMap ? 1280 : 960;
  canvas.height = threeDimensionalMap ? 720 : 640;
  canvas.dataset.testid = 'online-arena';
  canvas.dataset.renderer = threeDimensionalMap ? 'three' : 'canvas2d';
  canvas.tabIndex = 0;
  canvas.setAttribute(
    'aria-label',
    threeDimensionalMap
      ? 'Play online team deathmatch in Relay with linked portals. Click for mouse look; Mouse 1 fires and Mouse 2 aims.'
      : 'Online authoritative combat arena. Click to focus; Mouse 1 fires and Mouse 2 aims.',
  );
  const mapStatus = element(
    'div',
    'online-session__map-status',
    threeDimensionalMap
      ? 'Loading arena…'
      : 'Arena ready',
  );
  mapStatus.dataset.testid = 'online-map-load-status';
  mapStatus.dataset.state = threeDimensionalMap ? 'loading' : 'ready';
  const reticle = element('div', 'online-session__reticle');
  reticle.setAttribute('aria-hidden', 'true');
  const flashOverlay = element('div', 'online-session__flash-overlay');
  flashOverlay.dataset.active = 'false';
  flashOverlay.setAttribute('aria-hidden', 'true');
  const weaponRail = element('div', 'online-session__weapon-rail');
  weaponRail.dataset.testid = 'online-weapon-rail';
  const weaponSlotDefinitions = Object.freeze([
    Object.freeze({ slot: 0, key: '1', label: 'Auto' }),
    Object.freeze({ slot: 1, key: '2', label: 'Sidearm' }),
    Object.freeze({ slot: 2, key: '3', label: 'Scatter' }),
    Object.freeze({ slot: 3, key: '4', label: 'Longshot' }),
    Object.freeze({ slot: 4, key: '5', label: 'Rocket' }),
    Object.freeze({ slot: 5, key: '6', label: 'Blade' }),
  ] as const);
  const weaponSlotButtons = weaponSlotDefinitions.map((definition) => {
    const button = element('button', 'online-session__weapon-slot');
    button.type = 'button';
    button.dataset.testid = `online-weapon-slot-${definition.slot}`;
    button.dataset.slot = String(definition.slot);
    const allowed = allowedAuthorityWeaponSlots.has(definition.slot);
    const active = definition.slot === selectedCombatPreset.authorityPrimaryWeaponSlot;
    button.dataset.active = String(active);
    button.dataset.presetAllowed = String(allowed);
    button.disabled = !allowed;
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute(
      'aria-label',
      allowed
        ? `Weapon ${definition.key}: ${definition.label}`
        : `Weapon ${definition.key}: ${definition.label}, unavailable for ${selectedCombatPreset.displayName}`,
    );
    button.title = allowed
      ? `${definition.key} · ${definition.label}`
      : `${definition.label} is not in the ${selectedCombatPreset.displayName} preset`;
    button.append(
      element('strong', '', definition.key),
      element('span', '', definition.label),
    );
    weaponRail.append(button);
    return button;
  });
  const feedbackVfx = element('div', 'online-session__feedback-vfx');
  feedbackVfx.setAttribute('aria-hidden', 'true');
  const feedbackGlyph = element('div', 'online-session__feedback-glyph');
  feedbackGlyph.dataset.testid = 'online-confirmed-vfx';
  feedbackVfx.append(feedbackGlyph);
  const feedbackHud = element('div', 'online-session__feedback-hud');
  feedbackHud.dataset.testid = 'online-confirmed-hud';
  feedbackHud.setAttribute('role', 'status');
  feedbackHud.setAttribute('aria-live', 'polite');
  const damageDirection = element('div', 'online-session__damage-direction');
  damageDirection.dataset.testid = 'online-damage-direction';
  damageDirection.dataset.active = 'false';
  damageDirection.setAttribute('role', 'status');
  damageDirection.setAttribute('aria-live', 'polite');
  const damageDirectionMarker = element('span', 'online-session__damage-direction-marker');
  damageDirectionMarker.setAttribute('aria-hidden', 'true');
  const damageDirectionText = element('span', 'online-session__damage-direction-text');
  damageDirection.append(damageDirectionMarker, damageDirectionText);
  const captionRegion = element('div', 'caption-region hidden');
  captionRegion.id = 'caption-region';
  captionRegion.setAttribute('aria-live', 'polite');
  captionRegion.setAttribute('aria-atomic', 'true');
  captionRegion.setAttribute('aria-label', 'Subtitles');
  const audioCueRegion = element('div', 'audio-cue-region hidden');
  audioCueRegion.id = 'audio-cue-region';
  audioCueRegion.setAttribute('aria-live', 'polite');
  audioCueRegion.setAttribute('aria-atomic', 'true');
  audioCueRegion.setAttribute('aria-label', 'Critical sound indicators');
  canvasWrap.append(
    canvas,
    ...(threeDimensionalMap ? [mapStatus, reticle] : []),
    flashOverlay,
    feedbackVfx,
    feedbackHud,
    damageDirection,
    weaponRail,
    ...(threeDimensionalMap ? [captionRegion, audioCueRegion] : []),
  );
  const combatStrip = element('div', 'online-session__combat-strip');
  const blueCombat = element('div', 'online-session__combat-player');
  const blueName = element('div', 'online-session__combat-name');
  const blueState = element('span', '', 'BLUE · WAITING');
  const blueHealthText = element('strong', '', '— HP');
  blueName.append(blueState, blueHealthText);
  const blueHealthTrack = element('div', 'online-session__health-track');
  const blueHealthFill = element('div', 'online-session__health-fill');
  blueHealthFill.dataset.testid = 'online-blue-health';
  blueHealthTrack.append(blueHealthFill);
  blueCombat.append(blueName, blueHealthTrack);
  const score = element('div', 'online-session__score');
  const scoreValue = element('strong', '', '0 — 0');
  scoreValue.dataset.testid = 'online-score';
  const scorePhase = element('span', '', 'WAITING FOR PEER');
  score.append(scoreValue, scorePhase);
  const redCombat = element('div', 'online-session__combat-player');
  const redName = element('div', 'online-session__combat-name');
  const redState = element('span', '', 'RED · WAITING');
  const redHealthText = element('strong', '', '— HP');
  redName.append(redState, redHealthText);
  const redHealthTrack = element('div', 'online-session__health-track');
  const redHealthFill = element('div', 'online-session__health-fill');
  redHealthFill.dataset.testid = 'online-red-health';
  redHealthTrack.append(redHealthFill);
  redCombat.append(redName, redHealthTrack);
  combatStrip.append(blueCombat, score, redCombat);
  const legend = element('div', 'online-session__legend');
  for (const [label, color] of [
    ['Team blue', '#14e0ff'],
    ['Team red', '#ff6570'],
    ['Server reconciliation', '#f3fbfd'],
    ['Impulse Grenade', '#c889ff'],
  ] as const) {
    const entry = element('span', '', label);
    const marker = element('i', '');
    marker.style.setProperty('--legend-color', color);
    entry.prepend(marker);
    legend.append(entry);
  }
  arenaPanel.append(arenaHead, canvasWrap, combatStrip, legend);

  const side = element('aside', 'online-session__side');
  const playerPanel = element('section', 'online-session__panel');
  playerPanel.append(element('div', 'online-session__panel-head', 'Room access'));
  const playerBody = element('div', 'online-session__side-body');
  playerBody.append(
    element('p', 'online-session__guest', displayName),
    element('p', 'online-session__muted', 'Local guest profile · no password or account credential sent'),
  );
  const inviteUrl = new URL(
    onlineJoinPath(
      roomCode,
      mapProfile ?? undefined,
    ),
    window.location.origin,
  ).toString();
  const invite = element('code', 'online-session__invite', inviteUrl);
  invite.dataset.testid = 'online-invite';
  const actions = element('div', 'online-session__actions');
  const copyButton = element('button', 'online-preview__primary', 'Copy invite link');
  copyButton.type = 'button';
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      copyButton.textContent = 'Invite copied';
    } catch {
      copyButton.textContent = 'Copy unavailable — select link';
    }
  });
  const resumeButton = element('button', 'online-preview__secondary', 'Reconnect session');
  resumeButton.type = 'button';
  resumeButton.disabled = true;
  resumeButton.dataset.testid = 'online-resume';
  actions.append(copyButton, resumeButton);
  playerBody.append(invite, actions);
  playerPanel.append(playerBody);

  const combatPanel = element('section', 'online-session__panel');
  combatPanel.append(element('div', 'online-session__panel-head', 'Local authoritative combat'));
  const combatBody = element('div', 'online-session__combat-panel');
  const combatStats = element('div', 'online-session__combat-stats');
  const localHealth = metric('Health');
  const localAmmo = metric('Ammo');
  const localRifle = metric('Weapon');
  const localGrenade = metric('Abilities');
  localHealth.value.dataset.testid = 'online-local-health';
  localAmmo.value.dataset.testid = 'online-local-ammo';
  localRifle.value.dataset.testid = 'online-local-rifle';
  localGrenade.value.dataset.testid = 'online-local-grenade';
  for (const item of [localHealth, localAmmo, localRifle, localGrenade]) {
    item.root.className = 'online-session__combat-stat';
    combatStats.append(item.root);
  }
  localHealth.root.classList.add('online-session__combat-stat--health');
  localAmmo.root.classList.add('online-session__combat-stat--ammo');
  localRifle.root.classList.add('online-session__combat-stat--weapon');
  localGrenade.root.classList.add('online-session__combat-stat--abilities');
  const controls = element('div', 'online-session__controls');
  const sprintButton = element('button', 'online-session__control', 'HOLD SPRINT · SHIFT');
  sprintButton.type = 'button';
  sprintButton.dataset.testid = 'online-sprint';
  const jumpButton = element('button', 'online-session__control', 'JUMP · SPACE');
  jumpButton.type = 'button';
  jumpButton.dataset.testid = 'online-jump';
  const crouchButton = element('button', 'online-session__control', 'HOLD CROUCH / SLIDE · C / CTRL');
  crouchButton.type = 'button';
  crouchButton.dataset.testid = 'online-crouch';
  const fireButton = element('button', 'online-session__control', 'HOLD FIRE · ENTER / MOUSE 1');
  fireButton.type = 'button';
  fireButton.dataset.testid = 'online-fire';
  const reloadButton = element('button', 'online-session__control', 'RELOAD · R');
  reloadButton.type = 'button';
  reloadButton.dataset.testid = 'online-reload';
  const abilityOneButton = element('button', 'online-session__control', 'ABILITY 1 · E');
  abilityOneButton.type = 'button';
  abilityOneButton.dataset.testid = 'online-ability-one';
  const abilityTwoButton = element('button', 'online-session__control', 'ABILITY 2 · F');
  abilityTwoButton.type = 'button';
  abilityTwoButton.dataset.testid = 'online-ability-two';
  const abilityThreeButton = element('button', 'online-session__control', 'ABILITY 3 · Z');
  abilityThreeButton.type = 'button';
  abilityThreeButton.dataset.testid = 'online-ability-three';
  const teleportButton = element('button', 'online-session__control', 'BLINK · Q');
  teleportButton.type = 'button';
  teleportButton.dataset.testid = 'online-teleport';
  for (const button of [
    sprintButton,
    jumpButton,
    crouchButton,
    fireButton,
    reloadButton,
  ]) button.classList.add('online-session__control--auxiliary');
  for (const button of [
    abilityOneButton,
    abilityTwoButton,
    abilityThreeButton,
    teleportButton,
  ]) button.classList.add('online-session__control--ability');
  controls.append(
    sprintButton,
    jumpButton,
    crouchButton,
    fireButton,
    reloadButton,
    abilityOneButton,
    abilityTwoButton,
    abilityThreeButton,
    teleportButton,
  );
  const feed = element('div', 'online-session__feed');
  feed.dataset.testid = 'online-killfeed';
  const limitation = element(
    'p',
    'online-session__limitation',
    relayRuntime || originalArenaRuntime
      ? `WORK IN PROGRESS: ${mapDisplayName} combat is playable now. Arena art, balance, and polish are still being shaped for tester feedback.`
      : threeDimensionalMap
        ? 'COMPATIBILITY MODE: this persisted Foundry room retains its locked authority contract. It is not the current arena direction.'
      : mapRuntime
        ? 'INTEGRATION LIMIT: this room uses the real hash-locked P5.10 Inkfall @2 hitscan and grenade collision ports. Final-map traversal, final visuals, and human acceptance are still open; this preview does not claim G4 or G5.'
      : 'PRE-RELEASE LIMIT: movement uses the real flat-run Rapier fixture; grenade flight is authoritative, but this room still uses the deterministic empty combat-collision evidence port rather than accepted real-map grenade collision.',
  );
  const feedbackProof = element('div', 'online-session__feedback-proof');
  const feedbackProofValue = element('strong', '', 'WAITING FOR HYDRATION');
  feedbackProofValue.dataset.testid = 'online-presentation-status';
  feedbackProof.append(
    element('span', '', 'Confirmed HUD / audio / VFX bridge'),
    feedbackProofValue,
  );
  combatBody.append(combatStats, controls, feed, feedbackProof, limitation);
  combatPanel.append(combatBody);

  const metricsPanel = element('section', 'online-session__panel');
  metricsPanel.append(element('div', 'online-session__panel-head', 'Live transport counters'));
  const metricsGrid = element('div', 'online-session__metrics');
  const snapshotMetric = metric('Snapshots full / delta');
  const reconciliationMetric = metric('Reconciliations');
  const correctionMetric = metric('Last correction');
  const resumeMetric = metric('Resume success');
  metricsGrid.append(
    snapshotMetric.root,
    reconciliationMetric.root,
    correctionMetric.root,
    resumeMetric.root,
  );
  metricsPanel.append(metricsGrid);

  const scoreboard = element('section', 'online-session__scoreboard');
  scoreboard.dataset.testid = 'online-scoreboard';
  scoreboard.dataset.open = 'false';
  scoreboard.setAttribute('aria-hidden', 'true');
  const scoreboardHeader = element('header', 'online-session__scoreboard-head');
  scoreboardHeader.append(
    element('strong', '', 'Match'),
    element('span', '', 'Hold Tab'),
  );
  const scoreboardScore = element('strong', 'online-session__scoreboard-score', '0 — 0');
  const scoreboardPlayers = element('div', 'online-session__scoreboard-players');
  scoreboard.append(scoreboardHeader, scoreboardScore, scoreboardPlayers);
  const lifeBanner = element('div', 'online-session__life-banner');
  lifeBanner.dataset.testid = 'online-life-banner';
  lifeBanner.setAttribute('role', 'status');
  lifeBanner.setAttribute('aria-live', 'polite');
  lifeBanner.hidden = true;
  canvasWrap.append(combatStrip, combatStats, controls, feed, lifeBanner, scoreboard);
  arenaPanel.replaceChildren(canvasWrap);

  const sessionDrawer = element('details', 'online-session__session-drawer');
  const sessionSummary = element('summary', 'online-session__drawer-toggle');
  sessionSummary.append(
    element('span', '', 'Room'),
    element('strong', '', roomCode),
  );
  sessionDrawer.append(sessionSummary, playerPanel);

  const diagnostics = element('details', 'online-session__diagnostics');
  diagnostics.hidden = !developmentDiagnosticsVisible;
  const diagnosticsSummary = element('summary', 'online-session__drawer-toggle', 'Diagnostics');
  diagnosticsSummary.setAttribute(
    'aria-label',
    'Open network, profile, map, and integration diagnostics',
  );
  side.append(
    ...(profileBanner === null ? [] : [profileBanner]),
    facts,
    arenaHead,
    legend,
    combatPanel,
    metricsPanel,
  );
  appendScopeNotice(side, mapProfile);
  const technicalError = element('pre', 'online-session__technical-error');
  technicalError.dataset.testid = 'online-technical-error';
  technicalError.setAttribute('aria-label', 'Technical error details');
  diagnostics.append(diagnosticsSummary, side, technicalError);
  grid.append(arenaPanel);

  const error = element('section', 'online-session__error');
  error.setAttribute('role', 'alert');
  error.dataset.testid = 'online-error';
  error.hidden = true;
  const errorMessage = element('p', 'online-session__error-message');
  const errorActions = element('div', 'online-session__error-actions');
  const retryRoomButton = element('button', 'online-preview__primary', 'Start fresh room');
  retryRoomButton.type = 'button';
  retryRoomButton.addEventListener('click', () => {
    window.location.assign(onlineCreatePath(mapProfile ?? defaultOnlineProfile()));
  });
  const returnToLobbyButton = element('button', 'online-preview__secondary', 'Return to online');
  returnToLobbyButton.type = 'button';
  returnToLobbyButton.addEventListener('click', () => window.location.assign(ONLINE_AUTHORITY_PATH));
  errorActions.append(retryRoomButton, returnToLobbyButton);
  error.append(errorMessage, errorActions);
  const resultDialog = element('section', 'online-session__result hidden');
  resultDialog.dataset.testid = 'online-match-result';
  resultDialog.setAttribute('role', 'dialog');
  resultDialog.setAttribute('aria-modal', 'true');
  resultDialog.setAttribute('aria-labelledby', 'online-match-result-title');
  resultDialog.inert = true;
  const resultPanel = element('div', 'online-session__result-panel');
  const resultEyebrow = element('p', 'online-preview__eyebrow', 'Online TDM complete');
  const resultTitle = element('h2', '', 'Match complete');
  resultTitle.id = 'online-match-result-title';
  const resultSummary = element('p', 'online-session__result-summary', 'Final authority result');
  const resultStats = element('dl', 'online-session__result-stats');
  const playAgainButton = element('button', 'online-preview__primary', 'Play again');
  playAgainButton.type = 'button';
  playAgainButton.dataset.testid = 'online-play-again';
  const resultOnlineButton = element('button', 'online-preview__secondary', 'Return to online');
  resultOnlineButton.type = 'button';
  resultOnlineButton.dataset.testid = 'online-result-return';
  const resultActions = element('div', 'online-session__result-actions');
  resultActions.append(playAgainButton, resultOnlineButton);
  resultPanel.append(
    resultEyebrow,
    resultTitle,
    resultSummary,
    resultStats,
    resultActions,
  );
  resultDialog.append(resultPanel);
  const showPlayerError = (
    message: string,
    canRetry: boolean,
    detail = '',
    state: 'quiet' | 'connecting' | 'reconnecting' | 'fatal' = 'fatal',
  ): void => {
    errorMessage.textContent = message;
    retryRoomButton.hidden = !canRetry;
    errorActions.hidden = !canRetry;
    error.hidden = message.length === 0;
    error.dataset.state = state;
    technicalError.textContent = detail;
  };
  content.replaceChildren(
    head,
    grid,
    sessionDrawer,
    diagnostics,
    error,
    resultDialog,
  );

  const settings = GameSettings.snapshot();
  const portalAudio = threeDimensionalMap ? new AudioManager() : null;
  const portalCaptionCues = threeDimensionalMap
    ? new CaptionCueOverlay({
        document,
        captionRegion,
        audioCueRegion,
      })
    : null;
  if (portalAudio !== null && portalCaptionCues !== null) {
    portalAudio.setVolume(settings.volume);
    portalCaptionCues.setPreferences(settings);
  }

  let renderRequested = true;
  const client = new AuthorityEvidenceClient({
    config,
    roomCode,
    expectedIdentity: identity,
    profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
    queries: world,
    transport: createBrowserAuthorityEvidenceTransport(),
    scheduler,
    createRequestId: () => `online.${crypto.randomUUID()}`,
    initialResumeCredential: initialResumeCredential ?? undefined,
    enableCombatInput: true,
    onSessionCredential: (credential) => {
      persistOnlineAuthorityResumeCredential(
        window.sessionStorage,
        resumeBinding,
        credential,
      );
    },
    onResumeRejected: () => {
      clearOnlineAuthorityResumeCredential(window.sessionStorage, resumeBinding);
    },
    onChange: () => {
      renderRequested = true;
    },
  });
  // Establish or resume authority before loading large presentation assets so
  // a normal page reload stays inside the server's short reconnect window.
  client.start();

  let threeRuntime: OnlineAuthorityThreeRuntime | null = null;
  if (threeDimensionalMap && mapProof !== null) {
    body.dataset.online3dStatus = 'loading';
    try {
      threeRuntime = await createOnlineAuthorityThreeRuntime(canvas, {
        reducedEffects: settings.reducedEffects,
        mapBinding: mapProof.mapBinding,
        ...(relayRuntime || originalArenaRuntime
          ? {
              presentationFixture: world.fixture,
              presentationIdentity: {
                mapReference: mapProof.mapBinding.mapReference,
                presentationReference: 'presentationReference' in mapProof.mapBinding
                  ? mapProof.mapBinding.presentationReference
                  : mapProof.mapBinding.mapReference,
                fixtureHash: mapProof.mapBinding.fixtureHash,
                colliderCardinality: mapProof.mapBinding.colliderCardinality,
                spawnCount: mapProof.mapBinding.spawns.length,
                zoneCount: 'zones' in mapProof.mapBinding
                  ? mapProof.mapBinding.zones.length
                  : 0,
                spawnPocketContainmentCount: relayRuntime ? 2 : 0,
                authorityCompatibility: relayRuntime
                  ? 'relay_revision_1_authority_candidate'
                  : `${mapProof.mapBinding.mapId}_revision_1_authority_candidate`,
              },
              ...(relayRuntime
                ? { staticWorldPortalDefinitions: RELAY_PORTAL_PRESENTATION_DEFINITIONS }
                : {}),
            }
          : {}),
        onWorldPortalAudio: ({ local }) => {
          if (!local || portalAudio === null || portalCaptionCues === null) {
            return;
          }
          try {
            portalAudio.resume();
            portalAudio.playTeleportDeparture();
            portalAudio.playTeleportArrival(0.105);
            portalCaptionCues.showAudioCue({
              id: 'world-portal',
              text: 'PORTAL TRANSIT',
              direction: 'none',
              priority: 'status',
              durationMs: 900,
              minIntervalMs: 300,
            });
          } catch {
            // Presentation-only audio/accessibility failure does not affect
            // the server-authoritative traversal or Three renderer.
          }
        },
      });
      const sceneFacts = threeRuntime.diagnostics();
      mapStatus.textContent = 'Arena ready';
      mapStatus.title = `${sceneFacts.mapReference}: ${sceneFacts.renderMeshCount} render meshes · ${sceneFacts.authorityColliderCount} authority colliders`;
      mapStatus.dataset.state = 'ready';
      body.dataset.online3dStatus = 'ready';
      body.dataset.online3dRenderer = sceneFacts.renderer;
      body.dataset.online3dPresentationReference = sceneFacts.presentationReference;
      body.dataset.online3dPresentationMode = sceneFacts.presentationMode;
      body.dataset.online3dDisplayName = sceneFacts.presentationDisplayName;
      window.setTimeout(() => {
        if (mapStatus.dataset.state === 'ready') mapStatus.dataset.state = 'settled';
      }, 2_200);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      const technicalDetail = `ONLINE_REV5_3D_INITIALIZATION_FAILED: ${detail}`;
      mapStatus.textContent = 'Arena unavailable';
      mapStatus.dataset.state = 'failed';
      showPlayerError(
        'The arena presentation could not start. Retry the room or return to the online lobby.',
        true,
        technicalDetail,
      );
      body.dataset.onlinePreviewStatus = 'map-load-failed';
      body.dataset.online3dStatus = 'failed';
      client.dispose();
      for (const button of [
        ...weaponSlotButtons,
        sprintButton,
        jumpButton,
        crouchButton,
        fireButton,
        reloadButton,
        abilityOneButton,
        abilityTwoButton,
        abilityThreeButton,
        teleportButton,
        resumeButton,
      ]) button.disabled = true;
      world.dispose();
      throw new Error(technicalDetail, { cause });
    }
  }

  const pressedKeys = new Set<string>();
  let pointerHeldButtons = 0;
  let heldInputButtons = 0;
  let aimHeld = false;
  let blinkPreviewHeld = false;
  let latestBlinkPreview: OnlineBlinkPreview | null = null;
  let selectedWeaponSlot: number = selectedCombatPreset.authorityPrimaryWeaponSlot;
  let loadoutSubmittedForPlayerId: string | null = null;
  let matchResultShown = false;

  type FeedbackCue = OnlinePreviewSnapshot['presentation']['lastCue'];
  let combatPresentationAdapter: CombatPresentationAdapterV1 | null = null;
  let presentationStatus: OnlinePreviewSnapshot['presentation']['status'] = 'waiting';
  let lastHydratedFullSnapshotCount = 0;
  let presentationHydrationCount = 0;
  let presentationIntentCount = 0;
  let presentationConfirmedIntentCount = 0;
  let presentationRejectedIntentCount = 0;
  let presentationLastCue: FeedbackCue = null;
  let presentationLastAuthorityEventId: string | null = null;
  let presentationAudioCueAttempts = 0;
  const presentationRecentCues: Array<
    OnlinePreviewSnapshot['presentation']['recentCues'][number]
  > = [];
  let presentationFailureDetail: string | null = null;
  let feedbackTimeout = 0;
  let audioContext: AudioContext | null = null;
  let feedbackOutput: GainNode | null = null;
  let feedbackNoise: AudioBuffer | null = null;
  let feedbackVariationState = 0x4b595843;
  let previousMovementGrounded: boolean | null = null;
  let previousMovementVerticalSpeed = 0;
  let lastMovementFootstepAt = 0;
  let movementFoot = 0;
  type FlashEnvelope = Readonly<{
    appliedAtTick: number;
    durationTicks: number;
    intensityPermille: number;
    facingPermille: number;
  }>;
  let flashEnvelopes: readonly FlashEnvelope[] = Object.freeze([]);
  const processedPresentationTransportIds = new Set<string>();
  const processedDamageDirectionIds = new Set<string>();
  let damageDirectionVisibleUntilMilliseconds = -Infinity;

  const feedbackCue = (intent: CombatPresentationIntentV1): FeedbackCue => {
    const marker = intent.markers.hud ?? intent.markers.vfx ?? intent.markers.audio;
    if (marker === null) return null;
    if (marker.includes('.snapshot.sync.')) return 'snapshot';
    if (marker.includes('.hit.head.kill.confirmed.')) return 'head_kill';
    if (marker.includes('.hit.body.confirmed.')) return 'body';
    if (marker.includes('.hit.head.confirmed.')) return 'head';
    if (marker.includes('.hit.shield.confirmed.')) return 'shield';
    if (marker.includes('.hit.kill.confirmed.')) return 'kill';
    if (marker.includes('.grenade.throw.accepted.')) return 'grenade_throw';
    // Launch contact and detonation are an ordered same-tick authority pair.
    // Present only one confirmed terminal pulse: collision and per-target impulse
    // events remain in the authority stream but never stack into fake rebounds.
    if (marker.includes('.grenade.projectile.collision.')) return null;
    if (marker.includes('.grenade.projectile.detonation.')) return 'grenade_detonation';
    if (marker.includes('.grenade.impulse.applied.')) return null;
    if (marker.includes('.teleport.confirmed.')) return 'teleport';
    if (marker.includes('.teleport.rejected.')) return 'teleport_rejected';
    return null;
  };
  const feedbackCopy = (cue: Exclude<FeedbackCue, null>): string => {
    if (cue === 'snapshot') return '';
    if (cue === 'body') return 'Hit';
    if (cue === 'head') return 'Headshot';
    if (cue === 'head_kill') return 'Headshot · Target down';
    if (cue === 'shield') return 'Shield hit';
    if (cue === 'kill') return 'Target down';
    if (cue === 'grenade_throw') return 'Launch thrown';
    if (cue === 'grenade_collision') return 'Grenade contact';
    if (cue === 'grenade_detonation') return 'Launch pulse';
    if (cue === 'grenade_impulse') return 'Target displaced';
    if (cue === 'teleport') return 'Blink complete';
    return 'Blink blocked';
  };
  const feedbackVariation = (amount = 0.03): number => {
    feedbackVariationState = (
      Math.imul(feedbackVariationState, 1_664_525) + 1_013_904_223
    ) >>> 0;
    return 1 + (
      feedbackVariationState / 0xffff_ffff * 2 - 1
    ) * amount;
  };
  const createFeedbackNoise = (context: AudioContext): AudioBuffer => {
    const buffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * 1.2),
      context.sampleRate,
    );
    const channel = buffer.getChannelData(0);
    let state = 0x1f2e3d4c;
    for (let index = 0; index < channel.length; index += 1) {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      channel[index] = state / 0xffff_ffff * 2 - 1;
    }
    return buffer;
  };
  const feedbackBurst = ({
    delay = 0,
    duration = 0.08,
    level = 0.08,
    type = 'bandpass',
    frequency = 1_400,
    endFrequency = 420,
    resonance = 0.8,
  }: Readonly<{
    delay?: number;
    duration?: number;
    level?: number;
    type?: BiquadFilterType;
    frequency?: number;
    endFrequency?: number;
    resonance?: number;
  }> = {}): void => {
    if (
      audioContext === null
      || feedbackOutput === null
      || feedbackNoise === null
    ) return;
    const start = audioContext.currentTime + delay;
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    source.buffer = feedbackNoise;
    source.playbackRate.value = feedbackVariation(0.025);
    filter.type = type;
    filter.Q.value = resonance;
    filter.frequency.setValueAtTime(
      frequency * feedbackVariation(0.02),
      start,
    );
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(30, endFrequency * feedbackVariation(0.02)),
      start + duration,
    );
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(feedbackOutput);
    const maxOffset = Math.max(0, feedbackNoise.duration - duration - 0.02);
    source.start(
      start,
      (feedbackVariationState / 0xffff_ffff) * maxOffset,
      duration,
    );
  };
  const feedbackBody = (
    frequency: number,
    endFrequency: number,
    duration: number,
    level: number,
    delay = 0,
  ): void => {
    if (audioContext === null || feedbackOutput === null) return;
    const start = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(
      frequency * feedbackVariation(0.025),
      start,
    );
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(24, endFrequency),
      start + duration,
    );
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(feedbackOutput);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  };
  const ensureFeedbackAudio = async (): Promise<void> => {
    if (audioContext === null) {
      audioContext = new AudioContext({ latencyHint: 'interactive' });
      feedbackOutput = audioContext.createGain();
      const settingsVolume = Number(GameSettings.get('volume') ?? 0.5);
      feedbackOutput.gain.value = Math.max(0, Math.min(1, settingsVolume)) * 0.38;
      const limiter = audioContext.createDynamicsCompressor();
      limiter.threshold.value = -9;
      limiter.knee.value = 8;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      feedbackOutput.connect(limiter).connect(audioContext.destination);
      feedbackNoise = createFeedbackNoise(audioContext);
    }
    if (audioContext.state === 'suspended') await audioContext.resume();
  };
  const playMovementFootstep = (sprinting: boolean): void => {
    movementFoot ^= 1;
    const side = movementFoot === 0 ? 0.96 : 1.04;
    feedbackBurst({
      duration: sprinting ? 0.085 : 0.06,
      level: sprinting ? 0.095 : 0.06,
      frequency: (sprinting ? 1_250 : 900) * side,
      endFrequency: 280,
      resonance: 0.62,
    });
    feedbackBody(
      (sprinting ? 98 : 80) * side,
      28,
      sprinting ? 0.1 : 0.08,
      sprinting ? 0.075 : 0.045,
    );
  };
  const playMovementJump = (): void => {
    feedbackBurst({
      duration: 0.13,
      level: 0.055,
      frequency: 420,
      endFrequency: 1_550,
      resonance: 0.5,
    });
    feedbackBody(90, 44, 0.1, 0.04);
  };
  const playMovementLand = (hard: boolean): void => {
    feedbackBurst({
      duration: hard ? 0.17 : 0.1,
      level: hard ? 0.17 : 0.1,
      type: 'lowpass',
      frequency: hard ? 1_250 : 850,
      endFrequency: 110,
      resonance: 0.48,
    });
    feedbackBody(
      hard ? 108 : 82,
      24,
      hard ? 0.22 : 0.15,
      hard ? 0.16 : 0.09,
    );
  };
  const playFeedbackTone = (cue: Exclude<FeedbackCue, 'snapshot' | null>): void => {
    presentationAudioCueAttempts += 1;
    void (async () => {
      await ensureFeedbackAudio();
      if (cue === 'body') {
        feedbackBurst({
          duration: 0.075,
          level: 0.13,
          frequency: 1_150,
          endFrequency: 360,
          resonance: 1.1,
        });
        feedbackBody(155, 64, 0.09, 0.065);
      } else if (cue === 'head' || cue === 'head_kill') {
        feedbackBurst({
          duration: 0.045,
          level: cue === 'head_kill' ? 0.24 : 0.19,
          type: 'highpass',
          frequency: 5_800,
          endFrequency: 1_450,
          resonance: 3.4,
        });
        feedbackBurst({
          delay: 0.032,
          duration: cue === 'head_kill' ? 0.11 : 0.065,
          level: cue === 'head_kill' ? 0.15 : 0.09,
          frequency: 2_450,
          endFrequency: 620,
          resonance: 2,
        });
        feedbackBody(
          cue === 'head_kill' ? 132 : 174,
          46,
          cue === 'head_kill' ? 0.19 : 0.1,
          cue === 'head_kill' ? 0.13 : 0.07,
        );
      } else if (cue === 'shield') {
        feedbackBurst({
          duration: 0.12,
          level: 0.16,
          frequency: 3_800,
          endFrequency: 680,
          resonance: 2.6,
        });
        feedbackBurst({
          delay: 0.018,
          duration: 0.055,
          level: 0.055,
          type: 'highpass',
          frequency: 5_200,
          endFrequency: 2_200,
        });
        feedbackBody(360, 115, 0.14, 0.055);
      } else if (cue === 'kill') {
        feedbackBurst({
          duration: 0.06,
          level: 0.2,
          frequency: 2_350,
          endFrequency: 740,
          resonance: 2.3,
        });
        feedbackBurst({
          delay: 0.052,
          duration: 0.075,
          level: 0.12,
          frequency: 1_650,
          endFrequency: 430,
          resonance: 1.6,
        });
        feedbackBody(145, 48, 0.17, 0.12);
      } else if (cue === 'grenade_throw') {
        feedbackBurst({
          duration: 0.17,
          level: 0.12,
          frequency: 390,
          endFrequency: 1_900,
          resonance: 0.55,
        });
        feedbackBurst({
          delay: 0.012,
          duration: 0.028,
          level: 0.08,
          frequency: 2_100,
          endFrequency: 950,
          resonance: 4,
        });
      } else if (cue === 'grenade_collision') {
        feedbackBurst({
          duration: 0.05,
          level: 0.12,
          frequency: 1_850,
          endFrequency: 720,
          resonance: 3.2,
        });
        feedbackBody(225, 78, 0.06, 0.05);
      } else if (cue === 'grenade_detonation') {
        feedbackBurst({
          duration: 0.028,
          level: 0.28,
          type: 'highpass',
          frequency: 3_200,
          endFrequency: 1_050,
          resonance: 0.65,
        });
        feedbackBurst({
          duration: 0.34,
          level: 0.25,
          type: 'lowpass',
          frequency: 680,
          endFrequency: 72,
          resonance: 0.5,
        });
        feedbackBody(98, 31, 0.3, 0.19);
      } else if (cue === 'grenade_impulse') {
        feedbackBurst({
          duration: 0.22,
          level: 0.16,
          frequency: 440,
          endFrequency: 2_200,
          resonance: 0.5,
        });
        feedbackBody(118, 38, 0.19, 0.1);
      } else if (cue === 'teleport') {
        feedbackBurst({
          duration: 0.14,
          level: 0.17,
          frequency: 520,
          endFrequency: 4_100,
          resonance: 0.7,
        });
        feedbackBurst({
          delay: 0.105,
          duration: 0.24,
          level: 0.2,
          frequency: 4_000,
          endFrequency: 300,
          resonance: 0.65,
        });
        feedbackBody(145, 38, 0.21, 0.13, 0.11);
      } else {
        feedbackBurst({
          duration: 0.1,
          level: 0.1,
          frequency: 640,
          endFrequency: 170,
          resonance: 0.9,
        });
        feedbackBody(105, 42, 0.12, 0.07);
      }
      feedbackHud.dataset.audio = 'played';
    })().catch(() => {
      feedbackHud.dataset.audio = 'caption_only';
    });
  };
  const consumePresentationIntents = (
    intents: readonly CombatPresentationIntentV1[],
  ): void => {
    for (const intent of intents) {
      presentationIntentCount += 1;
      if (intent.source === 'confirmed') presentationConfirmedIntentCount += 1;
      if (intent.source === 'rejected') presentationRejectedIntentCount += 1;
      const cue = feedbackCue(intent);
      if (cue === null) continue;
      presentationLastCue = cue;
      presentationLastAuthorityEventId = intent.authorityEventId;
      presentationRecentCues.push(Object.freeze({
        cue,
        source: intent.source,
        authorityEventId: intent.authorityEventId,
        authorityTick: intent.authorityTick,
        hudMarker: intent.markers.hud,
        vfxMarker: intent.markers.vfx,
        audioMarker: intent.markers.audio,
        renderedHud: true as const,
        renderedVfx: cue !== 'snapshot',
        audioAttempted: cue !== 'snapshot',
      }));
      if (presentationRecentCues.length > 32) presentationRecentCues.shift();
      feedbackHud.textContent = feedbackCopy(cue);
      feedbackHud.dataset.cue = cue;
      feedbackHud.dataset.authorityEventId = intent.authorityEventId ?? '';
      feedbackHud.dataset.active = String(cue !== 'snapshot');
      if (cue === 'snapshot') {
        feedbackHud.dataset.audio = 'not_played';
        feedbackGlyph.dataset.cue = 'snapshot';
        feedbackGlyph.dataset.authorityEventId = '';
        feedbackGlyph.dataset.active = 'false';
      } else {
        feedbackHud.dataset.audio = 'pending';
        feedbackGlyph.dataset.cue = cue;
        feedbackGlyph.dataset.authorityEventId = intent.authorityEventId ?? '';
        feedbackGlyph.dataset.reducedMotion = String(
          window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        );
        feedbackGlyph.dataset.active = 'false';
        requestAnimationFrame(() => {
          feedbackGlyph.dataset.active = 'true';
        });
        const abilityAudioEvent: OnlineAbilityPresentationAudioEvent =
          cue === 'grenade_detonation'
            ? 'launch_detonation'
            : cue === 'grenade_impulse'
              ? 'launch_impulse'
              : 'route_feedback';
        const audioOwner = selectOnlineAbilityPresentationAudioOwner(
          abilityAudioEvent,
          {
            threeRuntimeActive: threeRuntime !== null,
            threeDimensionalMap,
          },
        );
        if (audioOwner === 'route') playFeedbackTone(cue);
        else feedbackHud.dataset.audio = audioOwner === 'three_runtime'
          ? 'delegated_three_runtime'
          : 'suppressed_duplicate';
      }
      window.clearTimeout(feedbackTimeout);
      feedbackTimeout = window.setTimeout(() => {
        feedbackHud.dataset.active = 'false';
        feedbackGlyph.dataset.active = 'false';
      }, cue === 'kill' || cue === 'grenade_detonation' || cue === 'teleport' ? 900 : 620);
    }
    const metrics = combatPresentationAdapter?.metrics;
    feedbackProofValue.textContent = presentationStatus === 'failed'
      ? 'FAILED CLOSED'
      : `READY · ${presentationConfirmedIntentCount} CONFIRMED · ${
          presentationLastCue?.toUpperCase() ?? 'SYNC'
        }`;
    feedbackProofValue.dataset.lastCue = presentationLastCue ?? 'none';
    feedbackProofValue.dataset.confirmedIntents = String(presentationConfirmedIntentCount);
    feedbackProofValue.dataset.duplicateEvents = String(metrics?.duplicateAuthorityEvents ?? 0);
  };
  type ThrowableAbilityPresentation = Extract<
    NonNullable<ReliableEvent['presentation']>,
    { readonly kind: 'throwable_ability_event' }
  >;
  const playThrowableAbilityCue = (
    presentation: ThrowableAbilityPresentation,
  ): void => {
    presentationAudioCueAttempts += 1;
    const smokeDetonation = presentation.phase === 'detonated'
      && presentation.abilityId === ABILITY_ID.smoke;
    const flashCue = presentation.phase === 'flash_applied'
      || (
        presentation.phase === 'detonated'
        && presentation.abilityId === ABILITY_ID.flash
      );
    const launchCue = presentation.abilityId === ABILITY_ID.launch;
    const adhered = presentation.phase === 'collision' && presentation.reason === 'attached';
    const cue = presentation.phase === 'activated'
      ? { durationSeconds: 0.1, filterType: 'bandpass' as const, startFrequencyHz: 1_250, endFrequencyHz: 420, peakGain: 0.045 }
      : adhered
        ? { durationSeconds: 0.09, filterType: 'lowpass' as const, startFrequencyHz: 620, endFrequencyHz: 115, peakGain: 0.052 }
        : presentation.phase === 'collision'
          ? { durationSeconds: 0.075, filterType: 'lowpass' as const, startFrequencyHz: 520, endFrequencyHz: 140, peakGain: 0.048 }
          : smokeDetonation
            ? { durationSeconds: 0.42, filterType: 'bandpass' as const, startFrequencyHz: 1_100, endFrequencyHz: 360, peakGain: 0.045 }
            : flashCue
              ? { durationSeconds: 0.19, filterType: 'highpass' as const, startFrequencyHz: 2_700, endFrequencyHz: 6_200, peakGain: 0.055 }
              : presentation.phase === 'detonated'
                ? {
                    durationSeconds: launchCue ? 0.3 : 0.24,
                    filterType: 'lowpass' as const,
                    startFrequencyHz: launchCue ? 460 : 380,
                    endFrequencyHz: 65,
                    peakGain: launchCue ? 0.085 : 0.072,
                  }
                : { durationSeconds: 0.07, filterType: 'bandpass' as const, startFrequencyHz: 260, endFrequencyHz: 120, peakGain: 0.025 };
    void ensureFeedbackAudio().then(() => {
      feedbackBurst({
        duration: cue.durationSeconds,
        level: Math.min(0.24, cue.peakGain * 2.2),
        type: cue.filterType,
        frequency: cue.startFrequencyHz,
        endFrequency: cue.endFrequencyHz,
        resonance: adhered ? 2.8 : flashCue ? 1.8 : 0.8,
      });
      if (presentation.phase === 'detonated' && !smokeDetonation && !flashCue) {
        feedbackBody(
          launchCue ? 112 : 84,
          24,
          launchCue ? 0.34 : 0.25,
          launchCue ? 0.14 : 0.1,
        );
      }
      feedbackHud.dataset.audio = 'played_non_tonal';
    }).catch(() => {
      feedbackHud.dataset.audio = 'caption_only';
    });
  };
  const consumeThrowableAbilityEvent = (
    event: ReliableEvent & {
      readonly presentation: ThrowableAbilityPresentation;
    },
  ): void => {
    if (
      event.presentation.phase === 'flash_applied'
      && event.presentation.targetPlayerId !== client.diagnostics().authority.playerId
    ) return;
    if (event.presentation.phase === 'flash_applied') {
      const incomingEnvelope: FlashEnvelope = Object.freeze({
        appliedAtTick: event.presentation.authorityTick,
        durationTicks: event.presentation.flashDurationTicks ?? 45,
        intensityPermille: event.presentation.flashIntensityPermille ?? 1_000,
        facingPermille: event.presentation.flashFacingPermille ?? 1_000,
      });
      flashEnvelopes = Object.freeze([
        ...flashEnvelopes.filter((envelope) => (
          envelope.appliedAtTick + envelope.durationTicks
          > event.presentation.authorityTick
        )),
        incomingEnvelope,
      ].slice(-8));
    }
    const ability = ABILITY_PRESENTATION[event.presentation.abilityId];
    const phaseCopy = event.presentation.phase === 'activated'
      ? 'deployed'
      : event.presentation.phase === 'rejected'
        ? 'not ready'
        : event.presentation.phase === 'collision'
          ? event.presentation.reason === 'attached' ? 'stuck' : 'contact'
          : event.presentation.phase === 'detonated'
            ? 'detonated'
            : 'flashed';
    feedbackHud.textContent = `${ability.shortName} ${phaseCopy}`;
    feedbackHud.dataset.cue = `ability_${event.presentation.phase}`;
    feedbackHud.dataset.authorityEventId = event.presentation.eventId;
    feedbackHud.dataset.active = 'true';
    feedbackGlyph.dataset.cue = `ability_${event.presentation.phase}`;
    feedbackGlyph.dataset.authorityEventId = event.presentation.eventId;
    feedbackGlyph.dataset.reducedMotion = String(
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    feedbackGlyph.dataset.active = event.presentation.phase === 'rejected'
      ? 'false'
      : 'true';
    const audioOwner = selectOnlineAbilityPresentationAudioOwner('throwable', {
      threeRuntimeActive: threeRuntime !== null,
      threeDimensionalMap,
    });
    if (audioOwner === 'route') playThrowableAbilityCue(event.presentation);
    else feedbackHud.dataset.audio = audioOwner === 'three_runtime'
      ? 'delegated_three_runtime'
      : 'caption_only';
    window.clearTimeout(feedbackTimeout);
    feedbackTimeout = window.setTimeout(() => {
      feedbackHud.dataset.active = 'false';
      feedbackGlyph.dataset.active = 'false';
    }, event.presentation.phase === 'detonated' ? 900 : 620);
  };

  const onlineSnapshot = (): OnlinePreviewSnapshot => {
    const diagnostics = client.diagnostics();
    const presentation = client.samplePresentation();
    const remoteEntities = Object.freeze(presentation.remotes.map((remote) => Object.freeze({
      entityId: remote.entityId,
      interpolationMode: remote.mode,
      position: Object.freeze({
        x: remote.state.feetPosition.x,
        y: remote.state.feetPosition.y,
        z: remote.state.feetPosition.z,
      }),
      grounded: remote.state.grounded,
      stance: remote.state.stance,
      locomotion: remote.state.locomotion,
      travelSector: remote.state.locomotionSignal.sector,
      forwardSpeedMillimetersPerSecond:
        remote.state.locomotionSignal.forwardSpeedMillimetersPerSecond,
      rightSpeedMillimetersPerSecond:
        remote.state.locomotionSignal.rightSpeedMillimetersPerSecond,
    })));
    return Object.freeze({
      schemaVersion: 1,
      productStatus: 'PRE_RELEASE_COMBAT_PREVIEW',
      roomCode,
      connection: diagnostics.connection.phase,
      matchId: diagnostics.authority.matchId,
      playerId: diagnostics.authority.playerId,
      remotePlayers: diagnostics.remote.playerCount,
      fullSnapshots: diagnostics.counters.fullSnapshots,
      deltaSnapshots: diagnostics.counters.deltaSnapshots,
      commandsGenerated: diagnostics.counters.commandsGenerated,
      inputAcks: diagnostics.counters.inputAcks,
      reconciliations: diagnostics.counters.reconciliations,
      resumeSuccesses: diagnostics.counters.resumeSuccesses,
      combat: diagnostics.combat,
      inputBridge: Object.freeze({
        pressedKeys: Object.freeze([...pressedKeys].sort()),
        axes: Object.freeze(axesFromPressedKeys(pressedKeys)),
        heldButtons: heldInputButtons,
        jump: (heldInputButtons & INTENT_BUTTON.jump) !== 0,
        sprint: (heldInputButtons & INTENT_BUTTON.sprint) !== 0,
        crouch: (heldInputButtons & INTENT_BUTTON.crouch) !== 0,
        primaryFire: (heldInputButtons & INTENT_BUTTON.primaryFire) !== 0,
        aimHeld,
        blinkPreviewHeld,
        selectedWeaponSlot,
      }),
      blinkPreview: latestBlinkPreview,
      localAuthoritativePlayerId: diagnostics.local.authoritativePlayerId,
      localPredictedPosition: diagnostics.local.predictedPosition,
      localAuthoritativePosition: diagnostics.local.authoritativePosition,
      localPredictedVelocity: diagnostics.local.predictedVelocity,
      localAuthoritativeVelocity: diagnostics.local.authoritativeVelocity,
      localPredictedGrounded: diagnostics.local.predictedGrounded,
      localAuthoritativeGrounded: diagnostics.local.authoritativeGrounded,
      localPredictedLocomotion: diagnostics.local.predictedLocomotion,
      localAuthoritativeLocomotion: diagnostics.local.authoritativeLocomotion,
      localAuthoritativeYawMilliDegrees: diagnostics.local.authoritativeYawMilliDegrees,
      localPredictedYawMilliDegrees: diagnostics.local.predictedYawMilliDegrees,
      localPredictedPitchMilliDegrees: diagnostics.local.predictedPitchMilliDegrees,
      localPredictionErrorMillimeters: diagnostics.local.lastPositionErrorMillimeters,
      localPredictionHistoryCommands: diagnostics.local.predictionHistoryCommands,
      remoteEntities,
      remotePositions: Object.freeze(remoteEntities.map(({ position }) => position)),
      lastError: diagnostics.lastError,
      render3d: threeRuntime?.diagnostics() ?? null,
      presentation: Object.freeze({
        status: presentationStatus,
        hydrationCount: presentationHydrationCount,
        intentCount: presentationIntentCount,
        confirmedIntentCount: presentationConfirmedIntentCount,
        rejectedIntentCount: presentationRejectedIntentCount,
        duplicateAuthorityEvents:
          combatPresentationAdapter?.metrics.duplicateAuthorityEvents ?? 0,
        staleAuthorityEvents: combatPresentationAdapter?.metrics.staleAuthorityEvents ?? 0,
        lastCue: presentationLastCue,
        lastAuthorityEventId: presentationLastAuthorityEventId,
        audioCueAttempts: presentationAudioCueAttempts,
        recentCues: Object.freeze(presentationRecentCues.map((cue) => Object.freeze({ ...cue }))),
      }),
      ...(mapProof === null
        ? {}
        : {
            roomVerification: Object.freeze({
              roomProfile: mapProof.roomProfile,
              mapBinding: mapProof.mapBinding,
              simulationIdentity: diagnostics.authority.simulationIdentity,
              identityChecks: diagnostics.counters.identityChecks,
            }),
          }),
    });
  };
  Object.defineProperty(window, '__KYX_ONLINE_PREVIEW__', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: Object.freeze({ schemaVersion: 1, getSnapshot: onlineSnapshot }),
  });

  const updateInput = (): void => {
    const axes = matchResultShown
      ? Object.freeze({ moveX: 0, moveY: 0 })
      : axesFromPressedKeys(pressedKeys);
    heldInputButtons = matchResultShown ? 0 : (
      (
        onlineAuthorityInputButtonsFromPressedKeys(pressedKeys)
        & ~INTENT_BUTTON.utility
      )
      | pointerHeldButtons
    ) >>> 0;
    client.setAxes(axes);
    client.setInputButtons(heldInputButtons);
    const lookYawDirection = Number(pressedKeys.has('ArrowRight'))
      - Number(pressedKeys.has('ArrowLeft'));
    const lookPitchDirection = Number(pressedKeys.has('ArrowUp'))
      - Number(pressedKeys.has('ArrowDown'));
    client.setLookDeltas(lookYawDirection * 1_500, lookPitchDirection * 1_500);
    for (const [button, mask] of [
      [sprintButton, INTENT_BUTTON.sprint],
      [jumpButton, INTENT_BUTTON.jump],
      [crouchButton, INTENT_BUTTON.crouch],
      [fireButton, INTENT_BUTTON.primaryFire],
      [reloadButton, INTENT_BUTTON.reload],
      [abilityOneButton, INTENT_BUTTON.abilityOne],
      [abilityTwoButton, INTENT_BUTTON.abilityTwo],
      [abilityThreeButton, INTENT_BUTTON.abilityThree],
      [teleportButton, INTENT_BUTTON.utility],
    ] as const) {
      const active = mask === INTENT_BUTTON.utility
        ? blinkPreviewHeld || (heldInputButtons & mask) !== 0
        : (heldInputButtons & mask) !== 0;
      button.dataset.active = String(active);
      button.setAttribute('aria-pressed', String(active));
    }
  };
  const blinkCommitEligible = (): boolean => {
    const local = client.diagnostics().local;
    if (
      local.predictedPosition === null
      || local.predictedYawMilliDegrees === null
      || local.predictedPitchMilliDegrees === null
    ) return false;
    const look = {
      yawMilliDegrees: local.predictedYawMilliDegrees,
      pitchMilliDegrees: local.predictedPitchMilliDegrees,
    };
    return isOnlineBlinkPreviewCommitEligible(resolveOnlineBlinkPreview({
      active: true,
      feetPosition: local.predictedPosition,
      yawMilliDegrees: look.yawMilliDegrees,
      pitchMilliDegrees: look.pitchMilliDegrees,
      stance: local.predictedStance ?? 'standing',
      cooldownTicksRemaining: local.teleportCooldownTicksRemaining,
    }, PHASE3_HYPOTHESIS_MOVEMENT_PROFILE, world), look);
  };
  const selectWeaponSlot = (slot: number): void => {
    if (matchResultShown) return;
    if (!allowedAuthorityWeaponSlots.has(slot)) return;
    selectedWeaponSlot = slot;
    client.setSelectedWeaponSlot(slot);
    for (const [index, button] of weaponSlotButtons.entries()) {
      const active = index === slot;
      button.dataset.active = String(active);
      button.setAttribute('aria-pressed', String(active));
    }
    renderRequested = true;
  };
  const setScoreboardOpen = (open: boolean): void => {
    scoreboard.dataset.open = String(open);
    scoreboard.setAttribute('aria-hidden', String(!open));
  };
  const scoreboardKeyboardHandler = (event: KeyboardEvent): void => {
    if (event.code !== 'Tab') return;
    if (matchResultShown) {
      setScoreboardOpen(false);
      return;
    }
    if (
      document.pointerLockElement !== canvas
      && document.activeElement !== canvas
    ) return;
    event.preventDefault();
    setScoreboardOpen(event.type === 'keydown');
  };
  const keyboardHandler = (event: KeyboardEvent): void => {
    if (matchResultShown) return;
    if (!isOnlineAuthorityInputCode(event.code)) return;
    event.preventDefault();
    if (event.type === 'keydown') {
      void ensureFeedbackAudio().catch(() => {
        feedbackHud.dataset.audio = 'caption_only';
      });
    }
    const weaponSlot = onlineAuthorityWeaponSlotFromCode(event.code);
    if (
      event.type === 'keydown'
      && !event.repeat
      && weaponSlot !== null
    ) selectWeaponSlot(weaponSlot);
    if (event.type === 'keydown') {
      pressedKeys.add(event.code);
      if (event.code === 'KeyQ') blinkPreviewHeld = true;
    } else {
      const commitBlink = event.code === 'KeyQ'
        && blinkPreviewHeld
        && blinkCommitEligible();
      pressedKeys.delete(event.code);
      if (event.code === 'KeyQ') blinkPreviewHeld = false;
      if (commitBlink) pulseButton(INTENT_BUTTON.utility);
    }
    updateInput();
    renderRequested = true;
  };
  const neutralizeRouteInput = (): void => {
    pressedKeys.clear();
    pointerHeldButtons = 0;
    aimHeld = false;
    blinkPreviewHeld = false;
    latestBlinkPreview = null;
    client.neutralizeInput();
    updateInput();
    renderRequested = true;
  };
  const blurHandler = (): void => {
    setScoreboardOpen(false);
    neutralizeRouteInput();
  };
  const visibilityHandler = (): void => {
    if (document.visibilityState === 'hidden') neutralizeRouteInput();
  };
  const holdPointerButton = (button: number): void => {
    if (matchResultShown) return;
    if (audioContext === null) {
      void ensureFeedbackAudio().catch(() => {
        feedbackHud.dataset.audio = 'caption_only';
      });
    }
    pointerHeldButtons = (pointerHeldButtons | button) >>> 0;
    updateInput();
  };
  const releasePointerButton = (button: number): void => {
    pointerHeldButtons = (pointerHeldButtons & ~button) >>> 0;
    updateInput();
  };
  const pulseButton = (button: number): void => {
    if (matchResultShown) return;
    holdPointerButton(button);
    window.setTimeout(() => {
      releasePointerButton(button);
    }, 90);
  };
  const holdSprint = (): void => holdPointerButton(INTENT_BUTTON.sprint);
  const releaseSprint = (): void => releasePointerButton(INTENT_BUTTON.sprint);
  const holdCrouch = (): void => holdPointerButton(INTENT_BUTTON.crouch);
  const releaseCrouch = (): void => releasePointerButton(INTENT_BUTTON.crouch);
  const holdFire = (): void => holdPointerButton(INTENT_BUTTON.primaryFire);
  const releaseFire = (): void => releasePointerButton(INTENT_BUTTON.primaryFire);
  const releaseAim = (event: PointerEvent): void => {
    if (event.type === 'pointerup' && event.button !== 2) return;
    aimHeld = false;
    renderRequested = true;
  };
  const startBlinkPreview = (): void => {
    if (matchResultShown) return;
    blinkPreviewHeld = true;
    updateInput();
    renderRequested = true;
  };
  const cancelBlinkPreview = (): void => {
    blinkPreviewHeld = false;
    latestBlinkPreview = null;
    updateInput();
    renderRequested = true;
  };
  const commitBlinkPreview = (): void => {
    const shouldCommit = blinkPreviewHeld
      && blinkCommitEligible();
    cancelBlinkPreview();
    if (shouldCommit) pulseButton(INTENT_BUTTON.utility);
  };
  const canvasPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    if (matchResultShown) return;
    void ensureFeedbackAudio().catch(() => {
      feedbackHud.dataset.audio = 'caption_only';
    });
    canvas.focus();
    if (threeDimensionalMap && document.pointerLockElement !== canvas) {
      const pointerLockRequest = canvas.requestPointerLock();
      if (pointerLockRequest !== undefined) {
        void pointerLockRequest.catch(() => {
          canvas.dataset.pointerLock = 'unavailable';
        });
      }
    }
    if (event.button === 0) {
      holdFire();
    } else {
      aimHeld = true;
      renderRequested = true;
    }
  };
  const preventCanvasContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };
  const pointerLook = (event: MouseEvent): void => {
    if (
      matchResultShown
      || !threeDimensionalMap
      || document.pointerLockElement !== canvas
    ) return;
    const yaw = Math.max(-12_000, Math.min(12_000, Math.round(event.movementX * 110)));
    const pitch = Math.max(-12_000, Math.min(12_000, Math.round(-event.movementY * 110)));
    client.addLookDeltas(yaw, pitch);
    canvas.dataset.pointerLock = 'active';
    renderRequested = true;
  };
  const pointerLockChange = (): void => {
    const active = document.pointerLockElement === canvas;
    canvas.dataset.pointerLock = active ? 'active' : 'inactive';
    if (matchResultShown) {
      neutralizeRouteInput();
      setScoreboardOpen(false);
      if (active) void document.exitPointerLock();
      queueMicrotask(() => playAgainButton.focus());
      return;
    }
    if (!active) {
      pointerHeldButtons = 0;
      aimHeld = false;
      updateInput();
    }
  };
  sprintButton.addEventListener('pointerdown', holdSprint);
  sprintButton.addEventListener('pointerup', releaseSprint);
  sprintButton.addEventListener('pointercancel', releaseSprint);
  sprintButton.addEventListener('pointerleave', releaseSprint);
  jumpButton.addEventListener('click', () => pulseButton(INTENT_BUTTON.jump));
  crouchButton.addEventListener('pointerdown', holdCrouch);
  crouchButton.addEventListener('pointerup', releaseCrouch);
  crouchButton.addEventListener('pointercancel', releaseCrouch);
  crouchButton.addEventListener('pointerleave', releaseCrouch);
  fireButton.addEventListener('pointerdown', holdFire);
  fireButton.addEventListener('pointerup', releaseFire);
  fireButton.addEventListener('pointercancel', releaseFire);
  fireButton.addEventListener('pointerleave', releaseFire);
  canvas.addEventListener('pointerdown', canvasPointerDown);
  canvas.addEventListener('contextmenu', preventCanvasContextMenu);
  document.addEventListener('mousemove', pointerLook);
  document.addEventListener('pointerlockchange', pointerLockChange);
  reloadButton.addEventListener('click', () => pulseButton(INTENT_BUTTON.reload));
  abilityOneButton.addEventListener('click', () => pulseButton(INTENT_BUTTON.abilityOne));
  abilityTwoButton.addEventListener('click', () => pulseButton(INTENT_BUTTON.abilityTwo));
  abilityThreeButton.addEventListener('click', () => pulseButton(INTENT_BUTTON.abilityThree));
  teleportButton.addEventListener('pointerdown', startBlinkPreview);
  teleportButton.addEventListener('pointerup', commitBlinkPreview);
  teleportButton.addEventListener('pointercancel', cancelBlinkPreview);
  teleportButton.addEventListener('pointerleave', cancelBlinkPreview);
  for (const [slot, button] of weaponSlotButtons.entries()) {
    button.addEventListener('click', () => selectWeaponSlot(slot));
  }
  selectWeaponSlot(selectedCombatPreset.authorityPrimaryWeaponSlot);
  window.addEventListener('keydown', keyboardHandler);
  window.addEventListener('keyup', keyboardHandler);
  window.addEventListener('keydown', scoreboardKeyboardHandler);
  window.addEventListener('keyup', scoreboardKeyboardHandler);
  window.addEventListener('blur', blurHandler);
  window.addEventListener('pointerup', releaseFire);
  window.addEventListener('pointerup', releaseAim);
  window.addEventListener('pointercancel', releaseFire);
  window.addEventListener('pointercancel', releaseAim);
  document.addEventListener('visibilitychange', visibilityHandler);
  resumeButton.addEventListener('click', () => {
    if (matchResultShown) return;
    neutralizeRouteInput();
    client.requestResume();
    renderRequested = true;
  });

  const addResultStat = (label: string, value: string | number): void => {
    const row = element('div', 'online-session__result-stat');
    row.append(element('dt', '', label), element('dd', '', String(value)));
    resultStats.append(row);
  };
  const presentOnlineMatchResult = (
    combat: CombatSnapshotV1,
    localPlayerId: string,
  ): boolean => {
    if (matchResultShown || combat.match.result === null) return false;
    const localPlayer = combat.players.find(({ playerId }) => playerId === localPlayerId);
    if (localPlayer === undefined || localPlayer.teamId === null) return false;

    matchResultShown = true;
    pressedKeys.clear();
    pointerHeldButtons = 0;
    aimHeld = false;
    blinkPreviewHeld = false;
    latestBlinkPreview = null;
    setScoreboardOpen(false);
    neutralizeRouteInput();
    for (const button of [
      ...weaponSlotButtons,
      sprintButton,
      jumpButton,
      crouchButton,
      fireButton,
      reloadButton,
      abilityOneButton,
      abilityTwoButton,
      abilityThreeButton,
      teleportButton,
      resumeButton,
    ]) button.disabled = true;

    const playerScores = combat.match.scoreboard?.playerScores;
    resultStats.replaceChildren();
    if (playerScores !== undefined) {
      try {
        const result = createAuthorityMatchResultViewModel({
          result: combat.match.result,
          teamScores: combat.match.teamScores,
          playerScores,
          localPlayerId,
        });
        resultTitle.textContent = result.title;
        resultSummary.textContent = result.reasonLabel;
        addResultStat('Final score', `${result.localTeamScore}-${result.opposingTeamScore}`);
        addResultStat('Eliminations', result.kills);
        addResultStat('Deaths', result.deaths);
        addResultStat('Assists', result.assists);
        addResultStat('K/D', result.kd);
        body.dataset.onlineMatchResult = result.outcome;
        body.dataset.onlineScoreboardAuthority = 'available';
      } catch {
        body.dataset.onlineScoreboardAuthority = 'invalid';
      }
    }
    if (resultStats.childElementCount === 0) {
      const localTeamScore = combat.match.teamScores.find(
        ({ teamId }) => teamId === localPlayer.teamId,
      )?.score;
      const opposingTeamScore = combat.match.teamScores
        .filter(({ teamId }) => teamId !== localPlayer.teamId)
        .reduce<number | undefined>((highest, score) => (
          highest === undefined ? score.score : Math.max(highest, score.score)
        ), undefined);
      const outcome = combat.match.result.draw
        ? 'draw'
        : combat.match.result.winningTeamId === localPlayer.teamId
          ? 'victory'
          : 'defeat';
      resultTitle.textContent = outcome === 'victory'
        ? 'Victory'
        : outcome === 'defeat' ? 'Defeat' : 'Draw';
      resultSummary.textContent = combat.match.result.reason === 'score_limit'
        ? 'Score limit reached'
        : 'Time expired';
      addResultStat(
        'Final score',
        localTeamScore === undefined || opposingTeamScore === undefined
          ? 'Unavailable'
          : `${localTeamScore}-${opposingTeamScore}`,
      );
      addResultStat('K/D/A', 'Unavailable — server upgrading');
      body.dataset.onlineMatchResult = outcome;
      body.dataset.onlineScoreboardAuthority = playerScores === undefined
        ? 'legacy_unavailable'
        : 'invalid';
    }

    resultDialog.inert = false;
    resultDialog.classList.remove('hidden');
    // The completed authority result owns the terminal surface. A socket can
    // close normally while the expired room is being retired; surfacing that
    // transport state behind the result reads as a second, contradictory
    // outcome and competes with the next-match recovery controls.
    showPlayerError('', false, '', 'quiet');
    body.dataset.onlinePreviewStatus = 'result';
    if (document.pointerLockElement === canvas) void document.exitPointerLock();
    queueMicrotask(() => playAgainButton.focus());
    return true;
  };
  const requestNextMatch = async (): Promise<void> => {
    if (disposed || playAgainButton.disabled) return;
    playAgainButton.disabled = true;
    resultOnlineButton.disabled = true;
    const originalLabel = playAgainButton.textContent;
    playAgainButton.textContent = 'Preparing next match…';
    resultSummary.textContent = 'Allocating a fresh authority room.';
    try {
      await continueToNextMatch(mapProfile ?? defaultOnlineProfile());
    } catch (cause) {
      if (disposed) return;
      resultSummary.textContent = cause instanceof Error
        ? `Next match could not start: ${cause.message}`
        : 'Next match could not start.';
      body.dataset.onlinePreviewStatus = 'next-match-failed';
    } finally {
      if (!disposed) {
        playAgainButton.disabled = false;
        resultOnlineButton.disabled = false;
        playAgainButton.textContent = originalLabel;
      }
    }
  };
  playAgainButton.addEventListener('click', requestNextMatch);
  resultOnlineButton.addEventListener('click', () => {
    window.location.assign(ONLINE_AUTHORITY_PATH);
  });

  let lastDiagnosticsRefresh = -Infinity;
  let animationFrame = 0;
  const render = (nowMilliseconds: number): void => {
    if (disposed) return;
    const presentation = client.samplePresentation();
    const diagnostics = client.diagnostics();
    const joinedPlayerId = diagnostics.authority.playerId;
    if (
      diagnostics.connection.phase === 'joined'
      && joinedPlayerId !== null
      && loadoutSubmittedForPlayerId !== joinedPlayerId
    ) {
      const matchPhase = diagnostics.authority.matchPhase;
      if (matchPhase === 'lobby' || matchPhase === 'warmup') {
        const selectedLoadout = authorityLoadoutForCombatPreset(
          requireRuleset('revamped_classic', 3),
          selectedCombatPreset.id,
        );
        const submitted = client.requestLoadout(createAuthorityLoadoutRequestMessage({
          requestId: `loadout.${crypto.randomUUID()}`,
          loadout: selectedLoadout,
        }));
        if (submitted) loadoutSubmittedForPlayerId = joinedPlayerId;
      } else if (matchPhase === 'active' || matchPhase === 'postmatch') {
        // A late join is already provisioned with the authority-owned default
        // loadout. Do not turn the expected selection lock into a disconnect.
        loadoutSubmittedForPlayerId = joinedPlayerId;
      }
    }
    if (presentationStatus !== 'failed') {
      try {
        const combat = diagnostics.combat.snapshot;
        const localPlayerId = diagnostics.authority.playerId;
        const roomId = diagnostics.authority.roomId;
        const matchId = diagnostics.authority.matchId;
        if (
          combat !== null
          && localPlayerId !== null
          && roomId !== null
          && matchId !== null
          && diagnostics.counters.fullSnapshots > lastHydratedFullSnapshotCount
        ) {
          const local = combat.players.find(({ playerId }) => playerId === localPlayerId) ?? null;
          combatPresentationAdapter ??= createCombatPresentationAdapter({
            schemaVersion: 1,
            localPlayerId,
          });
          const identityValue = diagnostics.authority.simulationIdentity;
          const hydrated = applyCombatPresentationWireHydration(combatPresentationAdapter, {
            schemaVersion: 1,
            identity: {
              roomId,
              matchId,
              rulesetId: identityValue.rulesetId,
              rulesetRevision: identityValue.rulesetRevision,
              rulesetHash: identityValue.rulesetHash,
              mapId: identityValue.mapId,
              fixtureId: identityValue.fixtureId,
              fixtureHash: identityValue.fixtureHash,
              physicsAdapterId: identityValue.physicsAdapterId,
              physicsAdapterVersion: identityValue.physicsAdapterVersion,
              movementProfileId: identityValue.movementProfileId,
              movementProfileRevision: identityValue.movementProfileRevision,
              movementProfileHash: identityValue.movementProfileHash,
            },
            serverTick: diagnostics.authority.lastAppliedSnapshotTick
              ?? diagnostics.authority.serverTick,
            lifecycle: diagnostics.authority.matchPhase ?? combat.match.phase,
            reliableEventBaselineSequence:
              diagnostics.authority.lastFullSnapshotReliableEventBaselineSequence,
            localPlayer: local === null
              ? null
              : {
                  playerId: local.playerId,
                  lifePhase: local.lifePhase,
                  healthPoints: local.healthPoints,
                  shieldPoints: local.shieldPoints,
                  riflePhase: local.riflePhase,
                  magazineRounds: local.magazineRounds,
                  reserveRounds: local.reserveRounds,
                  ...(local.weaponCatalogId === undefined
                    ? {}
                    : {
                        weaponCatalogId: local.weaponCatalogId,
                        selectedWeaponSlot: local.selectedWeaponSlot,
                        selectedWeaponId: local.selectedWeaponId,
                        weapons: local.weapons,
                      }),
                  grenadePhase: local.grenadePhase,
                  grenadeCooldownEndsAtTick: local.grenadeCooldownEndsAtTick,
                  activeProjectileCount: local.activeProjectileCount,
                  teleportCooldownTicksRemaining:
                    diagnostics.local.teleportCooldownTicksRemaining,
                },
            match: {
              phase: combat.match.phase,
              activeTicksRemaining: combat.match.activeTicksRemaining,
              teamScores: combat.match.teamScores,
              feedSequence: combat.match.feedSequence,
            },
          });
          combatPresentationAdapter = hydrated.adapter;
          presentationStatus = 'ready';
          presentationHydrationCount += hydrated.status === 'snapshot_applied' ? 1 : 0;
          consumePresentationIntents(hydrated.intents);
          lastHydratedFullSnapshotCount = diagnostics.counters.fullSnapshots;
        }
        if (combatPresentationAdapter !== null) {
          for (const event of diagnostics.combat.recentEvents) {
            if (processedPresentationTransportIds.has(event.id)) continue;
            const presentationLane = classifyOnlineAuthorityPresentationEvent(event);
            if (presentationLane === 'throwable') {
              consumeThrowableAbilityEvent(event as ReliableEvent & {
                readonly presentation: Extract<
                  NonNullable<ReliableEvent['presentation']>,
                  { readonly kind: 'throwable_ability_event' }
                >;
              });
              processedPresentationTransportIds.add(event.id);
              continue;
            }
            if (presentationLane === 'world') {
              // The Three runtime owns portal departure/arrival VFX and audio.
              // Passing this semantic through the combat adapter fails closed.
              processedPresentationTransportIds.add(event.id);
              continue;
            }
            if (presentationLane === 'none') continue;
            const applied = applyCombatPresentationReliableEvent(
              combatPresentationAdapter,
              event,
            );
            combatPresentationAdapter = applied.adapter;
            processedPresentationTransportIds.add(event.id);
            consumePresentationIntents(applied.intents);
          }
        }
      } catch (presentationFailure) {
        presentationStatus = 'failed';
        feedbackProofValue.textContent = 'FAILED CLOSED';
        feedbackProofValue.dataset.state = 'failed';
        feedbackHud.dataset.active = 'false';
        feedbackGlyph.dataset.active = 'false';
        const detail = presentationFailure instanceof Error
          ? presentationFailure.message
          : 'UNKNOWN_PRESENTATION_FAILURE';
        presentationFailureDetail = `COMBAT_PRESENTATION_FAIL_CLOSED: ${detail}`;
        showPlayerError(
          'Combat feedback stopped. Retry the room or return to the online lobby.',
          true,
          presentationFailureDetail,
        );
      }
    }
    const localDamagePlayerId = diagnostics.authority.playerId;
    const localDamagePosition = diagnostics.local.predictedPosition;
    const localDamageYaw = diagnostics.local.predictedYawMilliDegrees;
    if (localDamagePlayerId !== null && localDamagePosition !== null) {
      for (const event of diagnostics.combat.recentEvents) {
        if (
          event.kind !== 'damageApplied'
          || event.targetId !== localDamagePlayerId
          || event.actorId === null
          || processedDamageDirectionIds.has(event.id)
        ) continue;
        const sourcePosition = event.actorId === localDamagePlayerId
          ? localDamagePosition
          : presentation.remotes.find(({ entityId }) => entityId === event.actorId)
              ?.state.feetPosition ?? null;
        const direction = classifyAuthorityDamageDirection({
          sourcePosition,
          targetPosition: localDamagePosition,
          targetYawMilliDegrees: localDamageYaw,
        });
        if (direction === null) continue;
        processedDamageDirectionIds.add(event.id);
        damageDirection.dataset.direction = direction;
        damageDirection.dataset.active = 'true';
        damageDirectionText.textContent = direction === 'front'
          ? 'Damage ahead'
          : direction === 'rear'
            ? 'Damage behind'
            : `Damage ${direction}`;
        damageDirectionVisibleUntilMilliseconds = nowMilliseconds + 800;
      }
    }
    if (nowMilliseconds >= damageDirectionVisibleUntilMilliseconds) {
      damageDirection.dataset.active = 'false';
    }
    const combatView = {
      snapshot: diagnostics.combat.snapshot,
      recentEvents: diagnostics.combat.recentEvents,
      localPlayerId: diagnostics.authority.playerId,
    } as const;
    const localAbilityState = diagnostics.combat.snapshot?.players.find(
      ({ playerId }) => playerId === diagnostics.authority.playerId,
    )?.abilityLoadout;
    const flashTicksRemaining = localAbilityState === undefined
      ? 0
      : Math.max(
          0,
          localAbilityState.flashImpairedUntilTick - diagnostics.authority.serverTick,
        );
    const reduceFlash = body.dataset.reducedFlash === 'true'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const activeFlashEnvelopes = flashEnvelopes.filter((envelope) => (
      diagnostics.authority.serverTick < envelope.appliedAtTick + envelope.durationTicks
    ));
    const strongestFlashEnvelope = activeFlashEnvelopes.reduce<FlashEnvelope | null>(
      (strongest, envelope) => (
        strongest === null || envelope.intensityPermille > strongest.intensityPermille
          ? envelope
          : strongest
      ),
      null,
    );
    const peakIntensity = strongestFlashEnvelope?.intensityPermille === undefined
      ? 1
      : strongestFlashEnvelope.intensityPermille / 1_000;
    const peakOcclusion = 0.36 + 0.5 * Math.max(0, Math.min(1, peakIntensity));
    flashOverlay.dataset.active = String(flashTicksRemaining > 0);
    flashOverlay.dataset.flashMode = reduceFlash ? 'low_luminance' : 'luminous';
    flashOverlay.dataset.facingPermille = String(
      strongestFlashEnvelope?.facingPermille ?? 1_000,
    );
    flashOverlay.style.opacity = flashTicksRemaining <= 0
      ? '0'
      : String(
          peakOcclusion * Math.min(1, flashTicksRemaining / 12),
        );
    if (threeRuntime !== null) {
      try {
        const velocity = diagnostics.local.predictedVelocity;
        const grounded = diagnostics.local.predictedGrounded;
        const horizontalSpeed = velocity === null
          ? 0
          : Math.hypot(velocity.x, velocity.z);
        if (
          previousMovementGrounded === true
          && grounded === false
          && velocity !== null
          && velocity.y > 0
        ) {
          playMovementJump();
        } else if (previousMovementGrounded === false && grounded === true) {
          playMovementLand(Math.abs(previousMovementVerticalSpeed) > 9_000);
        }
        if (grounded === true && horizontalSpeed > 800) {
          const sprinting = horizontalSpeed > 6_400;
          const cadence = sprinting ? 310 : 440;
          if (nowMilliseconds - lastMovementFootstepAt >= cadence) {
            playMovementFootstep(sprinting);
            lastMovementFootstepAt = nowMilliseconds;
          }
        }
        previousMovementGrounded = grounded;
        previousMovementVerticalSpeed = velocity?.y ?? 0;
        const predictedPosition = diagnostics.local.predictedPosition;
        const predictedYaw = diagnostics.local.predictedYawMilliDegrees;
        const predictedPitch = diagnostics.local.predictedPitchMilliDegrees;
        latestBlinkPreview = predictedPosition === null
          || predictedYaw === null
          || predictedPitch === null
          ? null
          : resolveOnlineBlinkPreview({
              active: blinkPreviewHeld,
              feetPosition: predictedPosition,
              yawMilliDegrees: predictedYaw,
              pitchMilliDegrees: predictedPitch,
              stance: diagnostics.local.predictedStance ?? 'standing',
              cooldownTicksRemaining:
                diagnostics.local.teleportCooldownTicksRemaining,
            }, PHASE3_HYPOTHESIS_MOVEMENT_PROFILE, world);
        threeRuntime.render({
          nowMilliseconds,
          presentation,
          combat: combatView,
          localYawMilliDegrees: diagnostics.local.predictedYawMilliDegrees,
          localPitchMilliDegrees: diagnostics.local.predictedPitchMilliDegrees,
          localSpeedMillimetersPerSecond: horizontalSpeed,
          aimHeld,
          blinkPreview: latestBlinkPreview,
        });
      } catch (renderFailure) {
        const detail = renderFailure instanceof Error
          ? renderFailure.message
          : String(renderFailure);
        presentationFailureDetail = `ONLINE_REV5_3D_RENDER_FAILED_CLOSED: ${detail}`;
        mapStatus.textContent = 'Arena presentation stopped';
        mapStatus.dataset.state = 'failed';
        body.dataset.online3dStatus = 'failed';
        threeRuntime.dispose();
        threeRuntime = null;
      }
    } else if (!threeDimensionalMap) {
      renderArena(canvas, presentation, combatView, mapRuntime);
    }
    if (renderRequested || nowMilliseconds - lastDiagnosticsRefresh >= 100) {
      const combat = diagnostics.combat.snapshot;
      const localPlayer = combat?.players.find(({ playerId }) => (
        playerId === diagnostics.authority.playerId
      ));
      if (combat !== null && diagnostics.authority.playerId !== null) {
        presentOnlineMatchResult(combat, diagnostics.authority.playerId);
      }
      const selectedWeapon = localPlayer?.weapons?.find(
        ({ slot }) => slot === localPlayer.selectedWeaponSlot,
      );
      const bluePlayer = combat?.players.find(({ teamId }) => teamId === 'team_blue');
      const redPlayer = combat?.players.find(({ teamId }) => teamId === 'team_red');
      const blueScore = combat?.match.teamScores.find(({ teamId }) => teamId === 'team_blue')?.score ?? 0;
      const redScore = combat?.match.teamScores.find(({ teamId }) => teamId === 'team_red')?.score ?? 0;
      connectionFact.value.textContent = diagnostics.connection.phase.toUpperCase();
      connectionFact.value.dataset.state = diagnostics.connection.phase;
      matchFact.value.textContent = `REV ${diagnostics.authority.simulationIdentity.rulesetRevision} · ${diagnostics.authority.simulationIdentity.rulesetHash}`;
      playerFact.value.textContent = diagnostics.authority.playerId?.slice(0, 18) ?? 'WAITING';
      peersFact.value.textContent = String(diagnostics.remote.playerCount);
      phaseFact.value.textContent = combat?.match.phase ?? diagnostics.authority.matchPhase ?? 'WAITING';
      tickFact.value.textContent = String(diagnostics.authority.serverTick);
      const remainingSeconds = combat === null
        ? 0
        : Math.max(0, Math.ceil(combat.match.activeTicksRemaining / 20));
      const blinkReadyIn = Math.max(
        0,
        diagnostics.local.teleportCooldownTicksRemaining ?? 0,
      );
      const hudAbilities = createAuthorityAbilityHudInputs({
        serverTick: diagnostics.authority.serverTick,
        teleportCooldownTicksRemaining: blinkReadyIn,
        localPlayer,
      });
      const hudView = createOnlineHudViewModel({
        health: localPlayer?.healthPoints ?? 0,
        maximumHealth: 100,
        weapon: {
          name: selectedWeapon?.family.replace(/_/gu, ' ') ?? 'Auto rifle',
          magazineRounds: selectedWeapon === undefined
            ? localPlayer?.magazineRounds ?? 0
            : selectedWeapon.magazineRounds,
          reserveRounds: selectedWeapon === undefined
            ? localPlayer?.reserveRounds ?? 0
            : selectedWeapon.reserveRounds,
          isMelee: selectedWeapon?.magazineRounds === null,
          isReloading: selectedWeapon?.phase === 'reloading',
        },
        abilities: hudAbilities,
        blueScore,
        redScore,
        remainingSeconds,
        phase: combat?.match.phase ?? diagnostics.authority.matchPhase ?? 'Waiting',
        objective: 'Team score',
        connectionPhase: diagnostics.connection.phase,
        connectionError: presentationFailureDetail ?? diagnostics.lastError,
        lifeState: localPlayer?.lifePhase === 'dead'
          ? 'dead'
          : localPlayer?.lifePhase === 'alive'
            ? 'alive'
            : 'waiting',
        respawnTicks: localPlayer?.lifePhase === 'dead'
          ? Math.max(
              0,
              (localPlayer.respawnEligibleAtTick ?? diagnostics.authority.serverTick)
                - diagnostics.authority.serverTick,
            )
          : null,
        tickRateHz: 20,
      });
      body.dataset.hudViewModel = String(hudView.schemaVersion);
      scoreValue.textContent = `${hudView.score.leftScore} — ${hudView.score.rightScore ?? 0}`;
      scorePhase.textContent = `${hudView.score.phaseLabel} · ${hudView.score.timerLabel}`;
      scoreboardScore.textContent = scoreValue.textContent;
      const authorityScoreRows = combat?.match.scoreboard === undefined
        || diagnostics.authority.playerId === null
        ? []
        : createAuthorityScoreboardRows(
            combat.match.scoreboard.playerScores,
            diagnostics.authority.playerId,
          );
      const scoreboardRows = authorityScoreRows.map((player) => {
              const row = element('div', 'online-session__scoreboard-player');
              const team = player.teamId === 'team_red' ? 'red' : 'blue';
              row.dataset.team = team;
              const identityLabel = player.isYou
                ? 'You'
                : `${team === 'red' ? 'Red' : 'Blue'} peer`;
              row.append(
                element('span', 'online-session__scoreboard-team', team),
                element('strong', '', identityLabel),
                element('span', '', `${player.kills} K`),
                element('span', '', `${player.deaths} D`),
                element('span', '', `${player.assists} A`),
                element('span', '', `${player.kd} K/D`),
              );
              return row;
            });
      scoreboardPlayers.replaceChildren(...(
        scoreboardRows.length > 0
          ? scoreboardRows
          : [element(
              'p',
              'online-session__scoreboard-empty',
              combat?.match.scoreboard === undefined
                ? 'K/D/A unavailable while the server upgrades'
                : 'Waiting for authority player scores',
            )]
      ));
      body.dataset.onlineScoreboardAuthority = combat?.match.scoreboard === undefined
        ? 'legacy_unavailable'
        : 'available';
      const applyTeam = (
        player: CombatSnapshotV1['players'][number] | undefined,
        state: HTMLElement,
        health: HTMLElement,
        fill: HTMLElement,
        label: string,
      ): void => {
        const local = player?.playerId === diagnostics.authority.playerId;
        state.textContent = player === undefined
          ? `${label} · WAITING`
          : player.lifePhase === 'dead'
            ? `${local ? 'YOU' : label} · DOWN`
            : local
              ? 'YOU'
              : label;
        health.textContent = `${player?.healthPoints ?? '—'} HP`;
        fill.style.transform = `scaleX(${Math.max(0, Math.min(100, player?.healthPoints ?? 0)) / 100})`;
      };
      applyTeam(bluePlayer, blueState, blueHealthText, blueHealthFill, 'BLUE');
      applyTeam(redPlayer, redState, redHealthText, redHealthFill, 'RED');
      localHealth.value.textContent = hudView.life.state === 'dead'
        ? `Respawn ${hudView.life.respawnSeconds ?? 0}s`
        : String(hudView.health.value);
      localHealth.root.dataset.state = hudView.life.state === 'dead'
        ? 'dead'
        : hudView.health.state;
      localAmmo.value.textContent = hudView.weapon.isMelee
        ? hudView.weapon.magazineLabel
        : `${hudView.weapon.magazineLabel} / ${hudView.weapon.reserveLabel}`;
      localAmmo.root.dataset.state = hudView.weapon.ammoState;
      localRifle.value.textContent = hudView.weapon.isReloading
        ? `${hudView.weapon.name} · Reloading`
        : hudView.weapon.name;
      localGrenade.value.textContent = hudView.abilities
        .slice(1)
        .map((ability) => `${ability.name} ${ability.stateLabel}`)
        .join(' · ');
      const abilityButtons = [
        teleportButton,
        abilityOneButton,
        abilityTwoButton,
        abilityThreeButton,
      ] as const;
      for (const [index, ability] of hudView.abilities.entries()) {
        const button = abilityButtons[index];
        if (button === undefined) continue;
        const glyphRoot = element('span', 'ability-glyph-slot');
        glyphRoot.setAttribute('aria-hidden', 'true');
        glyphRoot.append(createAbilityGlyph(ability.id));
        const progress = element('span', 'ability-progress');
        progress.setAttribute('aria-hidden', 'true');
        const progressFill = element('span', 'ability-progress__fill');
        progressFill.style.transform = `scaleX(${ability.readinessRatio})`;
        progress.append(progressFill);
        button.replaceChildren(
          glyphRoot,
          element('kbd', 'online-session__ability-key', ability.key),
          element('span', 'online-session__ability-name', ability.name),
          element('strong', 'online-session__ability-charge', ability.stateLabel),
          progress,
        );
        button.setAttribute('aria-label', ability.ariaLabel);
        button.dataset.abilityId = ability.id;
        button.dataset.state = ability.state;
        button.dataset.ready = String(ability.state === 'ready');
        button.dataset.locked = String(ability.locked);
        button.dataset.rechargeSeconds = String(Math.ceil(ability.cooldownSeconds));
        button.dataset.readinessPercent = String(Math.round(ability.readinessRatio * 100));
        button.style.setProperty(
          '--ability-ready-ratio',
          `${Math.round(ability.readinessRatio * 100)}%`,
        );
      }
      lifeBanner.textContent = hudView.life.message;
      lifeBanner.hidden = hudView.life.message.length === 0;
      const playerLabel = (playerId: string | null): string => {
        if (playerId === null) return 'AUTHORITY';
        if (playerId === diagnostics.authority.playerId) return 'YOU';
        return `PEER ${playerId.slice(-6)}`;
      };
      const feedEntries = diagnostics.combat.recentEvents
        .filter((event) => event.kind === 'playerKilled')
        .slice(-4)
        .reverse()
        .map((event) => {
        const entry = element('div', 'online-session__feed-entry');
        entry.dataset.kind = event.kind;
        const description = element('span', '');
        const actor = playerLabel(event.actorId);
        const target = playerLabel(event.targetId);
        description.append(
          element('strong', '', actor),
          document.createTextNode(' eliminated '),
          element('strong', '', target),
        );
        entry.append(description);
        return entry;
      });
      feed.replaceChildren(...(feedEntries.length > 0
        ? feedEntries
        : [element('p', 'online-session__feed-empty', 'Waiting for authoritative combat events…')]));
      snapshotMetric.value.textContent = `${diagnostics.counters.fullSnapshots} / ${diagnostics.counters.deltaSnapshots}`;
      reconciliationMetric.value.textContent = String(diagnostics.counters.reconciliations);
      correctionMetric.value.textContent = diagnostics.local.lastPositionErrorMillimeters === null
        ? '—'
        : `${diagnostics.local.lastPositionErrorMillimeters.toFixed(1)} mm`;
      resumeMetric.value.textContent = String(diagnostics.counters.resumeSuccesses);
      resumeButton.disabled = !diagnostics.resume.available;
      const technicalDetail = presentationFailureDetail ?? diagnostics.lastError ?? '';
      const playerMessage = presentationFailureDetail === null
        ? hudView.connection.message
        : 'Combat feedback stopped. Start a fresh room or return to the online lobby.';
      if (matchResultShown) {
        showPlayerError('', false, '', 'quiet');
      } else {
        showPlayerError(
          playerMessage,
          presentationFailureDetail !== null || hudView.connection.canRetry,
          technicalDetail,
          presentationFailureDetail === null ? hudView.connection.state : 'fatal',
        );
      }
      body.dataset.onlinePreviewStatus = matchResultShown
        ? 'result'
        : diagnostics.connection.phase;
      body.dataset.onlineCombatPhase = combat?.match.phase ?? 'waiting';
      body.dataset.onlineLocalLife = localPlayer?.lifePhase ?? 'waiting';
      body.dataset.onlineCombatFeedSequence = String(combat?.match.feedSequence ?? 0);
      body.dataset.onlineRoomProfile = mapProof?.roomProfile ?? 'p58d-rev3-combat-v1';
      body.dataset.onlineMapReference = mapProof?.mapBinding.mapReference ?? 'phase4_flat_run';
      body.dataset.onlineFixtureHash = identity.fixtureHash;
      body.dataset.onlinePresentationStatus = presentationStatus;
      body.dataset.onlinePresentationLastCue = presentationLastCue ?? 'none';
      body.dataset.onlinePresentationConfirmed = String(presentationConfirmedIntentCount);
      body.dataset.onlineInputHeldButtons = String(heldInputButtons);
      body.dataset.onlineAimHeld = String(aimHeld);
      body.dataset.onlineSelectedWeaponSlot = String(
        localPlayer?.selectedWeaponSlot ?? selectedWeaponSlot,
      );
      body.dataset.onlineSelectedWeaponId = localPlayer?.selectedWeaponId ?? 'waiting';
      body.dataset.onlineBlinkPreview = latestBlinkPreview?.active === true
        ? latestBlinkPreview.valid ? 'valid' : latestBlinkPreview.reason
        : 'inactive';
      body.dataset.onlineBlinkPreviewAuthorityBound = String(
        latestBlinkPreview?.authorityBound === true,
      );
      for (const [slot, button] of weaponSlotButtons.entries()) {
        const active = slot === (localPlayer?.selectedWeaponSlot ?? selectedWeaponSlot);
        button.dataset.active = String(active);
        button.setAttribute('aria-pressed', String(active));
      }
      renderRequested = false;
      lastDiagnosticsRefresh = nowMilliseconds;
    }
    animationFrame = requestAnimationFrame(render);
  };

  updateInput();
  animationFrame = requestAnimationFrame(render);
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(animationFrame);
    window.removeEventListener('keydown', keyboardHandler);
    window.removeEventListener('keyup', keyboardHandler);
    window.removeEventListener('keydown', scoreboardKeyboardHandler);
    window.removeEventListener('keyup', scoreboardKeyboardHandler);
    window.removeEventListener('blur', blurHandler);
    window.removeEventListener('pointerup', releaseFire);
    window.removeEventListener('pointerup', releaseAim);
    window.removeEventListener('pointercancel', releaseFire);
    window.removeEventListener('pointercancel', releaseAim);
    document.removeEventListener('visibilitychange', visibilityHandler);
    document.removeEventListener('mousemove', pointerLook);
    document.removeEventListener('pointerlockchange', pointerLockChange);
    canvas.removeEventListener('pointerdown', canvasPointerDown);
    canvas.removeEventListener('contextmenu', preventCanvasContextMenu);
    playAgainButton.removeEventListener('click', requestNextMatch);
    window.clearTimeout(feedbackTimeout);
    if (audioContext !== null) void audioContext.close();
    audioContext = null;
    feedbackOutput = null;
    feedbackNoise = null;
    portalCaptionCues?.dispose();
    client.dispose();
    threeRuntime?.dispose();
    world.dispose();
    delete (window as { __KYX_ONLINE_PREVIEW__?: unknown }).__KYX_ONLINE_PREVIEW__;
    window.removeEventListener('pagehide', dispose);
  };
  window.addEventListener('pagehide', dispose, { once: true });
  return Object.freeze({ dispose });
}

export async function mountOnlineAuthorityRoute(
  body: HTMLBodyElement,
  availability: OnlineAuthorityAvailability,
): Promise<void> {
  document.title = 'KYX.IO — Online Combat Preview';
  document.querySelector('meta[name="description"]')?.setAttribute(
    'content',
    'KYX.IO pre-release authoritative online combat preview.',
  );
  const { root, content } = createShell();
  body.replaceChildren(root);
  body.dataset.launchSupport = 'online-authority-preview';
  body.dataset.onlinePreviewStatus = 'lobby';

  const request = parseOnlineAuthorityRequest(window.location.search);
  if (availability.kind !== 'configured') {
    renderLanding(content, availability);
    return;
  }
  if (request.kind === 'invalid') {
    body.dataset.onlinePreviewStatus = 'invalid-request';
    renderNotice(content, 'That room link is not valid.', request.reason);
    return;
  }
  if (request.kind === 'landing') {
    renderLanding(
      content,
      availability,
      'profile' in request ? request.profile : undefined,
    );
    return;
  }

  // A missing profile is a product entry, not permission to revive the old
  // flat-run preview. Explicit historical profile links remain supported.
  const requestedProfile = 'profile' in request
    ? request.profile
    : defaultOnlineProfile();
  let roomCode: string;
  let mode: AuthorityEvidenceConfig['mode'];
  let sessionBinding: OnlineSessionBinding;
  let activeSession: OnlineSessionController | null = null;
  let continuationPending = false;
  let routeDisposed = false;
  const disposeRoute = (): void => {
    if (routeDisposed) return;
    routeDisposed = true;
    activeSession?.dispose();
    activeSession = null;
  };
  window.addEventListener('pagehide', disposeRoute, { once: true });
  const continueToNextMatch: OnlineSessionContinuation = async (profile) => {
    if (routeDisposed) throw new Error('ONLINE_ROUTE_DISPOSED');
    if (continuationPending) throw new Error('ONLINE_NEXT_MATCH_ALREADY_PENDING');
    continuationPending = true;
    const nextProfile = nextOnlineArenaProfile(profile);
    try {
      const proof = await createOnlineAuthorityMapCombatRoom(
        availability.origin,
        nextProfile,
      );
      if (routeDisposed) throw new Error('ONLINE_ROUTE_DISPOSED');
      activeSession?.dispose();
      activeSession = null;
      content.replaceChildren();
      content.classList.remove('online-preview__content--session');
      delete body.dataset.onlineMatchResult;
      body.dataset.onlinePreviewStatus = 'initializing-next-match';
      window.history.replaceState(null, '', onlineJoinPath(proof.roomCode, nextProfile));
      const nextSession = await mountSession(
        body,
        content,
        availability.origin,
        proof.roomCode,
        'create',
        Object.freeze({ kind: 'authority_map', proof }),
        continueToNextMatch,
      );
      if (routeDisposed) {
        nextSession.dispose();
        throw new Error('ONLINE_ROUTE_DISPOSED');
      }
      activeSession = nextSession;
    } catch (cause) {
      if (!routeDisposed && activeSession === null) {
        content.classList.remove('online-preview__content--session');
        renderNotice(
          content,
          'Next match could not start.',
          cause instanceof Error ? cause.message : String(cause),
          nextProfile,
          'TRY AGAIN',
          onlineCreatePath(nextOnlineArenaProfile(profile)),
        );
        body.dataset.onlinePreviewStatus = 'next-match-failed';
      }
      throw cause;
    } finally {
      continuationPending = false;
    }
  };
  if (request.kind === 'create') {
    body.dataset.onlinePreviewStatus = 'creating-room';
    renderNotice(
      content,
      'Creating an authority room…',
      'The configured server is allocating a fresh room. This normally takes only a moment.',
      requestedProfile,
      'CANCEL',
    );
    try {
      if (requestedProfile !== undefined) {
        const proof = await createOnlineAuthorityMapCombatRoom(
          availability.origin,
          requestedProfile,
        );
        roomCode = proof.roomCode;
        sessionBinding = Object.freeze({ kind: 'authority_map', proof });
      } else {
        roomCode = await createOnlineCombatRoom(availability.origin);
        sessionBinding = Object.freeze({ kind: 'flat_run_revision_3' });
      }
    } catch (cause) {
      if (routeDisposed) return;
      body.dataset.onlinePreviewStatus = 'create-failed';
      renderNotice(
        content,
        'Room creation failed.',
        cause instanceof Error ? cause.message : String(cause),
        requestedProfile,
        'TRY AGAIN',
        onlineCreatePath(requestedProfile),
      );
      return;
    }
    mode = 'create';
    window.history.replaceState(null, '', onlineJoinPath(roomCode, requestedProfile));
  } else {
    roomCode = request.roomCode;
    mode = 'join';
    if (requestedProfile !== undefined) {
      body.dataset.onlinePreviewStatus = 'verifying-room-profile';
      renderNotice(
        content,
        requestedProfile === ONLINE_RELAY_REV1_COMBAT_PROFILE_ID
          ? 'Verifying Relay Revision 1 authority room…'
          : requestedProfile === ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID
            ? 'Verifying retired Foundry Revision 4 compatibility room…'
          : requestedProfile === ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID
            ? 'Verifying retired Revision 3 compatibility room…'
          : 'Verifying legacy authority room…',
        'The profile and complete locked map binding must match before the socket can open.',
        requestedProfile,
        'CANCEL',
      );
      try {
        const proof = await verifyOnlineAuthorityMapCombatRoom(
          availability.origin,
          roomCode,
          requestedProfile,
        );
        sessionBinding = Object.freeze({ kind: 'authority_map', proof });
      } catch (cause) {
        if (routeDisposed) return;
        body.dataset.onlinePreviewStatus = 'room-profile-mismatch';
        renderNotice(
          content,
          'Arena room verification failed.',
          cause instanceof Error ? cause.message : String(cause),
          requestedProfile,
          'BACK TO ONLINE LOBBY',
        );
        return;
      }
    } else {
      sessionBinding = Object.freeze({ kind: 'flat_run_revision_3' });
    }
  }

  body.dataset.onlinePreviewStatus = 'initializing';
  try {
    const initialSession = await mountSession(
      body,
      content,
      availability.origin,
      roomCode,
      mode,
      sessionBinding,
      continueToNextMatch,
    );
    if (routeDisposed) {
      initialSession.dispose();
      return;
    }
    activeSession = initialSession;
  } catch (cause) {
    if (routeDisposed) return;
    body.dataset.onlinePreviewStatus = 'client-world-mismatch';
    renderNotice(
      content,
      'Online client initialization failed.',
      cause instanceof Error ? cause.message : String(cause),
      requestedProfile,
    );
  }
}
