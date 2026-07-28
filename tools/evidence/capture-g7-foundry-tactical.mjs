import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const baseURL = option('--base-url', 'http://127.0.0.1:6207');
const outputRoot = path.resolve(option(
  '--output',
  'evidence/2026-07-27/g7-tournament-instrument-rev2/after',
));
const browserChannel = option('--channel', 'chrome');
const candidateURL = new URL('/', baseURL);
candidateURL.searchParams.set('g7Presentation', 'tournament-instrument-rev2');

await mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch({ channel: browserChannel, headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'no-preference',
});
const page = await context.newPage();
const runtimeErrors = { console: [], page: [], requests: [] };
const captures = [];
const layoutAudits = [];
const contrastAudits = [];
const nameplateAudits = [];
const navigationAborts = [];
let intentionalNavigation = false;

page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.console.push(message.text());
});
page.on('pageerror', (error) => runtimeErrors.page.push(error.message));
page.on('requestfailed', (request) => {
  const detail = `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`;
  if (intentionalNavigation && request.failure()?.errorText === 'net::ERR_ABORTED') {
    navigationAborts.push(detail);
  } else {
    runtimeErrors.requests.push(detail);
  }
});

await page.addInitScript(() => {
  const sessionKey = 'kyx-g7-foundry-tactical-storage-cleared';
  if (sessionStorage.getItem(sessionKey) === 'true') return;
  localStorage.clear();
  sessionStorage.setItem(sessionKey, 'true');
});

async function setViewport(width, height) {
  await page.setViewportSize({ width, height });
}

async function waitForMenu() {
  if (page.url() !== 'about:blank') {
    await page.waitForLoadState('networkidle').catch(() => {});
  }
  intentionalNavigation = true;
  try {
    await page.goto(candidateURL.href, { waitUntil: 'networkidle' });
  } finally {
    intentionalNavigation = false;
  }
  await page.locator('#connect-screen.hidden').waitFor({ state: 'attached', timeout: 15_000 });
  await page.getByRole('button', { name: 'Start offline practice' }).waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  const candidate = await page.locator('body').evaluate((body) => ({
    presentation: body.dataset.g7Presentation ?? null,
    styleToken: body.dataset.g7Candidate ?? null,
  }));
  if (
    candidate.presentation !== 'tournament-instrument-rev2'
    || candidate.styleToken !== 'foundry-tactical-v1'
  ) {
    throw new Error(`Expected Tournament Instrument Rev2, received ${JSON.stringify(candidate)}`);
  }
}

async function auditHudLayout(label) {
  const audit = await page.evaluate(() => {
    const ids = ['hud-vitals', 'weapon-wrap', 'score-wrap', 'ability-rack', 'dm-timer'];
    const boxes = Object.fromEntries(ids.map((id) => {
      const element = document.getElementById(id);
      if (!element || getComputedStyle(element).display === 'none') return [id, null];
      const rect = element.getBoundingClientRect();
      return [id, {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }];
    }));
    const overlaps = (left, right) => left
      && right
      && left.left < right.right
      && left.right > right.left
      && left.top < right.bottom
      && left.bottom > right.top;
    const pairs = [
      ['hud-vitals', 'ability-rack'],
      ['weapon-wrap', 'ability-rack'],
      ['score-wrap', 'dm-timer'],
    ];
    const overlapPairs = pairs
      .filter(([left, right]) => overlaps(boxes[left], boxes[right]))
      .map(([left, right]) => `${left}:${right}`);
    const outside = Object.entries(boxes)
      .filter(([, box]) => box && (
        box.left < 0
        || box.top < 0
        || box.right > window.innerWidth
        || box.bottom > window.innerHeight
      ))
      .map(([id]) => id);
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      overflow: {
        x: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        y: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      },
      boxes,
      overlapPairs,
      outside,
    };
  });
  layoutAudits.push({ label, ...audit });
}

async function auditNameplates(label) {
  await page.waitForTimeout(400);
  const audit = await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('.nameplate'))
      .filter((element) => getComputedStyle(element).display !== 'none')
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.textContent?.trim() ?? 'Enemy',
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      });
    const collisions = [];
    for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
        const left = boxes[leftIndex];
        const right = boxes[rightIndex];
        if (
          left.left < right.right
          && left.right > right.left
          && left.top < right.bottom
          && left.bottom > right.top
        ) {
          collisions.push(`${left.label} / ${right.label}`);
        }
      }
    }
    return { visibleCount: boxes.length, boxes, collisions };
  });
  nameplateAudits.push({ label, ...audit });
}

async function auditContrast(label, samples) {
  const results = await page.evaluate((requestedSamples) => {
    const parseColor = (value) => {
      const channels = value.match(/[\d.]+/gu)?.map(Number) ?? [];
      if (channels.length < 3) throw new Error(`Unable to parse color: ${value}`);
      return {
        red: channels[0],
        green: channels[1],
        blue: channels[2],
        alpha: channels[3] ?? 1,
      };
    };
    const compositeOverBlack = ({ red, green, blue, alpha }) => ({
      red: red * alpha,
      green: green * alpha,
      blue: blue * alpha,
    });
    const luminance = ({ red, green, blue }) => {
      const convert = (channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return (0.2126 * convert(red)) + (0.7152 * convert(green)) + (0.0722 * convert(blue));
    };
    const ratio = (left, right) => {
      const lighter = Math.max(luminance(left), luminance(right));
      const darker = Math.min(luminance(left), luminance(right));
      return (lighter + 0.05) / (darker + 0.05);
    };

    return requestedSamples.map(({ name, selector, backgroundSelector }) => {
      const foregroundElement = document.querySelector(selector);
      const backgroundElement = document.querySelector(backgroundSelector);
      if (!(foregroundElement instanceof HTMLElement)) {
        throw new Error(`Missing contrast foreground: ${selector}`);
      }
      if (!(backgroundElement instanceof HTMLElement)) {
        throw new Error(`Missing contrast background: ${backgroundSelector}`);
      }
      const foregroundStyle = getComputedStyle(foregroundElement);
      const backgroundStyle = getComputedStyle(backgroundElement);
      const foreground = compositeOverBlack(parseColor(foregroundStyle.color));
      const background = compositeOverBlack(parseColor(backgroundStyle.backgroundColor));
      return {
        name,
        selector,
        backgroundSelector,
        color: foregroundStyle.color,
        backgroundColor: backgroundStyle.backgroundColor,
        fontSize: foregroundStyle.fontSize,
        fontWeight: foregroundStyle.fontWeight,
        ratio: Number(ratio(foreground, background).toFixed(2)),
        visible: foregroundElement.getClientRects().length > 0,
      };
    });
  }, samples);
  contrastAudits.push({ label, samples: results });
}

async function capture(name, { fixture = null, notes = null } = {}) {
  await page.waitForTimeout(180);
  const viewport = page.viewportSize();
  await page.screenshot({ path: path.join(outputRoot, name), fullPage: false });
  captures.push({
    file: name,
    url: page.url(),
    viewport,
    fixture,
    notes,
  });
}

try {
  await waitForMenu();
  await capture('menu-1440x900.png');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#panel-settings').waitFor({ state: 'visible' });
  await auditContrast('settings-1440x900', [
    {
      name: 'Settings title',
      selector: '#settings-title',
      backgroundSelector: '.settings-command-head',
    },
    {
      name: 'Settings brief',
      selector: '#panel-settings .settings-brief',
      backgroundSelector: '#panel-settings',
    },
    {
      name: 'Settings section',
      selector: '#panel-settings .settings-section',
      backgroundSelector: '#panel-settings',
    },
    {
      name: 'Settings microcopy',
      selector: '#panel-settings .settings-note',
      backgroundSelector: '#panel-settings',
    },
  ]);
  await capture('settings-1440x900.png');
  await page.getByRole('button', { name: 'Close settings' }).click();

  await setViewport(768, 900);
  await waitForMenu();
  await capture('menu-narrow-768x900.png');

  await setViewport(1280, 720);
  await waitForMenu();
  await page.getByRole('button', { name: 'Start offline practice' }).click();
  await page.locator('#hud').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#map-loading.hidden').waitFor({ state: 'attached', timeout: 15_000 });
  await auditHudLayout('100-percent-equivalent-1280x720');
  await auditNameplates('live-world-space-labels-1280x720');
  await auditContrast('hud-objective-1280x720', [
    {
      name: 'Objective title',
      selector: '.hud-practice-label',
      backgroundSelector: '#score-wrap',
    },
    {
      name: 'Objective authority',
      selector: '.hud-match-head > span',
      backgroundSelector: '#score-wrap',
    },
    {
      name: 'Objective roster',
      selector: '#server-pop',
      backgroundSelector: '#score-wrap',
    },
    {
      name: 'Objective metric label',
      selector: '.hud-score-metrics small',
      backgroundSelector: '#score-wrap',
    },
    {
      name: 'Ability name',
      selector: '.ability-name',
      backgroundSelector: '#ability-rack',
    },
    {
      name: 'Ability state',
      selector: '.ability-state',
      backgroundSelector: '#ability-rack',
    },
    {
      name: 'Ammo qualifier',
      selector: '.hud-ammo-row > span',
      backgroundSelector: '#weapon-wrap',
    },
  ]);
  await capture('hud-1280x720.png');

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--hud-scale', '1.25');
  });
  await auditHudLayout('hud-scale-125-1280x720');
  await capture('hud-scale-125-1280x720.png', {
    notes: 'Live candidate HUD rendered with the existing --hud-scale preference at 1.25.',
  });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--hud-scale', '1');
    window.requestAnimationFrame = () => 0;
  });
  await page.waitForTimeout(100);

  await page.evaluate(async () => {
    const { HUD } = await import('/src/ui/HUD.js');
    const hud = new HUD();
    hud.update(
      {
        health: 68,
        maxHealth: 100,
        shield: 24,
        maxShield: 50,
        stamina: 44,
        maxStamina: 100,
      },
      {
        name: 'AR-9 Assault',
        isMelee: false,
        magAmmo: 17,
        reserveAmmo: 90,
        isReloading: true,
      },
      3,
      450,
    );
  });
  await page.locator('#reload-text').waitFor({ state: 'visible' });
  await auditContrast('hud-reload-1280x720', [
    {
      name: 'Reload warning',
      selector: '#reload-text',
      backgroundSelector: '#reload-text',
    },
  ]);
  await capture('hud-reload-presentation-fixture-1280x720.png', {
    fixture: 'Live HUD.update presentation fixture using existing reload, ammo, vital, and score semantics.',
    notes: 'The render loop is frozen after a live gameplay frame so the presentation fixture cannot be overwritten before capture; this is not an authority outcome claim.',
  });

  await page.evaluate(async () => {
    const { HUD } = await import('/src/ui/HUD.js');
    const hud = new HUD();
    hud.update(
      {
        health: 68,
        maxHealth: 100,
        shield: 24,
        maxShield: 50,
        stamina: 44,
        maxStamina: 100,
      },
      {
        name: 'AR-9 Assault',
        isMelee: false,
        magAmmo: 17,
        reserveAmmo: 90,
        isReloading: false,
      },
      3,
      450,
    );
    document.getElementById('killfeed')?.replaceChildren();
    hud.addKillFeed('Recruit defeated Practice Bot 04');
    hud.addKillFeed('Practice Bot 02 defeated Practice Bot 06');
  });
  await capture('hud-killfeed-presentation-fixture-1280x720.png', {
    fixture: 'Live HUD.addKillFeed presentation fixture; no gameplay outcome claim.',
  });

  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Paused' }).waitFor({ state: 'visible' });
  await auditContrast('pause-1280x720', [
    {
      name: 'Pause title',
      selector: '#pause-title',
      backgroundSelector: '#pause-menu .menu-panel',
    },
    {
      name: 'Pause guidance',
      selector: '.pause-recovery-note',
      backgroundSelector: '#pause-menu .menu-panel',
    },
    {
      name: 'Pause primary action',
      selector: '#resume-btn',
      backgroundSelector: '#resume-btn',
    },
  ]);
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
  await auditContrast('scoreboard-1280x720', [
    {
      name: 'Scoreboard title',
      selector: '.sb-title',
      backgroundSelector: '.sb-panel',
    },
    {
      name: 'Scoreboard combatant',
      selector: '#sb-rows td:nth-child(2)',
      backgroundSelector: '.sb-panel',
    },
    {
      name: 'Current player badge',
      selector: '.sb-you-badge',
      backgroundSelector: '.sb-row-you td',
    },
    {
      name: 'Scoreboard key',
      selector: '.sb-key',
      backgroundSelector: '.sb-key',
    },
  ]);
  await capture('scoreboard-presentation-fixture-1280x720.png', {
    fixture: 'Live HUD.showScoreboard presentation fixture; hold-Tab behavior is validated separately.',
  });

  await page.evaluate(() => {
    document.getElementById('scoreboard-overlay')?.classList.add('hidden');
    document.body.dataset.highContrast = 'true';
  });
  await capture('hud-high-contrast-1280x720.png', {
    fixture: 'Existing high-contrast data state applied to the live candidate HUD.',
  });

  await setViewport(1920, 1080);
  await waitForMenu();
  await page.getByRole('button', { name: 'Start offline practice' }).click();
  await page.locator('#hud').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#map-loading.hidden').waitFor({ state: 'attached', timeout: 15_000 });
  await auditNameplates('live-world-space-labels-1920x1080');
  await capture('hud-1920x1080.png');

  await setViewport(1024, 576);
  await waitForMenu();
  await page.getByRole('button', { name: 'Start offline practice' }).click();
  await page.locator('#hud').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#map-loading.hidden').waitFor({ state: 'attached', timeout: 15_000 });
  await auditHudLayout('125-percent-equivalent-1024x576');
  await auditNameplates('live-world-space-labels-1024x576');
  await capture('hud-125-percent-equivalent-1024x576.png', {
    notes: 'CSS viewport equivalent of 1280x720 at 125% browser zoom.',
  });
} finally {
  await browser.close();
}

const manifest = {
  capturedAt: new Date().toISOString(),
  baseURL,
  candidateURL: candidateURL.href,
  browserChannel,
  prohibitedPortsUntouched: [5173, 8787],
  captures,
  layoutAudits,
  contrastAudits,
  nameplateAudits,
  navigationAborts,
  runtimeErrors,
};
await writeFile(
  path.join(outputRoot, 'runtime-capture.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

const layoutFailures = layoutAudits.filter((audit) => (
  audit.overflow.x > 0
  || audit.overflow.y > 0
  || audit.overlapPairs.length > 0
  || audit.outside.length > 0
));
const contrastFailures = contrastAudits.flatMap((audit) => (
  audit.samples
    .filter((sample) => !sample.visible || sample.ratio < 4.5)
    .map((sample) => ({ audit: audit.label, ...sample }))
));
const legibilityFailures = contrastAudits.flatMap((audit) => (
  audit.samples
    .filter((sample) => {
      const fontSize = Number.parseFloat(sample.fontSize);
      const floor = /(?:brief|microcopy|guidance|combatant)/iu.test(sample.name)
        ? 12
        : /^(Objective|Ability|Reload)/u.test(sample.name)
          ? 11
          : 10;
      return !Number.isFinite(fontSize) || fontSize < floor;
    })
    .map((sample) => ({ audit: audit.label, ...sample }))
));
const nameplateFailures = nameplateAudits.filter((audit) => audit.collisions.length > 0);

if (
  runtimeErrors.console.length
  || runtimeErrors.page.length
  || runtimeErrors.requests.length
  || layoutFailures.length
  || contrastFailures.length
  || legibilityFailures.length
  || nameplateFailures.length
) {
  console.error(JSON.stringify({
    runtimeErrors,
    layoutFailures,
    contrastFailures,
    legibilityFailures,
    nameplateFailures,
  }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Captured ${captures.length} Tournament Instrument Rev2 views to ${outputRoot}`);
}
