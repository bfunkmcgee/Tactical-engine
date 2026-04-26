# engine-entities

`engine-entities` contains the ECS-style entity store, core components, and gameplay systems.

## Public API stability

- `beta`: all current exports in package `index.ts`
- `internal`: adapter-only and test-only modules not exported from `index.ts`

## Compatibility expectations

- Current public surface is beta and may change in minor versions.
- Prefer importing only from `engine-entities` package root exports.
- Direct internal module imports are unsupported.
