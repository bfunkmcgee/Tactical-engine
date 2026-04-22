type GestureCallbacks = {
  onTap: (x: number, y: number) => void;
  onDrag: (dx: number, dy: number) => void;
  onPinch: (factor: number) => void;
  onLongPress: (x: number, y: number) => void;
};

type PointerLikeEvent = {
  pointerId: number;
  clientX: number;
  clientY: number;
  setPointerCapture: (pointerId: number) => void;
};

type TimerApi = {
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (timerId: number) => void;
};

const TAP_MAX_DISTANCE = 8;
const LONG_PRESS_DELAY_MS = 450;
const LONG_PRESS_CANCEL_DISTANCE = 4;

export function createGestureHandlers(callbacks: GestureCallbacks, timerApi: TimerApi = window) {
  const activeTouches = new Map<number, { clientX: number; clientY: number }>();
  let lastDrag: { x: number; y: number } | null = null;
  let pointerDownPosition: { x: number; y: number } | null = null;
  let longPressTimer: number | null = null;
  let pinchBaseline: number | null = null;
  let pinchActive = false;

  const clearLongPressTimer = () => {
    if (longPressTimer !== null) {
      timerApi.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  return {
    onPointerDown: (event: PointerLikeEvent) => {
      event.setPointerCapture(event.pointerId);
      activeTouches.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
      lastDrag = { x: event.clientX, y: event.clientY };
      pointerDownPosition = { x: event.clientX, y: event.clientY };

      if (activeTouches.size > 1) {
        pinchActive = true;
        clearLongPressTimer();
        return;
      }

      longPressTimer = timerApi.setTimeout(() => {
        callbacks.onLongPress(event.clientX, event.clientY);
      }, LONG_PRESS_DELAY_MS);
    },
    onPointerMove: (event: Omit<PointerLikeEvent, 'setPointerCapture'>) => {
      activeTouches.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });

      if (activeTouches.size === 2) {
        pinchActive = true;
        clearLongPressTimer();

        const [a, b] = Array.from(activeTouches.values());
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (!pinchBaseline) {
          pinchBaseline = distance;
          return;
        }
        if (pinchBaseline > 0) {
          callbacks.onPinch(distance / pinchBaseline);
        }
        pinchBaseline = distance;
        return;
      }

      if (pointerDownPosition) {
        const movementFromDownPoint = Math.hypot(
          event.clientX - pointerDownPosition.x,
          event.clientY - pointerDownPosition.y
        );
        if (movementFromDownPoint > LONG_PRESS_CANCEL_DISTANCE) {
          clearLongPressTimer();
        }
      }

      if (lastDrag) {
        const dx = event.clientX - lastDrag.x;
        const dy = event.clientY - lastDrag.y;
        callbacks.onDrag(dx, dy);
        lastDrag = { x: event.clientX, y: event.clientY };
      }
    },
    onPointerUp: (event: Omit<PointerLikeEvent, 'setPointerCapture'>) => {
      clearLongPressTimer();
      activeTouches.delete(event.pointerId);
      if (activeTouches.size === 0) {
        pinchBaseline = null;
        if (!pinchActive && pointerDownPosition) {
          const tapDistance = Math.hypot(
            event.clientX - pointerDownPosition.x,
            event.clientY - pointerDownPosition.y
          );
          if (tapDistance < TAP_MAX_DISTANCE) {
            callbacks.onTap(event.clientX, event.clientY);
          }
        }
        pinchActive = false;
        pointerDownPosition = null;
        lastDrag = null;
      }
    },
    onPointerCancel: (event: Omit<PointerLikeEvent, 'setPointerCapture'>) => {
      activeTouches.delete(event.pointerId);
      lastDrag = null;
      pointerDownPosition = null;
      pinchBaseline = null;
      pinchActive = false;
      clearLongPressTimer();
    },
  };
}

export type { GestureCallbacks };
