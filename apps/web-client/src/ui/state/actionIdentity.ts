import type {
  Action,
  ApplyStatusActionPayload,
  AttackActionPayload,
  EndCommandActionPayload,
  MoveActionPayload,
  PassActionPayload,
  UseAbilityActionPayload,
  UseItemActionPayload,
} from 'engine-core';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toEndCommandPayload(payload: Action['payload']): EndCommandActionPayload | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  return typeof payload.reason === 'string' || payload.reason === undefined
    ? ({ reason: payload.reason } as EndCommandActionPayload)
    : undefined;
}

function toPassPayload(payload: Action['payload']): PassActionPayload | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  return typeof payload.phase === 'string' || payload.phase === undefined
    ? ({ phase: payload.phase } as PassActionPayload)
    : undefined;
}

function toMovePayload(payload: Action['payload']): MoveActionPayload | undefined {
  if (!isRecord(payload) || !isRecord(payload.to)) {
    return undefined;
  }

  if (typeof payload.unitId !== 'string') {
    return undefined;
  }

  if (typeof payload.to.x !== 'number' || typeof payload.to.y !== 'number') {
    return undefined;
  }

  if (payload.actionPointCost !== undefined && typeof payload.actionPointCost !== 'number') {
    return undefined;
  }

  return {
    unitId: payload.unitId,
    to: { x: payload.to.x, y: payload.to.y },
    actionPointCost: payload.actionPointCost as number | undefined,
  };
}

function toAttackPayload(payload: Action['payload']): AttackActionPayload | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  if (typeof payload.targetId !== 'string') {
    return undefined;
  }

  if (payload.amount !== undefined && typeof payload.amount !== 'number') {
    return undefined;
  }

  if (payload.abilityId !== undefined && typeof payload.abilityId !== 'string') {
    return undefined;
  }

  if (payload.actionPointCost !== undefined && typeof payload.actionPointCost !== 'number') {
    return undefined;
  }

  if (payload.sourceUnitId !== undefined && typeof payload.sourceUnitId !== 'string') {
    return undefined;
  }

  return {
    sourceUnitId: payload.sourceUnitId as string | undefined,
    targetId: payload.targetId,
    amount: payload.amount as number | undefined,
    abilityId: payload.abilityId as string | undefined,
    actionPointCost: payload.actionPointCost as number | undefined,
  };
}

function toUseAbilityPayload(payload: Action['payload']): UseAbilityActionPayload | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  if (typeof payload.unitId !== 'string' || typeof payload.abilityId !== 'string') {
    return undefined;
  }

  if (payload.targetId !== undefined && typeof payload.targetId !== 'string') {
    return undefined;
  }

  if (payload.actionPointCost !== undefined && typeof payload.actionPointCost !== 'number') {
    return undefined;
  }

  if (payload.cooldown !== undefined && typeof payload.cooldown !== 'number') {
    return undefined;
  }

  return {
    unitId: payload.unitId,
    abilityId: payload.abilityId,
    targetId: payload.targetId as string | undefined,
    actionPointCost: payload.actionPointCost as number | undefined,
    cooldown: payload.cooldown as number | undefined,
  };
}

function toUseItemPayload(payload: Action['payload']): UseItemActionPayload | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  if (typeof payload.unitId !== 'string' || typeof payload.itemId !== 'string') {
    return undefined;
  }

  if (payload.targetId !== undefined && typeof payload.targetId !== 'string') {
    return undefined;
  }

  if (payload.actionPointCost !== undefined && typeof payload.actionPointCost !== 'number') {
    return undefined;
  }

  if (payload.cooldown !== undefined && typeof payload.cooldown !== 'number') {
    return undefined;
  }

  return {
    unitId: payload.unitId,
    itemId: payload.itemId,
    targetId: payload.targetId as string | undefined,
    actionPointCost: payload.actionPointCost as number | undefined,
    cooldown: payload.cooldown as number | undefined,
  };
}

function toApplyStatusPayload(payload: Action['payload']): ApplyStatusActionPayload | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  if (payload.sourceUnitId !== undefined && typeof payload.sourceUnitId !== 'string') {
    return undefined;
  }

  if (typeof payload.targetId !== 'string' || typeof payload.statusId !== 'string') {
    return undefined;
  }

  if (payload.duration !== undefined && typeof payload.duration !== 'number') {
    return undefined;
  }

  return {
    sourceUnitId: payload.sourceUnitId as string | undefined,
    targetId: payload.targetId,
    statusId: payload.statusId,
    duration: payload.duration as number | undefined,
  };
}

function payloadsMatch(a: Action, b: Action): boolean {
  switch (a.type) {
    case 'END_COMMAND': {
      const left = toEndCommandPayload(a.payload);
      const right = toEndCommandPayload(b.payload);
      return Boolean(left && right && left.reason === right.reason);
    }
    case 'PASS': {
      const left = toPassPayload(a.payload);
      const right = toPassPayload(b.payload);
      return Boolean(left && right && left.phase === right.phase);
    }
    case 'MOVE': {
      const left = toMovePayload(a.payload);
      const right = toMovePayload(b.payload);
      return Boolean(
        left &&
          right &&
          left.unitId === right.unitId &&
          left.to.x === right.to.x &&
          left.to.y === right.to.y &&
          left.actionPointCost === right.actionPointCost,
      );
    }
    case 'ATTACK': {
      const left = toAttackPayload(a.payload);
      const right = toAttackPayload(b.payload);
      return Boolean(
        left &&
          right &&
          left.sourceUnitId === right.sourceUnitId &&
          left.targetId === right.targetId &&
          left.amount === right.amount &&
          left.abilityId === right.abilityId &&
          left.actionPointCost === right.actionPointCost,
      );
    }
    case 'USE_ABILITY': {
      const left = toUseAbilityPayload(a.payload);
      const right = toUseAbilityPayload(b.payload);
      return Boolean(
        left &&
          right &&
          left.unitId === right.unitId &&
          left.abilityId === right.abilityId &&
          left.targetId === right.targetId &&
          left.actionPointCost === right.actionPointCost &&
          left.cooldown === right.cooldown,
      );
    }
    case 'USE_ITEM': {
      const left = toUseItemPayload(a.payload);
      const right = toUseItemPayload(b.payload);
      return Boolean(
        left &&
          right &&
          left.unitId === right.unitId &&
          left.itemId === right.itemId &&
          left.targetId === right.targetId &&
          left.actionPointCost === right.actionPointCost &&
          left.cooldown === right.cooldown,
      );
    }
    case 'APPLY_STATUS': {
      const left = toApplyStatusPayload(a.payload);
      const right = toApplyStatusPayload(b.payload);
      return Boolean(
        left &&
          right &&
          left.sourceUnitId === right.sourceUnitId &&
          left.targetId === right.targetId &&
          left.statusId === right.statusId &&
          left.duration === right.duration,
      );
    }
    default:
      return false;
  }
}

export function isSameAction(a: Action, b: Action): boolean {
  if (a.id === b.id) {
    return true;
  }

  if (a.actorId !== b.actorId || a.type !== b.type) {
    return false;
  }

  return payloadsMatch(a, b);
}
