import type { Action, GameEvent, GameState, UnitState } from '../../state/GameState';
import type { ActionValidationResult } from '../ActionResolver';

export interface NormalizedActionResult {
  readonly action: Action;
  readonly actorUnit?: UnitState;
  readonly targetUnit?: UnitState;
}

export interface PayloadValidationStage {
  validate(state: GameState, action: Action, legalActions: Action[]): ActionValidationResult;
}

export interface LegalActionMatchStage {
  matches(action: Action, legalActions: Action[], normalizedPayload: unknown): boolean;
}

export interface SpatialChecksStage {
  validate(state: GameState, action: Action): ActionValidationResult;
  resolveUnits(state: GameState, action: Action): Pick<NormalizedActionResult, 'actorUnit' | 'targetUnit'>;
}

export interface ResourceChecksStage {
  build(params: { action: Action; actorUnit?: UnitState; turn: number; round: number }): GameEvent[];
}

export interface EventAssemblyStage {
  build(state: GameState, action: Action): GameEvent[];
}

export interface ActionTypeHandler {
  readonly type: Action['type'];
  validate(state: GameState, action: Action, legalActions: Action[]): ActionValidationResult;
  normalize(state: GameState, action: Action): NormalizedActionResult;
  buildEffects(state: GameState, normalized: NormalizedActionResult): GameEvent[];
}
