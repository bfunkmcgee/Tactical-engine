import { appendEvents, reduceEvents, type Action, type GameEvent, type GameState, type StateTransitionResult } from '../state/GameState';

export class ActionResolver {
  public applyAction(state: GameState, action: Action): StateTransitionResult {
    const legalActions = this.getLegalActions(state, action.actorId);
    const isLegal = legalActions.some((candidate) => this.actionsMatch(candidate, action));

    if (!isLegal) {
      return { state, events: [] };
    }

    const events: GameEvent[] = [
      {
        kind: 'ACTION_APPLIED',
        action,
        turn: state.turn,
        round: state.round,
      },
    ];

    if (action.type === 'ATTACK') {
      const amount = Math.max(0, action.payload?.amount ?? 1);
      const targetId = action.payload?.targetId;

      if (targetId) {
        events.push({
          kind: 'UNIT_DAMAGED',
          sourceId: action.actorId,
          targetId,
          amount,
          turn: state.turn,
          round: state.round,
        });
      }
    }

    const nextState = appendEvents(reduceEvents(state, events), events);
    return {
      state: nextState,
      events,
    };
  }

  public getLegalActions(state: GameState, actorId: string): Action[] {
    if (state.activeActorId !== actorId) {
      return [];
    }

    switch (state.phase) {
      case 'COMMAND': {
        const attackActions: Action[] = Object.values(state.units)
          .filter((unit) => unit.ownerId !== actorId && unit.hp > 0)
          .map((target) => ({
            id: `attack:${actorId}:${target.id}`,
            actorId,
            type: 'ATTACK',
            payload: { targetId: target.id, amount: 1 },
          }));

        return [
          ...attackActions,
          {
            id: `end-command:${actorId}`,
            actorId,
            type: 'END_COMMAND',
          },
        ];
      }

      case 'RESOLUTION':
      case 'START_TURN':
      case 'END_TURN':
        return [
          {
            id: `pass:${actorId}:${state.phase}`,
            actorId,
            type: 'PASS',
          },
        ];

      default:
        return [];
    }
  }

  private actionsMatch(left: Action, right: Action): boolean {
    return left.id === right.id && left.actorId === right.actorId && left.type === right.type;
  }
}
