export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface Checkpoint<TState extends JsonValue = JsonValue> {
  id: string;
  turn: number;
  createdAt: string;
  migrationVersion: number;
  state: TState;
}

export interface GameEvent<TPayload extends JsonValue = JsonValue> {
  id: string;
  turn: number;
  sequence: number;
  createdAt: string;
  type: string;
  payload: TPayload;
}

export interface Migration {
  version: number;
  description: string;
  up(state: JsonValue): JsonValue;
}

export class MigrationRegistry {
  private readonly migrations = new Map<number, Migration>();

  register(migration: Migration): void {
    if (this.migrations.has(migration.version)) {
      throw new Error(`Migration version ${migration.version} already registered.`);
    }

    this.migrations.set(migration.version, migration);
  }

  latestVersion(): number {
    return [...this.migrations.keys()].sort((a, b) => a - b).at(-1) ?? 0;
  }

  migrate(state: JsonValue, fromVersion: number, toVersion = this.latestVersion()): JsonValue {
    if (fromVersion > toVersion) {
      throw new Error(`Cannot migrate backwards from ${fromVersion} to ${toVersion}.`);
    }

    let currentState = state;
    const ordered = [...this.migrations.values()].sort((a, b) => a.version - b.version);

    for (const migration of ordered) {
      if (migration.version > fromVersion && migration.version <= toVersion) {
        currentState = migration.up(currentState);
      }
    }

    return currentState;
  }
}

export class SnapshotEventStore<TState extends JsonValue = JsonValue> {
  private readonly checkpoints: Checkpoint<TState>[] = [];
  private readonly events: GameEvent[] = [];

  saveCheckpoint(checkpoint: Checkpoint<TState>): void {
    this.checkpoints.push(checkpoint);
  }

  appendEvent(event: GameEvent): void {
    this.events.push(event);
  }

  latestCheckpoint(): Checkpoint<TState> | undefined {
    return this.checkpoints.sort((a, b) => b.turn - a.turn).at(0);
  }

  eventsSinceTurn(turn: number): GameEvent[] {
    return this.events
      .filter((event) => event.turn >= turn)
      .sort((a, b) => (a.turn === b.turn ? a.sequence - b.sequence : a.turn - b.turn));
  }

  loadState(reducer: (state: TState, event: GameEvent) => TState): TState | undefined {
    const checkpoint = this.latestCheckpoint();

    if (!checkpoint) {
      return undefined;
    }

    return this.eventsSinceTurn(checkpoint.turn).reduce(reducer, checkpoint.state);
  }

  exportReplayFile(seed: number): DeterministicReplayFile<TState> {
    return {
      schemaVersion: 1,
      seed,
      checkpoints: [...this.checkpoints],
      events: [...this.events],
      exportedAt: new Date().toISOString(),
    };
  }
}

export interface DeterministicReplayFile<TState extends JsonValue = JsonValue> {
  schemaVersion: number;
  seed: number;
  checkpoints: Checkpoint<TState>[];
  events: GameEvent[];
  exportedAt: string;
}
