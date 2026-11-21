# Preguntados

Juego de trivia por equipos estilo Preguntados (party game). React 19 + Vite + Tailwind v4, con Supabase (Postgres + Realtime) como backend: sin servidor propio.

## Cómo se juega

- **Crear sala** (`/crear`): cualquier participante configura equipos, rondas, categorías y tiempo, y crea la sala desde su celular. Quien crea también juega; no hay pantalla de host obligatoria.
- **Unirse** (`/unirse`): el resto entra con el código de 5 letras o el QR, escribe su nombre y elige equipo.
- **Tablero** (`/host` o `/tablero?c=CODE`): pantalla grande opcional (TV/tablet) en modo espectador, sin credenciales.

Mecánica de ronda:

1. Gira solo el equipo en turno, desde su celular, y la categoría se elige al azar.
2. Al terminar el giro **ambos equipos ven la misma pregunta y responden a la vez**. La primera respuesta de cada equipo queda fija; si nadie responde antes del límite, cuenta como sin respuesta.
3. Se revela la correcta: cada equipo que acertó suma **+10**. El reveal dura 6 s y avanza solo; el tablero tiene un botón "Siguiente ahora" para acelerar.
4. El turno alterna cada ronda. Si al terminar hay empate en el primer puesto, se juega **muerte súbita**: los equipos empatados responden otra pregunta; gana el único que acierte (si aciertan ambos o ninguno, se repite).

## Arquitectura

- **Frontend (Netlify):** la app React completa. El navegador del **creador** corre el motor del juego (`src/game/hostEngine.ts`) y persiste el estado en la tabla `games`.
- **Supabase Realtime:** los demás clientes reciben el estado por Postgres Changes (`games`, `players`) y reportan presencias (`online`) por canales de Presence. Las acciones de jugadores (`answer`, `spin`, `next`) llegan al motor vía la tabla `actions`.
- **Seguridad:** los tokens secretos viven en la tabla `secrets` (invisible por API, no está en la publication de realtime). La columna `questions.correct` solo la lee el creador vía la RPC `get_questions`.
- **Protocolo:** `shared/protocol.ts` es la fuente de verdad de los tipos (`PublicState`, `GameState`, `GameConfig`).

La pregunta se muestra a todos los equipos (la respuesta correcta solo se conoce en el reveal). El estado guarda `answers` y `results` alineados con `config.teams`.

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

- El **creador es el árbitro**: su pestaña debe quedar abierta durante la partida (ahí corre el motor); si la cierra, la partida queda en pausa y puede retomarla al volver (las credenciales viven en sessionStorage). El resto de los jugadores no necesita hacer nada.
- El free tier de Supabase **pausa** el proyecto tras ~1 semana sin uso; se reactiva con un click desde el dashboard.
- Los códigos de sala son la única "credencial de entrada" para jugadores: cualquiera con el código puede entrar a la sala.
