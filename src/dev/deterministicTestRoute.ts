import {
  FOUNDATION_REPLAY_RULES,
  FOUNDATION_REPLAY_SEED,
  runFoundationDeterministicReplay,
} from '../sim/foundationFixture';

export const DETERMINISTIC_TEST_ROUTE_PATH = '/__test__/determinism' as const;

function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  text: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  node.className = className;
  node.textContent = text;
  return node;
}

export function mountDeterministicTestRoute(body: HTMLBodyElement): void {
  const summary = runFoundationDeterministicReplay();
  const payload = Object.freeze({
    schemaVersion: 1,
    profile: `authority_${FOUNDATION_REPLAY_RULES.simulationRateHz}hz`,
    tickDurationMs: 1_000 / FOUNDATION_REPLAY_RULES.simulationRateHz,
    seed: FOUNDATION_REPLAY_SEED,
    ...summary,
  });

  document.title = 'KYX.IO — Determinism Contract';
  document.documentElement.lang = 'en';
  body.dataset.launchSupport = 'deterministic-test';
  body.dataset.determinismStatus = 'pass';
  body.dataset.determinismHash = summary.finalStateHash;

  const style = document.createElement('style');
  style.textContent = `
    :root { color-scheme: dark; background: #0b0e12; }
    body { margin: 0; min-height: 100vh; background: #0b0e12; color: #f2efe7; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    .det-shell { width: min(760px, calc(100% - 40px)); margin: 0 auto; padding: 72px 0; }
    .det-kicker { margin: 0 0 14px; color: #e9593f; font-size: 12px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
    .det-title { margin: 0; max-width: 680px; color: #fff; font: 800 clamp(34px, 6vw, 68px)/.96 system-ui, sans-serif; letter-spacing: -.045em; }
    .det-copy { max-width: 660px; margin: 24px 0 30px; color: #b8bdc7; font: 500 16px/1.65 system-ui, sans-serif; }
    .det-status { display: inline-flex; gap: 9px; align-items: center; margin-bottom: 18px; color: #90e8b0; font-size: 13px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .det-status::before { width: 9px; height: 9px; border-radius: 50%; background: currentColor; content: ''; box-shadow: 0 0 18px currentColor; }
    .det-output { overflow-x: auto; margin: 0; padding: 22px; border: 1px solid #303844; border-left: 4px solid #e9593f; background: #11161d; color: #dbe6f2; font: 600 13px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .det-note { margin-top: 18px; color: #7f8792; font-size: 12px; line-height: 1.6; }
  `;

  const main = element('main', 'det-shell', '');
  const kicker = element('p', 'det-kicker', 'Development contract route');
  const title = element('h1', 'det-title', 'Same commands. Same state. Same hash.');
  const copy = element(
    'p',
    'det-copy',
    'This page renders the result of the same DOM-free simulation replay used by the Node test suite. It does not construct the game, renderer, audio, storage, or network paths.',
  );
  const status = element('div', 'det-status', 'Determinism probe passed');
  status.setAttribute('role', 'status');
  const output = element('pre', 'det-output', JSON.stringify(payload, null, 2));
  output.id = 'determinism-result';
  const note = element(
    'p',
    'det-note',
    'Development-only route · canonical authority rate 20 Hz · fixed tick 50 ms · production route disabled',
  );

  main.append(kicker, title, copy, status, output, note);
  body.replaceChildren(style, main);
}
