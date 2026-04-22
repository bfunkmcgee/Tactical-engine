export type UnitId = string;
export type TeamId = string;
export type AbilityId = string;

export interface LifecycleContext {
  turn: number;
  activeTeamId: TeamId;
}

export interface TurnStartEvent extends LifecycleContext {
  unitIds: UnitId[];
}

export interface DamageEvent extends LifecycleContext {
  sourceUnitId: UnitId;
  targetUnitId: UnitId;
  abilityId?: AbilityId;
  amount: number;
}

export interface UnitDefeatedEvent extends LifecycleContext {
  sourceUnitId?: UnitId;
  unitId: UnitId;
}

export interface StatusAppliedEvent extends LifecycleContext {
  sourceUnitId?: UnitId;
  targetUnitId: UnitId;
  statusId: string;
  duration: number;
}

export interface RuleHooks {
  onTurnStart?(event: TurnStartEvent): void;
  onDamage?(event: DamageEvent): void;
  onUnitDefeated?(event: UnitDefeatedEvent): void;
  onStatusApplied?(event: StatusAppliedEvent): void;
}
