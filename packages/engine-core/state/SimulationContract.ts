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
  readonly actionPoints?: number;
  readonly maxActionPoints?: number;
  readonly cooldowns?: Readonly<Record<string, number>>;
  readonly position?: Position;
  readonly statusEffectIds?: readonly string[];
}

export interface EndCommandActionPayload {
  readonly reason?: string;
}

export interface AttackActionPayload {
  readonly sourceUnitId?: UnitId;
  readonly targetId: UnitId;
  readonly amount?: number;
  readonly abilityId?: string;
}

export interface MoveActionPayload {
  readonly unitId: UnitId;
  readonly to: Position;
  readonly actionPointCost?: number;
}

export interface UseAbilityActionPayload {
  readonly unitId: UnitId;
  readonly abilityId: string;
  readonly targetId?: UnitId;
}

export interface UseItemActionPayload {
  readonly unitId: UnitId;
  readonly itemId: string;
  readonly targetId?: UnitId;
}

export interface ApplyStatusActionPayload {
  readonly sourceUnitId?: UnitId;
  readonly targetId: UnitId;
  readonly statusId: string;
  readonly duration?: number;
}

export interface PassActionPayload {
  readonly phase?: Phase;
}

export type ActionType = 'END_COMMAND' | 'ATTACK' | 'MOVE' | 'USE_ABILITY' | 'USE_ITEM' | 'APPLY_STATUS' | 'PASS';

export type ActionPayload =
  | EndCommandActionPayload
  | AttackActionPayload
  | MoveActionPayload
  | UseAbilityActionPayload
  | UseItemActionPayload
  | ApplyStatusActionPayload
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
      readonly kind: 'UNIT_MOVED';
      readonly unitId: UnitId;
      readonly from: Position;
      readonly to: Position;
      readonly turn: number;
      readonly round: number;
    }
  | {
      readonly kind: 'UNIT_DAMAGED';
      readonly sourceId: TeamId;
      readonly sourceUnitId?: UnitId;
      readonly targetId: UnitId;
      readonly amount: number;
      readonly abilityId?: string;
      readonly turn: number;
      readonly round: number;
    }
  | {
      readonly kind: 'ABILITY_USED';
      readonly unitId: UnitId;
      readonly abilityId: string;
      readonly targetId?: UnitId;
      readonly turn: number;
      readonly round: number;
    }
  | {
      readonly kind: 'ITEM_USED';
      readonly unitId: UnitId;
      readonly itemId: string;
      readonly targetId?: UnitId;
      readonly turn: number;
      readonly round: number;
    }
  | {
      readonly kind: 'UNIT_DEFEATED';
      readonly sourceId?: TeamId;
      readonly sourceUnitId?: UnitId;
      readonly targetId: UnitId;
      readonly turn: number;
      readonly round: number;
    }
  | {
      readonly kind: 'STATUS_APPLIED';
      readonly sourceUnitId?: UnitId;
      readonly targetId: UnitId;
      readonly statusId: string;
      readonly duration: number;
      readonly turn: number;
      readonly round: number;
    }
  | {
      readonly kind: 'ACTION_POINTS_CHANGED';
      readonly unitId: UnitId;
      readonly from: number;
      readonly to: number;
      readonly reason: 'MOVE' | 'ATTACK' | 'TURN_START' | 'EFFECT';
      readonly turn: number;
      readonly round: number;
    }
  | {
      readonly kind: 'COOLDOWN_TICKED';
      readonly unitId: UnitId;
      readonly abilityId: string;
      readonly from: number;
      readonly to: number;
      readonly turn: number;
      readonly round: number;
    }
  | {
      readonly kind: 'INTEGRITY_VIOLATION';
      readonly invariant: string;
      readonly detail: string;
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
