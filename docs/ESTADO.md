# SGH — Estado del Deploy

> Doc único: estado vivo + log de snapshots. El snapshot más nuevo va arriba.

---

## 📸 Snapshot 2026-07-24 — el más nuevo

> Autoritativo. Supera a los snapshots de abajo. En main/prod: alta por invitación (merge `f8f5b0a`), programa NULL-safe (`82f87d8`), chapa 4½ cpos (`f9f8807`), tapa + flyer (`feccf83`). Conteos verificados contra prod el 24/07.

### Reunión 6 (20/06/2026) — primera oficialización real, end-to-end
- **8 carreras corridas oficializadas** (8/8). De los 11 turnos, **3 anuladas** (turnos 4, 7, 10). `reuniones.estado='publicada'`.
- **Liquidaciones generadas**: **79 headers / 203 líneas**, todas en `estado='borrador'`. Por concepto: premio 79 líneas, incentivo entrenador 57, fondo solidario 40, incentivo jockey 21, bono 6.
- **Retención anti-doping activa**: **31 líneas** de premio en `estado_linea='retenido'` (1° y 2°). Liberación **manual** vía RPC `liberar_linea`.
- ⚠️ Los conteos que circulaban antes (52 headers / 151 líneas) **no coinciden** con prod al 24/07. Los de arriba son los verificados por query directa.

### Calendario — R7 suspendida, próxima 16/08
- **R7 (19/07/2026): `cancelada`** por falta de inscriptos. Tiene 12 carreras cargadas y 0 resultados.
- **Próxima reunión: R8, 16/08/2026**, `publicada`, 12 carreras.
- ⚠️ La reunión de prueba **9999** (`2099-01-01`, `cancelada`, 3 carreras con resultados) **sigue viva** en Dolores. Teardown gateado a Fede (ISSUE-035).

### Alta de usuarios v1 — operativa por invitación cerrada
- Etapas **0 / (a) / (b) COMPLETADAS**. Edge Function `invite-user` + landing `reset-password.html` con `type=invite` + `usuarios.html`/`admin.html` migradas. Auto-registro fuera de v1.
- **SMTP Resend** activo, dominio `hipodromodolores.com` verificado. Sender `sistema@` **provisorio** (definitivo pendiente de Fede).
- Flujo end-to-end verificado contra prod por Leo el 24/07 (invitación → mail → contraseña → `activo=true` → login). Usuario de prueba borrado.
- **Etapas (c) y (d) pendientes.** (c) queda gateada a reportar a Supabase el bug de plataforma `kid <nil>`/ES256 en la Admin API (~1/3 de las llamadas) + una mini-tanda de UI de error reintentable. Ver `docs/plan_alta_invitacion.md` §5.

---

## 📸 Snapshot 2026-07-21 — superado por el de arriba

> En main/prod: tanda de premios (`feat/premios-display-v2`, merge `d626049`). Doc de premios + restore.

### Premios — modelo de display: NOMINAL + bonos aparte (decisión de Fede confirmada)
- La **BOLSA impresa es el nominal** (`bolsa_total` tal cual se carga); ni el piso `ganancia_minima` ni los bonos inflan ese número. Helper `repartoDisplay()` en `premios-utils.js` (los 6 sitios de display lo usan). El reparto por puesto suma exacto a la bolsa (último puesto absorbe el resto del redondeo).
- **Bonos**: líneas aparte condicionales. **Ganancia mínima**: línea informativa condicional (comunica el piso sin inflar). **`calcPremiosConPiso` intacto** → el piso aplica solo en **liquidación** (pago).
- Warning al guardar si el piso parece un error de tipeo (`pisoSospechoso`, > 20% de la bolsa). Probes `tests/probe_reparto_display.mjs` (7/7) + `tests/probe_piso_warning.mjs` (5/5).

### Infra — proyecto Supabase pausado y restaurado (sin pérdida de datos)
- El proyecto (`unlhcuanfrtpatoipwve`) se **pausó por inactividad el 2026-07-07** (plan free: se pausa a los ~7 días sin API calls ni logins). **Restaurado el 2026-07-14 desde el dashboard, sin pérdida de datos.**
- **Conteos post-restore verificados**: reunión 6 intacta (**124 inscripciones, 81 gateras, 82 pesos**); **profesionales 167, sin duplicados**.
- **Pendiente (producto)**: decidir **Pro vs cron anti-pausa** para evitar que se vuelva a pausar (hablar con Fede). Ver ISSUES.

---

## 📸 Snapshot 2026-06-12

> Autoritativo. Supera a los snapshots de abajo. Trabajo de hoy en branch **`feat/edge-reunion-json`** (NO en main): Edge Function `reunion-json` deployada + seed de resultados 9999 + housekeeping. El generador y su pasada de formato viven en `feat/json-generator` (`08f8bcb`). Nada de esto está mergeado a main todavía.

### Stud Book — Edge Function `reunion-json` VIVA (Supabase, v7)
- **Endpoint deployado**: `https://unlhcuanfrtpatoipwve.supabase.co/functions/v1/reunion-json?fecha=YYMMDD`. Devuelve el JSON de reunión por fecha, **scope Dolores**. `supabase/functions/reunion-json/index.ts`.
- **Auth**: header `Authorization: Bearer <STUDBOOK_API_TOKEN>` (o `?token=`). **`verify_jwt` OFF** → Diego llama con **solo su token, sin anon/publishable key**. Sin token o token incorrecto → 401 (compara de verdad, no fail-open).
- **DB server-side**: lee con `STUDBOOK_DB_KEY` (un `sb_secret_...` en el env de la función, NO la service_role legacy). Cliente Supabase con `persistSession:false`.
- **Output compartido**: reusa `supabase/functions/_shared/studbook_format.mjs` → mismo JSON byte-a-byte que el CLI `tools/studbook_reunion_json.mjs`.
- **Validada contra 9999** (token solo, sin anon key): `fecha=990101` → **200 + diff idéntico** a `tools/samples/9999_sample.json`; sin token → 401; token incorrecto → 401; `fecha=010101` (inexistente) → 404. El antiguo 500-on-valid-token quedó resuelto.

### Stud Book — generador JSON: pasada de formato (calcado de La Punta)
- `feat/json-generator` (`08f8bcb`): wrapper `{status:200, data:{…}}`; numéricos serializados a **string** (`numero`, `distancia`, `premios`, `orden`, `kilos`, `jockey_kilos`, `pagaria`); `premios` y `competidores` **doble-anidados** `[[ … ]]`. Sample completo en `tools/samples/9999_sample.json` (datos fake, sin PII).

### Datos de prueba 9999 — seed de resultados completos
- `tools/seed_9999_resultados.sql`: agrega caballerizas + profesionales **ficticios** (`PRUEBA 9999 — BORRAR`) y re-apunta jockey/entrenador/caballeriza de las inscripciones para tener resultados completos que alimenten el generador end-to-end.
- `teardown_prueba_resumen_9999.sql` extendido: borra esos fakes en orden FK (profesionales antes que caballerizas). Sigue cubriendo todo por `reunion_id`. ~~Correr antes del 20/6.~~ **Decisión revertida el 2026-08-29: la 9999 NO se borra.** Es el único sandbox seguro que tenemos —ya sirvió para verificar el camino de recuperación de montas— y en vez de borrarla se la marcó con `reuniones.es_prueba` y se la filtró del buscador de Pagos (`docs/diagnosticos/2026-08-29_issue-055-merge.md`). `teardown_prueba_resumen_9999.sql` queda sin usar, disponible por si alguna vez hace falta.

### Pendientes (ver ISSUE-030)
- ⚠️ **Rotar `STUDBOOK_API_TOKEN` antes del 20/6** (se expuso durante el setup; hoy solo protege la 9999 fake).
- ~~Correr el teardown de 9999 antes del 20/6.~~ **No corresponde**: la 9999 se conserva como sandbox (2026-08-29, ver `docs/diagnosticos/2026-08-29_issue-055-merge.md`).
- Confirmar con Diego el **doble-anidado** (`premios`/`competidores` `[[…]]`: a propósito o se aplana del lado de él).
- Diego prueba el endpoint con `fecha=990101`.

---

## 📸 Snapshot 2026-06-11

> Autoritativo. Supera a los snapshots de abajo. En main hoy: merge squash PR #2 `feat/studbook-id-column` → `db0b2fc` (columna `studbook_id` + backfill). El scrape (fase 1) y la carga de 25 SPCs (fase 2) NO están en main: viven en `feat/studbook-extract` (`821dad0`, pusheada a origin).

### Stud Book — 11/06
- **`studbook_id` VIVO en main/prod** (`db0b2fc`): `spcs.studbook_id text` + índice único parcial `spcs_studbook_id_uniq`. El "Idcaballo" del Stud Book para su API; distinto de `registro_stud_book` (NULL). Backfill de los 25 verificado contra prod (`count=25`). Migración `migrations/add_studbook_id.sql`.
- **Scrape fase 1 + carga fase 2 en `feat/studbook-extract` (NO en main)**: `tools/sb_extract.py` (extractor read-only), `data/studbook_26.json` (25/26 ejemplares, 0 ambiguos), `data/studbook_26_insert_report.md`. 25 SPCs insertados en prod con `club_id=NULL` (globales). spcs 40 → 65. SALVADOR EVER resuelto = macho (carrera exclusión de yeguas).
- **API Stud Book**: Diego ofreció acceso; mandó JSON de La Punta de referencia. Workstream abierto → **ISSUE-030** (7 preguntas pendientes a Diego).
- **No mergear a main**: `feat/studbook-extract` (decisión separada) ni `docs/AUDIT_PORTAL_ONBOARDING.md` (repo público — detalla huecos de RLS).

### Pendientes Stud Book
- LADY BLICK (Dolores) NO_ENCONTRADO por match exacto → candidato **LADY BLIK** id `436014` (Hembra, 2022-08-25, padre Lencelot, madre Blik, abuelo materno Missionary (USA), criador Los Bayitos). Pendiente confirmación de Fede → linkear `studbook_id=436014`.
- Caballerizas / entrenadores / propietarios de los 25 SPCs: bloqueado en data de dueños de Fede (FKs NULL).
- `abuela_materna`: el "por X" del SB es damsire (abuelo materno), no abuela real → hoy en notas, columna NULL.

---

## 📸 Snapshot 2026-06-10

> Autoritativo. Supera a los snapshots de abajo. Main == origin/main tras merges no-ff de hoy: `feat/desoficializar-rpc` (`61bd81d`), `feat/fase5-resumen` (`4cc6c27`), `feat/apoderados-v1` (`1444fa3`), `feat/apoderados-v1.1-pagos` (`e7a5fb1`) + `feat/resumen-desglose` (`f5a56c4`). Tope de docs en `87e3251`+.

### Apoderados — ISSUE-028 v1 + v1.1 VIVO (autorizados a cobrar)
- **Tabla `apoderados`** (migración `migrations/apoderados.sql` aplicada en DB): autorizante polimórfico propietario/profesional SIN FK; unique parcial anti-dup `WHERE vigente`; RLS club-scoped `TO authenticated` (idéntico a caballerizas), tabla plana NO SECURITY DEFINER. No toca plata existente.
- **UI v1** sección "Autorizados a cobrar" en el modal de edición de `propietarios.html` + `profesionales.html` (solo sobre autorizante existente): listar / agregar / revocar (`vigente=false`, conserva registro).
- **v1.1 display en Pagos** (`cobrosDetalle`): bloque read-only de autorizados vigentes (nombre · DNI) o "cobra el titular". 0 escrituras; emisión/RPC sin tocar. → **v1.1 ya NO es pendiente.**
- Decisión abierta: `autorizado_documento` NOT NULL (a opcional sin riesgo si Fede lo pide).

### Liquidaciones — Resumen ampliado VIVO (read-only): desglose por concepto + montas perdidas
- `loadResumen`: **desglose por concepto** (suma `monto_neto` por `concepto_tipo`) con badge de reconciliación (suma = Total liquidado); **montas perdidas** por jockey (conteo `no_largo=true`, informativo sin plata). Solo `.select()`. Probes sin residuo. **Pendiente confirmar con Fede** el formato del desglose y de montas perdidas.

### Resultados — des-oficializar carrera vía RPC VIVO
- `resultados.html` usa `sb.rpc('desoficializar_carrera', { p_carrera_id })` (SECURITY DEFINER): guard de pagos (RAISE si hay recibos) + `estado→provisional` + limpieza `oficializado_*`. Reemplaza el UPDATE directo. `migrations/desoficializar_carrera.sql`.
- **Seguridad RPCs de plata (verificado hoy):** `emitir_recibo`, `liberar_linea`, `desoficializar_carrera` → `authenticated` EXECUTE; `anon`/`public` SIN EXECUTE.

### Datos de prueba — reunión ficticia 9999 VIVA (se conserva como sandbox — NO borrar)
- Sembrada hoy para que Leo pruebe la pestaña Resumen end-to-end: **`a0000000-0000-0000-0000-000000009999`** (numero **9999**, fecha 2099-01-01, `observaciones='PRUEBA RESUMEN — BORRAR'`, Dolores). En el selector: `Reunión 9999 — 01/01/2099 — Hipódromo de Dolores`.
- 3 carreras + 17 inscripciones (gente real) + 3 resultados oficiales + 2 `no_largo` (montas perdidas) + `liquidacion_detalle` con los 6 `concepto_tipo` + 2 recibos ficticios (numero **9001/9002** insertados a mano, **NO** vía `emitir_recibo` → `club_secuencias.recibo` queda en **0**). Buckets, desglose y montas reconcilian.
- **Nota:** el motor de liquidación ya corrió sobre esta reunión (Recalcular en el browser, paid-safe): preservó las líneas `pagado` (recibos 9001/9002) y regeneró `retenido`/`impago` desde los resultados reales → ahora hay líneas/headers generados por el engine, no solo el seed manual. El teardown borra por `reunion_id`, así que cubre todo.
- **Teardown listo y recuperable:** `teardown_prueba_resumen_9999.sql` (raíz del repo). FK-order, borra recibos por id → NO toca `club_secuencias`. ~~Correr antes de la reunión real del 20/6.~~ **Decisión revertida el 2026-08-29: la 9999 NO se borra.** Es el único sandbox seguro que tenemos —ya sirvió para verificar el camino de recuperación de montas— y en vez de borrarla se la marcó con `reuniones.es_prueba` y se la filtró del buscador de Pagos (`docs/diagnosticos/2026-08-29_issue-055-merge.md`). `teardown_prueba_resumen_9999.sql` queda sin usar, disponible por si alguna vez hace falta.

### Liquidaciones — Fase 5 Resumen de reunión VIVO (v1, read-only)
- **Pestaña "📊 Resumen"** en `liquidaciones.html` junto a Pagos (selector propio). Agrega `liquidacion_detalle` por estado para la reunión: **Total / Pagado (+N recibos) / Pendiente (impago) / Retenido (anti-doping) / Fondo solidario (club, 2%)**. Reconciliación `pagado+impago+retenido+fondo=total`. Lista de **pendientes por beneficiario** (impago/retenido, orden desc), agrupada igual que Pagos (sub-roles bajo el entrenador). **Read-only, no escribe.**
- Probe throwaway reconcilió OK (diff 0.00), restaurado sin residuo → Dolores en 0 liquidaciones.

### Pendientes reales (post 10/6)
- **26 caballos de la anotación del 20/6** — alta bloqueada: faltan **sexo + fecha_nacimiento + registro Stud Book** (esperando dato de Fede). Las 17 caballerizas y 10 entrenadores faltantes también se cargan ahí.
- **Reactivación E1** (caballeriza obligatoria al ratificar) — `git revert 7af005c` cuando esté hecho el backfill SPC→caballeriza, con Fede avisado.
- **Turno→Carrera app-wide** — unificar el número de carrera de programa en toda la app (más allá del recibo, que ya usa `numero_carrera_programa ?? numero_turno`). Ver ISSUE-029.
- **Fase 6** — validar liquidaciones A+B contra datos reales de R5.
- **Confirmación de Fede** sobre el formato del desglose por concepto y de montas perdidas (resumen ampliado).
- **Backfill propietarios** (`inscripciones.propietario_id` 10/95, `spc_propietarios` 0) — bloqueado por dato/Fede.
- → **Cerrados hoy:** Fase 5, resumen ampliado, apoderados v1+v1.1 (ISSUE-028), des-oficializar carrera vía RPC.

---

## 📸 Snapshot 2026-06-09 (cierre de sesión) — superado por el de arriba

> Superado por el snapshot 2026-06-10. Main == origin/main, todo pusheado + deploy verificado en prod.

### Liquidaciones / Pagos — pulido de recibo + 2bis oficializar carrera
- **Recibo de Pagos (final):** imprime **2 copias idénticas** por hoja con rótulo **ORIGINAL / DUPLICADO**; **logo precargado** antes de `print()` (fix de timing); **firma anclada al pie** de cada página; sin CUIT/Tel; bloque firma/aclaración/DNI. Commits `40981c9`, `55c43b7`, `5eecf72`.
- **Limpieza:** borrado el **recibo de liquidación vestigial** + botón **Marcar pagada**; sacados botón **Aprobar** + `cambiarEstado()` muerta; quitada la **captura de cobrador** en Pagos. Commits `f67402e`, `40087ae`.
- **2bis — oficializar/des-oficializar CARRERA VIVO:** botón oficializar/des-oficializar a nivel carrera + **motor de liquidación paid-safe** (no re-liquida líneas ya pagadas). Merge `cc71c64` (`0cbb587`). → reemplaza el "2bis oficializar reunión" que figuraba pendiente.
- **RPCs vivas en DB:** sin cambio (`fn_siguiente_recibo`, `emitir_recibo` v1.1, `liberar_linea`).
- **Pendientes (sin cambio):** **v1.2 tabla de autorizados** (ISSUE-028); **Fase 5 resumen de reunión**; **backfill propietarios** (`inscripciones.propietario_id` 10/95, `spc_propietarios` 0); **turno→carrera en el recibo** (ISSUE-029, parkeado).

---

## 📸 Snapshot 2026-06-08 (cierre de sesión) — superado por el de arriba

> Superado por el snapshot 2026-06-09. Supera al snapshot de arranque de abajo.

### Liquidaciones / Pagos — Fase 4 VIVO en main/prod
- **Generación (Fase 0-2 + C):** reparto por config, fondo solidario, bono ganador (al 1°, por roles), bono 6-8 (100% propietario), **incentivos** (jockey 50k/reunión dedup, entrenador 10k/caballo — merge `47362ef`), retención automática 1°/2° (Fase C).
- **Fase 4 — Pagos/recibos VIVO:**
  - **v1** (merge `1a50359`): tab "🧾 Pagos", buscador por persona/caballeriza, detalle pagable cruzando reuniones, RPC `emitir_recibo` (número correlativo + recibo + marcado atómico), print.
  - **v1.1** (merge `4851129`): **liberación del doping = MANUAL** — `emitir_recibo` pagable solo `impago`; RPC `liberar_linea` (retenido→impago) con botón Habilitar; filtro por carrera; búsqueda por nombre/apellido/DNI.
  - **Recibo:** logo del club (`clubs.logo_url`) en membrete a la izquierda + firma sin recuadro (`6d1ed11`, `154c83e`).
- **RPCs vivas en DB:** `fn_siguiente_recibo`, `emitir_recibo` (v1.1), `liberar_linea`.
- **Pendientes:** **v1.2 tabla de autorizados** (autorizante→autorizado para cobrar por otro); **Fase 5 resumen de reunión**; **2bis oficializar reunión**; **backfill propietarios** (`inscripciones.propietario_id` 10/95, `spc_propietarios` 0); **turno→carrera en el recibo** (mostrar nº de carrera de programa, parkeado).
- **Reglas Fede confirmadas hoy:** ver `docs/LIQUIDACIONES_MODELO.md` (incentivos, bonos, retención + liberación manual, recibo, autorizaciones).

### Otros (sin cambio esta sesión)
- E1 caballeriza-obligatoria NEUTRALIZADA en main (`7af005c`); Fix D vivo (`ccef143`). Backfill = reactivar E1.
- Fix UI: `.modal` top-align (`a1565cd`).

---

## 📸 Snapshot 2026-06-08 (arranque de sesión) — superado por el de cierre (arriba)

> Verificado contra repo/DB/git el 2026-06-08. Lo no confirmado va marcado **(sin confirmar)**.

### Entorno / infra
- Claude Code corre en **VPS Hetzner** (`ubuntu-8gb-fsn1-1`, fsn1), Ubuntu **26.04 LTS** "resolute",
  4 vCPU, 7.6 GiB RAM, 150 G disco, node v22.22.1. Repo en **`/home/clio/dev/SGH`**.
  Acceso: VS Code Remote-SSH + Terminal nativa desde una MacBook Air. **Ya NO es Codespaces.**
- **Sin browser:** Playwright/chromium no corre en Ubuntu 26.04 → verificación de flujos con harness
  de código real (AsyncFunction + Supabase real + stubs DOM; snapshot→run→assert→restore). Ver `docs/SERVER.md`.
- **Relevo por `.md`:** el copy de terminal no es confiable → CC escribe a `.md` y pushea; el asesor lee de `raw.githubusercontent.com`.

### Seguridad (remediación 2026-06-07)
- Keys legacy (`eyJ...` anon + service_role) **DESHABILITADAS** (401 "Legacy API keys are disabled"). Rotado a:
  **publishable** (`sb_publishable_...`, frontend, en los HTML) + **secret** (`sb_secret_...`, server-side, `.env` del VPS gitignore como `SUPABASE_SECRET_KEY`, nunca en git).
- JWT **HS256 revocado → ECC P-256** **(sin confirmar in situ — documentado en la remediación)**.
- PAT comprometido revocado; PAT **`claude-code-mcp`** activo (lo usa el Supabase MCP).
- **FASE 3** (policies de catálogos permisivos) **diferida**. **leaked-password protection: PENDIENTE** (toggle manual en dashboard — acción del dueño).
- Docs: `docs/SECURITY.md`, `SECURITY_AUDIT.md`, `REMEDIACION_RESULTADO.md`.

### Liquidaciones
- **Modelo CERRADO:** `docs/LIQUIDACIONES_MODELO.md`. **Gap analysis (en main):** `docs/LIQUIDACIONES_GAP_ANALYSIS.md`.
- **VIVO en main/prod:** Fase 0 (schema), Fase 1 (config por club), Fase 2 (fondo solidario 2% + bono 6-8 100% propietario + incentivos) — merge `ccef143`; **Fase C** (estado_linea + retención anti-doping 1°/2°) — `7e638c7`. → §1-6 + §8 del modelo = **7/9**.
  - Fase C: premio 1°/2° → `retenido` + `fecha_liberacion = reuniones.fecha + dias_antidoping` (30); NOTA-A: subs `actuacion` acompañan; NOTA-B: reunión sin fecha → retenido + warn; resto `impago`. Verificada real-code `tests/probe_fase_c.mjs` (11/11). Ver `docs/RESULTADO_FASE_C.md`, `docs/PLAN_FASE_C.md`.
- **Faltan (al arranque; §7 recibo YA hecho en el cierre):** §9 resumen de reunión. Ver snapshot de cierre arriba.
- **Bloqueante de datos (Fase A):** `inscripciones.propietario_id` **10/95** (85 NULL); `spc_propietarios` **0**. Sin dueño no se liquida propietario ni bono 6-8 (GOTCHA #47). Backfill bloqueado por dato/Fede.
- **Pendiente de Fede:** mapping SPC→propietario; montos incentivo jockey/entrenador (hoy 0 → no se generan); regla de liberación anti-doping (¿auto 30d o gated por doping? **(sin confirmar)** — hoy auto).
- **Fases siguientes (estado al cierre):** **C ✅** · **4 recibos ✅ (v1+v1.1)** · pendientes: A backfill, 2bis oficializar, 5 resumen, 6 validar R5, v1.2 autorizados.

### Ratificación
- **E1 caballeriza-obligatoria NEUTRALIZADA en main** (commit `7af005c`, hard-block removido en 3 sitios de `ratificacion.html`; motivo: que Fede pueda ratificar sin caballeriza obligatoria mientras falta el backfill). Gate de **jockey** sigue activo. Reactivar = backfill SPC→caballeriza + `git revert 7af005c` con Fede avisado.
- **Fix D (captura de caballeriza en `spcs.html`, `f-caballeriza-form`/`f-sexo-form`) VIVO en main** (`ccef143`, ISSUE-026 resuelto).

### Pendiente operativo (decide el dueño)
- Liquidaciones ya generadas en prod siguen en `impago` hasta regenerarlas. **No regenerar por cuenta propia.**
- R5 tiene 3 líneas en `retenido` dejadas por la verificación UPDATE previa a Fase C (no de una regeneración real); se pueden volver a `impago` con un UPDATE puntual si se decide.

### Git
- `main` con Fase C + gap analysis + doc-sync mergeados (`eb89d54` y posteriores) y desplegado en GitHub Pages.

---

## Producción: https://mdqclio.github.io/SGH/

## Funcionando correctamente
- Login y recuperación de contraseña
- Dashboard con calendario y estadísticas
- Panel admin para gestión de hipódromos
- Alta de nuevos hipódromos (registro.html)
- Reuniones: CRUD con 7 estados
- Carta de llamados: turnos, bonos, premios, publicar/bloquear
- Inscripciones: buscador SPCs, jockey titular/suplente, peón/capataz/sereno, estado mal_inscrito, marcar carrera reabierta/anulada. Header compacto, dropdown Estado inline, contador inscriptos.
- PDF inscriptos estilo Palermo: CSS columns 4-col, bloques por turno, condición abreviada, banda REABIERTA, lista alfabética con (H) y ●, matriz consolidada ORDEN DE LARGADA al pie. 2 páginas A4 landscape.
- Ratificación (ratificacion.html) — feature-complete (15/05/2026):
  - Columnas separadas: SPC | Caballeriza | Jockey | Peso | Estado | Acciones
  - Jockey editable inline: select con suplente como primera opción, XX en rojo si NULL, save on change, actualiza botón Ratificar sin re-render
  - Tercer estado `mal_inscrito`: botón ⚠, modal compartido con forfait, badge naranja, excluido del contador de activos
  - Barra de navegación por turnos: botones numéricos, click expande + colapsa otros + scroll suave
  - Validación bloqueante al ratificar: requiere jockey_titular_id
  - Cierre por hora: campo `reuniones.hora_cierre_ratificacion TIME DEFAULT '12:00:00'`. Badge ABIERTA/CERRADA. Cuando cerrada: UI read-only completa.
  - Congelamiento de peso: al cargar reunión cerrada, copia peso_declarado → peso_final para ratificadas sin peso_final
  - Alerta de colisión de jockey: filas con mismo jockey en carrera se marcan ⚠ dup. (visual, no bloqueante)
  - `motivo_forfait` renombrado a `motivo_estado` en DB y frontend (inscripciones.html, portal.html, ratificacion.html)
- Programa hípico (programa.html) — Bloque D sub-tanda 1 completa (15/05/2026):
  - Solo inscripciones ratificadas. Columnas: # | SPC | Caballeriza | Propietario | Entrenador | Jockey | Peso | Últimas 5 performances
  - Header con logo (si existe), nombre hipódromo, número y fecha de reunión
  - Condiciones crudas por carrera (sin composer — D.2)
  - Bolsa y distribución de premios por puesto
  - CSS @media print A4 landscape. Pendiente: D.2 (composer), D.3 (logo configurable), D.4 (postponed/H)
- Stud Book, profesionales, jockeys, propietarios, caballerizas (con modelo relacional de responsables)
- Sanciones compartidas, resoluciones
- Gestión de usuarios por hipódromo
- Calendario anual de reuniones
- PWA instalable
- **Admin "Mi Hipódromo"** (19/05/2026): ABM de Comisión de Carreras, Sponsors y Comisariato (club-level). Campos disclaimer_importante, disclaimer_nota, redes sociales (website/instagram/facebook/tiktok/twitter_x/youtube). Rol admin-de-hipódromo puede editar sus propios datos (no requiere super_admin).
- **Carta de llamados** (19/05/2026): rediseño completo del PDF estilo Dolores — cajas de carrera con caption de categoría, bono inline en rojo, bloques de novedades editables (textarea con auto-save), disclaimers, fechas operativas, secretaría con redes sociales, logos de sponsors.
- **"No corrió" en `resultados.html`** (28/05/2026 — feat/no-corrio-v3): botón NC por caballo ratificado en el marcador. Al guardar (F10), los marcados se persisten con `{posicion:null, no_largo:true}` en `resultado_posiciones`. Mandil conservado (hueco). Deducción automática si quedan caballos sin resultado al guardar. Schema: `posicion` nullable + columna `no_largo` ejecutadas en prod. RPC `aplicar_resultado` actualizada. Probe: `tests/probe_no_largo.mjs`. End-to-end verificado en prod.
- **Apuestas por carrera — tabla relacional** (27/05/2026): tabla `carrera_apuestas` (reemplaza `carreras.apuestas_habilitadas JSONB`). Modal 🎯 Apuestas en programa.html con checkbox + precio + nombre + asegurado/incremento por carrera. 13 tipos válidos: GAN, SEG, TER, EX, IM, TR, CUAT, X2, X2P, X3, X4, X5, CAD. Guardado bulk vía Promise.all.
- **Reunión activa centralizada** (19/05/2026 → helper 20/05/2026): `sgh_active_reunion_id` en localStorage. Refactorizado a `active-reunion.js` helper global `window.ActiveReunion` aplicado en 6 pantallas (programa, carta-llamados, inscripciones, ratificacion, resultados, liquidaciones). Fijable desde reuniones.html con botón 📍 Activar.
- **Selector de hipódromo para super_admin** (20/05/2026): `club-switcher.js` inyecta dropdown en el topbar de las 16 pantallas operativas/de gestión. Persiste en `sgh_selected_club_id`. Al cambiar de hipódromo borra `sgh_active_reunion_id` para evitar apuntar a reunión de otro club. Excluye login/registro/index (index ya tiene su propio selector).
- **Bug alta de hipódromos** (20/05/2026): corregido INSERT de categorías por defecto que usaba tabla `categorias` → `categorias_carrera`. Backfill aplicado para hipódromos existentes sin categorías.
- **Premio mínimo unificado** (20/05/2026): eliminada columna huérfana `premio_minimo` en liquidaciones. Unificado en `distribucion_premios.ganancia_minima` que ya existía.
- **Programa Oficial Fases 4.1–4.3** (20/05/2026): nueva página `programa-oficial.html` standalone para impresión. Estilo newsprint B&N, tipografía EB Garamond/Inter. Header comisión/comisariato/logo. Bloque por carrera con tabla 8 columnas (CABALLERIZA, 4 ULT.PERF., N°, SPC, JOCKEY, KESP, PADRE-MADRE, ENTRENADOR). Sponsors grid B&W, banner próxima reunión, sponsor destacado a media página (foto + datos). Secretaría y teléfono de inscripciones en el pie. Paginación @page Chrome/Edge. Accesible desde botón 📘 en programa.html.
- **Campo ult_performances en SPCs** (20/05/2026): `spcs.ult_performances TEXT`, editable desde el modal de edición en tab Origen. Celda en blanco si no hay datos.
- **RLS multi-tenant por club_id** — 26 tablas endurecidas, aislamiento cross-club verificado, ISSUE-017 cerrado (14/05/2026)
- **Sistema de auditoría** — UI completa con paginación, filtros, diff visual, export CSV (12/05/2026)

## En desarrollo
- Resultados: rediseñado — pendiente testing manual end-to-end por Fede. Ver bugs conocidos en ISSUES.md (ISSUE-020 al 025).
- Liquidaciones: **Fase 1+2+C + Fase 4 (Pagos/recibos) vivas en main/prod** (ver snapshot 2026-06-08 arriba y ISSUE-001 / `docs/LIQUIDACIONES_GAP_ANALYSIS.md`). Pendientes: A (backfill propietarios, bloqueada por dato/Fede), 2bis (oficializar reunión), 5 (resumen de reunión), 6 (validar R5), v1.2 (autorizados).

## Pendiente de construir
- Portal propietarios/entrenadores (portal.html)
- Auto-registro de profesionales (registro-profesional.html)
- API con Stud Book nacional (en gestión de acceso)
- Emails automáticos (pendiente Resend/SendGrid)
- Cargar datos de sponsor destacado, secretaría y teléfono en Admin → Mi Hipódromo para Dolores
- Programa Oficial Fase 4.4: página de combos (Triplo, Cuaterna, Doble) — bloqueada hasta confirmar modelo de apuestas combinadas con Fede
- Confirmar con Fede el formato exacto de K E S P (asumido como Kilos/Edad/Sexo/Pelaje, códigos Z/T/A/C/N/M)

## Clientes activos
| Hipódromo | Sigla | Estado | club_id |
|---|---|---|---|
| Hipódromo de Dolores | HDO | Piloto activo | 0649e9c5-9e87-4aad-842f-101458e6b33c |

## Datos cargados en Dolores (sesión may-2026)
- 5 reuniones (enero-mayo 2026)
- 11 carreras en reunión 5
- 7 jockeys (Dolores)
- 77 entrenadores (Dolores)
- 201 caballerizas
- 219 responsables de caballerizas (38 vinculados con profesional_id por DNI matching, 16 copropiedades)
- SPCs y entrenadores de prueba cargados

## Datos de validación PDF (reunión 5 Dolores — may-2026)
- Los 11 turnos poblados con ~81 inscripciones en total (distribución random)
- Turno 1: 11 inscriptos, condicion_sexo='ambos', nombre='Premio Apertura'
- Dourada: sexo='hembra' para validar el indicador (H) en carrera mixta
- Todos los inscriptos de turno 1: certificado_correr=false (validación del ●)
- numero_partidor asignado aleatoriamente 1-16 por carrera, sin repetir dentro de la misma carrera
- hipodromos.cantidad_gateras = 16 para Dolores (cargado por SQL)

## Limpieza pendiente (datos de prueba en Dolores)
- 9 caballerizas extra detectadas
- 14 profesionales extra detectados
- 7 propietarios de prueba detectados
- Todos identificados pero no borrados (esperar UI de baja)

- **Vista Reducida / Vista Detallada de dividendos** (27/05/2026): `resultados.html` rediseñado estilo papel. Eliminada grilla editable. Vista Reducida: GAN/SEG/TER en 3 columnas con chapas SBARG color + monto en cápsula. Vista Detallada: posicionales + Apuestas directas (EX/IM/TR/CUAT con composición auto-computada via chips) + Apuestas combinadas (X2/X2P/X3/X4/X5/CAD). Ambas vistas usan `renderDivHTML()` compartido.
- **Modal "Div. habilitadas"** (27/05/2026): carga de dividendos por tipo habilitado en carrera. Posicionales GAN/SEG/TER con chapa SBARG + input de dinero en 3 columnas. Directas y combinadas en lista vertical.
- **Botón "Pesos balanza"** (27/05/2026): modal en `resultados.html` que muestra inscripciones ratificadas, permite cargar `inscripciones.peso_balanza` NUMERIC(5,2) (peso del caballo en balanza post-carrera, rango 300–600 kg).
- **renumerar-chapas.js** (27/05/2026): helper centralizado `renumerarChapas(inscripciones)` — filtra `estado === 'ratificado'`, ordena por `numero_partidor` ASC, devuelve `{id → 1..N}`. Aplicado en 7 call sites corrigiendo bug de chapa 16.
- **Terminología visual** (27/05/2026): "Combinatoriales" → "Apuestas directas", "Multi-carrera" → "Apuestas combinadas". Códigos internos sin cambio.
- **Cosméticos resultados.html** (27/05/2026): "Turno N" → "Carrera N", subtítulo solo distancia, labels M.(F) y (MANDIL) removidos, "Sport" → "Div a GAN".
- **formatARS / parseARS / bindARSInput** (27/05/2026): formato argentino para todos los inputs y displays de dinero en `resultados.html` (punto miles, coma decimal, 2 decimales fijos).

---

## Snapshot — 28/05/2026 (cierre de sesión)

**Reunión activa**: Reunión 5 — 17/5/2026 — Hipódromo de Dolores (11 turnos).

**Completado en esta sesión**:
- `feat/no-corrio-v3` mergeada a `main` y desplegada en prod.
- Schema ejecutado en prod vía MCP: `posicion` nullable + columna `no_largo BOOLEAN NOT NULL DEFAULT false`.
- RPC `aplicar_resultado` actualizada: INSERT de `resultado_posiciones` incluye `no_largo`.
- End-to-end verificado en prod: 9 filas (7 con posicion 1..7, 2 con posicion=null y no_largo=true).
- Docs actualizados: CHANGELOG, ESTADO, ISSUES, SCHEMA, MODELO_NUMERACION.

**Próximo paso**: testing manual con Fede en resultados → Bloque C liquidación (montas perdidas, prerequisites ahora cumplidos).

---

## Snapshot — 27/05/2026 (cierre de sesión)

**Reunión activa**: Reunión 5 — 17/5/2026 — Hipódromo de Dolores (11 turnos).

**Validación de Fede**: pendiente en producción — primer ciclo completo con dividendos. Bugs conocidos documentados en ISSUES.md (ISSUE-020 al 025).

**Schema nuevo en esta sesión**:
- `carrera_apuestas` — tabla relacional que reemplaza `carreras.apuestas_habilitadas JSONB`. Una fila por apuesta habilitada por carrera. 13 tipos válidos.
- `carreras.apuestas_notas` TEXT NULL — texto libre para notas de apuestas en el programa oficial.
- `resultado_apuestas` — UNIQUE `(resultado_id, tipo, orden)` agregado; TE removido del CHECK; CUAT agregado.
- `inscripciones.peso_balanza` NUMERIC(5,2) NULL — peso real del caballo en balanza post-carrera.

**Archivos nuevos en esta sesión**:
- `renumerar-chapas.js` — helper centralizado de renumeración de chapas.

**Archivos modificados en esta sesión**:
- `resultados.html` (rediseño completo de dividendos, formatARS, renumerar-chapas, botón pesos balanza, cosmetics)
- `programa.html` (modal apuestas → carrera_apuestas, terminología)
- `programa-oficial.html` (corrección filtro `estado === 'ratificado'`, terminología)
- `programa-oficial-color.html` (corrección filtro `estado === 'ratificado'`, terminología)

---

## Snapshot — 20/05/2026 (cierre de sesión)

**Reunión activa**: Reunión 5 — 17/5/2026 — Hipódromo de Dolores (11 turnos).

**Validación de Fede**: pendiente en producción — primer render del Programa Oficial pendiente con datos reales.

**Schema nuevo en esta sesión**:
- `spcs.ult_performances` TEXT — performances manuales hasta API Stud Book.
- `clubs.secretaria_carreras_nombre` TEXT — nombre de la secretaria para el pie del programa.
- `clubs.inscripciones_telefono` TEXT — teléfono de inscripciones para el pie.
- `clubs.sponsor_destacado` JSONB `{nombre, subtitulo, foto_url, direccion, contacto}` — bloque heroico de publicidad en el programa.

**Archivos nuevos en esta sesión**:
- `active-reunion.js` — helper `window.ActiveReunion` (resolve/set/clear).
- `club-switcher.js` — dropdown de hipódromo para super_admin, inyectado en 16 páginas.
- `programa-oficial.html` — vista de impresión estilo manual de Dolores.

**Archivos modificados en esta sesión**:
- `spcs.html` (campo ult_performances)
- `programa.html` (botón 📘 Programa Oficial + función abrirProgramaOficial)
- `admin.html` (secciones Secretaría e inscripciones + Sponsor destacado en modal Mi Hipódromo)
- `carta-llamados.html`, `inscripciones.html`, `ratificacion.html`, `resultados.html`, `liquidaciones.html` (active-reunion.js helper)
- 16 pantallas operativas/de gestión (club-switcher.js tag al final del body)

---

## Snapshot — 19/05/2026 (cierre de sesión)

**Reunión activa**: Reunión 5 — 17/5/2026 — Hipódromo de Dolores (11 turnos). Fijada en localStorage.

**Validación de Fede**: pendiente en producción.

**Schema relevante** (columnas nuevas o eliminadas en esta sesión):
- `clubs.comision_carreras` JSONB DEFAULT '[]' — board del hipódromo.
- `clubs.sponsors` JSONB DEFAULT '[]' — sponsors para carta de llamados.
- `clubs.comisariato` JSONB DEFAULT '[]' — stewards (movido de reuniones a clubs en refactor).
- `clubs.disclaimer_importante`, `clubs.disclaimer_nota` TEXT — textos legales en carta.
- `clubs.website`, `clubs.instagram`, `clubs.facebook`, `clubs.tiktok`, `clubs.twitter_x`, `clubs.youtube` TEXT.
- `reuniones.fechas_inscripciones`, `reuniones.fechas_forfaits`, `reuniones.fechas_compromiso_montas` TEXT.
- `carreras.apuestas` TEXT[] DEFAULT '{}' — apuestas habilitadas por carrera.
- `carreras.numero_carrera_programa` INTEGER — orden post-ratificación.
- ELIMINADAS: `clubs.apuestas_simples`, `reuniones.apuestas_combinadas`, `reuniones.comisariato`.

**Archivos modificados en esta sesión**:
- admin.html (ABM comisión, sponsors, comisariato, disclaimers, redes; acceso para admin-de-hipódromo)
- carta-llamados.html (rediseño completo PDF, novedades editables)
- programa.html (modal apuestas por carrera, modal comisión read-only, reunión activa en localStorage)
- reuniones.html (hora_cierre_ratificacion, fechas operativas; eliminadas apuestas_combinadas y comisariato)

---

## Snapshot — 16/05/2026 (cierre de sesión)

**Reunión activa**: Reunión 5 — 17/5/2026 — Hipódromo de Dolores (11 turnos).

**Validación de Fede**: pendiente en producción. Sesión cerrada con feature-complete según interpretación de las directivas iterativas (WhatsApp + audios).

**Schema relevante** (estado actual de tablas tocadas):
- `carreras.estado`: VARCHAR libre, nullable, default 'programada'. Valores reales medidos el **2026-08-27** sobre las 49 carreras de la base: `'abierta'` 31, `'anulada'` 7, `'confirmada'` 7, `'programada'` 3, `NULL` 1. `'reabierta'` figuraba acá como valor en uso y hoy tiene **0 filas**. El más común es `'abierta'`, que `carta-llamados.html` escribe en toda carrera que guarda — no significa "inscripción abierta". Filtrar siempre NULL-safe: `.or('estado.is.null,estado.neq.anulada')`, nunca `.neq()` solo (ver gotcha #5 en CLAUDE.md e ISSUE-038). Los conteos son una foto: si no dan, el listado quedó viejo.
- `carreras.condicion_adicional`: usado para "Peso del jockey".
- `carreras.numero_carrera_programa`: INTEGER nullable, para asignar orden post-ratificación.
- `carreras.hora_estimada`: TIME nullable.
- `carreras.categoria_id`: FK a `categorias_carrera` (4 cats por club: OC, ONC, NO, CC).
- `reuniones.observaciones`: text, se renderiza en pie del PDF.

**Archivos modificados en esta sesión**:
- ratificacion.html (mayor parte de los cambios)
- carta-llamados.html (label del peso jockey)
- inscripciones.html (estado 'confirmada' en select)
- programa.html (no se tocó hoy)
