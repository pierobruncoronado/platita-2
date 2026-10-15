# DECISIONS — Platita 2
Format per entry: **Qué / Por qué / Cómo / Trade-off / Gotcha**. Newest first.

## 2026-10-15 — H2 money engine (pure functions)
- **Qué:** `src/domain/time.ts` (ISO weeks in the configured IANA zone via Intl), `flow.ts` (`weeklyNet`, `closedWeeks`, `balanceAt`), `expected.ts` (recurring templates → instances, `expectedStatus`, `confirmExpected`, `ifExpectedArrives`). Evals 2–6 in `money.eval.test.ts`.
- **Por qué:** spec H2 / AC2–AC5. Spec fix first: mesada window = Mon–Thu (eval 6 wins over "window = the week"; Piero, 2026-10-15).
- **Cómo:** **Savings is derived, not accumulated**: savings at week start = opening + Σ weekly_net of all earlier weeks; Sunday close = `closedWeeks()` up to now. Code review found the accumulated design (persisted `lastClosedWeekId`) silently lost movements backdated into, or undone after, a closed week; derived = each movement counts exactly once by construction, and reconcile-on-open is just recomputation. Confirmations are income movements with `recurringId = "<templateId>:<periodKey>"`, so movements stay the single source of truth and generation is idempotent. Movements before `openingBalanceAt` never count (already inside S/230.84). Over-payment of an expected item is allowed (variable amounts); 0/negative/fractional is rejected.
- **Trade-off:** recomputes from all movements each call (fine at personal scale; revisit if open feels slow). `generateExpected` re-walks every period since `activeFrom` and returns settled history (review #6, skipped: ~90 items/year). Changing the timezone setting (H5) re-attributes boundary movements to different weeks in history — totals stay correct, history shifts.
- **Gotcha:** `startOfCivilDay` handles zones where DST skips midnight (verified: America/Santiago 2026-09-06, Havana 03-08, Beirut 03-29 start at 01:00). Stored `Movement.weekId` is a snapshot the engine never reads — export (H9) must recompute it from occurredAt + tz. `ExpectedItem.templateId` is nullable on purpose for one-off "Esperado" items (H4). With W42 opening on Thu 14:31, a mesada template active from opening generates a W42 instance — set `activeFrom` deliberately in H4. `npm test` excludes `*.eval.test.ts` (CI = unit only); evals via `npm run test:evals`. RTK's vitest filter can write `.vitest/` reports (gitignored); use `rtk proxy` for verbose runs.

## 2026-10-15 — H1 scaffold: PWA + Dexie + fixed timezone + opening balance
- **Qué:** Vite 8 + React 19 + TS 6 PWA (vite-plugin-pwa 2, generateSW), Dexie 4 schema v1 (`movements`, `settings`), idempotent seed (`timezone=America/Lima`, `openingBalanceCents=23084`, `openingBalanceAt=2026-10-15T19:31Z`), single "En cuenta" card.
- **Por qué:** spec §6 H1. Assumed 🔸1 (Ahorro = En cuenta, one number) and 🔸4 (GitHub Pages) per the "frozen with defaults" entry below. Timezone fixed to Lima until H5 (Piero, 2026-10-15).
- **Cómo:** `src/db/seed.ts` only adds missing keys inside one rw transaction (safe under StrictMode double-run). `formatSoles` rejects non-integer cents; `getOpeningBalanceCents` fails closed on corrupt data and the UI shows an error instead of a wrong number. Fonts self-hosted via `@fontsource` (no third-party requests, cached offline). `base: './'` so the build works under a Pages sub-path.
- **Trade-off:** `movements` schema declared but unused until H2; balance = opening balance only (no weekly_net yet).
- **Gotcha:** SW cache versioning comes from Workbox precache revisions (content hashes) + `cleanupOutdatedCaches` + `registerType: 'autoUpdate'`; verify the update path on the phone at first real deploy. Playwright `setOffline` did NOT flip `navigator.onLine`, so offline was proven by killing the preview server instead. Maskable icon has transparent rounded corners (content inside safe zone) — revisit only if Android shows it badly. Spec file was `docs/SPEC.md` while docs referenced `docs/spec.md` — renamed to `docs/spec.md` (Piero, 2026-10-15) so case-sensitive CI won't break.

## 2026-10-15 — Spec frozen with defaults
- **Qué:** SPEC level 3 frozen; 6 open decisions closed with recommended defaults.
- **Por qué:** Piero asked for the kickoff without changing any of them.
- **Cómo:** see `docs/spec.md` §"Resolved decisions".
- **Trade-off:** Supabase sync and goals deferred to v2.
- **Gotcha:** Claude real cost (S/87) and biometric support on his Android are UNVERIFIED.
