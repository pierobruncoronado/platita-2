-- Sanitized copy of the migration applied to Supabase (version 20261117144131). No data rows, no keys
-- (only SHA-256 hashes are ever stored, in private.notif_keys, and never in this repo).
create table public.raw_notifications (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  app text,
  title text,
  body text,
  dedupe_key text not null unique,
  status text not null check (status in ('parsed','unparsed','redacted')),
  parsed jsonb
);
alter table public.raw_notifications enable row level security;

create table private.notif_keys (
  id int primary key default 1 check (id = 1),
  key_hash text not null,
  created_at timestamptz not null default now()
);
alter table private.notif_keys enable row level security;

-- First version on purpose: generic, logs everything raw so the parser can be tightened
-- with the first real Yape/BCP notifications. Ambiguous text never becomes money.
create or replace function private.parse_notification(p_app text, p_title text, p_body text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  t text := coalesce(p_title,'') || ' ' || coalesce(p_body,'');
  m text[]; v_dir text; v_cp text;
begin
  m := regexp_match(t, 'S/\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)');
  if m is null then return null; end if;
  if t ~* '(te yape|te envi|te pag|recibiste|te transfiri|abono|abonaron|dep[oó]sito)' then v_dir := 'in';
  elsif t ~* '(yapeaste|pagaste|enviaste|transferiste|consumo|retiro|compra|pago a|pago exitoso)' then v_dir := 'out';
  else return null; end if;
  v_cp := coalesce(
    (regexp_match(t, '(?:de|a)\s+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ.*]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ.*]+){0,3})'))[1],
    nullif(btrim(p_title), ''), coalesce(p_app, 'Notificación'));
  return jsonb_build_object('direction', v_dir,
    'amount_cents', round(replace(m[1], ',', '')::numeric * 100)::bigint, 'counterparty', v_cp);
end $$;

create or replace function public.notif_claim() returns text
language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  if exists (select 1 from private.notif_keys) then
    raise exception 'notification key already issued';
  end if;
  v_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into private.notif_keys (id, key_hash) values (1, encode(sha256(convert_to(v_key, 'UTF8')), 'hex'));
  return v_key;
end $$;
revoke execute on function public.notif_claim() from public, anon, authenticated;

create or replace function public.ingest_notification(p_key text, p_app text, p_title text, p_text text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := now(); v_p jsonb; v_key text; v_status text; v_body text; v_id bigint; r jsonb;
begin
  if p_key is null or not exists (select 1 from private.notif_keys k
      where k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  v_body := left(coalesce(p_text, ''), 1000);
  -- never keep codes or keys a bank may push to the phone
  if (coalesce(p_title,'') || ' ' || v_body) ~* '(c[oó]digo|clave|token|otp|contrase)' then
    v_status := 'redacted'; v_body := '[omitido]'; v_p := null;
  else
    v_p := private.parse_notification(p_app, p_title, v_body);
    v_status := case when v_p is null then 'unparsed' else 'parsed' end;
  end if;
  v_key := encode(sha256(convert_to(coalesce(p_app,'') || '|' || coalesce(p_title,'') || '|' || coalesce(p_text,'') || '|'
           || to_char(date_trunc('minute', v_now), 'YYYY-MM-DD"T"HH24:MI'), 'UTF8')), 'hex');
  insert into public.raw_notifications (received_at, app, title, body, dedupe_key, status, parsed)
  values (v_now, left(p_app, 120), left(p_title, 300), v_body, v_key, v_status, v_p)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('duplicate', true); end if;
  if v_status = 'parsed' then
    insert into public.statement_rows (dedupe_key, country, source, kind, direction, amount_cents, currency, occurred_at,
        counterparty, counterparty_norm, is_person, message, gmail_message_id)
    values ('notif:' || v_key, 'PE', 'phone_notif',
        case when v_p->>'direction' = 'in' then 'yape_received' else 'yape_sent' end,
        v_p->>'direction', (v_p->>'amount_cents')::bigint, 'PEN', v_now,
        v_p->>'counterparty', upper(v_p->>'counterparty'), false, left(coalesce(p_title,'') || ' · ' || v_body, 300),
        'notif:' || v_id)
    on conflict (dedupe_key) do nothing;
    r := private.reconcile_statements();
  end if;
  insert into public.ingest_runs (mode, emails_seen, movements_upserted, movements_new, unparsed)
  values ('notif', 0, 0, coalesce((r->>'promoted')::int, 0), case when v_status = 'unparsed' then 1 else 0 end);
  return jsonb_build_object('status', v_status) || coalesce(r, '{}'::jsonb);
end $$;
revoke execute on function public.ingest_notification(text, text, text, text) from public, authenticated;
grant execute on function public.ingest_notification(text, text, text, text) to anon;
revoke execute on all functions in schema private from public, anon, authenticated;
