# Tactical Engine (Monorepo)

This repository is a TypeScript tactical-combat engine workspace with a playable web demo and an example rules/content pack. The current focus is validating engine architecture and integration seams, not shipping a production-complete game stack.

## Repository structure

- `packages/engine-core` — Turn flow, simulation contracts, state reducers, and action resolution primitives.
- `packages/engine-spatial` — Grid/pathfinding, line-of-sight, and target range utilities.
- `packages/engine-entities` — ECS-style entity store, components, and gameplay systems adapters.
- `packages/rules-sdk` — Rules/content interfaces and helpers used by game-specific rulesets.
- `apps/web-client` — React + Vite demo client that renders and drives the current engine loop.
- `games/example-skirmish` — Example scenario content and rules wiring used for development and integration checks.

## Stable vs experimental

- `packages/engine-core`: **Stable for internal iteration** on turn/state/action fundamentals, but still evolving for broader external API guarantees.
- `packages/engine-spatial`: **Stable for current grid-combat demo use cases**, with extension points still considered experimental.
- `packages/engine-entities`: **Experimental**, with system boundaries and component contracts still being refined.
- `packages/rules-sdk`: **Experimental**, intended as a shaping layer while canonical rules/content APIs settle.
- `apps/web-client`: **Experimental demo app**, useful for validation but not hardened as a production client.
- `games/example-skirmish`: **Experimental sample content**, intentionally scoped as a reference scenario rather than a full game.

## Setup

### Prerequisites

- Node.js 20+
- npm 10+

### Install dependencies

From repository root:

```bash
npm ci
npm install --prefix apps/web-client
```

## Root workspace commands

Run these from repository root:

```bash
npm run check:test-scope
npm run typecheck
npm run build:test-artifacts
npm run test
npm run ci
```

What they do:

- `check:test-scope` guards CI scope by ensuring major app source globs remain included in `tsconfig.tests.json`.
- `typecheck` validates TypeScript across engine, packages, app source, and tests via `tsconfig.tests.json`.
- `build:test-artifacts` compiles test-targeted artifacts into `.tmp-test-dist` for packages and app source.
- `test` builds test artifacts and runs Node test suites discovered from compiled package/app outputs.
- `ci` runs the local CI gate (`check:test-scope` + `typecheck` + `test`).

## App-specific commands (`apps/web-client`)

```bash
npm run dev --prefix apps/web-client
npm run build --prefix apps/web-client
npm run typecheck --prefix apps/web-client
npm run preview --prefix apps/web-client
```

## Near-term roadmap (engine hardening)

1. **Scheduler hardening**: tighten deterministic turn scheduling and explicit phase transitions.
2. **Action/effect pipeline**: formalize action validation, effect application ordering, and rollback-safe resolution hooks.
3. **Scenario wiring**: strengthen game-content bootstrap/wiring from `games/example-skirmish` into reusable rules-driven scenario assembly.

## Current maturity expectations

This repo demonstrates a working vertical slice and architecture direction. Several modules are intentionally marked experimental, and some capabilities are validated primarily through the demo path and integration tests rather than production-ready runtime guarantees.

## Example runtime integration status

The web demo now boots from a single scenario runtime source (`games/example-skirmish/scenario/runtime.ts`) that binds:

- `engine-core` state/action pipeline
- `rules-sdk` legal targeting + damage resolution hooks via adapter
- `games/example-skirmish` content + `ExampleRuleSet`
- `apps/web-client` presentation store initialization

### Still demo-only after this integration

- Turn economy is still simplified and does not yet run full `RuleSet` turn lifecycle hooks for every phase transition.
- `USE_ABILITY` and `USE_ITEM` outcomes still use engine-core demo event behavior unless explicitly represented as attacks.
- Victory checks from `RuleSet.checkVictory` are not yet connected to a match-end state in `engine-core` or the web UI.
- Scenario selection/loading is still hard-wired to the example skirmish runtime (no content browser or save/load flow yet).
