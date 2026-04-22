# replay

Replay primitives for deterministic event-log playback and debugger controls.

## Features

- `ReplayController` with `stepForward`, `stepBackward`, and `jumpTo` controls.
- JSON serialization helpers for exportable bug-report replay files.
- Works with snapshot+event payloads exported by `@tactical-engine/persistence`.
