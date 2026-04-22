import { ActionResolver } from './ActionResolver';
import { TurnManager } from './TurnManager';
import { appendEvents, reduceEvents, type Action, type GameEvent, type GameState, type StateTransitionResult } from '../state/GameState';

export interface SpatialQueries {
  collectEvents(state: GameState, action: Action): readonly GameEvent[];
}

export interface MovementSystem {
  collectEvents(state: GameState, action: Action, spatialQueries: SpatialQueries): readonly GameEvent[];
}

export interface CombatSystem {
  collectEvents(state: GameState, action: Action, spatialQueries: SpatialQueries): readonly GameEvent[];
}

export interface StatusSystem {
  collectEvents(state: GameState, action: Action): readonly GameEvent[];
}

export interface TurnEconomySystem {
  collectTurnStartEvents(state: GameState): readonly GameEvent[];
}

const NOOP_SPATIAL_QUERIES: SpatialQueries = {
  collectEvents: () => [],
};

const NOOP_MOVEMENT_SYSTEM: MovementSystem = {
  collectEvents: () => [],
};

const NOOP_COMBAT_SYSTEM: CombatSystem = {
  collectEvents: () => [],
};

const NOOP_STATUS_SYSTEM: StatusSystem = {
  collectEvents: () => [],
};

const NOOP_TURN_ECONOMY_SYSTEM: TurnEconomySystem = {
  collectTurnStartEvents: () => [],
};

export class Engine {
  private readonly actionResolver: ActionResolver;
  private readonly turnManager: TurnManager;
  private readonly movementSystem: MovementSystem;
  private readonly combatSystem: CombatSystem;
  private readonly statusSystem: StatusSystem;
  private readonly turnEconomySystem: TurnEconomySystem;
  private readonly spatialQueries: SpatialQueries;

  constructor(
    actionResolver = new ActionResolver(),
    turnManager = new TurnManager(),
    movementSystem: MovementSystem = NOOP_MOVEMENT_SYSTEM,
    combatSystem: CombatSystem = NOOP_COMBAT_SYSTEM,
    statusSystem: StatusSystem = NOOP_STATUS_SYSTEM,
    turnEconomySystem: TurnEconomySystem = NOOP_TURN_ECONOMY_SYSTEM,
    spatialQueries: SpatialQueries = NOOP_SPATIAL_QUERIES,
  ) {
    this.actionResolver = actionResolver;
    this.turnManager = turnManager;
    this.movementSystem = movementSystem;
    this.combatSystem = combatSystem;
    this.statusSystem = statusSystem;
    this.turnEconomySystem = turnEconomySystem;
    this.spatialQueries = spatialQueries;
  }

  public applyAction(state: GameState, action: Action): StateTransitionResult {
    return this.step(state, action);
  }

  /**
   * Deterministic full-turn pipeline order:
   * 1) validate action
   * 2) resolve action effects into events
   * 3) apply movement/combat/status/economy system events
   * 4) reduce + append events
   * 5) advance phases via TurnManager-driven transitions
   */
  public step(state: GameState, command: Action): StateTransitionResult {
    if (!this.actionResolver.validateAction(state, command)) {
      return { state, events: [] };
    }

    const emittedEvents: GameEvent[] = [
      ...this.actionResolver.resolveActionEffects(state, command),
      ...this.spatialQueries.collectEvents(state, command),
      ...this.movementSystem.collectEvents(state, command, this.spatialQueries),
      ...this.combatSystem.collectEvents(state, command, this.spatialQueries),
      ...this.statusSystem.collectEvents(state, command),
    ];

    let nextState = appendEvents(reduceEvents(state, emittedEvents), emittedEvents);
    const transitionEvents: GameEvent[] = [];

    const transition = (current: GameState): GameState => {
      const result = this.turnManager.advancePhaseWithEvents(current);
      transitionEvents.push(...result.events);
      return result.state;
    };

    if (state.phase === 'COMMAND' && command.type === 'END_COMMAND') {
      nextState = transition(nextState); // COMMAND -> RESOLUTION
      nextState = transition(nextState); // RESOLUTION -> END_TURN
      nextState = transition(nextState); // END_TURN -> START_TURN (+TURN_STARTED)

      const economyEvents = this.turnEconomySystem.collectTurnStartEvents(nextState);
      if (economyEvents.length > 0) {
        emittedEvents.push(...economyEvents);
        nextState = appendEvents(reduceEvents(nextState, economyEvents), economyEvents);
      }

      nextState = transition(nextState); // START_TURN -> COMMAND
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
