export interface InspectorEntity {
  id: string;
  components: Record<string, unknown>;
}

export interface RuleTriggerEvent {
  rule: string;
  reason: string;
  turn: number;
}

export interface InspectorSnapshot {
  selectedEntity?: InspectorEntity;
  entitiesInView: InspectorEntity[];
  recentRuleTriggers: RuleTriggerEvent[];
}

export class DevInspectorOverlay {
  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.classList.add("dev-inspector");
  }

  render(snapshot: InspectorSnapshot): void {
    this.root.innerHTML = `
      <section class="dev-inspector__panel">
        <h2>Dev Inspector</h2>
        <p><strong>Entities:</strong> ${snapshot.entitiesInView.length}</p>
        <p><strong>Selected:</strong> ${snapshot.selectedEntity?.id ?? "none"}</p>
        <h3>Components</h3>
        <pre>${JSON.stringify(snapshot.selectedEntity?.components ?? {}, null, 2)}</pre>
        <h3>Recent Rule Triggers</h3>
        <pre>${JSON.stringify(snapshot.recentRuleTriggers, null, 2)}</pre>
      </section>
    `;
  }
}
