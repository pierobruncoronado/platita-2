# DECISIONS — Platita 2
Format per entry: **Qué / Por qué / Cómo / Trade-off / Gotcha**. Newest first.

## 2026-10-15 — H1 scaffold: PWA + Dexie + fixed timezone + opening balance
- **Qué:** Vite 8 + React 19 + TS 6 PWA (vite-plugin-pwa 2, generateSW), Dexie 4 schema v1 (`movements`, `settings`), idempotent seed (`timezone=America/Lima`, `openingBalanceCents=23084`, `openingBalanceAt=2026-10-15T19:31Z`), single "En cuenta" card.
- **Por qué:** spec §6 H1. Assumed 🔸1 (Ahorro = En cuenta, one number) and 🔸4 (GitHub Pages) per the "frozen with defaults" entry below. Timezone fixed to Lima until H5 (Piero, 2026-10-15).
- **Cómo:** `src/db/seed.ts` only adds missing keys inside one rw transaction (safe under StrictMode double-run). `formatSoles` rejects non-integer cents; `getOpeningBalanceCents` fails closed on corrupt data and the UI shows an error instead of a wrong number. Fonts self-hosted via `@fontsource` (no third-party requests, cached offline). `base: './'` so the build works under a Pages sub-path.
- **Trade-off:** `movements` schema declared but unused until H2; balance = opening balance only (no weekly_net yet).
- **Gotcha:** SW cache versioning comes from Workbox precache revisions (content hashes) + `cleanupOutdatedCaches` + `registerType: 'autoUpdate'`; verify the update path on the phone at first real deploy. Playwright `setOffline` did NOT flip `navigator.onLine`, so offline was proven by killing the preview server instead. Maskable icon has transparent rounded corners (content inside safe zone) — revisit only if Android shows it badly. Spec file on disk is `docs/SPEC.md` while docs reference `docs/spec.md` (fine on Windows, breaks on case-sensitive FS) — pending Piero's call.

## 2026-10-15 — Spec frozen with defaults
- **Qué:** SPEC level 3 frozen; 6 open decisions closed with recommended defaults.
- **Por qué:** Piero asked for the kickoff without changing any of them.
- **Cómo:** see `docs/spec.md` §"Resolved decisions".
- **Trade-off:** Supabase sync and goals deferred to v2.
- **Gotcha:** Claude real cost (S/87) and biometric support on his Android are UNVERIFIED.
