export const STATUS_EFFECTS_COMPONENT = 'StatusEffects' as const;

export type StackingPolicy = 'refresh' | 'replace' | 'stack';

export type EffectModifier =
  | {
      type: 'statDelta';
      stat: 'attack' | 'defense' | 'speed';
      amount: number;
    }
  | {
      type: 'dot';
      amountPerTurn: number;
    }
  | {
      type: 'hot';
      amountPerTurn: number;
    };

export interface TimedEffect {
  effectId: string;
  sourceEntityId?: string;
  durationTurns: number;
  remainingTurns: number;
  stackingPolicy: StackingPolicy;
  maxStacks?: number;
  stacks: number;
  priority: number;
  appliedAtTick: number;
  modifiers: EffectModifier[];
}

export interface StatusEffects {
  effects: TimedEffect[];
}
