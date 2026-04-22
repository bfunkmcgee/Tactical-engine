import {
  appendEvents,
  reduceEvents,
  type Action,
  type GameEvent,
  type GameState,
  type StateTransitionResult,
  type UnitState,
} from '../state/GameState';

interface ActionValidationResult {
  readonly isValid: boolean;
  readonly reason?: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

interface AttackCandidatePayload {
  readonly targetId: string;
  readonly amount: number;
}

interface EndCommandCandidatePayload {
  readonly reason: 'manual';
}

interface PassCandidatePayload {
  readonly phase: GameState['phase'];
}

const ATTACK_PAYLOAD_KEYS: readonly string[] = ['amount', 'targetId'];
const END_COMMAND_PAYLOAD_KEYS: readonly string[] = ['reason'];
const PASS_PAYLOAD_KEYS: readonly string[] = ['phase'];

export class ActionResolver {
  public applyAction(state: GameState, action: Action): StateTransitionResult {
    const validation = this.validateActionWithReason(state, action);
    if (!validation.isValid) {
      return { state, events: [] };
    }

    const events = this.resolveActionEffects(state, action);
    const nextState = appendEvents(reduceEvents(state, events), events);
    return {
      state: nextState,
      events,
    };
  }

  public validateAction(state: GameState, action: Action): boolean {
    return this.validateActionWithReason(state, action).isValid;
  }

  public validateActionWithReason(state: GameState, action: Action): ActionValidationResult {
    const legalActions = this.getLegalActions(state, action.actorId);
    if (legalActions.length === 0) {
      return {
        isValid: false,
        reason: 'NO_LEGAL_ACTIONS_FOR_ACTOR',
        details: { actorId: action.actorId, activeActorId: state.activeActorId, phase: state.phase },
      };
    }

    switch (action.type) {
      case 'ATTACK':
        return this.validateAttackAction(state, action, legalActions.filter((candidate) => candidate.type === 'ATTACK'));
      case 'END_COMMAND':
        return this.validateEndCommandAction(action, legalActions.filter((candidate) => candidate.type === 'END_COMMAND'));
      case 'PASS':
        return this.validatePassAction(action, legalActions.filter((candidate) => candidate.type === 'PASS'));
      default:
        return {
          isValid: false,
          reason: 'UNKNOWN_ACTION_TYPE',
          details: { type: String((action as { type?: unknown }).type ?? '') },
        };
    }
  }

  public resolveActionEffects(state: GameState, action: Action): GameEvent[] {
    if (!this.validateAction(state, action)) {
      return [];
    }

    const events: GameEvent[] = [
      {
        kind: 'ACTION_APPLIED',
        action,
        turn: state.turn,
        round: state.round,
      },
    ];


    return events;
  }

  public getLegalActions(state: GameState, actorId: string): Action[] {
    if (state.activeActorId !== actorId) {
      return [];
    }

    switch (state.phase) {
      case 'COMMAND': {
        const attackActions: Action[] = Object.values(state.units)
          .filter((unit) => unit.ownerId !== actorId && unit.hp > 0)
          .sort((left, right) => left.id.localeCompare(right.id))
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
            payload: { reason: 'manual' },
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
            payload: { phase: state.phase },
          },
        ];

      default:
        return [];
    }
  }

  private validateAttackAction(state: GameState, action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return {
        isValid: false,
        reason: 'ATTACK_NOT_LEGAL_IN_PHASE',
        details: { phase: state.phase },
      };
    }

    const payload = this.toRecord(action.payload);
    if (!payload) {
      return {
        isValid: false,
        reason: 'INVALID_ATTACK_PAYLOAD_TYPE',
        details: { expected: 'object' },
      };
    }

    const keyValidation = this.validateAllowedKeys(payload, ATTACK_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const targetId = payload.targetId;
    const amountValue = payload.amount;

    if (typeof targetId !== 'string' || targetId.length === 0) {
      return {
        isValid: false,
        reason: 'ATTACK_TARGET_REQUIRED',
      };
    }

    if (amountValue !== undefined && (typeof amountValue !== 'number' || !Number.isInteger(amountValue) || amountValue <= 0)) {
      return {
        isValid: false,
        reason: 'ATTACK_AMOUNT_INVALID',
        details: { amount: String(amountValue) },
      };
    }

    const normalizedAmount = amountValue === undefined ? 1 : (amountValue as number);
    const canonicalPayload: AttackCandidatePayload = {
      targetId,
      amount: normalizedAmount,
    };

    const matchingCandidate = legalActions.find((candidate) => {
      if (candidate.type !== 'ATTACK' || candidate.actorId !== action.actorId || candidate.id !== action.id) {
        return false;
      }
      const candidatePayload = this.toAttackCandidatePayload(candidate.payload);
      return Boolean(candidatePayload && this.attackPayloadEquals(candidatePayload, canonicalPayload));
    });

    if (!matchingCandidate) {
      return {
        isValid: false,
        reason: 'ATTACK_NOT_FOUND_IN_LEGAL_ACTIONS',
        details: { actorId: action.actorId, targetId },
      };
    }

    const target = state.units[targetId];
    if (!target || target.hp <= 0) {
      return {
        isValid: false,
        reason: 'ATTACK_TARGET_NOT_ALIVE',
        details: { targetId },
      };
    }

    const actorUnit = this.findActorUnit(state, action.actorId);
    if (actorUnit && this.isOutOfRange(actorUnit, target, matchingCandidate)) {
      return {
        isValid: false,
        reason: 'ATTACK_TARGET_OUT_OF_RANGE',
        details: { actorId: action.actorId, targetId },
      };
    }

    return { isValid: true };
  }

  private validateEndCommandAction(action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return {
        isValid: false,
        reason: 'END_COMMAND_NOT_LEGAL_IN_PHASE',
      };
    }

    const payload = this.toRecord(action.payload);
    if (!payload) {
      return {
        isValid: false,
        reason: 'INVALID_END_COMMAND_PAYLOAD_TYPE',
      };
    }

    const keyValidation = this.validateAllowedKeys(payload, END_COMMAND_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const reason = payload.reason;
    if (reason !== 'manual') {
      return {
        isValid: false,
        reason: 'END_COMMAND_REASON_INVALID',
        details: { reason: String(reason) },
      };
    }

    const hasMatch = legalActions.some(
      (candidate) =>
        candidate.id === action.id &&
        candidate.actorId === action.actorId &&
        candidate.type === 'END_COMMAND' &&
        this.endCommandPayloadEquals(candidate.payload, { reason: 'manual' }),
    );

    return hasMatch
      ? { isValid: true }
      : {
          isValid: false,
          reason: 'END_COMMAND_NOT_FOUND_IN_LEGAL_ACTIONS',
          details: { actorId: action.actorId },
        };
  }

  private validatePassAction(action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return {
        isValid: false,
        reason: 'PASS_NOT_LEGAL_IN_PHASE',
      };
    }

    const payload = this.toRecord(action.payload);
    if (!payload) {
      return {
        isValid: false,
        reason: 'INVALID_PASS_PAYLOAD_TYPE',
      };
    }

    const keyValidation = this.validateAllowedKeys(payload, PASS_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const phase = payload.phase;
    if (typeof phase !== 'string') {
      return {
        isValid: false,
        reason: 'PASS_PHASE_REQUIRED',
      };
    }

    const hasMatch = legalActions.some(
      (candidate) =>
        candidate.id === action.id &&
        candidate.actorId === action.actorId &&
        candidate.type === 'PASS' &&
        this.passPayloadEquals(candidate.payload, { phase: phase as GameState['phase'] }),
    );

    return hasMatch
      ? { isValid: true }
      : {
          isValid: false,
          reason: 'PASS_NOT_FOUND_IN_LEGAL_ACTIONS',
          details: { actorId: action.actorId, phase },
        };
  }

  private validateAllowedKeys(
    payload: Record<string, unknown>,
    allowedKeys: readonly string[],
  ): ActionValidationResult {
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

  private attackPayloadEquals(left: AttackCandidatePayload, right: AttackCandidatePayload): boolean {
    return left.targetId === right.targetId && left.amount === right.amount;
  }

  private endCommandPayloadEquals(payload: Action['payload'], candidate: EndCommandCandidatePayload): boolean {
    const normalized = this.toEndCommandCandidatePayload(payload);
    return Boolean(normalized && normalized.reason === candidate.reason);
  }

  private passPayloadEquals(payload: Action['payload'], candidate: PassCandidatePayload): boolean {
    const normalized = this.toPassCandidatePayload(payload);
    return Boolean(normalized && normalized.phase === candidate.phase);
  }

  private toAttackCandidatePayload(payload: Action['payload']): AttackCandidatePayload | undefined {
    const record = this.toRecord(payload);
    if (!record) {
      return undefined;
    }

    if (typeof record.targetId !== 'string') {
      return undefined;
    }

    const amountValue = record.amount;
    if (
      amountValue !== undefined &&
      (typeof amountValue !== 'number' || !Number.isInteger(amountValue) || amountValue <= 0)
    ) {
      return undefined;
    }

    const normalizedAmount = amountValue === undefined ? 1 : (amountValue as number);
    return {
      targetId: record.targetId,
      amount: normalizedAmount,
    };
  }

  private toEndCommandCandidatePayload(payload: Action['payload']): EndCommandCandidatePayload | undefined {
    const record = this.toRecord(payload);
    if (!record || record.reason !== 'manual') {
      return undefined;
    }

    return { reason: 'manual' };
  }

  private toPassCandidatePayload(payload: Action['payload']): PassCandidatePayload | undefined {
    const record = this.toRecord(payload);
    if (!record || typeof record.phase !== 'string') {
      return undefined;
    }

    return { phase: record.phase as GameState['phase'] };
  }

  private toRecord(payload: Action['payload']): Record<string, unknown> | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    return payload as Record<string, unknown>;
  }

  private findActorUnit(state: GameState, actorId: string): UnitState | undefined {
    return Object.values(state.units).find((unit) => unit.ownerId === actorId && unit.hp > 0);
  }

  private isOutOfRange(actorUnit: UnitState, targetUnit: UnitState, action: Action): boolean {
    const payload = this.toRecord(action.payload);
    if (!payload) {
      return false;
    }

    const configuredRange = payload.range;
    if (typeof configuredRange !== 'number' || configuredRange < 0) {
      return false;
    }

    const actorPosition = (actorUnit as UnitState & { position?: { x: number; y: number } }).position;
    const targetPosition = (targetUnit as UnitState & { position?: { x: number; y: number } }).position;

    if (!actorPosition || !targetPosition) {
      return false;
    }

    const distance =
      Math.abs(actorPosition.x - targetPosition.x) + Math.abs(actorPosition.y - targetPosition.y);

    return distance > configuredRange;
  }
}
