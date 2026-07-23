import { readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SIM_DIRECTORY = fileURLToPath(new URL('../../../src/sim/', import.meta.url));

function simulationSources(): Array<{ absolutePath: string; path: string; source: string }> {
  const collect = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collect(path);
      return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
    });

  return collect(SIM_DIRECTORY).map((path) => ({
    absolutePath: path,
    path: relative(SIM_DIRECTORY, path).replaceAll('\\', '/'),
    source: readFileSync(path, 'utf8'),
  }));
}

function isInsideSimulationDirectory(candidate: string): boolean {
  const relativePath = relative(SIM_DIRECTORY, candidate);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function staticModuleSpecifiers(source: string): readonly string[] {
  const pattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gu;
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

describe('simulation source boundary', () => {
  it('allows nested relative modules only when they still resolve inside src/sim', () => {
    const nestedSource = join(SIM_DIRECTORY, 'movement', 'controller.ts');
    expect(isInsideSimulationDirectory(resolve(dirname(nestedSource), '../units'))).toBe(true);
    expect(isInsideSimulationDirectory(resolve(dirname(nestedSource), '../../net/protocol'))).toBe(false);
    expect(staticModuleSpecifiers("import type { Millimeters } from '../units';")).toEqual([
      '../units',
    ]);
  });

  it('contains no presentation, browser-state, wall-clock, network, or unseeded randomness access', () => {
    const forbidden = [
      /\bwindow\b/,
      /\bdocument\b/,
      /\blocalStorage\b/,
      /\bsessionStorage\b/,
      /\bDate\b/,
      /\bperformance\b/,
      /\bprocess\b/,
      /\bglobalThis\b/,
      /\bcrypto\b/,
      /\bBuffer\b/,
      /\bWebSocket\b/,
      /\bXMLHttpRequest\b/,
      /\bfetch\s*\(/,
      /\bnavigator\b/,
      /\bAudio(?:Context)?\b/,
      /\bWebGL\w*\b/,
      /\bsetTimeout\b/,
      /\bsetInterval\b/,
      /\bsetImmediate\b/,
      /\bqueueMicrotask\b/,
      /\brequestAnimationFrame\b/,
      /Math\.random/,
      /\bimport\s*\(/,
      /\brequire\s*\(/,
    ];

    for (const file of simulationSources()) {
      for (const pattern of forbidden) {
        expect(file.source, `${file.path} matched ${String(pattern)}`).not.toMatch(pattern);
      }
      for (const specifier of staticModuleSpecifiers(file.source)) {
        expect(
          specifier.startsWith('.'),
          `${file.path} imports non-simulation module ${specifier}`,
        ).toBe(true);
        const resolved = resolve(dirname(file.absolutePath), specifier);
        expect(
          isInsideSimulationDirectory(resolved),
          `${file.path} import escapes src/sim: ${specifier}`,
        ).toBe(true);
      }
    }
  });

  it('exports only intent-shaped client commands from the simulation boundary', () => {
    const commandSource = readFileSync(`${SIM_DIRECTORY}/commands.ts`, 'utf8');
    expect(commandSource).toContain("readonly kind: 'player_intent'");
    expect(commandSource).not.toMatch(/readonly kind: ['"](?:kill|damage|set_position|set_score)/i);
  });
});
