-- Sanitized copy of the migration applied to Supabase (version 20261116220729).
-- Omitted on purpose (public repo): the seed rows of public.category_rules, which name real merchants.
-- Rules live only in the database; add them with INSERT ... INTO public.category_rules.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.categories (
  slug text primary key,
  label text not null,
  kind text not null check (kind in ('gasto','ingreso','neutro')),
  sort int not null default 100
);

create table public.category_rules (
  id bigint generated always as identity primary key,
  country text not null default 'PE' check (country in ('PE','US')),
  match_type text not null check (match_type in ('contains','prefix','exact')),
  pattern text not null,
  category text not null references public.categories(slug),
  is_person boolean not null default false,
  priority int not null default 100,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  unique (country, match_type, pattern)
);

create table public.raw_emails (
  gmail_message_id text primary key,
  source text not null,
  subject text,
  received_at timestamptz not null,
  status text not null check (status in ('parsed','ignored','unparsed','hint')),
  parser text,
  body_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.movements (
  id bigint generated always as identity primary key,
  dedupe_key text not null unique,
  country text not null check (country in ('PE','US')),
  source text not null,
  kind text not null,
  direction text not null check (direction in ('in','out')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency in ('PEN','USD')),
  occurred_at timestamptz not null,
  counterparty text,
  counterparty_norm text,
  is_person boolean not null default false,
  category text not null default 'sin_clasificar' references public.categories(slug),
  rule_id bigint references public.category_rules(id) on delete set null,
  operation_id text,
  gmail_message_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index movements_occurred_at_idx on public.movements (country, occurred_at desc);

create table public.movement_hints (
  gmail_message_id text primary key,
  source text not null,
  amount_cents bigint not null,
  occurred_at timestamptz not null,
  counterparty text not null,
  counterparty_norm text not null,
  applied_to bigint references public.movements(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.ingest_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  mode text,
  emails_seen int not null default 0,
  movements_upserted int not null default 0,
  movements_new int not null default 0,
  unparsed int not null default 0
);

create table private.ingest_keys (
  id int primary key default 1 check (id = 1),
  key_hash text not null,
  claimed_at timestamptz not null default now()
);

alter table public.categories enable row level security;
alter table public.category_rules enable row level security;
alter table public.raw_emails enable row level security;
alter table public.movements enable row level security;
alter table public.movement_hints enable row level security;
alter table public.ingest_runs enable row level security;
alter table private.ingest_keys enable row level security;

insert into public.categories (slug, label, kind, sort) values
 ('tiendas','Tiendas y minimarkets','gasto',10),
 ('supermercado','Supermercado','gasto',20),
 ('comida','Comida y restaurantes','gasto',30),
 ('delivery','Delivery','gasto',40),
 ('suscripciones','Suscripciones','gasto',50),
 ('entretenimiento','Entretenimiento','gasto',60),
 ('apuestas','Apuestas','gasto',70),
 ('educacion','Educación','gasto',80),
 ('efectivo','Retiro de efectivo','neutro',90),
 ('sin_clasificar','Sin clasificar','gasto',99),
 ('deposito','Depósito por cajero','ingreso',110),
 ('recibido_persona','Recibido de una persona','ingreso',120),
 ('devolucion','Devolución','ingreso',130);

-- (category_rules seed omitted: see header)

create or replace function private.categorize(p_country text, p_norm text)
returns table(category text, rule_id bigint, is_person boolean)
language sql stable set search_path = '' as $$
  select r.category, r.id, r.is_person
  from public.category_rules r
  where r.active and r.country = p_country and p_norm is not null and (
       (r.match_type = 'exact' and p_norm = r.pattern)
    or (r.match_type = 'prefix' and left(p_norm, length(r.pattern)) = r.pattern)
    or (r.match_type = 'contains' and position(r.pattern in p_norm) > 0))
  order by r.priority, length(r.pattern) desc
  limit 1
$$;

create or replace function private.default_category(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'atm_deposit' then 'deposito'
    when 'atm_withdrawal' then 'efectivo'
    when 'refund' then 'devolucion'
    when 'yape_received' then 'recibido_persona'
    else 'sin_clasificar' end
$$;

create or replace function private.apply_batch(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e jsonb; m jsonb; h jsonb;
  v_cat text; v_rule bigint; v_person boolean; v_new boolean;
  n_em int := 0; n_unp int := 0; n_mov int := 0; n_new int := 0; n_hint int := 0;
begin
  for e in select * from jsonb_array_elements(coalesce(p->'emails','[]'::jsonb)) loop
    insert into public.raw_emails as r (gmail_message_id, source, subject, received_at, status, parser, body_text)
    values (e->>'gmail_message_id', e->>'source', e->>'subject', (e->>'received_at')::timestamptz, e->>'status', e->>'parser',
            case when e->>'status' = 'unparsed' then left(e->>'body_text', 20000) end)
    on conflict (gmail_message_id) do update
      set status = excluded.status, parser = excluded.parser, body_text = excluded.body_text,
          subject = excluded.subject, updated_at = now();
    n_em := n_em + 1;
    if e->>'status' = 'unparsed' then n_unp := n_unp + 1; end if;
  end loop;

  for m in select * from jsonb_array_elements(coalesce(p->'movements','[]'::jsonb)) loop
    v_cat := null; v_rule := null; v_person := null;
    select c.category, c.rule_id, c.is_person into v_cat, v_rule, v_person
      from private.categorize(m->>'country', m->>'counterparty_norm') c;
    if v_cat is null then
      v_cat := private.default_category(m->>'kind');
      v_person := (m->>'kind') in ('yape_sent','yape_received');
    end if;
    insert into public.movements as t (dedupe_key, country, source, kind, direction, amount_cents, currency, occurred_at,
        counterparty, counterparty_norm, is_person, category, rule_id, operation_id, gmail_message_id, details)
    values (m->>'dedupe_key', m->>'country', m->>'source', m->>'kind', m->>'direction', (m->>'amount_cents')::bigint,
        m->>'currency', (m->>'occurred_at')::timestamptz, m->>'counterparty', m->>'counterparty_norm', coalesce(v_person,false),
        v_cat, v_rule, m->>'operation_id', m->>'gmail_message_id', coalesce(m->'details','{}'::jsonb))
    on conflict (dedupe_key) do update set
        amount_cents = excluded.amount_cents, currency = excluded.currency, occurred_at = excluded.occurred_at,
        kind = excluded.kind, direction = excluded.direction, operation_id = excluded.operation_id,
        counterparty = case when t.details ? 'hint' then t.counterparty else excluded.counterparty end,
        counterparty_norm = case when t.details ? 'hint' then t.counterparty_norm else excluded.counterparty_norm end,
        is_person = case when t.details ? 'hint' then t.is_person else excluded.is_person end,
        category = case when t.details ? 'hint' then t.category else excluded.category end,
        rule_id = case when t.details ? 'hint' then t.rule_id else excluded.rule_id end,
        details = case when t.details ? 'hint' then t.details else excluded.details end,
        updated_at = now()
    returning (xmax = 0) into v_new;
    n_mov := n_mov + 1;
    if v_new then n_new := n_new + 1; end if;
  end loop;

  for h in select * from jsonb_array_elements(coalesce(p->'hints','[]'::jsonb)) loop
    insert into public.movement_hints (gmail_message_id, source, amount_cents, occurred_at, counterparty, counterparty_norm)
    values (h->>'gmail_message_id', h->>'source', (h->>'amount_cents')::bigint, (h->>'occurred_at')::timestamptz,
            h->>'counterparty', h->>'counterparty_norm')
    on conflict (gmail_message_id) do nothing;
  end loop;

  with pick as (
    select distinct on (hh.gmail_message_id) hh.gmail_message_id as hint_id, mv.id as mov_id
    from public.movement_hints hh
    join public.movements mv
      on mv.source = hh.source and mv.amount_cents = hh.amount_cents
     and mv.kind = 'yape_payment' and not (mv.details ? 'hint')
     and abs(extract(epoch from (mv.occurred_at - hh.occurred_at))) <= 180
    where hh.applied_to is null
    order by hh.gmail_message_id, abs(extract(epoch from (mv.occurred_at - hh.occurred_at)))
  ), upd as (
    update public.movements mv
       set details = mv.details || jsonb_build_object('hint', hh.gmail_message_id, 'original_counterparty', mv.counterparty),
           counterparty = hh.counterparty,
           counterparty_norm = hh.counterparty_norm,
           category = coalesce((select c.category from private.categorize(mv.country, hh.counterparty_norm) c), 'sin_clasificar'),
           rule_id = (select c.rule_id from private.categorize(mv.country, hh.counterparty_norm) c),
           is_person = false,
           updated_at = now()
      from pick pk join public.movement_hints hh on hh.gmail_message_id = pk.hint_id
     where mv.id = pk.mov_id
     returning mv.id, pk.hint_id
  )
  update public.movement_hints hh set applied_to = upd.id from upd where hh.gmail_message_id = upd.hint_id;
  get diagnostics n_hint = row_count;

  insert into public.ingest_runs (mode, emails_seen, movements_upserted, movements_new, unparsed)
  values (coalesce(p->>'mode','hourly'), n_em, n_mov, n_new, n_unp);
  delete from public.ingest_runs where ran_at < now() - interval '90 days';

  return jsonb_build_object('emails', n_em, 'movements', n_mov, 'new', n_new, 'unparsed', n_unp, 'hints_applied', n_hint);
end $$;

create or replace function private.recategorize_all() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.movements mv set
    category = coalesce(c.category, private.default_category(mv.kind)),
    rule_id = c.rule_id,
    is_person = coalesce(c.is_person, mv.kind in ('yape_sent','yape_received')),
    updated_at = now()
  from (select m2.id, x.category, x.rule_id, x.is_person
          from public.movements m2
          left join lateral private.categorize(m2.country, m2.counterparty_norm) x on true) c
  where c.id = mv.id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.ingest_claim(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text; v_existing text;
begin
  if p_key is null or length(p_key) < 32 then
    raise exception 'ingest key too short';
  end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  insert into private.ingest_keys (id, key_hash) values (1, v_hash) on conflict (id) do nothing;
  select key_hash into v_existing from private.ingest_keys where id = 1;
  return v_existing = v_hash;
end $$;

create or replace function public.ingest_batch(p_key text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_key is null or not exists (
       select 1 from private.ingest_keys k
        where k.id = 1 and k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  return private.apply_batch(p_payload);
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.ingest_claim(text) from public, authenticated;
revoke execute on function public.ingest_batch(text, jsonb) from public, authenticated;
grant execute on function public.ingest_claim(text) to anon;
grant execute on function public.ingest_batch(text, jsonb) to anon;
