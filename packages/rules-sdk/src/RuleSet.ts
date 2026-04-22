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

export interface RuleSet {
  readonly id: string;
  readonly handlers: readonly RuleHandler[];
}
