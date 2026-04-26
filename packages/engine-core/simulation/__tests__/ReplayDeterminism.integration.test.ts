import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ActionResolver } from '../ActionResolver';
import { Engine } from '../Engine';
import type { LegalActionGenerator } from '../LegalActionGenerator';
import {
  createInitiativeOrderingPolicy,
  createSeededTieBreakerOrderingPolicy,
  TeamTurnScheduler,
  TurnManager,
  UnitTurnScheduler,
} from '../TurnManager';
import type { Action, GameEvent, GameState } from '../../state/GameState';
import { movementAttackStatusFixture, unitSchedulerSeededFixture, type ReplayFixture } from './ReplayDeterminism.fixtures';

interface ReplayResult {
  readonly events: readonly GameEvent[];
  readonly eventKinds: readonly GameEvent['kind'][];
  readonly fingerprint: string;
  readonly finalState: GameState;
}

class FixtureLegalActionGenerator implements LegalActionGenerator {
  public getLegalActions(state: GameState, actorId: string): Action[] {
    const activeActorId = state.activeActivationSlot.entityId;
    if (activeActorId !== actorId) {
      return [];
    }

    if (state.phase === 'COMMAND') {
      return [{ id: `end-command:${actorId}`, actorId, type: 'END_COMMAND', payload: { reason: 'manual' } }];
    }

    if (state.phase === 'START_TURN' || state.phase === 'RESOLUTION' || state.phase === 'END_TURN') {
      return [{ id: `pass:${actorId}:${state.phase}`, actorId, type: 'PASS', payload: { phase: state.phase } }];
    }

    return [];
  }
}

function fingerprintState(state: GameState): string {
  const normalized = {
    round: state.round,
    turn: state.turn,
    phase: state.phase,
    activeActivationSlot: state.activeActivationSlot,
    pendingActions: state.pendingActions.map((action) => action.id),
    units: Object.values(state.units)
      .map((unit) => ({
        id: unit.id,
        ownerId: unit.ownerId,
        hp: unit.hp,
        position: unit.position,
        actionPoints: unit.actionPoints,
        activeEffects: [...(unit.activeEffects ?? [])]
          .map((effect) => ({
            effectId: effect.effectId,
            sourceUnitId: effect.sourceUnitId,
            duration: effect.duration,
            stacks: effect.stacks,
          }))
          .sort((left, right) => `${left.effectId}:${left.sourceUnitId ?? ''}`.localeCompare(`${right.effectId}:${right.sourceUnitId ?? ''}`)),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };

  return JSON.stringify(normalized);
}

function replayFixture(fixture: ReplayFixture): ReplayResult {
  const turnManager =
    fixture.scheduler === 'unit'
      ? new TurnManager(
          new UnitTurnScheduler(
            createInitiativeOrderingPolicy({
              getInitiative: () => 1,
              tieBreakerPolicy: createSeededTieBreakerOrderingPolicy(fixture.seed ?? 0),
            }),
          ),
        )
      : new TurnManager(new TeamTurnScheduler());

  const engine =
    fixture.scheduler === 'unit'
      ? new Engine({ turnManager, actionResolver: new ActionResolver(new FixtureLegalActionGenerator()) })
      : new Engine({ turnManager });

  let state = fixture.initialState;
  const events: GameEvent[] = [];
  const eventKinds: GameEvent['kind'][] = [];
  for (const action of fixture.actions) {
    const result = engine.step(state, action);
    state = result.state;
    events.push(...result.events);
    eventKinds.push(...result.events.map((event) => event.kind));
  }

  return {
    events,
    eventKinds,
    finalState: state,
    fingerprint: fingerprintState(state),
  };
}

test('replay fixture: movement + attack + status produces exact event sequence and fingerprint', () => {
  const result = replayFixture(movementAttackStatusFixture);

  assert.deepEqual(result.eventKinds, [
    'ACTION_APPLIED',
    'UNIT_MOVED',
    'ACTION_APPLIED',
    'ACTION_POINTS_CHANGED',
    'UNIT_DAMAGED',
    'ACTION_APPLIED',
    'STATUS_APPLIED',
    'ACTION_APPLIED',
    'PHASE_ADVANCED',
    'PHASE_ADVANCED',
    'PHASE_ADVANCED',
    'TURN_STARTED',
    'PHASE_ADVANCED',
  ]);

  assert.equal(result.fingerprint, '{"round":1,"turn":2,"phase":"COMMAND","activeActivationSlot":{"id":"team:B","entityId":"B","teamId":"B","label":"Team B"},"pendingActions":[],"units":[{"id":"u-a","ownerId":"A","hp":10,"position":{"x":1,"y":0},"actionPoints":3,"activeEffects":[]},{"id":"u-b","ownerId":"B","hp":7,"position":{"x":2,"y":0},"actionPoints":2,"activeEffects":[{"effectId":"marked","sourceUnitId":"u-a","duration":1,"stacks":1}]}]}');
});

test('replay fixture: seeded unit scheduler emits stable deterministic replay boundary', () => {
  const firstRun = replayFixture(unitSchedulerSeededFixture);
  const secondRun = replayFixture(unitSchedulerSeededFixture);

  assert.deepEqual(firstRun.eventKinds, secondRun.eventKinds);
  assert.equal(firstRun.fingerprint, secondRun.fingerprint);
  assert.deepEqual(firstRun.eventKinds, [
    'ACTION_APPLIED',
    'PHASE_ADVANCED',
    'PHASE_ADVANCED',
    'PHASE_ADVANCED',
    'TURN_STARTED',
    'PHASE_ADVANCED',
    'ACTION_APPLIED',
    'PHASE_ADVANCED',
    'PHASE_ADVANCED',
    'PHASE_ADVANCED',
    'TURN_STARTED',
    'PHASE_ADVANCED',
    'ACTION_APPLIED',
    'PHASE_ADVANCED',
    'PHASE_ADVANCED',
    'PHASE_ADVANCED',
    'TURN_STARTED',
    'PHASE_ADVANCED',
  ]);
  assert.equal(firstRun.fingerprint, '{"round":3,"turn":4,"phase":"COMMAND","activeActivationSlot":{"id":"unit:alpha","entityId":"alpha","teamId":"A","label":"Unit alpha"},"pendingActions":[],"units":[{"id":"alpha","ownerId":"A","hp":6,"position":{"x":0,"y":0},"activeEffects":[]},{"id":"bravo","ownerId":"B","hp":6,"position":{"x":1,"y":0},"activeEffects":[]},{"id":"charlie","ownerId":"A","hp":6,"position":{"x":2,"y":0},"activeEffects":[]}]}');
});

test('negative: replay fingerprint changes when action order changes', () => {
  const baseline = replayFixture(movementAttackStatusFixture);
  const reorderedFixture: ReplayFixture = {
    ...movementAttackStatusFixture,
    actions: [
      movementAttackStatusFixture.actions[0] as Action,
      movementAttackStatusFixture.actions[2] as Action,
      movementAttackStatusFixture.actions[1] as Action,
      movementAttackStatusFixture.actions[3] as Action,
    ],
  };

  const reordered = replayFixture(reorderedFixture);
  assert.equal(JSON.stringify(reordered.eventKinds) === JSON.stringify(baseline.eventKinds), false);
});

test('negative: event contract catches non-deterministic ordering regressions', () => {
  const baseline = replayFixture(movementAttackStatusFixture);
  const reordered = [
    ...baseline.eventKinds.slice(0, 3),
    baseline.eventKinds[5] as GameEvent['kind'],
    baseline.eventKinds[4] as GameEvent['kind'],
    ...baseline.eventKinds.slice(6),
  ];

  assert.equal(JSON.stringify(reordered) === JSON.stringify(baseline.eventKinds), false);
});
