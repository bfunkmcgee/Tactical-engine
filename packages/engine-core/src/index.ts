import type { RuleContext, RuleHandler, RuleResult } from "@tactical/rules-sdk";

export type EngineTick = RuleContext & {
  readonly deltaMs: number;
};

export class EngineCore {
  public constructor(private readonly rules: readonly RuleHandler[]) {}

  public evaluateTurn(tick: EngineTick): RuleResult[] {
    const context: RuleContext = {
      turn: tick.turn,
      seed: tick.seed
    };

    return this.rules.map((rule) => rule.evaluate(context));
  }
}
