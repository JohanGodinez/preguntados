-- ============================================================
-- Preguntados · Schema para Supabase (Postgres + Realtime)
-- Ejecutar completo en el SQL Editor de Supabase.
-- Modelo: host-autoritativo. El navegador del host corre el
-- motor del juego y escribe el estado; los demás clientes
-- leen por Realtime. Las acciones de jugadores llegan al host
-- vía la tabla `actions`.
-- ============================================================

-- Los jugadores llegan como rol `anon` (sin auth de Supabase).
-- La confianza se resuelve con tokens secretos guardados en la
-- tabla `secrets`, que NO es legible por la API ni está en la
-- publication de realtime. Solo las funciones security definer
-- la consultan.

create table if not exists public.games (
  code       text primary key,
  state      jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  game_code  text not null references public.games (code) on delete cascade,
  id         text not null,
  name       text not null,
  team_index smallint,
  joined_at  timestamptz not null default now(),
  primary key (game_code, id)
);

-- Acciones efímeras de jugadores hacia el host (respuesta, etc.).
create table if not exists public.actions (
  id         bigint generated always as identity primary key,
  game_code  text not null references public.games (code) on delete cascade,
  player_id  text not null,
  type       text not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);

-- Tokens secretos. Sin policies de RLS: invisible para la API.
-- player_id = '' representa el token del host.
create table if not exists public.secrets (
  game_code text not null references public.games (code) on delete cascade,
  player_id text not null default '',
  token     text not null,
  primary key (game_code, player_id)
);

create table if not exists public.categories (
  id    text primary key,
  name  text not null,
  color text not null
);

-- `correct` nunca se entrega a la API por columna: el host la
-- obtiene con get_questions() tras verificarse como host.
create table if not exists public.questions (
  id          text primary key,
  category_id text not null references public.categories (id) on delete cascade,
  text        text not null,
  options     text[] not null,
  correct     smallint not null check (correct between 0 and 3)
);

create index if not exists questions_category_idx on public.questions (category_id);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.games     enable row level security;
alter table public.players   enable row level security;
alter table public.actions   enable row level security;
alter table public.secrets   enable row level security;
alter table public.categories enable row level security;
alter table public.questions enable row level security;

-- Lectura pública (los códigos de sala son la "credencial de entrada").
drop policy if exists games_public_read on public.games;
create policy "games_public_read"   on public.games   for select using (true);
drop policy if exists players_public_read on public.players;
create policy "players_public_read" on public.players for select using (true);
drop policy if exists actions_public_read on public.actions;
create policy "actions_public_read" on public.actions for select using (true);
drop policy if exists categories_read on public.categories;
create policy "categories_read"     on public.categories for select using (true);
drop policy if exists questions_read on public.questions;
create policy "questions_read"      on public.questions  for select using (true);

-- Acciones: cualquiera puede insertar la suya; el resto solo por RPC.
drop policy if exists actions_public_insert on public.actions;
create policy "actions_public_insert" on public.actions for insert with check (true);

-- secrets: sin policies → nadie la lee ni escribe por API.

-- La escritura directa de games/players se hace solo vía RPCs.
revoke insert, update, delete on public.games   from anon, authenticated;
revoke insert, update, delete on public.players from anon, authenticated;
revoke insert, update, delete on public.secrets from anon, authenticated;
revoke insert, update, delete on public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;

-- `correct` oculta por columnas: los clientes solo leen lo demás.
revoke select on public.questions from anon, authenticated;
grant select (id, category_id, text, options) on public.questions to anon, authenticated;
revoke insert, update, delete on public.questions from anon, authenticated;

-- ------------------------------------------------------------
-- Realtime
-- ------------------------------------------------------------

do $$
begin
  -- Idempotente: saca las tablas de la publication si ya estaban,
  -- y luego las vuelve a agregar.
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime'
               and schemaname = 'public' and tablename = 'games') then
    alter publication supabase_realtime drop table public.games;
  end if;
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime'
               and schemaname = 'public' and tablename = 'players') then
    alter publication supabase_realtime drop table public.players;
  end if;
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime'
               and schemaname = 'public' and tablename = 'actions') then
    alter publication supabase_realtime drop table public.actions;
  end if;
end $$;

alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.actions;

-- ------------------------------------------------------------
-- RPCs (security definer: validan tokens contra `secrets`)
-- ------------------------------------------------------------

create or replace function public.create_game(p_config jsonb, p_state jsonb)
returns table (code text, host_token text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_code    text;
  v_token   text;
  v_alpha   text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.games g where g.code = v_code);
  end loop;

  insert into public.games (code, state) values (v_code, p_state);
  insert into public.secrets (game_code, player_id, token) values (v_code, '', v_token);
  return query select v_code, v_token;
end;
$fn$;

create or replace function public.update_game(p_code text, p_host_token text, p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not exists (
    select 1 from public.secrets s
    where s.game_code = p_code and s.player_id = '' and s.token = p_host_token
  ) then
    raise exception 'Sala no encontrada' using errcode = 'P0002';
  end if;
  update public.games g set state = p_state where g.code = p_code;
end;
$fn$;

create or replace function public.resume_game(p_code text, p_host_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_state jsonb;
begin
  if not exists (
    select 1 from public.secrets s
    where s.game_code = p_code and s.player_id = '' and s.token = p_host_token
  ) then
    raise exception 'La sala no existe o ya terminó' using errcode = 'P0002';
  end if;
  select g.state into v_state from public.games g where g.code = p_code;
  return v_state;
end;
$fn$;

create or replace function public.close_game(p_code text, p_host_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not exists (
    select 1 from public.secrets s
    where s.game_code = p_code and s.player_id = '' and s.token = p_host_token
  ) then
    raise exception 'Sala no encontrada' using errcode = 'P0002';
  end if;
  delete from public.games g where g.code = p_code;
end;
$fn$;

create or replace function public.get_questions(p_code text, p_host_token text)
returns setof public.questions
language sql
security definer
set search_path = ''
as $fn$
  select q.*
  from public.questions q
  where exists (
    select 1 from public.secrets s
    where s.game_code = p_code and s.player_id = '' and s.token = p_host_token
  );
$fn$;

create or replace function public.join_game(p_code text, p_name text, p_token text default null)
returns table (player_id text, token text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_code   text := upper(btrim(p_code));
  v_phase  text;
  v_pid    text;
  v_token  text;
  v_count  int;
begin
  select g.state->>'phase' into v_phase from public.games g where g.code = v_code;
  if v_phase is null then
    raise exception 'No existe una sala con ese código' using errcode = 'P0002';
  end if;

  -- Reconexión: el token conocido devuelve al mismo jugador.
  if p_token is not null and p_token <> '' then
    select s.player_id, s.token into v_pid, v_token
    from public.secrets s
    where s.game_code = v_code and s.token = p_token and s.player_id <> '';
    if v_pid is not null then
      return query select v_pid, v_token;
    end if;
  end if;

  if v_phase = 'finished' then
    raise exception 'La partida ya terminó' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.players p where p.game_code = v_code;
  v_pid   := substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8);
  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  insert into public.players (game_code, id, name)
  values (v_code, v_pid, coalesce(nullif(btrim(p_name), ''), 'Jugador ' || (v_count + 1)));
  insert into public.secrets (game_code, player_id, token) values (v_code, v_pid, v_token);

  return query select v_pid, v_token;
end;
$fn$;

create or replace function public.leave_game(p_code text, p_player_id text, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  delete from public.players p
  where p.game_code = p_code and p.id = p_player_id
    and exists (
      select 1 from public.secrets s
      where s.game_code = p_code and s.player_id = p_player_id and s.token = p_token
    );
end;
$fn$;

create or replace function public.set_team(p_code text, p_player_id text, p_token text, p_team_index int)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_phase text;
  v_teams jsonb;
begin
  if not exists (
    select 1 from public.secrets s
    where s.game_code = p_code and s.player_id = p_player_id and s.token = p_token
  ) then
    raise exception 'No estás en una sala' using errcode = 'P0002';
  end if;

  select g.state->>'phase', g.state->'config'->'teams' into v_phase, v_teams
  from public.games g where g.code = p_code;

  if v_phase is null then
    raise exception 'No estás en una sala' using errcode = 'P0002';
  end if;
  if v_phase <> 'lobby' then
    raise exception 'Los equipos ya están fijos' using errcode = 'P0001';
  end if;
  if p_team_index is null or p_team_index < 0 or p_team_index >= coalesce(jsonb_array_length(v_teams), 0) then
    raise exception 'Equipo inválido' using errcode = 'P0001';
  end if;

  update public.players p set team_index = p_team_index
  where p.game_code = p_code and p.id = p_player_id;
end;
$fn$;

create or replace function public.clear_actions(p_code text, p_host_token text, p_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not exists (
    select 1 from public.secrets s
    where s.game_code = p_code and s.player_id = '' and s.token = p_host_token
  ) then
    return;
  end if;
  delete from public.actions a
  where a.game_code = p_code and a.id = any(p_ids);
end;
$fn$;

grant execute on function
  public.create_game(jsonb, jsonb),
  public.update_game(text, text, jsonb),
  public.resume_game(text, text),
  public.close_game(text, text),
  public.get_questions(text, text),
  public.join_game(text, text, text),
  public.leave_game(text, text, text),
  public.set_team(text, text, text, int),
  public.clear_actions(text, text, bigint[])
to anon, authenticated;
