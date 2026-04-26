# engine-core

`engine-core` owns simulation state, action contracts, and turn orchestration.

## Public API stability

- `stable`: `state/*`, `rng/SeededRng`
- `beta`: `simulation/*`
- `internal`: not exported via package `index.ts`

## Compatibility expectations

- Stable exports follow semver for breaking changes.
- Beta exports may change shape in minor releases while integration points settle.
- Internal modules are not supported for direct consumption.

## Action pipeline extension point

`simulation/ActionResolver.ts` orchestrates a staged pipeline under `simulation/action-pipeline/`.

When adding new action rules:
- add payload validation/normalization to `action-pipeline/payloadSchemaValidationStage.ts`;
- add legal candidate matching to `action-pipeline/legalActionMatchingStage.ts`;
- add spatial or target gating to `action-pipeline/spatialTargetChecksStage.ts`;
- add resource consumption events to `action-pipeline/resourcePaymentStage.ts`;
- add public action emission events to `action-pipeline/eventEmissionStage.ts`.

Keep `ActionResolver.applyAction` and `validateActionWithReason` focused on orchestration so behavior stays easy to test and reason about.
