# PROGRESO — Platita 2
Spec congelado: 2026-10-15 · Timebox: iterar con uso real hasta que Piero lo pruebe 1 semana (H10); sin fecha dura · Contexto: personal

## Estado actual
Nodo: build · Milestone activo: H8 (PIN implementado; falta push + spike de huella en el Android) → luego H10 · Pendientes en el Android de Piero: H9 G1 (2 archivos en Descargas), H5 G1, H6 G1, H7 G1 (cerrar el día) y H8 G1 (crear PIN + probar huella). OJO: tras desplegar H8 la app pide crear un PIN en el primer arranque (H1–H4 cerrados 2026-10-15)
Saldo real en el teléfono de Piero al cierre de H4: S/380.84 (230.84 + mesada 100 + Claude 50).
Orden aprobado por Piero (2026-10-16): aviso de versión nueva (hecho, 78617a3) → H9 → H5 → H6 → H7 → H8 → H10.
Pendiente v1 sin milestone: editar los montos por defecto de los botones rápidos ("Editar"), antes de H10.

## Milestones
### H1 — Scaffold PWA + Dexie + zona horaria + saldo inicial · cubre: AC-1 (base), eval 2
- [x] G1 Aceptación verificada: offline abre y muestra S/230.84 — PASA
- [x] G2 code-review sin hallazgos críticos (self-review inline; 1 menor: icono maskable con esquinas transparentes)
- [x] G3 DECISIONS.md actualizado
- [x] G4 .gitignore + commit + push — d1251f6 (H1) … 4973952 pushed a origin/main (github.com/pierobruncoronado/platita-2, público)
Evidencia:
- G1: Playwright 390×844 sobre `vite preview`: SW controlling=true → servidor matado (reachable=false) → reload muestra `S/230.84`, fuentes Sora 700 + Figtree 400 cargadas desde caché. `npm run lint` → "No issues found"; `npm test` → 7/7 passed; `npm run build` → precache 19 entries.
- G3: entrada "2026-10-15 — H1 scaffold" en DECISIONS.md.
- G4: `git check-ignore` confirma node_modules, dist, .env, exports/ ignorados; `git push -u origin main` → "[new branch] main -> main", origin/main = 4973952.

### H2 — Motor de dinero (funciones puras) · cubre: AC-2, AC-3, AC-4, AC-5; evals 2,3,4,5,6
- [x] G1 Unit tests verdes incl. caso de cambio de zona (eval 3) y cobro parcial (eval 4)
- [x] G2 code-review — 10 hallazgos: 1 crítico (backdate/undo tras cierre perdía movimientos) + 5 corregidos, 3 anotados como no-acción
- [x] G3 DECISIONS.md
- [x] G4 commit + push — f4cd19c pushed a origin/main ("f3a93ec..f4cd19c main -> main")
Evidencia:
- G1: `npm test` → 5 files, 27 passed; `npm run test:evals` → 7 passed (evals 2,3,4,5,6 por nombre); `tsc --noEmit` ok; lint ok; build ok.
- G2: `/code-review medium` sobre el diff; fix del crítico = ahorro derivado (tests "backdated" y "undo right after midnight"); DST-medianoche verificado con sonda (Santiago 2026-09-06 inicia 01:00).
- G3: entrada "2026-10-15 — H2 money engine" en DECISIONS.md.

### H3 — Captura + botones rápidos + Deshacer · cubre: AC-1; evals 1, 9, 10
- [x] G1 Aceptación (tile = 1 toque; Deshacer 5 s; monto 0 deshabilitado) — PASA en Playwright y en el Android de Piero (2026-10-15: instalada, tile + Deshacer OK; tras fix f034e24 "ya se puede editar y eliminar")
- [x] G2 code-review — 10 hallazgos, 10 corregidos
- [x] G3 DECISIONS.md
- [x] G4 commit + push — 9655e5c pushed; Actions run 38815118270 build+deploy success; https://pierobruncoronado.github.io/platita-2/ verificado en contexto limpio (HTTP 200, S/230.84, manifest + iconos OK, SW controla, tap+Deshacer OK, recarga offline OK)
- [x] GV Gate visual PASS vs tablero Captura/Inicio
Evidencia:
- G1 (Playwright 390×844, device TZ New York): tap Pasaje → 1 expense {200, transporte, Pasaje, W42}, balance 230.84→228.84; Deshacer → undone=true, balance 230.84; toast gone at 5.3 s. Eval 9: Snack 700 with note "" → edit note "pan y empanada", amount stays 700. Eval 10: blank and "0" → Guardar disabled, 0 rows created. Back after save → Inicio. Pre-opening date rejected with message. Targets <44px: none. `npm test` 43 passed; evals 7 passed; lint/tsc ok.
- G2: `/code-review medium` → fixes: pre-opening backdate, back-button history, visible undo failure, stable 5 s timer, no edits on undone, refresh period after tap, single toast counter, date parsing moved + tested, "+" on positive net, Pages deploy not cancelled mid-run.
- GV: screenshots app vs `docs/design-reference/{Main,Captura}.dc.html` rendered in Chromium; see DECISIONS H3.

### H4 — Pantalla Ingresos (confirmados/esperados/recurrentes/parcial) · cubre: AC-3, AC-5
- [x] G1 Aceptación — PASA en Playwright y evals, y en el Android de Piero (2026-10-15: confirmó Mesada S/100 + Claude S/50 reales → "ya figuran 380")
- [x] G2 code-review — 9 hallazgos: 8 corregidos, 1 declinado con razón (DECISIONS H4)
- [x] G3 DECISIONS.md
- [x] G4 commit + push — 33e736d pushed; Actions run 38850661227 success; bundle público contiene "Ingreso suelto", "Te deben", "Si llega lo esperado", "Eliminar ingreso"
- [x] GV vs tablero Ingresos — PASS
Evidencia:
- G1 (Playwright, reloj fijado jue 15 17:30 Lima, dispositivo NY): Inicio S/230.84 · "Si llega lo esperado S/360.84" · "Te deben S/130 (Claude S/30 atrasada + Mesada S/100)"; confirmar Mesada (prefill 100) + Claude (prefill 30 → tecleó 50) → En cuenta S/380.84, 0 esperados; suelto Abuelo 60 → 440.84, eliminar (rojo rgb(255,93,115)) → 380.84; viernes sin confirmar → 2 "atrasada" ámbar. `npm test` 50 passed; `npm run test:evals` 12 passed (incl. 5 evals H4 en lenguaje real); lint/tsc ok; regresión H3 OK.

### H5 — Inicio + Semana (donut, barras diarias, dos números) · cubre: AC-2, AC-4
- [ ] G1 Aceptación — PASA en Playwright y evals; falta usarla en el Android de Piero
- [x] G2 code-review — 9 hallazgos: 5 corregidos, 3 declinados con razón (DECISIONS H5), 1 era el cierre de docs
- [x] G3 DECISIONS.md
- [x] G4 commit + push — 6342228 pushed; bundle público (assets/index-DohjNy7l.js) contiene "Libre esta semana", "Cierre del domingo", "va aparte"
- [x] GV vs tableros Inicio y Semana — PASS
Evidencia:
- G1: `npm test` 59 passed; `npm run test:evals` 24 passed (3 evals H5 en lenguaje real: Libre ámbar/verde, Claude fuera de hormigas, proyección del domingo = cierre real); tsc/lint/build ok. Playwright 390×844 (jueves 22 oct 17:30 Lima, dispositivo NY): semana con gastos (1 deshecho y 1 de la semana pasada ignorados) → Libre −S/115 ámbar rgb(255,178,36), En cuenta S/115.84, hormigas S/28, días 9·5·9·5·–·–·–, Jue resaltado; con ingreso S/200 → Libre S/85 verde; semana vacía → S/0 verde; 0 errores de consola; 0 targets <44px. Flujo: Captura Otros → Claude 87 → Libre −S/87, dona S/0 + "Claude S/87 va aparte".

### H6 — Mes + tarjeta línea base · cubre: vista mensual
- [ ] G1 Aceptación — PASA en Playwright y evals; falta usarla en el Android de Piero
- [x] G2 code-review — 7 hallazgos: 4 corregidos, 3 declinados con razón (DECISIONS H6)
- [x] G3 DECISIONS.md
- [x] G4 commit + push — b87fa22 pushed; bundle público contiene "Midiendo tu"
- [x] GV vs tablero Mes — PASS
Evidencia:
- G1: `npm test` 67 passed; `npm run test:evals` 28 passed (4 evals H6 en lenguaje real: Te quedó = lo que los cierres dominicales mandaron a Ahorro, semana en curso visible el 28 oct, línea base 1→3→4 semanas sin Claude ni tope); tsc/lint/build ok. Playwright 390×844 (miércoles 28 oct 17:30 Lima, dispositivo NY): Te quedó −S/24 (S/100 entró · S/124 salió), dona S/124 con Claude S/87 aparte, filas 12/19/26 oct, 1 barra Esperado, línea base "1 de 4", toggle Semana⇄Mes y nav Mes OK, 0 targets <44px, 0 errores de consola; mes vacío → S/0.

### H7 — Cierre del día + racha + XP · cubre: AC-6; eval 7
- [ ] G1 Aceptación (racha viva con 2 días sin cerrar, se rompe con 3) — PASA en Playwright y evals; falta usarlo en el Android de Piero
- [x] G2 code-review — 6 hallazgos: 2 corregidos, 4 declinados con razón (DECISIONS H7)
- [x] G3 DECISIONS.md
- [x] G4 commit + push — 759b00d pushed; bundle público contiene "Día cerrado"
- [x] GV Gate visual — PASS
Evidencia:
- G1: `npm test` 82 passed; `npm run test:evals` 34 passed (eval 7 en lenguaje real: viva con 2 días sin cerrar, se rompe con el 3.º, cierre dom 23:58 cuenta para el domingo, export con closed_days); tsc/lint/build ok. Playwright 390×844 (jue 22 oct 17:30 Lima, dispositivo NY): sin cierres → sin chip, tarjeta "Cierra el día"; Pasaje + "Anotar un gasto" desde ¿Falta algo? vuelve a #/cerrar con 2 filas; Cerrar el día → chip "1 día", tarjeta "Día cerrado", Semana "1 día cerrado de 4 · Nivel 1", persiste tras recargar; vie cierra → "2 días"; lun (2 días pasados) → "2 días"; mar (3 pasados) → sin chip, "Racha en 0"; guarda de medianoche: abierto 23:59, toque 00:00:20 → no cierra, 2.º toque cierra el día nuevo; 0 targets <44px, 0 errores de consola.

### H8 — PIN + spike de huella (1 sesión) · cubre: AC-8; eval 11
- [ ] G1 Aceptación (PIN siempre; huella solo si funciona en el Android de Piero) — PIN PASA en Playwright y evals; falta crear el PIN y el spike de huella en el Android
- [x] G2 code-review — 8 hallazgos: 6 corregidos, 2 declinados con razón (DECISIONS H8)
- [ ] G3 DECISIONS.md (resultado del spike) — entrada H8 escrita; falta el resultado real del spike en el Android
- [ ] G4 commit + push ({hash})
Evidencia:
- G1: `npm test` 98 passed; `npm run test:evals` 38 passed (eval 11 en lenguaje real: 90 s fuera → pide PIN, 30 s no; 5 fallos → espera y rechaza hasta el PIN correcto; fila de PIN dañada sigue bloqueada; Olvidé mi PIN conserva los movimientos); tsc/lint/build ok. Playwright 390×844 con autenticador WebAuthn virtual: primer arranque → pide crear PIN (sin montos en pantalla), discordancia avisa; apertura en frío pide PIN; 5 fallos rápidos → "Espera 30 s", teclado deshabilitado, la espera sobrevive a recargar, Olvidé mi PIN deshabilitado durante la espera, +31 s → PIN correcto abre; oculto → cubierta inmediata; 30 s fuera → sigue abierta; 90 s fuera → pide PIN y no hay montos; borrador "S/ 75" sobrevive al re-bloqueo; huella: activar → "Huella activada", apertura en frío sin PIN, no verificada → se queda en PIN y el PIN sigue funcionando; Olvidé mi PIN → confirmar → crear nuevo y el gasto sigue; 0 targets <44px.

### H9 — Exportar todo (CSV + JSON) + recordatorio semanal · cubre: AC-7; eval 8 · (adelantado antes de H5, OK de Piero 2026-10-16)
- [ ] G1 Aceptación (contenido verificado campo por campo) — PASA en evals + Playwright; falta exportar en el Android de Piero y ver los 2 archivos en Descargas
- [x] G2 code-review — 10 hallazgos: 9 corregidos, 1 mitigado (descarga múltiple bloqueada no detectable)
- [x] G3 DECISIONS.md
- [x] G4 commit + push — f0a0a1b pushed; Actions run 38860230696 success; bundle público contiene "Exportar todo", "Respalda tus datos", "Hay una versión nueva"
Evidencia:
- G1: `npm run test:evals` 21 passed (eval 8: 3 gastos con 1 deshecho + ingreso parcial → JSON con los 4 registros, flags undone/status, todos los campos AC7, timezone + saldo inicial, filas "expected" por cobrar, CSV con mismas filas + comillas/saltos de línea + anti-fórmulas). Playwright: tap Exportar todo → descargas `platita-export-2026-10-16.json` y `.csv` (BOM, 16 columnas, 3 movimientos + 2 por cobrar), recordatorio desaparece, tarjeta "Último respaldo: hoy". `npm test` 50 passed; lint/tsc ok.

### H10 — Instalación en el Android de Piero + 1 semana de uso real
- [ ] G1 Instalada desde Chrome y funciona sin internet (evidencia: Piero confirma)
- [ ] G2 Piero registró ≥1 gasto por día 5 de 7 días (reporte suyo, no estimado)
- [ ] G3 Hallazgos de uso real en DECISIONS.md → cambios al spec primero
- [ ] G4 export de prueba entregado a un LLM para conclusiones
Evidencia:

## Post-build
- [ ] Línea base de 4 semanas medida → recién entonces definir metas (v2)
