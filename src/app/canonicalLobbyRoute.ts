import { UserAccount } from '../core/UserAccount.js';
import { MenuUI } from '../ui/MainMenu.js';

export const CANONICAL_LOBBY_RUNTIME = 'authority-relay-v1';

export type CanonicalLobbyRoute = Readonly<{
  dispose: () => void;
}>;

export function mountCanonicalLobbyRoute(root: HTMLElement): CanonicalLobbyRoute {
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

  const menu = new MenuUI();
  menu.setUsername(UserAccount.getDisplayName());
  menu.showMain();

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
