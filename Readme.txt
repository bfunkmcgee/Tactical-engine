# Tactical Engine - Appearance Scaffolding

This repository includes a reusable, engine-level appearance scaffold for:
- Body archetypes and rig profiles
- Animation set binding
- Gear-driven visual layers
- Runtime appearance resolution with fallback warnings

## Files
- `src/appearance/types.ts`: Core data contracts
- `src/appearance/resolveAppearance.ts`: Deterministic appearance composer
- `src/appearance/index.ts`: Module exports
- `examples/appearance.example.json`: Example content pack snippet

## Design goals
1. Keep the rendering/gameplay decoupled.
2. Support many games by treating body/gear/animations as data.
3. Allow gear to alter appearance (including hidden slots and animation overrides).
4. Stay mobile-friendly by producing a flat resolved layer stack.

## Monorepo add-ons
- `packages/*` for engine + SDK modules
- `apps/*` for clients
- `games/*` for playable content packs
- `tools/*` for validation and automation scripts
