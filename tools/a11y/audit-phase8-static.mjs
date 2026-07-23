import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const strict = process.argv.includes('--strict');
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--strict');
if (unknownArguments.length > 0) {
  throw new Error(`Unknown Phase 8 audit argument: ${unknownArguments.join(', ')}`);
}

const SOURCE_PATHS = Object.freeze({
  markup: 'index.html',
  main: 'src/main.js',
  game: 'src/core/Game.js',
  gameSettings: 'src/core/GameSettings.js',
  input: 'src/core/InputManager.js',
  menu: 'src/ui/MainMenu.js',
  hud: 'src/ui/HUD.js',
  captionOverlay: 'src/ui/CaptionCueOverlay.js',
  damageDirection: 'src/ui/DamageDirection.js',
  audio: 'src/core/AudioManager.js',
  bot: 'src/entities/Bot.js',
  zombie: 'src/entities/Zombie.js',
  pickup: 'src/world/PickupSystem.js',
  style: 'src/style.css',
  pointerLock: 'src/app/movement/pointerLock.ts',
  cameraSettings: 'src/app/movement/cameraSettings.ts',
  matrix: 'tests/accessibility/PHASE8_AUDIT_MATRIX.md',
});

const sources = Object.create(null);
for (const [key, relativePath] of Object.entries(SOURCE_PATHS)) {
  sources[key] = await readFile(resolve(ROOT, relativePath), 'utf8');
}

function lineEvidence(sourceKey, pattern) {
  const relativePath = SOURCE_PATHS[sourceKey];
  const expression = new RegExp(pattern.source, pattern.flags.replaceAll('g', ''));
  const lines = sources[sourceKey].split(/\r?\n/u);
  const matchesAt = [];
  for (let index = 0; index < lines.length; index += 1) {
    expression.lastIndex = 0;
    if (expression.test(lines[index])) matchesAt.push(`${relativePath}:${index + 1}`);
  }
  return matchesAt.slice(0, 8);
}

function check(id, area, status, summary, evidence = []) {
  return Object.freeze({ id, area, status, summary, evidence: Object.freeze(evidence) });
}

const hasSemanticButtons = (sources.markup.match(/<button\b/gu) ?? []).length >= 8;
const canvasIsFocusable = /<canvas[\s\S]*?id=["']game-canvas["'][\s\S]*?tabindex=["']0["']/u
  .test(sources.markup);
const globalTabSuppression = /if\s*\(e\.code\s*===\s*['"]Tab['"]\)\s*e\.preventDefault\(\)/u
  .test(sources.input);
const focusVisible = /:focus-visible\b/u.test(sources.style);
const menuMovesFocus = /focusFirst|\.focus(?:\?\.)?\s*\(/u.test(sources.menu);
const menuDeclaresExpandedState = /aria-expanded/u.test(sources.menu);
const pointerLossReleasesInput = /_onPointerLockChange[\s\S]*?_releaseAllHeldInputs\(\)/u
  .test(sources.input)
  && /onLockChange[\s\S]*?_movementDriver\?\.neutralize\(\)/u.test(sources.game);
const rawPointerHelperExists = /unadjustedMovement/u.test(sources.pointerLock)
  && /requestPointerLockWithRawFallback/u.test(sources.pointerLock);
const rawPointerHelperActive = /pointerLockWithRawFallback|requestPointerLockWithRawFallback/u
  .test(sources.input);
const pointerFailureIsSilent = /pending\?\.catch\?\.\(\(\)\s*=>\s*\{\}\)/u.test(sources.input)
  || /catch\s*\{[\s\S]*?capability miss/u.test(sources.input);
const pointerFailureHasActionableUi = /onPointerLockError/u.test(sources.input)
  && /showPointerLockError/u.test(sources.game)
  && /id=["']pause-lock-status["']/u.test(sources.markup);
const reducedMotionContract = /reducedMotion:\s*boolean/u.test(sources.cameraSettings)
  && /applyReducedMotionPreset/u.test(sources.cameraSettings);
const reducedMotionUi = /reduced[ -]?motion/iu.test(sources.markup)
  || /reduced[ -]?motion/iu.test(sources.menu)
  || /reducedMotion/u.test(sources.gameSettings);
const reducedMotionCss = /@media\s*\([^)]*prefers-reduced-motion\s*:\s*reduce/iu
  .test(sources.style);
const reducedFlash = /reduced[ -]?flash|photosensitiv/iu.test(sources.markup)
  || /reduced[ -]?flash|photosensitiv/iu.test(sources.menu);
const highContrast = /high[ -]?contrast|prefers-contrast|forced-colors/iu.test(sources.markup)
  || /high[ -]?contrast|prefers-contrast|forced-colors/iu.test(sources.style);
const numericHealthAndAmmo = /id=["']health-text["']/u.test(sources.markup)
  && /id=["']ammo-text["']/u.test(sources.markup);
const colorStateClasses = /classList\.toggle\(['"](?:active|ready|stamina-low|grenade-empty)/u
  .test(`${sources.menu}\n${sources.hud}`);
const emojiOrSymbolIcons = /[\u{1F300}-\u{1FAFF}]|&hearts;|🔥|🎯/u
  .test(`${sources.markup}\n${sources.hud}`);
const hudScale = /hud[ -]?scale|text[ -]?scale|--(?:kx-)?hud-scale/iu.test(sources.markup)
  || /hud[ -]?scale|text[ -]?scale|--(?:kx-)?hud-scale/iu.test(sources.style)
  || /hudScale|textScale/u.test(sources.gameSettings);
const responsiveShell = /width:\s*min\(/u.test(sources.style)
  && /@media\s*\(/u.test(sources.style);
const captions = /subtitles:\s*true/u.test(sources.gameSettings)
  && /id=["']caption-region["']/u.test(sources.markup)
  && /showSubtitle\s*\(/u.test(sources.captionOverlay)
  && /onSubtitle/u.test(sources.audio)
  && /onSubtitle[\s\S]*?showSubtitle/u.test(sources.game);
const criticalAudioIndicators = /visualAudioCues:\s*false/u.test(sources.gameSettings)
  && /id=["']audio-cue-region["']/u.test(sources.markup)
  && /showAudioCue\s*\(/u.test(sources.captionOverlay)
  && /onCriticalCue/u.test(sources.audio)
  && /_emitCriticalCue\s*\(/u.test(sources.audio)
  && /onCriticalCue[\s\S]*?showAudioCue/u.test(sources.game);
const coreHudIds = [
  'crosshair',
  'health-text',
  'shield-text',
  'weapon-name',
  'ammo-text',
  'score-wrap',
  'dm-timer',
  'ability-q',
];
const presentCoreHudIds = coreHudIds.filter((id) => (
  new RegExp(`id=["']${id}["']`, 'u').test(sources.markup)
));
const completeAbilitySet = /id=["']ability-rack["'][^>]*data-ability-count=["']3["']/u.test(sources.markup)
  && (sources.markup.match(/class=["'][^"']*ability-indicator/gu) ?? []).length >= 3;
const connectionWarning = /id=["']connection-warning["'][^>]*data-condition=["']online-session-only["']/u.test(sources.markup)
  && /setConnectionWarning\s*\(/u.test(sources.hud);
const eventHudIds = ['hitmarker', 'damage-flash', 'killfeed', 'downed-countdown', 'ability-reason'];
const presentEventHudIds = eventHudIds.filter((id) => (
  new RegExp(`id=["']${id}["']`, 'u').test(sources.markup)
));
const damageDirection = /id=["']damage-direction["']/u.test(sources.markup)
  && /classifyDamageDirection\s*\(/u.test(sources.damageDirection)
  && /classifyDamageDirection\(sourcePosition/u.test(sources.game)
  && /onAttack\([^,]+,\s*this\.position\)/u.test(sources.bot)
  && /onAttack\([^,]+,\s*this\.position\)/u.test(sources.zombie);
const interactionPrompt = /id=["']interaction-prompt["']/u.test(sources.markup)
  && /showInteractionPrompt\s*\(/u.test(sources.hud)
  && /hideInteractionPrompt\s*\(/u.test(sources.hud);
const pickupFeedback = /addKillFeed\s*\(/u.test(sources.pickup);
const abilityUnavailableReason = /id=["']ability-reason["']/u.test(sources.markup)
  && /showAbilityUnavailable\s*\(/u.test(sources.hud)
  && /showAbilityUnavailable\s*\(/u.test(sources.game);
const developmentDiagnosticsAreGated = /import\.meta\.env\.DEV/u.test(sources.main)
  && /id=["']dev-build-diagnostics["']/u.test(sources.markup);
const liveRegions = (sources.markup.match(/aria-live=/gu) ?? []).length;
const hudUpdateStart = sources.hud.indexOf('  update(player, weaponInfo, kills, score)');
const hudUpdateEnd = sources.hud.indexOf('\n  updateGrenades', hudUpdateStart);
const hudUpdateBody = hudUpdateStart >= 0 && hudUpdateEnd > hudUpdateStart
  ? sources.hud.slice(hudUpdateStart, hudUpdateEnd)
  : '';
const hotHudAvoidsTreeRebuild = hudUpdateBody.length > 0
  && !/replaceChildren|appendChild|createElement/u.test(hudUpdateBody);
const stableIds = coreHudIds.every((id) => new RegExp(`id=["']${id}["']`, 'u').test(sources.markup));
const explicitA11yContracts = /data-(?:kyx-)?a11y|data-hud-contract/u.test(sources.markup);
const evidenceMatrixComplete = [
  '1280x720',
  '1920x1080',
  '2560x1440',
  '3440x1440',
  '200%',
  'keyboard-only',
  'pointer-lock',
  'grayscale',
  'five-second',
].every((needle) => sources.matrix.toLowerCase().includes(needle.toLowerCase()));

const checks = Object.freeze([
  check(
    'P8-KBM-SEMANTICS',
    'desktop-kbm',
    hasSemanticButtons && canvasIsFocusable ? 'pass' : 'fail',
    'The shell exposes native controls and a named, focusable game canvas.',
    [...lineEvidence('markup', /id=["']game-canvas["']/u), ...lineEvidence('markup', /<button\b/u)],
  ),
  check(
    'P8-KBM-TAB-SCOPE',
    'desktop-kbm',
    globalTabSuppression ? 'fail' : 'pass',
    globalTabSuppression
      ? 'Tab is prevented globally, so menu focus cannot advance while InputManager is active.'
      : 'Tab interception is scoped away from menu navigation.',
    lineEvidence('input', /e\.code\s*===\s*['"]Tab['"]/u),
  ),
  check(
    'P8-KBM-FOCUS-VISIBLE',
    'desktop-kbm',
    focusVisible ? 'pass' : 'fail',
    focusVisible
      ? 'A focus-visible treatment exists.'
      : 'No focus-visible contract exists in the stylesheet.',
    lineEvidence('style', /:focus|outline:\s*none/u),
  ),
  check(
    'P8-KBM-FOCUS-MANAGEMENT',
    'desktop-kbm',
    menuMovesFocus && menuDeclaresExpandedState ? 'pass' : 'fail',
    menuMovesFocus && menuDeclaresExpandedState
      ? 'Panel and dialog transitions move focus, restore panel triggers, and expose expanded state.'
      : 'Panels and modal transitions must move/restore focus and expose expanded state.',
    [...lineEvidence('menu', /_togglePanel|showPause/u), ...lineEvidence('markup', /aria-modal/u)],
  ),
  check(
    'P8-LOCK-NEUTRALIZE',
    'pointer-lock',
    pointerLossReleasesInput ? 'pass' : 'fail',
    'Pointer-lock loss releases held input and neutralizes the deterministic movement driver.',
    [...lineEvidence('input', /_onPointerLockChange/u), ...lineEvidence('game', /neutralize\(\)/u)],
  ),
  check(
    'P8-LOCK-RAW-FALLBACK',
    'pointer-lock',
    rawPointerHelperExists && rawPointerHelperActive ? 'pass' : rawPointerHelperExists ? 'partial' : 'fail',
    rawPointerHelperExists && rawPointerHelperActive
      ? 'The active input path requests unadjusted movement and retries standard pointer lock.'
      : rawPointerHelperExists && !rawPointerHelperActive
      ? 'A tested raw-pointer fallback helper exists, but the active legacy InputManager does not use it.'
      : 'Raw/unadjusted pointer lock must have a supported fallback.',
    [...lineEvidence('pointerLock', /unadjustedMovement|requestPointerLockWithRawFallback/u), ...lineEvidence('input', /requestPointerLock/u)],
  ),
  check(
    'P8-LOCK-DENIAL-UI',
    'pointer-lock',
    pointerFailureIsSilent ? 'fail' : pointerFailureHasActionableUi ? 'pass' : 'partial',
    pointerFailureHasActionableUi
      ? 'Pointer-lock rejection reopens the keyboard-reachable pause dialog with retry guidance.'
      : 'Pointer-lock rejection must produce an actionable player-visible fallback instead of being swallowed.',
    [...lineEvidence('input', /onPointerLockError|requestPointerLock/u), ...lineEvidence('markup', /pause-lock-status/u)],
  ),
  check(
    'P8-MOTION-CONTRACT',
    'reduced-motion',
    reducedMotionContract && reducedMotionUi ? 'pass' : reducedMotionContract ? 'partial' : 'fail',
    reducedMotionContract && reducedMotionUi
      ? 'Reduced motion is a validated product setting with an authority-isolated camera contract.'
      : reducedMotionContract && !reducedMotionUi
      ? 'The typed camera preset exists and is tested, but no product setting exposes it.'
      : 'Reduced motion must be a validated product setting.',
    [...lineEvidence('cameraSettings', /reducedMotion|applyReducedMotionPreset/u), ...lineEvidence('markup', /reduced[ -]?motion/iu)],
  ),
  check(
    'P8-MOTION-CSS',
    'reduced-motion',
    reducedMotionCss ? 'pass' : 'fail',
    'Nonessential CSS animation and transitions must honor prefers-reduced-motion.',
    lineEvidence('style', /@media|animation:/u),
  ),
  check(
    'P8-FLASH-REDUCTION',
    'reduced-motion',
    reducedFlash ? 'pass' : 'fail',
    reducedFlash
      ? 'A persisted reduced-flash setting suppresses full-screen damage and teleport flashes.'
      : 'A reduced-flash/photosensitivity setting and effect policy are required.',
    [...lineEvidence('hud', /flashDamage|flashTeleport|flashHitmarker/u), ...lineEvidence('style', /animation:/u)],
  ),
  check(
    'P8-CONTRAST-MODE',
    'contrast-color',
    highContrast ? 'pass' : 'fail',
    highContrast
      ? 'A persisted high-contrast product mode is represented; forced-colors runtime proof remains separate.'
      : 'High-contrast and forced-colors behavior are not represented in the active UI contract.',
    [...lineEvidence('markup', /contrast/iu), ...lineEvidence('style', /forced-colors|prefers-contrast/iu)],
  ),
  check(
    'P8-COLOR-INDEPENDENCE',
    'contrast-color',
    numericHealthAndAmmo && !colorStateClasses && !emojiOrSymbolIcons ? 'pass' : 'partial',
    numericHealthAndAmmo && !emojiOrSymbolIcons
      ? 'Vital values and LOW/CRITICAL warnings use text and patterns; the wider active/ready state inventory remains open.'
      : 'Core values have text, but some critical states or placeholder symbol/emoji icons remain visually dependent.',
    [...lineEvidence('markup', /health-text|ammo-text|&hearts;/u), ...lineEvidence('hud', /classList\.toggle|🔥|🎯/u)],
  ),
  check(
    'P8-SCALE-HUD',
    'scaling',
    hudScale ? 'pass' : 'fail',
    hudScale
      ? 'Bounded HUD and crosshair scale settings publish shared presentation tokens.'
      : 'No text/HUD scale setting or shared scale token exists.',
    [...lineEvidence('markup', /scale/iu), ...lineEvidence('style', /scale/iu)],
  ),
  check(
    'P8-SCALE-RESPONSIVE',
    'scaling',
    responsiveShell ? 'partial' : 'fail',
    'Some responsive sizing exists, but 720p, 1440p, ultrawide, and 125%/200% zoom remain unproved.',
    lineEvidence('style', /width:\s*min\(|@media\s*\(/u),
  ),
  check(
    'P8-CAPTIONS-HOOK',
    'captions-audio',
    captions ? 'pass' : 'fail',
    captions
      ? 'Subtitle preference, live region, semantic speaker/direction renderer, and audio dialogue hook are wired.'
      : 'A subtitle setting, live region, semantic renderer, or event hook is missing.',
    [
      ...lineEvidence('markup', /subtitles?|caption-region/iu),
      ...lineEvidence('captionOverlay', /showSubtitle|caption-speaker|caption-direction/u),
      ...lineEvidence('audio', /onSubtitle|emitSubtitle/u),
    ],
  ),
  check(
    'P8-AUDIO-CUE-HOOK',
    'captions-audio',
    criticalAudioIndicators ? 'pass' : 'fail',
    criticalAudioIndicators
      ? 'Optional, rate-limited visual alternatives are wired to critical gameplay sounds without fabricated exact positions.'
      : 'A visual-cue preference, live region, bounded renderer, or gameplay-audio hook is missing.',
    [
      ...lineEvidence('markup', /audio-cue-region|sound indicators/iu),
      ...lineEvidence('captionOverlay', /showAudioCue|rate|direction/u),
      ...lineEvidence('audio', /onCriticalCue|_emitCriticalCue/u),
    ],
  ),
  check(
    'P8-HUD-CORE-HIERARCHY',
    'hud-hierarchy',
    presentCoreHudIds.length === coreHudIds.length && completeAbilitySet && connectionWarning
      ? 'pass'
      : 'partial',
    presentCoreHudIds.length === coreHudIds.length && completeAbilitySet && connectionWarning
      ? `Core HUD hooks present: ${presentCoreHudIds.length}/${coreHudIds.length}; three real abilities and a dormant online-only connection warning are defined.`
      : `Core HUD hooks present: ${presentCoreHudIds.length}/${coreHudIds.length}; ability set or conditional connection warning is incomplete.`,
    [
      ...presentCoreHudIds.flatMap((id) => lineEvidence('markup', new RegExp(`id=["']${id}["']`, 'u'))),
      ...lineEvidence('markup', /ability-rack|connection-warning/u),
      ...lineEvidence('hud', /setConnectionWarning|updateGrenades|updateTeleport/u),
    ],
  ),
  check(
    'P8-HUD-EVENT-HIERARCHY',
    'hud-hierarchy',
    presentEventHudIds.length === eventHudIds.length
      && damageDirection
      && interactionPrompt
      && pickupFeedback
      && abilityUnavailableReason
      ? 'pass'
      : 'partial',
    presentEventHudIds.length === eventHudIds.length
      && damageDirection
      && interactionPrompt
      && pickupFeedback
      && abilityUnavailableReason
      ? 'Hit, kill, pickup, unavailable-reason, respawn, and interaction hooks exist; damage direction is derived from real attacker positions.'
      : 'One or more event HUD hooks or a truthful attacker-position source remains incomplete.',
    [
      ...presentEventHudIds.flatMap((id) => lineEvidence('markup', new RegExp(`id=["']${id}["']`, 'u'))),
      ...lineEvidence('damageDirection', /classifyDamageDirection/u),
      ...lineEvidence('game', /sourcePosition|showAbilityUnavailable/u),
      ...lineEvidence('hud', /showDamageDirection|showInteractionPrompt/u),
      ...lineEvidence('pickup', /addKillFeed/u),
    ],
  ),
  check(
    'P8-HUD-LIVE-REGIONS',
    'hud-hierarchy',
    liveRegions >= 4 ? 'pass' : 'partial',
    `${liveRegions} live regions exist; critical status announcement policy still needs a deliberate contract.`,
    lineEvidence('markup', /aria-live=/u),
  ),
  check(
    'P8-DEV-OVERLAY-BOUNDARY',
    'hud-hierarchy',
    developmentDiagnosticsAreGated ? 'pass' : 'fail',
    'Development diagnostics remain gated from the default player surface.',
    [...lineEvidence('main', /import\.meta\.env\.DEV/u), ...lineEvidence('markup', /dev-build-diagnostics/u)],
  ),
  check(
    'P8-PERF-HUD-DOM',
    'performance',
    hotHudAvoidsTreeRebuild ? 'pass' : 'fail',
    'The hot HUD update mutates existing text/style nodes instead of rebuilding the DOM tree.',
    lineEvidence('hud', /update\(player|replaceChildren|createElement/u),
  ),
  check(
    'P8-SELECTOR-CONTRACT',
    'automation',
    stableIds && explicitA11yContracts ? 'pass' : stableIds ? 'partial' : 'fail',
    'Existing IDs are stable, but explicit accessibility/state data contracts have not been introduced.',
    presentCoreHudIds.flatMap((id) => lineEvidence('markup', new RegExp(`id=["']${id}["']`, 'u'))),
  ),
  check(
    'P8-EVIDENCE-MATRIX',
    'evidence',
    evidenceMatrixComplete ? 'pass' : 'fail',
    'The scaffold records the required viewport, zoom, mode, pointer-lock, grayscale, and timed-readability evidence.',
    lineEvidence('matrix', /1280x720|keyboard-only|pointer-lock|grayscale|five-second/iu),
  ),
]);

const counts = checks.reduce(
  (result, item) => ({ ...result, [item.status]: result[item.status] + 1 }),
  { pass: 0, partial: 0, fail: 0 },
);
const report = Object.freeze({
  schemaVersion: 1,
  phase: 8,
  gate: 'G7_FOUNDATION_OPEN',
  mode: strict ? 'strict' : 'observational',
  root: ROOT,
  counts,
  checks,
  note: strict
    ? 'Strict mode requires every scaffolded contract to pass.'
    : 'Observational mode reports the implemented foundation and remaining readiness gaps; G7 stays open.',
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (strict && (counts.partial > 0 || counts.fail > 0)) process.exitCode = 1;
