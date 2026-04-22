export const ACTION_POINTS_COMPONENT = 'ActionPoints' as const;

export interface ActionPoints {
  current: number;
  max: number;
  regenPerTurn: number;
}
