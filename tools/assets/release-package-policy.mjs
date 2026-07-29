import { basename, extname } from 'node:path';

export const TEXT_RELEASE_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.csv',
  '.graphql',
  '.htm',
  '.html',
  '.js',
  '.json',
  '.jsonc',
  '.map',
  '.md',
  '.mjs',
  '.srt',
  '.svg',
  '.toml',
  '.tsv',
  '.txt',
  '.vtt',
  '.webmanifest',
  '.xml',
  '.yaml',
  '.yml',
]);

export const KNOWN_EXTENSIONLESS_TEXT_RELEASE_FILES = new Set([
  '.htaccess',
  '_headers',
  '_redirects',
]);

export function isProvenanceBearingReleaseFile(repositoryRelativePath) {
  const fileName = basename(repositoryRelativePath);
  if (KNOWN_EXTENSIONLESS_TEXT_RELEASE_FILES.has(fileName)) return false;
  return !TEXT_RELEASE_EXTENSIONS.has(extname(fileName).toLowerCase());
}
