# PROGRESO — Platita 2 (v2 automática)
Spec v2 congelado: 2026-11-16 · Timebox: modo Perú usable antes del 2026-12-13 (primeros correos de EE. UU.) · Contexto: personal
Historial v1 (H1–H10 de captura manual): `git show 0c8587e:docs/PROGRESO.md`. Quedó en H8; H5–H10 nunca tuvieron semana de uso real.

## Estado actual
Nodo: build · Milestone activo: H3 (lectura segura) con H2 G2 parcial · H0 y H1 cerrados y pusheados (0995b59, 78d4478) · G-COV cerrado, G-MOCK abierto (H4) · Objetivo de hoy: Inicio v1 lee saldo y gasto de hoy reales de Supabase (cambio de fuente, sin rediseño)
Pipeline en vivo desde 2026-11-16 17:08 Lima: Supabase `platita` (`ekyoqpucufzhykuxfajc`) + Apps Script "Platita 2 - ingesta Gmail a Supabase" (id `1F7_RIZnF1zAKb1ZcmWCBlVmXRvn52JsodaWNv4YP58_Or_fnmAEVuuA8`, cuenta personal) con trigger horario `cadaHora`.

## Milestones
### H0 — Pipeline en vivo · cubre: AC-1, AC-2, AC-3, AC-4, AC-9
- [x] G0 Parsers + pruebas — `node ingesta/test/run.mjs` → "29 passed, 0 failed" (2026-11-16; 14 formatos de correo + historial de Yape reales saneados + casos de juicio)
- [x] G1 Migración `platita_v2_ingest_schema` aplicada — `apply_migration` → success; 6 tablas public + `private.ingest_keys`, RLS en todas. Advisors de seguridad: 7 INFO "RLS sin políticas" (intencional hasta H3) y 2 WARN "anon ejecuta SECURITY DEFINER" (`ingest_claim`, `ingest_batch`: intencional, protegidas por la llave)
- [x] G2 Script creado y autorizado por Piero — registro de ejecución 17:06 "Permisos concedidos"
- [x] G3 `instalar()` corrido — 17:08: `{"emails":152,"movements":146,"new":146,"unparsed":0,"hints_applied":2}`; rango 18 ago–16 nov 2026; por mes: ago 30 · sep 53 · oct 40 · nov 24. Trigger horario verificado: corridas 17:42, 18:42 (1 movimiento nuevo sin intervención) y 19:42
- [x] G4 Revisión post-carga — 0 `unparsed`; 0 posibles duplicados entre fuentes (mismo monto ± 3 min) y 0 dentro de una fuente; re-ejecución de `instalar()` 17:10 → `"new":0` (deduplicación PASA con datos reales). Hallazgo corregido: negritas `*valor*` de Apps Script (DECISIONS)
- [x] G5 DECISIONS.md actualizado + commit (sin datos reales) + push — 0995b59 pusheado 2026-11-17
Evidencia:
- G0: fixtures en `ingesta/test/fixtures.json`.
- Línea base últimos 30 días (PE, S/): salió 771.88 en 43 movimientos; "Sin clasificar" 554.48 (72%) = 12 pagos a personas 339.14 + 16 en comercios sin regla 215.34. Reglas con categoría cubren 28% del monto.

### H1 — G-COV: prueba de cobertura · bloquea toda la UI
- [x] G1 Historial real obtenido y cruzado — 2026-11-16: "Historial de Movimientos" de Yape (xlsx, 431 filas, 19 ago–16 nov) contra `movements` (mismo sentido y monto, ± 3 min, uno a uno)
- [x] G2 % calculado — **FALLA: 25.7%** en 30 días (49 de 191 movimientos tienen correo); 29.8% en 90 días (145 de 486). Por monto, 30 días: salió S/2,245.72 real vs S/771.88 por correo (34%); entró S/2,226.50 vs S/570.00 (26%). Faltan: 113 yapeos enviados a personas (S/1,471.84), 28 recibidos (S/1,656.50) y 1 pago QR (S/2). Consumos con tarjeta/QR a comercios: 33 de 34 con correo
- [x] G3 Vía gratis aplicada y vuelta a medir — spec v2.1 + migración `platita_v2_1_statements_and_balance` + `Code.js` 2026-11-17.1; `instalar()` 21:16: `"statements":431,"promoted":341,"linked":90,"new":0,"unparsed":0`. Vuelta a medir: 488 movimientos; últimos 30 días 191 de 191, salió S/2,245.72 y entró S/2,226.50 (idénticos al historial). 0 filas sin enlazar, 0 enlaces dobles; el único par "mismo monto, mismo minuto" entre fuentes son 2 pagos reales distintos (eval 13)
- [x] G4 DECISIONS.md con el número medido + commit + push — 0995b59 pusheado 2026-11-17 09:25 con Git GUI (`0c8587e..0995b59 main -> main`)
Evidencia:
- Saldo: ancla registrada (lectura de Piero en Yape, 16 nov 21:04) en `balance_anchors`; el depósito por cajero que anunció debe sumarse solo en la siguiente corrida horaria (eval 16).
- Correos + historial de Yape juntos reconstruyen la cuenta: desde el saldo de v1 (S/230.84, 15 oct 14:31) y 199 movimientos, el saldo calculado nunca baja de cero (mínimo S/0.30 el 30 oct 06:53). Falta validar contra el saldo real que ve Piero.

### H2 — Repo a v2 · cubre: CI
- [ ] G1 Módulos muertos de v1 eliminados (tiles, Capture, Undo, IncomeForm, expected, closes/streak, seed de saldo) con `npm test` y build verdes
- [ ] G2 Migración traída a `supabase/migrations/`; `node ingesta/test/run.mjs` dentro de `npm test` y CI
- [ ] G3 Endurecimiento: alcance de Gmail de solo lectura evaluado (servicio avanzado de Gmail) y decidido
- [ ] G4 DECISIONS.md + commit + push
Evidencia:
- G2 parcial (2026-11-17): las 10 migraciones aplicadas (`list_migrations`: v2, v2.1, v2.2, v2.3, v2.3b, v2.4–v2.8) copiadas a `supabase/migrations/` leyendo `supabase_migrations.schema_migrations`. Saneadas: sin semillas de `category_rules` (comercios reales), sin el DELETE de filas concretas de v2.5, sin llaves ni datos; grep de secretos/comercios/ancla en `supabase/` → 0 coincidencias. Falta `node ingesta/test/run.mjs` dentro de `npm test` y CI.
- `instalarRapido()` (trigger de 5 min, solo pruebas) agregado a `Code.js`, reconstruida de la descripción de Piero: comparar con la copia pegada en el editor. `node ingesta/test/run.mjs` → "29 passed, 0 failed".

### H3 — Lectura segura · cubre: AC-7
- [ ] G1 Supabase Auth con un solo dueño + políticas select-only; registro público cerrado. Eval 10 PASA (llave publicable sola → 0 filas; llave de ingesta errónea → error) — abierto: falta que la sesión real del dueño LEA filas (paso 5, login en el Android de Piero); login email + contraseña (OTP descartado: editar la plantilla exige SMTP propio)
- [ ] G2 Capa de datos con caché IndexedDB (abre sin internet con el último dato); PIN conservado
- [ ] G3 code-review sin hallazgos críticos · G4 DECISIONS.md + commit + push
Evidencia:
- Nota parcial G1, paso 3 (2026-11-18, NO cierra el gate): migración `platita_v2_9_owner_read_policies` (versión `20261118000153`): revoca INSERT/UPDATE/DELETE/TRUNCATE a `anon`/`authenticated` en `movements` y `balance_anchors` + política SELECT solo para el `uid` del dueño. Probado: 1 usuario en `auth.users`; `/auth/v1/settings` → `disable_signup:true`, solo proveedor email. Con la publishable key y sin sesión: `movements`, `balance_anchors`, `statement_rows`, `raw_notifications`, `raw_emails`, `movement_hints`, `category_rules`, `ingest_runs` → `[]` (el servidor, con su propio rol, ve filas en ambas tablas); INSERT → 401 `42501 permission denied`; `ingest_batch` con llave errónea → 403 `unauthorized`. Rol `authenticated` SIMULADO por SQL (no es login real): uid del dueño → las mismas filas que ve el servidor; otro uid → 0 y 0; INSERT/UPDATE/DELETE del dueño → `42501`. Ingesta intacta: 6 corridas en 30 min. Falta: lectura con sesión real (paso 5).
- Advisors de seguridad tras la migración (para decidir, no bloquean): `auth_leaked_password_protection` desactivado (ahora relevante: login por contraseña); `ingest_screen` ejecutable también por `authenticated` (las otras tres RPC no; sigue protegida por la cabecera `x-ingest-key`).
- Paso 4 (2026-11-17): `src/domain/ledger.ts` (saldo = último ancla PEN + movimientos PEN posteriores; flujo hoy/semana por zona IANA vía `time.ts`; USD aparte; filas que no son del servidor lanzan error). `npm test` → 17 files / 115 passed; `npm run test:evals` → 9 files / 49 passed (incluye `ledger.eval.test.ts`: cambio de zona del dispositivo Auckland/NY/UTC con guarda anti-prueba-vacía, gasto rápido local y "esperado" rechazados, dólares aparte); `tsc --noEmit` y eslint sin errores.

### H4 — G-MOCK + Inicio de solo lectura · cubre: AC-5, AC-10
- [ ] G1 Mockup HTML de Inicio con datos reales aprobado por Piero → `docs/design-reference/Inicio-v2.html` + colores de categoría congelados en el spec
- [ ] G2 Inicio construido; eval 12 (ningún control escribe) PASA
- [ ] GV Gate visual PASS vs Inicio-v2 · G3 code-review · G4 DECISIONS.md + commit + push + Pages verificado
Evidencia:

### H5 — Semana + Mes + lista y detalle · cubre: AC-5, AC-8
- [ ] G1 Evals 6, 7 y 11 PASAN (dólares aparte; "¿en qué se me fue?" en ≤2 toques; semana por zona del modo)
- [ ] GV vs Semana.dc.html y Mes.dc.html · G2 code-review · G3 DECISIONS.md + commit + push
Evidencia:

### H6 — Modos PE/US + salud del pipeline · cubre: AC-3, AC-6, AC-8
- [ ] G1 Evals 4 y 9 PASAN (contador de correos sin leer; banner de datos viejos a las 3 h)
- [ ] G2 Cambio de modo recordado en el dispositivo · GV · G3 DECISIONS.md + commit + push
Evidencia:

### H7 — Una semana de uso real en el Android de Piero
- [ ] G1 Piero la abrió ≥5 de 7 días sin ingresar nada (reporte suyo)
- [ ] G2 Hallazgos en DECISIONS.md → cambios al spec primero
Evidencia:

### H8 — Modo EE. UU. · desde 2026-12-13
- [ ] G1 Alertas activas: Bank of America (depósito directo + pago con débito sobre el monto mínimo que permita, por correo) y Rockland Trust (alertas de cuenta e historial por correo)
- [ ] G2 Primeros correos reales guardados como fixtures saneados; parsers `bofa.*` / `rockland.*` con pruebas
- [ ] G3 Si Rockland no avisa cada compra por correo: decidir reenvío de notificaciones de SecurLOCK Equip (gratis) — registrar en DECISIONS.md
- [ ] G4 Remitentes agregados a `CFG.SENDERS`, script repegado, `instalar()` corrido
Evidencia:
