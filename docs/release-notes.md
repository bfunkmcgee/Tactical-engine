# Release Notes

## 2026-04-29

- `engine-core`: completed the `Engine` constructor migration to a single `EngineOptions` object contract (`new Engine(options?)`).
- The legacy positional constructor overload has been removed after deprecation and internal/test migrations.
- Added compile-time type assertions to prevent reintroduction of positional constructor usage.
