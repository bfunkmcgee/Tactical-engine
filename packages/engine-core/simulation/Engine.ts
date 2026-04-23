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

export class Engine {
  private readonly actionResolver: ActionResolver;
  private readonly turnManager: TurnManager;
  private readonly movementStrategy: SimulationStrategy;
  private readonly combatStrategy: SimulationStrategy;
  private readonly statusStrategy: SimulationStrategy;
  private readonly spatialStrategy: SimulationStrategy;
  private readonly turnEconomyStrategy: TurnStartStrategy;
  private readonly matchOutcomeEvaluator?: MatchOutcomeEvaluator;

  constructor(
    actionResolver: ActionResolver | undefined = undefined,
    turnManager = new TurnManager(),
    movementStrategy: SimulationStrategy = NOOP_STRATEGY,
    combatStrategy: SimulationStrategy = NOOP_STRATEGY,
    statusStrategy: SimulationStrategy = NOOP_STRATEGY,
    turnEconomyStrategy: TurnStartStrategy = NOOP_TURN_START_STRATEGY,
    spatialStrategy: SimulationStrategy = NOOP_STRATEGY,
    legalActionGenerator?: LegalActionGenerator,
    matchOutcomeEvaluator?: MatchOutcomeEvaluator,
  ) {
    this.actionResolver = actionResolver ?? new ActionResolver(legalActionGenerator);
    this.turnManager = turnManager;
    this.movementStrategy = movementStrategy;
    this.combatStrategy = combatStrategy;
    this.statusStrategy = statusStrategy;
    this.turnEconomyStrategy = turnEconomyStrategy;
    this.spatialStrategy = spatialStrategy;
    this.matchOutcomeEvaluator = matchOutcomeEvaluator;
  }

  public applyAction(state: GameState, action: Action): StateTransitionResult {
    return this.step(state, action);
  }

  public step(state: GameState, command: Action): StateTransitionResult {
    if (state.matchStatus === 'ENDED') {
      return { state, events: [] };
    }

    if (!this.actionResolver.validateAction(state, command)) {
      return { state, events: [] };
    }

    const context: StrategyContext = { state, action: command };
    const combatEvents = command.type === 'ATTACK' ? [] : this.combatStrategy.collectEvents(context);
    const emittedEvents: GameEvent[] = [
      ...this.actionResolver.resolveActionEffects(state, command),
      ...this.spatialStrategy.collectEvents(context),
      ...this.movementStrategy.collectEvents(context),
      ...combatEvents,
      ...this.statusStrategy.collectEvents(context),
    ];

    let nextState = appendEvents(reduceEvents(state, emittedEvents), emittedEvents);
    const transitionEvents: GameEvent[] = [];

    const transition = (current: GameState): GameState => {
      const result = this.turnManager.advancePhaseWithEvents(current);
      transitionEvents.push(...result.events);
      return result.state;
    };

    for (const step of this.turnManager.getActionPhaseFlow(command.type, state.phase)) {
      if (step.kind === 'ADVANCE_PHASE') {
        nextState = transition(nextState);
        continue;
      }

      const economyEvents = this.turnEconomyStrategy.collectTurnStartEvents(nextState);
      if (economyEvents.length > 0) {
        emittedEvents.push(...economyEvents);
        nextState = appendEvents(reduceEvents(nextState, economyEvents), economyEvents);
      }
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
        emittedEvents.push(terminalEvent);
        nextState = appendEvents(reduceEvents(nextState, [terminalEvent]), [terminalEvent]);
      }
    }

    return {
      state: nextState,
      events: [...emittedEvents, ...transitionEvents],
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
