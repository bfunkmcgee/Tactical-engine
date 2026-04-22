import { useMemo } from 'react';
import { BoardCanvas } from './ui/board/BoardCanvas';
import { HUDPanel } from './ui/hud/HUDPanel';
import { useGestureInput } from './ui/input/useGestureInput';
import { usePresentationStore } from './ui/state/presentationStore';

export function App() {
  const { snapshot, actions } = usePresentationStore();
  const gestureHandlers = useGestureInput({
    onTap: actions.selectTile,
    onDrag: actions.pan,
    onPinch: actions.zoom,
    onLongPress: actions.inspect,
  });

  const layoutClass = useMemo(() => {
    if (window.matchMedia('(min-width: 1200px)').matches) {
      return 'layout-desktop';
    }
    if (window.matchMedia('(min-width: 768px)').matches) {
      return 'layout-tablet';
    }
    return 'layout-mobile';
  }, []);

  return (
    <div className={`app-shell ${layoutClass}`}>
      <main className="board-stage" {...gestureHandlers}>
        <BoardCanvas viewState={snapshot.view} entities={snapshot.entities} />
      </main>
      <HUDPanel
        selected={snapshot.selection}
        phase={snapshot.phase}
        turn={snapshot.turn}
        round={snapshot.round}
        activeActorId={snapshot.activeActorId}
        legalActions={snapshot.selectedLegalActions}
        feedback={snapshot.feedback}
        onAction={actions.triggerAction}
      />
    </div>
  );
}
