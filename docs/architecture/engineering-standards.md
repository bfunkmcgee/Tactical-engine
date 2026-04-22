# Engineering Standards

## TypeScript and linting

- All workspaces extend `tsconfig.base.json` with strict options enabled.
- ESLint uses type-aware `@typescript-eslint` rules with `--max-warnings=0` in CI.
- Prettier is the formatter of record across all workspaces.

## Content schema validation

- Every game content pack must ship a `content/schema.ts` exporting a Zod schema.
- Content JSON (`content/pack.json`) must validate locally via `pnpm validate:content`.
- Invalid packs block release.

## Semantic versioning

- Publishable packages under `packages/*` must use SemVer.
- Changes are tracked with Changesets (`.changeset/config.json`).
- Contract-breaking changes require a major bump across impacted packages.

## Contract testing

- Contract tests live under `tests/contract`.
- Engine ↔ rules interfaces must be validated by tests before merge.
