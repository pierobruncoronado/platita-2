# Platita 2 — CLAUDE.md

## Contexto
PWA Android, local-first y gratis, para que Piero registre gastos hormiga con 1 toque, confirme ingresos esperados y cierre el día; flujo semanal (lun–dom) que sobra a Ahorro. Fuente de verdad: `docs/spec.md`. Estado: `docs/PROGRESO.md`. Decisiones: `docs/DECISIONS.md`. Diseño aprobado: `docs/design-reference/*.dc.html` (5 tableros copiados del lienzo de Claude Design; estilos inline, se renderizan en un navegador normal).

## Router de sesión (obligatorio)
- Al INICIO de cada sesión: lee `docs/PROGRESO.md` y `docs/DECISIONS.md`. Anuncia: nodo/milestone actual, gates pendientes, y propón el objetivo único de hoy con un plan de 5-8 pasos. Espera OK antes de tocar código.
- Al CIERRE: marca en `docs/PROGRESO.md` los gates cumplidos con una línea de evidencia cada uno (comando corrido, output, hash de commit). Un gate sin evidencia no se marca.

## Reglas de dominio (no re-razonar — vienen del spec congelado)
- Flujo, no historial: `weekly_net = ingresos confirmados de la semana − gastos de la semana`. Lo esperado y no confirmado NUNCA cuenta. Domingo 23:59 → `Ahorro += weekly_net` (si es negativo, se resta). Ahorro = "En cuenta" (un solo número, inicio S/230.84).
- Semana lun 00:00–dom 23:59 en la zona horaria CONFIGURADA (default America/Lima), nunca la del dispositivo. Dinero en enteros (céntimos).
- Alcohol NO es gasto fijo: el S/25 es solo el default del botón. No existen "modos", ni reserva de salida, ni voz.
- Reposición de Claude: S/80 fijo mensual, ventana día 7–14, cobro parcial deja el resto "por cobrar"; pasada la ventana = "atrasada" (ámbar), nunca se descarta en silencio.
- Gamificación premia SOLO cerrar el día, jamás montos ni cantidad de registros. Racha se rompe con 3 días seguidos sin cierre (sin días de gracia).
- Colores semánticos: verde ingreso/ok, ámbar/rojo solo estado vs límite (jamás color de categoría), dorado ahorro. Categorías: tokens del spec.
- Cero servidor, cero costo recurrente. Si algo cuesta dinero, avisa ANTES de construirlo.
- No inventes números: lo no verificado (costo real de Claude S/87, umbrales XP, soporte de huella) está marcado en el spec; no lo congeles como hecho.

## Flujo de trabajo
- Plan-first: enumerar plan → esperar OK → implementar → CORRER y mostrar output real. Nada está "listo" sin ejecución visible.
- Cierre de milestone: verificar contra criterios de aceptación → actualizar `docs/DECISIONS.md` (Qué/Por qué/Cómo/Trade-off/Gotcha) → commit descriptivo → verificar `.gitignore`/secrets → push → marcar gates en `docs/PROGRESO.md`.
- Milestone con interacción de usuario: no cierra hasta funcionar en el Android de Piero con uso real (tests verdes verifican forma, no comportamiento).
- "Pushed" ≠ "published": verifica el deploy como lo ve el mundo (Pages, incógnito).
- HITL: nunca crear repos públicos, borrar datos o publicar sin plan + OK explícito. Los datos financieros de Piero no salen del dispositivo: sin analytics ni scripts de terceros.

## Gate visual (milestones de UI)
- Antes de cerrar un milestone de UI: con Playwright MCP, navega la vista (viewport 390×844), screenshot y compárala contra la pantalla equivalente de `docs/design-reference/*.dc.html`. PASS/FAIL + una línea. Deriva genérica = FAIL (sombras default, Inter-everywhere, paleta azul/gris, targets <44px).
- FAIL → no cierra; itera sobre los tokens congelados del spec. Registrar en `docs/DECISIONS.md` y marcar GV en `docs/PROGRESO.md`.

## Evals y CI
- Evals on-demand: `npm run test:evals` (motor de dinero, funciones puras). CI = solo lint + unit tests deterministas. Nada contra servicios reales en CI.

## Gotchas de stack
- Fechas/zona: usar Intl/IANA con la zona configurada; probar cambio de zona del dispositivo (caso eval #3).
- Service worker: versionar caché o Piero verá una versión vieja tras desplegar; verifica la actualización.
- WebAuthn (huella) en PWA instalada: NO verificado en su Android; timebox de 1 sesión, si falla queda PIN.
- `.gitignore` antes del primer commit (node_modules, dist, exports de datos reales).

## Anti-patrones (interrumpir POR NOMBRE)
- Fuga: pulir UI, agregar metas/WAT/sync/voz (= v2) en vez de cerrar el milestone. Re-litigar decisiones cerradas.
- Premiar volumen de registros o gasto. Inventar umbrales o copy motivacional con culpa.
