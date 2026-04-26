import type { Action } from '../../state/GameState';
import type {
  ApplyStatusCandidatePayload,
  AttackCandidatePayload,
  EndCommandCandidatePayload,
  MoveCandidatePayload,
  PassCandidatePayload,
  UseAbilityCandidatePayload,
  UseItemCandidatePayload,
} from './payloadSchemaValidationStage';
import {
  toApplyStatusCandidatePayload,
  toAttackCandidatePayload,
  toEndCommandCandidatePayload,
  toMoveCandidatePayload,
  toPassCandidatePayload,
  toUseAbilityCandidatePayload,
  toUseItemCandidatePayload,
} from './payloadSchemaValidationStage';

export function matchesAttackLegalAction(action: Action, legalActions: Action[], payload: AttackCandidatePayload): boolean {
  return legalActions.some((candidate) => {
    if (candidate.type !== 'ATTACK' || candidate.actorId !== action.actorId || candidate.id !== action.id) {
      return false;
    }
    const candidatePayload = toAttackCandidatePayload(candidate.payload);
    return Boolean(candidatePayload && attackPayloadEquals(candidatePayload, payload));
  });
}

export function matchesEndCommandLegalAction(action: Action, legalActions: Action[], payload: EndCommandCandidatePayload): boolean {
  return legalActions.some(
    (candidate) =>
      candidate.id === action.id &&
      candidate.actorId === action.actorId &&
      candidate.type === 'END_COMMAND' &&
      endCommandPayloadEquals(candidate.payload, payload),
  );
}

export function matchesPassLegalAction(action: Action, legalActions: Action[], payload: PassCandidatePayload): boolean {
  return legalActions.some(
    (candidate) =>
      candidate.id === action.id && candidate.actorId === action.actorId && candidate.type === 'PASS' && passPayloadEquals(candidate.payload, payload),
  );
}

export function matchesMoveLegalAction(action: Action, legalActions: Action[], payload: MoveCandidatePayload): boolean {
  return legalActions.some(
    (candidate) =>
      candidate.id === action.id && candidate.actorId === action.actorId && candidate.type === 'MOVE' && movePayloadEquals(candidate.payload, payload),
  );
}

export function matchesUseAbilityLegalAction(action: Action, legalActions: Action[], payload: UseAbilityCandidatePayload): boolean {
  return legalActions.some(
    (candidate) =>
      candidate.id === action.id &&
      candidate.actorId === action.actorId &&
      candidate.type === 'USE_ABILITY' &&
      useAbilityPayloadEquals(candidate.payload, payload),
  );
}

export function matchesUseItemLegalAction(action: Action, legalActions: Action[], payload: UseItemCandidatePayload): boolean {
  return legalActions.some(
    (candidate) =>
      candidate.id === action.id &&
      candidate.actorId === action.actorId &&
      candidate.type === 'USE_ITEM' &&
      useItemPayloadEquals(candidate.payload, payload),
  );
}

export function matchesApplyStatusLegalAction(action: Action, legalActions: Action[], payload: ApplyStatusCandidatePayload): boolean {
  return legalActions.some(
    (candidate) =>
      candidate.id === action.id &&
      candidate.actorId === action.actorId &&
      candidate.type === 'APPLY_STATUS' &&
      applyStatusPayloadEquals(candidate.payload, payload),
  );
}

function attackPayloadEquals(left: AttackCandidatePayload, right: AttackCandidatePayload): boolean {
  return left.sourceUnitId === right.sourceUnitId && left.targetId === right.targetId && left.amount === right.amount && left.abilityId === right.abilityId && left.actionPointCost === right.actionPointCost;
}

function endCommandPayloadEquals(payload: Action['payload'], candidate: EndCommandCandidatePayload): boolean {
  const normalized = toEndCommandCandidatePayload(payload);
  return Boolean(normalized && normalized.reason === candidate.reason);
}

function passPayloadEquals(payload: Action['payload'], candidate: PassCandidatePayload): boolean {
  const normalized = toPassCandidatePayload(payload);
  return Boolean(normalized && normalized.phase === candidate.phase);
}

function movePayloadEquals(payload: Action['payload'], candidate: MoveCandidatePayload): boolean {
  const normalized = toMoveCandidatePayload(payload);
  return Boolean(
    normalized &&
      normalized.unitId === candidate.unitId &&
      normalized.to.x === candidate.to.x &&
      normalized.to.y === candidate.to.y &&
      normalized.actionPointCost === candidate.actionPointCost,
  );
}

function useAbilityPayloadEquals(payload: Action['payload'], candidate: UseAbilityCandidatePayload): boolean {
  const normalized = toUseAbilityCandidatePayload(payload);
  return Boolean(
    normalized &&
      normalized.unitId === candidate.unitId &&
      normalized.abilityId === candidate.abilityId &&
      normalized.targetId === candidate.targetId &&
      normalized.actionPointCost === candidate.actionPointCost &&
      normalized.cooldown === candidate.cooldown,
  );
}

function useItemPayloadEquals(payload: Action['payload'], candidate: UseItemCandidatePayload): boolean {
  const normalized = toUseItemCandidatePayload(payload);
  return Boolean(
    normalized &&
      normalized.unitId === candidate.unitId &&
      normalized.itemId === candidate.itemId &&
      normalized.targetId === candidate.targetId &&
      normalized.actionPointCost === candidate.actionPointCost &&
      normalized.cooldown === candidate.cooldown,
  );
}

function applyStatusPayloadEquals(payload: Action['payload'], candidate: ApplyStatusCandidatePayload): boolean {
  const normalized = toApplyStatusCandidatePayload(payload);
  return Boolean(
    normalized &&
      normalized.sourceUnitId === candidate.sourceUnitId &&
      normalized.targetId === candidate.targetId &&
      normalized.statusId === candidate.statusId &&
      normalized.duration === candidate.duration,
  );
}
