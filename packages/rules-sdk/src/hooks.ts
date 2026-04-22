import type { RuleHandler } from "./RuleSet";

export const createRuleHandler = (id: string, evaluate: RuleHandler["evaluate"]): RuleHandler => ({
  id,
  evaluate
});
