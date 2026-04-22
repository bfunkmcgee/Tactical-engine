export type UnitId = string;
export type TeamId = string;

export type Phase = 'START_TURN' | 'COMMAND' | 'RESOLUTION' | 'END_TURN';

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface SimulationUnit {
  readonly id: UnitId;
  readonly teamId: TeamId;
  readonly definitionId?: string;
  readonly health: number;
  readonly maxHealth?: number;
  readonly position?: Position;
  readonly statusEffectIds?: readonly string[];
}

export interface EndCommandActionPayload {
  readonly reason?: string;
}

export interface AttackActionPayload {
  readonly targetId: UnitId;
  readonly amount?: number;
  readonly abilityId?: string;
}

export interface PassActionPayload {
  readonly phase?: Phase;
}

export type ActionType = 'END_COMMAND' | 'ATTACK' | 'PASS';

export type ActionPayload =
  | EndCommandActionPayload
  | AttackActionPayload
  | PassActionPayload
  | undefined;

export interface SimulationAction {
  readonly id: string;
  readonly actorId: TeamId;
  readonly type: ActionType;
  readonly payload?: ActionPayload;
}

export type SimulationEvent =
  | {
      readonly kind: 'PHASE_ADVANCED';
      readonly from: Phase;
      readonly to: Phase;
      readonly turn: number;
      readonly round: number;
    }
  | {
      readonly kind: 'TURN_STARTED';
      readonly actorId: TeamId;
      readonly turn: number;
      readonly round: number;
    }
  | {
      readonly kind: 'ACTION_APPLIED';
      readonly action: SimulationAction;
      readonly turn: number;
      readonly round: number;
    }
  | {
      readonly kind: 'UNIT_DAMAGED';
      readonly sourceId: TeamId;
      readonly targetId: UnitId;
      readonly amount: number;
      readonly turn: number;
      readonly round: number;
    };

export interface RuleEvaluationState {
  readonly turn: number;
  readonly round?: number;
  readonly activeTeamId: TeamId;
  readonly phase: Phase;
  readonly mapId: string;
  readonly units: readonly SimulationUnit[];
}
