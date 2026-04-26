import type { Action, GameEvent, UnitState } from '../../state/GameState';
import {
  toAttackCandidatePayload,
  toMoveCandidatePayload,
  toUseAbilityCandidatePayload,
  toUseItemCandidatePayload,
} from './payloadSchemaValidationStage';

export function buildResourcePaymentEvents(params: {
  action: Action;
  actorUnit?: UnitState;
  turn: number;
  round: number;
}): GameEvent[] {
  const { action, actorUnit, turn, round } = params;
  if (!actorUnit) {
    return [];
  }

  const events: GameEvent[] = [];
  const actionPointCost = getActionPointCost(action);
  if (actionPointCost > 0 && typeof actorUnit.actionPoints === 'number') {
    events.push({
      kind: 'ACTION_POINTS_CHANGED',
      unitId: actorUnit.id,
      from: actorUnit.actionPoints,
      to: Math.max(0, actorUnit.actionPoints - actionPointCost),
      reason: action.type === 'MOVE' ? 'MOVE' : action.type === 'ATTACK' ? 'ATTACK' : 'EFFECT',
      turn,
      round,
    });
  }

  const cooldown = getCooldownCost(action);
  const cooldownKey = getCooldownKey(action);
  if (cooldown > 0 && cooldownKey) {
    const from = actorUnit.cooldowns?.[cooldownKey] ?? 0;
    events.push({
      kind: 'COOLDOWN_TICKED',
      unitId: actorUnit.id,
      abilityId: cooldownKey,
      from,
      to: cooldown,
      turn,
      round,
    });
  }

  return events;
}

function getActionPointCost(action: Action): number {
  if (action.type === 'ATTACK') {
    return toAttackCandidatePayload(action.payload)?.actionPointCost ?? 1;
  }
  if (action.type === 'MOVE') {
    return toMoveCandidatePayload(action.payload)?.actionPointCost ?? 0;
  }
  if (action.type === 'USE_ABILITY') {
    return toUseAbilityCandidatePayload(action.payload)?.actionPointCost ?? 0;
  }
  if (action.type === 'USE_ITEM') {
    return toUseItemCandidatePayload(action.payload)?.actionPointCost ?? 0;
  }
  return 0;
}

function getCooldownCost(action: Action): number {
  if (action.type === 'USE_ABILITY') {
    return toUseAbilityCandidatePayload(action.payload)?.cooldown ?? 0;
  }
  if (action.type === 'USE_ITEM') {
    return toUseItemCandidatePayload(action.payload)?.cooldown ?? 0;
  }
  return 0;
}

function getCooldownKey(action: Action): string | undefined {
  if (action.type === 'USE_ABILITY') {
    return toUseAbilityCandidatePayload(action.payload)?.abilityId;
  }
  if (action.type === 'USE_ITEM') {
    return toUseItemCandidatePayload(action.payload)?.itemId;
  }
  return undefined;
}
