# Preguntados

Juego de trivia por equipos estilo Preguntados (party game). React 19 + Vite + Tailwind v4, con Supabase (Postgres + Realtime) como backend: sin servidor propio.

## Arquitectura

- **Frontend (Netlify):** la app React completa. El navegador del **host** corre el motor del juego (`src/game/hostEngine.ts`) y persiste el estado en la tabla `games`.
- **Supabase Realtime:** los demás clientes reciben el estado por Postgres Changes (`games`, `players`) y reportan presencias (`online`) por canales de Presence. Las acciones de jugadores (`player:answer`) llegan al host vía la tabla `actions`.
- **Seguridad:** los tokens secretos viven en la tabla `secrets` (invisible por API, no está en la publication de realtime). La columna `questions.correct` solo la lee el host vía la RPC `get_questions`.
- **Protocolo:** `shared/protocol.ts` es la fuente de verdad de los tipos (`PublicState`, `GameState`, `GameConfig`).

## Puesta en marcha

### 1. Supabase

1. Creá un proyecto en [supabase.com](https://supabase.com) (free tier alcanza).
2. En el **SQL Editor**, ejecutá primero `supabase/schema.sql` y después `supabase/seed.sql` (6 categorías, 156 preguntas; re-ejecutar el seed es seguro).
3. Copiá **Project Settings → API** → URL y `anon key`.

### 2. Variables de entorno

```bash
cp .env.example .env.local
# completa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
```

### 3. Desarrollo

```bash
pnpm install
pnpm dev
```

Para probar multiplayer abrí el sitio desde dos navegadores/dispositivos con la URL de Netlify (o un túnel) — el QR apunta al propio origen de la app.

### 4. Deploy a Netlify

- Conectá el repo a Netlify (build: `pnpm build`, publish: `dist`, configurado en `netlify.toml`).
- Definí `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` como variables de entorno del site.
- En Supabase, el dominio de Netlify funciona sin configurar CORS adicional: PostgREST/Realtime lo permiten por defecto para el rol `anon`.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo con HMR |
| `pnpm build` | Typecheck (`tsc -b`) + build de producción |
| `pnpm lint` | ESLint |
| `pnpm preview` | Sirve el build local |

## Agregar preguntas

Editá la tabla `questions` desde el dashboard de Supabase o con SQL: no hace falta re-deployar. Para regenerar el seed completo desde cero, modificá `supabase/seed.sql` y re-ejecutalo (es idempotente).

## Notas operativas

- El **host es el árbitro**: su pestaña debe quedar abierta durante la partida; si la cierra, la partida queda pausa y puede retomarla desde la misma URL (los credenciales viven en sessionStorage).
- El free tier de Supabase **pausa** el proyecto tras ~1 semana sin uso; se reactiva con un click desde el dashboard.
- Los códigos de sala son la única "credencial de entrada" para jugadores: cualquiera con el código puede entrar a la sala.
