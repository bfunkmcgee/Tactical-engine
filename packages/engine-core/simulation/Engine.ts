import { ActionResolver } from './ActionResolver';
import { TurnManager } from './TurnManager';
import type { Action, GameState, StateTransitionResult } from '../state/GameState';

export class Engine {
  private readonly actionResolver: ActionResolver;
  private readonly turnManager: TurnManager;

  constructor(actionResolver = new ActionResolver(), turnManager = new TurnManager()) {
    this.actionResolver = actionResolver;
    this.turnManager = turnManager;
  }

  public applyAction(state: GameState, action: Action): StateTransitionResult {
    return this.actionResolver.applyAction(state, action);
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

export function getLegalActions(state: GameState, actorId: string): Action[] {
  return defaultEngine.getLegalActions(state, actorId);
}

export function advancePhase(state: GameState): GameState {
  return defaultEngine.advancePhase(state);
}
