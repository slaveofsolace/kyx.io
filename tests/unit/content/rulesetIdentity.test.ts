import { describe, expect, it } from 'vitest';

import {
  hashRulesetContent,
  requireRuleset,
  serializeRulesetContent,
  validateRulesetContent,
} from '../../../src/content';

describe('ruleset compatibility identity', () => {
  it('hashes validated canonical content, independent of object key insertion order', () => {
    const ruleset = requireRuleset();
    const reorderedSource = Object.fromEntries(Object.entries(ruleset).reverse());
    const reordered = validateRulesetContent(reorderedSource);
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;

    expect(serializeRulesetContent(reordered.value)).toBe(serializeRulesetContent(ruleset));
    expect(hashRulesetContent(reordered.value)).toBe(hashRulesetContent(ruleset));
    expect(hashRulesetContent(ruleset)).toMatch(/^[a-f0-9]{16}$/u);
  });

  it('changes when canonical validated balance content changes', () => {
    const ruleset = requireRuleset();
    const changed = validateRulesetContent({ ...ruleset, displayName: 'Revamped test variant' });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;

    expect(hashRulesetContent(changed.value)).not.toBe(hashRulesetContent(ruleset));
  });

  it('pins distinct immutable hashes for the historical and current revisions', () => {
    const historical = requireRuleset('revamped_classic', 1);
    const current = requireRuleset('revamped_classic', 2);

    expect(hashRulesetContent(historical)).toBe('75c24a622286d2b0');
    expect(hashRulesetContent(current)).toBe('039ae95bed7ee716');
    expect(hashRulesetContent(requireRuleset('revamped_classic'))).toBe(
      hashRulesetContent(current),
    );
  });
});
