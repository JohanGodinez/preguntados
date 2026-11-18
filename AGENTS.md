# AGENTS.md

Preguntados: local party trivia game (Trivial Pursuit–style). React 19 + Vite web client, Express + socket.io server, all TypeScript. UI text is Spanish.

## Commands

- `pnpm dev` — runs Vite dev server **and** the API server (`tsx watch server/index.ts`) via concurrently. Use this, not `vite` alone.
- `pnpm lint` — ESLint (flat config; no type-aware rules).
- `pnpm build` — `tsc -b && vite build`.
- `pnpm start` — builds, then serves the built `dist/` (with SPA fallback) from the API server on port 3001; startup logs the LAN URLs. `PORT` env var overrides the port.

There are no tests. Verification = `pnpm lint` + typecheck (below). All runtime imports (`express`, `socket.io`, `socket.io-client`, `qrcode.react`, …) must be declared in `package.json`: pnpm manages `node_modules` strictly, so running `pnpm add`/`pnpm install` prunes any package that is imported in code but not declared, and the app stops building.

## Typecheck gotcha (important)

- `tsc -b` (root `tsconfig.json`) only covers `src/` and `vite.config.ts`. **`server/` is not typechecked by `pnpm build`.**
- To typecheck the server, run: `npx tsc -p server/tsconfig.json` (its tsconfig is standalone and not referenced from the root).
- `tsx` runs the server without typechecking, so server type errors surface only with the command above.

## Architecture

- `server/` — socket.io server. `server/index.ts` (entry: binds port 3001 by default, serves `dist/` if it exists), `rooms.ts` (room lifecycle, socket handlers, reconnection tokens), `game.ts` (pure game logic: question picking, wheel categories, scoring).
- `src/` — React client. Zustand stores in `src/store/` (`roomStore` owns all server state; host credentials in sessionStorage under `preguntados-host`, player credentials in localStorage under `preguntados-player`; settings persisted under `preguntados-ajustes`).
- `shared/protocol.ts` — single source of truth for all socket event payloads (`PublicState`, `Ack`, event name constants). Client and server both import it; change protocol here, not inline.
- `src/data/questions.ts` — trivia question bank. **Imported by the server too** (`server/rooms.ts`), so it's not client-only; edits affect game logic on both sides.

## Conventions

- No path aliases; use relative imports (`../shared/protocol`, `../src/data/questions`).
- Socket communication is request/ack based: client uses the `emit()` helper in `src/lib/socket.ts` (8s timeout, resolves an `Ack` with `ok`/`error`). Server handlers must call `callback` with an `Ack`-shaped object. Server broadcasts authoritative `PublicState` on the `state` event; client never derives game state locally.
- In dev, the client connects through the Vite proxy (`/socket.io` → `localhost:3001`), so the server port is fixed unless `vite.config.ts` is updated too.
- Styling is Tailwind v4 via the Vite plugin (no config file); theme tokens and custom colors are defined with `@theme` in `src/index.css`.
- `erasableSyntaxOnly` is on in all tsconfigs: no enums or parameter properties; use plain types/objects.
