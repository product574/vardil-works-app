-- The shared database behind the linked demo (stage 0 of the real web app, 21 Nov 2026).
--
-- Every firm's records live in one table, one row per record, keyed by the list it belongs to
-- (a key of Db in src/data/types.ts) and its own key. The record itself is kept as JSON, so the
-- app's data model can grow without a change here, and the same rows can be written to a
-- client's SharePoint lists later.
--
-- Each firm has a version number that goes up by one with every batch of changes. A record keeps
-- the version that last wrote it, and a deleted record stays as a marker (deleted = true), so
-- "what changed since version N" is one query. A reset numbers the firm afresh and records the
-- version it happened at, so a screen that last looked before it loads the whole firm again.
--
-- Nobody reads these tables from a browser. Row level security is on with no policies, so the
-- public keys see nothing; the server (a Cloudflare Pages Function, behind Cloudflare Access)
-- calls the three functions below with the service role key.

create table if not exists public.firms (
  id text primary key,
  name text not null,
  version bigint not null default 0,
  reset_version bigint not null default 0,
  reset_at timestamptz,
  reset_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.records (
  firm_id text not null references public.firms (id) on delete cascade,
  list text not null,
  id text not null,
  pos double precision not null default 0,
  data jsonb,
  deleted boolean not null default false,
  version bigint not null,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (firm_id, list, id)
);

create index if not exists records_by_version on public.records (firm_id, version);

alter table public.firms enable row level security;
alter table public.records enable row level security;

-- Changes from one screen: a JSON array of { list, id, pos, data } or { list, id, deleted: true }.
-- One record named twice in a batch keeps its last change. Returns the firm's new version.
create or replace function public.apply_changes(p_firm text, p_changes jsonb, p_by text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v bigint;
begin
  if jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception 'Changes must be a list';
  end if;
  -- Taking the firm's row locks it, so two batches for one firm are written one after the other.
  update firms set version = version + 1 where id = p_firm returning version into v;
  if v is null then
    raise exception 'No such firm: %', p_firm;
  end if;
  insert into records as r (firm_id, list, id, pos, data, deleted, version, updated_at, updated_by)
  select distinct on (c ->> 'list', c ->> 'id')
    p_firm,
    c ->> 'list',
    c ->> 'id',
    coalesce((c ->> 'pos')::double precision, 0),
    case when coalesce((c ->> 'deleted')::boolean, false) then null else c -> 'data' end,
    coalesce((c ->> 'deleted')::boolean, false),
    v,
    now(),
    p_by
  from jsonb_array_elements(p_changes) with ordinality as t (c, n)
  where coalesce(c ->> 'list', '') <> '' and coalesce(c ->> 'id', '') <> ''
  order by c ->> 'list', c ->> 'id', n desc
  on conflict (firm_id, list, id) do update
    set pos = excluded.pos,
        data = excluded.data,
        deleted = excluded.deleted,
        version = excluded.version,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
  return v;
end;
$$;

-- What changed since version p_since: { version, full, records }. When the screen last looked
-- before the firm was reset (or has never looked, p_since 0), it gets the whole firm (full: true,
-- no deleted markers); otherwise the records written after p_since, deletions included.
create or replace function public.changes_since(p_firm text, p_since bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f firms%rowtype;
  whole boolean;
  rows jsonb;
begin
  select * into f from firms where id = p_firm;
  if not found then
    raise exception 'No such firm: %', p_firm;
  end if;
  whole := p_since <= 0 or p_since < f.reset_version or p_since > f.version;
  select coalesce(jsonb_agg(
           case when r.deleted then jsonb_build_object('list', r.list, 'id', r.id, 'deleted', true)
                else jsonb_build_object('list', r.list, 'id', r.id, 'pos', r.pos, 'data', r.data) end
           order by r.list, r.pos, r.id), '[]'::jsonb)
    into rows
    from records r
   where r.firm_id = p_firm
     and (case when whole then not r.deleted else r.version > p_since end);
  return jsonb_build_object('version', f.version, 'full', whole, 'records', rows);
end;
$$;

-- Starts a firm, or puts it back to a fresh copy: every record replaced by p_records (a JSON
-- array of { list, id, pos, data }). Returns the firm's new version.
create or replace function public.reset_firm(p_firm text, p_name text, p_records jsonb, p_by text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v bigint;
begin
  if jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'Records must be a list';
  end if;
  insert into firms (id, name) values (p_firm, p_name) on conflict (id) do nothing;
  update firms
     set version = version + 1, reset_version = version + 1, reset_at = now(), reset_by = p_by, name = p_name
   where id = p_firm
  returning version into v;
  delete from records where firm_id = p_firm;
  insert into records (firm_id, list, id, pos, data, deleted, version, updated_at, updated_by)
  select distinct on (c ->> 'list', c ->> 'id')
    p_firm, c ->> 'list', c ->> 'id', coalesce((c ->> 'pos')::double precision, 0), c -> 'data', false, v, now(), p_by
  from jsonb_array_elements(p_records) with ordinality as t (c, n)
  where coalesce(c ->> 'list', '') <> '' and coalesce(c ->> 'id', '') <> ''
  order by c ->> 'list', c ->> 'id', n desc;
  return v;
end;
$$;

-- Only the server may call them.
revoke all on function public.apply_changes(text, jsonb, text) from public;
revoke all on function public.changes_since(text, bigint) from public;
revoke all on function public.reset_firm(text, text, jsonb, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.apply_changes(text, jsonb, text) from anon, authenticated';
    execute 'revoke all on function public.changes_since(text, bigint) from anon, authenticated';
    execute 'revoke all on function public.reset_firm(text, text, jsonb, text) from anon, authenticated';
    execute 'revoke all on table public.firms, public.records from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.apply_changes(text, jsonb, text) to service_role';
    execute 'grant execute on function public.changes_since(text, bigint) to service_role';
    execute 'grant execute on function public.reset_firm(text, text, jsonb, text) to service_role';
    execute 'grant all on table public.firms, public.records to service_role';
  end if;
end;
$$;
