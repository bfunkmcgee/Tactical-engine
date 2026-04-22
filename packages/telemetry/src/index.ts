export type TelemetryEventName =
  | "action_pick"
  | "match_result"
  | "turn_duration"
  | "ability_usage";

export interface TelemetryEvent<TPayload = Record<string, unknown>> {
  name: TelemetryEventName;
  emittedAt: string;
  payload: TPayload;
}

export interface TelemetrySink {
  send(event: TelemetryEvent): void;
}

export class MemoryTelemetrySink implements TelemetrySink {
  readonly events: TelemetryEvent[] = [];

  send(event: TelemetryEvent): void {
    this.events.push(event);
  }
}

export class TelemetryTracker {
  constructor(private readonly sink: TelemetrySink) {}

  trackActionPick(playerId: string, actionId: string, turn: number): void {
    this.emit("action_pick", { playerId, actionId, turn });
  }

  trackMatchResult(matchId: string, outcome: "win" | "loss", turnsPlayed: number): void {
    this.emit("match_result", { matchId, outcome, turnsPlayed });
  }

  trackTurnDuration(turn: number, durationMs: number): void {
    this.emit("turn_duration", { turn, durationMs });
  }

  trackAbilityUsage(actorId: string, abilityId: string, targetIds: string[]): void {
    this.emit("ability_usage", { actorId, abilityId, targetIds });
  }

  private emit(name: TelemetryEventName, payload: Record<string, unknown>): void {
    this.sink.send({
      name,
      payload,
      emittedAt: new Date().toISOString(),
    });
  }
}
