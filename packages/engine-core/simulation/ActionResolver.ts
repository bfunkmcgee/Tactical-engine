import {
  appendEvents,
  getActiveActorId,
  reduceEvents,
  type Action,
  type GameEvent,
  type GameState,
  type StateTransitionResult,
  type UnitState,
} from '../state/GameState';
import { LineOfSight, SquareGridAdapter, Targeting } from 'engine-spatial';
import { DemoLegalActionGenerator, type LegalActionGenerator } from './LegalActionGenerator';
import type { RuleActionAdapter } from './RuleAdapter';

export interface ActionValidationResult {
  readonly isValid: boolean;
  readonly reason?: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

interface AttackCandidatePayload {
  readonly sourceUnitId?: string;
  readonly targetId: string;
  readonly amount: number;
  readonly abilityId?: string;
  readonly actionPointCost?: number;
}

interface EndCommandCandidatePayload {
  readonly reason: 'manual';
}

interface PassCandidatePayload {
  readonly phase: GameState['phase'];
}

interface MoveCandidatePayload {
  readonly unitId: string;
  readonly to: { x: number; y: number };
  readonly actionPointCost?: number;
}

interface UseAbilityCandidatePayload {
  readonly unitId: string;
  readonly abilityId: string;
  readonly targetId?: string;
  readonly actionPointCost?: number;
  readonly cooldown?: number;
}

interface UseItemCandidatePayload {
  readonly unitId: string;
  readonly itemId: string;
  readonly targetId?: string;
  readonly actionPointCost?: number;
  readonly cooldown?: number;
}

interface ApplyStatusCandidatePayload {
  readonly sourceUnitId?: string;
  readonly targetId: string;
  readonly statusId: string;
  readonly duration: number;
}

interface ActionResolutionContext {
  readonly state: GameState;
  readonly action: Action;
  readonly events: GameEvent[];
  actorUnit?: UnitState;
  targetUnit?: UnitState;
}

interface GridTargetPayload {
  readonly x: number;
  readonly y: number;
}

const ATTACK_PAYLOAD_KEYS: readonly string[] = ['sourceUnitId', 'amount', 'targetId', 'abilityId', 'actionPointCost'];
const END_COMMAND_PAYLOAD_KEYS: readonly string[] = ['reason'];
const PASS_PAYLOAD_KEYS: readonly string[] = ['phase'];
const MOVE_PAYLOAD_KEYS: readonly string[] = ['unitId', 'to', 'actionPointCost'];
const USE_ABILITY_PAYLOAD_KEYS: readonly string[] = ['unitId', 'abilityId', 'targetId', 'actionPointCost', 'cooldown'];
const USE_ITEM_PAYLOAD_KEYS: readonly string[] = ['unitId', 'itemId', 'targetId', 'actionPointCost', 'cooldown'];
const APPLY_STATUS_PAYLOAD_KEYS: readonly string[] = ['sourceUnitId', 'targetId', 'statusId', 'duration'];
const DEFAULT_ATTACK_RANGE = 3;

export class ActionResolver {
  private readonly grid = new SquareGridAdapter();
  private readonly targeting = new Targeting(this.grid);
  private readonly legalActionGenerator: LegalActionGenerator;
  private readonly ruleAdapter?: RuleActionAdapter;

  constructor(legalActionGenerator: LegalActionGenerator = new DemoLegalActionGenerator(), ruleAdapter?: RuleActionAdapter) {
    this.legalActionGenerator = legalActionGenerator;
    this.ruleAdapter = ruleAdapter;
  }

  public applyAction(state: GameState, action: Action): StateTransitionResult {
    const validation = this.validateActionWithReason(state, action);
    if (!validation.isValid) {
      const rejectionEvent: GameEvent = {
        kind: 'ACTION_REJECTED',
        actorId: action.actorId,
        actionType: action.type,
        reason: validation.reason ?? 'ACTION_INVALID',
        details: validation.details,
        turn: state.turn,
        round: state.round,
      };
      return {
        state: appendEvents(reduceEvents(state, [rejectionEvent]), [rejectionEvent]),
        events: [rejectionEvent],
      };
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
        details: { actorId: action.actorId, activeActorId: getActiveActorId(state), phase: state.phase },
      };
    }

    switch (action.type) {
      case 'ATTACK':
        return this.validateAttackAction(state, action, legalActions.filter((candidate) => candidate.type === 'ATTACK'));
      case 'END_COMMAND':
        return this.validateEndCommandAction(action, legalActions.filter((candidate) => candidate.type === 'END_COMMAND'));
      case 'MOVE':
        return this.validateMoveAction(state, action, legalActions.filter((candidate) => candidate.type === 'MOVE'));
      case 'USE_ABILITY':
        return this.validateUseAbilityAction(state, action, legalActions.filter((candidate) => candidate.type === 'USE_ABILITY'));
      case 'USE_ITEM':
        return this.validateUseItemAction(action, legalActions.filter((candidate) => candidate.type === 'USE_ITEM'));
      case 'APPLY_STATUS':
        return this.validateApplyStatusAction(state, action, legalActions.filter((candidate) => candidate.type === 'APPLY_STATUS'));
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
    const context = this.stageIntentValidation(state, action);
    if (!context) {
      return [];
    }

    this.stageTargetResolution(context);
    this.stageResourcePayment(context);
    this.stageEffectApplication(context);
    this.stageEventEmission(context);
    this.stagePostResolutionCleanup(context);
    return context.events;
  }

  public getLegalActions(state: GameState, actorId: string): Action[] {
    return this.legalActionGenerator.getLegalActions(state, actorId);
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
      sourceUnitId: typeof payload.sourceUnitId === 'string' ? payload.sourceUnitId : undefined,
      targetId,
      amount: normalizedAmount,
      abilityId: typeof payload.abilityId === 'string' ? payload.abilityId : undefined,
      actionPointCost:
        typeof payload.actionPointCost === 'number' && Number.isInteger(payload.actionPointCost) && payload.actionPointCost >= 0
          ? payload.actionPointCost
          : undefined,
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
    if (!actorUnit) {
      return {
        isValid: false,
        reason: 'ATTACK_SOURCE_NOT_FOUND',
        details: { actorId: action.actorId },
      };
    }

    if (!this.hasSpatialPosition(actorUnit)) {
      return {
        isValid: false,
        reason: 'MISSING_SOURCE_POSITION',
        details: { actorId: action.actorId, sourceUnitId: actorUnit.id, actionType: action.type },
      };
    }

    if (!this.hasSpatialPosition(target)) {
      return {
        isValid: false,
        reason: 'MISSING_TARGET_POSITION',
        details: { actorId: action.actorId, targetId, actionType: action.type },
      };
    }

    if (this.isOutOfRange(actorUnit, target, matchingCandidate)) {
      return {
        isValid: false,
        reason: 'ATTACK_TARGET_OUT_OF_RANGE',
        details: { actorId: action.actorId, targetId },
      };
    }

    if (!this.hasLineOfSight(state, actorUnit, target)) {
      return {
        isValid: false,
        reason: 'ATTACK_TARGET_NO_LINE_OF_SIGHT',
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

  private validateMoveAction(state: GameState, action: Action, legalActions: Action[]): ActionValidationResult {
    const payload = this.toRecord(action.payload);
    if (!payload) {
      return { isValid: false, reason: 'INVALID_MOVE_PAYLOAD_TYPE' };
    }

    const keyValidation = this.validateAllowedKeys(payload, MOVE_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const normalized = this.toMoveCandidatePayload(action.payload);
    if (!normalized) {
      if (payload.to === undefined) {
        return { isValid: false, reason: 'MISSING_TARGET_POSITION', details: { actorId: action.actorId, actionType: action.type } };
      }
      return { isValid: false, reason: 'MOVE_PAYLOAD_INVALID' };
    }

    const sourceUnit = state.units[normalized.unitId];
    if (!sourceUnit || !this.hasSpatialPosition(sourceUnit)) {
      return {
        isValid: false,
        reason: 'MISSING_SOURCE_POSITION',
        details: { actorId: action.actorId, sourceUnitId: normalized.unitId, actionType: action.type },
      };
    }
    const sourcePosition = sourceUnit.position;
    if (!sourcePosition) {
      return {
        isValid: false,
        reason: 'MISSING_SOURCE_POSITION',
        details: { actorId: action.actorId, sourceUnitId: normalized.unitId, actionType: action.type },
      };
    }

    if (sourcePosition.x === normalized.to.x && sourcePosition.y === normalized.to.y) {
      return { isValid: false, reason: 'MOVE_DESTINATION_UNCHANGED' };
    }

    const occupiedByAliveUnit = Object.values(state.units).some(
      (candidate) =>
        candidate.id !== sourceUnit.id &&
        candidate.hp > 0 &&
        candidate.position?.x === normalized.to.x &&
        candidate.position?.y === normalized.to.y,
    );
    if (occupiedByAliveUnit) {
      return { isValid: false, reason: 'MOVE_DESTINATION_OCCUPIED' };
    }

    if (legalActions.length === 0) {
      return { isValid: false, reason: 'MOVE_NOT_LEGAL_IN_PHASE' };
    }

    const hasMatch = legalActions.some(
      (candidate) =>
        candidate.id === action.id &&
        candidate.actorId === action.actorId &&
        candidate.type === 'MOVE' &&
        this.movePayloadEquals(candidate.payload, normalized),
    );

    return hasMatch ? { isValid: true } : { isValid: false, reason: 'MOVE_NOT_FOUND_IN_LEGAL_ACTIONS' };
  }

  private validateUseAbilityAction(state: GameState, action: Action, legalActions: Action[]): ActionValidationResult {
    const payload = this.toRecord(action.payload);
    if (!payload) {
      return { isValid: false, reason: 'INVALID_USE_ABILITY_PAYLOAD_TYPE' };
    }

    const keyValidation = this.validateAllowedKeys(payload, USE_ABILITY_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const normalized = this.toUseAbilityCandidatePayload(action.payload);
    if (!normalized) {
      return { isValid: false, reason: 'USE_ABILITY_PAYLOAD_INVALID' };
    }

    const sourceUnit = state.units[normalized.unitId];
    if (!sourceUnit || !this.hasSpatialPosition(sourceUnit)) {
      return {
        isValid: false,
        reason: 'MISSING_SOURCE_POSITION',
        details: { actorId: action.actorId, sourceUnitId: normalized.unitId, actionType: action.type },
      };
    }

    if (normalized.targetId) {
      const targetUnit = state.units[normalized.targetId];
      if (!targetUnit || !this.hasSpatialPosition(targetUnit)) {
        return {
          isValid: false,
          reason: 'MISSING_TARGET_POSITION',
          details: { actorId: action.actorId, targetId: normalized.targetId, actionType: action.type },
        };
      }
    }

    if (legalActions.length === 0) {
      return { isValid: false, reason: 'USE_ABILITY_NOT_LEGAL_IN_PHASE' };
    }

    const hasMatch = legalActions.some(
      (candidate) =>
        candidate.id === action.id &&
        candidate.actorId === action.actorId &&
        candidate.type === 'USE_ABILITY' &&
        this.useAbilityPayloadEquals(candidate.payload, normalized),
    );

    return hasMatch ? { isValid: true } : { isValid: false, reason: 'USE_ABILITY_NOT_FOUND_IN_LEGAL_ACTIONS' };
  }

  private validateUseItemAction(action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return { isValid: false, reason: 'USE_ITEM_NOT_LEGAL_IN_PHASE' };
    }

    const payload = this.toRecord(action.payload);
    if (!payload) {
      return { isValid: false, reason: 'INVALID_USE_ITEM_PAYLOAD_TYPE' };
    }

    const keyValidation = this.validateAllowedKeys(payload, USE_ITEM_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const normalized = this.toUseItemCandidatePayload(action.payload);
    if (!normalized) {
      return { isValid: false, reason: 'USE_ITEM_PAYLOAD_INVALID' };
    }

    const hasMatch = legalActions.some(
      (candidate) =>
        candidate.id === action.id &&
        candidate.actorId === action.actorId &&
        candidate.type === 'USE_ITEM' &&
        this.useItemPayloadEquals(candidate.payload, normalized),
    );

    return hasMatch ? { isValid: true } : { isValid: false, reason: 'USE_ITEM_NOT_FOUND_IN_LEGAL_ACTIONS' };
  }

  private validateApplyStatusAction(state: GameState, action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return { isValid: false, reason: 'APPLY_STATUS_NOT_LEGAL_IN_PHASE' };
    }

    const payload = this.toRecord(action.payload);
    if (!payload) {
      return { isValid: false, reason: 'INVALID_APPLY_STATUS_PAYLOAD_TYPE' };
    }

    const keyValidation = this.validateAllowedKeys(payload, APPLY_STATUS_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const normalized = this.toApplyStatusCandidatePayload(action.payload);
    if (!normalized) {
      return { isValid: false, reason: 'APPLY_STATUS_PAYLOAD_INVALID' };
    }

    const targetUnit = state.units[normalized.targetId];
    if (!targetUnit || targetUnit.hp <= 0) {
      return { isValid: false, reason: 'APPLY_STATUS_TARGET_NOT_ALIVE', details: { targetId: normalized.targetId } };
    }

    const hasMatch = legalActions.some(
      (candidate) =>
        candidate.id === action.id &&
        candidate.actorId === action.actorId &&
        candidate.type === 'APPLY_STATUS' &&
        this.applyStatusPayloadEquals(candidate.payload, normalized),
    );

    return hasMatch ? { isValid: true } : { isValid: false, reason: 'APPLY_STATUS_NOT_FOUND_IN_LEGAL_ACTIONS' };
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
    return left.sourceUnitId === right.sourceUnitId && left.targetId === right.targetId && left.amount === right.amount && left.abilityId === right.abilityId && left.actionPointCost === right.actionPointCost;
  }

  private endCommandPayloadEquals(payload: Action['payload'], candidate: EndCommandCandidatePayload): boolean {
    const normalized = this.toEndCommandCandidatePayload(payload);
    return Boolean(normalized && normalized.reason === candidate.reason);
  }

  private passPayloadEquals(payload: Action['payload'], candidate: PassCandidatePayload): boolean {
    const normalized = this.toPassCandidatePayload(payload);
    return Boolean(normalized && normalized.phase === candidate.phase);
  }

  private movePayloadEquals(payload: Action['payload'], candidate: MoveCandidatePayload): boolean {
    const normalized = this.toMoveCandidatePayload(payload);
    return Boolean(
      normalized &&
        normalized.unitId === candidate.unitId &&
        normalized.to.x === candidate.to.x &&
        normalized.to.y === candidate.to.y &&
        normalized.actionPointCost === candidate.actionPointCost,
    );
  }

  private useAbilityPayloadEquals(payload: Action['payload'], candidate: UseAbilityCandidatePayload): boolean {
    const normalized = this.toUseAbilityCandidatePayload(payload);
    return Boolean(
      normalized &&
        normalized.unitId === candidate.unitId &&
        normalized.abilityId === candidate.abilityId &&
        normalized.targetId === candidate.targetId &&
        normalized.actionPointCost === candidate.actionPointCost &&
        normalized.cooldown === candidate.cooldown,
    );
  }

  private useItemPayloadEquals(payload: Action['payload'], candidate: UseItemCandidatePayload): boolean {
    const normalized = this.toUseItemCandidatePayload(payload);
    return Boolean(
      normalized &&
        normalized.unitId === candidate.unitId &&
        normalized.itemId === candidate.itemId &&
        normalized.targetId === candidate.targetId &&
        normalized.actionPointCost === candidate.actionPointCost &&
        normalized.cooldown === candidate.cooldown,
    );
  }

  private applyStatusPayloadEquals(payload: Action['payload'], candidate: ApplyStatusCandidatePayload): boolean {
    const normalized = this.toApplyStatusCandidatePayload(payload);
    return Boolean(
      normalized &&
        normalized.sourceUnitId === candidate.sourceUnitId &&
        normalized.targetId === candidate.targetId &&
        normalized.statusId === candidate.statusId &&
        normalized.duration === candidate.duration,
    );
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

    const normalizedAmount = amountValue === undefined ? 1 : amountValue;
    const actionPointCost = this.toNonNegativeInteger(record.actionPointCost);
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

  private toMoveCandidatePayload(payload: Action['payload']): MoveCandidatePayload | undefined {
    const record = this.toRecord(payload);
    if (!record || typeof record.unitId !== 'string') {
      return undefined;
    }

    const to = this.toGridTarget(record.to);
    if (!to) {
      return undefined;
    }

    const actionPointCost = this.toNonNegativeInteger(record.actionPointCost);
    if (record.actionPointCost !== undefined && actionPointCost === undefined) {
      return undefined;
    }

    return { unitId: record.unitId, to: { x: to.x, y: to.y }, actionPointCost };
  }

  private toUseAbilityCandidatePayload(payload: Action['payload']): UseAbilityCandidatePayload | undefined {
    const record = this.toRecord(payload);
    if (!record || typeof record.unitId !== 'string' || typeof record.abilityId !== 'string') {
      return undefined;
    }

    if (record.targetId !== undefined && typeof record.targetId !== 'string') {
      return undefined;
    }

    const actionPointCost = this.toNonNegativeInteger(record.actionPointCost);
    if (record.actionPointCost !== undefined && actionPointCost === undefined) {
      return undefined;
    }

    const cooldown = this.toNonNegativeInteger(record.cooldown);
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

  private toUseItemCandidatePayload(payload: Action['payload']): UseItemCandidatePayload | undefined {
    const record = this.toRecord(payload);
    if (!record || typeof record.unitId !== 'string' || typeof record.itemId !== 'string') {
      return undefined;
    }

    if (record.targetId !== undefined && typeof record.targetId !== 'string') {
      return undefined;
    }

    const actionPointCost = this.toNonNegativeInteger(record.actionPointCost);
    if (record.actionPointCost !== undefined && actionPointCost === undefined) {
      return undefined;
    }

    const cooldown = this.toNonNegativeInteger(record.cooldown);
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

  private toApplyStatusCandidatePayload(payload: Action['payload']): ApplyStatusCandidatePayload | undefined {
    const record = this.toRecord(payload);
    if (!record || typeof record.targetId !== 'string' || typeof record.statusId !== 'string') {
      return undefined;
    }

    if (record.sourceUnitId !== undefined && typeof record.sourceUnitId !== 'string') {
      return undefined;
    }

    const duration = record.duration === undefined ? 1 : this.toNonNegativeInteger(record.duration);
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

  private stageIntentValidation(state: GameState, action: Action): ActionResolutionContext | undefined {
    if (!this.validateAction(state, action)) {
      return undefined;
    }

    return { state, action, events: [] };
  }

  private stageTargetResolution(context: ActionResolutionContext): void {
    context.actorUnit = this.findActorUnit(context.state, context.action.actorId);

    if (context.action.type === 'ATTACK') {
      const payload = this.toAttackCandidatePayload(context.action.payload);
      context.targetUnit = payload ? context.state.units[payload.targetId] : undefined;
      return;
    }

    if (context.action.type === 'USE_ABILITY') {
      const payload = this.toUseAbilityCandidatePayload(context.action.payload);
      context.targetUnit = payload?.targetId ? context.state.units[payload.targetId] : undefined;
      return;
    }

    if (context.action.type === 'USE_ITEM') {
      const payload = this.toUseItemCandidatePayload(context.action.payload);
      context.targetUnit = payload?.targetId ? context.state.units[payload.targetId] : undefined;
      return;
    }

    if (context.action.type === 'APPLY_STATUS') {
      const payload = this.toApplyStatusCandidatePayload(context.action.payload);
      context.targetUnit = payload ? context.state.units[payload.targetId] : undefined;
    }
  }

  private stageResourcePayment(context: ActionResolutionContext): void {
    const unit = context.actorUnit;
    if (!unit) {
      return;
    }

    const actionPointCost = this.getActionPointCost(context.action);
    if (actionPointCost > 0 && typeof unit.actionPoints === 'number') {
      context.events.push({
        kind: 'ACTION_POINTS_CHANGED',
        unitId: unit.id,
        from: unit.actionPoints,
        to: Math.max(0, unit.actionPoints - actionPointCost),
        reason: context.action.type === 'MOVE' ? 'MOVE' : context.action.type === 'ATTACK' ? 'ATTACK' : 'EFFECT',
        turn: context.state.turn,
        round: context.state.round,
      });
    }

    const cooldown = this.getCooldownCost(context.action);
    const cooldownKey = this.getCooldownKey(context.action);
    if (cooldown > 0 && cooldownKey) {
      const from = unit.cooldowns?.[cooldownKey] ?? 0;
      context.events.push({
        kind: 'COOLDOWN_TICKED',
        unitId: unit.id,
        abilityId: cooldownKey,
        from,
        to: cooldown,
        turn: context.state.turn,
        round: context.state.round,
      });
    }
  }

  private stageEffectApplication(context: ActionResolutionContext): void {
    if (context.action.type === 'APPLY_STATUS') {
      const payload = this.toApplyStatusCandidatePayload(context.action.payload);
      if (!payload) {
        return;
      }

      context.events.push({
        kind: 'STATUS_APPLIED',
        sourceUnitId: payload.sourceUnitId,
        targetId: payload.targetId,
        statusId: payload.statusId,
        duration: payload.duration,
        turn: context.state.turn,
        round: context.state.round,
      });
      return;
    }

    if (context.action.type !== 'ATTACK') {
      return;
    }

    const payload = this.toAttackCandidatePayload(context.action.payload);
    const actorUnit = context.actorUnit;
    const targetUnit = context.targetUnit;
    if (!payload || !targetUnit || !actorUnit) {
      return;
    }

    const ruleResolution = this.ruleAdapter?.resolveAttack(context.state, context.action, actorUnit, targetUnit);
    const damageAmount = ruleResolution?.amount ?? payload.amount;

    context.events.push({
      kind: 'UNIT_DAMAGED',
      sourceId: actorUnit.ownerId,
      sourceUnitId: actorUnit.id,
      targetId: targetUnit.id,
      amount: damageAmount,
      abilityId: ruleResolution?.abilityId,
      turn: context.state.turn,
      round: context.state.round,
    });

    for (const application of ruleResolution?.appliedStatusApplications ?? []) {
      for (let stackIndex = 0; stackIndex < application.stacks; stackIndex += 1) {
        context.events.push({
          kind: 'STATUS_APPLIED',
          sourceUnitId: actorUnit.id,
          targetId: targetUnit.id,
          statusId: application.statusId,
          duration: application.duration,
          turn: context.state.turn,
          round: context.state.round,
        });
      }
    }

    if ((ruleResolution?.appliedCooldownTurns ?? 0) > 0 && ruleResolution?.abilityId) {
      const from = actorUnit.cooldowns?.[ruleResolution.abilityId] ?? 0;
      context.events.push({
        kind: 'COOLDOWN_TICKED',
        unitId: actorUnit.id,
        abilityId: ruleResolution.abilityId,
        from,
        to: ruleResolution.appliedCooldownTurns ?? 0,
        turn: context.state.turn,
        round: context.state.round,
      });
    }

    if (ruleResolution?.defeated ?? targetUnit.hp - damageAmount <= 0) {
      context.events.push({
        kind: 'UNIT_DEFEATED',
        sourceId: actorUnit.ownerId,
        sourceUnitId: actorUnit.id,
        targetId: targetUnit.id,
        turn: context.state.turn,
        round: context.state.round,
      });
    }
  }

  private stageEventEmission(context: ActionResolutionContext): void {
    context.events.unshift({
      kind: 'ACTION_APPLIED',
      action: context.action,
      turn: context.state.turn,
      round: context.state.round,
    });

    if (context.action.type === 'MOVE') {
      const payload = this.toMoveCandidatePayload(context.action.payload);
      if (payload) {
        const movingUnit = context.state.units[payload.unitId];
        if (movingUnit?.position) {
          context.events.push({
            kind: 'UNIT_MOVED',
            unitId: payload.unitId,
            from: movingUnit.position,
            to: payload.to,
            turn: context.state.turn,
            round: context.state.round,
          });
        }
      }
    }

    if (context.action.type === 'USE_ABILITY') {
      const payload = this.toUseAbilityCandidatePayload(context.action.payload);
      if (payload) {
        context.events.push({
          kind: 'ABILITY_USED',
          unitId: payload.unitId,
          abilityId: payload.abilityId,
          targetId: payload.targetId,
          turn: context.state.turn,
          round: context.state.round,
        });
      }
    }

    if (context.action.type === 'USE_ITEM') {
      const payload = this.toUseItemCandidatePayload(context.action.payload);
      if (payload) {
        context.events.push({
          kind: 'ITEM_USED',
          unitId: payload.unitId,
          itemId: payload.itemId,
          targetId: payload.targetId,
          turn: context.state.turn,
          round: context.state.round,
        });
      }
    }
  }

  private stagePostResolutionCleanup(_: ActionResolutionContext): void {}

  private getActionPointCost(action: Action): number {
    if (action.type === 'ATTACK') {
      return this.toAttackCandidatePayload(action.payload)?.actionPointCost ?? 1;
    }
    if (action.type === 'MOVE') {
      return this.toMoveCandidatePayload(action.payload)?.actionPointCost ?? 0;
    }
    if (action.type === 'USE_ABILITY') {
      return this.toUseAbilityCandidatePayload(action.payload)?.actionPointCost ?? 0;
    }
    if (action.type === 'USE_ITEM') {
      return this.toUseItemCandidatePayload(action.payload)?.actionPointCost ?? 0;
    }
    return 0;
  }

  private getCooldownCost(action: Action): number {
    if (action.type === 'USE_ABILITY') {
      return this.toUseAbilityCandidatePayload(action.payload)?.cooldown ?? 0;
    }
    if (action.type === 'USE_ITEM') {
      return this.toUseItemCandidatePayload(action.payload)?.cooldown ?? 0;
    }
    return 0;
  }

  private getCooldownKey(action: Action): string | undefined {
    if (action.type === 'USE_ABILITY') {
      return this.toUseAbilityCandidatePayload(action.payload)?.abilityId;
    }
    if (action.type === 'USE_ITEM') {
      return this.toUseItemCandidatePayload(action.payload)?.itemId;
    }
    return undefined;
  }

  private toNonNegativeInteger(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      return undefined;
    }
    return value;
  }

  private toRecord(payload: Action['payload']): Record<string, unknown> | undefined {
    if (!this.isPlainRecord(payload)) {
      return undefined;
    }

    return payload;
  }

  private toGridTarget(value: unknown): GridTargetPayload | undefined {
    if (!this.isPlainRecord(value)) {
      return undefined;
    }

    const { x, y } = value;
    if (typeof x !== 'number' || !Number.isInteger(x) || typeof y !== 'number' || !Number.isInteger(y)) {
      return undefined;
    }

    return { x, y };
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
  }

  private findActorUnit(state: GameState, actorId: string): UnitState | undefined {
    return state.units[actorId] ?? Object.values(state.units).find((unit) => unit.ownerId === actorId && unit.hp > 0);
  }

  private isOutOfRange(actorUnit: UnitState, targetUnit: UnitState, action: Action): boolean {
    const payload = this.toRecord(action.payload);
    const actorPosition = this.toCell(actorUnit);
    const targetPosition = this.toCell(targetUnit);

    if (!actorPosition || !targetPosition) {
      return false;
    }

    const configuredRange = payload?.range;
    const maxRange = typeof configuredRange === 'number' && configuredRange >= 0 ? configuredRange : DEFAULT_ATTACK_RANGE;
    const attackableCells = this.targeting.getTargetCells({
      origin: actorPosition,
      minRange: 1,
      maxRange,
      aoePattern: [{ q: 0, r: 0 }],
    });
    const inRange = attackableCells.some((cell) => cell.target.q === targetPosition.q && cell.target.r === targetPosition.r);

    return !inRange;
  }

  private hasLineOfSight(state: GameState, actorUnit: UnitState, targetUnit: UnitState): boolean {
    const actorPosition = this.toCell(actorUnit);
    const targetPosition = this.toCell(targetUnit);
    if (!actorPosition || !targetPosition) {
      return true;
    }

    const occupiedCells = new Set<string>();
    for (const unit of Object.values(state.units)) {
      const cell = this.toCell(unit);
      if (!cell || unit.hp <= 0) {
        continue;
      }
      if (
        (cell.q === actorPosition.q && cell.r === actorPosition.r) ||
        (cell.q === targetPosition.q && cell.r === targetPosition.r)
      ) {
        continue;
      }

      occupiedCells.add(this.toCellKey(cell.q, cell.r));
    }

    const los = new LineOfSight({
      getObstacle: (cell) => (occupiedCells.has(this.toCellKey(cell.q, cell.r)) ? 'hard' : 'none'),
      getCoverValue: () => 0,
    });
    los.setTurn(state.turn);
    return los.query(actorPosition, targetPosition).visible;
  }

  private hasSpatialPosition(unit: UnitState): boolean {
    return this.toCell(unit) !== undefined;
  }

  private toCell(unit: UnitState): { q: number; r: number } | undefined {
    if (unit.spatialRef) {
      return { q: unit.spatialRef.q, r: unit.spatialRef.r };
    }
    if (unit.position) {
      return { q: unit.position.x, r: unit.position.y };
    }
    return undefined;
  }

  private toCellKey(q: number, r: number): string {
    return `${q},${r}`;
  }
}
