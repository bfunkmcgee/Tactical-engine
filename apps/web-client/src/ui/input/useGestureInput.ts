import { useMemo } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { createGestureHandlers } from './gestureController';
import type { GestureCallbacks } from './gestureController';

export function useGestureInput(callbacks: GestureCallbacks) {
  const handlers = useMemo(() => createGestureHandlers(callbacks), [callbacks]);

  return useMemo(
    () => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        handlers.onPointerDown({
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          setPointerCapture: (pointerId: number) => event.currentTarget.setPointerCapture(pointerId),
        });
      },
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
        handlers.onPointerMove({
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
        });
      },
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
        handlers.onPointerUp({
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
        });
      },
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
        handlers.onPointerCancel({
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
        });
      },
    }),
    [handlers]
  );
}
