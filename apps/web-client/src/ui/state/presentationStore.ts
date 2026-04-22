import { useMemo, useState } from 'react';

export type Entity = {
  id: string;
  x: number;
  y: number;
  color: string;
};

export type ViewState = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export type EngineSnapshot = {
  tick: number;
  entities: Entity[];
  selection?: string;
  lastInspection?: string;
  view: ViewState;
};

const seededEntities: Entity[] = Array.from({ length: 80 }, (_, i) => ({
  id: `unit-${i + 1}`,
  x: (i % 16) * 56,
  y: Math.floor(i / 16) * 56,
  color: i % 2 === 0 ? '#22c55e' : '#eab308',
}));

export function usePresentationStore() {
  const [snapshot, setSnapshot] = useState<EngineSnapshot>({
    tick: 0,
    entities: seededEntities,
    selection: undefined,
    lastInspection: undefined,
    view: { zoom: 1, offsetX: 0, offsetY: 0 },
  });

  const actions = useMemo(
    () => ({
      selectTile: (x: number, y: number) => {
        const found = snapshot.entities.find(
          (entity) => Math.abs(entity.x - x) < 24 && Math.abs(entity.y - y) < 24
        );
        setSnapshot((prev) => ({ ...prev, selection: found?.id }));
      },
      pan: (dx: number, dy: number) => {
        setSnapshot((prev) => ({
          ...prev,
          view: {
            ...prev.view,
            offsetX: prev.view.offsetX + dx,
            offsetY: prev.view.offsetY + dy,
          },
        }));
      },
      zoom: (factor: number) => {
        setSnapshot((prev) => ({
          ...prev,
          view: {
            ...prev.view,
            zoom: Math.min(3, Math.max(0.6, prev.view.zoom * factor)),
          },
        }));
      },
      inspect: (x: number, y: number) => {
        setSnapshot((prev) => ({
          ...prev,
          lastInspection: `Inspect @ (${Math.round(x)}, ${Math.round(y)})`,
        }));
      },
      triggerAction: (action: string) => {
        setSnapshot((prev) => ({ ...prev, tick: prev.tick + 1, lastInspection: `Action: ${action}` }));
      },
    }),
    [snapshot.entities]
  );

  return { snapshot, actions };
}
