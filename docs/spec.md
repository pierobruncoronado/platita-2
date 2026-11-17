# Platita 2 — SPEC v2 (Level 3)

Owner: Piero · Language: English (consumed by Claude Code) · One master spec, edited in place.

| Rev | Date | Change | Status |
|---|---|---|---|
| v1 | 2026-10-15 | Manual capture PWA (tiles, undo, confirm income, daily close). Full text: `git show 0c8587e:docs/spec.md` | Superseded |
| v2 | 2026-11-16 | 100% automatic, read-only dashboard fed by bank notification emails. Two modes: Peru and USA | **FROZEN 2026-11-16** with the two pre-build gates below |
| v2.1 | 2026-11-16 (night) | G-COV measured at 26% → the Yape "Historial de Movimientos" file becomes a second source; account balance comes IN, computed from a balance Piero read in the app | **FROZEN**; G-COV closed, G-MOCK still open |

**Freeze note.** Piero asked to freeze without a question round ("trabaja de principio a fin sin preguntarme"), so every 🔸 was closed with its recommended default (see "Resolved decisions"); any of them reopens by editing this spec first. Two things are deliberately NOT frozen as facts because only Piero or real data can settle them, and each is a binary gate in `docs/PROGRESO.md`:
- **G-COV** — CLOSED 2026-11-16. Measured: notification emails cover 25.7% of his movements in 30 days (49 of 191) and 34% of the money out; Yape almost never emails a person-to-person yapeo (3 of 279 in 90 days). Closed by ingesting the Yape history file (v2.1): emails + file = 191 of 191.
- **G-MOCK** — the new read-only Inicio has no approved mockup (v1 boards cover Semana/Mes charts and tokens only). Inicio is not built before Piero approves the screen.

**Gate 0 (pivot):** value — v1's own stress run named the abandonment risk (capture cost > forgetting cost) and H5–H10 never got a week of real use; removing input removes the risk. Viability — Apps Script + Supabase + the existing React PWA, nothing new at the core. Timebox — Peru mode usable before 2026-12-13 (first US emails). **PASS.**

## 1. Outcome + Why
**What:** a free Android PWA that shows what Piero spent, how much, where and when — with zero typing (v2.1: his only action is sending himself the Yape history from the app from time to time). Movements come from the notification emails his banks already send to his personal Gmail; a Google Apps Script reads them hourly and writes them to Supabase; the PWA only reads.
**Why:** he does not log in the moment and never will; every account movement already leaves a record ("si se deposita, retira, transfiere o gasta, siempre deja registro"). Success = after install he never types an amount, and the weekly/monthly picture matches his bank history.

## 2. Scope / Out of scope
**In (v2):**
- Ingestion (built 2026-11-16, `ingesta/apps-script/Code.js`): BCP + Yape email parsers, dedupe, merchant → category rules, "sin clasificar", 90-day backfill, hourly trigger that doubles as the Supabase heartbeat.
- Read-only dashboard: Inicio, Semana, Mes, movement list + detail, category drill-down.
- Two modes in one app: **PE** (S/, BCP + Yape, America/Lima) and **US** ($, Bank of America + Rockland Trust, America/New_York). US ships as a skeleton; its parsers are written from the first real emails (from 2026-12-13).
- Pipeline health in the UI: last successful run, count of unparsed emails, and how old the newest Yape history is.
- (v2.1) Yape "Historial de Movimientos" ingestion: when that email (xlsx attachment, last 90 days) reaches Gmail, the script reads it; rows with a matching notification email are linked, the rest become movements. Built 2026-11-16.
- (v2.1) Account balance ("En cuenta") for PE.
- PIN lock (kept from v1) + owner-only access to the data.

**OUT (binding):**
- Any manual entry: quick tiles, Captura, keypad, edit/delete, Deshacer, "ingreso suelto", confirm expected income — the whole point of v2.
- Cash tracking — Piero: almost all his money is deposited; a withdrawal is one line, what it buys is invisible by design.
- Daily close, streak, XP/levels — they rewarded a manual habit that no longer exists; no replacement is invented.
- Expected/recurring income ("por cobrar", "atrasada", mesada/Claude templates) — needs confirmation taps.
- "Ahorro" and the Sunday close into savings — no savings ledger; the balance itself came IN with v2.1.
- Cash on hand as a tracked number — Piero mentioned S/100 in cash on 2026-11-16 and deposited it; cash stays invisible by design.
- In-app classification UI for persons/merchants — rules are added by SQL on request (= v2.1).
- Bank aggregators (Plaid, SimpleFIN ≈ $15/yr), scraping bank sites, storing bank credentials — cost or third party; Piero discarded them.
- FX conversion, goals/metas, multi-user, iOS, VPS/server of our own.

## 3. Constraints / NFRs
**Stack (component — choice — real why — discarded):**
- Reader: Google Apps Script, hourly time trigger, in Piero's personal Google account — runs free next to the mailbox, no server, no OAuth app to maintain — discarded: n8n/VPS (cost, upkeep), Gmail API from the PWA (token in a public bundle).
- Store: Supabase Postgres, project `platita` (ref `ekyoqpucufzhykuxfajc`, us-east-1, Free) — one place both the script and the phone reach, SQL for totals — discarded: Google Sheet as DB (no row-level security, weak dedupe). Free projects pause after ~7 days of low database activity (supabase.com/docs/guides/platform/pausing, read 2026-11-16); the hourly run always writes one `ingest_runs` row, so the script is the heartbeat.
- App: the existing Vite + React + TS PWA on GitHub Pages (public repo) — already installed on his Android and styled — discarded: rewriting.
- Read path: supabase-js with the publishable key + Supabase Auth (email one-time link, one owner) + RLS — the repo and bundle are public, so nothing readable without the owner's session. IndexedDB (Dexie) keeps the last fetch so the app opens offline.
- **Security/privacy:** this reverses v1's "data never leaves the device" — movements now live in Piero's own Supabase project (his call, 2026-11-16). RLS is enabled with no policy for `anon` on every table. Writes go only through `public.ingest_batch(p_key, p_payload)`; the key is generated inside the script (Script Properties) and the database stores only its SHA-256 (`private.ingest_keys`), so no secret is ever pasted or committed. No `service_role` key anywhere. No analytics, no third-party scripts. Test fixtures in the repo are sanitized (third-party names, phone, card, student code replaced).
- **Money:** integer cents + currency per movement. Never add PEN and USD.
- **Time:** week = Mon 00:00–Sun 23:59 in the MODE's zone (PE America/Lima, US America/New_York), never the device zone. PE emails print Lima wall-clock time (fixed −05:00). US parsers must take the instant from the email's own date, because New York has DST.
- **Freshness:** hourly trigger → a movement can take up to ~1 h to appear. Baseline first; no ms/min thresholds invented.
- **Cost:** $0 recurring (Supabase Free, Apps Script consumer quota, GitHub Pages). Anything that would cost money is flagged before building.
- **Demonstrability:** N/A by design — personal tool on private bank data.
- **CI:** lint + deterministic unit tests (`node ingesta/test/run.mjs` included). Nothing in CI touches Gmail or Supabase.

## 4. Closed decisions (do not relitigate)
- **Source of truth = notification emails**, verified in his Gmail 2026-11-16: `notificaciones@notificacionesbcp.com.pe` (debit card purchase incl. `PLIN-…` and `IZI*…` merchants and USD charges, ATM deposit, ATM withdrawal, refund, Yape received) and `notificaciones@yape.pe` (Yape sent to a person, payment to a merchant, Yape Promos, service payment). About 45 BCP emails per 30 days.
- **Dedupe key** = `source:kind:operation_id:local_date`. Operation numbers alone are NOT unique (ATM ops are 4 digits: "5959", "2754"). "Yape received" carries no operation number → `source:kind:minute:amount:sender`.
- **One payment, two emails:** a Yape Promos purchase sends "Constancia de Transferencia" (the movement, merchant "Yape Promos") and "Tu compra de <X> fue exitosa" (no op number). The second is a *hint*: same source, same amount, within 3 minutes → it renames the merchant to X; it never creates a second movement.
- **Never guess, never drop:** an email from a known sender that does not parse completely is stored as `unparsed` with its text; a movement is created only with amount + date + (operation id or the no-op key) + counterparty where the type has one.
- **Categories (seeded only from merchants seen in real emails):** tiendas (TAMBO, MASS), supermercado (PVEA), delivery (RAPPI), comida (BEMBOS), suscripciones (ANTHROPIC), entretenimiento (CINEMARK, HAPPYLAND), apuestas (BETANO), educacion (UPC); by kind: efectivo (ATM withdrawal), deposito (ATM deposit — the email has no sender name, so the origin is unknowable), recibido_persona, devolucion. Everything else, incl. every payment to a person (`PLIN-<NAME>`, Yape sent), is **sin_clasificar** with the name visible. Rules live in `public.category_rules` (contains / prefix / exact + priority); `private.recategorize_all()` re-applies them.
- **Flow, not balance:** per period, `out` = Σ outgoing − Σ refunds, `in` = Σ incoming (deposits + received), `net = in − out`. ATM withdrawals count as outgoing under "Efectivo".
- **Balance (v2.1):** `balance = newest row of balance_anchors + Σ PEN movements after it`. The anchor is a number Piero read in the app (first: 2026-11-16 21:04 Lima; the value lives only in the database, never in this public repo). It is never back-computed from history: the 2026-11-07 Claude charge arrived as US$ 23.60 and its soles are not in any email, so a derived balance drifts. A new anchor is added whenever he reports a balance; the app shows the anchor's age.
- **Statement rows vs emails (v2.1):** the Yape history is the complete list (it also contains QR/card payments), the emails are the richer copy (operation number, exact merchant). Link one-to-one by direction + amount + currency within 3 minutes; an unlinked row becomes a movement (`source = yape_report`, names as Yape masks them, e.g. "Nombre Ape*"); if its email shows up later, the email replaces that copy. The file covers 90 days, so re-sending is idempotent and nothing is lost between sends.
- **Person vs merchant in the history:** a counterparty ending in `*` or starting with a wallet prefix (`PLIN - `, `BIM - `…) is a person; an inner asterisk (`IZI*MARKET…`) is a merchant.
- **USD charge on the soles account** (e.g. ANTHROPIC $23.60): stored and listed in USD, shown on its own "En dólares" line, excluded from S/ totals. The soles actually debited are not in the email; no rate is invented.
- **Modes:** a mode = `country` filter (PE | US) with its currency, zone and banks. One app, one switch; the last mode is remembered on the device.
- **Colors (kept):** green = money in, amber/red = status only (stale data, unparsed emails), never category colors. Category colors are new tokens set at G-MOCK.
- **Honest limits shown to Piero, not hidden:** what he bought inside a store, who made an ATM deposit, and what cash was spent on do not exist in the data.

## Visual Direction (rule 11)
| # | Source | What we take |
|---|---|---|
| 1 | v1 approved boards `docs/design-reference/{Semana,Mes}.dc.html` (Piero: "está perfecto") | Dark theme, tokens, donut, per-day and per-week bars, card shapes |
| 2 | **Pending — G-MOCK:** single-file HTML mockup of the read-only Inicio with real data from Supabase, approved by Piero → `docs/design-reference/Inicio-v2.html` | Layout of the main screen, movement row, category colors for the new taxonomy |

**Frozen tokens (unchanged):** bg #0D1117 · surface #151B25 · border #263041 · text #F3F6FA · muted #93A0B4 · green #2BF5A0 · amber #FFB224 · red #FF5D73 · gold #F7C948. Type: Sora (numbers) + Figtree (body). Targets ≥44 px. v1 boards Main/Captura/Ingresos are dead references.
**VA-1:** at each UI milestone close, screenshot (390×844) side by side with the reference for that screen; FAIL on generic drift (default shadows, Inter-everywhere, blue/gray creep).

## 5. Acceptance criteria (EARS)
1. WHEN a supported notification email arrives, THE SYSTEM SHALL, at the next hourly run and with no user action, store exactly one movement with amount (integer cents), currency, local date-time, counterparty, operation id and source.
2. WHEN the same operation is read again (overlapping 2-day window, backfill re-run, duplicate email), THE SYSTEM SHALL NOT create a second movement.
3. WHEN an email from a known sender cannot be fully parsed, THE SYSTEM SHALL keep it as `unparsed` with its text AND the dashboard SHALL show how many are waiting; it SHALL NOT create a partial movement or drop it.
4. WHEN a counterparty matches a rule, THE SYSTEM SHALL assign that category; otherwise, and for every payment to a person, "Sin clasificar" with the name visible.
5. WHEN Piero opens the app, THE SYSTEM SHALL show, for the selected mode and period (week / month), money out, money in, net, spend by category, spend by day, and every movement (what, how much, where, when) AND SHALL NOT offer any control that creates, edits or deletes a movement.
6. WHEN the newest `ingest_runs` row is older than 3 hours (3 missed hourly runs), THE SYSTEM SHALL show "Datos desactualizados desde <hora>" in amber.
7. WHEN there is no owner session, THE API SHALL return no rows from any table, AND the app SHALL require the PIN before showing any amount.
8. WHEN the mode is PE, THE SYSTEM SHALL total only PEN movements of country PE (USD listed apart); in US mode only USD of country US.
9. WHEN a Yape Promos hint matches a movement, THE SYSTEM SHALL show the real merchant on that single movement.
10. VA-1 (see Visual Direction).
11. WHEN a Yape history email arrives, THE SYSTEM SHALL store every row once, link each row to at most one existing movement (same direction, amount and currency within 3 minutes) and create a movement for each unlinked row; re-reading the same or an overlapping history SHALL NOT change any total.
12. WHEN a notification email arrives for a payment already created from a history row, THE SYSTEM SHALL keep one movement (the email's).
13. WHEN Piero opens the app in PE mode, THE SYSTEM SHALL show the balance as anchor + movements since, with the anchor's date, AND SHALL show in amber when the newest Yape history is older than 7 days (the balance may miss yapeos).

## 6. Task breakdown (→ `docs/PROGRESO.md`)
- H0 — Pipeline live: schema applied, script authorized, 90 days loaded, hourly trigger running.
- H1 — **G-COV** coverage test → done 2026-11-16: 26% by email alone; closed with the Yape history route (v2.1).
- H2 — Repo to v2: delete dead v1 modules, pull the Supabase migration into `supabase/migrations/`, parser tests in `npm test`/CI.
- H3 — Read path: Supabase Auth owner + select-only RLS policies, data layer with offline cache, PIN kept.
- H4 — **G-MOCK** then Inicio (read-only).
- H5 — Semana + Mes + movement list/detail + category drill-down.
- H6 — Mode switch PE/US, stale-data banner, unparsed counter.
- H7 — One week of real use on his Android (he only looks).
- H8 — US mode: alerts on, parsers from the first real BofA/Rockland emails (from 2026-12-13).

## 7. Flows = evals
1. (AC1) Real BCP email "consumo S/ 6.39 en IZI*AVIACION C3*001048272, 15 nov 11:28 AM, op 92938819" → one PEN movement, 639 cents, 2026-11-15T11:28−05:00, merchant normalized "AVIACION C3". *(automated: fixtures)*
2. (AC2, judgment) ATM deposits with op "5959" on 30 Oct and op "5959" on 31 Oct → two movements; the 30 Oct email read twice → one. A "dedupe by operation number" implementation fails the first half. *(automated)*
3. (AC9, judgment) Yape Promos S/ 8.90 at 15:18 + "Tu compra de Bembos fue exitosa" S/ 8.9 at 15:18 → ONE movement, merchant Bembos, category comida. Naive result: two expenses, S/ 17.80.
4. (AC3) A BCP subject never seen ("Constancia de Transferencia a terceros") → no movement, `raw_emails.status = unparsed` with text, dashboard shows "1 correo sin leer". *(parser half automated)*
5. (AC4) "PLIN-<NOMBRE>" S/ 6.00 → sin_clasificar, person, name visible; "IZI*TAMBO ANGAM*001039243" → tiendas.
6. (AC8) ANTHROPIC* CLAUDE SUB $ 23.60 in PE mode → week total in S/ unchanged; row shows US$ 23.60 under "En dólares".
7. (Behavioral, real language) Sunday night Piero wonders "¿en qué se me fue la plata esta semana?" and then "¿cuánto llevo en Rappi este mes?" → both answered without typing anything, in ≤2 taps each (Semana → category; Mes → Delivery → rows with place and time). Fails if any answer needs input, a search box, or a filter form.
8. (Real-world formats) the three date spellings actually seen — "12 de setiembre de 2026 - 01:24 PM", "03 sept. 2026 - 03:18 p. m.", "13 Ago. 2026 - 08:30 pm" — parse to the right Lima instant; 12:05 AM → 00:05. *(automated)*
9. (AC6) newest `ingest_runs` 4 h old → amber stale banner with the time; 30 min old → none.
10. (AC7) request with only the publishable key → `select` on `movements` returns 0 rows; `ingest_batch` with a wrong key → error, nothing written.
11. (Time, kept from v1) phone in New York, mode PE: a movement at Sun 23:58 Lima stays in that week, Mon 00:01 Lima in the next.
12. (AC5) every screen: no button, field or gesture that writes data (checked at each UI milestone).
13. (AC11, judgment — real case 2026-09-09) a S/ 20 Plin payment at 21:23 with a BCP email and a S/ 20 yapeo to another person at 21:23:25 with no email → TWO movements. A "same amount within 3 minutes = duplicate" rule without one-to-one linking deletes a real payment.
14. (AC11) the real history of 431 rows over 147 email movements → 90 linked, 341 created, 488 movements; sending the same history again → 0 new, totals unchanged. *(first half verified on real data 2026-11-16; the re-read half is covered by a unit test on key stability and by `reconcile_statements()` returning 0/0/0 on a second pass — confirm on the first hourly run that re-reads the history email)*
15. (AC12) history ingested at 21:00 containing an 18:21 QR payment whose BCP email is read at the 21:42 run → one movement, with the operation number.
16. (AC13, behavioral) Piero asks "¿cuánto tengo?" right after depositing S/ 100 at an ATM → within the next hourly run the balance rises by exactly 100.00 with no action from him.

## Resolved decisions (2026-11-16, defaults taken on Piero's standing instruction)
1. ✅ No Sunday close into savings. Balance: revisited after G-COV → IN from v2.1, anchored on a balance read by Piero.
2. ✅ Refunds reduce spending; they are not income.
3. ✅ USD charges on the PEN account stay in USD, outside S/ totals.
4. ✅ Dashboard login = Supabase Auth email link for one owner; public sign-ups disabled once the owner exists.
5. ✅ Stale threshold = 3 h (3 missed runs); tune after a week of real runs.
6. ✅ Apps Script uses the default Gmail scope it requests on first run (certain to work); narrowing to read-only via the advanced Gmail service is an H2 hardening task.
7. ✅ Category taxonomy above; unknown merchants stay "Sin clasificar" until Piero names them.

## Stress checklist
- [x] Scope shippable; the ingestion half already exists and is tested (24 checks on sanitized real emails) and live since 2026-11-16.
- [x] "Works" = AC + evals above; coverage is a gate, not an assumption.
- [x] External lead time: Piero's authorization of the script; BofA/Rockland alerts on before 13 Dec; his real history for G-COV.
- [x] Level 3 justified: whole-project pivot that deletes approved features.
- [x] Minimums: 10 criteria, 12 evals incl. behavioral (#7) and judgment (#2, #3).
- [x] Stack per component with real why + discarded alternative.
- Known gaps (UNVERIFIED, do not freeze as fact): why Yape emails only some yapeos (3 of 279); whether the gap between the balance back-computed from v1's opening figure and the real one is only the Nov Claude charge — that would mean about 3.87 soles per dollar vs SUNAT ≈ 3.43 that day, so up to ~S/ 10 may be an unseen movement or fee; whether Yape shows a phone notification when SENDING (decides if notification forwarding can replace the manual history send); whether BofA allows a $0 threshold and prints the merchant; what Rockland's email alerts contain (real-time card alerts are documented only for its SecurLOCK Equip app).

## Life-cycle loop
Any change → edit this spec first, then code; divergence → code bends to spec unless the spec is wrong, then log it in `docs/DECISIONS.md` and add a row to the revision table.
