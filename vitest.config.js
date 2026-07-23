import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const sourceDirectory = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': sourceDirectory,
      '@app': `${sourceDirectory}/app`,
      '@content': `${sourceDirectory}/content`,
      '@sim': `${sourceDirectory}/sim`,
      '@physics': `${sourceDirectory}/physics`,
      '@net': `${sourceDirectory}/net`,
      '@render': `${sourceDirectory}/render`,
      '@ui': `${sourceDirectory}/ui`,
      '@audio': `${sourceDirectory}/audio`,
      '@platform': `${sourceDirectory}/platform`,
    },
  },
  test: {
    environment: 'node',
    include: [
      'tests/unit/**/*.{test,spec}.ts',
      'tests/contract/**/*.{test,spec}.ts',
      'tests/contracts/**/*.{test,spec}.ts',
      'tests/integration/**/*.{test,spec}.ts',
    ],
    exclude: [
      'tests/browser/**',
      'tests/multiplayer/**',
      'node_modules/**',
      'dist/**',
    ],
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    sequence: {
      shuffle: false,
    },
  },
});
