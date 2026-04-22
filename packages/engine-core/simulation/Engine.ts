import { ActionResolver } from './ActionResolver';
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

  constructor(
    actionResolver = new ActionResolver(),
    turnManager = new TurnManager(),
    movementStrategy: SimulationStrategy = NOOP_STRATEGY,
    combatStrategy: SimulationStrategy = NOOP_STRATEGY,
    statusStrategy: SimulationStrategy = NOOP_STRATEGY,
    turnEconomyStrategy: TurnStartStrategy = NOOP_TURN_START_STRATEGY,
    spatialStrategy: SimulationStrategy = NOOP_STRATEGY,
  ) {
    this.actionResolver = actionResolver;
    this.turnManager = turnManager;
    this.movementStrategy = movementStrategy;
    this.combatStrategy = combatStrategy;
    this.statusStrategy = statusStrategy;
    this.turnEconomyStrategy = turnEconomyStrategy;
    this.spatialStrategy = spatialStrategy;
  }

  public applyAction(state: GameState, action: Action): StateTransitionResult {
    return this.step(state, action);
  }

  public step(state: GameState, command: Action): StateTransitionResult {
    if (!this.actionResolver.validateAction(state, command)) {
      return { state, events: [] };
    }

    const context: StrategyContext = { state, action: command };
    const emittedEvents: GameEvent[] = [
      ...this.actionResolver.resolveActionEffects(state, command),
      ...this.spatialStrategy.collectEvents(context),
      ...this.movementStrategy.collectEvents(context),
      ...this.combatStrategy.collectEvents(context),
      ...this.statusStrategy.collectEvents(context),
    ];

    let nextState = appendEvents(reduceEvents(state, emittedEvents), emittedEvents);
    const transitionEvents: GameEvent[] = [];

    const transition = (current: GameState): GameState => {
      const result = this.turnManager.advancePhaseWithEvents(current);
      transitionEvents.push(...result.events);
      return result.state;
    };

    if (state.phase === 'COMMAND' && command.type === 'END_COMMAND') {
      nextState = transition(nextState);
      nextState = transition(nextState);
      nextState = transition(nextState);

      const economyEvents = this.turnEconomyStrategy.collectTurnStartEvents(nextState);
      if (economyEvents.length > 0) {
        emittedEvents.push(...economyEvents);
        nextState = appendEvents(reduceEvents(nextState, economyEvents), economyEvents);
      }

      nextState = transition(nextState);
    } else if (command.type === 'PASS' && state.phase !== 'COMMAND') {
      nextState = transition(nextState);
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
