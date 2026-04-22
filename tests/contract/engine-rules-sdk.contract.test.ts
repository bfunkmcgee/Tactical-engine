import { describe, expect, it } from "vitest";

import { EngineCore } from "@tactical/engine-core";
import { createRuleHandler } from "@tactical/rules-sdk";

describe("engine-core <-> rules-sdk contract", () => {
  it("executes RuleHandler.evaluate using RuleContext semantics", () => {
    const rule = createRuleHandler("contract-check", (context) => ({
      success: context.turn === 2,
      effects: [`seed:${context.seed}`]
    }));

    const engine = new EngineCore([rule]);
    const [result] = engine.evaluateTurn({ turn: 2, seed: 99, deltaMs: 16 });

    expect(result.success).toBe(true);
    expect(result.effects).toContain("seed:99");
  });
});
