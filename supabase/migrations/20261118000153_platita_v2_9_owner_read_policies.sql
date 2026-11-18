-- Copy of the migration applied to Supabase via apply_migration (platita_v2_9_owner_read_policies).
-- H3: read-only access for the single owner. Writes stay exclusive to the SECURITY DEFINER ingest RPCs.
-- Sanitized copy: the applied migration pins the owner's Supabase Auth user id where '<OWNER_AUTH_UID>' appears
-- below; the value is omitted from this public repo (the login email and password live only in the Dashboard).

-- Layer 1 (privileges): the client roles cannot write at all.
revoke insert, update, delete, truncate, references, trigger on public.movements from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.balance_anchors from anon, authenticated;

-- Layer 2 (RLS): only the owner's session can SELECT; anon gets no policy, hence 0 rows.
create policy owner_select_movements on public.movements
  for select to authenticated
  using ((select auth.uid()) = '<OWNER_AUTH_UID>'::uuid);

create policy owner_select_balance_anchors on public.balance_anchors
  for select to authenticated
  using ((select auth.uid()) = '<OWNER_AUTH_UID>'::uuid);
