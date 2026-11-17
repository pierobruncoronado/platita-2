-- Sanitized copy of the migration applied to Supabase (version 20261117151800). No data rows.
-- Auth: header x-ingest-key checked against private.notif_keys (hash only).
create or replace function public.ingest_screen(text)
returns jsonb language plpgsql security definer set search_path = ''
as $f$
declare
  v_in text := $1; v_now timestamptz := now(); v_hdr json; v_key text; v_raw text;
  v_amt text[]; v_cp text; v_op text; v_dedupe text; v_id bigint; r jsonb;
  v_status text; v_p jsonb; v_cents bigint;
begin
  begin v_hdr := current_setting('request.headers', true)::json; exception when others then v_hdr := null; end;
  v_key := v_hdr->>'x-ingest-key';
  if v_key is null or not exists (select 1 from private.notif_keys k
      where k.key_hash = encode(sha256(convert_to(v_key, 'UTF8')), 'hex')) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  v_raw := left(regexp_replace(coalesce(v_in,''),
      '(c[oó]digo de seguridad[^0-9]{0,60})[0-9][0-9 ,"]{0,12}', '\1[omitido]', 'gi'), 2000);
  v_amt := regexp_match(v_raw, 'S/[^0-9]{0,8}([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)');
  v_cp := (regexp_match(v_raw, '([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]*)*\*)'))[1];
  v_op := coalesce((regexp_match(v_raw, 'operaci[oó]n[^0-9]{0,40}([0-9]{5,})', 'i'))[1],
                   (regexp_match(v_raw, '([0-9]{7,12})'))[1]);
  if v_amt is null or v_raw !~* 'yapeaste' then
    v_status := 'unparsed'; v_p := null;
  else
    v_cents := round(replace(v_amt[1], ',', '')::numeric * 100)::bigint;
    v_p := jsonb_build_object('direction','out','amount_cents',v_cents,'counterparty',coalesce(v_cp,'Yape'),'operation_id',v_op);
    v_status := 'parsed';
  end if;
  v_dedupe := 'screen:' || coalesce(v_op, to_char(date_trunc('minute', v_now), 'YYYY-MM-DD"T"HH24:MI') || ':' || coalesce(v_cents::text,'x'));
  insert into public.raw_notifications (received_at, app, title, body, dedupe_key, status, parsed)
  values (v_now, 'Yape', 'Yapeaste (pantalla)', v_raw, v_dedupe, v_status, v_p)
  on conflict (dedupe_key) do nothing returning id into v_id;
  if v_id is null then return jsonb_build_object('duplicate', true); end if;
  if v_status = 'parsed' then
    insert into public.statement_rows (dedupe_key, country, source, kind, direction, amount_cents, currency, occurred_at,
        counterparty, counterparty_norm, is_person, message, gmail_message_id)
    values (v_dedupe, 'PE', 'phone_notif', 'yape_sent', 'out', v_cents, 'PEN', v_now,
        coalesce(v_cp,'Yape'), upper(coalesce(v_cp,'Yape')), coalesce(v_cp,'') like '%*',
        'Yapeaste (pantalla) op ' || coalesce(v_op,'?'), 'screen:' || v_id)
    on conflict (dedupe_key) do nothing;
    r := private.reconcile_statements();
  end if;
  insert into public.ingest_runs (mode, emails_seen, movements_upserted, movements_new, unparsed)
  values ('screen', 0, 0, coalesce((r->>'promoted')::int, 0), case when v_status = 'unparsed' then 1 else 0 end);
  return jsonb_build_object('status', v_status) || coalesce(r, '{}'::jsonb);
end $f$;
