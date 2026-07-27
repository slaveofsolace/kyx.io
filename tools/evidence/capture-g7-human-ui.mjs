import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const baseURL = option('--base-url', 'http://127.0.0.1:6197');
const outputRoot = path.resolve(option(
  '--output',
  'evidence/2026-07-26/g7-human-ui/after',
));
const browserChannel = option('--channel', 'chrome');

await mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch({ channel: browserChannel, headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'no-preference',
});
const page = await context.newPage();
const runtimeErrors = {
  console: [],
  page: [],
  requests: [],
};
const captures = [];

page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.console.push(message.text());
});
page.on('pageerror', (error) => runtimeErrors.page.push(error.message));
page.on('requestfailed', (request) => {
  runtimeErrors.requests.push(
    `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
  );
});
await page.addInitScript(() => {
  const captureSessionKey = 'kyx-g7-capture-storage-cleared';
  if (sessionStorage.getItem(captureSessionKey) === 'true') return;
  localStorage.clear();
  sessionStorage.setItem(captureSessionKey, 'true');
});

async function setViewport(width, height) {
  await page.setViewportSize({ width, height });
}

async function waitForMenu() {
  await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
  await page.locator('#connect-screen.hidden').waitFor({ state: 'attached', timeout: 15_000 });
  await page.getByRole('button', { name: 'Start offline practice' }).waitFor({
    state: 'visible',
    timeout: 15_000,
  });
}

async function capture(name, {
  fixture = null,
  notes = null,
} = {}) {
  // Capture the authored resting state, not a partially transparent transition
  // frame. The longest bounded UI entrance motion is 220 ms.
  await page.waitForTimeout(300);
  const viewport = page.viewportSize();
  const target = path.join(outputRoot, name);
  await page.screenshot({ path: target, fullPage: false });
  captures.push({
    file: name,
    url: page.url(),
    viewport,
    fixture,
    notes,
  });
}

try {
  await context.clearCookies();
  await waitForMenu();
  await capture('menu-1440x900.png');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#panel-settings').waitFor({ state: 'visible' });
  await capture('settings-1440x900.png');
  await page.getByRole('button', { name: 'Close settings' }).click();

  await page.getByRole('button', { name: 'Loadout' }).click();
  await page.locator('#panel-loadout').waitFor({ state: 'visible' });
  await capture('loadout-1440x900.png');
  await page.getByRole('button', { name: 'Close loadout' }).click();

  await setViewport(1920, 1080);
  await waitForMenu();
  await capture('menu-1920x1080.png');

  await setViewport(3440, 1440);
  await waitForMenu();
  await capture('menu-ultrawide-3440x1440.png');

  await setViewport(768, 900);
  await waitForMenu();
  await capture('menu-narrow-768x900.png');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#panel-settings').waitFor({ state: 'visible' });
  await capture('settings-narrow-768x900.png');

  await setViewport(1440, 900);
  await page.goto(`${baseURL}/online`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="online-preview-route"]').waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  await capture('online-lobby-1440x900.png', {
    notes: 'Development route with no room action taken; authority behavior is not exercised.',
  });

  await setViewport(1280, 720);
  await waitForMenu();
  await page.getByRole('button', { name: 'Start offline practice' }).click();
  await page.locator('#hud').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#map-loading.hidden').waitFor({ state: 'attached', timeout: 15_000 });
  await capture('hud-1280x720.png');

  await page.evaluate(async () => {
    const { HUD } = await import('/src/ui/HUD.js');
    const hud = new HUD();
    hud.addKillFeed('Recruit · Practice Bot 04');
    hud.addKillFeed('Practice Bot 02 · Practice Bot 06');
  });
  await capture('hud-killfeed-presentation-fixture-1280x720.png', {
    fixture: 'Live runtime DOM populated through HUD.addKillFeed for visual-state review only.',
  });

  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Paused' }).waitFor({ state: 'visible' });
  await capture('pause-1280x720.png');
  await page.keyboard.press('Escape');

  await page.evaluate(async () => {
    const { HUD } = await import('/src/ui/HUD.js');
    const hud = new HUD();
    hud.showScoreboard([
      { name: 'Practice Bot 03', kills: 7, score: 1_125 },
      { name: 'You', kills: 5, score: 825, isYou: true },
      { name: 'Practice Bot 01', kills: 4, score: 650 },
      { name: 'Practice Bot 06', kills: 3, score: 500 },
      { name: 'Practice Bot 04', kills: 2, score: 350 },
      { name: 'Practice Bot 05', kills: 2, score: 325 },
      { name: 'Practice Bot 02', kills: 1, score: 175 },
      { name: 'Practice Bot 07', kills: 0, score: 50 },
    ], 'Offline practice');
  });
  await page.locator('#scoreboard-overlay').waitFor({ state: 'visible' });
  await capture('scoreboard-presentation-fixture-1280x720.png', {
    fixture: 'Live runtime DOM populated through HUD.showScoreboard for visual-state review only. The browser smoke test separately verifies the hold-Tab flow.',
  });
  await page.evaluate(() => {
    document.getElementById('scoreboard-overlay')?.classList.add('hidden');
  });

  await page.evaluate(() => {
    document.getElementById('hud')?.classList.add('hidden');
    const gameover = document.getElementById('gameover-menu');
    if (gameover) {
      gameover.inert = false;
      gameover.classList.remove('hidden');
    }
    const title = document.getElementById('gameover-title');
    if (title) title.textContent = 'Eliminated';
    const stats = document.getElementById('gameover-stats');
    if (stats) {
      const row = (label, value) => {
        const element = document.createElement('div');
        const output = document.createElement('span');
        output.textContent = value;
        element.append(document.createTextNode(label), output);
        return element;
      };
      stats.replaceChildren(
        row('Bots defeated', '4'),
        row('Score', '650'),
        row('Time', '3:42'),
      );
    }
  });
  await capture('death-presentation-fixture-1280x720.png', {
    fixture: 'Live runtime death dialog populated for presentation review; no gameplay outcome claim.',
  });

  await page.evaluate(async () => {
    document.getElementById('gameover-menu')?.classList.add('hidden');
    const { HUD } = await import('/src/ui/HUD.js');
    const hud = new HUD();
    hud.showLeaderboard([
      { name: 'Recruit', score: 1120, assists: 2, kills: 8, deaths: 3, kd: '2.7', isYou: true },
      { name: 'Practice Bot 03', score: 860, assists: 1, kills: 6, deaths: 4, kd: '1.5' },
      { name: 'Practice Bot 07', score: 710, assists: 0, kills: 5, deaths: 5, kd: '1.0' },
      { name: 'Practice Bot 01', score: 540, assists: 2, kills: 4, deaths: 6, kd: '0.7' },
    ], 'Recruit');
  });
  await capture('postmatch-presentation-fixture-1280x720.png', {
    fixture: 'Live runtime populated through HUD.showLeaderboard for layout review only.',
  });

  await setViewport(1440, 1080);
  await waitForMenu();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('group', { name: 'Camera / HUD motion' })
    .getByRole('button', { name: 'Reduced' })
    .click();
  await page.getByRole('group', { name: 'Contrast' })
    .getByRole('button', { name: 'High' })
    .click();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.locator('.settings-group--accessibility').evaluate(() => {
    const panel = document.getElementById('panel-settings');
    if (panel) {
      panel.scrollTop = panel.scrollHeight - panel.clientHeight;
    }
  });
  await capture('settings-high-contrast-reduced-motion-1440x1080.png');
  await waitForMenu();
  await page.getByRole('heading', { name: 'Iron Bastion' }).waitFor({ state: 'visible' });
  await capture('menu-high-contrast-reduced-motion-1440x1080.png');
} finally {
  await browser.close();
}

const manifest = {
  capturedAt: new Date().toISOString(),
  baseURL,
  browserChannel,
  prohibitedPortsUntouched: [5173, 8787],
  captures,
  runtimeErrors,
};
await writeFile(
  path.join(outputRoot, 'runtime-capture.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

if (runtimeErrors.console.length || runtimeErrors.page.length || runtimeErrors.requests.length) {
  console.error(JSON.stringify(runtimeErrors, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Captured ${captures.length} G7 views to ${outputRoot}`);
}
