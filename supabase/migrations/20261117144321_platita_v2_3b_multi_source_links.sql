-- Sanitized copy of the migration applied to Supabase (version 20261117144321). No data rows.
-- A movement may be confirmed by several statement sources (phone notification + Yape history),
-- but by at most one row of EACH source. Before: the history row could not link to a movement
-- already linked by its notification and would have been promoted as a duplicate.
create or replace function private.reconcile_statements() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record; v_id bigint; v_cat text; v_rule bigint; v_person boolean;
  n_linked int := 0; n_promoted int := 0; n_replaced int := 0;
begin
  -- (a) a movement promoted from a statement row whose notification email arrived later: keep the email
  for r in
    select s.id as sid, s.movement_id as pid, e.id as eid
    from public.statement_rows s
    join public.movements p on p.id = s.movement_id and p.source = s.source
    join lateral (
      select m.id from public.movements m
      where m.source not in ('yape_report','phone_notif') and m.country = s.country and m.direction = s.direction
        and m.amount_cents = s.amount_cents and m.currency = s.currency
        and abs(extract(epoch from (m.occurred_at - s.occurred_at))) <= 180
        and not exists (select 1 from public.statement_rows s2 where s2.movement_id = m.id and s2.source = s.source)
      order by abs(extract(epoch from (m.occurred_at - s.occurred_at))) limit 1) e on true
    order by s.occurred_at
  loop
    update public.statement_rows set movement_id = r.eid where movement_id = r.pid;
    delete from public.movements where id = r.pid;
    n_replaced := n_replaced + 1;
  end loop;

  -- (b) rows not linked yet: link to an existing movement of another source, else create one
  for r in select * from public.statement_rows where movement_id is null order by occurred_at loop
    v_id := null;
    select m.id into v_id from public.movements m
     where m.source <> r.source and m.country = r.country and m.direction = r.direction
       and m.amount_cents = r.amount_cents and m.currency = r.currency
       and abs(extract(epoch from (m.occurred_at - r.occurred_at))) <= 180
       and not exists (select 1 from public.statement_rows s2 where s2.movement_id = m.id and s2.source = r.source)
     order by (m.source in ('yape_report','phone_notif')), abs(extract(epoch from (m.occurred_at - r.occurred_at))) limit 1;
    if v_id is not null then
      n_linked := n_linked + 1;
      -- the history names people better than a notification guess: take its name when the movement came from a notification
      if r.source = 'yape_report' then
        update public.movements set counterparty = r.counterparty, counterparty_norm = r.counterparty_norm,
               is_person = r.is_person, kind = r.kind, updated_at = now()
         where id = v_id and source = 'phone_notif';
      end if;
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
revoke execute on all functions in schema private from public, anon, authenticated;
