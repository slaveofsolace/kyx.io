import { expect, test } from '@playwright/test';

test('development browser route reproduces the Node and Worker combat digest', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/__test__/determinism', { waitUntil: 'networkidle' });
  await expect(page.locator('body')).toHaveAttribute('data-determinism-status', 'pass');

  const result = await page.evaluate(async () => {
    const modulePath = '/src/net/combatConsequence.ts';
    const digest = await import(modulePath) as Readonly<{
      canonicalCombatConsequenceV1(value: unknown): string;
      hashCombatConsequenceV1(value: unknown): string;
    }>;
    const consequence = {
      acceptedShotCount: 10,
      magazineRounds: 40,
      targetHealthPoints: 0,
      targetDeathOrdinal: 1,
      blueScore: 1,
      feedSequence: 1,
      eventCounts: { shotAccepted: 10, damageApplied: 10, playerKilled: 1 },
    };
    return {
      canonical: digest.canonicalCombatConsequenceV1(consequence),
      hash: digest.hashCombatConsequenceV1(consequence),
    };
  });

  expect(result).toEqual({
    canonical: '{"acceptedShotCount":10,"magazineRounds":40,"targetHealthPoints":0,"targetDeathOrdinal":1,"blueScore":1,"feedSequence":1,"eventCounts":{"shotAccepted":10,"damageApplied":10,"playerKilled":1}}',
    hash: 'c614736551a1a503',
  });
  expect(pageErrors).toEqual([]);
});
