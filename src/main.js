import './style.css';
import './ui/g7-ui.css';
import './ui/g7-foundry-tactical.css';
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
const useAcceptedG7Presentation = g7UiCandidate.kind !== 'fallback';
document.body.dataset.g7Presentation = useAcceptedG7Presentation
  ? 'tournament-instrument-rev2'
  : 'legacy-fallback';
if (useAcceptedG7Presentation) {
  document.body.dataset.g7Candidate = 'foundry-tactical-v1';
  document.getElementById('hud')?.setAttribute('data-ui-candidate', 'foundry-tactical-v1');
}
if (g7UiCandidate.kind === 'invalid') {
  document.body.dataset.g7PresentationQuery = `invalid-${g7UiCandidate.reason}`;
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
const lockedGrayboxPreviewRequest = resolveLockedGrayboxPreviewRequest(window.location.search);
const lockedGrayboxPreviewRoute = lockedGrayboxPreviewRequest.kind !== 'none';
const pressHallInspectionRequest = resolvePressHallInspectionRequest(window.location.search);
const pressHallInspectionRoute = pressHallInspectionRequest.kind !== 'none';
const inkfallRev3ReviewRequest = resolveInkfallRev3ReviewRequest(window.location.search);
const inkfallRev3ReviewRoute = inkfallRev3ReviewRequest.kind !== 'none';
const onlineAuthorityRoute = window.location.pathname === ONLINE_AUTHORITY_PATH;
const onlineAuthorityAvailability = resolveOnlineAuthorityAvailability(
  import.meta.env.VITE_KYX_AUTHORITY_ORIGIN,
  { isDevelopment: import.meta.env.DEV },
);
const launchOverrideRoute = developmentTestRoute
  || lockedGrayboxPreviewRoute
  || pressHallInspectionRoute
  || inkfallRev3ReviewRoute
  || onlineAuthorityRoute;
const developmentFlatRunRequested = import.meta.env.DEV
  && !launchOverrideRoute
  && window.location.search === '?movementDriver=flat_run';
let game = null;
let developmentMovementDriver = null;
let stopDebugMetrics = null;
let debugMetricsTeardownRequested = false;

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

document.getElementById('locked-graybox-preview-link')
  ?.setAttribute('href', LOCKED_GRAYBOX_PREVIEW_SEARCH);
document.getElementById('press-hall-inspection-link')
  ?.setAttribute('href', PRESS_HALL_INSPECTION_SEARCH);

const onlineMatchButton = document.getElementById('online-match-button');
if (onlineMatchButton instanceof HTMLButtonElement && onlineAuthorityAvailability.kind === 'configured') {
  onlineMatchButton.disabled = false;
  onlineMatchButton.setAttribute('aria-disabled', 'false');
  onlineMatchButton.classList.remove('online-unavailable');
  onlineMatchButton.classList.add('online-preview-available');
  onlineMatchButton.textContent = 'ONLINE COMBAT PREVIEW';
  onlineMatchButton.title = 'Create or join a pre-release authoritative combat room';
  onlineMatchButton.addEventListener('click', () => window.location.assign(ONLINE_AUTHORITY_PATH));
}

if (desktopSupported && !launchOverrideRoute) {
  if (developmentFlatRunRequested) {
    try {
      const {
        DEVELOPMENT_FLAT_RUN_DRIVER_QUERY,
        createDevelopmentFlatRunMovementDriver,
      } = await import('./dev/developmentFlatRunMovementDriver.ts');
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
    const { Game } = await import('./core/Game.js');
    game = new Game(canvas);
  }
}

if (pressHallInspectionRoute) {
  document.body.dataset.launchSupport = pressHallInspectionRequest.kind === 'selected'
    ? `press-hall-v${pressHallInspectionRequest.artRevision.replace('.', '-')}-inspection`
    : 'press-hall-inspection';
  document.body.dataset.pressHallStatus = 'loading';
  import('./app/pressHallInspectionRoute.ts')
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
  import('./app/inkfallRev3ReviewRoute.ts')
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
  import('./app/lockedGrayboxPreviewRoute.ts')
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
  import('./dev/mapTestRoute.ts')
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
  import('./dev/authorityTestRoute.ts')
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
  import('./dev/movementTestRoute.ts')
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
  import('./dev/deterministicTestRoute.ts')
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
    diagnostics.classList.remove('hidden');
  }
}

// Read-only development metrics are loaded outside the production bundle and
// expose only a serialized snapshot, never the mutable Game instance.
if (import.meta.env.DEV && game) {
  const metricsGame = game;
  import('./render/debugMetrics.ts').then(({ startRendererDebugMetrics }) => {
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
