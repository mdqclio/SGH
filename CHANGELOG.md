# Changelog

## [2026-07-22] — Pedigree en el programa: backfill SB + columna PADRE-MADRE sin placeholders

> Branch `feat/pedigree-programa`. El programa sale por sistema con el padre y la madre de cada caballo, como el programa de papel.

- **Hallazgo que corrigió el plan**: el pedigree **no estaba en `spcs.notas`**. Ya vivía en `spcs.padrillo_nombre` / `spcs.madre_nombre` (118/144). `notas` sólo guarda el rastro del scrape (SB id, URL, microchip, criador, abuelo materno). Por eso **no se agregaron columnas `padre`/`madre`** (habrían duplicado el dato y los 3 renderers ya leen las viejas) y **no hubo backfill notas→columnas** (sin insumo).
- **Backfill desde el Stud Book** (`tools/sb_pedigree_26.py`, read-only): de los 26 SPCs sin pedigree, 23 encontrados. **21 UPDATE aplicados** (aprobados por review), sólo `padrillo_nombre`/`madre_nombre`, con guard `AND ... IS NULL` idempotente. **118 → 139 / 144**.
- **Excluidos a propósito (5)**: `GREAT ORPEN` (68 días de discrepancia de fecha + inscripción viva → verificación aparte con Fede; sentencia comentada en la migración), `First Queen` (2 homónimos en SB, ninguno cierra en fecha), `Fist Queen` y `Malenuchi` (duplicados de DB, no existen en SB), `Esplendido Craf` (sólo existe `ESPLENDIDA CRAF`, no cierra ni sexo ni año). Ninguno tiene inscripciones vivas salvo GREAT ORPEN.
- **Render sin placeholders**: `programa.html` ya no imprime `'?'` cuando falta padre o madre — el dato ausente queda **vacío**. El separador ` - ` no queda colgado si falta un lado, y si faltan los dos no se imprime el `Por`. Mismo fix en `programa-oficial.html` y `programa-oficial-color.html`, donde sin padrillo pero con madre salía `" — MADRE"` con el separador colgado. **Los separadores existentes no se cambiaron** (` - ` en programa, ` — ` en los oficiales) para no tocar la salida impresa que Fede ya valida.
- **Reportado sin corregir**: 13 discrepancias de `sexo` SB vs DB (el alta manual deja `macho` por default) y `color` NULL en los 26 — afectan el sexo/pelaje impreso en el programa oficial. Tanda propia.
- Probe: `tests/probe_pedigree_programa.mjs` (**20/20**) — real-code, extrae los snippets reales de los 3 HTML y los corre sobre filas `spcs` reales con las 4 combinaciones de pedigree. Reunión descartable 9998, teardown en la misma corrida.

## [2026-07-21b] — Premios: corrección display → BOLSA EFECTIVA (con piso), bonos aparte

> Branch `fix/bolsa-efectiva-display`. **Corrige la tanda anterior** (regla real aclarada por Yesica): la BOLSA del display NO es la nominal, es la **efectiva con piso**.

- **Display por puesto = EFECTIVO con piso** (`repartoDisplay` ahora envuelve `calcPremiosConPiso`): 4°/5° por debajo del piso se muestran **en el piso** (ej. 100.000). Antes se mostraba el nominal — era un misread.
- **BOLSA impresa = round(bolsaEfectiva) = Σ de los puestos efectivos.** Ej: bolsa cargada 1.191.666 + piso 100.000 → impresa **1.284.416**. `repartoDisplay` redondea cada puesto y el puesto de **mayor monto** absorbe el resto → **Σ puestos ≡ total EXACTO** (espíritu del FIX 2, ahora sobre la efectiva), sin desclavar los pisos.
- **Bonos siguen APARTE** — NO se suman a la BOLSA (`calcPremiosConPiso` los excluye). Esto **no cambia** (decisión de Fede).
- **Sin tocar** `calcPremiosConPiso` ni la liquidación. Cambio centralizado en `repartoDisplay` → los **6 sitios de display** heredan automático (carta-llamados card + PDF, programa, programa-oficial, programa-oficial-color, inscripciones, ratificacion).
- Se mantienen: línea informativa "Ganancia mínima por puesto" y warning `pisoSospechoso()`.
- Probes: `tests/probe_reparto_display.mjs` (9/9, asserta BOLSA=Σ efectivos exacta, 1.191.666+piso→1.284.416, bonos NO sumados) + `tests/probe_piso_warning.mjs` (5/5). Real-code, reunión descartable 9998, teardown en la misma corrida.

## [2026-07-21] — Premios: display nominal + suma exacta + warning piso; restore post-pausa

> ⚠️ **SUPERSEDED por [2026-07-21b]**: la regla "BOLSA nominal" de abajo fue un misread; la real es BOLSA **efectiva con piso**.

> En main/prod. Merge `d626049` (branch `feat/premios-display-v2`, commits `94c8bbd` / `4c01720` / `1ac48e8` / `0fac812`). Revisado por raw antes de mergear.

### Display de premios — decisión de Fede: BOLSA impresa = NOMINAL
- **BOLSA impresa = `bolsa_total` nominal** (reparto 1°-5° tal cual se carga). Ni el piso `ganancia_minima` ni los bonos inflan ese número. Nuevo helper `repartoDisplay()` en `premios-utils.js` reemplaza a `calcPremiosConPiso` en los **6 sitios de display** (carta-llamados card + PDF, programa, programa-oficial, programa-oficial-color, inscripciones, ratificacion).
- **Bonos como líneas aparte condicionales** (solo si monto > 0). En carta-llamados el número BOLSA dejó de sumarlos.
- **Línea informativa "Ganancia mínima por puesto"** (condicional a `ganancia_minima > 0`, mismo estilo que las líneas de bono): comunica el piso sin inflar la bolsa.
- **Reparto con suma exacta**: puestos 1°..(n-1) redondean, el último absorbe el resto → Σ puestos ≡ `round(bolsa_total)` siempre (antes desfasaba $1 por redondeo independiente).
- **`calcPremiosConPiso` intacto**: el piso sigue vivo solo en **liquidación** (pago), no en el display.
- **Warning de piso desproporcionado**: `pisoSospechoso()` (piso > 20% de la bolsa) dispara un `confirm` al guardar en carta-llamados. Warning, **no bloqueo**.
- Probes (real-code, reunión descartable 9998, teardown en la misma corrida): `tests/probe_reparto_display.mjs` (7/7), `tests/probe_piso_warning.mjs` (5/5).

### Fix de data
- **Turno 12, reunión 2026-07-19**: `ganancia_minima` corregida **1191666 → 100000** (error de tipeo: se había cargado la bolsa entera en el campo del piso). El resto de la distribución intacto. `UPDATE` puntual con `jsonb_set` sobre una fila.

## [2026-06-12] — Stud Book: Edge Function `reunion-json` deployada + pasada de formato + seed 9999

> Todo en branches, NO en main. Edge Function + seed: `feat/edge-reunion-json`. Pasada de formato del generador: `feat/json-generator` (`08f8bcb`).

### 1. Edge Function `reunion-json` (Supabase, v7) — VIVA
- `supabase/functions/reunion-json/index.ts`: expone el JSON de reunión por `?fecha=YYMMDD`, **scope Dolores**. URL `…/functions/v1/reunion-json`.
- **Auth** `Authorization: Bearer <STUDBOOK_API_TOKEN>` (o `?token=`), **`verify_jwt` OFF** → el cliente (Diego) llama con **solo el token, sin anon/publishable key**. Sin token / token incorrecto → 401 (no fail-open).
- **DB server-side** con `STUDBOOK_DB_KEY` (`sb_secret_…` en el env de la función; NO la service_role legacy `eyJ`, muerta el 7/6).
- Reusa `supabase/functions/_shared/studbook_format.mjs` → **mismo output byte-a-byte** que el CLI `tools/studbook_reunion_json.mjs`.
- **Validada contra 9999**: `990101` → 200 + diff idéntico a `tools/samples/9999_sample.json`; 401 sin/mal token; `010101` → 404.

### 2. Generador JSON — pasada de formato calcado de La Punta (`08f8bcb`, `feat/json-generator`)
- Wrapper `{status:200, data}`; numéricos a **string** (`numero`/`distancia`/`premios`/`orden`/`kilos`/`jockey_kilos`/`pagaria`); `premios` y `competidores` **doble-anidados** `[[…]]`. Sample completo `tools/samples/9999_sample.json` (datos fake, sin PII).

### 3. Seed de resultados 9999 + teardown extendido (`feat/edge-reunion-json`)
- `tools/seed_9999_resultados.sql`: caballerizas + profesionales ficticios (`PRUEBA 9999 — BORRAR`) + re-apunta FKs de inscripciones para resultados completos.
- `teardown_prueba_resumen_9999.sql`: borra los fakes en orden FK (profesionales → caballerizas).
- `.gitignore`: `tools/_out/` (salida regenerable con datos reales) + `supabase/.temp/` (estado local del CLI).

### Pendientes (ISSUE-030)
- ⚠️ Rotar `STUDBOOK_API_TOKEN` antes del 20/6 (expuesto en setup; hoy solo cubre la 9999 fake).
- Correr teardown de 9999 antes del 20/6.
- Confirmar con Diego el doble-anidado `[[…]]` (a propósito o se aplana).
- Diego prueba el endpoint con `fecha=990101`.

## [2026-06-11] — Stud Book: scrape fase 1 + carga 25 SPCs + columna studbook_id + workstream API

> Solo `studbook_id` está VIVO en main/prod (merge squash PR #2, `db0b2fc`). El scrape (fase 1) y la carga (fase 2) viven en la branch `feat/studbook-extract` — **no mergeada a main** (artefactos persistidos en esa branch).

### 1. Stud Book scrape — fase 1 (branch `feat/studbook-extract`, NO en main)
- `tools/sb_extract.py` — extractor read-only de www.studbook.org.ar (autocomplete `?tipo=1&muerto=1&term=` + perfil). No toca Supabase.
- `data/studbook_26.json` — 25/26 ejemplares encontrados con sexo + `fecha_nacimiento` + pedigree (padre/madre/abuelo materno) + criador + microchip. **0 ambiguos**.
- `LADY BLICK` quedó NO_ENCONTRADO por match exacto. Búsqueda parcial 11/06 ("LADY BL") → candidato único probable **LADY BLIK** (id `436014`, Hembra, 2022-08-25, Zaino Colorado, padre Lencelot, madre Blik, abuelo materno Missionary (USA), criador Los Bayitos). Pendiente confirmación de Fede antes de linkear.

### 2. Carga de 25 SPCs — fase 2 (branch `feat/studbook-extract`, NO en main)
- 25 ejemplares insertados en `spcs` con `club_id=NULL` (globales), `sexo` + `fecha_nacimiento` del Stud Book; enriquecimiento (SB id, url, microchip, criador, damsire) en `notas`. spcs 40 → 65.
- Reporte completo (mapeo + UUIDs + rollback) en `data/studbook_26_insert_report.md`.
- **SALVADOR EVER**: discrepancia de sexo en la planilla resuelta = **macho** (corre carrera de exclusión de yeguas → no puede ser hembra). Cargado macho.
- BACHUNA: microchip null (anotado en notas).

### 3. Columna `studbook_id` en `spcs` — VIVO en main/prod (`db0b2fc`)
- `migrations/add_studbook_id.sql`: `ADD COLUMN studbook_id text` + índice único parcial `spcs_studbook_id_uniq` (`WHERE studbook_id IS NOT NULL`).
- El "Idcaballo" del Stud Book (identificador externo para su API). **Distinto de `registro_stud_book`** (sigue NULL). Tipo text a propósito (id externo, sin aritmética, la API lo manda como string).
- Backfill idempotente de los 25 desde `data/studbook_26.json` (no toca notas). Verificado contra prod: `count(studbook_id NOT NULL) = 25`, ALIADO SCAT=414038, SALVADOR EVER=432357, índice presente.
- Doc: línea de `studbook_id` agregada a la def de `spcs` en `docs/SCHEMA.md`.

### 4. Integración Stud Book API — workstream abierto (ISSUE-030)
- Diego (Stud Book) ofreció acceso a su API y mandó el formato JSON de La Punta como referencia. Se armó un borrador de mapeo para responderle.
- **PENDIENTE**: 7 preguntas a Diego (endpoints, auth, pull vs push, leyenda de estados, mapeo caballeriza→propietario, etc.). Tracking en ISSUE-030.

### Pendientes anotados (ver ISSUES.md)
- LADY BLICK / LADY BLIK → confirmación de Fede → linkear `studbook_id=436014`.
- Caballerizas + entrenadores + propietarios de los 25 SPCs: bloqueado en data de dueños de Fede (FKs en NULL).
- Semántica `abuela_materna`: el "por X" del SB es abuelo materno (damsire), no abuela real → hoy en notas, columna `abuela_materna` queda NULL hasta aclarar.

## [2026-06-10] — des-oficializar carrera vía RPC atómica — VIVO en main/prod

> Merge no-ff `feat/desoficializar-rpc` (`61bd81d`). Solo `resultados.html` + `migrations/desoficializar_carrera.sql`.

### desoficializar_carrera (RPC)
- `resultados.html`: el UPDATE directo a `resultados` se reemplaza por `sb.rpc('desoficializar_carrera', { p_carrera_id })`. La RPC (SECURITY DEFINER) hace el guard duro de pagos (RAISE si hay recibos emitidos) + `estado→provisional` + limpieza `oficializado_*`. El recálculo del motor lo sigue orquestando el cliente; el RAISE del guard cae en toast y no recalcula.
- Grants verificados: `authenticated` EXECUTE; `anon`/`public` SIN EXECUTE (igual que `emitir_recibo` y `liberar_linea`).

## [2026-06-10] — Apoderados en Pagos (v1.1) + Resumen ampliado — VIVO en main/prod

> Merges no-ff `feat/apoderados-v1.1-pagos` (`e7a5fb1`) + `feat/resumen-desglose` (`f5a56c4`). Solo `liquidaciones.html`, todo read-only.

### ISSUE-028 v1.1 — display de apoderados en Pagos (read-only)
- `cobrosDetalle`: query `apoderados` (vigente=true + club + autorizante) sumada al `Promise.all`. Bloque "🪪 Autorizados a cobrar" (nombre · DNI, nombre por `escapeHtml` nuevo) o línea "Sin autorizados registrados — cobra el titular.". 0 escrituras; emisión/RPC sin tocar.

### Resumen ampliado — desglose por concepto + montas perdidas (read-only)
- `loadResumen`: **desglose por concepto** (suma `monto_neto` por `concepto_tipo`: Premios / Actuaciones / Incentivo jockeys / Incentivo cuidadores / Bonos / Fondo solidario) con badge de reconciliación (suma = Total liquidado).
- **Montas perdidas** (informativo, sin plata): conteo `resultado_posiciones.no_largo=true` por jockey (path motor: carreras→resultados oficiales→posiciones→inscripciones). Solo `.select()`.
- Probes throwaway sin residuo (Dolores en 0): apoderados query devuelve solo vigente; conceptos suman al total; montas perdidas por jockey coinciden con filas no_largo (jockey null saltado).

## [2026-06-10] — ISSUE-028 Apoderados v1 (autorizados a cobrar) — VIVO en main/prod

> Merge no-ff `feat/apoderados-v1` → main. Tabla nueva, no toca plata existente.

### Apoderados — tabla + gestión
- **Migración `migrations/apoderados.sql`** (aplicada por MCP): tabla plana `apoderados`. Autorizante polimórfico (`autorizante_tipo` propietario/profesional + `autorizante_id` SIN FK, patrón beneficiario). `autorizado_nombre`/`autorizado_documento` NOT NULL, `vigente` default true, `creado_at`/`creado_por`. Unique parcial `(club_id,tipo,id,documento) WHERE vigente` (anti-dup, permite re-autorizar tras revoke).
- **RLS** club-scoped: 4 policies `TO authenticated`, `fn_is_super_admin() OR club_id=fn_get_user_club_id()` (idéntico a `caballerizas`). Tabla plana con RLS — NO SECURITY DEFINER. Grants estándar.
- **UI** en `propietarios.html` + `profesionales.html`: sección "Autorizados a cobrar" en el modal de edición (solo sobre autorizante existente) — listar (nombre+DNI+vigente/revocado), agregar (insert con club_id+tipo+id), revocar (`vigente=false`, conserva registro).
- Probe DB (restaurado sin residuo): insert→list→duplicado vigente bloqueado→revoke (conserva)→re-autorizar OK→cleanup. **Decisión abierta:** `autorizado_documento` quedó NOT NULL (cambiar a opcional = `ALTER COLUMN DROP NOT NULL`, sin riesgo). Pendiente **v1.1: display en Pagos**.

## [2026-06-10] — Fase 5 Resumen de reunión (v1, read-only) — VIVO en main/prod

> Merge no-ff `feat/fase5-resumen` → main. Solo `liquidaciones.html` (+95/-1). No toca plata: solo lectura.

### Fase 5 — pestaña "📊 Resumen" (read-only)
- Nueva pestaña junto a Pagos, selector de reunión propio. Agrega `liquidacion_detalle` por `estado_linea` para la reunión elegida; **no escribe**.
- Buckets: **Total liquidado** / **Pagado** (+ N recibos distintos) / **Pendiente** (impago) / **Retenido** (anti-doping, bucket propio) / **Fondo solidario club** (2%, bucket propio, excluido de personas).
- **Reconciliación**: `pagado + impago + retenido + fondo = total` con badge cuadra/dif.
- **Pendientes por beneficiario** (persona, non-club, adeudado>0): columnas Impago | Retenido | Total, orden desc. Agrupa por `beneficiario_tipo|beneficiario_id` igual que Pagos → sub-roles peón/capataz/sereno ruedan bajo el entrenador (ADR-025); nombres vía `nombreBenef` (GOTCHA #50).
- Probe throwaway (reunión fake, restaurada sin residuo): buckets reconcilian (total 33600, diff 0.00), peón rolled-up bajo entrenador, pagado-only excluido de pendientes. Dolores quedó en 0 liquidaciones.

## [2026-06-08] — Incentivos montas + Fase 4 Pagos/recibos (v1, v1.1) + recibo logo/firma — VIVO en main/prod

> SHAs verificados contra git.

### Incentivos Bloque C — montos Fede + granularidad (merge `47362ef`)
- Jockey **50.000 fijo por reunión** (1 línea por jockey que corrió, aunque tenga N montas — dedup).
- Entrenador **10.000 por caballo corrido** (1 línea por inscripción corrida, sin dedup, `inscripcion_id` seteado).
- Montos en `liquidacion_config` (DML prod 50000/10000). Probe `tests/probe_incentivos_montas.mjs` (11/11). No tocó bonos ni retención.

### Fase 4 v1 — tab Pagos + buscador + emisión de recibo (merge `1a50359`)
- RPC `emitir_recibo` SECURITY DEFINER: número correlativo (`fn_siguiente_recibo`) + insert `recibos` + marcado atómico de líneas pagables → pagado/recibo_id/pagado_at. Idempotente, blindaje por beneficiario, RAISE si 0 marcadas. `migrations/emitir_recibo_fase4.sql`.
- Tab "🧾 Pagos": buscador por persona/caballeriza (excluye club), detalle pagable cruzando reuniones, emisión vía RPC, print con firma(efectivo)/comprobante(transferencia). Probe `tests/probe_recibos_emision.mjs` (14/14).
- Hallazgo: peón/capataz/sereno NO buscables por su persona — cobran dentro del recibo del entrenador (ADR-025).

### Fase 4 v1.1 — liberación MANUAL del doping + búsqueda + filtro carrera (merge `4851129`)
- `emitir_recibo` v1.1: pagable = **SOLO impago** (sacado el `OR (retenido AND fecha_liberacion<=hoy)`). `migrations/emitir_recibo_v1_1.sql`.
- RPC `liberar_linea(uuid)` SECURITY DEFINER: flip `retenido→impago` (liberación manual al llegar el doping); club scoping vía `fn_club_de_liquidacion`/`fn_get_user_club_id` (backend service_role pasa); sin tocar grants. `migrations/liberar_linea.sql`.
- Frontend: sección "🔒 Retenido por doping" con botón Habilitar→`liberar_linea`; filtro por carrera (`numero_carrera_programa ?? numero_turno`); búsqueda por nombre/apellido/DNI (`benefSearch`). Probe `tests/probe_cobros_v11.mjs` (11/11). La retención automática 1°/2° (Fase C) NO se tocó.

### Recibo — logo + firma (`6d1ed11`, `154c83e`) · Fix modal (`a1565cd`)
- Recibo (ambos templates): logo del club (`clubs.logo_url`) en membrete a la izquierda (~100px) + firma sin recuadro (línea + leyenda "Firma y sello").
- `.modal` `margin: auto` → `margin: 0 auto` (top-align respetando `align-items:flex-start` del overlay; afecta detalle/reparto/comisión).

## [2026-06-07 / 2026-06-08] — Liquidaciones C+D (Fase 0-2) + Fix D · Fase C — VIVO en main/prod

### Liquidaciones C+D — VIVO en main/prod

> **Estado de deploy (SHAs verificados contra git):** Fase 0 (schema), Fase 1 (config por club) y Fase 2 (fondo solidario 2% + bono 6-8 100% propietario + incentivos) **VIVAS en main/prod** vía merge **`ccef143`** (`fix/security-hardening`, 2026-06-07). **Fase C** (estado_linea + retención anti-doping 1°/2°, incl. NOTA-A subs actuacion) **VIVA en main** vía **`7e638c7`** (2026-06-08). **Fix D** (captura de caballeriza en `spcs.html`, `f-caballeriza-form`/`f-sexo-form`) **vivo en main** (`20fdbc7`, mergeado en `ccef143`). **E1** (caballeriza obligatoria al ratificar, hard block) **NEUTRALIZADA en main** (**`7af005c`**) — motivo: que Fede pueda ratificar sin caballeriza obligatoria mientras falta el backfill SPC→caballeriza; reactivación = backfill + `git revert 7af005c` con Fede avisado.

#### Schema — Fase 0 (vigente en DB)
- Migración `migrations/liquidaciones_cd_fase0.sql` (idempotente). 5 ENUMs (`estado_linea_liq`, `concepto_liq`, `beneficiario_tipo`, `forma_pago_recibo`, `estado_recibo`); 3 tablas (`liquidacion_config` con CHECK suma=100, `club_secuencias`, `recibos` con `neto_a_cobrar` GENERATED + CHECK beneficiario + UNIQUE club+numero); 10 columnas nuevas en `liquidacion_detalle` (la LÍNEA como unidad de deuda); `fn_siguiente_recibo` SECURITY DEFINER; RLS + auditoría en las 3 tablas; seed de Dolores. Ver SCHEMA.md y ADR-042..047.

#### Fase 1 — config por club (en main)
- `generarLiquidaciones` lee % de reparto e incentivos desde `liquidacion_config` (antes hardcodeados). Pestaña "Reparto de premios" en liquidaciones.html.

#### Fase 2 — fondo solidario + bono 6-8 + incentivos (en main)
- **Fondo solidario 2%:** una línea por ubicado 1-5 (`concepto_tipo='fondo_solidario'`, `beneficiario_tipo='club'`, `beneficiario_id=CLUB_ID`), 2% de `premioEfectivo` (incluye bono al ganador y piso; NO el bono 6-8). Agrupadas en una liquidación `club` por reunión (sin persona). 98% roles + 2% fondo = 100%.
- **Bono 6°-8°:** sacado de `calcPremio` (era código muerto, ver GOTCHA #45) → helper `calcBono68`. Paga 100% al propietario, neto, `concepto_tipo='bono'`.
- **Bono al ganador:** sin cambios — sigue fundido en el premio del 1° y repartido por roles (`concepto_tipo='premio'`).
- **Incentivos (Bloque C):** líneas `incentivo_jockey`/`incentivo_entrenador` desde `liquidacion_config`, una por profesional que largó (`no_largo=false`) estando ratificado, neto, independiente del premio. Guard: monto 0/null → no genera (hoy ambos en 0 → no se generan).
- **Cosmético:** `renderLiquidaciones` muestra "Fondo solidario (club)" para la liquidación club.
- **Descuentos:** `descPct` (comision_config) aplica solo a `premio`; bono/incentivo/fondo van netos.

#### Tests
- `tests/probe_fase2_liquidaciones.mjs` — 14 checks de FORMA de líneas sobre R5 (extrae el cuerpo real de `generarLiquidaciones` y lo corre sin browser). Snapshot+restore de resultados/liquidaciones/roles. Solo valida forma; no aprueba/paga.

#### Sin cambios de schema en Fase 1 y 2
- Todo se apoya en ENUMs/columnas de Fase 0.

#### Derivación de propietario (02/06/2026 — APLICADA en prod)
- Migración `migrations/liquidaciones_cd_propietario_derivacion.sql` (aplicada por MCP). Construye el puente `caballeriza_responsables (titular) → propietarios` y deriva `inscripciones.propietario_id` desde la caballeriza:
  - **A1/A2:** columna `caballeriza_responsables.propietario_id` (FK) + índice único parcial `ux_propietarios_club_doc (club_id, documento_tipo, documento_nro) WHERE documento_nro IS NOT NULL`.
  - **B1/B2:** import de **213 propietarios** de Dolores desde responsables titulares con DNI (`propietarios` 7 → 220; `prop_dolores` 0 → 213; sin duplicados) + backfill del puente por documento. 5 titulares sin DNI quedan como excepción (no se importan).
  - **C/C2:** trigger `trg_insc_set_propietario` (BEFORE INSERT/UPDATE OF caballeriza_id) que deriva `propietario_id` desde el titular activo de la caballeriza; backfill de existentes.
  - **C3:** trigger gemelo `trg_cab_resp_set_propietario` (BEFORE INSERT/UPDATE) que al alta/edición de un titular resuelve `v_club` desde la caballeriza (guard `RAISE` si NULL) y crea/enlaza el propietario (idempotente por documento).
- **Cobertura histórica: 3/87 inscripciones** quedaron con `propietario_id` (las únicas de R5 con `caballeriza_id` + titular resuelto). El resto sigue sin propietario porque **no tiene `caballeriza_id`** (76/87) — causa raíz: el alta de SPC pierde la caballeriza (ISSUE-026). Los triggers C/C3 cubren la captura **hacia adelante**.
- Probe `tests/probe_propietario_derivacion.mjs` — 11 checks (cadena estática BAUTY MI→OLGUIN + triggers C y C3 en vivo con revert/cleanup). Todo OK.

#### Captura de caballeriza hacia adelante (02/06/2026 — branch, alimenta la derivación)
- **Fix D — `spcs.html` (ISSUE-026, id duplicado):** los selects del modal (`f-sexo`, `f-caballeriza`) colisionaban con los filtros del toolbar → `getElementById` agarraba el toolbar y `caballeriza_id` se guardaba **siempre null** (causa raíz de los 76/87 sin caballeriza). Renombrados a `f-sexo-form` / `f-caballeriza-form`; populate/openModal/saveRecord apuntan al modal. Probe `tests/probe_spcs_caballeriza.mjs` (11/11, jsdom + roundtrip real a DB).
- **Fix E — caballeriza obligatoria al ratificar:**
  - **E1 (`ratificacion.html`, HARD):** no se ratifica sin caballeriza (botón disabled + guard en `ratificar()` + `data-caballeriza` en el row).
  - **E2 (`inscripciones.html`, SOFT):** `confirm()` de advertencia al inscribir sin caballeriza (deja continuar).
  - **E1 NEUTRALIZADA en main** (`7af005c`): el hard block se removió para que Fede pueda ratificar sin caballeriza obligatoria mientras falta el backfill. Reactivación = backfill `caballeriza_id` en SPC activos + Fede al tanto del cambio de workflow + `git revert 7af005c`. Ver ISSUE-027.

#### Pendiente / bloqueante conocido
- ~~`inscripciones.propietario_id` está NULL (0/87)~~ **Mitigado:** derivación aplicada (ver arriba) + Fix D vivo en main. Estado actual **10/95** con propietario; el resto sin `caballeriza_id` histórico (85 inscripciones); `spc_propietarios` sigue vacía. Captura hacia adelante cubierta por triggers + Fix D (`spcs.html`). Backfill de las históricas = Fase A (bloqueada por dato/Fede). Ver GOTCHA #47 / ISSUE-001 / ISSUE-026.

---

## 2026-05/06 — Vacante (VAC inline) → main

> **En main (SHAs verificados):** `feat/vacante-vac-inline` mergeado en **`7ee49c5`** (la versión vigente: VAC se escribe en el input). Reemplazó a `feat/vacante-manual` (checkbox), mergeado antes en **`ed069d0`**. Ambos quedaron en la historia de main; vigente = el inline.

### `feat/vacante-vac-inline` — vacante escribiendo "VAC" en el input (pedido de Fede)

Reemplaza el checkbox de `feat/vacante-manual` por un único campo "monto-o-VAC". El dato de vacante es **solo informativo** (lo consumen el Stud Book y la página); **no entra en liquidación** (eso va por bolsa de premios + bonos), así que un campo único alcanza.

#### Cambiado

- **Vacante se marca escribiendo `VAC`** (case-insensitive, se normaliza a mayúsculas) en el mismo input del monto/dividendo. `VAC` → `vacante=true`, `div_orig=null`; número → `vacante=false` + `div_orig`; vacío → `false`/`null`. Toda la lógica vive en `syncDivInputsToPending` (embudo único input→pending), **por slot**.
- **Genérico para todos los tipos con input editable**: posicionales (GAN/SEG/TER), directas (EX/IM/TR/CUAT) y **combinadas** (X2/X2P/X3/X4/X5/CAD). Como no liquida, incluir combinadas no tiene riesgo y queda uniforme.
- **Se eliminó el checkbox** y `onVacanteChk`/`markVacante`/`toggleVacante`/`VACANTE_MULTISLOT`. El input es la única vía.
- **Display alineado**: edición y read-only muestran `VAC`. El input vacante queda editable y estilado (color, no `disabled`).
- **F8 (opción A) sigue sin pisar vacante**: ahora `f8Dividendos` llama `syncDivInputsToPending()` al entrar para capturar el `VAC` tipeado (que ya no tiene onChange) antes de mergear; una fila vacante fuerza `div_orig=null`.
- **F10 purga filas sin info**: una fila creada por `VAC` y luego vaciada (`vacante=false`, `div_orig=null`, sin pozo/vales/div_inc/composicion) no se persiste.

#### Tests / docs

- `tests/probe_vacante_vac.mjs` (reemplaza `probe_vacante_manual.mjs`, borrado): 6 checks — `VAC`→true/null, número→false+div, `VAC` en combinada X2, y F8 no pisa el `VAC` tipeado (fila preexistente + create-path). Snapshot+restore idempotente.
- GOTCHAS #41/#42, `tests/README.md` actualizados.

#### Sin cambios de schema

- `vacante` y `div_orig` ya existían. No hay migración.

---

### `feat/vacante-manual` — vacante 100% manual por checkbox (reemplazado por VAC inline)

#### Cambiado

- **Vacante ahora es 100% manual** en el panel de dividendos de `resultados.html`. Se eliminó el auto-cálculo (`applyAutoVacante()` y el mapa de umbrales de finishers `VACANTE_REQUIRED`). Marcar no corrió ya **no** auto-marca vacante.
- **Checkbox por apuesta**: cada tipo posicional (GAN/SEG/TER, en el header de columna) y directo (EX/IM/TR/CUAT, por fila) tiene un checkbox de vacante. Tildado → `vacante=true` e input(s) read-only; destildado → `vacante=false` y editable. Es la única vía (reusa `markVacante`/`toggleVacante` vía `onVacanteChk`).
- **F8 ya no pisa vacante** (opción A): `f8Dividendos` mergea ambos lados — trae dividendos/pozos desde DB pero conserva el `vacante` en memoria, incluidas las filas memory-only tildadas y todavía sin guardar.

#### Pendiente

- **Combinadas** (X2/X2P/X3/X4/X5/CAD) siguen sin UI de vacante — cambio aparte cuando Fede confirme el flujo con el tote.

#### Tests / docs

- `tests/probe_vacante_manual.mjs` (reemplaza `probe_vacante_hibrido.mjs`, borrado): 7 checks — tilde persiste tras F10, destilde, y F8 no pisa el tilde (fila preexistente + create-path memory-only). Snapshot+restore idempotente.
- GOTCHAS #41/#42, `tests/README.md` actualizados.

#### Sin cambios de schema

- `resultado_apuestas.vacante` ya existía. No hay migración.

---

## 2026-05-28 — `feat/no-corrio-v3` → main

### Agregado

- **"No corrió" en `resultados.html`** (UI v3 — botón + deducción automática): botón "NC" por cada caballo ratificado en el marcador. Los caballos marcados se excluyen del orden de llegada y se persisten con `{posicion: null, no_largo: true}` en `resultado_posiciones`. El mandil queda conservado (hueco visible en el marcador).
- **Validación de exclusividad**: un caballo no puede tener posición en el marcador Y estar marcado como "no corrió" al mismo tiempo. La UI bloquea el guardado con toast de error.
- **Deducción automática**: si al guardar (F10) hay caballos ratificados sin resultado ni marca "no corrió", la UI ofrece marcarlos automáticamente antes de proceder (confirm dialog).
- **Restauración al recargar**: los `no_largo=true` existentes en DB se restauran en la UI al cargar resultados de una carrera ya guardada.
- **Probe de regresión** `tests/probe_no_largo.mjs`: verifica el flujo end-to-end contra prod.

### Schema (ejecutado en prod — 28/05/2026)

- `ALTER TABLE resultado_posiciones ALTER COLUMN posicion DROP NOT NULL` — `posicion` ahora nullable (necesario para `posicion=NULL` en no corrió).
- `ALTER TABLE resultado_posiciones ADD COLUMN IF NOT EXISTS no_largo BOOLEAN NOT NULL DEFAULT false` — flag de no corrió.
- **RPC `aplicar_resultado`** (`fix_aplicar_resultado_no_largo`): INSERT de `resultado_posiciones` extendido para incluir la columna `no_largo` con `COALESCE((x->>'no_largo')::boolean, false)`.

### Decisiones de diseño confirmadas con Fede

- **Modelo**: flag booleano sin motivo. `estado = 'ratificado'` queda intacto. Mandil conservado (hueco). Prerequisito desbloqueado para Bloque C (montas perdidas) en `liquidaciones.html`.
- **UI elegida**: v3 — botón por caballo en el marcador + deducción automática al guardar.

### Archivos nuevos

- `migrations/add_no_largo_column.sql`, `migrations/update_aplicar_resultado_no_largo.sql`, `migrations/aplicar_resultado_rollback.sql`
- `mockup-no-corrio-v1-checkbox-por-caballo.html`, `mockup-no-corrio-v2-marcador-por-caballo.html`, `mockup-no-corrio-v2.html`, `mockup-no-corrio-v3-boton-deduccion.html`
- `mockups/no-corrio/v1.png`, `mockups/no-corrio/v2.png`, `mockups/no-corrio/v3.png`
- `tests/probe_no_largo.mjs`

### Archivos modificados

- `resultados.html` — UI "no corrió", botón NC por caballo, deducción automática, payload `p_posiciones` con `no_largo`

---

## 2026-05-27 — `feature/apuestas-tabla-relacional` → main

### Agregado
- **Tabla `carrera_apuestas`** (relacional): reemplaza `carreras.apuestas_habilitadas JSONB`. Columnas: `id`, `carrera_id`, `tipo` VARCHAR(10), `precio` NUMERIC(10,2), `nombre` TEXT, `aseg` NUMERIC, `incr` NUMERIC, `orden` SMALLINT. Tipos válidos: `GAN`, `SEG`, `TER`, `EX`, `IM`, `TR`, `CUAT`, `X2`, `X2P`, `X3`, `X4`, `X5`, `CAD`. `TE` removido.
- **Columna `carreras.apuestas_notas`** TEXT NULL — texto libre para notas de apuestas en el programa oficial.
- **UNIQUE `(resultado_id, tipo, orden)`** en `resultado_apuestas` — permite multi-slot para SEG (2) y TER (3).
- **Columna `inscripciones.peso_balanza`** NUMERIC(5,2) NULL — peso registrado en balanza el día de la carrera (300–600 kg, peso del caballo no del jockey).
- **Modal "Apuestas" en `programa.html`**: checkbox + precio + nombre + asegurado/incremento por carrera. Guardado bulk con `Promise.all`. Grupos: Posicionales / Apuestas directas / Apuestas combinadas.
- **Modal "Div. habilitadas" en `resultados.html`**: carga de dividendos por tipo habilitado. Posicionales en 3 columnas con chapa SBARG + input de dinero. Directas y combinadas en lista vertical.
- **Vista Reducida** en `resultados.html`: posicionales GAN/SEG/TER en 3 columnas, estilo papel, read-only. Chapa SBARG con color + monto en cápsula.
- **Vista Detallada** en `resultados.html`: posicionales + separador + Apuestas directas (con composición auto-computada via chips SBARG) + Apuestas combinadas.
- **`renumerar-chapas.js`**: helper `renumerarChapas(inscripciones)` — filtra `estado === 'ratificado'`, ordena por `numero_partidor` ASC, devuelve `{ id → 1..N }`.
- **`formatARS` / `parseARS` / `bindARSInput`** en `resultados.html`: formato argentino (punto miles, coma decimal, 2 decimales) para todos los inputs y displays de dinero.
- **`formatApuestasText()`** en `programa-oficial.html` y `programa-oficial-color.html`: agrupación inteligente de apuestas por precio para el texto del programa impreso.
- **Botón "Pesos balanza"** en `resultados.html`: modal que muestra inscripciones ratificadas, permite cargar `peso_balanza` (min 300, max 600 kg).

### Cambiado
- **Terminología visible al usuario**: "Combinatoriales" → "Apuestas directas", "Multi-carrera" → "Apuestas combinadas". Códigos internos (`EX`, `X2`, etc.) sin cambio.
- **Vista de dividendos** (`resultados.html`): eliminada grilla tabla editable (columnas APUESTA/VAL.APU/COMPOSICIÓN/DIV.ORIG/DIV.INC, nav bar, modal Agregar/Cambiar/Eliminar). Reemplazada por `renderDivHTML()` — mismo código sirve para provisional y oficial.
- **`renderOficial()`**: ahora usa `renderDivHTML()` con detalle completo en lugar de la tabla antigua.
- **Cosméticos `resultados.html`**: "Turno N" → "Carrera N", subtítulo solo distancia, labels M.(F) y (MANDIL) removidos, "Sport" → "Div a GAN".
- **Renumeración chapas**: filtro corregido de `!includes(['forfait','mal_inscrito'])` (negativo, perdía 'anulada') a `=== 'ratificado'` (positivo estricto). Afectaba 7 call sites en `resultados.html`, `programa-oficial.html`, `programa-oficial-color.html`.
- **`programa-oficial.html`** y **`programa-oficial-color.html`**: `renderCarrera()` ahora filtra `ins.filter(i => i.estado === 'ratificado')` antes de mapear chapas.

### Eliminado
- **`carreras.apuestas_habilitadas`** JSONB — dropeada, reemplazada por tabla relacional.
- **`modal-apuesta`** (Agregar/Cambiar apuesta en resultados.html) — eliminado junto con `openModal()`, `closeModal()`, `confirmApuesta()`, `deleteApuesta()`.
- **Nav bar** (« ‹ N/M › ») y `selectRow()`, `navFirst/Last/Prev/Next()`.
- **Tipo `TE` (Tómbola Exacta)** — removido del set válido de tipos de apuesta.

### Corregido
- **7 bugs de renumeración de chapas** en 3 archivos: `autoComp()`, `openDivModal()`, `activeInsc` main render, `openPesoBalanza()`, `savePesoBalanza()`, `renderCarrera()` en programa-oficial (x2).

### Archivos nuevos
- `renumerar-chapas.js` — helper centralizado de renumeración.

### Archivos modificados
- `resultados.html`, `programa.html`, `programa-oficial.html`, `programa-oficial-color.html`

---

## 2026-05-23 — `cleanup-fede` (feedback del secretario de carreras)

### Revertido / Eliminado
- **`estado_pista = 'normal'`** revertido del CHECK y del `<select>` de la UI. El hipódromo tiene precedente legal que establece que los únicos valores válidos son `seca`, `humeda`, `fangosa` y `pesada`. El selector arranca ahora con opción vacía `—` para forzar elección consciente.
- **`resultados.tiempo_clima`** eliminado: columna dropeada de la tabla, campo removido de la UI y del payload del RPC. El clima no va en la pantalla de resultados.
- **Display de jockey 1° y 2°** eliminado del panel central de resultados. El dato sigue viviendo en inscripciones y performances; se removió solo de esta pantalla porque ya está disponible en el programa.

---

## 2026-05-23 — `carga-resultados-v2`

### Agregado
- **Rediseño carga de resultados** (`resultados.html`): layout legacy SGH con marcador de posiciones 1°–20° (colores de fotofinish internacionales), grilla densa de dividendos, selector de condiciones de carrera (clima, estado pista, tiempo ganador, incidentes), Vista Reducida / Vista Detallada. [Ver SCHEMA.md](SCHEMA.md)
- **RPC atómico `aplicar_resultado`**: reemplaza posiciones y dividendos en una sola transacción con optimistic locking (`FOR UPDATE` sobre `updated_at`). Elimina las escrituras directas a las tablas desde el cliente.
- **Optimistic locking concurrente**: el servidor detecta escrituras en conflicto y devuelve `CONCURRENT_MODIFICATION`; la UI muestra el toast "Otro operador modificó este resultado. Recargá antes de guardar."
- **Schema changes** (ver [SCHEMA.md](SCHEMA.md)):
  - `resultado_apuestas` (tabla nueva): columnas `tipo`, `val_apu`, `composicion`, `pozo`, `vales`, `div_orig`, `div_inc`, `vacante`, `orden`, FK a `resultados`. Detalle en SCHEMA.md.
  - `resultados.redistribucion_legs` (`jsonb`, default `'{}'`)
  - `resultados.updated_at` (`timestamptz`) con trigger `BEFORE UPDATE` (`set_updated_at`)
  - Índice `idx_resultados_updated_at (id, updated_at)`
  - ~~`resultados.tiempo_clima`~~ — revertido, ver arriba
  - ~~CHECK `estado_pista` ampliado con `'normal'`~~ — revertido, ver arriba

### Corregido
- **Bug 3b**: borrar todas las filas de dividendos, aplicar (F10) y recargar mostraba las 20 filas originales en vez de una grilla vacía. La RPC ahora ejecuta el DELETE incondicionalmente aunque `p_apuestas` sea un array vacío.

### Cambiado
- Escritura de dividendos centralizada en la RPC `aplicar_resultado` en lugar de inserts directos desde el cliente.
- Tecla F10 llama `aplicar_resultado('carrera_id', 'provisional')`; F8 recarga desde DB; F9 descarta cambios.

### Pendiente de validación
- Interpretación de `resultados.redistribucion_legs` (selectores "Gde / al 3° / al 4° / al 5° / al 6°" como umbral de redistribución por pata en apuestas combinadas X2/X3/X4/X5) sujeta a confirmación del secretario de carreras. Columna modelada como `jsonb` para permitir cambio de semántica sin migración de schema.
