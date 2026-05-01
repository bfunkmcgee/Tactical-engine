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


## Engine construction

`Engine` now uses a single constructor pattern: `new Engine(options?)`.

- Use the `EngineOptions` object to override dependencies and strategies.
- Positional constructor arguments are no longer supported.

## Event log retention boundary

`Engine` is the single retention policy boundary for `eventLog`.

- Configure retention via `EngineOptions.maxEventLogLength` and `EngineOptions.emitEventLogCompactionMarker`.
- `state/appendEvents` is append-only and intentionally does not enforce retention.
- Low-level simulation helpers (notably `ActionResolver.applyAction`) are orchestration utilities and may bypass retention; use `Engine.step`/`Engine.applyAction` in application flows when retention guarantees matter.

## Action pipeline extension point

`simulation/ActionResolver.ts` orchestrates a staged pipeline under `simulation/action-pipeline/`.

When adding new action rules:
- add payload validation/normalization to `action-pipeline/payloadSchemaValidationStage.ts`;
- add legal candidate matching to `action-pipeline/legalActionMatchingStage.ts`;
- add spatial or target gating to `action-pipeline/spatialTargetChecksStage.ts`;
- add resource consumption events to `action-pipeline/resourcePaymentStage.ts`;
- add public action emission events to `action-pipeline/eventEmissionStage.ts`.

Keep `ActionResolver.applyAction` and `validateActionWithReason` focused on orchestration so behavior stays easy to test and reason about. Prefer `Engine.step` for retained production flows.
