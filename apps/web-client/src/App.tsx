import { useEffect, useState } from 'react';
import type { ScenarioRuntime } from 'rules-sdk';
import { BoardCanvas } from './ui/board/BoardCanvas';
import { HUDPanel } from './ui/hud/HUDPanel';
import { useGestureInput } from './ui/input/useGestureInput';
import { usePresentationStore } from './ui/state/presentationStore';

export type LayoutClass = 'layout-desktop' | 'layout-tablet' | 'layout-mobile';

type LayoutMedia = {
  desktop: MediaQueryList;
  tablet: MediaQueryList;
};

export function resolveLayoutClass(media: LayoutMedia): LayoutClass {
  if (media.desktop.matches) {
    return 'layout-desktop';
  }

  if (media.tablet.matches) {
    return 'layout-tablet';
  }

  return 'layout-mobile';
}

export function subscribeLayoutClass(
  matchMediaFn: (query: string) => MediaQueryList,
  onChange: (layoutClass: LayoutClass) => void,
): () => void {
  const media = {
    desktop: matchMediaFn('(min-width: 1200px)'),
    tablet: matchMediaFn('(min-width: 768px)'),
  };

  const emit = () => onChange(resolveLayoutClass(media));
  const listener = () => emit();

  media.desktop.addEventListener('change', listener);
  media.tablet.addEventListener('change', listener);
  emit();

  return () => {
    media.desktop.removeEventListener('change', listener);
    media.tablet.removeEventListener('change', listener);
  };
}

export function App({ scenarioRuntime }: { scenarioRuntime: ScenarioRuntime }) {
  const { snapshot, actions } = usePresentationStore(scenarioRuntime);
  const gestureHandlers = useGestureInput({
    onTap: actions.selectTile,
    onDrag: actions.pan,
    onPinch: actions.zoom,
    onLongPress: actions.inspect,
  });

  const [layoutClass, setLayoutClass] = useState<LayoutClass>('layout-mobile');

  useEffect(() => subscribeLayoutClass(window.matchMedia.bind(window), setLayoutClass), []);

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
        matchStatus={snapshot.matchStatus}
        winnerTeamId={snapshot.winnerTeamId}
        isDraw={snapshot.isDraw}
        legalActions={snapshot.selectedLegalActions}
        feedback={snapshot.feedback}
        onAction={actions.triggerAction}
      />
    </div>
  );
}
