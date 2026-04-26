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
import { DemoLegalActionGenerator, type LegalActionGenerator } from './LegalActionGenerator';
import type { RuleActionAdapter } from './RuleAdapter';
import {
  APPLY_STATUS_PAYLOAD_KEYS,
  ATTACK_PAYLOAD_KEYS,
  END_COMMAND_PAYLOAD_KEYS,
  MOVE_PAYLOAD_KEYS,
  PASS_PAYLOAD_KEYS,
  USE_ABILITY_PAYLOAD_KEYS,
  USE_ITEM_PAYLOAD_KEYS,
  toApplyStatusCandidatePayload,
  toAttackCandidatePayload,
  toMoveCandidatePayload,
  toRecord,
  toUseAbilityCandidatePayload,
  toUseItemCandidatePayload,
  validateAllowedKeys,
} from './action-pipeline/payloadSchemaValidationStage';
import {
  matchesApplyStatusLegalAction,
  matchesAttackLegalAction,
  matchesEndCommandLegalAction,
  matchesMoveLegalAction,
  matchesPassLegalAction,
  matchesUseAbilityLegalAction,
  matchesUseItemLegalAction,
} from './action-pipeline/legalActionMatchingStage';
import { findActorUnit, hasLineOfSight, hasSpatialPosition, isOutOfRange } from './action-pipeline/spatialTargetChecksStage';
import { buildResourcePaymentEvents } from './action-pipeline/resourcePaymentStage';
import { buildActionEmissionEvents } from './action-pipeline/eventEmissionStage';

export interface ActionValidationResult {
  readonly isValid: boolean;
  readonly reason?: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

interface ActionResolutionContext {
  readonly state: GameState;
  readonly action: Action;
  readonly events: GameEvent[];
  actorUnit?: UnitState;
  targetUnit?: UnitState;
}

export class ActionResolver {
  private readonly legalActionGenerator: LegalActionGenerator;
  private readonly ruleAdapter?: RuleActionAdapter;

  constructor(legalActionGenerator: LegalActionGenerator = new DemoLegalActionGenerator(), ruleAdapter?: RuleActionAdapter) {
    this.legalActionGenerator = legalActionGenerator;
    this.ruleAdapter = ruleAdapter;
  }

  public applyAction(state: GameState, action: Action): StateTransitionResult {
    const validation = this.validateActionWithReason(state, action);
    if (!validation.isValid) {
      return this.buildRejectedActionResult(state, action, validation);
    }

    const events = this.resolveActionEffects(state, action, validation);
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

  public resolveActionEffects(state: GameState, action: Action, validation?: ActionValidationResult): GameEvent[] {
    const resolvedValidation = validation ?? this.validateActionWithReason(state, action);
    const context = this.stageIntentValidation(state, action, resolvedValidation);
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

  /**
   * Canonical ACTION_REJECTED creator for invalid commands.
   * Engine.step delegates rejection event construction to this method so
   * reason/details metadata stays stable across all simulation entry points.
   */
  public buildRejectedActionResult(state: GameState, action: Action, validation: ActionValidationResult): StateTransitionResult {
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

  private validateAttackAction(state: GameState, action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return { isValid: false, reason: 'ATTACK_NOT_LEGAL_IN_PHASE', details: { phase: state.phase } };
    }

    const payload = toRecord(action.payload);
    if (!payload) {
      return { isValid: false, reason: 'INVALID_ATTACK_PAYLOAD_TYPE', details: { expected: 'object' } };
    }

    const keyValidation = validateAllowedKeys(payload, ATTACK_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    if (typeof payload.targetId !== 'string' || payload.targetId.length === 0) {
      return { isValid: false, reason: 'ATTACK_TARGET_REQUIRED' };
    }

    if (payload.amount !== undefined && (typeof payload.amount !== 'number' || !Number.isInteger(payload.amount) || payload.amount <= 0)) {
      return { isValid: false, reason: 'ATTACK_AMOUNT_INVALID', details: { amount: String(payload.amount) } };
    }

    const normalized = toAttackCandidatePayload(action.payload);
    if (!normalized) {
      return { isValid: false, reason: 'ATTACK_AMOUNT_INVALID', details: { amount: String(payload.amount) } };
    }

    if (!matchesAttackLegalAction(action, legalActions, normalized)) {
      return { isValid: false, reason: 'ATTACK_NOT_FOUND_IN_LEGAL_ACTIONS', details: { actorId: action.actorId, targetId: normalized.targetId } };
    }

    const target = state.units[normalized.targetId];
    if (!target || target.hp <= 0) {
      return { isValid: false, reason: 'ATTACK_TARGET_NOT_ALIVE', details: { targetId: normalized.targetId } };
    }

    const actorUnit = findActorUnit(state, action.actorId);
    if (!actorUnit) {
      return { isValid: false, reason: 'ATTACK_SOURCE_NOT_FOUND', details: { actorId: action.actorId } };
    }

    if (!hasSpatialPosition(actorUnit)) {
      return { isValid: false, reason: 'MISSING_SOURCE_POSITION', details: { actorId: action.actorId, sourceUnitId: actorUnit.id, actionType: action.type } };
    }

    if (!hasSpatialPosition(target)) {
      return { isValid: false, reason: 'MISSING_TARGET_POSITION', details: { actorId: action.actorId, targetId: normalized.targetId, actionType: action.type } };
    }

    if (isOutOfRange(actorUnit, target, action)) {
      return { isValid: false, reason: 'ATTACK_TARGET_OUT_OF_RANGE', details: { actorId: action.actorId, targetId: normalized.targetId } };
    }

    if (!hasLineOfSight(state, actorUnit, target)) {
      return { isValid: false, reason: 'ATTACK_TARGET_NO_LINE_OF_SIGHT', details: { actorId: action.actorId, targetId: normalized.targetId } };
    }

    return { isValid: true };
  }

  private validateEndCommandAction(action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return { isValid: false, reason: 'END_COMMAND_NOT_LEGAL_IN_PHASE' };
    }

    const payload = toRecord(action.payload);
    if (!payload) {
      return { isValid: false, reason: 'INVALID_END_COMMAND_PAYLOAD_TYPE' };
    }

    const keyValidation = validateAllowedKeys(payload, END_COMMAND_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    if (payload.reason !== 'manual') {
      return { isValid: false, reason: 'END_COMMAND_REASON_INVALID', details: { reason: String(payload.reason) } };
    }

    return matchesEndCommandLegalAction(action, legalActions, { reason: 'manual' })
      ? { isValid: true }
      : { isValid: false, reason: 'END_COMMAND_NOT_FOUND_IN_LEGAL_ACTIONS', details: { actorId: action.actorId } };
  }

  private validatePassAction(action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return { isValid: false, reason: 'PASS_NOT_LEGAL_IN_PHASE' };
    }

    const payload = toRecord(action.payload);
    if (!payload) {
      return { isValid: false, reason: 'INVALID_PASS_PAYLOAD_TYPE' };
    }

    const keyValidation = validateAllowedKeys(payload, PASS_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    if (typeof payload.phase !== 'string') {
      return { isValid: false, reason: 'PASS_PHASE_REQUIRED' };
    }

    return matchesPassLegalAction(action, legalActions, { phase: payload.phase as GameState['phase'] })
      ? { isValid: true }
      : { isValid: false, reason: 'PASS_NOT_FOUND_IN_LEGAL_ACTIONS', details: { actorId: action.actorId, phase: payload.phase } };
  }

  private validateMoveAction(state: GameState, action: Action, legalActions: Action[]): ActionValidationResult {
    const payload = toRecord(action.payload);
    if (!payload) {
      return { isValid: false, reason: 'INVALID_MOVE_PAYLOAD_TYPE' };
    }

    const keyValidation = validateAllowedKeys(payload, MOVE_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const normalized = toMoveCandidatePayload(action.payload);
    if (!normalized) {
      if (payload.to === undefined) {
        return { isValid: false, reason: 'MISSING_TARGET_POSITION', details: { actorId: action.actorId, actionType: action.type } };
      }
      return { isValid: false, reason: 'MOVE_PAYLOAD_INVALID' };
    }

    const sourceUnit = state.units[normalized.unitId];
    if (!sourceUnit || !sourceUnit.position) {
      return { isValid: false, reason: 'MISSING_SOURCE_POSITION', details: { actorId: action.actorId, sourceUnitId: normalized.unitId, actionType: action.type } };
    }

    if (sourceUnit.position.x === normalized.to.x && sourceUnit.position.y === normalized.to.y) {
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
      return { isValid: false, reason: 'MOVE_DESTINATION_OCCUPIED', details: { actorId: action.actorId, unitId: normalized.unitId, x: normalized.to.x, y: normalized.to.y } };
    }

    if (legalActions.length === 0) {
      return { isValid: false, reason: 'MOVE_NOT_LEGAL_IN_PHASE' };
    }

    return matchesMoveLegalAction(action, legalActions, normalized)
      ? { isValid: true }
      : { isValid: false, reason: 'MOVE_NOT_FOUND_IN_LEGAL_ACTIONS' };
  }

  private validateUseAbilityAction(state: GameState, action: Action, legalActions: Action[]): ActionValidationResult {
    const payload = toRecord(action.payload);
    if (!payload) {
      return { isValid: false, reason: 'INVALID_USE_ABILITY_PAYLOAD_TYPE' };
    }

    const keyValidation = validateAllowedKeys(payload, USE_ABILITY_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const normalized = toUseAbilityCandidatePayload(action.payload);
    if (!normalized) {
      return { isValid: false, reason: 'USE_ABILITY_PAYLOAD_INVALID' };
    }

    const sourceUnit = state.units[normalized.unitId];
    if (!sourceUnit || !hasSpatialPosition(sourceUnit)) {
      return { isValid: false, reason: 'MISSING_SOURCE_POSITION', details: { actorId: action.actorId, sourceUnitId: normalized.unitId, actionType: action.type } };
    }

    if (normalized.targetId) {
      const targetUnit = state.units[normalized.targetId];
      if (!targetUnit || !hasSpatialPosition(targetUnit)) {
        return { isValid: false, reason: 'MISSING_TARGET_POSITION', details: { actorId: action.actorId, targetId: normalized.targetId, actionType: action.type } };
      }
    }

    if (legalActions.length === 0) {
      return { isValid: false, reason: 'USE_ABILITY_NOT_LEGAL_IN_PHASE' };
    }

    return matchesUseAbilityLegalAction(action, legalActions, normalized)
      ? { isValid: true }
      : { isValid: false, reason: 'USE_ABILITY_NOT_FOUND_IN_LEGAL_ACTIONS' };
  }

  private validateUseItemAction(action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return { isValid: false, reason: 'USE_ITEM_NOT_LEGAL_IN_PHASE' };
    }

    const payload = toRecord(action.payload);
    if (!payload) {
      return { isValid: false, reason: 'INVALID_USE_ITEM_PAYLOAD_TYPE' };
    }

    const keyValidation = validateAllowedKeys(payload, USE_ITEM_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const normalized = toUseItemCandidatePayload(action.payload);
    if (!normalized) {
      return { isValid: false, reason: 'USE_ITEM_PAYLOAD_INVALID' };
    }

    return matchesUseItemLegalAction(action, legalActions, normalized)
      ? { isValid: true }
      : { isValid: false, reason: 'USE_ITEM_NOT_FOUND_IN_LEGAL_ACTIONS' };
  }

  private validateApplyStatusAction(state: GameState, action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return { isValid: false, reason: 'APPLY_STATUS_NOT_LEGAL_IN_PHASE' };
    }

    const payload = toRecord(action.payload);
    if (!payload) {
      return { isValid: false, reason: 'INVALID_APPLY_STATUS_PAYLOAD_TYPE' };
    }

    const keyValidation = validateAllowedKeys(payload, APPLY_STATUS_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const normalized = toApplyStatusCandidatePayload(action.payload);
    if (!normalized) {
      return { isValid: false, reason: 'APPLY_STATUS_PAYLOAD_INVALID' };
    }

    const targetUnit = state.units[normalized.targetId];
    if (!targetUnit || targetUnit.hp <= 0) {
      return { isValid: false, reason: 'APPLY_STATUS_TARGET_NOT_ALIVE', details: { targetId: normalized.targetId } };
    }

    return matchesApplyStatusLegalAction(action, legalActions, normalized)
      ? { isValid: true }
      : { isValid: false, reason: 'APPLY_STATUS_NOT_FOUND_IN_LEGAL_ACTIONS' };
  }

  private stageIntentValidation(state: GameState, action: Action, validation: ActionValidationResult): ActionResolutionContext | undefined {
    if (!validation.isValid) {
      return undefined;
    }

    return { state, action, events: [] };
  }

  private stageTargetResolution(context: ActionResolutionContext): void {
    context.actorUnit = findActorUnit(context.state, context.action.actorId);

    if (context.action.type === 'ATTACK') {
      const payload = toAttackCandidatePayload(context.action.payload);
      context.targetUnit = payload ? context.state.units[payload.targetId] : undefined;
      return;
    }

    if (context.action.type === 'USE_ABILITY') {
      const payload = toUseAbilityCandidatePayload(context.action.payload);
      context.targetUnit = payload?.targetId ? context.state.units[payload.targetId] : undefined;
      return;
    }

    if (context.action.type === 'USE_ITEM') {
      const payload = toUseItemCandidatePayload(context.action.payload);
      context.targetUnit = payload?.targetId ? context.state.units[payload.targetId] : undefined;
      return;
    }

    if (context.action.type === 'APPLY_STATUS') {
      const payload = toApplyStatusCandidatePayload(context.action.payload);
      context.targetUnit = payload ? context.state.units[payload.targetId] : undefined;
    }
  }

  private stageResourcePayment(context: ActionResolutionContext): void {
    context.events.push(
      ...buildResourcePaymentEvents({
        action: context.action,
        actorUnit: context.actorUnit,
        turn: context.state.turn,
        round: context.state.round,
      }),
    );
  }

  private stageEffectApplication(context: ActionResolutionContext): void {
    if (context.action.type === 'APPLY_STATUS') {
      const payload = toApplyStatusCandidatePayload(context.action.payload);
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

    const payload = toAttackCandidatePayload(context.action.payload);
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
    const emitted = buildActionEmissionEvents(context.state, context.action);
    const [actionApplied, ...tailEvents] = emitted;
    if (actionApplied) {
      context.events.unshift(actionApplied);
    }
    context.events.push(...tailEvents);
  }

  private stagePostResolutionCleanup(_: ActionResolutionContext): void {}
}
