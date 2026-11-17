-- Sanitized copy of the migration applied to Supabase (version 20261117142544).
-- Omitted on purpose (public repo): the INSERT of 8 public.category_rules rows, which name real merchants.
-- The history often names the real merchant behind a terse card descriptor.
-- Use that name as a second key (alias_norm) for the rules.
alter table public.movements add column if not exists alias_norm text;

create or replace function private.refresh_aliases() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.movements m set alias_norm = upper(regexp_replace(s.counterparty, '\s+', ' ', 'g'))
  from public.statement_rows s
  where s.movement_id = m.id and m.source <> s.source and not s.is_person
    and m.alias_norm is distinct from upper(regexp_replace(s.counterparty, '\s+', ' ', 'g'));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function private.recategorize_all() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform private.refresh_aliases();
  update public.movements mv set
    category = coalesce(c.category, a.category, private.default_category(mv.kind)),
    rule_id = coalesce(c.rule_id, a.rule_id),
    is_person = coalesce(c.is_person, a.is_person, case when mv.details ? 'from_statement' then mv.is_person else mv.kind in ('yape_sent','yape_received') end),
    updated_at = now()
  from public.movements m2
  left join lateral private.categorize(m2.country, m2.counterparty_norm) c on true
  left join lateral private.categorize(m2.country, m2.alias_norm) a on true
  where m2.id = mv.id
    and (mv.category, mv.rule_id, mv.is_person) is distinct from
        (coalesce(c.category, a.category, private.default_category(mv.kind)), coalesce(c.rule_id, a.rule_id),
         coalesce(c.is_person, a.is_person, case when mv.details ? 'from_statement' then mv.is_person else mv.kind in ('yape_sent','yape_received') end));
  get diagnostics n = row_count;
  return n;
end $$;

-- run after every statement ingest so new aliases classify themselves
create or replace function private.apply_statements(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s jsonb; n int := 0; n_new int := 0; v_rows int; r jsonb;
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
  r := private.reconcile_statements();
  if n_new > 0 then perform private.recategorize_all(); end if;
  return jsonb_build_object('statements', n, 'statements_new', n_new) || r;
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
