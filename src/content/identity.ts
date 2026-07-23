import type { RulesetContentV1 } from './schemas/ruleset';
import { validateRulesetContent } from './schemas/validateRuleset';

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value !== null && typeof value === 'object') {
    const record = value as Readonly<Record<string, unknown>>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalJsonValue(record[key])]),
    );
  }
  return value;
}

function hashUtf8FNV64(value: string): string {
  let hash = FNV64_OFFSET;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV64_PRIME) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

export function serializeRulesetContent(ruleset: RulesetContentV1): string {
  const validated = validateRulesetContent(ruleset);
  if (!validated.ok) throw new RangeError('ruleset content is invalid');
  return JSON.stringify(canonicalJsonValue(validated.value));
}

export function hashRulesetContent(ruleset: RulesetContentV1): string {
  return hashUtf8FNV64(serializeRulesetContent(ruleset));
}
