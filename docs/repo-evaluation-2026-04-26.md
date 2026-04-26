# Tactical Engine Repository Evaluation (2026-04-26)

## Scope and method

This assessment covers architecture, stability, and current error posture for the turn-based tactical engine monorepo.

Checks executed:
- `npm run ci`
- targeted source review across `engine-core`, `engine-spatial`, `engine-entities`, `rules-sdk`, `games/example-skirmish`, and `apps/web-client`

---

## 1) Architecture assessment

### What is strong right now

1. **Clear monorepo package boundaries with explicit roles.**
   - Package-level separation of simulation core, spatial logic, ECS systems, rule/content SDK, and web client is already clear in repo structure and README declarations.

2. **Event-sourced-ish simulation shape is a good fit for tactical games.**
   - `Engine` composes action resolution + strategies + turn management and transforms state via event reduction (`reduceEvents`) and append (`appendEvents`). This makes replay/testing easier and encourages deterministic transitions.

3. **Rules adapter seam is present and already used in example scenario runtime.**
   - `games/example-skirmish/scenario/runtime.ts` injects rules-based legal-action generation and match outcome evaluation into `Engine`, showing that the architecture can move from demo logic toward rules-driven runtime.

4. **Import boundary hygiene check exists and is in CI.**
   - `scripts/check-no-cross-package-internal-imports.mjs` prevents relative-import leakage across package/app boundaries, reducing accidental coupling drift.

### Architectural risks / debt

1. **Single `ActionResolver` is carrying multiple responsibilities.**
   - It currently validates payload schemas, checks legal action membership, performs spatial checks (LOS/range), stages effect processing, and emits events. This is practical early on, but it is a high-change hotspot and will likely accumulate conditional complexity.

2. **`Engine` and `ActionResolver` share overlapping rejection/event responsibilities.**
   - Both can reject actions and emit `ACTION_REJECTED`-based transitions. This can lead to policy divergence over time unless one is clearly designated as the source of truth.

3. **Scenario runtime registry is lightweight but not strongly lifecycle-aware.**
   - `createScenarioRuntimeRegistry` is intentionally simple and throws on unknown IDs; this is fine now, but future multiplayer/session persistence flows will likely need richer runtime metadata, versioning, and recovery semantics.

4. **Web client state store is tightly bound to direct engine calls.**
   - `presentationStore` performs legality checks and state stepping directly in React state updates, which keeps demo wiring short but mixes orchestration concerns into UI runtime state management.

### Architecture improvements (prioritized)

1. **Decompose `ActionResolver` into pipeline modules (highest priority).**
   - Suggested slices:
     - `ActionSchemaValidator`
     - `LegalityMatcher`
     - `TargetingValidator` (LOS/range/position)
     - `ResourcePaymentStage`
     - `EffectEmitter`
   - Keep `ActionResolver` as orchestrator only.

2. **Adopt a single authoritative rejection path.**
   - Either:
     - `Engine` handles all rejection event emission and `ActionResolver` becomes pure validator/effect planner; or
     - `ActionResolver` returns canonical domain events and `Engine` never creates rejection events itself.

3. **Define engine-core “public contract tiers”.**
   - Mark exported APIs as `stable`, `beta`, `internal` (even just via docs + JSDoc tags initially) to reduce accidental lock-in during rapid iteration.

4. **Introduce an app-side command bus interface.**
   - Web UI should dispatch commands to a single runtime adapter (`dispatchAction`, `queryLegalActions`, `subscribeSnapshot`) instead of interacting with engine internals in component hooks.

---

## 2) Stability assessment

### Current strengths

1. **Good breadth of automated tests across core systems.**
   - Tests exist for action resolution, turn management, cross-package import boundaries, spatial algorithms, scenario runtime integration, and UI state adapters.

2. **Determinism-minded scheduler implementation.**
   - `TurnManager` supports lexical ordering baseline and seeded/initiative variants, which is a strong foundation for reproducibility.

3. **Defensive initialization and diagnostics in scenario setup.**
   - Example scenario wraps content validation and exposes diagnostics-rich initialization errors that the UI adapter can surface.

### Stability concerns

1. **CI currently fails at typecheck (blocking).**
   - One assertion method in tests was incompatible with the current TypeScript/node assertion typings.

2. **Event log growth is unbounded in state.**
   - `appendEvents` always extends `eventLog`; long sessions may create memory pressure and slower derived-state projections without pruning/snapshotting.

3. **Outcome and lifecycle integration remains partial by design.**
   - README explicitly notes demo-only lifecycle wiring gaps (turn lifecycle hooks, victory wiring into full match-end UX), which can mask edge-case breakage in longer simulations.

### Stability improvements (prioritized)

1. **Enforce CI green as branch protection baseline.**
   - Keep `npm run ci` clean before merge and add pre-commit/pre-push hook running at least `check:imports` + `typecheck`.

2. **Add deterministic simulation replay tests.**
   - Add golden tests for seeded state + command sequence -> exact event trace + terminal state hash.

3. **Implement event-log retention strategy.**
   - Add `maxEventLogLength` option or periodic compaction snapshots to bound memory in long matches.

4. **Broaden property-based and fuzz testing around action payload validation.**
   - Especially for malformed payload keys/types and out-of-phase action attempts.

---

## 3) Error posture

### Error observed during evaluation

- `npm run ci` failed at:
  - `packages/engine-core/simulation/__tests__/ActionResolver.test.ts`
  - TypeScript error: `Property 'notStrictEqual' does not exist on type 'typeof import("node:assert/strict")'`.

### Fix applied in this branch

- Replaced `assert.notStrictEqual(...)` with `assert.ok(result.state !== state)` in the failing test file to align with available `node:assert/strict` typings in this workspace configuration.

### Additional error-handling recommendations

1. **Standardize domain error taxonomy.**
   - Define centrally for validation, rule evaluation, integrity violations, and scenario initialization.

2. **Attach stable machine-readable error codes everywhere exceptions can escape package boundaries.**
   - Especially `rules-sdk` scenario registry/runtime creation and rules adapter transitions.

3. **Add “strict mode” runtime assertions in development builds.**
   - Detect impossible phase transitions, invalid activation slots, negative AP/HP drift, and unknown event kinds.

4. **Emit structured diagnostics payloads for UI/devtools.**
   - Include correlation IDs, phase, actor, action ID/type, and reduced state fingerprints to simplify regression triage.

---

## Suggested execution roadmap (30/60/90 days)

### 30 days
- Keep CI green and enforce it as mandatory.
- Refactor `ActionResolver` into internal modules without changing external behavior.
- Add replay determinism tests for two canonical scenarios.

### 60 days
- Add event-log retention/snapshot strategy.
- Introduce app command bus adapter and remove direct engine stepping from UI hook internals.
- Expand integration tests for end-to-end scenario lifecycle (init -> turns -> victory).

### 90 days
- Finalize stable `engine-core` surface contract and deprecate unstable entry points.
- Add optional telemetry/devtools event stream for debugging and balancing.
- Validate at least one additional scenario pack to test generality beyond example skirmish.

---

## Bottom line

The repository already has a solid architecture direction for a turn-based tactical engine (modular packages, event-driven state progression, and rule-set integration seams). The biggest near-term wins are to (1) keep CI strictly green, (2) reduce complexity concentration in `ActionResolver`, and (3) harden deterministic/replay and long-session stability behaviors before broadening feature scope.
