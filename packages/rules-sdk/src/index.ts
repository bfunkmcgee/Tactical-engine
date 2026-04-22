export type RuleContext = {
  readonly turn: number;
  readonly seed: number;
};

export type RuleResult = {
  readonly success: boolean;
  readonly effects: readonly string[];
};

export interface RuleHandler {
  readonly id: string;
  evaluate(context: RuleContext): RuleResult;
}

export const createRuleHandler = (id: string, evaluate: RuleHandler["evaluate"]): RuleHandler => ({
  id,
  evaluate
});
