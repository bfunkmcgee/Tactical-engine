export type EntityId = string;

export type ComponentData = object;
export type CloneMode = 'deep' | 'shallow' | 'none';

export interface EntityStoreClonePolicy {
  /**
   * Clone strategy used when persisting component values through upsert/set.
   * Defaults to `deep`.
   */
  onWrite?: CloneMode;
  /**
   * Clone strategy used when returning component values through get calls.
   * Defaults to `deep`.
   */
  onRead?: CloneMode;
  /**
   * Clone strategy used when setComponent provides the current value to updater.
   * Defaults to the same mode as `onRead`.
   */
  onSetInput?: CloneMode;
}

export interface EntityStoreOptions {
  clonePolicy?: EntityStoreClonePolicy;
}

/**
 * ECS-style entity/component store that relies on stable string IDs.
 * Components are stored by value in per-component maps and are always
 * looked up by entity id to avoid direct object references.
 */
export class EntityStore {
  private entities = new Set<EntityId>();
  private componentStores = new Map<string, Map<EntityId, ComponentData>>();
  private clonePolicy: Required<EntityStoreClonePolicy>;

  constructor(options?: EntityStoreOptions) {
    const readMode = options?.clonePolicy?.onRead ?? 'deep';
    this.clonePolicy = {
      onRead: readMode,
      onWrite: options?.clonePolicy?.onWrite ?? 'deep',
      onSetInput: options?.clonePolicy?.onSetInput ?? readMode,
    };
  }

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
    store.set(entityId, this.cloneValue(data, this.clonePolicy.onWrite));
  }

  getComponent<T extends ComponentData>(
    componentName: string,
    entityId: EntityId,
  ): T | undefined {
    const data = this.componentStores.get(componentName)?.get(entityId);
    return data ? (this.cloneValue(data, this.clonePolicy.onRead) as T) : undefined;
  }

  setComponent<T extends ComponentData>(
    componentName: string,
    entityId: EntityId,
    updater: (current: T | undefined) => T | undefined,
  ): void {
    this.assertEntity(entityId);
    const store = this.getOrCreateComponentStore(componentName);
    const current = store.get(entityId) as T | undefined;
    const next = updater(
      current ? (this.cloneValue(current, this.clonePolicy.onSetInput) as T) : undefined,
    );

    if (next === undefined) {
      store.delete(entityId);
      return;
    }

    store.set(entityId, this.cloneValue(next, this.clonePolicy.onWrite));
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
      .map(([entityId, data]) => ({
        entityId,
        data: this.cloneValue(data, this.clonePolicy.onRead) as T,
      }));
  }

  private cloneValue<T extends ComponentData>(value: T, mode: CloneMode): T {
    if (mode === 'none') {
      return value;
    }

    if (mode === 'shallow') {
      if (Array.isArray(value)) {
        return [...value] as T;
      }

      return { ...value } as T;
    }

    return structuredClone(value);
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
