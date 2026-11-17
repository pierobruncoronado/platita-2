# Kickoff — Platita 2 (v2 automática, 2026-11-16)

## Dónde está cada cosa
- `CLAUDE.md` (raíz) · `docs/spec.md` (v2 congelado) · `docs/PROGRESO.md` (estado) · `docs/DECISIONS.md` (porqués)
- `ingesta/apps-script/Code.js` — script de Gmail → Supabase (única copia; se pega en script.google.com)
- `ingesta/test/` — `node ingesta/test/run.mjs` (29 pruebas, correos e historial reales saneados)
- Supabase: proyecto `platita` (`ekyoqpucufzhykuxfajc`); el esquema vive en su historial de migraciones hasta que H2 lo traiga a `supabase/migrations/`

## Primera sesión de v2 (pegar en Claude Code)
Platita 2 cambió a v2: dashboard de solo lectura alimentado por correos. Lee `CLAUDE.md`, `docs/spec.md`, `docs/PROGRESO.md` y la entrada del 2026-11-16 en `docs/DECISIONS.md`. Antes de tocar código: `git status`, confirma que `.gitignore` cubre `.env` y exports, y que `ingesta/test/fixtures.json` no tiene nombres reales. Corre `node ingesta/test/run.mjs` y muéstrame la salida. Luego anúnciame milestone activo y gates pendientes, y propón el objetivo único de hoy con un plan de 5-8 pasos. No construyas Inicio antes de G-MOCK (H4). Espera mi OK.

## Cada sesión siguiente
Continúa. Lee `docs/PROGRESO.md`, anúnciame nodo/milestone actual y gates pendientes, propón el objetivo único de hoy y tu plan en 5-8 pasos. Espera mi OK.
