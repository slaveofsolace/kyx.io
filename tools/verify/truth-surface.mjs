#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_HTML = ['index.html', 'login.html', 'register.html'];
const SOURCE_ENTRIES = ['src/main.js', 'src/loginPage.js', 'src/registerPage.js'];
const DIST_HTML = SOURCE_HTML.map((file) => `dist/${file}`);
const PRODUCTION_ENV = '.env.production';

const results = [];
const infrastructureFailures = [];

function slashPath(file) {
  return relative(ROOT, file).replaceAll('\\', '/');
}

function record(label, ok, detail = '') {
  results.push({ label, ok, detail: ok ? '' : detail });
}

function failInfrastructure(detail) {
  infrastructureFailures.push(detail);
}

function matchLocation(document, pattern) {
  const flags = pattern.flags.replaceAll('g', '');
  const match = new RegExp(pattern.source, flags).exec(document.scanText);
  if (!match) return null;

  const line = document.text.slice(0, match.index).split(/\r?\n/u).length;
  const lineStart = document.text.lastIndexOf('\n', match.index - 1) + 1;
  const lineEndRaw = document.text.indexOf('\n', match.index);
  const lineEnd = lineEndRaw === -1 ? document.text.length : lineEndRaw;
  const excerpt = document.text.slice(lineStart, lineEnd).trim().slice(0, 180);
  return `${document.name}:${line}${excerpt ? ` (${excerpt})` : ''}`;
}

function stripJsComments(text) {
  let output = '';
  let state = 'code';

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (state === 'line-comment') {
      if (char === '\n' || char === '\r') {
        output += char;
        state = 'code';
      } else {
        output += ' ';
      }
      continue;
    }

    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        output += '  ';
        index += 1;
        state = 'code';
      } else {
        output += char === '\n' || char === '\r' ? char : ' ';
      }
      continue;
    }

    if (state === 'single-quote' || state === 'double-quote' || state === 'template') {
      output += char;
      if (char === '\\') {
        if (index + 1 < text.length) {
          output += text[index + 1];
          index += 1;
        }
        continue;
      }

      if (
        (state === 'single-quote' && char === "'")
        || (state === 'double-quote' && char === '"')
        || (state === 'template' && char === '`')
      ) {
        state = 'code';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      output += '  ';
      index += 1;
      state = 'line-comment';
    } else if (char === '/' && next === '*') {
      output += '  ';
      index += 1;
      state = 'block-comment';
    } else {
      output += char;
      if (char === "'") state = 'single-quote';
      else if (char === '"') state = 'double-quote';
      else if (char === '`') state = 'template';
    }
  }

  return output;
}

function stripMarkupComments(text) {
  return text.replace(/<!--[^]*?-->/gu, (comment) => comment.replace(/[^\r\n]/gu, ' '));
}

function stripCssComments(text) {
  return text.replace(/\/\*[^]*?\*\//gu, (comment) => comment.replace(/[^\r\n]/gu, ' '));
}

function scanTextFor(file, text) {
  const extension = extname(file).toLowerCase();
  if (extension === '.html') return stripMarkupComments(text);
  if (extension === '.css') return stripCssComments(text);
  if (extension === '.js' || extension === '.mjs') return stripJsComments(text);
  return text;
}

async function loadDocument(file) {
  const text = await readFile(file, 'utf8');
  const fileStat = await stat(file);
  return {
    file,
    name: slashPath(file),
    text,
    scanText: scanTextFor(file, text),
    mtimeMs: fileStat.mtimeMs,
  };
}

async function resolveLocalImport(importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const cleanSpecifier = specifier.split(/[?#]/u)[0];
  const unresolved = resolve(dirname(importer), cleanSpecifier);
  const candidates = extname(unresolved)
    ? [unresolved]
    : [unresolved, `${unresolved}.js`, `${unresolved}.mjs`, `${unresolved}.css`, resolve(unresolved, 'index.js')];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function sourceImportSpecifiers(text) {
  const specifiers = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/gu,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

async function collectSourceGraph() {
  const documents = new Map();
  const queue = SOURCE_ENTRIES.map((entry) => resolve(ROOT, entry));

  while (queue.length > 0) {
    const file = queue.shift();
    if (documents.has(file)) continue;
    if (!existsSync(file)) {
      failInfrastructure(`Missing source entry/import: ${slashPath(file)}`);
      continue;
    }

    const document = await loadDocument(file);
    documents.set(file, document);
    if (!['.js', '.mjs'].includes(extname(file).toLowerCase())) continue;

    for (const specifier of sourceImportSpecifiers(document.scanText)) {
      const imported = await resolveLocalImport(file, specifier);
      if (specifier.startsWith('.') && !imported) {
        failInfrastructure(`Unresolved local import ${JSON.stringify(specifier)} from ${document.name}`);
      } else if (imported && !documents.has(imported)) {
        queue.push(imported);
      }
    }
  }

  return [...documents.values()];
}

function localAssetPath(importer, specifier) {
  const cleanSpecifier = specifier.split(/[?#]/u)[0];
  if (cleanSpecifier.startsWith('/')) return resolve(ROOT, 'dist', cleanSpecifier.slice(1));
  return resolve(dirname(importer), cleanSpecifier);
}

function emittedImportSpecifiers(text) {
  const specifiers = [];
  const patterns = [
    /\bfrom\s*(['"`])([^'"`]+)\1/gu,
    /\bimport\s*(?:\(\s*)?(['"`])([^'"`]+)\1/gu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) specifiers.push(match[2]);
  }
  return specifiers;
}

function htmlResourceSpecifiers(text) {
  const resources = [];
  const pattern = /\b(?:src|href)\s*=\s*(['"])(.*?)\1/giu;
  for (const match of text.matchAll(pattern)) resources.push(match[2]);
  return resources;
}

function isExternalNetworkReference(specifier) {
  return /^(?:https?:)?\/\//iu.test(specifier) || /^(?:wss?|ftp):/iu.test(specifier);
}

async function collectDistGraph(distHtmlDocuments) {
  const documents = new Map(distHtmlDocuments.map((document) => [document.file, document]));
  const queue = [];

  for (const document of distHtmlDocuments) {
    for (const specifier of htmlResourceSpecifiers(document.scanText)) {
      if (!isExternalNetworkReference(specifier) && !specifier.startsWith('data:') && !specifier.startsWith('#')) {
        const asset = localAssetPath(document.file, specifier);
        if (['.js', '.css'].includes(extname(asset).toLowerCase())) queue.push(asset);
      }
    }
  }

  while (queue.length > 0) {
    const file = queue.shift();
    if (documents.has(file)) continue;
    if (!existsSync(file)) {
      failInfrastructure(`Built entry references missing asset: ${slashPath(file)}`);
      continue;
    }

    const document = await loadDocument(file);
    documents.set(file, document);
    if (extname(file).toLowerCase() !== '.js') continue;

    for (const specifier of emittedImportSpecifiers(document.scanText)) {
      if (specifier.startsWith('.')) queue.push(localAssetPath(file, specifier));
    }
  }

  return [...documents.values()];
}

function assertPattern(label, document, pattern, detail) {
  const location = matchLocation(document, pattern);
  record(label, Boolean(location), location ? '' : detail);
}

function assertNoRules(label, documents, rules) {
  const hits = [];
  for (const document of documents) {
    for (const rule of rules) {
      const location = matchLocation(document, rule.pattern);
      if (location) hits.push(`${rule.name}: ${location}`);
    }
  }
  record(label, hits.length === 0, hits.slice(0, 8).join('; '));
}

const sourceGraph = await collectSourceGraph();
const sourceHtmlDocuments = [];
for (const file of SOURCE_HTML) {
  const absolute = resolve(ROOT, file);
  if (!existsSync(absolute)) failInfrastructure(`Missing source HTML: ${file}`);
  else sourceHtmlDocuments.push(await loadDocument(absolute));
}

const sourceJsDocuments = sourceGraph.filter((document) => ['.js', '.mjs'].includes(extname(document.file).toLowerCase()));
const sourceCssDocuments = sourceGraph.filter((document) => extname(document.file).toLowerCase() === '.css');
const sourceRuntimeDocuments = [...sourceHtmlDocuments, ...sourceJsDocuments];

const requiredSource = new Map(
  [...sourceHtmlDocuments, ...sourceGraph].map((document) => [document.name, document]),
);

const config = requiredSource.get('src/config/productConfig.js');
const account = requiredSource.get('src/core/UserAccount.js');
const bot = requiredSource.get('src/entities/Bot.js');
const botManager = requiredSource.get('src/entities/BotManager.js');
const modes = requiredSource.get('src/core/GameModes.js');
const indexHtml = requiredSource.get('index.html');

for (const [name, document] of [
  ['src/config/productConfig.js', config],
  ['src/core/UserAccount.js', account],
  ['src/entities/Bot.js', bot],
  ['src/entities/BotManager.js', botManager],
  ['src/core/GameModes.js', modes],
  ['index.html', indexHtml],
]) {
  if (!document) failInfrastructure(`Required active source is not reachable/present: ${name}`);
}

if (config) {
  assertPattern('config declares offline_practice launch mode', config, /launchMode\s*:\s*['"]offline_practice['"]/u, 'Expected launchMode: offline_practice.');
  assertPattern('config declares exactly one local player', config, /localPlayers\s*:\s*1\b/u, 'Expected practice.localPlayers: 1.');
  assertPattern('config declares exactly seven bots', config, /\bbots\s*:\s*7\b/u, 'Expected practice.bots: 7.');
  assertPattern('config declares an eight-minute practice', config, /durationSeconds\s*:\s*8\s*\*\s*60\b/u, 'Expected durationSeconds: 8 * 60.');
  assertPattern('config disables advertising', config, /advertising\s*:\s*Object\.freeze\s*\(\s*\{\s*enabled\s*:\s*false\b/isu, 'Expected advertising.enabled: false.');
  assertPattern('config disables economy authority', config, /economy\s*:\s*Object\.freeze\s*\(\s*\{\s*enabled\s*:\s*false\b[^}]*authority\s*:\s*['"]none['"]/isu, 'Expected economy.enabled: false and authority: none.');
  assertPattern('config disables the legacy relay', config, /legacyRelay\s*:\s*Object\.freeze\s*\(\s*\{\s*enabled\s*:\s*false\b/isu, 'Expected legacyRelay.enabled: false.');
  assertPattern('config makes the launch desktop-only', config, /desktopOnly\s*:\s*true\b/u, 'Expected desktopOnly: true.');
}

if (indexHtml) {
  assertPattern('source shell identifies Offline Practice', indexHtml, /OFFLINE PRACTICE/iu, 'Expected visible OFFLINE PRACTICE copy.');
  assertPattern('source shell discloses one local player and seven bots', indexHtml, /1\s+LOCAL\s+PLAYER\s*\/\s*7\s+BOTS/iu, 'Expected 1 LOCAL PLAYER / 7 BOTS.');
  assertPattern('source shell disables unavailable online play', indexHtml, /<button\b(?=[^>]*\bdisabled\b)[^>]*>[^]*?ONLINE\s+MATCH[^]*?NOT\s+AVAILABLE[^]*?<\/button>/iu, 'Expected a disabled ONLINE MATCH - NOT AVAILABLE button.');
  assertPattern('source shell includes the desktop-required overlay', indexHtml, /id\s*=\s*['"]desktop-required-overlay['"]/iu, 'Expected the desktop-required overlay.');
}

for (const name of ['login.html', 'register.html']) {
  const document = requiredSource.get(name);
  if (!document) continue;
  assertPattern(`${name} is a Local Guest Profile surface`, document, /Local\s+Guest\s+Profile/iu, 'Expected Local Guest Profile copy.');
  assertPattern(`${name} uses nickname-only autocomplete`, document, /<input\b(?=[^>]*id\s*=\s*['"]profile-name['"])(?=[^>]*autocomplete\s*=\s*['"]nickname['"])[^>]*>/iu, 'Expected one profile-name input with autocomplete=nickname.');
  const inputCount = [...document.scanText.matchAll(/<input\b/giu)].length;
  record(`${name} exposes exactly one input`, inputCount === 1, `Found ${inputCount} inputs; expected one display-name input.`);
}

if (account) {
  assertPattern('local profile uses kyx_local_profile storage', account, /LOCAL_PROFILE_STORAGE_KEY\s*=\s*['"]kyx_local_profile['"]/u, 'Expected kyx_local_profile storage key.');
  assertPattern('local profile record is explicitly local_guest', account, /LOCAL_PROFILE_KIND\s*=\s*['"]local_guest['"]/u, 'Expected local_guest profile kind.');
  assertPattern('local profile record is versioned', account, /LOCAL_PROFILE_VERSION\s*=\s*1\b/u, 'Expected local profile version 1.');
  assertPattern('legacy credential-bearing storage is scrubbed', account, /scrubLegacyStorage\s*\([^)]*\)/u, 'Expected one-way legacy storage cleanup.');
}

if (bot) {
  assertPattern('bot entities default to explicit practice-bot labels', bot, /this\.displayName\s*=\s*`PRACTICE BOT \$\{/u, 'Expected PRACTICE BOT NN default labels.');
}
if (botManager) {
  assertPattern('bot manager assigns explicit practice-bot labels', botManager, /bot\.displayName\s*=\s*`PRACTICE BOT \$\{/u, 'Expected deterministic PRACTICE BOT NN labels.');
}
if (modes) {
  assertPattern('active mode catalog labels deathmatch as Offline Practice', modes, /id\s*:\s*['"]deathmatch['"][^]*?name\s*:\s*['"]OFFLINE PRACTICE['"]/iu, 'Expected deathmatch to be presented as OFFLINE PRACTICE.');
}

const credentialRules = [
  { name: 'password/email input', pattern: /<input\b[^>]*(?:type|autocomplete|name|id)\s*=\s*['"](?:password|email|username|current-password|new-password)['"][^>]*>/iu },
  { name: 'credential hash/salt state', pattern: /\b(?:passwordHash|passwordSalt|hashedPassword|credentialHash)\b/iu },
  { name: 'remote account method', pattern: /\bUserAccount\.(?:login|register|logout|isLoggedIn|createAccount)\s*\(/u },
  { name: 'auth provider import', pattern: /(?:from\s*|import\s*\()['"][^'"]*(?:firebase\/auth|auth0|passport|supabase\/auth)[^'"]*['"]/iu },
];

const advertisingRules = [
  { name: 'Google ad runtime/provider', pattern: /\b(?:adsbygoogle|googlesyndication|doubleclick\.net|googletagservices|ca-pub-\d+)/iu },
  { name: 'ad script element', pattern: /<script\b[^>]*(?:adsbygoogle|googlesyndication|doubleclick|adservice)[^>]*>/iu },
];

const web3Rules = [
  { name: 'wallet/Web3 runtime', pattern: /\b(?:Web3|WalletConnect|MetaMask|window\.ethereum|ethereum\.request)\b/iu },
  { name: 'blockchain/NFT claim', pattern: /\b(?:blockchain|cryptocurrency|non-fungible|NFTs?)\b/iu },
  { name: 'Web3 package import', pattern: /(?:from\s*|import\s*\()['"][^'"]*(?:ethers|viem|wagmi|moralis|thirdweb|@solana\/web3\.js|@walletconnect\/)[^'"]*['"]/iu },
];

const networkRuntimeRules = [
  { name: 'fetch request', pattern: /\bfetch\s*\(/u },
  { name: 'WebSocket transport', pattern: /\b(?:new\s+)?WebSocket\s*\(/u },
  { name: 'event/RTC/XHR transport', pattern: /\b(?:EventSource|XMLHttpRequest|RTCPeerConnection)\b/u },
  { name: 'telemetry beacon', pattern: /\b(?:navigator\s*\.\s*)?sendBeacon\s*\(/u },
  { name: 'runtime endpoint literal', pattern: /['"`](?:https?|wss?):\/\/(?!www\.w3\.org\/(?:1999\/xhtml|2000\/svg))/iu },
  { name: 'legacy relay configuration', pattern: /\b(?:VITE_WS_URL|NetClient|ServerSim)\b/u },
];

const fakeHumanRules = [
  { name: 'fake-human slot state', pattern: /\b(?:isHumanSlot|humanSlot|humanSlots|fakePlayer|fakePlayers)\b/iu },
  { name: 'fabricated presence event', pattern: /\b(?:joined|left)\s+the\s+match\b/iu },
  { name: 'fabricated public lobby', pattern: /\bPUBLIC\s+GAME\b|\bPLAYERS?\s+ONLINE\b/iu },
];

const economyRules = [
  { name: 'economy/progression module import', pattern: /(?:from\s*|import\s*\()['"][^'"]*(?:Shop|BattlePass|Achievements|RarityPerks|InventoryPanel)\.js['"]/iu },
  { name: 'currency mutation', pattern: /\b(?:addCoins|spendCoins|grantCoins|earnedCoins|coinBalance)\b/iu },
  { name: 'currency UI hook', pattern: /\b(?:coin-popup|coins-earned|shop-coin-balance|battle-pass)\b/iu },
];

const mobileRuntimeRules = [
  { name: 'mobile controls runtime', pattern: /\bMobileControls\b|['"]mobile-controls['"]/u },
  { name: 'mobile controls DOM surface', pattern: /id\s*=\s*['"]mobile-controls['"]/iu },
];

assertNoRules('active source has no credential collection/auth runtime', sourceRuntimeDocuments, credentialRules);
assertNoRules('active source has no advertising runtime/provider', sourceRuntimeDocuments, advertisingRules);
assertNoRules('active source has no Web3/wallet/NFT runtime or claims', sourceRuntimeDocuments, web3Rules);
assertNoRules('active first-party source has no network transport/request code', sourceJsDocuments, networkRuntimeRules);
assertNoRules('active source has no fabricated-human/lobby claims', sourceRuntimeDocuments, fakeHumanRules);
assertNoRules('active source has no economy/progression runtime', sourceRuntimeDocuments, economyRules);
assertNoRules('active source has no mobile-controls runtime or markup', sourceRuntimeDocuments, mobileRuntimeRules);

const sourceExternalReferences = [];
for (const document of sourceHtmlDocuments) {
  for (const specifier of htmlResourceSpecifiers(document.scanText)) {
    if (isExternalNetworkReference(specifier)) sourceExternalReferences.push(`${document.name}: ${specifier}`);
  }
}
record(
  'source HTML has no external network subresources',
  sourceExternalReferences.length === 0,
  sourceExternalReferences.slice(0, 8).join('; '),
);

const sourceCssNetworkRules = [
  { name: 'external CSS import/resource', pattern: /(?:@import\s+(?:url\s*\()?|url\s*\(\s*['"]?)(?:https?:)?\/\//iu },
  ...advertisingRules,
];
assertNoRules('active CSS has no external imports/resources or ad provider code', sourceCssDocuments, sourceCssNetworkRules);

if (existsSync(resolve(ROOT, 'package.json'))) {
  const packageDocument = await loadDocument(resolve(ROOT, 'package.json'));
  let packageJson = null;
  try {
    packageJson = JSON.parse(packageDocument.text);
  } catch (error) {
    failInfrastructure(`Invalid package.json: ${error.message}`);
  }
  if (packageJson) {
    const dependencyNames = Object.keys({ ...packageJson.dependencies, ...packageJson.optionalDependencies });
    const forbiddenDependencies = dependencyNames.filter((name) => (
      /^(?:web3|ethers|viem|wagmi|moralis|thirdweb|@solana\/web3\.js)$/iu.test(name)
      || /^@(?:walletconnect|metamask)\//iu.test(name)
      || /(?:adsense|adsbygoogle|doubleclick)/iu.test(name)
    ));
    record('production dependencies contain no ad or Web3 SDK', forbiddenDependencies.length === 0, forbiddenDependencies.join(', '));
  }
}

const distHtmlDocuments = [];
for (const file of DIST_HTML) {
  const absolute = resolve(ROOT, file);
  if (!existsSync(absolute)) failInfrastructure(`Missing built entry: ${file}. Run npm run build first.`);
  else distHtmlDocuments.push(await loadDocument(absolute));
}

const distGraph = await collectDistGraph(distHtmlDocuments);
const distJsDocuments = distGraph.filter((document) => extname(document.file).toLowerCase() === '.js');
const distCssDocuments = distGraph.filter((document) => extname(document.file).toLowerCase() === '.css');
const distRuntimeDocuments = [...distHtmlDocuments, ...distJsDocuments];
let productionEnvDocument = null;
let productionAuthorityOrigin = null;
const productionEnvPath = resolve(ROOT, PRODUCTION_ENV);
if (!existsSync(productionEnvPath)) {
  failInfrastructure(`Missing production build environment: ${PRODUCTION_ENV}`);
} else {
  productionEnvDocument = await loadDocument(productionEnvPath);
  const authorityOriginMatches = [
    ...productionEnvDocument.text.matchAll(
      /^VITE_KYX_AUTHORITY_ORIGIN=(\S+)\s*$/gmu,
    ),
  ];
  if (authorityOriginMatches.length !== 1) {
    failInfrastructure(
      `${PRODUCTION_ENV} must define VITE_KYX_AUTHORITY_ORIGIN exactly once`,
    );
  } else {
    productionAuthorityOrigin = authorityOriginMatches[0][1];
  }
}

if (distHtmlDocuments.length === DIST_HTML.length) {
  const builtIndex = distHtmlDocuments.find((document) => document.name === 'dist/index.html');
  if (builtIndex) {
    assertPattern('built shell identifies Offline Practice', builtIndex, /OFFLINE PRACTICE/iu, 'Built index is missing OFFLINE PRACTICE copy.');
    assertPattern('built shell discloses one local player and seven bots', builtIndex, /1\s+LOCAL\s+PLAYER\s*\/\s*7\s+BOTS/iu, 'Built index is missing 1 LOCAL PLAYER / 7 BOTS.');
    assertPattern('built shell disables unavailable online play', builtIndex, /<button\b(?=[^>]*\bdisabled\b)[^>]*>[^]*?ONLINE\s+MATCH[^]*?NOT\s+AVAILABLE[^]*?<\/button>/iu, 'Built index must disable ONLINE MATCH - NOT AVAILABLE.');
  }

  for (const name of ['dist/login.html', 'dist/register.html']) {
    const document = distHtmlDocuments.find((candidate) => candidate.name === name);
    if (!document) continue;
    assertPattern(`${name} remains a Local Guest Profile surface`, document, /Local\s+Guest\s+Profile/iu, 'Built profile route is missing Local Guest Profile copy.');
    const inputCount = [...document.scanText.matchAll(/<input\b/giu)].length;
    record(`${name} emits exactly one input`, inputCount === 1, `Found ${inputCount} built inputs; expected one display-name input.`);
  }

  const emittedJs = distJsDocuments.map((document) => document.scanText).join('\n');
  record('built JavaScript contains the local profile storage contract', /kyx_local_profile/u.test(emittedJs) && /local_guest/u.test(emittedJs), 'Expected kyx_local_profile and local_guest in emitted entry assets.');
  record('built JavaScript contains explicit Offline Practice/bot labels', /OFFLINE PRACTICE/iu.test(emittedJs) && /PRACTICE BOT/iu.test(emittedJs), 'Expected OFFLINE PRACTICE and PRACTICE BOT in emitted entry assets.');

  const distExternalReferences = [];
  for (const document of distHtmlDocuments) {
    for (const specifier of htmlResourceSpecifiers(document.scanText)) {
      if (isExternalNetworkReference(specifier)) distExternalReferences.push(`${document.name}: ${specifier}`);
    }
  }
  record('built HTML has no external network subresources', distExternalReferences.length === 0, distExternalReferences.slice(0, 8).join('; '));

  assertNoRules('built entry surfaces have no credential collection/auth runtime', distRuntimeDocuments, credentialRules);
  assertNoRules('built entry surfaces have no advertising runtime/provider', [...distRuntimeDocuments, ...distCssDocuments], advertisingRules);
  assertNoRules('built entry surfaces have no Web3/wallet/NFT runtime or claims', distRuntimeDocuments, web3Rules);
  const authorityTransportIssues = [];
  const authorityRouteDocuments = distJsDocuments.filter(({ name }) => (
    /^dist\/assets\/onlineAuthorityRoute-[^/]+\.js$/u.test(name)
  ));
  if (authorityRouteDocuments.length !== 1) {
    authorityTransportIssues.push(
      `expected one onlineAuthorityRoute asset, found ${authorityRouteDocuments.length}`,
    );
  }
  if (productionAuthorityOrigin === null) {
    authorityTransportIssues.push('production authority origin is unavailable');
  } else {
    try {
      const parsedAuthorityOrigin = new URL(productionAuthorityOrigin);
      if (
        parsedAuthorityOrigin.protocol !== 'https:'
        || parsedAuthorityOrigin.username !== ''
        || parsedAuthorityOrigin.password !== ''
        || parsedAuthorityOrigin.pathname !== '/'
        || parsedAuthorityOrigin.search !== ''
        || parsedAuthorityOrigin.hash !== ''
      ) {
        authorityTransportIssues.push(
          'VITE_KYX_AUTHORITY_ORIGIN must be a credential-free HTTPS origin',
        );
      }
    } catch {
      authorityTransportIssues.push('VITE_KYX_AUTHORITY_ORIGIN is not a valid URL');
    }
    const authorityOriginOccurrences = distRuntimeDocuments.reduce(
      (total, document) => (
        total + document.scanText.split(productionAuthorityOrigin).length - 1
      ),
      0,
    );
    if (authorityOriginOccurrences !== 1) {
      authorityTransportIssues.push(
        `configured authority origin occurs ${authorityOriginOccurrences} times; expected 1`,
      );
    }
  }
  const websocketRule = networkRuntimeRules.find(({ name }) => name === 'WebSocket transport');
  const endpointRule = networkRuntimeRules.find(({ name }) => name === 'runtime endpoint literal');
  const legacyRelayRule = networkRuntimeRules.find(
    ({ name }) => name === 'legacy relay configuration',
  );
  for (const document of distRuntimeDocuments) {
    if (
      legacyRelayRule !== undefined
      && legacyRelayRule.pattern.test(document.scanText)
    ) {
      authorityTransportIssues.push(
        `legacy relay signature: ${matchLocation(document, legacyRelayRule.pattern)}`,
      );
    }
    if (
      websocketRule !== undefined
      && !authorityRouteDocuments.includes(document)
      && websocketRule.pattern.test(document.scanText)
    ) {
      authorityTransportIssues.push(
        `WebSocket outside authority route: ${matchLocation(document, websocketRule.pattern)}`,
      );
    }
    const endpointScanDocument = productionAuthorityOrigin === null
      ? document
      : {
          ...document,
          scanText: document.scanText.replaceAll(productionAuthorityOrigin, ''),
        };
    if (
      endpointRule !== undefined
      && endpointRule.pattern.test(endpointScanDocument.scanText)
    ) {
      authorityTransportIssues.push(
        `unexpected runtime endpoint: ${matchLocation(
          endpointScanDocument,
          endpointRule.pattern,
        )}`,
      );
    }
  }
  if (authorityRouteDocuments.length === 1) {
    const constructorCount = [
      ...authorityRouteDocuments[0].scanText.matchAll(/\bnew\s+WebSocket\s*\(/gu),
    ].length;
    if (constructorCount !== 1) {
      authorityTransportIssues.push(
        `authority route has ${constructorCount} WebSocket constructors; expected 1`,
      );
    }
  }
  record(
    'built entry surfaces expose only the configured authoritative WebSocket path',
    authorityTransportIssues.length === 0,
    authorityTransportIssues.slice(0, 8).join('; '),
  );
  assertNoRules('built entry surfaces have no fabricated-human/lobby claims', distRuntimeDocuments, fakeHumanRules);
  assertNoRules('built entry surfaces have no economy/progression runtime', distRuntimeDocuments, economyRules);
  assertNoRules('built entry surfaces have no mobile-controls runtime or markup', distRuntimeDocuments, mobileRuntimeRules);
  assertNoRules('built CSS has no external imports/resources or ad provider code', distCssDocuments, sourceCssNetworkRules);

  const newestInput = Math.max(
    ...[
      ...sourceHtmlDocuments,
      ...sourceGraph,
      ...(productionEnvDocument === null ? [] : [productionEnvDocument]),
    ].map((document) => document.mtimeMs),
  );
  const oldestBuiltEntry = Math.min(...distHtmlDocuments.map((document) => document.mtimeMs));
  record(
    'dist entry pages are not older than active source inputs',
    oldestBuiltEntry + 1000 >= newestInput,
    `Newest active input: ${new Date(newestInput).toISOString()}; oldest dist entry: ${new Date(oldestBuiltEntry).toISOString()}. Rebuild dist.`,
  );
}

console.log('KYX.IO Phase 1 production truth-surface verifier');
console.log(`Root: ${ROOT}`);
console.log('Checked scopes:');
console.log(`  - ${sourceHtmlDocuments.length} source entry pages: ${SOURCE_HTML.join(', ')}`);
console.log(`  - ${sourceJsDocuments.length} reachable first-party JS modules from ${SOURCE_ENTRIES.join(', ')}`);
console.log(`  - ${sourceCssDocuments.length} reachable first-party stylesheet(s), limited to external-resource/ad-provider checks`);
console.log(`  - ${distHtmlDocuments.length} built entry pages and ${distJsDocuments.length + distCssDocuments.length} recursively referenced JS/CSS assets`);
console.log('Boundary/limitations:');
console.log('  - Unreachable legacy source, server/, evidence/, binary assets, and source maps are outside this production-entry check.');
console.log('  - Bundled third-party implementation text is not scanned for generic fetch/URL/crypto/token vocabulary; emitted assets use high-signal leak signatures only.');
console.log('  - This is static containment/truth checking, not browser traffic interception, visual QA, gameplay QA, or proof of server authority.');

if (infrastructureFailures.length > 0) {
  for (const detail of infrastructureFailures) console.error(`FAIL [infrastructure] ${detail}`);
}
for (const result of results) {
  const output = `${result.ok ? 'PASS' : 'FAIL'} ${result.label}${result.detail ? ` -- ${result.detail}` : ''}`;
  (result.ok ? console.log : console.error)(output);
}

const failureCount = infrastructureFailures.length + results.filter((result) => !result.ok).length;
console.log(`Summary: ${results.filter((result) => result.ok).length} passed, ${failureCount} failed.`);
if (failureCount > 0) process.exitCode = 1;
