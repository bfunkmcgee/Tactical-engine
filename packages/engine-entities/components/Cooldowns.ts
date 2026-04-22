export const COOLDOWNS_COMPONENT = 'Cooldowns' as const;

export interface Cooldowns {
  abilities: Record<string, number>;
}
