import type { Checkpoint, DeterministicReplayFile, GameEvent, JsonValue } from "../../persistence/src/index";

export interface ReplayCursor {
  turn: number;
  sequence: number;
}

export class ReplayController<TState extends JsonValue = JsonValue> {
  private readonly checkpoints: Checkpoint<TState>[];
  private readonly events: GameEvent[];
  private readonly reducer: (state: TState, event: GameEvent) => TState;
  private eventIndex = -1;
  private currentState: TState;

  constructor(replay: DeterministicReplayFile<TState>, reducer: (state: TState, event: GameEvent) => TState) {
    this.checkpoints = [...replay.checkpoints].sort((a, b) => a.turn - b.turn);
    this.events = [...replay.events].sort((a, b) => (a.turn === b.turn ? a.sequence - b.sequence : a.turn - b.turn));
    this.reducer = reducer;

    const startingCheckpoint = this.checkpoints.at(-1);

    if (!startingCheckpoint) {
      throw new Error("Replay file must include at least one checkpoint.");
    }

    this.currentState = startingCheckpoint.state;
  }

  stepForward(): TState {
    if (this.eventIndex + 1 >= this.events.length) {
      return this.currentState;
    }

    this.eventIndex += 1;
    this.currentState = this.reducer(this.currentState, this.events[this.eventIndex]);

    return this.currentState;
  }

  stepBackward(): TState {
    if (this.eventIndex < 0) {
      return this.currentState;
    }

    const target = this.eventIndex - 1;
    this.rebuildUntil(target);

    return this.currentState;
  }

  jumpTo(cursor: ReplayCursor): TState {
    const targetIndex = this.events.findIndex(
      (event) => event.turn === cursor.turn && event.sequence === cursor.sequence,
    );

    if (targetIndex === -1) {
      throw new Error(`Could not find replay event for ${cursor.turn}:${cursor.sequence}.`);
    }

    this.rebuildUntil(targetIndex);

    return this.currentState;
  }

  getState(): TState {
    return this.currentState;
  }

  private rebuildUntil(targetIndex: number): void {
    const checkpoint = this.checkpoints.at(-1);

    if (!checkpoint) {
      throw new Error("Replay file must include at least one checkpoint.");
    }

    this.currentState = checkpoint.state;
    this.eventIndex = -1;

    for (let index = 0; index <= targetIndex; index += 1) {
      this.currentState = this.reducer(this.currentState, this.events[index]);
      this.eventIndex = index;
    }
  }
}

export function serializeReplayFile<TState extends JsonValue = JsonValue>(
  replay: DeterministicReplayFile<TState>,
): string {
  return JSON.stringify(replay, null, 2);
}

export function parseReplayFile<TState extends JsonValue = JsonValue>(raw: string): DeterministicReplayFile<TState> {
  return JSON.parse(raw) as DeterministicReplayFile<TState>;
}
