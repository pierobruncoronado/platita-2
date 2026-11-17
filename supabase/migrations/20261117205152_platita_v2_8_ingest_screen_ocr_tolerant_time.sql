-- Sanitized copy of the migration applied to Supabase (version 20261117205152). No data rows.
create or replace function public.ingest_screen(text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_in text := $1; v_now timestamptz := now(); v_hdr json; v_key text; v_raw text;
  v_amt text[]; v_cp text; v_op text; v_dedupe text; v_id bigint; r jsonb;
  v_p jsonb; v_cents bigint;
  v_dt text[]; v_mon int; v_h int; v_when timestamptz; v_has_time boolean := false; v_min text;
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
  if v_amt is null or v_raw !~* 'yapeaste' then
    return jsonb_build_object('status', 'discarded');
  end if;
  v_cp := (regexp_match(v_raw, '([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]*)*\*)'))[1];
  v_op := coalesce((regexp_match(v_raw, 'operaci[oó]n[^0-9]{0,40}([0-9]{5,})', 'i'))[1],
                   (regexp_match(v_raw, '([0-9]{7,12})'))[1]);
  v_cents := round(replace(v_amt[1], ',', '')::numeric * 100)::bigint;

  -- Time printed on the screen, read from the ORIGINAL text (redacting the security code can eat the
  -- day) and tolerant to OCR noise between the year and the clock.
  v_dt := regexp_match(coalesce(v_in,''), '([0-9]{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]{3,5})\.?\s+(20[0-9]{2})[^0-9:]{0,6}([0-9]{1,2}):([0-9]{2})\s*([apAP])\.?\s*[mM]');
  v_when := v_now;
  if v_dt is not null then
    begin
      v_mon := case left(lower(translate(v_dt[2], 'áéíóú', 'aeiou')), 3)
        when 'ene' then 1 when 'feb' then 2 when 'mar' then 3 when 'abr' then 4 when 'may' then 5
        when 'jun' then 6 when 'jul' then 7 when 'ago' then 8 when 'sep' then 9 when 'set' then 9
        when 'oct' then 10 when 'nov' then 11 when 'dic' then 12 else null end;
      if v_mon is not null then
        v_h := (v_dt[4]::int % 12) + case when lower(v_dt[6]) = 'p' then 12 else 0 end;
        v_when := make_timestamptz(v_dt[3]::int, v_mon, v_dt[1]::int, v_h, v_dt[5]::int, 0, 'America/Lima');
        if v_when > v_now + interval '5 minutes' or v_when < v_now - interval '2 days' then
          v_when := v_now;
        else
          v_has_time := true;
        end if;
      end if;
    exception when others then
      v_when := v_now; v_has_time := false;
    end;
  end if;
  v_min := to_char(v_when at time zone 'America/Lima', 'YYYY-MM-DD"T"HH24:MI');

  if v_has_time and exists (
      select 1 from public.raw_notifications n
       where n.app = 'Yape' and n.title = 'Yapeaste (pantalla)'
         and n.parsed->>'minute' = v_min and (n.parsed->>'amount_cents')::bigint = v_cents) then
    return jsonb_build_object('duplicate', true);
  end if;

  v_p := jsonb_build_object('direction','out','amount_cents',v_cents,'counterparty',coalesce(v_cp,'Yape'),
                            'operation_id',v_op,'minute',case when v_has_time then v_min else null end);
  v_dedupe := 'screen:' || coalesce(v_op, v_min || ':' || v_cents::text);
  insert into public.raw_notifications (received_at, app, title, body, dedupe_key, status, parsed)
  values (v_when, 'Yape', 'Yapeaste (pantalla)', v_raw, v_dedupe, 'parsed', v_p)
  on conflict (dedupe_key) do nothing returning id into v_id;
  if v_id is null then return jsonb_build_object('duplicate', true); end if;
  insert into public.statement_rows (dedupe_key, country, source, kind, direction, amount_cents, currency, occurred_at,
      counterparty, counterparty_norm, is_person, message, gmail_message_id)
  values (v_dedupe, 'PE', 'phone_notif', 'yape_sent', 'out', v_cents, 'PEN', v_when,
      coalesce(v_cp,'Yape'), upper(coalesce(v_cp,'Yape')), coalesce(v_cp,'') like '%*',
      'Yapeaste (pantalla) op ' || coalesce(v_op,'?'), 'screen:' || v_id)
  on conflict (dedupe_key) do nothing;
  r := private.reconcile_statements();
  insert into public.ingest_runs (mode, emails_seen, movements_upserted, movements_new, unparsed)
  values ('screen', 0, 0, coalesce((r->>'promoted')::int, 0), 0);
  return jsonb_build_object('status', 'parsed') || coalesce(r, '{}'::jsonb);
end $function$;
