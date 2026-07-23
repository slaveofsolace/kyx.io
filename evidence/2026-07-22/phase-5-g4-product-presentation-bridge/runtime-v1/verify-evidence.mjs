import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = import.meta.dirname;
const repo = path.resolve(root, '..', '..', '..', '..');
const factsPath = path.join(root, 'runtime-facts.json');
const factsBytes = await readFile(factsPath);
const facts = JSON.parse(factsBytes.toString('utf8'));

assert.equal(facts.schemaVersion, 1);
assert.equal(facts.status, 'BOUNDED_G4_PRODUCT_PRESENTATION_BRIDGE_RUNTIME_PASS_G4_OPEN');
assert.equal(facts.initial.a.status, 'ready');
assert.equal(facts.initial.b.status, 'ready');

assert.equal(facts.body.presentation.lastCue, 'body');
assert.equal(facts.body.presentation.duplicateAuthorityEvents, 0);
assert.equal(facts.body.dom.hud.text, 'BODY HIT · CONFIRMED');
assert.equal(facts.body.dom.hud.dataset.audio, 'played');

assert.equal(facts.kill.shooterPresentation.lastCue, 'kill');
assert.equal(facts.kill.shooterPresentation.duplicateAuthorityEvents, 0);
assert.equal(facts.kill.shooterDom.hud.text, 'ELIMINATION · CONFIRMED');
assert.equal(facts.kill.victimLife.lifePhase, 'dead');
assert.equal(facts.kill.victimLife.healthPoints, 0);

assert.deepEqual(facts.teleport.beforePosition, { x: 0, y: 0, z: 0 });
assert.deepEqual(facts.teleport.afterPosition, { x: 0, y: 0, z: 9000 });
assert.equal(facts.teleport.presentation.lastCue, 'teleport');
assert.equal(facts.teleport.presentation.duplicateAuthorityEvents, 0);
assert.equal(facts.teleport.dom.hud.text, 'TELEPORT · CONFIRMED');
assert.equal(facts.teleport.reliableEvents.length, 1);
assert.equal(
  facts.teleport.reliableEvents[0].presentation.kind,
  'teleport_resource_confirmed',
);

assert.equal(facts.reconnect.presentation.hydrationCount, 2);
assert.equal(
  facts.reconnect.presentation.confirmedIntentCount,
  facts.reconnect.confirmedBeforeResume,
);
assert.equal(facts.reconnect.noConfirmedReplay, true);
assert.equal(facts.reconnect.noDuplicateReplay, true);
assert.equal(
  facts.reconnect.presentation.audioCueAttempts,
  facts.teleport.presentation.audioCueAttempts,
);
assert.equal(facts.reconnect.dom.hud.dataset.audio, 'not_played');
assert.equal(facts.reconnect.dom.vfx.active, 'false');
assert.equal(facts.reconnect.dom.vfx.cue, 'snapshot');

assert.deepEqual(facts.browserErrors, {
  consoleA: [],
  consoleB: [],
  pageA: [],
  pageB: [],
  requestA: [],
  requestB: [],
});

const screenshotResults = [];
for (const relativePath of [...facts.screenshots.raw, ...facts.screenshots.readableBoards]) {
  const absolutePath = path.join(root, relativePath);
  const fileStat = await stat(absolutePath);
  assert.equal(fileStat.isFile(), true);
  assert.ok(fileStat.size > 1_000, `${relativePath} is unexpectedly small`);
  const bytes = await readFile(absolutePath);
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (relativePath.includes('g4-board-')) {
    assert.deepEqual({ width, height }, { width: 1440, height: 1100 });
  }
  screenshotResults.push({
    path: relativePath,
    bytes: fileStat.size,
    width,
    height,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

const manifestPath = path.join(root, 'SHA256SUMS.txt');
const manifestBytes = await readFile(manifestPath);
const manifestEntries = manifestBytes.toString('utf8').trim().split(/\r?\n/);
for (const entry of manifestEntries) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(entry);
  assert.ok(match, `Malformed manifest entry: ${entry}`);
  const [, expectedHash, relativePath] = match;
  const bytes = await readFile(path.join(repo, relativePath));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    expectedHash,
    `Hash mismatch: ${relativePath}`,
  );
}

process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  contract: facts.status,
  capturedAt: facts.capturedAt,
  factsSha256: createHash('sha256').update(factsBytes).digest('hex'),
  manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  manifestEntries: manifestEntries.length,
  screenshots: screenshotResults,
}, null, 2)}\n`);
