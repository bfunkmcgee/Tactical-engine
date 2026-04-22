import { useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';


type GestureCallbacks = {
  onTap: (x: number, y: number) => void;
  onDrag: (dx: number, dy: number) => void;
  onPinch: (factor: number) => void;
  onLongPress: (x: number, y: number) => void;
};

export function useGestureInput(callbacks: GestureCallbacks) {
  const activeTouches = useRef<Map<number, ReactPointerEvent<HTMLElement>['nativeEvent']>>(new Map());
  const lastDrag = useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const pinchBaseline = useRef<number | null>(null);

  return useMemo(
    () => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        activeTouches.current.set(event.pointerId, event.nativeEvent);
        lastDrag.current = { x: event.clientX, y: event.clientY };

        longPressTimer.current = window.setTimeout(() => {
          callbacks.onLongPress(event.clientX, event.clientY);
        }, 450);
      },
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
        activeTouches.current.set(event.pointerId, event.nativeEvent);
        if (activeTouches.current.size === 2) {
          const [a, b] = Array.from(activeTouches.current.values());
          const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          if (!pinchBaseline.current) {
            pinchBaseline.current = distance;
            return;
          }
          if (pinchBaseline.current > 0) {
            callbacks.onPinch(distance / pinchBaseline.current);
          }
          pinchBaseline.current = distance;
          return;
        }

        if (lastDrag.current) {
          const dx = event.clientX - lastDrag.current.x;
          const dy = event.clientY - lastDrag.current.y;
          callbacks.onDrag(dx, dy);
          lastDrag.current = { x: event.clientX, y: event.clientY };
        }
      },
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
        if (longPressTimer.current) {
          window.clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        activeTouches.current.delete(event.pointerId);
        if (activeTouches.current.size === 0) {
          pinchBaseline.current = null;
          if (lastDrag.current && Math.hypot(event.clientX - lastDrag.current.x, event.clientY - lastDrag.current.y) < 8) {
            callbacks.onTap(event.clientX, event.clientY);
          }
          lastDrag.current = null;
        }
      },
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
        activeTouches.current.delete(event.pointerId);
        lastDrag.current = null;
        pinchBaseline.current = null;
        if (longPressTimer.current) {
          window.clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      },
    }),
    [callbacks]
  );
}
