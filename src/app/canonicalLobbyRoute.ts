import { UserAccount } from '../core/UserAccount.js';
import { MenuUI } from '../ui/MainMenu.js';
import {
  defaultOnlineProfile,
  onlineCreatePath,
  type OnlineAuthorityAvailability,
} from './onlineAuthoritySelection';
import { buildPracticeHref } from '../ui/practiceRoute';

export const CANONICAL_LOBBY_RUNTIME = 'authority-relay-v1';

export type CanonicalLobbyRoute = Readonly<{
  dispose: () => void;
}>;

export interface CanonicalLobbyPrimaryPlay {
  readonly kind: 'online_authority' | 'local_authority_practice';
  readonly href: string;
  readonly label: string;
  readonly detail: string;
}

export function canonicalLobbyPrimaryPlay(
  availability: OnlineAuthorityAvailability,
  currentSearch = '',
): CanonicalLobbyPrimaryPlay {
  return availability.kind === 'configured'
    ? Object.freeze({
        kind: 'online_authority',
        href: onlineCreatePath(defaultOnlineProfile()),
        label: 'Quick Match',
        detail: 'Online',
      })
    : Object.freeze({
        kind: 'local_authority_practice',
        href: buildPracticeHref(currentSearch),
        label: 'Enter Relay',
        detail: 'Practice',
      });
}

export function mountCanonicalLobbyRoute(
  root: HTMLElement,
  onlineAvailability: OnlineAuthorityAvailability,
): CanonicalLobbyRoute {
  if (root !== document.body) {
    throw new Error('CANONICAL_LOBBY_ROOT_INVALID');
  }

  const canvas = document.getElementById('game-canvas');
  const connectScreen = document.getElementById('connect-screen');
  const desktopOverlay = document.getElementById('desktop-required-overlay');
  if (!(canvas instanceof HTMLCanvasElement) || !(connectScreen instanceof HTMLElement)) {
    throw new Error('CANONICAL_LOBBY_SHELL_INCOMPLETE');
  }

  document.body.dataset.launchSupport = 'canonical-authority-lobby';
  document.body.dataset.canonicalRuntime = CANONICAL_LOBBY_RUNTIME;
  document.body.dataset.canonicalLobbyStatus = 'ready';
  connectScreen.classList.add('hidden');
  desktopOverlay?.classList.add('hidden');
  canvas.setAttribute('aria-hidden', 'true');

  const primaryPlay = canonicalLobbyPrimaryPlay(onlineAvailability, window.location.search);
  const menu = new MenuUI({ routeRelayPractice: false });
  menu.setUsername(UserAccount.getDisplayName());
  menu.onPlay = () => window.location.assign(primaryPlay.href);
  menu.showMain();
  document.body.dataset.canonicalPrimaryPlay = primaryPlay.kind;
  const playButton = document.getElementById('play-btn');
  if (playButton instanceof HTMLButtonElement) {
    playButton.setAttribute('aria-label', primaryPlay.label);
    const label = playButton.querySelector('span');
    const detail = playButton.querySelector('b');
    if (label !== null) label.textContent = primaryPlay.label;
    if (detail !== null) detail.textContent = primaryPlay.detail;
  }

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    menu.dispose();
    document.body.dataset.canonicalLobbyStatus = 'disposed';
  };
  window.addEventListener('pagehide', dispose, { once: true });

  return Object.freeze({ dispose });
}
