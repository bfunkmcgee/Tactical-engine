import { appendEvents, getActiveActorId, reduceEvents, type Action, type GameEvent, type GameState, type StateTransitionResult } from '../state/GameState';
import { DemoLegalActionGenerator, type LegalActionGenerator } from './LegalActionGenerator';
import type { RuleActionAdapter } from './RuleAdapter';
import type { ActionTypeHandler, EventAssemblyStage, ResourceChecksStage } from './action-pipeline/contracts';
import { createActionHandlers, defaultEventAssemblyStage, defaultResourceStage } from './action-pipeline/actionTypeHandlers';

export interface ActionValidationResult {
  readonly isValid: boolean;
  readonly reason?: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export class ActionResolver {
  private readonly legalActionGenerator: LegalActionGenerator;
  private readonly handlers: Record<Action['type'], ActionTypeHandler>;
  private readonly resourceStage: ResourceChecksStage;
  private readonly eventStage: EventAssemblyStage;

  constructor(legalActionGenerator: LegalActionGenerator = new DemoLegalActionGenerator(), ruleAdapter?: RuleActionAdapter) {
    this.legalActionGenerator = legalActionGenerator;
    this.handlers = createActionHandlers(ruleAdapter);
    this.resourceStage = defaultResourceStage;
    this.eventStage = defaultEventAssemblyStage;
  }

  public applyAction(state: GameState, action: Action): StateTransitionResult {
    const validation = this.validateActionWithReason(state, action);
    if (!validation.isValid) return this.buildRejectedActionResult(state, action, validation);
    const events = this.resolveActionEffects(state, action, validation);
    return { state: appendEvents(reduceEvents(state, events), events), events };
  }
  public validateAction(state: GameState, action: Action): boolean { return this.validateActionWithReason(state, action).isValid; }

  public validateActionWithReason(state: GameState, action: Action): ActionValidationResult {
    const legalActions = this.getLegalActions(state, action.actorId);
    if (legalActions.length === 0) return { isValid: false, reason: 'NO_LEGAL_ACTIONS_FOR_ACTOR', details: { actorId: action.actorId, activeActorId: getActiveActorId(state), phase: state.phase } };
    const handler = this.handlers[action.type];
    if (!handler) return { isValid: false, reason: 'UNKNOWN_ACTION_TYPE', details: { type: String((action as { type?: unknown }).type ?? '') } };
    return handler.validate(state, action, legalActions.filter((c) => c.type === action.type));
  }

  public resolveActionEffects(state: GameState, action: Action, validation?: ActionValidationResult): GameEvent[] {
    const resolvedValidation = validation ?? this.validateActionWithReason(state, action);
    if (!resolvedValidation.isValid) return [];
    const handler = this.handlers[action.type];
    const normalized = handler.normalize(state, action);
    const effects = handler.buildEffects(state, normalized);
    const resources = this.resourceStage.build({ action, actorUnit: normalized.actorUnit, turn: state.turn, round: state.round });
    const emitted = this.eventStage.build(state, action);
    const [actionApplied, ...tail] = emitted;
    return actionApplied ? [actionApplied, ...resources, ...effects, ...tail] : [...resources, ...effects, ...tail];
  }

  public getLegalActions(state: GameState, actorId: string): Action[] { return this.legalActionGenerator.getLegalActions(state, actorId); }

  public buildRejectedActionResult(state: GameState, action: Action, validation: ActionValidationResult): StateTransitionResult {
    const rejectionEvent: GameEvent = { kind: 'ACTION_REJECTED', actorId: action.actorId, actionType: action.type, reason: validation.reason ?? 'ACTION_INVALID', details: validation.details, turn: state.turn, round: state.round };
    return { state: appendEvents(reduceEvents(state, [rejectionEvent]), [rejectionEvent]), events: [rejectionEvent] };
  }
}
