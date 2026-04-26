import type { Action, GameState } from '../../state/GameState';
import type { ActionValidationResult } from '../ActionResolver';

export interface AttackCandidatePayload {
  readonly sourceUnitId?: string;
  readonly targetId: string;
  readonly amount: number;
  readonly abilityId?: string;
  readonly actionPointCost?: number;
}

export interface EndCommandCandidatePayload {
  readonly reason: 'manual';
}

export interface PassCandidatePayload {
  readonly phase: GameState['phase'];
}

export interface MoveCandidatePayload {
  readonly unitId: string;
  readonly to: { x: number; y: number };
  readonly actionPointCost?: number;
}

export interface UseAbilityCandidatePayload {
  readonly unitId: string;
  readonly abilityId: string;
  readonly targetId?: string;
  readonly actionPointCost?: number;
  readonly cooldown?: number;
}

export interface UseItemCandidatePayload {
  readonly unitId: string;
  readonly itemId: string;
  readonly targetId?: string;
  readonly actionPointCost?: number;
  readonly cooldown?: number;
}

export interface ApplyStatusCandidatePayload {
  readonly sourceUnitId?: string;
  readonly targetId: string;
  readonly statusId: string;
  readonly duration: number;
}

interface GridTargetPayload {
  readonly x: number;
  readonly y: number;
}

export const ATTACK_PAYLOAD_KEYS: readonly string[] = ['sourceUnitId', 'amount', 'targetId', 'abilityId', 'actionPointCost'];
export const END_COMMAND_PAYLOAD_KEYS: readonly string[] = ['reason'];
export const PASS_PAYLOAD_KEYS: readonly string[] = ['phase'];
export const MOVE_PAYLOAD_KEYS: readonly string[] = ['unitId', 'to', 'actionPointCost'];
export const USE_ABILITY_PAYLOAD_KEYS: readonly string[] = ['unitId', 'abilityId', 'targetId', 'actionPointCost', 'cooldown'];
export const USE_ITEM_PAYLOAD_KEYS: readonly string[] = ['unitId', 'itemId', 'targetId', 'actionPointCost', 'cooldown'];
export const APPLY_STATUS_PAYLOAD_KEYS: readonly string[] = ['sourceUnitId', 'targetId', 'statusId', 'duration'];

export function validateAllowedKeys(payload: Record<string, unknown>, allowedKeys: readonly string[]): ActionValidationResult {
  const extraneous = Object.keys(payload).filter((key) => allowedKeys.indexOf(key) === -1);
  if (extraneous.length > 0) {
    return {
      isValid: false,
      reason: 'PAYLOAD_KEYS_NOT_ALLOWED',
      details: { keys: extraneous.join(',') },
    };
  }

  return { isValid: true };
}

export function toRecord(payload: Action['payload']): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  return payload as Record<string, unknown>;
}

function toNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return undefined;
  }
  return value;
}

function toGridTarget(value: unknown): GridTargetPayload | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const { x, y } = value as Record<string, unknown>;
  if (typeof x !== 'number' || !Number.isInteger(x) || typeof y !== 'number' || !Number.isInteger(y)) {
    return undefined;
  }

  return { x, y };
}

export function toAttackCandidatePayload(payload: Action['payload']): AttackCandidatePayload | undefined {
  const record = toRecord(payload);
  if (!record || typeof record.targetId !== 'string') {
    return undefined;
  }

  const amountValue = record.amount;
  if (amountValue !== undefined && (typeof amountValue !== 'number' || !Number.isInteger(amountValue) || amountValue <= 0)) {
    return undefined;
  }

  const normalizedAmount = amountValue === undefined ? 1 : amountValue;
  const actionPointCost = toNonNegativeInteger(record.actionPointCost);
  if (record.actionPointCost !== undefined && actionPointCost === undefined) {
    return undefined;
  }

  return {
    sourceUnitId: typeof record.sourceUnitId === 'string' ? record.sourceUnitId : undefined,
    targetId: record.targetId,
    amount: normalizedAmount,
    abilityId: typeof record.abilityId === 'string' ? record.abilityId : undefined,
    actionPointCost,
  };
}

export function toEndCommandCandidatePayload(payload: Action['payload']): EndCommandCandidatePayload | undefined {
  const record = toRecord(payload);
  if (!record || record.reason !== 'manual') {
    return undefined;
  }

  return { reason: 'manual' };
}

export function toPassCandidatePayload(payload: Action['payload']): PassCandidatePayload | undefined {
  const record = toRecord(payload);
  if (!record || typeof record.phase !== 'string') {
    return undefined;
  }

  return { phase: record.phase as GameState['phase'] };
}

export function toMoveCandidatePayload(payload: Action['payload']): MoveCandidatePayload | undefined {
  const record = toRecord(payload);
  if (!record || typeof record.unitId !== 'string') {
    return undefined;
  }

  const to = toGridTarget(record.to);
  if (!to) {
    return undefined;
  }

  const actionPointCost = toNonNegativeInteger(record.actionPointCost);
  if (record.actionPointCost !== undefined && actionPointCost === undefined) {
    return undefined;
  }

  return { unitId: record.unitId, to: { x: to.x, y: to.y }, actionPointCost };
}

export function toUseAbilityCandidatePayload(payload: Action['payload']): UseAbilityCandidatePayload | undefined {
  const record = toRecord(payload);
  if (!record || typeof record.unitId !== 'string' || typeof record.abilityId !== 'string') {
    return undefined;
  }

  if (record.targetId !== undefined && typeof record.targetId !== 'string') {
    return undefined;
  }

  const actionPointCost = toNonNegativeInteger(record.actionPointCost);
  if (record.actionPointCost !== undefined && actionPointCost === undefined) {
    return undefined;
  }

  const cooldown = toNonNegativeInteger(record.cooldown);
  if (record.cooldown !== undefined && cooldown === undefined) {
    return undefined;
  }

  return {
    unitId: record.unitId,
    abilityId: record.abilityId,
    targetId: typeof record.targetId === 'string' ? record.targetId : undefined,
    actionPointCost,
    cooldown,
  };
}

export function toUseItemCandidatePayload(payload: Action['payload']): UseItemCandidatePayload | undefined {
  const record = toRecord(payload);
  if (!record || typeof record.unitId !== 'string' || typeof record.itemId !== 'string') {
    return undefined;
  }

  if (record.targetId !== undefined && typeof record.targetId !== 'string') {
    return undefined;
  }

  const actionPointCost = toNonNegativeInteger(record.actionPointCost);
  if (record.actionPointCost !== undefined && actionPointCost === undefined) {
    return undefined;
  }

  const cooldown = toNonNegativeInteger(record.cooldown);
  if (record.cooldown !== undefined && cooldown === undefined) {
    return undefined;
  }

  return {
    unitId: record.unitId,
    itemId: record.itemId,
    targetId: typeof record.targetId === 'string' ? record.targetId : undefined,
    actionPointCost,
    cooldown,
  };
}

export function toApplyStatusCandidatePayload(payload: Action['payload']): ApplyStatusCandidatePayload | undefined {
  const record = toRecord(payload);
  if (!record || typeof record.targetId !== 'string' || typeof record.statusId !== 'string') {
    return undefined;
  }

  if (record.sourceUnitId !== undefined && typeof record.sourceUnitId !== 'string') {
    return undefined;
  }

  const duration = record.duration === undefined ? 1 : toNonNegativeInteger(record.duration);
  if (duration === undefined || duration <= 0) {
    return undefined;
  }

  return {
    sourceUnitId: typeof record.sourceUnitId === 'string' ? record.sourceUnitId : undefined,
    targetId: record.targetId,
    statusId: record.statusId,
    duration,
  };
}
