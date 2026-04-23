import { ActionResolver } from './ActionResolver';
import type { LegalActionGenerator } from './LegalActionGenerator';
import type { MatchOutcomeEvaluator } from './RuleAdapter';
import { TurnManager } from './TurnManager';
import { appendEvents, reduceEvents, type Action, type GameEvent, type GameState, type StateTransitionResult } from '../state/GameState';

export interface StrategyContext {
  readonly state: GameState;
  readonly action: Action;
}

export interface SimulationStrategy {
  collectEvents(context: StrategyContext): readonly GameEvent[];
}

export interface TurnStartStrategy {
  collectTurnStartEvents(state: GameState): readonly GameEvent[];
}

const NOOP_STRATEGY: SimulationStrategy = {
  collectEvents: () => [],
};

const NOOP_TURN_START_STRATEGY: TurnStartStrategy = {
  collectTurnStartEvents: () => [],
};

export interface EngineOptions {
  readonly actionResolver?: ActionResolver;
  readonly turnManager?: TurnManager;
  readonly movementStrategy?: SimulationStrategy;
  readonly combatStrategy?: SimulationStrategy;
  readonly statusStrategy?: SimulationStrategy;
  readonly turnEconomyStrategy?: TurnStartStrategy;
  readonly spatialStrategy?: SimulationStrategy;
  readonly legalActionGenerator?: LegalActionGenerator;
  readonly matchOutcomeEvaluator?: MatchOutcomeEvaluator;
}

export class Engine {
  private readonly actionResolver: ActionResolver;
  private readonly turnManager: TurnManager;
  private readonly movementStrategy: SimulationStrategy;
  private readonly combatStrategy: SimulationStrategy;
  private readonly statusStrategy: SimulationStrategy;
  private readonly spatialStrategy: SimulationStrategy;
  private readonly turnEconomyStrategy: TurnStartStrategy;
  private readonly matchOutcomeEvaluator?: MatchOutcomeEvaluator;

  constructor(options?: EngineOptions);
  constructor(
    actionResolver?: ActionResolver,
    turnManager?: TurnManager,
    movementStrategy?: SimulationStrategy,
    combatStrategy?: SimulationStrategy,
    statusStrategy?: SimulationStrategy,
    turnEconomyStrategy?: TurnStartStrategy,
    spatialStrategy?: SimulationStrategy,
    legalActionGenerator?: LegalActionGenerator,
    matchOutcomeEvaluator?: MatchOutcomeEvaluator,
  );
  constructor(
    actionResolverOrOptions: ActionResolver | EngineOptions | undefined = undefined,
    turnManager = new TurnManager(),
    movementStrategy: SimulationStrategy = NOOP_STRATEGY,
    combatStrategy: SimulationStrategy = NOOP_STRATEGY,
    statusStrategy: SimulationStrategy = NOOP_STRATEGY,
    turnEconomyStrategy: TurnStartStrategy = NOOP_TURN_START_STRATEGY,
    spatialStrategy: SimulationStrategy = NOOP_STRATEGY,
    legalActionGenerator?: LegalActionGenerator,
    matchOutcomeEvaluator?: MatchOutcomeEvaluator,
  ) {
    const normalizedOptions =
      actionResolverOrOptions === undefined || actionResolverOrOptions instanceof ActionResolver
        ? {
            actionResolver: actionResolverOrOptions,
            turnManager,
            movementStrategy,
            combatStrategy,
            statusStrategy,
            turnEconomyStrategy,
            spatialStrategy,
            legalActionGenerator,
            matchOutcomeEvaluator,
          }
        : actionResolverOrOptions;

    this.actionResolver = normalizedOptions.actionResolver ?? new ActionResolver(normalizedOptions.legalActionGenerator);
    this.turnManager = normalizedOptions.turnManager ?? new TurnManager();
    this.movementStrategy = normalizedOptions.movementStrategy ?? NOOP_STRATEGY;
    this.combatStrategy = normalizedOptions.combatStrategy ?? NOOP_STRATEGY;
    this.statusStrategy = normalizedOptions.statusStrategy ?? NOOP_STRATEGY;
    this.turnEconomyStrategy = normalizedOptions.turnEconomyStrategy ?? NOOP_TURN_START_STRATEGY;
    this.spatialStrategy = normalizedOptions.spatialStrategy ?? NOOP_STRATEGY;
    this.matchOutcomeEvaluator = normalizedOptions.matchOutcomeEvaluator;
  }

  public applyAction(state: GameState, action: Action): StateTransitionResult {
    return this.step(state, action);
  }

  public step(state: GameState, command: Action): StateTransitionResult {
    if (state.matchStatus === 'ENDED') {
      return { state, events: [] };
    }

    const validation = this.actionResolver.validateActionWithReason(state, command);
    if (!validation.isValid) {
      const rejectionEvent: GameEvent = {
        kind: 'ACTION_REJECTED',
        actorId: command.actorId,
        actionType: command.type,
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

    const context: StrategyContext = { state, action: command };
    const combatEvents = command.type === 'ATTACK' ? [] : this.combatStrategy.collectEvents(context);
    const initialEvents: GameEvent[] = [
      ...this.actionResolver.resolveActionEffects(state, command),
      ...this.spatialStrategy.collectEvents(context),
      ...this.movementStrategy.collectEvents(context),
      ...combatEvents,
      ...this.statusStrategy.collectEvents(context),
    ];

    const orderedEvents: GameEvent[] = [];
    let nextState = state;

    const applyEvents = (events: readonly GameEvent[]): void => {
      if (events.length === 0) {
        return;
      }

      orderedEvents.push(...events);
      nextState = appendEvents(reduceEvents(nextState, events), events);
    };

    applyEvents(initialEvents);

    const transition = (): void => {
      const result = this.turnManager.advancePhaseWithEvents(nextState);
      orderedEvents.push(...result.events);
      nextState = result.state;
    };

    for (const step of this.turnManager.getActionPhaseFlow(command.type, state.phase)) {
      if (step.kind === 'ADVANCE_PHASE') {
        transition();
        continue;
      }

      const economyEvents = this.turnEconomyStrategy.collectTurnStartEvents(nextState);
      applyEvents(economyEvents);
    }

    if (nextState.matchStatus === 'IN_PROGRESS' && this.matchOutcomeEvaluator) {
      const matchOutcome = this.matchOutcomeEvaluator.evaluate(nextState);
      if (matchOutcome) {
        const terminalEvent: GameEvent = {
          kind: 'MATCH_ENDED',
          winnerTeamId: matchOutcome.winnerTeamId,
          isDraw: Boolean(matchOutcome.isDraw),
          turn: nextState.turn,
          round: nextState.round,
        };
        applyEvents([terminalEvent]);
      }
    }

    return {
      state: nextState,
      events: orderedEvents,
    };
  }

  public getLegalActions(state: GameState, actorId: string): Action[] {
    return this.actionResolver.getLegalActions(state, actorId);
  }

  public advancePhase(state: GameState): GameState {
    return this.turnManager.advancePhase(state);
  }
}

const defaultEngine = new Engine();

export function applyAction(state: GameState, action: Action): StateTransitionResult {
  return defaultEngine.applyAction(state, action);
}

export function step(state: GameState, command: Action): StateTransitionResult {
  return defaultEngine.step(state, command);
}

export function getLegalActions(state: GameState, actorId: string): Action[] {
  return defaultEngine.getLegalActions(state, actorId);
}

export function advancePhase(state: GameState): GameState {
  return defaultEngine.advancePhase(state);
}
