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

**Creator-authoritative, serverless.** The room creator's browser runs the game engine and writes state; everyone else subscribes via Supabase Realtime. There is no Node server and no dedicated host screen: the creator also joins as a player.

- **Game flow:** `/crear` (setup + creator plays), `/unirse` (join by code/QR), `/host` or `/tablero?c=CODE` (optional spectator board; inserts a `next` action to skip the reveal).
- **Round flow:** the team in turn spins from its phone; after `SPIN_MS` the question is shown to both teams, who answer simultaneously (first answer per team sticks, `+10` per correct). The reveal lasts `REVEAL_MS` and auto-advances; tied leaders play sudden death until exactly one team answers correctly.
- `src/game/engine.ts` — pure game logic (question picking, wheel, scoring, config sanitization). Takes the question bank as a parameter.
- `src/game/hostEngine.ts` — the engine driver in the creator's tab: applies transitions, validates player actions, persists state to `games.state` via `update_game`, and owns the 1s ticker plus the spin/reveal timers.
- `src/store/roomStore.ts` — Zustand store: realtime subscriptions (`games`, `players`, `actions` Postgres Changes + Presence), snapshots, and action routing. `answer`/`spin`/`next` are INSERTs into `actions` consumed by the engine; `set_team` is an RPC. `PublicState` is **merged at read time**: `games.state` + `players` + presence (`online`, `hostOnline`) + `deadlineIn`/`advanceIn` derived from absolute timestamps. `answers`/`results` are arrays aligned with `config.teams`.
- `src/views/PlayView.tsx` — unified creator/player flow. `src/views/BoardView.tsx` + `src/components/BoardGame.tsx` — spectator board.
- `src/components/CategoryIcon.tsx` — lucide-react icon per category (fallback `CircleQuestionMark`); used in the wheel and Setup instead of text labels.
- `src/lib/catalog.ts` — categories + public questions (no `correct` column) fetched once per session for the Setup UI.
- `shared/protocol.ts` — single source of truth for all types (`PublicState`, `GameState`, `GameConfig`, DB row types, `PLAYER_ACTIONS`). Client only; no server anymore.
- `supabase/schema.sql` — tables, RLS, RPCs, realtime publication. `supabase/seed.sql` — categories + 156 questions (regenerable, idempotent).

## Supabase rules (critical)

- Tokens: host/player tokens live in the `secrets` table — **no RLS policies, not in the realtime publication**; only `security definer` RPCs read them. Never move secrets into `games`/`players`: realtime sends **all columns** of rows in those tables to subscribers.
- `questions.correct` is never readable via REST (column-level grants). The creator fetches the full bank via `get_questions(code, hostToken)` RPC. The shuffled option order lives in `state.active.options`; the correct index is `active.options.indexOf(bankQuestion.options[bankQuestion.correct])`. It is only put in `state.correctIndex` at the reveal.
- All writes to `games`/`players` go through RPCs (`create_game`, `update_game`, `resume_game`, `close_game`, `join_game`, `leave_game`, `set_team`, `get_questions`, `clear_actions`). Direct table writes are revoked for `anon`, except ephemeral INSERTs into `actions`.
- RPC exceptions use `raise exception '<mensaje español>'` — the PostgREST `error.message` is shown directly in the UI.

## Conventions

- No path aliases; use relative imports (`../shared/protocol`).
- `erasableSyntaxOnly` is on in all tsconfigs: no enums or parameter properties; use plain types/objects.
- Styling is Tailwind v4 via the Vite plugin (no config file); theme tokens and custom colors live under `@theme` in `src/index.css`.
- Reconnection credentials: host in **sessionStorage** (`preguntados-host`), player in **localStorage** (`preguntados-player`); settings under `preguntados-ajustes`.
- If the creator refreshes mid-spin, `pending` is lost (never persisted): `repairResumedState` resets `categoryId` so the team can spin again.
- The board never handles credentials or runs the engine: it calls `watch(code)` and may insert a `next` action with `player_id: 'tablero'`.
- Hosting: static site on Netlify (`netlify.toml`: SPA redirect `/*` → `/index.html`). The QR encodes `window.location.origin`, so it works on any domain without LAN tricks.
