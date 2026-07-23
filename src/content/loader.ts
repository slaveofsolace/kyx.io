import { DEFAULT_RULESET_ID, getBundledRulesetSource } from './catalog';
import type {
  ContentValidationIssue,
  ContentValidationResult,
  RulesetContentV1,
} from './schemas/ruleset';
import { parseRulesetJson, validateRulesetContent } from './schemas/validateRuleset';

export class RulesetLoadError extends Error {
  readonly issues: readonly ContentValidationIssue[];

  constructor(issues: readonly ContentValidationIssue[]) {
    super(issues.map((issue) => `${issue.code} at ${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'RulesetLoadError';
    this.issues = issues;
  }
}

export function loadRuleset(
  id: string = DEFAULT_RULESET_ID,
  revision?: number,
): ContentValidationResult<RulesetContentV1> {
  const source = getBundledRulesetSource(id, revision);
  if (source === undefined) {
    const address = revision === undefined ? id : `${id}@${revision}`;
    return {
      ok: false,
      issues: [
        {
          code: 'CONTENT_RULESET_NOT_FOUND',
          path: '$',
          message: `Bundled ruleset not found: ${address}`,
        },
      ],
    };
  }
  return validateRulesetContent(source);
}

export function requireRuleset(
  id: string = DEFAULT_RULESET_ID,
  revision?: number,
): RulesetContentV1 {
  const result = loadRuleset(id, revision);
  if (!result.ok) throw new RulesetLoadError(result.issues);
  return result.value;
}

export { parseRulesetJson, validateRulesetContent };
