# Dependency Boundaries

## Workspace layout

- `packages/engine-core`: deterministic orchestration loop and rule evaluation lifecycle.
- `packages/engine-spatial`: spatial math and map/grid primitives only.
- `packages/engine-entities`: entity state model with references to `engine-spatial` types.
- `packages/rules-sdk`: public rules authoring contracts consumed by game-specific rules.
- `packages/net-sync`: serialization primitives for snapshots and remote sync.
- `apps/web-client`: host runtime and rendering shell for browser clients.
- `games/example-skirmish`: content pack + rules implementation example.
- `tools`: repository-level utility scripts.

## Allowed package dependency flow

1. `rules-sdk` is leaf/public contract. It must not depend on engine internals.
2. `engine-core` may consume `rules-sdk` and orchestrate evaluation.
3. `engine-entities` may consume `engine-spatial` for positional data.
4. `net-sync` may consume `engine-entities` and passive data types only.
5. `apps` and `games` can depend on any public package, but packages cannot depend on apps/games.

## Extension points

- **Rule handlers**: created via `createRuleHandler` in `rules-sdk` and loaded by `engine-core`.
- **Content packs**: JSON packs validated against Zod schemas before runtime.
- **Network transports**: adapters wrap `net-sync` serialization without changing engine packages.
- **Game modules**: each game under `games/*` provides pack schema, data, and optional custom rules.
