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
1. Keep rendering and gameplay decoupled.
2. Support many games by treating body, gear, and animations as data.
3. Allow gear to alter appearance (including hidden slots and animation overrides).
4. Stay mobile-friendly by producing a flat resolved layer stack.

## Local setup

### Prerequisites
- Node.js 20+
- npm 10+

### Install dependencies
From repository root:

```bash
npm ci
npm install --prefix apps/web-client
```

### Build
Build all workspace packages/apps:

```bash
npm run build
```

### Run CI-equivalent checks locally
Typecheck/test gate used by CI:

```bash
npm run ci
```

### Web client only (optional)
Install and run just the Vite app from `apps/web-client`:

```bash
npm install --prefix apps/web-client
npm run dev --prefix apps/web-client
```
