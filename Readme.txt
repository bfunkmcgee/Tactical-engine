# Tactical Engine Monorepo

## Structure

- `packages/engine-core`
- `packages/engine-spatial`
- `packages/engine-entities`
- `packages/rules-sdk`
- `packages/net-sync`
- `apps/web-client`
- `games/example-skirmish`
- `tools/`

## Standards

- Strict TypeScript baseline (`tsconfig.base.json`)
- ESLint + Prettier shared config
- Schema validation for content packs (`pnpm validate:content`)
- Semantic versioning with Changesets
- Contract tests between `engine-core` and `rules-sdk`
- Architecture docs for dependency boundaries and extension points
