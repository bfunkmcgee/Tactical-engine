# persistence

Persistence primitives for storing tactical-engine game progression:

- Full-state checkpoints for fast restore points.
- Incremental event stream for deterministic rebuilds.
- Migration versioning for forward-compatible save snapshots.

## Core APIs

- `MigrationRegistry` for migration registration and save upgrades.
- `SnapshotEventStore` for checkpoint+event ingestion.
- `exportReplayFile(seed)` for bug-report reproducibility payloads.
