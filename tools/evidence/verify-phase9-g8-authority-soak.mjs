import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const evidenceArgument = process.argv.find((argument) => argument.startsWith('--evidence-dir='));
const evidenceDirectory = path.resolve(
  process.cwd(),
  evidenceArgument?.slice('--evidence-dir='.length)
    ?? 'evidence/2026-07-27/phase-9-g8-authority-soak/local-full-occupancy',
);
const evidence = JSON.parse(await readFile(
  path.join(evidenceDirectory, 'authority-soak.json'),
  'utf8',
));
const result = evidence.runtimeResult;
const checks = [];

function check(id, passed, detail) {
  checks.push({ id, passed, detail });
}

check('capture.test_exit_zero', evidence.testExitCode === 0, evidence.testExitCode);
check('runtime.actual_workers_pool', result.runtime === '@cloudflare/vitest-pool-workers', result.runtime);
check('occupancy.eight_clients', result.clients === 8, result.clients);
check('soak.minimum_rounds', result.soakRounds >= 60, result.soakRounds);
check(
  'tick.minimum_samples',
  result.authorityTickExecution.samples >= 100,
  result.authorityTickExecution.samples,
);
check(
  'tick.p99_within_budget',
  Number.isFinite(result.authorityTickExecution.p99Milliseconds)
    && result.authorityTickExecution.p99Milliseconds <= 50,
  result.authorityTickExecution.p99Milliseconds,
);
check(
  'tick.observed_rate',
  result.observedTickRateHertz >= 10 && result.observedTickRateHertz <= 30,
  result.observedTickRateHertz,
);
check(
  'network.client_to_server_observed',
  result.network.clientToServerBytes > 0 && result.network.clientToServerMessages > 0,
  {
    bytes: result.network.clientToServerBytes,
    messages: result.network.clientToServerMessages,
  },
);
check(
  'network.server_to_client_observed',
  result.network.serverToClientBytes > 0 && result.network.serverToClientMessages > 0,
  {
    bytes: result.network.serverToClientBytes,
    messages: result.network.serverToClientMessages,
  },
);
check(
  'network.no_rate_rejections',
  result.transport.inboundMessagesRateRejected === 0,
  result.transport.inboundMessagesRateRejected,
);
check(
  'network.no_slow_consumer_evictions',
  result.transport.slowConsumerEvictions === 0
    && result.transport.snapshotAckDebtEvictions === 0,
  {
    slowConsumerEvictions: result.transport.slowConsumerEvictions,
    snapshotAckDebtEvictions: result.transport.snapshotAckDebtEvictions,
  },
);
check(
  'network.no_backpressure',
  result.transport.backpressureEpisodes === 0,
  result.transport.backpressureEpisodes,
);
check(
  'resume.identity_and_mode',
  result.resume.preservedPlayerId === true && result.resume.connectionMode === 'resumed',
  result.resume,
);
check('resume.credential_rotated', result.resume.rotatedCredential === true, result.resume);
check(
  'combat.authority_checkpoint_dead',
  result.combat.targetDeadInCheckpoint === true,
  result.combat.targetDeadInCheckpoint,
);
check(
  'combat.all_clients_converged',
  result.combat.convergedClientCount === result.clients,
  `${result.combat.convergedClientCount}/${result.clients}`,
);
check('runtime.no_tick_failure', result.lastTickFailure === null, result.lastTickFailure);
check('protocol.no_decode_errors', result.decodeErrors.length === 0, result.decodeErrors);

const failures = checks.filter(({ passed }) => !passed);
const report = Object.freeze({
  schemaVersion: 1,
  evidenceDirectory,
  passed: failures.length === 0,
  checks,
  failures,
  limitations: evidence.interpretation.limitations,
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
