import './style.css';
import './ui/kyx-cutline.css';
import './ui/map-library.css';
import './ui/local-inkfall-practice.css';
import { GameSettings } from './core/GameSettings.js';
import { applyAccessibilityPreferences } from './ui/AccessibilityPreferences.js';
import { PRODUCT_CONFIG, supportsDesktopLaunch } from './config/productConfig.js';
import { resolveG7UiCandidate } from './config/g7UiCandidate.ts';
import {
  LOCKED_GRAYBOX_PREVIEW_SEARCH,
  resolveLockedGrayboxPreviewRequest,
} from './app/lockedGrayboxSelection.ts';
import {
  ONLINE_AUTHORITY_PATH,
  resolveOnlineAuthorityAvailability,
} from './app/onlineAuthoritySelection.ts';
import {
  PRESS_HALL_INSPECTION_SEARCH,
  resolvePressHallInspectionRequest,
} from './app/pressHallInspectionSelection.ts';
import {
  resolveInkfallRev3ReviewRequest,
} from './app/inkfallRev3ReviewSelection.ts';

const canvas = document.getElementById('game-canvas');
const g7UiCandidate = resolveG7UiCandidate(window.location.search);
const uiSystem = 'cutline-v1';
const developmentUiVisible = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('debug') === '1';
document.body.dataset.g7Presentation = uiSystem;
document.body.dataset.uiSystem = uiSystem;
document.body.dataset.g7Review = 'human-required';
document.body.dataset.developmentUi = developmentUiVisible ? 'visible' : 'hidden';
document.getElementById('hud')?.setAttribute('data-ui-system', uiSystem);
if (g7UiCandidate.kind === 'invalid') {
  document.body.dataset.g7PresentationQuery = `invalid-${g7UiCandidate.reason}`;
} else if (g7UiCandidate.kind === 'fallback') {
  document.body.dataset.g7PresentationQuery = 'legacy-query-retired';
}
const desktopSupported = supportsDesktopLaunch();
const deterministicTestRoute = import.meta.env.DEV
  && window.location.pathname === '/__test__/determinism';
const movementTestRoute = import.meta.env.DEV
  && window.location.pathname === '/__test__/movement';
const authorityTestRoute = import.meta.env.DEV
  && window.location.pathname === '/__test__/authority';
const mapTestRoute = import.meta.env.DEV
  && window.location.pathname === '/__test__/map';
const developmentTestRoute = deterministicTestRoute || movementTestRoute || authorityTestRoute || mapTestRoute;
if (!developmentTestRoute) {
  GameSettings.load();
  applyAccessibilityPreferences(GameSettings.snapshot());
}
const lockedGrayboxPreviewRequest = resolveLockedGrayboxPreviewRequest(window.location.search);
const lockedGrayboxPreviewRoute = import.meta.env.DEV
  && lockedGrayboxPreviewRequest.kind !== 'none';
const pressHallInspectionRequest = resolvePressHallInspectionRequest(window.location.search);
const pressHallInspectionRoute = import.meta.env.DEV
  && pressHallInspectionRequest.kind !== 'none';
const inkfallRev3ReviewRequest = resolveInkfallRev3ReviewRequest(window.location.search);
const inkfallRev3ReviewRoute = import.meta.env.DEV
  && inkfallRev3ReviewRequest.kind !== 'none';
const onlineAuthorityRoute = window.location.pathname === ONLINE_AUTHORITY_PATH;
const localInkfallPracticeRoute = window.location.pathname === '/practice';
const authorityOriginCandidate = import.meta.env.MODE === 'staging-review'
  ? window.location.origin
  : import.meta.env.VITE_KYX_AUTHORITY_ORIGIN
    || (import.meta.env.PROD ? window.location.origin : undefined);
const onlineAuthorityAvailability = resolveOnlineAuthorityAvailability(
  authorityOriginCandidate,
  { isDevelopment: import.meta.env.DEV },
);
const launchOverrideRoute = developmentTestRoute
  || lockedGrayboxPreviewRoute
  || pressHallInspectionRoute
  || inkfallRev3ReviewRoute
  || onlineAuthorityRoute
  || localInkfallPracticeRoute;
const developmentFlatRunRequested = import.meta.env.DEV
  && !launchOverrideRoute
  && window.location.search === '?movementDriver=flat_run';
let game = null;
let developmentMovementDriver = null;
let stopDebugMetrics = null;
let debugMetricsTeardownRequested = false;

async function importDevelopmentModule(specifier) {
  if (!import.meta.env.DEV) {
    throw new Error('DEVELOPMENT_MODULE_NOT_PACKAGED');
  }
  // Keep review/test modules outside the production Rollup graph. A literal
  // dynamic import causes Vite to package their unapproved binary assets even
  // when the surrounding DEV branch is unreachable in a release build.
  return import(/* @vite-ignore */ specifier);
}

async function installCharacterReviewBeforeRuntimeImports() {
  const requestedRevision = new URLSearchParams(window.location.search)
    .get('g6Candidate');
  const requestsRev40Review = requestedRevision === 'g6-assault-rev40-cc0'
    || requestedRevision === 'g6-assault-rev40-cc0-weapon-ready-v4';
  if (import.meta.env.MODE === 'staging-review') {
    if (requestsRev40Review) {
      const { installKyxAssaultRev40Cc0Review } = await import(
        './dev/installKyxAssaultRev40Cc0Review'
      );
      return installKyxAssaultRev40Cc0Review(
        window.location.search,
        import.meta.env.MODE,
      );
    }
    const { installKyxAssaultRev39ArmoredReview } = await import(
      './dev/installKyxAssaultRev39ArmoredReview'
    );
    return installKyxAssaultRev39ArmoredReview(
      window.location.search,
      import.meta.env.MODE,
    );
  }
  if (!import.meta.env.DEV) return null;
  if (requestsRev40Review) {
    const { installKyxAssaultRev40Cc0Review } = await import(
      /* @vite-ignore */ './dev/installKyxAssaultRev40Cc0Review.ts'
    );
    return installKyxAssaultRev40Cc0Review(
      window.location.search,
      import.meta.env.MODE,
    );
  }
  if (requestedRevision === 'rev39-armored-restore-v1') {
    const { installKyxAssaultRev39ArmoredReview } = await import(
      /* @vite-ignore */ './dev/installKyxAssaultRev39ArmoredReview.ts'
    );
    return installKyxAssaultRev39ArmoredReview(
      window.location.search,
      import.meta.env.MODE,
    );
  }
  return null;
}

// This must complete before Game or an authority route imports HumanSoldier;
// Rev17Character snapshots the selected rig and asset URLs at module load.
await installCharacterReviewBeforeRuntimeImports();

function showDevelopmentMovementFailure(error, phase) {
  document.getElementById('dev-flat-run-movement-failure')?.remove();
  const failure = document.createElement('pre');
  failure.id = 'dev-flat-run-movement-failure';
  failure.setAttribute('role', 'alert');
  failure.textContent = [
    `HYPOTHESIS · FLAT_RUN · DEV ONLY · ${phase} FAILED`,
    '',
    error instanceof Error ? error.message : String(error),
    '',
    'The requested movement driver stopped. Legacy movement was not loaded as a fallback.',
  ].join('\n');
  failure.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'inset:0',
    'display:grid',
    'place-content:center',
    'margin:0',
    'padding:40px',
    'background:#170704',
    'color:#ffb09c',
    'font:800 14px/1.7 ui-monospace,monospace',
    'white-space:pre-wrap',
  ].join(';');
  document.body.dataset.launchSupport = 'movement-driver-error';
  document.body.dataset.movementDriver = 'flat_run';
  document.body.dataset.movementDriverStatus = 'error';
  document.body.append(failure);
}

if (import.meta.env.DEV) {
  document.getElementById('locked-graybox-preview-link')
    ?.setAttribute('href', LOCKED_GRAYBOX_PREVIEW_SEARCH);
  document.getElementById('press-hall-inspection-link')
    ?.setAttribute('href', PRESS_HALL_INSPECTION_SEARCH);
} else {
  document.getElementById('locked-graybox-preview-link')?.remove();
  document.getElementById('press-hall-inspection-link')?.remove();
}

const onlineMatchButton = document.getElementById('online-match-button');
if (onlineMatchButton instanceof HTMLButtonElement && onlineAuthorityAvailability.kind === 'configured') {
  onlineMatchButton.disabled = false;
  onlineMatchButton.setAttribute('aria-disabled', 'false');
  onlineMatchButton.classList.remove('online-unavailable');
  onlineMatchButton.classList.add('online-preview-available');
  onlineMatchButton.textContent = 'ONLINE COMBAT PREVIEW';
  onlineMatchButton.setAttribute('aria-label', 'Online match — available');
  onlineMatchButton.title = 'Create or join a pre-release authoritative combat room';
  onlineMatchButton.addEventListener('click', () => window.location.assign(ONLINE_AUTHORITY_PATH));
}

if (desktopSupported && !launchOverrideRoute) {
  if (developmentFlatRunRequested) {
    try {
      const {
        DEVELOPMENT_FLAT_RUN_DRIVER_QUERY,
        createDevelopmentFlatRunMovementDriver,
      } = await importDevelopmentModule('./dev/developmentFlatRunMovementDriver.ts');
      developmentMovementDriver = await createDevelopmentFlatRunMovementDriver({
        boundary: DEVELOPMENT_FLAT_RUN_DRIVER_QUERY,
        canvas,
        body: document.body,
      });
      const { Game } = await import('./core/Game.js');
      game = new Game(canvas, {
        movementDriver: developmentMovementDriver,
        onMovementDriverFault: (error) => {
          debugMetricsTeardownRequested = true;
          stopDebugMetrics?.();
          stopDebugMetrics = null;
          game?.dispose();
          game = null;
          developmentMovementDriver = null;
          showDevelopmentMovementFailure(error, 'RUNTIME');
        },
      });
    } catch (error) {
      developmentMovementDriver?.dispose();
      developmentMovementDriver = null;
      showDevelopmentMovementFailure(error, 'INITIALIZATION');
    }
  } else {
    try {
      const { mountCanonicalLobbyRoute } = await import('./app/canonicalLobbyRoute.ts');
      mountCanonicalLobbyRoute(document.body, onlineAuthorityAvailability);
    } catch (error) {
      const failure = document.createElement('pre');
      failure.id = 'canonical-lobby-result';
      failure.setAttribute('role', 'alert');
      failure.textContent = [
        'KYX.IO could not open the combat lobby.',
        '',
        error instanceof Error ? error.message : String(error),
        '',
        'The retired local simulation was not loaded as a fallback.',
      ].join('\n');
      document.body.dataset.launchSupport = 'canonical-authority-lobby-error';
      document.body.dataset.canonicalLobbyStatus = 'error';
      document.body.replaceChildren(failure);
    }
  }
}

if (localInkfallPracticeRoute) {
  document.body.dataset.launchSupport = 'local-relay-practice-authority';
  document.body.dataset.localPracticeStatus = 'loading';
  import('./app/localInkfallPracticeRoute.ts')
    .then(({ mountLocalInkfallPracticeRoute }) => (
      mountLocalInkfallPracticeRoute(document.body)
    ))
    .catch((error) => {
      const failure = document.createElement('pre');
      failure.id = 'local-practice-result';
      failure.setAttribute('role', 'alert');
      failure.textContent = [
        'Relay Practice stopped during initialization.',
        '',
        error instanceof Error ? error.message : String(error),
        '',
        'No legacy simulation was loaded as a fallback.',
      ].join('\n');
      document.body.dataset.localPracticeStatus = 'error';
      document.body.replaceChildren(failure);
    });
} else if (pressHallInspectionRoute) {
  document.body.dataset.launchSupport = pressHallInspectionRequest.kind === 'selected'
    ? `press-hall-v${pressHallInspectionRequest.artRevision.replace('.', '-')}-inspection`
    : 'press-hall-inspection';
  document.body.dataset.pressHallStatus = 'loading';
  importDevelopmentModule('./app/pressHallInspectionRoute.ts')
    .then(({ mountPressHallInspectionRoute }) => (
      mountPressHallInspectionRoute(document.body, pressHallInspectionRequest)
    ))
    .catch((error) => {
      const failure = document.createElement('pre');
      failure.id = 'press-hall-inspection-result';
      failure.setAttribute('role', 'alert');
      failure.textContent = error instanceof Error ? error.message : String(error);
      document.body.dataset.pressHallStatus = 'error';
      document.body.replaceChildren(failure);
    });
} else if (inkfallRev3ReviewRoute) {
  document.body.dataset.launchSupport = 'inkfall-rev3-explicit-review';
  document.body.dataset.inkfallRev3Status = 'loading';
  importDevelopmentModule('./app/inkfallRev3ReviewRoute.ts')
    .then(({ mountInkfallRev3ReviewRoute }) => (
      mountInkfallRev3ReviewRoute(document.body, inkfallRev3ReviewRequest)
    ))
    .catch((error) => {
      const failure = document.createElement('pre');
      failure.id = 'inkfall-rev3-review-result';
      failure.setAttribute('role', 'alert');
      failure.textContent = error instanceof Error ? error.message : String(error);
      document.body.dataset.inkfallRev3Status = 'error';
      document.body.replaceChildren(failure);
    });
} else if (onlineAuthorityRoute) {
  document.body.dataset.launchSupport = 'online-authority-preview';
  document.body.dataset.onlinePreviewStatus = 'loading';
  import('./app/onlineAuthorityRoute.ts')
    .then(({ mountOnlineAuthorityRoute }) => (
      mountOnlineAuthorityRoute(document.body, onlineAuthorityAvailability)
    ))
    .catch((error) => {
      const failure = document.createElement('pre');
      failure.id = 'online-preview-result';
      failure.setAttribute('role', 'alert');
      failure.textContent = error instanceof Error ? error.message : String(error);
      document.body.dataset.onlinePreviewStatus = 'error';
      document.body.replaceChildren(failure);
    });
} else if (lockedGrayboxPreviewRoute) {
  document.body.dataset.launchSupport = 'locked-graybox-preview';
  document.body.dataset.mapPreviewStatus = 'loading';
  importDevelopmentModule('./app/lockedGrayboxPreviewRoute.ts')
    .then(({ mountLockedGrayboxPreviewRoute }) => (
      mountLockedGrayboxPreviewRoute(document.body, lockedGrayboxPreviewRequest)
    ))
    .catch((error) => {
      const failure = document.createElement('pre');
      failure.id = 'locked-graybox-preview-result';
      failure.setAttribute('role', 'alert');
      failure.textContent = error instanceof Error ? error.message : String(error);
      document.body.dataset.mapPreviewStatus = 'error';
      document.body.replaceChildren(failure);
    });
} else if (mapTestRoute) {
  document.body.dataset.launchSupport = 'map-package-evidence';
  document.body.dataset.mapStatus = 'loading';
  importDevelopmentModule('./dev/mapTestRoute.ts')
    .then(({ mountMapTestRoute }) => mountMapTestRoute(document.body))
    .catch((error) => {
      const failure = document.createElement('pre');
      failure.id = 'map-package-result';
      failure.setAttribute('role', 'alert');
      failure.textContent = error instanceof Error ? error.message : String(error);
      document.body.dataset.mapStatus = 'error';
      document.body.replaceChildren(failure);
    });
} else if (authorityTestRoute) {
  document.body.dataset.launchSupport = 'authority-evidence';
  document.body.dataset.authorityStatus = 'loading';
  importDevelopmentModule('./dev/authorityTestRoute.ts')
    .then(({ mountAuthorityTestRoute }) => mountAuthorityTestRoute(document.body))
    .catch((error) => {
      const failure = document.createElement('pre');
      failure.id = 'authority-result';
      failure.setAttribute('role', 'alert');
      failure.textContent = error instanceof Error ? error.message : String(error);
      document.body.dataset.authorityStatus = 'error';
      document.body.replaceChildren(failure);
    });
} else if (movementTestRoute) {
  document.body.dataset.launchSupport = 'movement-fixture-lab';
  document.body.dataset.movementStatus = 'loading';
  importDevelopmentModule('./dev/movementTestRoute.ts')
    .then(({ mountMovementTestRoute }) => mountMovementTestRoute(document.body))
    .catch((error) => {
      const failure = document.createElement('pre');
      failure.id = 'movement-result';
      failure.textContent = error instanceof Error ? error.message : String(error);
      document.body.dataset.movementStatus = 'error';
      document.body.replaceChildren(failure);
    });
} else if (deterministicTestRoute) {
  document.body.dataset.launchSupport = 'deterministic-test';
  importDevelopmentModule('./dev/deterministicTestRoute.ts')
    .then(({ mountDeterministicTestRoute }) => mountDeterministicTestRoute(document.body))
    .catch((error) => {
      const failure = document.createElement('pre');
      failure.id = 'determinism-result';
      failure.textContent = error instanceof Error ? error.message : String(error);
      document.body.dataset.determinismStatus = 'error';
      document.body.replaceChildren(failure);
    });
} else if (!desktopSupported) {
  document.body.dataset.launchSupport = 'desktop-required';
  document.getElementById('connect-screen')?.classList.add('hidden');
  document.getElementById('desktop-required-overlay')?.classList.remove('hidden');
  canvas?.setAttribute('aria-hidden', 'true');
}

if (import.meta.env.DEV && desktopSupported && !launchOverrideRoute) {
  const diagnostics = document.getElementById('dev-build-diagnostics');
  if (diagnostics) {
    diagnostics.textContent = `${PRODUCT_CONFIG.product} ${PRODUCT_CONFIG.version} · LOCAL DEV · OFFLINE PRACTICE`;
    diagnostics.classList.toggle('hidden', !developmentUiVisible);
  }
}

// Read-only development metrics are loaded outside the production bundle and
// expose only a serialized snapshot, never the mutable Game instance.
if (import.meta.env.DEV && game) {
  const metricsGame = game;
  importDevelopmentModule('./render/debugMetrics.ts').then(({ startRendererDebugMetrics }) => {
    if (debugMetricsTeardownRequested || game !== metricsGame) return;
    stopDebugMetrics = startRendererDebugMetrics({
      canvas,
      renderer: metricsGame.renderer,
      scene: metricsGame.world.scene,
      getState: () => game?.state ?? 'disposed',
    });
  }).catch(() => {
    if (!debugMetricsTeardownRequested && game === metricsGame) {
      document.body.dataset.rendererDiagnostics = 'unavailable';
    }
  });
  window.addEventListener('pagehide', () => {
    debugMetricsTeardownRequested = true;
    stopDebugMetrics?.();
    stopDebugMetrics = null;
  }, { once: true });
}

if (import.meta.env.DEV && developmentMovementDriver) {
  window.addEventListener('pagehide', () => {
    game?.dispose();
    game = null;
    developmentMovementDriver = null;
  }, { once: true });
}
