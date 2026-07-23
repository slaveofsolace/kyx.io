import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

function option(name, fallback) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function positiveInteger(name, fallback) {
  const parsed = Number.parseInt(option(name, String(fallback)), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

function normalizeBaseUrl(value) {
  const result = new URL(value);
  if (!['http:', 'https:'].includes(result.protocol)) {
    throw new Error('--base-url must use http or https');
  }
  if (result.username || result.password) {
    throw new Error('--base-url must not contain credentials');
  }
  result.hash = '';
  result.search = '';
  if (!result.pathname.endsWith('/')) result.pathname += '/';
  return result;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function serializeError(error) {
  return {
    name: error?.name ?? null,
    message: error?.message ?? String(error),
    stack: error?.stack ?? null,
  };
}

function progress(step) {
  console.error(`[phase1-truth] ${new Date().toISOString()} ${step}`);
}

function parseJsonOrNull(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const baseUrl = normalizeBaseUrl(option('base-url', option('url', 'http://127.0.0.1:5999/')));
const outputDirectory = path.resolve(
  option('output-dir', option('output', 'evidence/phase-1-truth')),
);
const width = positiveInteger('width', 1920);
const height = positiveInteger('height', 1080);
const timeoutMs = positiveInteger('timeout-ms', 60_000);
const seed = positiveInteger('seed', 19_072_026);
const screenshotsDirectory = path.join(outputDirectory, 'screenshots');
const summaryPath = path.join(outputDirectory, 'phase1-truth-summary.json');

const routeUrl = (route) => new URL(String(route).replace(/^\/+/, ''), baseUrl).href;
const expectedOrigin = baseUrl.origin;
const expectedHomePath = baseUrl.pathname;

const summary = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  baseUrl: baseUrl.href,
  expectedOrigin,
  viewport: { width, height, deviceScaleFactor: 1 },
  seed,
  browserVersion: null,
  requirements: {
    routes: [baseUrl.href, routeUrl('login'), routeUrl('register')],
    network: 'Every application request must remain same-origin; no application WebSocket may open. Vite HMR is recorded separately when a development server is used.',
    profile: 'Fresh, returning, and one-way legacy migration paths use a password-free local guest profile.',
    shell: 'Offline Practice is primary and visibly identifies one local player and seven bots.',
    gameplay: 'The HUD and scoreboard identify practice bots and contain no fabricated currency.',
    containment: 'Mobile and coarse-pointer clients receive the desktop-required boundary.',
  },
  checks: [],
  failures: [],
  scenarios: {},
  network: {},
  screenshots: [],
  errors: [],
};

function check(id, passed, details = {}) {
  const record = { id, passed: Boolean(passed), details };
  summary.checks.push(record);
  if (!record.passed) summary.failures.push(record);
  return record.passed;
}

function scenarioRecord(id) {
  const scenario = {
    id,
    routes: [],
    observations: {},
    diagnostics: [],
    errors: [],
  };
  summary.scenarios[id] = scenario;
  return scenario;
}

function monitorPage(page, label) {
  const requestRecords = new Map();
  const webSockets = [];
  const consoleEntries = [];
  const pageErrors = [];

  page.on('request', (request) => {
    requestRecords.set(request, {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      status: null,
      failure: null,
    });
  });
  page.on('response', (response) => {
    const request = response.request();
    const record = requestRecords.get(request) ?? {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failure: null,
    };
    record.status = response.status();
    requestRecords.set(request, record);
  });
  page.on('requestfailed', (request) => {
    const record = requestRecords.get(request) ?? {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      status: null,
    };
    record.failure = request.failure()?.errorText ?? 'unknown request failure';
    requestRecords.set(request, record);
  });
  page.on('websocket', (socket) => {
    const record = {
      url: socket.url(),
      framesSent: 0,
      framesReceived: 0,
      socketErrors: [],
    };
    webSockets.push(record);
    socket.on('framesent', () => { record.framesSent += 1; });
    socket.on('framereceived', () => { record.framesReceived += 1; });
    socket.on('socketerror', (error) => { record.socketErrors.push(String(error)); });
  });
  page.on('console', (message) => {
    consoleEntries.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
    });
  });
  page.on('pageerror', (error) => pageErrors.push(serializeError(error)));

  return {
    label,
    snapshot() {
      const requests = [...requestRecords.values()];
      const httpRequests = requests.filter((record) => {
        try {
          return ['http:', 'https:'].includes(new URL(record.url).protocol);
        } catch {
          return false;
        }
      });
      const origins = [...new Set(httpRequests.map((record) => new URL(record.url).origin))].sort();
      const externalRequests = httpRequests.filter(
        (record) => new URL(record.url).origin !== expectedOrigin,
      );
      const httpErrors = httpRequests.filter((record) => (
        Number.isInteger(record.status) && record.status >= 400
      ));
      const failedRequests = requests.filter((record) => record.failure);
      const meaningfulFailures = failedRequests.filter(
        (record) => !/ERR_ABORTED/iu.test(record.failure),
      );
      const viteClientRequested = httpRequests.some((record) => {
        try {
          return new URL(record.url).pathname.endsWith('/@vite/client');
        } catch {
          return false;
        }
      });
      const toolingWebSockets = webSockets.filter((record) => {
        if (!viteClientRequested) return false;
        try {
          const socket = new URL(record.url);
          const socketHttpOrigin = `${socket.protocol === 'wss:' ? 'https:' : 'http:'}//${socket.host}`;
          return socketHttpOrigin === expectedOrigin
            && socket.searchParams.has('token')
            && (socket.pathname === '/' || socket.pathname === baseUrl.pathname);
        } catch {
          return false;
        }
      });
      const toolingWebSocketSet = new Set(toolingWebSockets);
      const applicationWebSockets = webSockets.filter(
        (record) => !toolingWebSocketSet.has(record),
      );
      return {
        requestCount: requests.length,
        origins,
        externalRequests,
        httpErrors,
        failedRequests,
        meaningfulFailures,
        webSockets,
        toolingWebSockets,
        applicationWebSockets,
        consoleEntries,
        pageErrors,
      };
    },
  };
}

function finalizeMonitor(id, monitor) {
  if (!monitor) return;
  const network = monitor.snapshot();
  summary.network[id] = network;
  check(`${id}.same_origin_requests`, network.externalRequests.length === 0, {
    expectedOrigin,
    origins: network.origins,
    externalRequests: network.externalRequests,
  });
  check(`${id}.no_application_websockets`, network.applicationWebSockets.length === 0, {
    applicationWebSockets: network.applicationWebSockets,
    toolingWebSockets: network.toolingWebSockets,
  });
  check(`${id}.no_page_errors`, network.pageErrors.length === 0, {
    pageErrors: network.pageErrors,
  });
  check(`${id}.no_console_errors`, (
    network.consoleEntries.filter((entry) => entry.type === 'error').length === 0
  ), {
    consoleErrors: network.consoleEntries.filter((entry) => entry.type === 'error'),
  });
  check(`${id}.no_http_errors`, network.httpErrors.length === 0, {
    httpErrors: network.httpErrors,
  });
  check(`${id}.no_failed_requests`, network.meaningfulFailures.length === 0, {
    failedRequests: network.failedRequests,
  });
}

async function addDeterministicRandomness(context) {
  await context.addInitScript(({ captureSeed }) => {
    let state = captureSeed >>> 0;
    Math.random = () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
  }, { captureSeed: seed });
}

async function navigate(page, url, id, scenario) {
  progress(`${scenario.id}: navigating ${id} -> ${url}`);
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });
  const status = response?.status() ?? null;
  scenario.routes.push({ id, url: page.url(), status });
  check(`${scenario.id}.${id}.document_ok`, Boolean(response?.ok()), {
    requestedUrl: url,
    finalUrl: page.url(),
    status,
  });
  try {
    await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 15_000) });
  } catch (error) {
    scenario.diagnostics.push({
      step: `${id}.networkidle`,
      note: 'Network-idle was not reached; element-level waits continue.',
      error: serializeError(error),
    });
  }
  return response;
}

async function inspectRoute(page, scenario, id) {
  const observation = await page.evaluate(() => {
    const declaredUrls = [];
    for (const element of document.querySelectorAll('[src], [href]')) {
      const raw = element.getAttribute('src') ?? element.getAttribute('href');
      if (!raw) continue;
      try {
        const absolute = new URL(raw, location.href);
        if (['http:', 'https:'].includes(absolute.protocol)) {
          declaredUrls.push({
            tag: element.tagName.toLowerCase(),
            attribute: element.hasAttribute('src') ? 'src' : 'href',
            raw,
            absolute: absolute.href,
            origin: absolute.origin,
          });
        }
      } catch {
        // Invalid declarations are covered by browser diagnostics and HTTP checks.
      }
    }
    const passwordControls = [...document.querySelectorAll('input')]
      .filter((input) => (
        input.type.toLowerCase() === 'password'
        || /password/iu.test(input.autocomplete || '')
        || /password/iu.test(input.name || '')
        || /password/iu.test(input.id || '')
      ))
      .map((input) => ({
        id: input.id,
        name: input.name,
        type: input.type,
        autocomplete: input.autocomplete,
      }));
    return {
      title: document.title,
      url: location.href,
      pathname: location.pathname,
      visibleText: document.body?.innerText ?? '',
      passwordControls,
      declaredUrls,
      formCount: document.forms.length,
    };
  });
  observation.visibleText = normalizeText(observation.visibleText);
  observation.externalDeclarations = observation.declaredUrls.filter(
    (declaration) => declaration.origin !== expectedOrigin,
  );
  scenario.observations[id] = observation;

  check(`${scenario.id}.${id}.password_free`, (
    observation.passwordControls.length === 0
    && !/\bpasswords?\b/iu.test(observation.visibleText)
  ), {
    passwordControls: observation.passwordControls,
    passwordTextPresent: /\bpasswords?\b/iu.test(observation.visibleText),
  });
  check(`${scenario.id}.${id}.same_origin_markup`, observation.externalDeclarations.length === 0, {
    externalDeclarations: observation.externalDeclarations,
  });
  return observation;
}

async function captureScreenshot(page, scenario, filename) {
  const absolutePath = path.join(screenshotsDirectory, filename);
  try {
    await page.screenshot({
      path: absolutePath,
      animations: 'disabled',
      timeout: timeoutMs,
    });
    const relativePath = path.relative(outputDirectory, absolutePath).replaceAll('\\', '/');
    summary.screenshots.push(relativePath);
    scenario.observations.screenshots ??= [];
    scenario.observations.screenshots.push(relativePath);
    check(`${scenario.id}.screenshot.${filename}`, true, { path: relativePath });
  } catch (error) {
    check(`${scenario.id}.screenshot.${filename}`, false, { error: serializeError(error) });
  }
}

async function readStorage(page) {
  return page.evaluate(() => {
    const read = (storage) => Object.fromEntries(
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter(Boolean)
        .sort()
        .map((key) => [key, storage.getItem(key)]),
    );
    return {
      local: read(localStorage),
      session: read(sessionStorage),
    };
  });
}

function checkCanonicalProfile(id, storage, expectedDisplayName, credentialMarker = null) {
  const raw = storage.local.kyx_local_profile ?? null;
  const profile = parseJsonOrNull(raw);
  const expectedKeys = ['displayName', 'kind', 'version'];
  const actualKeys = profile && typeof profile === 'object' ? Object.keys(profile).sort() : [];
  check(`${id}.canonical_profile`, (
    profile?.kind === 'local_guest'
    && profile?.version === 1
    && profile?.displayName === expectedDisplayName
    && JSON.stringify(actualKeys) === JSON.stringify(expectedKeys)
  ), { profile, actualKeys, expectedKeys });

  const legacyKeys = ['sio_accounts', 'sio_session'];
  const survivingLegacy = [];
  for (const area of ['local', 'session']) {
    for (const key of legacyKeys) {
      if (Object.hasOwn(storage[area], key)) survivingLegacy.push(`${area}:${key}`);
    }
  }
  check(`${id}.legacy_credentials_scrubbed`, survivingLegacy.length === 0, {
    survivingLegacy,
  });

  if (credentialMarker) {
    const serializedStorage = JSON.stringify(storage);
    check(`${id}.credential_material_not_migrated`, !serializedStorage.includes(credentialMarker), {
      credentialMarkerPresent: serializedStorage.includes(credentialMarker),
    });
  }
  return profile;
}

async function runDesktopFlow(browser) {
  const scenario = scenarioRecord('desktop_flow');
  let context;
  let monitor;
  let page;
  try {
    progress('desktop_flow: fresh, returning, shell, HUD, and scoreboard checks');
    context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    await addDeterministicRandomness(context);
    page = await context.newPage();
    monitor = monitorPage(page, scenario.id);

    await navigate(page, baseUrl.href, 'fresh_home', scenario);
    await page.locator('#play-btn').waitFor({ state: 'visible', timeout: timeoutMs });
    await page.waitForTimeout(500);
    const freshHome = await inspectRoute(page, scenario, 'fresh_home');
    const freshStorage = await readStorage(page);
    scenario.observations.freshStorage = freshStorage;
    check(`${scenario.id}.fresh_profile_absent`, !Object.hasOwn(freshStorage.local, 'kyx_local_profile'), {
      storedProfile: freshStorage.local.kyx_local_profile ?? null,
    });
    check(`${scenario.id}.fresh_home_truthful`, (
      /OFFLINE PRACTICE/iu.test(freshHome.visibleText)
      && /START OFFLINE PRACTICE/iu.test(freshHome.visibleText)
      && /1 LOCAL PLAYER\s*\/\s*7 BOTS/iu.test(freshHome.visibleText)
    ), { visibleText: freshHome.visibleText.slice(0, 2_000) });
    await captureScreenshot(page, scenario, `phase1-fresh-home-${width}x${height}.png`);

    await navigate(page, routeUrl('login'), 'login_fresh', scenario);
    const profileName = page.locator('#profile-name');
    await profileName.waitFor({ state: 'visible', timeout: timeoutMs });
    const freshLogin = await inspectRoute(page, scenario, 'login_fresh');
    check(`${scenario.id}.login_is_local_guest_profile`, (
      /LOCAL GUEST PROFILE/iu.test(freshLogin.visibleText)
      && /STORED ONLY IN THIS BROWSER/iu.test(freshLogin.visibleText)
      && /NOT AN ONLINE ACCOUNT/iu.test(freshLogin.visibleText)
    ), { visibleText: freshLogin.visibleText });
    await captureScreenshot(page, scenario, `phase1-login-fresh-${width}x${height}.png`);

    const freshDisplayName = 'Phase One Guest';
    progress('desktop_flow: saving fresh local guest profile');
    await profileName.fill(freshDisplayName);
    await Promise.all([
      page.waitForURL((candidate) => (
        candidate.origin === expectedOrigin && candidate.pathname === expectedHomePath
      ), { timeout: timeoutMs }),
      page.locator('#profile-submit').click(),
    ]);
    await page.locator('#play-btn').waitFor({ state: 'visible', timeout: timeoutMs });
    const savedStorage = await readStorage(page);
    scenario.observations.savedStorage = savedStorage;
    checkCanonicalProfile(`${scenario.id}.fresh_save`, savedStorage, freshDisplayName);
    check(`${scenario.id}.fresh_save_displayed`, (
      normalizeText(await page.locator('#nav-username').innerText()) === freshDisplayName
    ), {
      navUsername: normalizeText(await page.locator('#nav-username').innerText()),
    });

    await navigate(page, routeUrl('register'), 'register_returning', scenario);
    await page.locator('#profile-name').waitFor({ state: 'visible', timeout: timeoutMs });
    const registerRoute = await inspectRoute(page, scenario, 'register_returning');
    const registerValue = await page.locator('#profile-name').inputValue();
    check(`${scenario.id}.register_is_same_local_profile_flow`, (
      /LOCAL GUEST PROFILE/iu.test(registerRoute.visibleText)
      && registerValue === freshDisplayName
      && !/\b(?:REGISTER|SIGN UP|CREATE ACCOUNT)\b/iu.test(registerRoute.visibleText)
    ), { registerValue, visibleText: registerRoute.visibleText });
    await captureScreenshot(page, scenario, `phase1-register-returning-${width}x${height}.png`);

    await navigate(page, routeUrl('login'), 'login_returning', scenario);
    await page.locator('#profile-name').waitFor({ state: 'visible', timeout: timeoutMs });
    const returningLogin = await inspectRoute(page, scenario, 'login_returning');
    const returningValue = await page.locator('#profile-name').inputValue();
    check(`${scenario.id}.returning_profile_prefilled`, (
      /LOCAL GUEST PROFILE/iu.test(returningLogin.visibleText)
      && returningValue === freshDisplayName
    ), { returningValue });
    await captureScreenshot(page, scenario, `phase1-login-returning-${width}x${height}.png`);

    await navigate(page, baseUrl.href, 'returning_home', scenario);
    await page.locator('#play-btn').waitFor({ state: 'visible', timeout: timeoutMs });
    await page.waitForTimeout(500);
    const returningHome = await inspectRoute(page, scenario, 'returning_home');
    const shell = await page.evaluate(() => ({
      playText: document.getElementById('play-btn')?.textContent ?? '',
      offlineNavText: document.querySelector('.practice-nav-mode')?.textContent ?? '',
      mapPreviewText: document.querySelector('.map-preview-window')?.textContent ?? '',
      populationText: document.querySelector('.practice-population')?.textContent ?? '',
      localProfileLabel: document.querySelector('.local-profile-kicker')?.textContent ?? '',
      onlineText: document.querySelector('.online-unavailable')?.textContent ?? '',
      onlineDisabled: document.querySelector('.online-unavailable')?.disabled ?? false,
      forbiddenCurrencyNodes: [...document.querySelectorAll(
        '[id*="coin" i], [class*="coin" i], [id*="currency" i], [class*="currency" i], #lb-earned-val',
      )].map((element) => ({ id: element.id, className: element.className })),
    }));
    scenario.observations.shell = shell;
    check(`${scenario.id}.offline_shell`, (
      normalizeText(shell.playText) === 'START OFFLINE PRACTICE'
      && normalizeText(shell.offlineNavText) === 'OFFLINE PRACTICE'
      && normalizeText(shell.mapPreviewText) === 'MAP PREVIEW'
      && normalizeText(shell.populationText) === '1 LOCAL PLAYER / 7 BOTS'
      && normalizeText(shell.localProfileLabel) === 'LOCAL GUEST PROFILE'
    ), { shell });
    check(`${scenario.id}.online_match_disabled`, (
      shell.onlineDisabled
      && /ONLINE MATCH\s*[—-]\s*NOT AVAILABLE/iu.test(normalizeText(shell.onlineText))
    ), { onlineText: normalizeText(shell.onlineText), onlineDisabled: shell.onlineDisabled });
    const menuCurrencyClaims = returningHome.visibleText.match(
      /\b(?:E-?COINS?|CURRENCY|WALLET|MARKET|BATTLE PASS|YOU EARNED)\b/giu,
    ) ?? [];
    check(`${scenario.id}.menu_has_no_fake_currency`, (
      menuCurrencyClaims.length === 0 && shell.forbiddenCurrencyNodes.length === 0
    ), { menuCurrencyClaims, forbiddenCurrencyNodes: shell.forbiddenCurrencyNodes });
    await captureScreenshot(page, scenario, `phase1-returning-home-${width}x${height}.png`);

    progress('desktop_flow: starting Offline Practice');
    await page.locator('#play-btn').click();
    await page.locator('#hud').waitFor({ state: 'visible', timeout: timeoutMs });
    try {
      await page.locator('#map-loading').waitFor({ state: 'hidden', timeout: 15_000 });
    } catch (error) {
      scenario.diagnostics.push({
        step: 'gameplay.map_loading_hidden',
        error: serializeError(error),
      });
    }
    await page.waitForTimeout(750);
    const gameplay = await page.evaluate(() => ({
      hudText: document.getElementById('hud')?.innerText ?? '',
      practiceStatus: document.getElementById('server-pop')?.textContent ?? '',
      modeInfo: document.getElementById('mode-info')?.textContent ?? '',
      botNameplates: [...document.querySelectorAll('.np-name')].map(
        (element) => element.textContent ?? '',
      ),
      visibleText: document.body?.innerText ?? '',
    }));
    for (const key of ['hudText', 'practiceStatus', 'modeInfo', 'visibleText']) {
      gameplay[key] = normalizeText(gameplay[key]);
    }
    gameplay.botNameplates = gameplay.botNameplates.map(normalizeText);
    scenario.observations.gameplay = gameplay;
    check(`${scenario.id}.truthful_hud`, (
      /OFFLINE PRACTICE/iu.test(gameplay.hudText)
      && /7 BOTS/iu.test(gameplay.hudText)
      && !/\bPLAYERS?\b/iu.test(gameplay.hudText)
    ), { hudText: gameplay.hudText, practiceStatus: gameplay.practiceStatus });
    check(`${scenario.id}.explicit_bot_nameplates`, (
      gameplay.botNameplates.length > 0
      && gameplay.botNameplates.every((name) => /^PRACTICE BOT \d{2}$/u.test(name))
    ), {
      note: 'Only bots currently projected into the viewport render nameplates; the scoreboard verifies the full seven-bot roster.',
      botNameplates: gameplay.botNameplates,
    });
    const gameplayCurrencyClaims = gameplay.visibleText.match(
      /\b(?:E-?COINS?|CURRENCY|WALLET|MARKET|BATTLE PASS|YOU EARNED)\b/giu,
    ) ?? [];
    check(`${scenario.id}.gameplay_has_no_fake_currency`, gameplayCurrencyClaims.length === 0, {
      gameplayCurrencyClaims,
    });
    await captureScreenshot(page, scenario, `phase1-gameplay-${width}x${height}.png`);

    progress('desktop_flow: inspecting live practice scoreboard');
    await page.keyboard.down('Tab');
    try {
      await page.locator('#scoreboard-overlay').waitFor({ state: 'visible', timeout: 10_000 });
      await page.waitForFunction(
        () => document.querySelectorAll('#sb-rows tr').length >= 8,
        null,
        { timeout: 10_000 },
      );
      const scoreboard = await page.evaluate(() => ({
        heading: document.querySelector('#scoreboard-overlay .sb-title')?.textContent ?? '',
        subheading: document.getElementById('sb-sub')?.textContent ?? '',
        visibleText: document.getElementById('scoreboard-overlay')?.innerText ?? '',
        rows: [...document.querySelectorAll('#sb-rows tr')].map((row) => ({
          text: row.innerText,
          cells: [...row.cells].map((cell) => cell.innerText.trim()),
        })),
      }));
      scoreboard.heading = normalizeText(scoreboard.heading);
      scoreboard.subheading = normalizeText(scoreboard.subheading);
      scoreboard.visibleText = normalizeText(scoreboard.visibleText);
      scoreboard.rows = scoreboard.rows.map((row) => ({
        text: normalizeText(row.text),
        cells: row.cells.map(normalizeText),
      }));
      scenario.observations.scoreboard = scoreboard;

      const botRows = scoreboard.rows.filter((row) => /^PRACTICE BOT \d{2}$/u.test(row.cells[1]));
      const botNames = botRows.map((row) => row.cells[1]);
      const botStatsUnknown = botRows.every((row) => row.cells.slice(-2).every(
        (value) => value === '—' || value === '-',
      ));
      check(`${scenario.id}.scoreboard_truthful_population`, (
        scoreboard.rows.length === 8
        && botRows.length === 7
        && new Set(botNames).size === 7
        && /OFFLINE PRACTICE/iu.test(scoreboard.subheading)
      ), {
        rowCount: scoreboard.rows.length,
        botNames,
        subheading: scoreboard.subheading,
      });
      check(`${scenario.id}.scoreboard_does_not_fabricate_bot_stats`, botStatsUnknown, {
        botRows,
      });
      const scoreboardCurrencyClaims = scoreboard.visibleText.match(
        /\b(?:E-?COINS?|CURRENCY|WALLET|MARKET|BATTLE PASS|YOU EARNED)\b/giu,
      ) ?? [];
      check(`${scenario.id}.scoreboard_has_no_fake_currency`, scoreboardCurrencyClaims.length === 0, {
        scoreboardCurrencyClaims,
      });
      await captureScreenshot(page, scenario, `phase1-scoreboard-${width}x${height}.png`);
    } finally {
      await page.keyboard.up('Tab').catch(() => {});
    }

    check(`${scenario.id}.completed`, true, {
      routes: scenario.routes.map((route) => route.url),
    });
  } catch (error) {
    const serialized = serializeError(error);
    scenario.errors.push(serialized);
    check(`${scenario.id}.completed`, false, { error: serialized });
    if (page) await captureScreenshot(page, scenario, `phase1-desktop-failure-${width}x${height}.png`);
  } finally {
    finalizeMonitor(scenario.id, monitor);
    await context?.close().catch((error) => scenario.errors.push(serializeError(error)));
  }
}

async function runMigrationFlow(browser) {
  const scenario = scenarioRecord('legacy_migration');
  const credentialMarker = 'PHASE1_LEGACY_SECRET_MUST_NOT_SURVIVE';
  const sentinelKey = '__phase1_evidence_migration_seeded';
  let context;
  let monitor;
  let page;
  try {
    progress('legacy_migration: seeding and verifying one-way credential cleanup');
    context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    await addDeterministicRandomness(context);
    await context.addInitScript(({ marker, sentinel }) => {
      try {
        if (localStorage.getItem(sentinel)) return;
        localStorage.setItem(sentinel, '1');
        localStorage.setItem('sio_accounts', JSON.stringify({
          accounts: {
            legacy_ranger: {
              displayName: 'Migrated Ranger',
              passwordHash: marker,
              stats: { kills: 999_999, score: 999_999 },
            },
          },
        }));
        localStorage.setItem('sio_session', 'legacy_ranger');
        sessionStorage.setItem('sio_session', 'legacy_ranger');
      } catch {
        // about:blank and restricted documents may deny storage before navigation.
      }
    }, { marker: credentialMarker, sentinel: sentinelKey });

    page = await context.newPage();
    monitor = monitorPage(page, scenario.id);
    await navigate(page, routeUrl('login'), 'login_migration', scenario);
    await page.locator('#profile-name').waitFor({ state: 'visible', timeout: timeoutMs });
    const route = await inspectRoute(page, scenario, 'login_migration');
    const migratedValue = await page.locator('#profile-name').inputValue();
    check(`${scenario.id}.display_name_migrated`, (
      migratedValue === 'Migrated Ranger'
      && /LOCAL GUEST PROFILE/iu.test(route.visibleText)
    ), { migratedValue });

    await page.evaluate((sentinel) => localStorage.removeItem(sentinel), sentinelKey);
    const migratedStorage = await readStorage(page);
    scenario.observations.migratedStorage = migratedStorage;
    checkCanonicalProfile(
      `${scenario.id}.migration`,
      migratedStorage,
      'Migrated Ranger',
      credentialMarker,
    );
    await captureScreenshot(page, scenario, `phase1-profile-migrated-${width}x${height}.png`);
    check(`${scenario.id}.completed`, true);
  } catch (error) {
    const serialized = serializeError(error);
    scenario.errors.push(serialized);
    check(`${scenario.id}.completed`, false, { error: serialized });
    if (page) await captureScreenshot(page, scenario, `phase1-migration-failure-${width}x${height}.png`);
  } finally {
    finalizeMonitor(scenario.id, monitor);
    await context?.close().catch((error) => scenario.errors.push(serializeError(error)));
  }
}

async function runMobileContainment(browser) {
  const scenario = scenarioRecord('mobile_containment');
  let context;
  let monitor;
  let page;
  try {
    progress('mobile_containment: verifying desktop-required boundary');
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      screen: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Phase1Evidence) AppleWebKit/537.36 Chrome/149.0.0.0 Mobile Safari/537.36',
    });
    await addDeterministicRandomness(context);
    page = await context.newPage();
    monitor = monitorPage(page, scenario.id);
    await navigate(page, baseUrl.href, 'mobile_home', scenario);
    const route = await inspectRoute(page, scenario, 'mobile_home');
    await page.locator('#desktop-required-overlay').waitFor({ state: 'visible', timeout: timeoutMs });
    const containment = await page.evaluate(() => {
      const playButton = document.getElementById('play-btn');
      const playStyle = playButton ? getComputedStyle(playButton) : null;
      const playRect = playButton?.getBoundingClientRect();
      return {
        launchSupport: document.body.dataset.launchSupport ?? null,
        overlayText: document.getElementById('desktop-required-overlay')?.innerText ?? '',
        canvasAriaHidden: document.getElementById('game-canvas')?.getAttribute('aria-hidden'),
        devMetricsPresent: Boolean(document.getElementById('game-canvas')?.dataset.kyxDevMetrics),
        hudHidden: document.getElementById('hud')?.classList.contains('hidden') ?? false,
        playVisible: Boolean(
          playButton
          && playStyle?.visibility !== 'hidden'
          && playStyle?.display !== 'none'
          && playRect?.width
          && playRect?.height
        ),
      };
    });
    containment.overlayText = normalizeText(containment.overlayText);
    scenario.observations.containment = containment;
    check(`${scenario.id}.desktop_required_boundary`, (
      containment.launchSupport === 'desktop-required'
      && containment.canvasAriaHidden === 'true'
      && containment.hudHidden
      && !containment.playVisible
      && !containment.devMetricsPresent
      && /DESKTOP REQUIRED/iu.test(containment.overlayText)
      && /KEYBOARD AND MOUSE/iu.test(containment.overlayText)
      && /TOUCH CONTROLS ARE NOT PART OF THIS BUILD/iu.test(containment.overlayText)
    ), { containment, visibleText: route.visibleText });
    await captureScreenshot(page, scenario, 'phase1-mobile-desktop-required-390x844.png');
    check(`${scenario.id}.completed`, true);
  } catch (error) {
    const serialized = serializeError(error);
    scenario.errors.push(serialized);
    check(`${scenario.id}.completed`, false, { error: serialized });
    if (page) await captureScreenshot(page, scenario, 'phase1-mobile-failure-390x844.png');
  } finally {
    finalizeMonitor(scenario.id, monitor);
    await context?.close().catch((error) => scenario.errors.push(serializeError(error)));
  }
}

await mkdir(screenshotsDirectory, { recursive: true });
progress(`preflight: ${baseUrl.href}`);

let browser;
const startedAt = Date.now();
try {
  let preflightResponse;
  try {
    preflightResponse = await fetch(baseUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(Math.min(timeoutMs, 10_000)),
    });
    check('preflight.server_available', preflightResponse.ok, {
      url: preflightResponse.url,
      status: preflightResponse.status,
    });
  } catch (error) {
    check('preflight.server_available', false, {
      url: baseUrl.href,
      error: serializeError(error),
    });
  } finally {
    await preflightResponse?.body?.cancel().catch(() => {});
  }

  if (!summary.checks.find((entry) => entry.id === 'preflight.server_available')?.passed) {
    throw new Error(`No healthy server responded at ${baseUrl.href}`);
  }

  browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
  });
  summary.browserVersion = browser.version();
  progress(`browser ready: Chromium ${summary.browserVersion}`);

  await runDesktopFlow(browser);
  await runMigrationFlow(browser);
  await runMobileContainment(browser);
  check('harness.completed', true, {
    scenarioCount: Object.keys(summary.scenarios).length,
  });
} catch (error) {
  const serialized = serializeError(error);
  summary.errors.push(serialized);
  check('harness.completed', false, { error: serialized });
} finally {
  await browser?.close().catch((error) => summary.errors.push(serializeError(error)));
}

summary.completedAt = new Date().toISOString();
summary.durationMs = Date.now() - startedAt;
summary.ok = summary.failures.length === 0 && summary.errors.length === 0;

await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
progress(`complete: ${summary.ok ? 'PASS' : 'FAIL'} (${summary.checks.length} checks, ${summary.failures.length} failures)`);

console.log(JSON.stringify({
  ok: summary.ok,
  baseUrl: baseUrl.href,
  outputDirectory,
  summaryPath,
  checks: summary.checks.length,
  failures: summary.failures.map((failure) => failure.id),
  screenshots: summary.screenshots,
}, null, 2));

if (!summary.ok) process.exitCode = 1;
