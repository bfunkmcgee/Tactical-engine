export type EntityId = string;

export type ComponentData = object;

/**
 * ECS-style entity/component store that relies on stable string IDs.
 * Components are stored by value in per-component maps and are always
 * looked up by entity id to avoid direct object references.
 */
export class EntityStore {
  private entities = new Set<EntityId>();
  private componentStores = new Map<string, Map<EntityId, ComponentData>>();

  createEntity(entityId: EntityId): EntityId {
    if (this.entities.has(entityId)) {
      throw new Error(`Entity '${entityId}' already exists.`);
    }

    this.entities.add(entityId);
    return entityId;
  }

  hasEntity(entityId: EntityId): boolean {
    return this.entities.has(entityId);
  }

  removeEntity(entityId: EntityId): void {
    if (!this.entities.delete(entityId)) {
      return;
    }

    for (const store of this.componentStores.values()) {
      store.delete(entityId);
    }
  }

  getEntityIds(): EntityId[] {
    return [...this.entities].sort();
  }

  upsertComponent<T extends ComponentData>(
    componentName: string,
    entityId: EntityId,
    data: T,
  ): void {
    this.assertEntity(entityId);
    const store = this.getOrCreateComponentStore(componentName);
    store.set(entityId, structuredClone(data));
  }

  getComponent<T extends ComponentData>(
    componentName: string,
    entityId: EntityId,
  ): T | undefined {
    const data = this.componentStores.get(componentName)?.get(entityId);
    return data ? (structuredClone(data) as T) : undefined;
  }

  setComponent<T extends ComponentData>(
    componentName: string,
    entityId: EntityId,
    updater: (current: T | undefined) => T | undefined,
  ): void {
    this.assertEntity(entityId);
    const store = this.getOrCreateComponentStore(componentName);
    const current = store.get(entityId) as T | undefined;
    const next = updater(current ? (structuredClone(current) as T) : undefined);

    if (next === undefined) {
      store.delete(entityId);
      return;
    }

    store.set(entityId, structuredClone(next));
  }

  removeComponent(componentName: string, entityId: EntityId): void {
    this.componentStores.get(componentName)?.delete(entityId);
  }

  queryEntitiesWith(...componentNames: string[]): EntityId[] {
    if (componentNames.length === 0) {
      return this.getEntityIds();
    }

    return this.getEntityIds().filter((entityId) =>
      componentNames.every(
        (componentName) => this.componentStores.get(componentName)?.has(entityId) ?? false,
      ),
    );
  }

  getComponentEntries<T extends ComponentData>(
    componentName: string,
  ): Array<{ entityId: EntityId; data: T }> {
    const store = this.componentStores.get(componentName);
    if (!store) {
      return [];
    }

    return [...store.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([entityId, data]) => ({ entityId, data: structuredClone(data) as T }));
  }

  private getOrCreateComponentStore(componentName: string): Map<EntityId, ComponentData> {
    const existing = this.componentStores.get(componentName);
    if (existing) {
      return existing;
    }

    const created = new Map<EntityId, ComponentData>();
    this.componentStores.set(componentName, created);
    return created;
  }

  private assertEntity(entityId: EntityId): void {
    if (!this.entities.has(entityId)) {
      throw new Error(`Unknown entity '${entityId}'. Create it first.`);
    }
  }
}
