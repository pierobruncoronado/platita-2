# PROGRESO — Platita 2
Spec congelado: 2026-10-15 · Timebox: iterar con uso real hasta que Piero lo pruebe 1 semana (H10); sin fecha dura · Contexto: personal

## Estado actual
Nodo: build · Milestone activo: H3 · Próximo gate: G1 (H1 y H2 cerrados 2026-10-15)
Pendiente fuera de milestone: workflow de deploy a GitHub Pages (antes de H10). Falta `docs/design-reference.html` (bloquea GV desde H3).

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
- [ ] G1 Aceptación (tile = 1 toque; Deshacer 5 s; monto 0 deshabilitado)
- [ ] G2 code-review
- [ ] G3 DECISIONS.md
- [ ] G4 commit + push ({hash})
- [ ] GV Gate visual PASS vs tablero Captura/Inicio
Evidencia:

### H4 — Pantalla Ingresos (confirmados/esperados/recurrentes/parcial) · cubre: AC-3, AC-5
- [ ] G1 Aceptación
- [ ] G2 code-review
- [ ] G3 DECISIONS.md
- [ ] G4 commit + push ({hash})
- [ ] GV vs tablero Ingresos
Evidencia:

### H5 — Inicio + Semana (donut, barras diarias, dos números) · cubre: AC-2, AC-4
- [ ] G1 Aceptación
- [ ] G2 code-review
- [ ] G3 DECISIONS.md
- [ ] G4 commit + push ({hash})
- [ ] GV vs tableros Inicio y Semana
Evidencia:

### H6 — Mes + tarjeta línea base · cubre: vista mensual
- [ ] G1 Aceptación
- [ ] G2 code-review
- [ ] G3 DECISIONS.md
- [ ] G4 commit + push ({hash})
- [ ] GV vs tablero Mes
Evidencia:

### H7 — Cierre del día + racha + XP · cubre: AC-6; eval 7
- [ ] G1 Aceptación (racha viva con 2 días sin cerrar, se rompe con 3)
- [ ] G2 code-review
- [ ] G3 DECISIONS.md
- [ ] G4 commit + push ({hash})
- [ ] GV Gate visual
Evidencia:

### H8 — PIN + spike de huella (1 sesión) · cubre: AC-8; eval 11
- [ ] G1 Aceptación (PIN siempre; huella solo si funciona en el Android de Piero)
- [ ] G2 code-review
- [ ] G3 DECISIONS.md (resultado del spike)
- [ ] G4 commit + push ({hash})
Evidencia:

### H9 — Exportar todo (CSV + JSON) + recordatorio semanal · cubre: AC-7; eval 8
- [ ] G1 Aceptación (contenido verificado campo por campo)
- [ ] G2 code-review
- [ ] G3 DECISIONS.md
- [ ] G4 commit + push ({hash})
Evidencia:

### H10 — Instalación en el Android de Piero + 1 semana de uso real
- [ ] G1 Instalada desde Chrome y funciona sin internet (evidencia: Piero confirma)
- [ ] G2 Piero registró ≥1 gasto por día 5 de 7 días (reporte suyo, no estimado)
- [ ] G3 Hallazgos de uso real en DECISIONS.md → cambios al spec primero
- [ ] G4 export de prueba entregado a un LLM para conclusiones
Evidencia:

## Post-build
- [ ] Línea base de 4 semanas medida → recién entonces definir metas (v2)
