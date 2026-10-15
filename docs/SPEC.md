# Platita 2 — SPEC (Level 3, DRAFT — not frozen until every 🔸 is resolved)

Owner: Piero · Date: 2026-10-15 · Language: English (consumed by Claude Code)
Design reference (approved by Piero, "está perfecto"): Claude Design canvas "Platita 2 — diseño de la app" (https://claude.ai/artifact/FUMSv5v1mtNQaPVb5CVXBw), 5 boards: Main (Inicio), Semana, Mes, Captura, Ingresos. All numbers in the boards are SAMPLE data except opening balance and the S/130 owed.

## 1. Outcome + Why
**What:** A free, local-first Android PWA that tracks Piero's weekly money flow (income in, expenses out), surplus to savings, with one-tap expense capture, confirm-on-receipt for expected income, a daily "close the day" habit loop, and a full-data export for LLM analysis.
**Why:** Piero does not know where small ("hormiga") spending goes. Failure mode he named: if he does not log in the moment, he never logs it. Success = he logs in ≤1–3 taps, closes the day, and after 4 weeks has a measured baseline of his real weekly hormiga spend (goals are set from that baseline, not guessed).

## 2. Scope / Out of scope
**In (v1):**
- Quick-expense tiles (Pasaje S/2, Bebida S/3, Snack S/7, Taxi S/10, Alcohol S/25, Otro monto); amounts are editable defaults, not fixed values.
- Manual entry screen (numeric keypad, category + subtype chips, note, date/time chip, Guardar) with Undo.
- Income: free-form sources/amounts; recurring templates with expected windows; "Esperado" items confirmed with one tap (partial confirmation supported).
- Weekly view (Mon 00:00–Sun 23:59, user timezone): hormiga donut by category, per-day stacked bars, expected-income card, Sunday close → Savings.
- Monthly view: income vs expenses, category donut, per-week bars, "te quedó", baseline-measurement card.
- Daily close ("Cierra el día", ≤30 s, "¿falta algo?"), streak, XP/levels.
- PIN lock (biometric if the spike passes).
- Export all data (CSV + JSON) in one tap.
- Opening balance import (single number).

**OUT (binding):**
- Voice dictation — Piero rejected it ("no me convence").
- "Modo salida" / exit-night reserve / any fixed alcohol amount — Piero: alcohol is variable, not fixed; no modes exist.
- Goals / "metas" / savings envelopes — = v2; first measure 4 weeks of real spending; savings is for leisure only for now.
- WAT mode (USD, 5% tax set-aside, cash tips, rent, Low/Medium/High projection) — Piero: can wait.
- Historical import of past months — Piero: only today's balance.
- Multi-device, laptop, iOS, multi-user — Android phone only.
- Server sync (Supabase) — = v2 (see 🔸3).
- Auto-learning of recurring expenses — tiles are fixed/editable in v1; learning = v2.
- Streak grace days — Piero: streak breaks at 3 missed days.

## 3. Constraints / NFRs
**Stack (component — choice — real why — discarded):**
- App shell: PWA (Vite + React + TypeScript, vite-plugin-pwa) — installs from Chrome on Android with no Play Store, free, Claude Code builds it fast — discarded: native Kotlin/Flutter (store friction, slower iteration).
- Storage: IndexedDB via Dexie, local-first, all logic offline — zero server/maintenance is a hard rule — discarded: Supabase-first (free projects may pause when inactive — my recollection, not verified for 2026; contradicts "sin mantenimiento").
- Hosting: static free host (GitHub Pages or Cloudflare Pages) — cost S/0 — discarded: any VPS.
- Lock: PIN (salted hash) in v1; WebAuthn platform authenticator (fingerprint) as a timeboxed spike — works for installed PWAs per my understanding, UNVERIFIED on Piero's device.
- Time: all week/day boundaries use a user-configured IANA timezone (default America/Lima), NOT the device clock zone.
- Money: integer cents internally; display S/ with up to 2 decimals.
- **Security/privacy:** data stays on-device; no analytics; no third-party scripts; PIN gate on open and after 60 s in background (🔸 default).
- **Latency:** baseline first, then fix the number. Target to measure: cold open → expense logged ≤3 taps for tiles; do not invent ms thresholds.
- **Cost:** S/0 recurring. If anything would cost money, flag it before building.
- **Data safety:** weekly export reminder (CSV+JSON to Downloads) because local data dies with the phone.
- **Demonstrability:** N/A by design — personal tool, no stranger demo. (Stated explicitly per rule 5.)
- **CI:** lint + deterministic unit tests of the money engine (pure functions, no real APIs/DB in CI). No evals hit real services.

## 4. Closed decisions (do not relitigate)
- **Weekly flow model:** The week measures flow, not history. `weekly_net = Σ confirmed income dated in week − Σ expenses dated in week`. Unconfirmed expected income NEVER counts. Source: Piero ("solo vamos a tener en cuenta el dinero que tengo a la semana").
- **Sunday close:** at Sun 23:59 (user TZ) `Savings += weekly_net`, automatically; negative net is deducted from Savings. Nothing else carries over.
- **Income date:** counts in the week of its confirmation date; income confirmed Sun 23:59 counts that week, Mon 00:00 counts the next.
- **Opening balance:** Savings starts at S/230.84 (Piero, 2026-10-15 14:31 Lima). During the week, "En cuenta" = Savings at week start + live weekly_net.
- **Two numbers always visible:** confirmed (real) and "if expected arrives" (translucent state). Expected state = dark grayish-green translucent with dashed border; confirmed = bright green #2BF5A0. Overdue expected = amber tag "atrasada".
- **Recurring templates:** mesada papá S/100 weekly (day varies, window = the week); abuelo ~S/80 every 2 weeks (variable); Claude reimbursement S/80 fixed monthly, window day 7–14, partial payments leave the remainder "por cobrar" (e.g., S/50 received, S/30 pending). Past the window → "atrasada", never silently dropped.
- **Claude cost:** charged on day 7 of each month, real cost ≈ S/87 (Piero's recollection, UNVERIFIED), reimbursement fixed S/80, Piero absorbs the difference. Registered by Piero manually; counted as an expense (category Otros) the week it is charged; reimbursement counts as income the week it is confirmed.
- **Alcohol is not fixed:** logged like any expense, any amount; S/25 is only the tile default (Piero's habitual max).
- **Colors (semantic):** green = income/on track; amber/red only for status vs a limit (never category colors); gold = savings. Categories: Transporte orange #FF8A3D, Comida pink #FF5CA8, Bebidas cyan #3FD6E6, Alcohol violet #A878FF, Otros gray #7F8AA0.
- **Gamification rule:** rewards the habit of CLOSING the day, never amount spent and never number of records (a record-count reward would incentivize junk entries or spending). Streak = consecutive closed days; breaks when 3 consecutive days pass without a close. XP/levels exist but derive only from closed days.
- **Export is a core feature**, not an afterthought: one tap, full metadata, built so an LLM can analyze it (Piero's stated use).
- **Honest caveat (kept from the stress run):** capture cost > forgetting cost in the moment is the main abandonment risk; Piero declined a 7-day probe and prefers build-then-iterate. Success is measured by real use, not simulated.

## Visual Direction (rule 11)
| # | Source | What we take |
|---|---|---|
| 1 | Approved Claude Design canvas above (to ship as `docs/design-reference.html` export) | Layout, dark theme, tokens, component shapes, chart language |

**Frozen tokens:** bg #0D1117 · surface #151B25 · border #263041 · text #F3F6FA · muted #93A0B4 · green #2BF5A0 (on-green text #04140D) · expected fill rgba(90,130,110,0.38) + dashed #5E8C77 · amber #FFB224 · red #FF5D73 · gold #F7C948 · categories as in §4. Type: Sora (numbers/display) + Figtree (body). Touch targets ≥44 px. Base: custom CSS or Tailwind; no default shadcn styling needed.
**VA-1:** at each UI milestone close, side-by-side screenshot vs the matching board; FAIL on generic drift (default shadows, Inter-everywhere, blue/gray palette creep). Log PASS/FAIL in docs/DECISIONS.md.
**Anti-hallucination:** copy the reference or ask; deviating from tokens = scope drift.

## 5. Acceptance criteria (EARS)
1. WHEN Piero taps a quick tile, THE SYSTEM SHALL create one expense with the tile amount/category at the current time in ≤1 tap, show "Deshacer" for 5 s, and NOT ask for confirmation.
2. WHEN a week ends (Sun 23:59 in the user timezone), THE SYSTEM SHALL add `weekly_net` to Savings exactly once, even if the app was closed (reconcile on next open), AND NOT count unconfirmed expected income.
3. WHEN an expected income is confirmed (full or partial), THE SYSTEM SHALL create a confirmed income dated now, turn that state bright green, and keep any remainder as "por cobrar".
4. WHEN `weekly_net` is negative, THE SYSTEM SHALL deduct it from Savings and display it without rewarding or shaming language.
5. WHEN the expected window of a recurring item has passed without confirmation, THE SYSTEM SHALL mark it "atrasada" (amber tag) and keep it counted in "if expected arrives", NOT in confirmed.
6. WHEN 3 consecutive days pass without a daily close, THE SYSTEM SHALL reset the streak to 0.
7. WHEN Piero taps Exportar todo, THE SYSTEM SHALL produce CSV and JSON containing every movement (id, type, amount, category, subtype, note, occurred_at, created_at, week_id, source/recurring_id, status confirmed/expected, undone flag) plus settings (timezone) and opening balance.
8. WHEN the app is opened or returns from >60 s in background, THE SYSTEM SHALL require the PIN (or biometric if enabled) before showing any amount.
9. VA-1 (see Visual Direction).

## 6. Task breakdown (→ H1..Hn)
- [ ] H1 — Scaffold PWA + Dexie schema + timezone setting + opening balance 23084 cents → app opens offline, balance shows S/230.84.
- [ ] H2 — Money engine (pure functions): weekly_net, Sunday close/reconcile, expected/overdue/partial logic → unit tests green.
- [ ] H3 — Captura screen + quick tiles + Undo → tile tap logs expense in 1 tap.
- [ ] H4 — Ingresos screen: confirmed/expected/recurring, partial confirm → states match board.
- [ ] H5 — Inicio + Semana views (donut, daily stacked bars, two numbers).
- [ ] H6 — Mes view + baseline card.
- [ ] H7 — Daily close + streak + XP.
- [ ] H8 — PIN lock; biometric spike (timebox 1 session, fallback PIN).
- [ ] H9 — Export CSV/JSON + weekly export reminder.
- [ ] H10 — Install on Piero's Android, 1 week of real use, log findings in DECISIONS.md.

## 7. Flows = evals (≥8)
1. (AC1) Tap Pasaje at 08:05 → 1 expense S/2 Transporte; tap Deshacer within 5 s → expense marked undone and excluded from totals.
2. (AC2) Week with income 130 confirmed and expenses 34 → at Sun 23:59 Savings += 96.
3. (AC2, judgment) Phone timezone changes to America/New_York but setting stays America/Lima → week boundaries do NOT move; an income confirmed Sun 23:58 Lima counts in that week, Mon 00:01 Lima in the next. Naive device-clock implementation fails.
4. (AC3) Reposición S/80, confirm S/50 → S/50 income green, S/30 stays expected "por cobrar".
5. (AC4) Week with expenses 87 (Claude) and no income → net −87, Savings 230.84 → 143.84.
6. (AC5) Mesada papá week with no confirmation by Thursday → "atrasada", included in "si llega lo esperado", excluded from confirmed.
7. (AC6) Close day Mon, no close Tue/Wed/Thu → streak 0 on Fri morning; close Mon, skip Tue, Wed → streak alive (only 2 missed).
8. (AC7) Export after logging 3 expenses, 1 undone, 1 partial income → JSON has all records incl. undone flag and status; CSV row count matches.
9. (Behavioral, real language) Piero buys "pan y empanada" for 7 soles: opens app, taps Snack → 1 tap, note empty is accepted; later he edits the note to "pan y empanada" without changing the amount.
10. (Out-of-domain) Piero enters an amount of 0 or leaves the amount blank → Guardar is disabled; nothing is created.
11. (AC8) App backgrounded 90 s → PIN screen appears, no amounts visible in the app-switcher state (best effort).

## 🔸 Open decisions (each with recommendation)
1. 🔸 Is "Ahorro" the same number as "En cuenta" (single balance, opening S/230.84)? **Recommend: yes**, one number; no second ledger.
2. 🔸 Biometric unlock: spike 1 session, fall back to PIN if it fails on his Android. **Recommend: yes.**
3. 🔸 Backup: v1 = local + weekly manual export; Supabase optional sync only after 2 weeks of daily use. **Recommend: yes** (avoids free-tier pause risk, unverified).
4. 🔸 Hosting: GitHub Pages (S/0). **Recommend: yes.**
5. 🔸 XP/level thresholds are placeholders to tune after real use (no invented numbers frozen). **Recommend: ship `level = floor(sqrt(closed_days))` as placeholder and revisit at week 4.**
6. 🔸 PIN re-lock after 60 s in background. **Recommend: yes.**

## Stress checklist
- [x] Scope shippable; v1 items essential.
- [x] "Works" measured by criteria + evals above.
- [x] External lead time: none (no API keys); Piero's Android needed for H8/H10.
- [x] Decisions → docs/DECISIONS.md.
- [x] Level 3 justified: whole project, wrong interpretation (e.g., adding a fixed alcohol reserve) already happened once in this design.
- [x] UI: Visual Direction + VA-1 present.
- [x] Minimums: 9 criteria, 11 evals incl. behavioral (#9) and judgment (#3).
- [x] Stack per component with real why + discarded alternative.
- Known gaps: Claude real cost S/87 unverified; XP thresholds placeholder; opening balance is Piero's figure.

## Life-cycle loop
Any change → edit this spec first, then code; divergence → code bends to spec unless spec is wrong, then log in docs/DECISIONS.md.
