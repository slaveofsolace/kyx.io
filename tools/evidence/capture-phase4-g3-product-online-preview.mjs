import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const [, , rawBaseUrl, rawOutputDirectory] = process.argv;
if (!rawBaseUrl || !rawOutputDirectory) {
  throw new Error('usage: capture-phase4-g3-product-online-preview.mjs <client-base-url> <output-directory>');
}

const baseUrl = new URL(rawBaseUrl).origin;
const outputDirectory = path.resolve(rawOutputDirectory);
await mkdir(outputDirectory, { recursive: true });

function distanceXZ(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.hypot(left.x - right.x, left.z - right.z);
}

async function fileRecord(fileName) {
  const bytes = await readFile(path.join(outputDirectory, fileName));
  return Object.freeze({
    file: fileName,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

const startedAt = new Date().toISOString();
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const contextA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const contextB = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
const errorsA = [];
const errorsB = [];
for (const [page, errors] of [[pageA, errorsA], [pageB, errorsB]]) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
}

let result;
try {
  await pageA.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await pageA.locator('#top-nav:not(.hidden)').waitFor({ timeout: 30_000 });
  const menuEntry = await pageA.locator('#online-match-button').evaluate((node) => ({
    text: node.textContent?.trim() ?? '',
    disabled: node.disabled,
    ariaDisabled: node.getAttribute('aria-disabled'),
  }));
  await pageA.screenshot({
    path: path.join(outputDirectory, 'main-menu-online-entry.png'),
    fullPage: true,
  });

  await pageA.goto(`${baseUrl}/online`, { waitUntil: 'networkidle' });
  await pageA.getByTestId('online-preview-route').waitFor();
  const landingCopy = await pageA.locator('body').innerText();
  await pageA.screenshot({
    path: path.join(outputDirectory, 'online-lobby.png'),
    fullPage: true,
  });
  await pageA.getByTestId('online-create-room').click();
  await pageA.waitForURL(/\/online\?mode=join&room=KYX-/u, { timeout: 30_000 });
  await pageA.waitForFunction(
    () => window.__KYX_ONLINE_PREVIEW__?.getSnapshot().connection === 'joined',
    null,
    { timeout: 30_000 },
  );
  const joinUrl = pageA.url();
  const roomCode = new URL(joinUrl).searchParams.get('room');

  await pageB.goto(joinUrl, { waitUntil: 'domcontentloaded' });
  await pageB.waitForFunction(
    () => window.__KYX_ONLINE_PREVIEW__?.getSnapshot().connection === 'joined',
    null,
    { timeout: 30_000 },
  );
  await pageA.waitForFunction(
    () => window.__KYX_ONLINE_PREVIEW__?.getSnapshot().remotePlayers === 1,
    null,
    { timeout: 30_000 },
  );
  await pageB.waitForFunction(
    () => window.__KYX_ONLINE_PREVIEW__?.getSnapshot().remotePlayers === 1,
    null,
    { timeout: 30_000 },
  );

  const beforeMoveA = await pageA.evaluate(() => window.__KYX_ONLINE_PREVIEW__?.getSnapshot());
  await pageA.keyboard.down('KeyD');
  await pageA.waitForTimeout(1_000);
  await pageA.keyboard.up('KeyD');
  await pageA.waitForTimeout(750);
  const afterMoveA = await pageA.evaluate(() => window.__KYX_ONLINE_PREVIEW__?.getSnapshot());
  const afterMoveB = await pageB.evaluate(() => window.__KYX_ONLINE_PREVIEW__?.getSnapshot());

  await pageA.getByTestId('online-resume').click();
  await pageA.waitForFunction(() => {
    const snapshot = window.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return snapshot?.connection === 'joined' && snapshot.resumeSuccesses >= 1;
  }, null, { timeout: 30_000 });
  await pageA.waitForTimeout(500);
  const afterResumeA = await pageA.evaluate(() => window.__KYX_ONLINE_PREVIEW__?.getSnapshot());
  const finalB = await pageB.evaluate(() => window.__KYX_ONLINE_PREVIEW__?.getSnapshot());
  await pageA.screenshot({
    path: path.join(outputDirectory, 'online-room-a-resumed.png'),
    fullPage: true,
  });
  await pageB.screenshot({
    path: path.join(outputDirectory, 'online-room-b-peer.png'),
    fullPage: true,
  });

  const movementMillimeters = distanceXZ(
    beforeMoveA?.localPredictedPosition,
    afterMoveA?.localPredictedPosition,
  );
  const peerDistanceMillimeters = Math.min(
    ...(afterMoveB?.remotePositions ?? []).map((position) => (
      distanceXZ(afterMoveA?.localPredictedPosition, position)
    )),
  );
  const checks = Object.freeze({
    menuEntryEnabled: menuEntry.disabled === false && menuEntry.ariaDisabled === 'false',
    menuEntryNamesPreview: menuEntry.text === 'ONLINE MOVEMENT PREVIEW',
    landingDisclosesMovementOnly: landingCopy.includes('Combat presentation, matchmaking, progression, and release readiness are not included yet.'),
    landingDisclosesLocalGuest: landingCopy.includes('no password or account data is collected'),
    authorityCreatedValidRoom: /^KYX-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/u.test(roomCode ?? ''),
    bothClientsJoined: afterMoveA?.connection === 'joined' && afterMoveB?.connection === 'joined',
    sameMatch: afterMoveA?.matchId !== null && afterMoveA?.matchId === afterMoveB?.matchId,
    distinctPlayers: afterMoveA?.playerId !== null && afterMoveB?.playerId !== null && afterMoveA?.playerId !== afterMoveB?.playerId,
    eachSeesOneRemote: afterMoveA?.remotePlayers === 1 && afterMoveB?.remotePlayers === 1,
    localMovementAdvanced: movementMillimeters >= 500,
    peerRenderedMovedPlayer: Number.isFinite(peerDistanceMillimeters) && peerDistanceMillimeters <= 1_500,
    snapshotsFlowed: (afterMoveA?.fullSnapshots ?? 0) >= 1 && (afterMoveA?.deltaSnapshots ?? 0) >= 1,
    inputsAcknowledged: (afterMoveA?.inputAcks ?? 0) >= 1,
    resumeSucceeded: afterResumeA?.connection === 'joined' && (afterResumeA?.resumeSuccesses ?? 0) >= 1,
    resumeKeptIdentity: afterResumeA?.playerId === afterMoveA?.playerId && afterResumeA?.matchId === afterMoveA?.matchId,
    peerStayedJoined: finalB?.connection === 'joined' && finalB?.remotePlayers === 1,
    noBrowserErrors: errorsA.length === 0 && errorsB.length === 0,
  });
  const screenshotFiles = [
    'main-menu-online-entry.png',
    'online-lobby.png',
    'online-room-a-resumed.png',
    'online-room-b-peer.png',
  ];
  const screenshots = await Promise.all(screenshotFiles.map(fileRecord));
  result = {
    schemaVersion: 1,
    evidence: 'PHASE4_G3_PRODUCT_ONLINE_PREVIEW',
    claim: 'PRODUCT_PATH_INTEGRATION_ONLY_G3_NOT_ACCEPTED',
    startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl,
    joinPath: new URL(joinUrl).pathname + new URL(joinUrl).search,
    roomCode,
    menuEntry,
    movementMillimeters,
    peerDistanceMillimeters,
    snapshots: { beforeMoveA, afterMoveA, afterMoveB, afterResumeA, finalB },
    errors: { clientA: errorsA, clientB: errorsB },
    screenshots,
    checks,
    verdict: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
  };
} catch (error) {
  result = {
    schemaVersion: 1,
    evidence: 'PHASE4_G3_PRODUCT_ONLINE_PREVIEW',
    claim: 'PRODUCT_PATH_INTEGRATION_ONLY_G3_NOT_ACCEPTED',
    startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl,
    errors: { clientA: errorsA, clientB: errorsB, capture: String(error?.stack ?? error) },
    verdict: 'FAIL',
  };
} finally {
  await contextA.close();
  await contextB.close();
  await browser.close();
}

const outputPath = path.join(outputDirectory, 'product-online-preview-runtime.json');
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ outputPath, verdict: result.verdict })}\n`);
if (result.verdict !== 'PASS') process.exitCode = 1;
