type HUDPanelProps = {
  selected?: string;
  lastInspection?: string;
  onAction: (action: string) => void;
};

const ACTIONS = ['Move', 'Attack', 'Guard', 'Wait'];

export function HUDPanel({ selected, lastInspection, onAction }: HUDPanelProps) {
  return (
    <section className="hud-panel" aria-label="Action panel">
      <div className="hud-meta">
        <p>{selected ? `Selected: ${selected}` : 'No unit selected'}</p>
        <small>{lastInspection ?? 'Long-press to inspect tile/unit'}</small>
      </div>
      <div className="hud-actions">
        {ACTIONS.map((action) => (
          <button key={action} className="hud-button" onClick={() => onAction(action)}>
            {action}
          </button>
        ))}
      </div>
    </section>
  );
}
