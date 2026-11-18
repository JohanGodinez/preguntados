# AGENTS.md

Preguntados: party trivia game (Trivial Pursuit–style). React 19 + Vite web client, **Sin servidor propio**: Supabase (Postgres + Realtime) es el backend. UI text is Spanish.

## Commands

- `pnpm dev` — Vite dev server only (no backend exists anymore).
- `pnpm lint` — ESLint (flat config; no type-aware rules).
- `pnpm build` — `tsc -b && vite build`.
- `pnpm preview` — serves the production build locally.

There are no tests. Verification = `pnpm lint` + `pnpm build`.

Requires `.env.local` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see `.env.example`). Without them the app renders "Falta configurar Supabase" instead of connecting.

## Architecture

**Host-authoritative, serverless.** The host's browser runs the game engine and writes state; everyone else subscribes via Supabase Realtime. There is no Node server.

- `src/game/engine.ts` — pure game logic (question picking, wheel, scoring, config sanitization). Takes the question bank as a parameter.
- `src/game/hostEngine.ts` — the engine driver that runs in the host's tab: applies transitions, validates player actions, persists every state change to `games.state` via the `update_game` RPC, and owns the 1s deadline ticker (replaces the old server timers).
- `src/store/roomStore.ts` — Zustand store: subscribes to realtime (`games`, `players` Postgres Changes + Presence channel), fetches initial snapshots, routes actions. Player actions (`player:answer`) are inserted into the `actions` table; the host consumes them. `PublicState` shown to views is **merged at read time**: `games.state` + `players` rows + presence (`online`, `hostOnline`) + `deadlineIn` derived from `deadlineAt`.
- `src/lib/catalog.ts` — categories + public questions (no `correct` column) fetched once per session for the Setup UI.
- `shared/protocol.ts` — single source of truth for all types (`PublicState`, `GameState`, `GameConfig`, DB row types). Client only; no server anymore.
- `supabase/schema.sql` — tables, RLS, RPCs, realtime publication. `supabase/seed.sql` — categories + 156 questions (regenerable, idempotent).

## Supabase rules (critical)

- Tokens: host/player tokens live in the `secrets` table — **no RLS policies, not in the realtime publication**; only `security definer` RPCs read them. Never move secrets into `games`/`players`: realtime sends **all columns** of rows in those tables to subscribers.
- `questions.correct` is never readable via REST (column-level grants). The host fetches the full bank via `get_questions(code, hostToken)` RPC. The shuffled option order lives in `state.active.options`; the correct index is `active.options.indexOf(bankQuestion.options[bankQuestion.correct])`.
- All writes to `games`/`players` go through RPCs (`create_game`, `update_game`, `resume_game`, `close_game`, `join_game`, `leave_game`, `set_team`, `get_questions`, `clear_actions`). Direct table writes are revoked for `anon`.
- RPC exceptions use `raise exception '<mensaje español>'` — the PostgREST `error.message` is shown directly in the UI.

## Conventions

- No path aliases; use relative imports (`../shared/protocol`).
- `erasableSyntaxOnly` is on in all tsconfigs: no enums or parameter properties; use plain types/objects.
- Styling is Tailwind v4 via the Vite plugin (no config file); theme tokens and custom colors live under `@theme` in `src/index.css`.
- Reconnection credentials: host in **sessionStorage** (`preguntados-host`), player in **localStorage** (`preguntados-player`); settings under `preguntados-ajustes`.
- If the host refreshes mid-spin, `pending` is lost (never persisted): `repairResumedState` resets `categoryId` so the host can re-spin.
- Hosting: static site on Netlify (`netlify.toml`: SPA redirect `/*` → `/index.html`). The QR encodes `window.location.origin`, so it works on any domain without LAN tricks.
