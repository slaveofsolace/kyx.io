import { hashRulesetContent, requireRuleset } from '../content';
import { UserAccount } from '../core/UserAccount.js';
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
  createOnlineInkfallRevision2CombatRoom,
  verifyOnlineInkfallRevision2CombatRoom,
  type OnlineInkfallRevision2RoomProof,
} from './onlineAuthorityGateway';
import { createOnlineInkfallRevision2World } from './onlineAuthorityInkfallWorld';
import {
  ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
  type OnlineAuthorityProfileSelection,
} from './onlineAuthorityProfiles';
import {
  ONLINE_AUTHORITY_PATH,
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
  readonly localPredictedPosition: Readonly<{ x: number; y: number; z: number }> | null;
  readonly localAuthoritativePosition: Readonly<{ x: number; y: number; z: number }> | null;
  readonly localPredictedYawMilliDegrees: number | null;
  readonly localPredictionErrorMillimeters: number | null;
  readonly localPredictionHistoryCommands: number;
  readonly remoteEntities: readonly Readonly<{
    entityId: string;
    interpolationMode: AuthorityEvidencePresentation['remotes'][number]['mode'];
    position: Readonly<{ x: number; y: number; z: number }>;
  }>[];
  readonly remotePositions: readonly Readonly<{ x: number; y: number; z: number }>[];
  readonly lastError: string | null;
  readonly presentation: Readonly<{
    status: 'waiting' | 'ready' | 'failed';
    hydrationCount: number;
    intentCount: number;
    confirmedIntentCount: number;
    rejectedIntentCount: number;
    duplicateAuthorityEvents: number;
    staleAuthorityEvents: number;
    lastCue: 'snapshot' | 'body' | 'shield' | 'kill' | 'teleport' | 'teleport_rejected' | null;
    lastAuthorityEventId: string | null;
    audioCueAttempts: number;
  }>;
  readonly roomVerification?: Readonly<{
    roomProfile: typeof ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID;
    mapBinding: OnlineInkfallRevision2RoomProof['mapBinding'];
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

function onlineStyles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    :root { color-scheme: dark; background: #05070a; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; overflow: auto; background: #05070a; color: #eef5f7; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    button, input { font: inherit; }
    a { color: inherit; }
    .online-preview { min-height: 100vh; background: radial-gradient(circle at 78% -8%, rgba(25, 208, 238, .12), transparent 35rem), linear-gradient(135deg, #05070a 0%, #080d12 54%, #06090d 100%); }
    .online-preview__bar { display: flex; align-items: center; justify-content: space-between; min-height: 68px; padding: 0 clamp(20px, 4vw, 64px); border-bottom: 1px solid #202a31; background: rgba(5, 8, 11, .82); }
    .online-preview__brand { color: #f4f8f9; font: 950 20px/1 ui-monospace, monospace; letter-spacing: -.06em; text-decoration: none; }
    .online-preview__brand span { color: #14e0ff; }
    .online-preview__bar-meta { display: flex; align-items: center; gap: 16px; color: #72818c; font: 750 10px/1 ui-monospace, monospace; letter-spacing: .13em; text-transform: uppercase; }
    .online-preview__status-dot { display: inline-flex; align-items: center; gap: 8px; color: #ffd166; }
    .online-preview__status-dot::before { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 13px currentColor; content: ''; }
    .online-preview__back { color: #9dacb6; text-decoration: none; }
    .online-preview__back:hover { color: #fff; }
    .online-preview__content { width: min(1420px, calc(100% - 40px)); margin: 0 auto; padding: clamp(28px, 5vw, 74px) 0 64px; }
    .online-preview__eyebrow { margin: 0 0 14px; color: #14e0ff; font: 900 11px/1 ui-monospace, monospace; letter-spacing: .2em; text-transform: uppercase; }
    .online-preview__title { max-width: 980px; margin: 0; font-size: clamp(44px, 7vw, 96px); line-height: .88; letter-spacing: -.066em; }
    .online-preview__intro { max-width: 790px; margin: 24px 0 0; color: #94a3ad; font-size: 16px; line-height: 1.7; }
    .online-preview__scope { display: grid; grid-template-columns: auto 1fr; gap: 14px; max-width: 960px; margin: 30px 0 0; padding: 16px 18px; border: 1px solid #4d3e20; background: rgba(56, 40, 13, .48); color: #d9c086; font-size: 13px; line-height: 1.55; }
    .online-preview__scope strong { color: #ffd166; font: 900 10px/1.55 ui-monospace, monospace; letter-spacing: .13em; text-transform: uppercase; }
    .online-preview__lobby { display: grid; grid-template-columns: 1.05fr .95fr; gap: 1px; max-width: 1080px; margin-top: 44px; border: 1px solid #26313a; background: #26313a; }
    .online-preview__lobby-card { min-height: 295px; padding: clamp(24px, 4vw, 44px); background: #0a0f14; }
    .online-preview__card-number { color: #475763; font: 900 10px/1 ui-monospace, monospace; letter-spacing: .15em; }
    .online-preview__card-title { margin: 26px 0 10px; font-size: 27px; letter-spacing: -.035em; }
    .online-preview__card-copy { min-height: 66px; margin: 0 0 25px; color: #7f909b; font-size: 13px; line-height: 1.6; }
    .online-preview__primary, .online-preview__secondary { min-height: 48px; padding: 0 19px; border: 1px solid #14e0ff; background: #0b2c34; color: #baf7ff; cursor: pointer; font: 900 10px/1 ui-monospace, monospace; letter-spacing: .13em; text-transform: uppercase; }
    .online-preview__primary:hover, .online-preview__secondary:hover { background: #10404c; }
    .online-preview__primary:disabled, .online-preview__secondary:disabled { border-color: #344047; background: #13181c; color: #5c6870; cursor: not-allowed; }
    .online-preview__join-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 9px; }
    .online-preview__input { min-width: 0; height: 48px; padding: 0 14px; border: 1px solid #34424b; outline: 0; background: #060a0d; color: #edf8fb; font: 850 13px/1 ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; }
    .online-preview__input:focus { border-color: #14e0ff; box-shadow: 0 0 0 1px #14e0ff; }
    .online-preview__form-error { min-height: 20px; margin: 10px 0 0; color: #ff8678; font: 700 11px/1.5 ui-monospace, monospace; }
    .online-preview__profile-option { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: start; max-width: 1080px; margin-top: 16px; padding: 16px 18px; border: 1px solid #5d4520; background: rgba(49, 33, 9, .72); cursor: pointer; }
    .online-preview__profile-option input { width: 17px; height: 17px; margin: 2px 0 0; accent-color: #ffbf47; }
    .online-preview__profile-option strong { display: block; color: #ffd166; font: 900 10px/1.4 ui-monospace, monospace; letter-spacing: .11em; text-transform: uppercase; }
    .online-preview__profile-option span { display: block; margin-top: 5px; color: #bca77c; font-size: 12px; line-height: 1.55; }
    .online-preview__endpoint { margin-top: 18px; color: #5f707b; font: 700 10px/1.5 ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; }
    .online-preview__notice { max-width: 760px; margin-top: 42px; padding: 30px; border: 1px solid #34424b; background: #0a0f14; }
    .online-preview__notice h2 { margin: 0 0 12px; font-size: 25px; }
    .online-preview__notice p { margin: 0; color: #8c9aa3; line-height: 1.65; }
    .online-preview__notice .online-preview__primary { margin-top: 24px; }
    .online-session__head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 28px; margin-bottom: 28px; }
    .online-session__head h1 { max-width: 800px; margin: 0; font-size: clamp(38px, 5.2vw, 72px); line-height: .92; letter-spacing: -.055em; }
    .online-session__head p { max-width: 700px; margin: 18px 0 0; color: #85959f; line-height: 1.65; }
    .online-session__room { text-align: right; }
    .online-session__room-label { display: block; margin-bottom: 8px; color: #63727c; font: 800 9px/1 ui-monospace, monospace; letter-spacing: .15em; text-transform: uppercase; }
    .online-session__room-code { color: #f5fbfd; font: 950 clamp(22px, 3vw, 34px)/1 ui-monospace, monospace; letter-spacing: .04em; }
    .online-session__profile { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px; align-items: center; margin-bottom: 16px; padding: 13px 15px; border: 1px solid #765622; background: linear-gradient(90deg, rgba(73, 48, 8, .86), rgba(25, 20, 12, .78)); }
    .online-session__profile strong { color: #ffd166; font: 950 10px/1.35 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; }
    .online-session__profile code { overflow-wrap: anywhere; color: #dccaa2; font: 750 10px/1.45 ui-monospace, monospace; }
    .online-session__facts { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 1px; margin-bottom: 16px; border: 1px solid #26323a; background: #26323a; }
    .online-session__fact { min-height: 78px; padding: 14px; background: #0a0f14; }
    .online-session__fact span { display: block; margin-bottom: 9px; color: #64747e; font: 800 9px/1 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; }
    .online-session__fact strong { overflow-wrap: anywhere; color: #e9f2f5; font: 850 12px/1.35 ui-monospace, monospace; }
    .online-session__fact strong[data-state='joined'] { color: #51e6c1; }
    .online-session__fact strong[data-state='failed'], .online-session__fact strong[data-state='closed'] { color: #ff7767; }
    .online-session__grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(320px, .58fr); gap: 16px; }
    .online-session__panel { overflow: hidden; border: 1px solid #26323a; background: #090e12; }
    .online-session__panel-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 48px; padding: 0 15px; border-bottom: 1px solid #26323a; color: #dce8ec; font: 900 10px/1 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; }
    .online-session__panel-head span { color: #63747e; font-weight: 700; letter-spacing: .05em; }
    .online-session__canvas-wrap { position: relative; padding: 12px; }
    .online-session__canvas { display: block; width: 100%; height: auto; border: 1px solid #1c3539; background: #061012; }
    .online-session__legend { display: flex; flex-wrap: wrap; gap: 16px; padding: 0 15px 15px; color: #74848e; font: 700 10px/1.4 ui-monospace, monospace; }
    .online-session__legend i { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: var(--legend-color); }
    .online-session__side { display: grid; gap: 16px; align-content: start; }
    .online-session__side-body { padding: 19px; }
    .online-session__guest { margin: 0 0 7px; color: #f1f7f9; font-size: 21px; font-weight: 800; }
    .online-session__muted { margin: 0; color: #71818b; font-size: 12px; line-height: 1.6; }
    .online-session__invite { display: block; overflow-wrap: anywhere; margin: 15px 0; padding: 12px; border: 1px solid #27343c; background: #060a0d; color: #88a0ad; font: 650 10px/1.55 ui-monospace, monospace; }
    .online-session__actions { display: grid; gap: 9px; }
    .online-session__actions .online-preview__primary, .online-session__actions .online-preview__secondary { width: 100%; }
    .online-session__metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #26323a; }
    .online-session__metric { min-height: 82px; padding: 14px; background: #090e12; }
    .online-session__metric span { display: block; margin-bottom: 8px; color: #61717b; font: 800 9px/1.3 ui-monospace, monospace; letter-spacing: .09em; text-transform: uppercase; }
    .online-session__metric strong { color: #e5eff2; font: 850 15px/1.3 ui-monospace, monospace; }
    .online-session__error { display: none; margin: 16px 0 0; padding: 14px 16px; border: 1px solid #6c342d; background: #27100d; color: #ff9b8d; font: 700 12px/1.55 ui-monospace, monospace; white-space: pre-wrap; }
    .online-session__error:not(:empty) { display: block; }
    .online-session__combat-strip { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 14px; padding: 13px 15px; border-top: 1px solid #26323a; background: #060b0f; }
    .online-session__combat-player { min-width: 0; }
    .online-session__combat-player:last-child { text-align: right; }
    .online-session__combat-name { display: flex; justify-content: space-between; gap: 9px; margin-bottom: 7px; color: #dce8ec; font: 850 10px/1 ui-monospace, monospace; letter-spacing: .07em; text-transform: uppercase; }
    .online-session__combat-player:last-child .online-session__combat-name { flex-direction: row-reverse; }
    .online-session__health-track { height: 8px; overflow: hidden; border: 1px solid #26343b; background: #10171b; }
    .online-session__health-fill { width: 100%; height: 100%; transform-origin: left; background: linear-gradient(90deg, #38d38a, #a8ffcb); transition: transform 90ms linear; }
    .online-session__combat-player:last-child .online-session__health-fill { transform-origin: right; background: linear-gradient(90deg, #ffb08c, #ff5f64); }
    .online-session__score { min-width: 122px; text-align: center; }
    .online-session__score strong { display: block; color: #fff; font: 950 25px/1 ui-monospace, monospace; letter-spacing: .12em; }
    .online-session__score span { display: block; margin-top: 7px; color: #6e7f89; font: 800 8px/1 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; }
    .online-session__combat-panel { padding: 16px; }
    .online-session__combat-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; border: 1px solid #26323a; background: #26323a; }
    .online-session__combat-stat { min-height: 66px; padding: 11px; background: #080d11; }
    .online-session__combat-stat span { display: block; margin-bottom: 7px; color: #60717b; font: 800 8px/1.2 ui-monospace, monospace; letter-spacing: .1em; text-transform: uppercase; }
    .online-session__combat-stat strong { color: #eaf4f6; font: 900 13px/1.25 ui-monospace, monospace; }
    .online-session__controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
    .online-session__control { min-height: 43px; border: 1px solid #2c4b52; background: #0a2025; color: #a9f5ff; cursor: pointer; font: 900 9px/1.25 ui-monospace, monospace; letter-spacing: .09em; text-transform: uppercase; touch-action: none; }
    .online-session__control[data-active='true'] { border-color: #effcff; background: #14768a; color: #fff; box-shadow: 0 0 18px rgba(20, 224, 255, .28); }
    .online-session__feed { display: grid; gap: 7px; max-height: 170px; overflow: auto; margin-top: 12px; }
    .online-session__feed-entry { display: grid; grid-template-columns: auto 1fr; gap: 9px; padding: 9px 10px; border-left: 2px solid #35515a; background: #080d11; color: #93a5ae; font: 750 9px/1.35 ui-monospace, monospace; }
    .online-session__feed-entry strong { color: #eaf5f7; }
    .online-session__feed-entry[data-kind='playerKilled'] { border-left-color: #ff6870; background: #190d10; }
    .online-session__feed-entry[data-kind='damageApplied'] { border-left-color: #ffd166; }
    .online-session__feed-empty { color: #5c6b74; font: 750 9px/1.5 ui-monospace, monospace; text-transform: uppercase; }
    .online-session__limitation { margin: 12px 0 0; color: #9c8655; font: 700 9px/1.5 ui-monospace, monospace; }
    .online-session__feedback-vfx { position: absolute; inset: 12px; display: grid; place-items: center; overflow: hidden; pointer-events: none; }
    .online-session__feedback-glyph { --feedback-color: #fff; width: 76px; height: 76px; opacity: 0; color: var(--feedback-color); filter: drop-shadow(0 0 14px var(--feedback-color)); transform: scale(.72); }
    .online-session__feedback-glyph::before, .online-session__feedback-glyph::after { position: absolute; inset: 35px 5px auto; height: 5px; background: currentColor; content: ''; transform: rotate(45deg); }
    .online-session__feedback-glyph::after { transform: rotate(-45deg); }
    .online-session__feedback-glyph[data-cue='body'] { --feedback-color: #fff3b2; }
    .online-session__feedback-glyph[data-cue='shield'] { --feedback-color: #63e9ff; border: 4px solid currentColor; transform: rotate(45deg) scale(.58); }
    .online-session__feedback-glyph[data-cue='shield']::before, .online-session__feedback-glyph[data-cue='shield']::after { display: none; }
    .online-session__feedback-glyph[data-cue='kill'] { --feedback-color: #ff5268; width: 104px; height: 104px; }
    .online-session__feedback-glyph[data-cue='teleport'], .online-session__feedback-glyph[data-cue='teleport_rejected'] { --feedback-color: #c889ff; border: 5px solid currentColor; border-radius: 50%; }
    .online-session__feedback-glyph[data-cue='teleport']::before { inset: 10px 32px; width: 5px; height: 48px; transform: none; }
    .online-session__feedback-glyph[data-cue='teleport']::after { display: none; }
    .online-session__feedback-glyph[data-cue='teleport_rejected'] { --feedback-color: #ff7767; }
    .online-session__feedback-glyph[data-active='true'] { animation: online-feedback-pop 420ms cubic-bezier(.16,.78,.2,1); }
    .online-session__feedback-hud { position: absolute; left: 50%; bottom: 30px; min-width: 190px; max-width: calc(100% - 48px); padding: 9px 13px; border: 1px solid #3a4c55; background: rgba(4, 9, 12, .88); color: #eaf7fa; opacity: 0; text-align: center; font: 900 9px/1.3 ui-monospace, monospace; letter-spacing: .11em; text-transform: uppercase; transform: translate(-50%, 8px); pointer-events: none; }
    .online-session__feedback-hud[data-active='true'] { opacity: 1; transform: translate(-50%, 0); transition: opacity 80ms linear, transform 120ms ease-out; }
    .online-session__feedback-proof { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; margin-top: 12px; padding: 10px 11px; border: 1px solid #26343b; background: #070c10; }
    .online-session__feedback-proof span { color: #60717b; font: 800 8px/1.35 ui-monospace, monospace; letter-spacing: .1em; text-transform: uppercase; }
    .online-session__feedback-proof strong { color: #9feeff; font: 900 9px/1.35 ui-monospace, monospace; text-transform: uppercase; }
    @keyframes online-feedback-pop { 0% { opacity: 0; transform: scale(.58); } 22% { opacity: 1; transform: scale(1.12); } 70% { opacity: .92; transform: scale(1); } 100% { opacity: 0; transform: scale(.9); } }
    @media (prefers-reduced-motion: reduce) { .online-session__feedback-glyph[data-active='true'] { animation: online-feedback-fade 260ms linear; } .online-session__feedback-hud[data-active='true'] { transform: translate(-50%, 0); transition: opacity 60ms linear; } }
    @keyframes online-feedback-fade { 0%, 70% { opacity: .92; transform: none; } 100% { opacity: 0; transform: none; } }
    @media (max-width: 1020px) { .online-preview__lobby, .online-session__grid { grid-template-columns: 1fr; } .online-session__facts { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 700px) { .online-preview__bar-meta > span:not(.online-preview__status-dot) { display: none; } .online-preview__content { width: min(100% - 24px, 1420px); padding-top: 30px; } .online-preview__lobby { grid-template-columns: 1fr; } .online-preview__join-row { grid-template-columns: 1fr; } .online-session__head { grid-template-columns: 1fr; } .online-session__room { text-align: left; } .online-session__facts { grid-template-columns: 1fr 1fr; } .online-session__combat-strip { grid-template-columns: 1fr; } .online-session__combat-player:last-child { text-align: left; } .online-session__combat-player:last-child .online-session__combat-name { flex-direction: row; } }
  `;
  return style;
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
    element('span', 'online-preview__status-dot', 'Pre-release online'),
    element('span', '', 'Local guest identity'),
  );
  const back = element('a', 'online-preview__back', '← OFFLINE PRACTICE');
  back.href = '/';
  meta.append(back);
  bar.append(brand, meta);
  const content = element('div', 'online-preview__content');
  root.append(bar, content);
  return { root, content };
}

function appendScopeNotice(parent: HTMLElement, inkfallRevision2 = false): void {
  const notice = element('div', 'online-preview__scope');
  notice.append(
    element('strong', '', 'Current scope'),
    element(
      'span',
      '',
      inkfallRevision2
        ? 'Explicit Inkfall Foundry @2 integration preview: movement, rifle hitscan occlusion, grenade collision and radial occlusion use the hash-locked P5.10 Rapier fixture. Final-map traversal, final visuals, matchmaking, progression, and release readiness remain open; G4 and G5 are not claimed.'
        : 'Authoritative revision-3 combat preview: movement, rifle, health, team score, feed, respawn, grenade state, remote interpolation, and secure resume. Matchmaking, progression, real-map grenade collision, and release readiness are not included yet.',
    ),
  );
  parent.append(notice);
}

function renderNotice(
  content: HTMLElement,
  title: string,
  copy: string,
  actionLabel = 'BACK TO ONLINE LOBBY',
  actionPath: string = ONLINE_AUTHORITY_PATH,
): void {
  content.replaceChildren(
    element('p', 'online-preview__eyebrow', 'KYX.IO / NETWORK PREVIEW'),
    element('h1', 'online-preview__title', 'Online authority, visibly in progress.'),
  );
  appendScopeNotice(content);
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
    element('p', 'online-preview__eyebrow', 'KYX.IO / NETWORK PREVIEW'),
    element('h1', 'online-preview__title', 'A real room. Server-owned combat.'),
    element(
      'p',
      'online-preview__intro',
      'Create a room or join a friend using the local guest name already stored on this device. The server owns movement, weapons, health, score, feed, respawn, and room state; no password or account data is collected by this preview.',
    ),
  );
  appendScopeNotice(content);

  const configured = availability.kind === 'configured';
  const profileOption = element('label', 'online-preview__profile-option');
  const profileCheckbox = document.createElement('input');
  profileCheckbox.type = 'checkbox';
  profileCheckbox.checked = selectedProfile === ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID;
  profileCheckbox.disabled = !configured;
  profileCheckbox.dataset.testid = 'online-inkfall-profile';
  const profileCopy = element('span', '');
  profileCopy.append(
    element('strong', '', 'Opt in · Inkfall Foundry @2 real collision integration'),
    element(
      'span',
      '',
      `Sends and verifies ${ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID}. This is an integration preview, not an accepted final-map or release-readiness claim.`,
    ),
  );
  profileOption.append(profileCheckbox, profileCopy);
  content.append(profileOption);
  const chosenProfile = (): OnlineAuthorityProfileSelection | undefined => (
    profileCheckbox.checked ? ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID : undefined
  );
  const lobby = element('section', 'online-preview__lobby');
  const createCard = element('article', 'online-preview__lobby-card');
  createCard.append(
    element('span', 'online-preview__card-number', '01 / HOST'),
    element('h2', 'online-preview__card-title', 'Create authority room'),
    element(
      'p',
      'online-preview__card-copy',
      'Ask the configured authority to create a new room, then share its short room code with a second browser.',
    ),
  );
  const createButton = element('button', 'online-preview__primary', 'CREATE COMBAT ROOM');
  createButton.type = 'button';
  createButton.disabled = !configured;
  createButton.dataset.testid = 'online-create-room';
  createButton.addEventListener('click', () => window.location.assign(onlineCreatePath(chosenProfile())));
  createCard.append(createButton);

  const joinCard = element('article', 'online-preview__lobby-card');
  joinCard.append(
    element('span', 'online-preview__card-number', '02 / JOIN'),
    element('h2', 'online-preview__card-title', 'Join with a room code'),
    element(
      'p',
      'online-preview__card-copy',
      'Enter a KYX room code from another player. Your existing local guest name is sent only as the room display name.',
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
  const joinButton = element('button', 'online-preview__secondary', 'JOIN ROOM');
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
    endpoint.textContent = `Authority configured: ${new URL(availability.origin).host} · guest ${protocolDisplayName(UserAccount.getDisplayName())}`;
  } else if (availability.kind === 'invalid') {
    endpoint.textContent = `Online disabled: ${availability.reason}`;
  } else {
    endpoint.textContent = 'Online disabled in this build: no VITE_KYX_AUTHORITY_ORIGIN is configured.';
  }
  content.append(endpoint);
}

function expectedIdentity(
  world: RapierMovementWorld,
  mapId: 'phase4_flat_run' | 'inkfall_foundry' = 'phase4_flat_run',
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
    } else if (event.kind === 'shotAccepted') {
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
        : `${player.healthPoints} HP · ${player.magazineRounds}`;
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
      kind: 'inkfall_revision_2';
      proof: OnlineInkfallRevision2RoomProof;
    }>;

async function mountSession(
  body: HTMLBodyElement,
  content: HTMLElement,
  authorityOrigin: string,
  roomCode: string,
  mode: AuthorityEvidenceConfig['mode'],
  sessionBinding: OnlineSessionBinding,
): Promise<void> {
  const displayName = protocolDisplayName(UserAccount.getDisplayName());
  const inkfallProof = sessionBinding.kind === 'inkfall_revision_2'
    ? sessionBinding.proof
    : null;
  const inkfallRevision2 = inkfallProof !== null;
  const world = inkfallProof !== null
    ? await createOnlineInkfallRevision2World(inkfallProof.mapBinding)
    : await createRapierMovementWorld(getPhysicsFixture('flat_run'));
  const identity = expectedIdentity(world, inkfallRevision2 ? 'inkfall_foundry' : 'phase4_flat_run');
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
      inkfallRevision2
        ? 'AUTHORITATIVE COMBAT ROOM / INKFALL FOUNDRY @2'
        : 'AUTHORITATIVE COMBAT ROOM',
    ),
    element(
      'h1',
      '',
      inkfallRevision2 ? 'Fight in Inkfall. Resolve on the server.' : 'Fight locally. Resolve on the server.',
    ),
    element(
      'p',
      '',
      inkfallRevision2
        ? 'Use W, A, S, and D to move, Q and E to turn, Space to fire, R to reload, G to throw the Impulse Grenade, and T to teleport. The authority uses the locked Inkfall @2 Rapier world for movement, hitscan occlusion, grenade collision, health, score, death, and respawn.'
        : 'Use W, A, S, and D to move, Q and E to turn, Space to fire, R to reload, G to throw the Impulse Grenade, and T to teleport. Health, ammo, score, feed, death, respawn, teleport, and resume state come from the authority.',
    ),
  );
  const room = element('div', 'online-session__room');
  room.append(
    element('span', 'online-session__room-label', 'Room code'),
    element('strong', 'online-session__room-code', roomCode),
  );
  head.append(title, room);

  const profileBanner = inkfallRevision2 ? element('section', 'online-session__profile') : null;
  if (profileBanner !== null && inkfallProof !== null) {
    profileBanner.dataset.testid = 'online-profile-binding';
    profileBanner.append(
      element('strong', '', 'Opt-in profile verified'),
      element(
        'code',
        '',
        `${inkfallProof.roomProfile} · ${inkfallProof.mapBinding.mapReference} · ${inkfallProof.mapBinding.fixtureId} / ${inkfallProof.mapBinding.fixtureHash} · ${inkfallProof.mapBinding.colliderCardinality} colliders`,
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
    inkfallRevision2 ? 'Live Inkfall Foundry @2 authority plane' : 'Live authority combat plane',
  );
  arenaHead.append(element('span', '', 'WASD · Q/E turn · SPACE fire · R reload · G grenade · T teleport'));
  const canvasWrap = element('div', 'online-session__canvas-wrap');
  const canvas = element('canvas', 'online-session__canvas');
  canvas.width = 960;
  canvas.height = 640;
  canvas.dataset.testid = 'online-arena';
  canvas.setAttribute('aria-label', 'Online authoritative combat arena');
  const feedbackVfx = element('div', 'online-session__feedback-vfx');
  feedbackVfx.setAttribute('aria-hidden', 'true');
  const feedbackGlyph = element('div', 'online-session__feedback-glyph');
  feedbackGlyph.dataset.testid = 'online-confirmed-vfx';
  feedbackVfx.append(feedbackGlyph);
  const feedbackHud = element('div', 'online-session__feedback-hud');
  feedbackHud.dataset.testid = 'online-confirmed-hud';
  feedbackHud.setAttribute('role', 'status');
  feedbackHud.setAttribute('aria-live', 'polite');
  canvasWrap.append(canvas, feedbackVfx, feedbackHud);
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
      inkfallRevision2 ? ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID : undefined,
    ),
    window.location.origin,
  ).toString();
  const invite = element('code', 'online-session__invite', inviteUrl);
  invite.dataset.testid = 'online-invite';
  const actions = element('div', 'online-session__actions');
  const copyButton = element('button', 'online-preview__primary', 'COPY INVITE LINK');
  copyButton.type = 'button';
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      copyButton.textContent = 'INVITE COPIED';
    } catch {
      copyButton.textContent = 'COPY UNAVAILABLE — SELECT LINK';
    }
  });
  const resumeButton = element('button', 'online-preview__secondary', 'DISCONNECT + RESUME');
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
  const localHealth = metric('Health / life');
  const localAmmo = metric('Rifle ammo');
  const localRifle = metric('Rifle state');
  const localGrenade = metric('Grenade state');
  localHealth.value.dataset.testid = 'online-local-health';
  localAmmo.value.dataset.testid = 'online-local-ammo';
  localRifle.value.dataset.testid = 'online-local-rifle';
  localGrenade.value.dataset.testid = 'online-local-grenade';
  for (const item of [localHealth, localAmmo, localRifle, localGrenade]) {
    item.root.className = 'online-session__combat-stat';
    combatStats.append(item.root);
  }
  const controls = element('div', 'online-session__controls');
  const fireButton = element('button', 'online-session__control', 'HOLD FIRE · SPACE');
  fireButton.type = 'button';
  fireButton.dataset.testid = 'online-fire';
  const reloadButton = element('button', 'online-session__control', 'RELOAD · R');
  reloadButton.type = 'button';
  reloadButton.dataset.testid = 'online-reload';
  const grenadeButton = element('button', 'online-session__control', 'GRENADE · G');
  grenadeButton.type = 'button';
  grenadeButton.dataset.testid = 'online-grenade';
  const teleportButton = element('button', 'online-session__control', 'TELEPORT · T');
  teleportButton.type = 'button';
  teleportButton.dataset.testid = 'online-teleport';
  controls.append(fireButton, reloadButton, grenadeButton, teleportButton);
  const feed = element('div', 'online-session__feed');
  feed.dataset.testid = 'online-killfeed';
  const limitation = element(
    'p',
    'online-session__limitation',
    inkfallRevision2
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
  side.append(playerPanel, combatPanel, metricsPanel);
  grid.append(arenaPanel, side);

  const error = element('pre', 'online-session__error');
  error.setAttribute('role', 'alert');
  error.dataset.testid = 'online-error';
  content.replaceChildren(
    head,
    ...(profileBanner === null ? [] : [profileBanner]),
    facts,
    grid,
    error,
  );
  appendScopeNotice(content, inkfallRevision2);

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
    enableCombatInput: true,
    onChange: () => {
      renderRequested = true;
    },
  });

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
  let presentationFailureDetail: string | null = null;
  let feedbackTimeout = 0;
  let audioContext: AudioContext | null = null;
  const processedPresentationTransportIds = new Set<string>();

  const feedbackCue = (intent: CombatPresentationIntentV1): FeedbackCue => {
    const marker = intent.markers.hud ?? intent.markers.vfx ?? intent.markers.audio;
    if (marker === null) return null;
    if (marker.includes('.snapshot.sync.')) return 'snapshot';
    if (marker.includes('.hit.body.confirmed.')) return 'body';
    if (marker.includes('.hit.shield.confirmed.')) return 'shield';
    if (marker.includes('.hit.kill.confirmed.')) return 'kill';
    if (marker.includes('.teleport.confirmed.')) return 'teleport';
    if (marker.includes('.teleport.rejected.')) return 'teleport_rejected';
    return null;
  };
  const feedbackCopy = (cue: Exclude<FeedbackCue, null>): string => {
    if (cue === 'snapshot') return 'AUTHORITY STATE SYNCHRONIZED';
    if (cue === 'body') return 'BODY HIT · CONFIRMED';
    if (cue === 'shield') return 'SHIELD HIT · CONFIRMED';
    if (cue === 'kill') return 'ELIMINATION · CONFIRMED';
    if (cue === 'teleport') return 'TELEPORT · CONFIRMED';
    return 'TELEPORT · REJECTED';
  };
  const playFeedbackTone = (cue: Exclude<FeedbackCue, 'snapshot' | null>): void => {
    presentationAudioCueAttempts += 1;
    const frequencies: Readonly<Record<Exclude<FeedbackCue, 'snapshot' | null>, number>> = {
      body: 640,
      shield: 920,
      kill: 420,
      teleport: 780,
      teleport_rejected: 180,
    };
    void (async () => {
      audioContext ??= new AudioContext();
      if (audioContext.state === 'suspended') await audioContext.resume();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = cue === 'teleport' ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequencies[cue], audioContext.currentTime);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.045, audioContext.currentTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.13);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.14);
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
      feedbackHud.textContent = feedbackCopy(cue);
      feedbackHud.dataset.cue = cue;
      feedbackHud.dataset.authorityEventId = intent.authorityEventId ?? '';
      feedbackHud.dataset.active = 'true';
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
        playFeedbackTone(cue);
      }
      window.clearTimeout(feedbackTimeout);
      feedbackTimeout = window.setTimeout(() => {
        feedbackHud.dataset.active = 'false';
        feedbackGlyph.dataset.active = 'false';
      }, cue === 'kill' || cue === 'teleport' ? 900 : 620);
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
      localPredictedPosition: diagnostics.local.predictedPosition,
      localAuthoritativePosition: diagnostics.local.authoritativePosition,
      localPredictedYawMilliDegrees: diagnostics.local.predictedYawMilliDegrees,
      localPredictionErrorMillimeters: diagnostics.local.lastPositionErrorMillimeters,
      localPredictionHistoryCommands: diagnostics.local.predictionHistoryCommands,
      remoteEntities,
      remotePositions: Object.freeze(remoteEntities.map(({ position }) => position)),
      lastError: diagnostics.lastError,
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
      }),
      ...(inkfallProof === null
        ? {}
        : {
            roomVerification: Object.freeze({
              roomProfile: inkfallProof.roomProfile,
              mapBinding: inkfallProof.mapBinding,
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

  const pressedKeys = new Set<string>();
  let heldCombatButtons = 0;
  const combatButton = (code: string): number => {
    if (code === 'Space') return INTENT_BUTTON.primaryFire;
    if (code === 'KeyR') return INTENT_BUTTON.reload;
    if (code === 'KeyG') return INTENT_BUTTON.abilityOne;
    if (code === 'KeyT') return INTENT_BUTTON.utility;
    return 0;
  };
  const updateInput = (): void => {
    client.setAxes(axesFromPressedKeys(pressedKeys));
    client.setCombatButtons(heldCombatButtons);
    const lookDirection = Number(pressedKeys.has('KeyE')) - Number(pressedKeys.has('KeyQ'));
    client.setLookDeltas(lookDirection * 1_500);
    fireButton.dataset.active = String((heldCombatButtons & INTENT_BUTTON.primaryFire) !== 0);
    reloadButton.dataset.active = String((heldCombatButtons & INTENT_BUTTON.reload) !== 0);
    grenadeButton.dataset.active = String((heldCombatButtons & INTENT_BUTTON.abilityOne) !== 0);
    teleportButton.dataset.active = String((heldCombatButtons & INTENT_BUTTON.utility) !== 0);
  };
  const keyboardHandler = (event: KeyboardEvent): void => {
    const movementKey = ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code);
    const lookKey = event.code === 'KeyQ' || event.code === 'KeyE';
    const combatMask = combatButton(event.code);
    if (!movementKey && !lookKey && combatMask === 0) return;
    event.preventDefault();
    if (movementKey || lookKey) {
      if (event.type === 'keydown') pressedKeys.add(event.code);
      else pressedKeys.delete(event.code);
    }
    if (combatMask !== 0) {
      if (event.type === 'keydown') heldCombatButtons = (heldCombatButtons | combatMask) >>> 0;
      else heldCombatButtons = (heldCombatButtons & ~combatMask) >>> 0;
    }
    updateInput();
    renderRequested = true;
  };
  const blurHandler = (): void => {
    pressedKeys.clear();
    heldCombatButtons = 0;
    updateInput();
  };
  const holdFire = (): void => {
    heldCombatButtons = (heldCombatButtons | INTENT_BUTTON.primaryFire) >>> 0;
    updateInput();
  };
  const releaseFire = (): void => {
    heldCombatButtons = (heldCombatButtons & ~INTENT_BUTTON.primaryFire) >>> 0;
    updateInput();
  };
  const pulseButton = (button: number): void => {
    heldCombatButtons = (heldCombatButtons | button) >>> 0;
    updateInput();
    window.setTimeout(() => {
      heldCombatButtons = (heldCombatButtons & ~button) >>> 0;
      updateInput();
    }, 90);
  };
  fireButton.addEventListener('pointerdown', holdFire);
  fireButton.addEventListener('pointerup', releaseFire);
  fireButton.addEventListener('pointercancel', releaseFire);
  fireButton.addEventListener('pointerleave', releaseFire);
  reloadButton.addEventListener('click', () => pulseButton(INTENT_BUTTON.reload));
  grenadeButton.addEventListener('click', () => pulseButton(INTENT_BUTTON.abilityOne));
  teleportButton.addEventListener('click', () => pulseButton(INTENT_BUTTON.utility));
  window.addEventListener('keydown', keyboardHandler);
  window.addEventListener('keyup', keyboardHandler);
  window.addEventListener('blur', blurHandler);
  resumeButton.addEventListener('click', () => {
    client.requestResume();
    renderRequested = true;
  });

  let lastDiagnosticsRefresh = -Infinity;
  let animationFrame = 0;
  const render = (nowMilliseconds: number): void => {
    const presentation = client.samplePresentation();
    const diagnostics = client.diagnostics();
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
            if (event.presentation === undefined) continue;
            if (processedPresentationTransportIds.has(event.id)) continue;
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
        error.textContent = presentationFailureDetail;
      }
    }
    renderArena(canvas, presentation, {
      snapshot: diagnostics.combat.snapshot,
      recentEvents: diagnostics.combat.recentEvents,
      localPlayerId: diagnostics.authority.playerId,
    }, inkfallRevision2);
    if (renderRequested || nowMilliseconds - lastDiagnosticsRefresh >= 100) {
      const combat = diagnostics.combat.snapshot;
      const localPlayer = combat?.players.find(({ playerId }) => (
        playerId === diagnostics.authority.playerId
      ));
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
      scoreValue.textContent = `${blueScore} — ${redScore}`;
      scorePhase.textContent = combat === null
        ? 'WAITING FOR COMBAT SNAPSHOT'
        : `${combat.match.phase} · ${combat.match.activeTicksRemaining} TICKS`;
      const applyTeam = (
        player: CombatSnapshotV1['players'][number] | undefined,
        state: HTMLElement,
        health: HTMLElement,
        fill: HTMLElement,
        label: string,
      ): void => {
        const local = player?.playerId === diagnostics.authority.playerId;
        state.textContent = `${label} · ${local ? 'YOU' : player === undefined ? 'WAITING' : 'PEER'} · ${player?.lifePhase ?? '—'}`;
        health.textContent = `${player?.healthPoints ?? '—'} HP`;
        fill.style.transform = `scaleX(${Math.max(0, Math.min(100, player?.healthPoints ?? 0)) / 100})`;
      };
      applyTeam(bluePlayer, blueState, blueHealthText, blueHealthFill, 'BLUE');
      applyTeam(redPlayer, redState, redHealthText, redHealthFill, 'RED');
      localHealth.value.textContent = localPlayer === undefined
        ? 'WAITING'
        : localPlayer.lifePhase === 'dead'
          ? `DEAD · ${Math.max(0, (localPlayer.respawnEligibleAtTick ?? 0) - diagnostics.authority.serverTick)}T`
          : `${localPlayer.healthPoints} HP · ALIVE`;
      localAmmo.value.textContent = localPlayer === undefined
        ? '—'
        : `${localPlayer.magazineRounds} / ${localPlayer.reserveRounds}`;
      localRifle.value.textContent = localPlayer?.riflePhase ?? 'WAITING';
      localGrenade.value.textContent = localPlayer === undefined
        ? 'WAITING'
        : `${localPlayer.grenadePhase} · ${localPlayer.activeProjectileCount} ACTIVE`;
      const playerLabel = (playerId: string | null): string => {
        if (playerId === null) return 'AUTHORITY';
        if (playerId === diagnostics.authority.playerId) return 'YOU';
        return `PEER ${playerId.slice(-6)}`;
      };
      const feedEntries = diagnostics.combat.recentEvents.slice(-7).reverse().map((event) => {
        const entry = element('div', 'online-session__feed-entry');
        entry.dataset.kind = event.kind;
        const tick = element('span', '', `T${event.serverTick}`);
        const description = element('span', '');
        const actor = playerLabel(event.actorId);
        const target = playerLabel(event.targetId);
        const copy = event.kind === 'damageApplied'
          ? `${actor} hit ${target} for ${event.amountHealthPoints ?? 0}`
          : event.kind === 'playerKilled'
            ? `${actor} eliminated ${target}`
            : event.kind === 'shotAccepted'
              ? `${actor} fired an accepted rifle shot`
              : event.kind === 'projectileSpawned'
                ? `${actor} deployed an Impulse Grenade`
                : event.kind === 'abilityActivated'
                  ? `${actor} ability confirmed`
                  : `${actor} · ${event.kind}`;
        description.append(element('strong', '', copy));
        entry.append(tick, description);
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
      error.textContent = presentationFailureDetail ?? diagnostics.lastError ?? '';
      body.dataset.onlinePreviewStatus = diagnostics.connection.phase;
      body.dataset.onlineCombatPhase = combat?.match.phase ?? 'waiting';
      body.dataset.onlineLocalLife = localPlayer?.lifePhase ?? 'waiting';
      body.dataset.onlineCombatFeedSequence = String(combat?.match.feedSequence ?? 0);
      body.dataset.onlineRoomProfile = inkfallProof?.roomProfile ?? 'p58d-rev3-combat-v1';
      body.dataset.onlineMapReference = inkfallProof?.mapBinding.mapReference ?? 'phase4_flat_run';
      body.dataset.onlineFixtureHash = identity.fixtureHash;
      body.dataset.onlinePresentationStatus = presentationStatus;
      body.dataset.onlinePresentationLastCue = presentationLastCue ?? 'none';
      body.dataset.onlinePresentationConfirmed = String(presentationConfirmedIntentCount);
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
    window.removeEventListener('blur', blurHandler);
    window.clearTimeout(feedbackTimeout);
    if (audioContext !== null) void audioContext.close();
    client.dispose();
    world.dispose();
    delete (window as { __KYX_ONLINE_PREVIEW__?: unknown }).__KYX_ONLINE_PREVIEW__;
  }, { once: true });
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
  body.replaceChildren(onlineStyles(), root);
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

  const requestedProfile = 'profile' in request ? request.profile : undefined;
  let roomCode: string;
  let mode: AuthorityEvidenceConfig['mode'];
  let sessionBinding: OnlineSessionBinding;
  if (request.kind === 'create') {
    body.dataset.onlinePreviewStatus = 'creating-room';
    renderNotice(
      content,
      'Creating an authority room…',
      'The configured server is allocating a fresh room. This normally takes only a moment.',
      'CANCEL',
    );
    try {
      if (requestedProfile === ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID) {
        const proof = await createOnlineInkfallRevision2CombatRoom(availability.origin);
        roomCode = proof.roomCode;
        sessionBinding = Object.freeze({ kind: 'inkfall_revision_2', proof });
      } else {
        roomCode = await createOnlineCombatRoom(availability.origin);
        sessionBinding = Object.freeze({ kind: 'flat_run_revision_3' });
      }
    } catch (cause) {
      body.dataset.onlinePreviewStatus = 'create-failed';
      renderNotice(
        content,
        'Room creation failed.',
        cause instanceof Error ? cause.message : String(cause),
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
    if (requestedProfile === ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID) {
      body.dataset.onlinePreviewStatus = 'verifying-room-profile';
      renderNotice(
        content,
        'Verifying Inkfall Foundry @2 room…',
        'The profile and complete locked map binding must match before the socket can open.',
        'CANCEL',
      );
      try {
        const proof = await verifyOnlineInkfallRevision2CombatRoom(
          availability.origin,
          roomCode,
        );
        sessionBinding = Object.freeze({ kind: 'inkfall_revision_2', proof });
      } catch (cause) {
        body.dataset.onlinePreviewStatus = 'room-profile-mismatch';
        renderNotice(
          content,
          'Inkfall room verification failed.',
          cause instanceof Error ? cause.message : String(cause),
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
    await mountSession(
      body,
      content,
      availability.origin,
      roomCode,
      mode,
      sessionBinding,
    );
  } catch (cause) {
    body.dataset.onlinePreviewStatus = 'client-world-mismatch';
    renderNotice(
      content,
      'Online client initialization failed.',
      cause instanceof Error ? cause.message : String(cause),
    );
  }
}
