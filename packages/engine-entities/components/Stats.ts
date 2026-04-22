export const STATS_COMPONENT = 'Stats' as const;

export interface Stats {
  maxHp: number;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
}
