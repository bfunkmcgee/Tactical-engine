import { EngineCore } from "@tactical/engine-core";
import { createRuleHandler } from "@tactical/rules-sdk";

const engine = new EngineCore([
  createRuleHandler("ui-preview", (context) => ({
    success: context.turn % 2 === 0,
    effects: ["preview-effect"]
  }))
]);

void engine.evaluateTurn({ turn: 1, seed: 42, deltaMs: 16 });
