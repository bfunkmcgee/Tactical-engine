import type { EngineActionView } from '../state/presentationStore';
import type { Action } from 'engine-core';

type HUDPanelProps = {
  selected?: string;
  phase: string;
  turn: number;
  round: number;
  activeActorId: string;
  matchStatus: 'IN_PROGRESS' | 'ENDED';
  winnerTeamId?: string;
  isDraw: boolean;
  feedback: string[];
  legalActions: EngineActionView[];
  onAction: (action: Action) => void;
};

export function HUDPanel({
  selected,
  phase,
  turn,
  round,
  activeActorId,
  matchStatus,
  winnerTeamId,
  isDraw,
  feedback,
  legalActions,
  onAction,
}: HUDPanelProps) {
  return (
    <section className="hud-panel" aria-label="Action panel">
      <div className="hud-meta">
        <p>{selected ? `Selected: ${selected}` : 'No unit selected'}</p>
        <small>{`Round ${round} · Turn ${turn} · ${phase} · ${activeActorId}`}</small>
        {matchStatus === 'ENDED' ? <small>{isDraw ? 'Result: Draw' : `Winner: ${winnerTeamId ?? 'Unknown'}`}</small> : null}
      </div>
      <div className="hud-actions">
        {matchStatus === 'ENDED' ? (
          <small>Match ended. Actions are disabled.</small>
        ) : legalActions.length > 0 ? (
          legalActions.map((action) => (
            <button key={action.command.id} className="hud-button" onClick={() => onAction(action.command)}>
              {action.label}
            </button>
          ))
        ) : (
          <small>Select the active unit to see legal actions.</small>
        )}
      </div>
      <div className="hud-meta">
        <small>{feedback[feedback.length - 1] ?? 'Tap to select. Long-press to inspect.'}</small>
      </div>
    </section>
  );
}
