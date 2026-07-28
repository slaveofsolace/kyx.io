import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const outputDirectory = path.resolve(
  process.argv[2] ?? 'evidence/2026-07-28/weapon-presentation-batch-rev1',
);
const port = Number(process.env.KYX_WEAPON_GALLERY_PORT ?? 6249);
const origin = `http://127.0.0.1:${port}`;
const viteEntry = path.resolve('node_modules/vite/bin/vite.js');

await mkdir(outputDirectory, { recursive: true });

const server = spawn(
  process.execPath,
  [viteEntry, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);

let serverLog = '';
server.stdout.on('data', (chunk) => {
  serverLog += chunk.toString();
});
server.stderr.on('data', (chunk) => {
  serverLog += chunk.toString();
});

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // Vite is still binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`WEAPON_GALLERY_VITE_TIMEOUT\n${serverLog}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-webgl'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `${origin}/tools/evidence/weapon-presentation-gallery.html`,
    { waitUntil: 'networkidle' },
  );
  await page.waitForFunction(
    () => document.body.dataset.weaponGalleryReady === 'true',
    null,
    { timeout: 30_000 },
  );
  const diagnostics = await page.evaluate(
    () => window.__weaponGalleryDiagnostics,
  );
  if (!Array.isArray(diagnostics) || diagnostics.length !== 6) {
    throw new Error('WEAPON_GALLERY_CARDINALITY_MISMATCH');
  }
  if (new Set(diagnostics.map(({ muzzleNode }) => muzzleNode)).size !== 6) {
    throw new Error('WEAPON_GALLERY_MUZZLE_IDENTITY_COLLISION');
  }
  if (new Set(diagnostics.map(({ label }) => label)).size !== 6) {
    throw new Error('WEAPON_GALLERY_SILHOUETTE_LABEL_COLLISION');
  }
  if (diagnostics.some(({ muzzleLocal }) => muzzleLocal[2] >= -0.25)) {
    throw new Error('WEAPON_GALLERY_MUZZLE_NOT_FORWARD_OF_RECEIVER');
  }
  const rocket = diagnostics.find(({ family }) => family === 'rocket');
  if (rocket?.backblastNode !== 'KYX_BR6_BACKBLAST') {
    throw new Error('WEAPON_GALLERY_ROCKET_BACKBLAST_MARKER_MISSING');
  }
  if (diagnostics.some(({ meshCount }) => meshCount < 12)) {
    throw new Error('WEAPON_GALLERY_MODEL_DETAIL_UNDERSHOOT');
  }
  if (errors.length > 0) {
    throw new Error(`WEAPON_GALLERY_BROWSER_ERRORS\n${errors.join('\n')}`);
  }
  const screenshot = path.join(
    outputDirectory,
    'kyx-six-weapon-project-authored-gallery.jpg',
  );
  await page.screenshot({
    path: screenshot,
    type: 'jpeg',
    quality: 88,
    fullPage: true,
  });
  const result = {
    status: 'KYX_WEAPON_PRESENTATION_SENTINEL_PASS',
    authorityMutation: false,
    modelCount: diagnostics.length,
    uniqueMuzzleNodeCount: new Set(
      diagnostics.map(({ muzzleNode }) => muzzleNode),
    ).size,
    uniquePresentationLabelCount: new Set(
      diagnostics.map(({ label }) => label),
    ).size,
    diagnostics,
    screenshot: path.relative(process.cwd(), screenshot).replaceAll('\\', '/'),
  };
  await writeFile(
    path.join(outputDirectory, 'weapon-presentation-sentinel.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  if (browser !== undefined) await browser.close();
  server.kill('SIGTERM');
}
