-- Sanitized copy of the migration applied to Supabase (version 20261117020800). No data rows.
alter table public.raw_emails drop constraint raw_emails_status_check;
alter table public.raw_emails add constraint raw_emails_status_check check (status in ('parsed','ignored','unparsed','hint','statement'));

create table public.statement_rows (
  id bigint generated always as identity primary key,
  dedupe_key text not null unique,
  country text not null check (country in ('PE','US')),
  source text not null,
  kind text not null,
  direction text not null check (direction in ('in','out')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency in ('PEN','USD')),
  occurred_at timestamptz not null,
  counterparty text not null,
  counterparty_norm text,
  is_person boolean not null default false,
  message text,
  gmail_message_id text not null,
  movement_id bigint references public.movements(id) on delete set null,
  created_at timestamptz not null default now()
);
create index statement_rows_movement_idx on public.statement_rows (movement_id);
create index statement_rows_match_idx on public.statement_rows (country, direction, amount_cents, occurred_at);
create index movements_match_idx on public.movements (country, direction, amount_cents, occurred_at);

create table public.balance_anchors (
  id bigint generated always as identity primary key,
  country text not null check (country in ('PE','US')),
  currency text not null check (currency in ('PEN','USD')),
  at timestamptz not null,
  amount_cents bigint not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.statement_rows enable row level security;
alter table public.balance_anchors enable row level security;

-- Statement rows (bank/wallet history files) are the complete list; notification emails are the richer copy.
-- One-to-one link by direction + amount + currency within 3 minutes. A row with no email becomes a movement.
create or replace function private.reconcile_statements() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record; v_id bigint; v_cat text; v_rule bigint; v_person boolean;
  n_linked int := 0; n_promoted int := 0; n_replaced int := 0;
begin
  -- (a) a promoted movement whose notification email arrived later: keep the email, drop the promoted copy
  for r in
    select s.id as sid, s.movement_id as pid, e.id as eid
    from public.statement_rows s
    join public.movements p on p.id = s.movement_id and p.source = s.source
    join lateral (
      select m.id from public.movements m
      where m.source <> s.source and m.country = s.country and m.direction = s.direction
        and m.amount_cents = s.amount_cents and m.currency = s.currency
        and abs(extract(epoch from (m.occurred_at - s.occurred_at))) <= 180
        and not exists (select 1 from public.statement_rows s2 where s2.movement_id = m.id)
      order by abs(extract(epoch from (m.occurred_at - s.occurred_at))) limit 1) e on true
    order by s.occurred_at
  loop
    if not exists (select 1 from public.statement_rows where movement_id = r.eid) then
      update public.statement_rows set movement_id = r.eid where id = r.sid;
      delete from public.movements where id = r.pid;
      n_replaced := n_replaced + 1;
    end if;
  end loop;

  -- (b) rows not linked yet
  for r in select * from public.statement_rows where movement_id is null order by occurred_at loop
    v_id := null;
    select m.id into v_id from public.movements m
     where m.source <> r.source and m.country = r.country and m.direction = r.direction
       and m.amount_cents = r.amount_cents and m.currency = r.currency
       and abs(extract(epoch from (m.occurred_at - r.occurred_at))) <= 180
       and not exists (select 1 from public.statement_rows s2 where s2.movement_id = m.id)
     order by abs(extract(epoch from (m.occurred_at - r.occurred_at))) limit 1;
    if v_id is not null then
      n_linked := n_linked + 1;
    else
      v_cat := null; v_rule := null; v_person := null;
      select c.category, c.rule_id, c.is_person into v_cat, v_rule, v_person
        from private.categorize(r.country, r.counterparty_norm) c;
      insert into public.movements (dedupe_key, country, source, kind, direction, amount_cents, currency, occurred_at,
          counterparty, counterparty_norm, is_person, category, rule_id, operation_id, gmail_message_id, details)
      values (r.dedupe_key, r.country, r.source, r.kind, r.direction, r.amount_cents, r.currency, r.occurred_at,
          r.counterparty, r.counterparty_norm, coalesce(v_person, r.is_person),
          coalesce(v_cat, private.default_category(r.kind)), v_rule, null, r.gmail_message_id,
          jsonb_strip_nulls(jsonb_build_object('from_statement', true, 'message', r.message)))
      on conflict (dedupe_key) do update set updated_at = now()
      returning id into v_id;
      n_promoted := n_promoted + 1;
    end if;
    update public.statement_rows set movement_id = v_id where id = r.id;
  end loop;
  return jsonb_build_object('linked', n_linked, 'promoted', n_promoted, 'replaced', n_replaced);
end $$;

create or replace function private.apply_statements(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s jsonb; n int := 0; n_new int := 0; v_rows int;
begin
  for s in select * from jsonb_array_elements(coalesce(p->'statements','[]'::jsonb)) loop
    insert into public.statement_rows (dedupe_key, country, source, kind, direction, amount_cents, currency, occurred_at,
        counterparty, counterparty_norm, is_person, message, gmail_message_id)
    values (s->>'dedupe_key', s->>'country', s->>'source', s->>'kind', s->>'direction', (s->>'amount_cents')::bigint,
        s->>'currency', (s->>'occurred_at')::timestamptz, s->>'counterparty', s->>'counterparty_norm',
        coalesce((s->>'is_person')::boolean, false), s->>'message', s->>'gmail_message_id')
    on conflict (dedupe_key) do nothing;
    get diagnostics v_rows = row_count;
    n := n + 1; n_new := n_new + v_rows;
  end loop;
  return jsonb_build_object('statements', n, 'statements_new', n_new) || private.reconcile_statements();
end $$;

-- the statement-sourced movements keep their person flag when rules are re-applied
create or replace function private.recategorize_all() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.movements mv set
    category = coalesce(c.category, private.default_category(mv.kind)),
    rule_id = c.rule_id,
    is_person = coalesce(c.is_person, case when mv.details ? 'from_statement' then mv.is_person else mv.kind in ('yape_sent','yape_received') end),
    updated_at = now()
  from (select m2.id, x.category, x.rule_id, x.is_person
          from public.movements m2
          left join lateral private.categorize(m2.country, m2.counterparty_norm) x on true) c
  where c.id = mv.id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.ingest_batch(p_key text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_key is null or not exists (
       select 1 from private.ingest_keys k
        where k.id = 1 and k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  return private.apply_batch(p_payload) || private.apply_statements(p_payload);
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.ingest_batch(text, jsonb) from public, authenticated;
grant execute on function public.ingest_batch(text, jsonb) to anon;
