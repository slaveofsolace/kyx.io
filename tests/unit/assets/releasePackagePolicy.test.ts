import { describe, expect, it } from 'vitest';

import {
  isProvenanceBearingReleaseFile,
} from '../../../tools/assets/release-package-policy.mjs';

describe('release package closed-world file policy', () => {
  it.each([
    'audio/shot.wav',
    'audio/ambience.ogg',
    'audio/music.mp3',
    'fonts/hud.woff',
    'fonts/hud.woff2',
    'runtime/physics.wasm',
    'video/intro.webm',
    'video/intro.mp4',
    'archives/source.zip',
    'models/soldier.glb',
    'textures/albedo.png',
    'unknown/payload.bin',
    'unknown/extensionless',
  ])('requires provenance for %s', (path) => {
    expect(isProvenanceBearingReleaseFile(path)).toBe(true);
  });

  it.each([
    'index.html',
    'assets/index.js',
    'assets/index.css',
    'assets/index.js.map',
    'manifest.webmanifest',
    'captions/match.vtt',
    'icons/mark.svg',
    '_headers',
    '_redirects',
    '.htaccess',
  ])('allows known text/build output %s', (path) => {
    expect(isProvenanceBearingReleaseFile(path)).toBe(false);
  });
});
