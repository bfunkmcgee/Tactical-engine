import type { Action, GameEvent, GameState } from '../../state/GameState';
import { toMoveCandidatePayload, toUseAbilityCandidatePayload, toUseItemCandidatePayload } from './payloadSchemaValidationStage';

export function buildActionEmissionEvents(state: GameState, action: Action): GameEvent[] {
  const events: GameEvent[] = [
    {
      kind: 'ACTION_APPLIED',
      action,
      turn: state.turn,
      round: state.round,
    },
  ];

  if (action.type === 'MOVE') {
    const payload = toMoveCandidatePayload(action.payload);
    if (payload) {
      const movingUnit = state.units[payload.unitId];
      if (movingUnit?.position) {
        events.push({
          kind: 'UNIT_MOVED',
          unitId: payload.unitId,
          from: movingUnit.position,
          to: payload.to,
          turn: state.turn,
          round: state.round,
        });
      }
    }
  }

  if (action.type === 'USE_ABILITY') {
    const payload = toUseAbilityCandidatePayload(action.payload);
    if (payload) {
      events.push({
        kind: 'ABILITY_USED',
        unitId: payload.unitId,
        abilityId: payload.abilityId,
        targetId: payload.targetId,
        turn: state.turn,
        round: state.round,
      });
    }
  }

  if (action.type === 'USE_ITEM') {
    const payload = toUseItemCandidatePayload(action.payload);
    if (payload) {
      events.push({
        kind: 'ITEM_USED',
        unitId: payload.unitId,
        itemId: payload.itemId,
        targetId: payload.targetId,
        turn: state.turn,
        round: state.round,
      });
    }
  }

  return events;
}
