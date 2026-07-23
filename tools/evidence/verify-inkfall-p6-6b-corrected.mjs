import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const evidenceRoot = 'evidence/2026-07-22/phase-6-p6-6b-residual-correction/corrected';
const summaryPath = `${evidenceRoot}/p6-6b-summary.json`;
const verificationPath = process.argv[2] ?? `${evidenceRoot}/p6-6b-verification.json`;

async function json(relativePath) {
  return JSON.parse(await readFile(resolve(repoRoot, relativePath), 'utf8'));
}

async function sha256(relativePath) {
  return createHash('sha256')
    .update(await readFile(resolve(repoRoot, relativePath)))
    .digest('hex');
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function scenario(result, playerCount) {
  const found = result.scenarios.find((candidate) => candidate.playerCount === playerCount);
  if (!found) throw new Error(`Missing ${playerCount}-player scenario.`);
  return found;
}

function agent(resultScenario, slot) {
  const found = resultScenario.agents.find((candidate) => candidate.slot === slot);
  if (!found) throw new Error(`Missing slot ${slot}.`);
  return found;
}

const summary = await json(summaryPath);
const raw = await json(`${evidenceRoot}/authority-playtest-raw.json`);
const tapeV1 = await json('assets/source/maps/inkfall-foundry/runtime/playtest-tapes.p6-6.v1.json');
const tapeV2 = await json('assets/source/maps/inkfall-foundry/runtime/playtest-tapes.p6-6.v2.json');
const revision2Sweep = await json(`${evidenceRoot}/p6-2-playability-rerun.json`);
const revision1Sweep = await json(`${evidenceRoot}/p6-2-revision1-regression.json`);
const probeMatrix = await json(`${evidenceRoot}/posture-probe-matrix.json`);
const catalogSource = await readFile(resolve(repoRoot, 'src/content/maps/catalog.ts'), 'utf8');

const hashChecks = [];
for (const [kind, inventory] of [
  ['source', summary.sourceInventory],
  ['evidence', summary.evidenceInventory],
]) {
  for (const [path, expectedSha256] of Object.entries(inventory)) {
    const actualSha256 = await sha256(path);
    hashChecks.push({
      kind,
      path,
      expectedSha256,
      actualSha256,
      matches: actualSha256 === expectedSha256,
    });
  }
}

const eight = scenario(raw, 8);
const slot7 = agent(eight, 7);
const teleportTapes = slot7.routeTapes.filter(({ linkId }) => [
  'ink_mid_w_teleport_entry',
  'teleport_shortcut',
  'teleport_exit_press_core',
].includes(linkId));
const teleportMetric = slot7.routeMetrics.find(({ metricId }) => (
  metricId === 'ink_teleport_flank'
));
const archiveDropMetric = slot7.routeMetrics.find(({ metricId }) => (
  metricId === 'archive_drop_flank'
));

const v1Eight = tapeV1.scenarios.find(({ playerCount }) => playerCount === 8);
const v2Eight = tapeV2.scenarios.find(({ playerCount }) => playerCount === 8);
if (!v1Eight || !v2Eight) throw new Error('Missing 8-player tape definition.');
const v1Steps = (slot) => v1Eight.agents.find((candidate) => candidate.slot === slot)?.steps;
const v2Steps = (slot) => v2Eight.agents.find((candidate) => candidate.slot === slot)?.steps;
const egress = {
  0: [
    { linkId: 'press_east_choice', direction: 'forward', movementMode: 'run' },
    { linkId: 'east_choice_spawn', direction: 'forward', movementMode: 'run' },
  ],
  2: [
    { linkId: 'ink_west_mid_w', direction: 'reverse', movementMode: 'run' },
    { linkId: 'west_choice_ink', direction: 'reverse', movementMode: 'run' },
    { linkId: 'west_spawn_choice', direction: 'reverse', movementMode: 'run' },
  ],
  3: [
    { linkId: 'ink_mid_w_mid_e', direction: 'reverse', movementMode: 'run' },
    { linkId: 'ink_mid_w_teleport_entry', direction: 'forward', movementMode: 'crouch' },
  ],
};
const v2Slot7 = v2Eight.agents.find(({ slot }) => slot === 7);
const v1Slot7 = v1Eight.agents.find(({ slot }) => slot === 7);

const checks = [
  ['all recorded source and evidence hashes recompute', hashChecks.every(({ matches }) => matches)],
  ['summary claim is the authorized corrected-tape claim',
    summary.claim === 'P6_6_CORRECTED_AUTOMATED_TAPES_PASS'],
  ['native revision-2 identity is exact', same(raw.binding, {
    mapId: 'inkfall_foundry',
    mapRevision: 2,
    packageDigest: '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520',
    fixtureHash: 'bf85e42731fd088e',
    topologySeedSha256: '562c5ea8711a1eb1f4a08a31c8872c68c23778aa159110a107c9da0b74e67a63',
    movementProfileId: 'phase3_hypothesis_v1',
    movementProfileRevision: 1,
    physicsAdapterVersion: '0.19.3',
  })],
  ['2/4/8 scenarios all pass with zero issues',
    same(raw.scenarios.map(({ status }) => status), ['PASS', 'PASS', 'PASS'])
      && raw.issueCount === 0 && raw.allAutomatedThresholdsPassed === true
      && raw.scenarios.every(({ issues }) => issues.length === 0)],
  ['suite and scenario replay hashes are exact',
    raw.suiteHash === '143d09532b9c2b24'
      && same(raw.scenarios.map(({ replayHash }) => replayHash), [
        '92aa8378d2e0d27e',
        '2010f3a3d1897f31',
        '909814a9d725d187',
      ])],
  ['native spawn decisions all pass and are exact',
    raw.scenarios.every(({ spawnProbe }) => spawnProbe.passed)
      && same(raw.scenarios.map(({ spawnProbe }) => spawnProbe.decisionHash), [
        'ce3bd1acc10ee6b0',
        '2f490c09ee239e75',
        '4882737c21f26463',
      ])],
  ['unchanged end-to-end teleport metric is 3950 ms inside 1800-4000 ms',
    same(teleportMetric, {
      metricId: 'ink_teleport_flank',
      targetBandMilliseconds: [1800, 4000],
      measuredTicks: 79,
      measuredMilliseconds: 3950,
      insideTargetBand: true,
    })],
  ['teleport constituent diagnostics are 40/6/35 ticks', same(teleportTapes.map((tape) => ({
    linkId: tape.linkId,
    movementMode: tape.movementMode,
    traversalTicks: tape.traversalTicks,
  })), [
    { linkId: 'ink_mid_w_teleport_entry', movementMode: 'run', traversalTicks: 40 },
    { linkId: 'teleport_shortcut', movementMode: 'teleport', traversalTicks: 6 },
    { linkId: 'teleport_exit_press_core', movementMode: 'jump', traversalTicks: 35 },
  ])],
  ['archive drop and every other governing metric remain inside their bands',
    archiveDropMetric?.measuredMilliseconds === 3300
      && raw.scenarios.every(({ agents }) => agents.every(({ routeMetrics }) => (
        routeMetrics.every(({ insideTargetBand }) => insideTargetBand)
      )))],
  ['all agents complete without collision, volume, or analytical defects',
    raw.scenarios.every((result) => (
      result.agents.every(({ completed, embedSamples, snagEvents,
        recoveryVolumeEntries, killVolumeEntries }) => (
        completed && embedSamples === 0 && snagEvents === 0
          && recoveryVolumeEntries === 0 && killVolumeEntries === 0
      ))
      && result.collision.embedSamples === 0
      && result.collision.snagEvents === 0
      && result.occupancy.bodyOverlapSamples === 0
      && result.volumes.recoveryEntries === 0
      && result.volumes.killEntries === 0
    ))],
  ['exact three idle-egress sequences are appended',
    [0, 2, 3].every((slot) => same(
      v2Steps(slot),
      [...(v1Steps(slot) ?? []), ...egress[slot]],
    ))],
  ['all non-egress routes, starts, spawns, and metric bindings are unchanged',
    [1, 4, 5, 6].every((slot) => same(v2Steps(slot), v1Steps(slot)))
      && tapeV1.scenarios.every((v1Scenario, index) => {
        const v2Scenario = tapeV2.scenarios[index];
        return v2Scenario.id === v1Scenario.id
          && v2Scenario.playerCount === v1Scenario.playerCount
          && v2Scenario.maximumTicks === v1Scenario.maximumTicks
          && v2Scenario.agents.every((v2Agent, agentIndex) => {
            const v1Agent = v1Scenario.agents[agentIndex];
            return v2Agent.slot === v1Agent.slot
              && v2Agent.spawnId === v1Agent.spawnId
              && v2Agent.startDelayTicks === v1Agent.startDelayTicks
              && same(v2Agent.routeMetricIds, v1Agent.routeMetricIds);
          });
      })],
  ['slot 7 preserves endpoint order with only the approved posture semantics',
    same(v2Slot7?.steps.map(({ linkId, direction }) => ({ linkId, direction })),
      v1Slot7?.steps.map(({ linkId, direction }) => ({ linkId, direction })))
      && same(v2Slot7?.steps[1], {
        linkId: 'ink_mid_w_teleport_entry',
        direction: 'forward',
        movementMode: 'run',
        postureTransitions: [
          { atWaypointIndex: 1, afterTargetedTicks: 9, movementMode: 'slide' },
          { atWaypointIndex: 2, afterTargetedTicks: 0, movementMode: 'crouch' },
        ],
      })
      && same(v2Slot7?.steps[2], v1Slot7?.steps[2])
      && same(v2Slot7?.steps[3], {
        linkId: 'teleport_exit_press_core',
        direction: 'forward',
        movementMode: 'jump',
      })],
  ['revision-2 P6.2 sweep is 15/15 with frozen geometry hashes',
    revision2Sweep.result === 'PASS'
      && same(revision2Sweep.assertionSummary, { failed: 0, passed: 15, total: 15 })
      && revision2Sweep.capsule.totalCompletedSamples === 1646
      && revision2Sweep.artifacts.renderGlb.sha256
        === '90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634'
      && revision2Sweep.artifacts.collisionGlb.sha256
        === 'cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e'],
  ['revision-1 P6.2 regression is 14/14',
    revision1Sweep.result === 'PASS'
      && same(revision1Sweep.assertionSummary, { failed: 0, passed: 14, total: 14 })
      && revision1Sweep.capsule.totalCompletedSamples === 1653],
  ['all failed posture probes and the successful final probe are preserved',
    probeMatrix.attempts.length === 19
      && probeMatrix.attempts.slice(0, 18).every(({ issueCount }) => issueCount > 0)
      && probeMatrix.attempts[18]?.suiteHash === '143d09532b9c2b24'
      && probeMatrix.attempts[18]?.issueCount === 0],
  ['revision 2 remains unpromoted',
    /DEFAULT_MAP_REVISION\s*=\s*1\s+as const/u.test(catalogSource)],
  ['required nonclaims remain explicit', same(raw.nonClaims, [
    'SYNTHETIC_AGENTS_NOT_HUMAN_PLAYTESTERS',
    'HUMAN_FUN_AND_READABILITY_NOT_CLAIMED',
    'P6_7_TOPOLOGY_LOCK_NOT_CLAIMED',
    'FINAL_ART_NOT_CLAIMED',
    'G5_NOT_PASSED',
  ]) && same(summary.nonClaims, [
    'P6_7_TOPOLOGY_LOCK_NOT_PASSED',
    'G5_NOT_PASSED',
    'REVISION_2_NOT_DEFAULT_OR_SHIPPING',
    'HUMAN_FUN_OR_READABILITY_NOT_ACCEPTED',
    'VISUAL_ACCEPTANCE_NOT_PASSED',
    'FINAL_ART_NOT_COMPLETE',
    'PERFORMANCE_OR_PRODUCT_INTEGRATION_NOT_ACCEPTED',
  ])],
].map(([name, passed]) => ({ name, passed: Boolean(passed) }));

const verification = {
  schemaVersion: 1,
  status: checks.every(({ passed }) => passed) && hashChecks.every(({ matches }) => matches)
    ? 'P6_6B_CORRECTED_EVIDENCE_VERIFIED'
    : 'P6_6B_CORRECTED_EVIDENCE_VERIFICATION_FAILED',
  summaryPath,
  hashChecks,
  checks,
  passedChecks: checks.filter(({ passed }) => passed).length,
  totalChecks: checks.length,
  nonClaims: summary.nonClaims,
};

await writeFile(resolve(repoRoot, verificationPath), `${JSON.stringify(verification, null, 2)}\n`, {
  flag: 'wx',
});
if (verification.status !== 'P6_6B_CORRECTED_EVIDENCE_VERIFIED') process.exitCode = 1;
console.log(JSON.stringify({
  status: verification.status,
  passedChecks: verification.passedChecks,
  totalChecks: verification.totalChecks,
  hashChecks: verification.hashChecks.length,
  output: verificationPath,
}));
