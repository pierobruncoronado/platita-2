# Platita 2 — CLAUDE.md (v2, 2026-11-16)

## Contexto
PWA Android de SOLO LECTURA: muestra en qué, cuánto, dónde y cuándo gastó Piero, sin que él ingrese nada. Los movimientos salen de los correos de aviso de sus bancos (Gmail → Apps Script cada hora → Supabase → PWA). Dos modos: Perú (S/, BCP + Yape) y EE. UU. ($, BofA + Rockland). Fuente de verdad: `docs/spec.md` (v2). Estado: `docs/PROGRESO.md`. Decisiones: `docs/DECISIONS.md`. Ingesta: `ingesta/`. Diseño vigente: `docs/design-reference/{Semana,Mes}.dc.html` + el mockup de Inicio que se apruebe en G-MOCK.

## Router de sesión (obligatorio)
- Al INICIO de cada sesión: lee `docs/PROGRESO.md` y `docs/DECISIONS.md`. Anuncia: nodo/milestone actual, gates pendientes, y propón el objetivo único de hoy con un plan de 5-8 pasos. Espera OK antes de tocar código.
- Al CIERRE: marca en `docs/PROGRESO.md` los gates cumplidos con una línea de evidencia cada uno (comando corrido, output, hash de commit). Un gate sin evidencia no se marca.

## Reglas de dominio (no re-razonar — vienen del spec congelado)
- Cero entrada manual: ninguna pantalla crea, edita ni borra movimientos. Si una tarea pide un formulario de monto, es v1: detente.
- Nunca adivinar, nunca descartar: correo de remitente conocido que no parsea completo → `raw_emails.status='unparsed'` con su texto y contador visible. Jamás un movimiento a medias.
- Dedupe = `fuente:tipo:n_operación:fecha_local`. El n.º de operación solo NO es único (cajeros usan 4 dígitos). Yapeo recibido no trae n.º → `fuente:tipo:minuto:monto:persona`.
- Yape Promos manda 2 correos por 1 pago: "Tu compra de X fue exitosa" es pista de comercio (`movement_hints`), nunca un segundo gasto.
- Dinero en céntimos enteros + moneda. Nunca sumar PEN con USD: un cargo en $ en la cuenta en soles va aparte, sin tipo de cambio inventado.
- Semana lun 00:00–dom 23:59 en la zona del MODO (PE America/Lima, US America/New_York), nunca la del dispositivo. Correos PE = hora de Lima (−05:00 fijo); los de EE. UU. toman el instante de la fecha del correo (hay horario de verano).
- Flujo: salió = gastos − devoluciones; entró = depósitos + recibidos. Saldo = última fila de `balance_anchors` (lo que Piero leyó en su app) + movimientos en S/ posteriores; nunca se recalcula desde el historial ni se escribe su valor en el repo. No hay "Ahorro" ni efectivo.
- Dos fuentes: los correos cubren ~26% de los movimientos; el "Historial de Movimientos" de Yape (xlsx que Piero se envía) es la lista completa. Enlace uno a uno por sentido + monto ± 3 min (`statement_rows.movement_id`); mismo monto y minuto NO implica duplicado.
- Categoría solo por regla (`category_rules`); pago a persona o comercio desconocido = "Sin clasificar" con el nombre visible.
- Colores: verde entra; ámbar/rojo solo estado (datos viejos, correos sin leer), jamás color de categoría.
- Cero costo recurrente. Si algo cuesta dinero, avisa ANTES de construirlo.
- No verificado ≠ hecho: el cargo de Claude en soles de nov, por qué Yape avisa solo algunos yapeos y el contenido de las alertas de BofA/Rockland están marcados en el spec.

## Seguridad (repo y bundle son PÚBLICOS)
- Nunca commitear datos reales, correos sin sanear, `service_role` ni la `INGEST_KEY`. Los fixtures van saneados.
- RLS activo en todas las tablas; `anon` solo ejecuta `ingest_claim`/`ingest_batch`. Lectura = sesión del dueño (Supabase Auth) + políticas select-only.
- Cambios de esquema: migración vía MCP de Supabase y copia en `supabase/migrations/`. Nunca DDL suelto.

## Flujo de trabajo
- Plan-first: enumerar plan → esperar OK → implementar → CORRER y mostrar output real. Nada está "listo" sin ejecución visible.
- Cierre de milestone: verificar contra criterios de aceptación → actualizar `docs/DECISIONS.md` (Qué/Por qué/Cómo/Trade-off/Gotcha) → commit descriptivo → verificar `.gitignore`/secrets → push → marcar gates en `docs/PROGRESO.md`.
- Milestone de UI: no cierra hasta verse bien en el Android de Piero con sus datos reales.
- "Pushed" ≠ "published": verifica el deploy como lo ve el mundo (Pages, incógnito).
- HITL: nunca borrar datos de Supabase, cambiar visibilidad del repo ni publicar sin plan + OK explícito.

## Gate visual (milestones de UI)
- Con Playwright MCP (390×844): screenshot de la vista vs su referencia en Visual Direction de `docs/spec.md`. PASS/FAIL + una línea. Deriva genérica = FAIL (sombras default, Inter-everywhere, paleta azul/gris, targets <44px).
- FAIL → no cierra; itera sobre los tokens congelados. Registrar en `docs/DECISIONS.md` y marcar GV en `docs/PROGRESO.md`.

## Evals y CI
- Parsers: `node ingesta/test/run.mjs` (sin dependencias, correos reales saneados). App: `npm test`; evals on-demand `npm run test:evals`. CI = lint + unit deterministas. Nada en CI toca Gmail ni Supabase.

## Gotchas de stack
- `ingesta/apps-script/Code.js` es la ÚNICA copia del script: se pega tal cual en script.google.com con la URL y la llave publicable reales en `CFG`; en el repo van los marcadores `__SUPABASE_URL__`. Tras editar parsers: tests → pegar → `instalar()` (idempotente).
- Apps Script: `getPlainBody()` envuelve las negritas en `*valor*` y da espacios distintos al HTML → los parsers normalizan y prueban ambos; un fixture nuevo se toma del registro del script, no de otro lector.
- Supabase Free se pausa con ~7 días de poca actividad: el trigger horario escribe `ingest_runs` siempre. Si se pausa: Resume en el dashboard y revisa el trigger.
- Service worker: versionar caché y verificar el banner "Hay una versión nueva" tras desplegar.
- `node_modules` se instaló en Windows: los binarios no corren en Linux/WSL.

## Anti-patrones (interrumpir POR NOMBRE)
- Fuga: pulir UI, agregar metas/saldo/tipo de cambio/clasificación manual (= v2.1) en vez de cerrar el milestone. Re-litigar decisiones cerradas.
- Resucitar v1: tiles, Deshacer, cierre del día, racha, confirmar ingreso.
- Construir Inicio antes de G-MOCK. Inventar categorías, umbrales o cobertura.
