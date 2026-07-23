import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const distRoot = path.join(repositoryRoot, 'dist');
const textExtensions = new Set(['.css', '.html', '.js', '.json']);
const results = [];

function check(condition, label) {
  results.push({ condition, label });
  process.stdout.write(`${condition ? 'PASS' : 'FAIL'} ${label}\n`);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

const mainSource = await readFile(path.join(repositoryRoot, 'src', 'main.js'), 'utf8');
const routeSource = await readFile(
  path.join(repositoryRoot, 'src', 'dev', 'deterministicTestRoute.ts'),
  'utf8',
);
const metricsSource = await readFile(
  path.join(repositoryRoot, 'src', 'render', 'debugMetrics.ts'),
  'utf8',
);
const distFiles = (await walk(distRoot)).filter((file) => textExtensions.has(path.extname(file)));
const emittedText = (
  await Promise.all(distFiles.map(async (file) => await readFile(file, 'utf8')))
).join('\n');

process.stdout.write('KYX Phase 2 development/production boundary verifier\n');
process.stdout.write(`Root: ${repositoryRoot}\n`);
process.stdout.write(`Built text artifacts: ${distFiles.length}\n`);

check(
  mainSource.includes("import.meta.env.DEV")
    && mainSource.includes("window.location.pathname === '/__test__/determinism'"),
  'source gates the deterministic route on Vite development mode',
);
check(
  mainSource.includes("import('./dev/deterministicTestRoute.ts')"),
  'source loads the deterministic route through a development branch',
);
check(
  routeSource.includes('runFoundationDeterministicReplay')
    && !/\b(?:Game|WebGLRenderer|AudioContext|localStorage|WebSocket)\b/.test(routeSource),
  'deterministic route calls the pure replay and has no game/runtime authority dependency',
);
check(
  metricsSource.includes('renderer.info')
    && metricsSource.includes('p95Ms')
    && metricsSource.includes('p99Ms'),
  'renderer diagnostics publish counters and percentile frame timing',
);

for (const [signature, label] of [
  ['/__test__/determinism', 'production text excludes the deterministic route path'],
  ['kyx-phase2-foundation-v1', 'production text excludes the deterministic replay seed'],
  ['d7201dfc006e72ee', 'production text excludes the deterministic replay hash'],
  ['Determinism Contract', 'production text excludes the deterministic route presentation'],
  ['kyxDevMetrics', 'production text excludes the renderer diagnostic data hook'],
  ['LOCAL DEV', 'production text excludes the local-development badge payload'],
]) {
  check(!emittedText.includes(signature), label);
}

const failures = results.filter((result) => !result.condition);
process.stdout.write(`Summary: ${results.length - failures.length} passed, ${failures.length} failed.\n`);
if (failures.length > 0) process.exitCode = 1;
