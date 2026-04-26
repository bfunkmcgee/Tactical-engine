# engine-spatial

`engine-spatial` provides grid utilities, line-of-sight checks, and tactical targeting helpers.

## Public API stability

- `stable`: `grid/GridAdapter`, `los/LineOfSight`
- `beta`: `pathfinding/AStar`, `range/Targeting`
- `internal`: not exported via package `index.ts`

## Compatibility expectations

- Stable exports are semver-governed.
- Beta exports may evolve in minor versions.
- Internal modules are intentionally unsupported for direct imports.
