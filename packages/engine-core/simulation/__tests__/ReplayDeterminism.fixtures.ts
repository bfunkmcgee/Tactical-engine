import type { Action, GameState } from '../../state/GameState';

export interface ReplayFixture {
  readonly name: string;
  readonly scheduler: 'team' | 'unit';
  readonly seed?: number;
  readonly initialState: GameState;
  readonly actions: readonly Action[];
}

export const movementAttackStatusFixture: ReplayFixture = {
  name: 'movement-attack-status-team-scheduler',
  scheduler: 'team',
  initialState: {
    round: 1,
    turn: 1,
    phase: 'COMMAND',
    activeActivationSlot: { id: 'team:A', entityId: 'A', teamId: 'A', label: 'Team A' },
    players: ['A', 'B'],
    units: {
      'u-a': { id: 'u-a', ownerId: 'A', hp: 10, maxHp: 10, actionPoints: 4, maxActionPoints: 4, position: { x: 0, y: 0 } },
      'u-b': { id: 'u-b', ownerId: 'B', hp: 8, maxHp: 8, actionPoints: 2, maxActionPoints: 2, position: { x: 2, y: 0 } },
    },
    pendingActions: [],
    eventLog: [],
    matchStatus: 'IN_PROGRESS',
    isDraw: false,
  },
  actions: [
    { id: 'move:A:u-a:1:0', actorId: 'A', type: 'MOVE', payload: { unitId: 'u-a', to: { x: 1, y: 0 } } },
    { id: 'attack:A:u-b', actorId: 'A', type: 'ATTACK', payload: { targetId: 'u-b', amount: 1 } },
    {
      id: 'apply-status:A:u-a:u-b:marked',
      actorId: 'A',
      type: 'APPLY_STATUS',
      payload: { sourceUnitId: 'u-a', targetId: 'u-b', statusId: 'marked', duration: 1 },
    },
    { id: 'end-command:A', actorId: 'A', type: 'END_COMMAND', payload: { reason: 'manual' } },
  ],
};

export const unitSchedulerSeededFixture: ReplayFixture = {
  name: 'unit-scheduler-seeded-turn-rotation',
  scheduler: 'unit',
  seed: 1337,
  initialState: {
    round: 1,
    turn: 1,
    phase: 'COMMAND',
    activeActivationSlot: { id: 'unit:alpha', entityId: 'alpha', teamId: 'A', label: 'Unit alpha' },
    players: ['A', 'B'],
    units: {
      alpha: { id: 'alpha', ownerId: 'A', hp: 6, maxHp: 6, position: { x: 0, y: 0 } },
      bravo: { id: 'bravo', ownerId: 'B', hp: 6, maxHp: 6, position: { x: 1, y: 0 } },
      charlie: { id: 'charlie', ownerId: 'A', hp: 6, maxHp: 6, position: { x: 2, y: 0 } },
    },
    pendingActions: [],
    eventLog: [],
    matchStatus: 'IN_PROGRESS',
    isDraw: false,
  },
  actions: [
    { id: 'end-command:alpha', actorId: 'alpha', type: 'END_COMMAND', payload: { reason: 'manual' } },
    { id: 'end-command:bravo', actorId: 'bravo', type: 'END_COMMAND', payload: { reason: 'manual' } },
    { id: 'end-command:charlie', actorId: 'charlie', type: 'END_COMMAND', payload: { reason: 'manual' } },
  ],
};
