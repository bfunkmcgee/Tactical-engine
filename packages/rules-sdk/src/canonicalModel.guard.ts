import type { RuleEvaluationState, TeamId, UnitId } from '../../engine-core/state/SimulationContract';
import type { BattleState } from './RuleSet';
import type { TeamId as HookTeamId, UnitId as HookUnitId } from './hooks';

type IsExact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? ((<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2 ? true : false)
  : false;
type Assert<T extends true> = T;

type BattleStateMustUseCanonicalModel = Assert<IsExact<BattleState, RuleEvaluationState>>;
type UnitIdMustUseCanonicalModel = Assert<IsExact<HookUnitId, UnitId>>;
type TeamIdMustUseCanonicalModel = Assert<IsExact<HookTeamId, TeamId>>;

export type CanonicalModelGuards =
  | BattleStateMustUseCanonicalModel
  | UnitIdMustUseCanonicalModel
  | TeamIdMustUseCanonicalModel;
