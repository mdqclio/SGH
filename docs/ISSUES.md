# SGH — Bugs, Issues y Deudas Técnicas

## CRÍTICOS

### ISSUE-001: Liquidaciones C+D — motor de cálculo, fondo, bonos, incentivos y recibos
Descripción: liquidaciones.html — motor de premios + capa de cobro (recibos)
Módulo: liquidaciones.html · Gap vivo: `docs/LIQUIDACIONES_GAP_ANALYSIS.md`
Estado: 🔄 En progreso — **Fase 0/1/2 + Fase C VIVAS en main/prod** (merge `ccef143` 2026-06-07; Fase C `7e638c7` 2026-06-08). Fix D vivo en main. E1 neutralizada en main (`7af005c`). (2026-06-08)

HECHO (en main/prod salvo donde se aclara):
- ✅ Bloque A: schema fixes + resultados (14/05/2026)
- ✅ Bloque B: motor de cálculo (reparto directo 70/10/10/4/3/1) (14/05/2026)
- ✅ Fase 0: schema C+D — 5 ENUMs, `liquidacion_config`/`club_secuencias`/`recibos`, 10 columnas en `liquidacion_detalle`, `fn_siguiente_recibo`, RLS+auditoría, seed Dolores. **VIGENTE en prod** (`migrations/liquidaciones_cd_fase0.sql`).
- ✅ Fase 1: % de reparto e incentivos por club desde `liquidacion_config`.
- ✅ Fase 2: fondo solidario 2% al club + bono 6-8 (100% propietario, neto) + incentivos jockey/entrenador. Probe `tests/probe_fase2_liquidaciones.mjs`.
- ✅ **Fase C — estado_linea + retención anti-doping (en main, `7e638c7`, 2026-06-08):** `generarLiquidaciones` setea por línea: premio 1°/2° → `retenido` + `fecha_liberacion = reuniones.fecha + dias_antidoping` (30); **NOTA-A** subs `actuacion` de 1°/2° acompañan la retención; **NOTA-B** reunión sin fecha → retenido + warn; resto `impago`. Guard de regeneración a nivel línea (no pisa `pagado`/`recibo_id`). Badge por línea en `verDetalle`. Verificada real-code `tests/probe_fase_c.mjs` (11/11 sobre reunión `b02ca761`). Ver `docs/PLAN_FASE_C.md` / `docs/RESULTADO_FASE_C.md`.
- ✅ **Fix D — captura de caballeriza en `spcs.html` (en main, `ccef143`):** ISSUE-026 resuelto (`f-caballeriza-form`/`f-sexo-form`). Probe `tests/probe_spcs_caballeriza.mjs`.
- ✅ **Fase 4 — Pagos/recibos VIVO en main (2026-06-08):** tab "🧾 Pagos" + buscador (persona/caballeriza, nombre/apellido/DNI, filtro por carrera) + RPC `emitir_recibo` (número correlativo + recibo + marcado atómico) + print con logo/firma. **v1** merge `1a50359` (probe `tests/probe_recibos_emision.mjs` 14/14). **v1.1** merge `4851129`: liberación del doping **MANUAL** — `emitir_recibo` pagable solo `impago` + RPC `liberar_linea` (retenido→impago) + botón Habilitar (probe `tests/probe_cobros_v11.mjs` 11/11). Migrations: `emitir_recibo_fase4.sql`, `emitir_recibo_v1_1.sql`, `liberar_linea.sql`.
- ✅ Fix detección de empate (02/06/2026): la detección agrupaba por `posicion` duplicada (`byPos`), que **nunca** ocurre (constraint `UNIQUE (resultado_id, posicion)`); el dead-heat se modela como posiciones distintas consecutivas con `empate=true`. La rama empate-aware era código muerto → **los empates de PREMIO no se promediaban** (cada uno cobraba el premio de su posición física en vez de `Σ/N`). Ahora se agrupan corridas consecutivas con `empate=true` y se promedia premio y bono. Probe: checks C2 (empate bono) + C3 (empate premio). Ver GOTCHA #45.
- ✅ **Derivación de propietario — APLICADA EN PROD (02/06/2026):** `migrations/liquidaciones_cd_propietario_derivacion.sql`. Puente `caballeriza_responsables(titular)→propietarios` + derivación de `inscripciones.propietario_id`. **213 propietarios** importados (7→220; prop_dolores 0→213; 5 titulares sin DNI excluidos). Triggers **C** (`trg_insc_set_propietario`) y **C3** (`trg_cab_resp_set_propietario`, con guard `RAISE` si caballeriza sin club) activos. **Cobertura actual 10/95** (resto sin `caballeriza_id` histórico, ver ISSUE-026). Probe `tests/probe_propietario_derivacion.mjs` (11/11). Captura hacia adelante cubierta por triggers + Fix D (vivo en main).

PENDIENTE (orden del gap analysis, `docs/LIQUIDACIONES_GAP_ANALYSIS.md`):
- ⏳ **Fase A — backfill propietarios:** re-asociar `caballeriza_id` a las inscripciones históricas para que los triggers deriven `propietario_id`. **Bloqueada por dato/Fede** (mapping SPC→propietario). Ver propietario_id abajo.
- ✅ Fase 2bis (oficializar/des-oficializar): a nivel **carrera** en main (`cc71c64`) + des-oficializar vía RPC `desoficializar_carrera` (`61bd81d`, 2026-06-10).
- ✅ Fase 3 (estados de línea + retención anti-doping) → **HECHA como Fase C** (en main, `7e638c7`; ver HECHO arriba).
- ✅ Fase 4 (recibos por persona on-demand) → **HECHA v1+v1.1 en main** (ver HECHO arriba). **ISSUE-028 (apoderados) CERRADO v1+v1.1** (2026-06-10). Pendiente menor: **turno→carrera app-wide** (ISSUE-029; el recibo ya está hecho).
- ✅ Fase 5: resumen de reunión → **HECHA en main** (`4cc6c27`): buckets por estado + reconciliación + pendientes por beneficiario. **Ampliada** (`f5a56c4`): desglose por `concepto_tipo` + montas perdidas (informativo). Read-only. Pendiente: **confirmación de Fede** sobre formato de desglose/montas.
- ⏳ Fase 6: validar A+B contra datos reales de R5.
- 🔄 **propietario_id en inscripciones (parcialmente resuelto):** derivación aplicada + Fix D vivo en main → **10/95** con propietario y triggers para lo nuevo. **Bloqueante residual:** 85/95 históricas siguen sin `propietario_id` porque no tienen `caballeriza_id` (causa raíz ISSUE-026, ya arreglado por Fix D hacia adelante) — se resuelve re-asociando caballerizas a las inscripciones viejas (Fase A). `spc_propietarios` sigue vacía (vía alternativa no usada). Ver GOTCHA #47 / ISSUE-026.
  - **Verificación a fondo (02/06/2026):** confirmado que NINGÚN flujo escribe `propietario_id`. Barrido de todo el repo de `from('inscripciones').insert/.update/.upsert`: payloads con campos explícitos (sin spreads ni alias `propietario/dueño/owner`); `inscripciones.html` (insert L638) y los UPDATE de `ratificacion.html` no lo tocan; el form de inscripción NO tiene campo de dueño. Único setter: `portal.html:574` (rol propietario), portal sin construir → 0 filas (`canal='web'`: 0/87). No hay trigger/RPC server-side (ninguna migración; y si existiera, las 87 reales lo tendrían). Las 87 son carga manual real por UI (`canal='manual'` 87/87, `created_at` repartido 27/04→23/05), NO seeds → el 0/87 es lo que produce el flujo, no casualidad. **Hay que AGREGAR la captura/derivación al inscribir/ratificar; el fix se planea aparte.**

DECISIONES (Fede):
- ✅ **Bono 6-8 + empate — CONFIRMADO (02/06/2026):** se paga, 100% propietario, neto; monto/rango configurables (`bono_posicion_monto`, `bono_posicion_desde/hasta`). Empate (principio Fede "50% c/u" + convención dead-heat "el grupo toma la posición del líder"): grupo comparte **un** bono dividido `monto/N` (2 → 50% c/u); empate de premio promediado `Σ/N`; cruce de borde (5°-6°) → grupo es "5°" → sin bono; bono al ganador en empate de 1° → repartido vía el promedio (mitad c/u). Probe C2/C3. **Sigue gateado por `propietario_id` NULL (GOTCHA #47): no paga nada hasta poblar el dueño.**
- ⚠️ **Limitación técnica conocida (no es decisión de producto):** empates adyacentes sin caballo limpio en medio se fusionan en un grupo (modelo `empate=true` con un solo booleano; requeriría `grupo_empate_id`). Rarísimo. Ver GOTCHA #45.
- ✅ **Incentivos Bloque C — montos CONFIRMADOS por Fede (2026-06-08):** jockey **50.000 fijo por reunión** (1 línea por jockey que corrió, aunque tenga N montas; `inscripcion_id=null`); entrenador **10.000 por caballo corrido** (1 línea por inscripción corrida, sin dedup; `inscripcion_id` seteado). Montos en `liquidacion_config` (DML aplicada: 50000/10000). Corrección de granularidad del entrenador (antes deduplicaba por reunión) en rama `feat/incentivos-montas`; probe `tests/probe_incentivos_montas.mjs` (11/11). Ver `docs/LIQUIDACIONES_MODELO.md` §4.
- Beneficiario de las sub-líneas peón/capataz/sereno (hoy = entrenador, ADR-025; confirmar en Fase 4).

TÉCNICO PENDIENTE:
- Rotar y sacar del repo la `service_role` key hardcodeada en `tests/` (varios probes).
- Evaluar `concepto_tipo` NOT NULL una vez que Fase 2 lo setea en todas las líneas nuevas (cuidado con filas viejas).

### ISSUE-002: RLS sin configurar por club
Descripción: Cualquier usuario autenticado puede leer/escribir datos de cualquier hipódromo
Módulo: Backend Supabase — todas las tablas
Estado: ✅ RESUELTO COMPLETAMENTE (14/05/2026) — RLS implementada en 26 tablas. Aislamiento cross-club verificado. Ver SECURITY.md. ISSUE-017 también cerrado.

## ALTOS

### ISSUE-003: PDF inscriptos no similar al modelo Palermo
Descripción: Falta columnas orden partidor + alfabético/gatera, bolsa por carrera, indicadores H y punto negro
Módulo: inscripciones.html
Estado: ✅ RESUELTO (may-2026) — Rediseño completo Palermo-style: CSS columns 4-col, bloques por turno con bolsa/$, condición abreviada, lista alfabética con (H) y ●, banda REABIERTA negra, matriz consolidada ORDEN DE LARGADA al pie. 2 páginas A4 landscape aceptado.

### ISSUE-004: Portal propietarios/entrenadores no construido
Módulo: portal.html (no existe)
Estado: Pendiente

### ISSUE-005: Auto-registro de profesionales no construido
Módulo: registro-profesional.html (no existe)
Estado: Pendiente

### ISSUE-006: DELETE físico en algunos módulos
Descripción: Algunos módulos borran físicamente en lugar de desactivar
Estado: Pendiente — cuidado con inscripciones que tienen resultado_posiciones

## MEDIOS

### ISSUE-007: Calendario puede mostrar N-1 reuniones
Descripción: Filtro de año a veces excluye la reunión más antigua
Módulo: calendario.html, index.html
Estado: Pendiente fix de timezone

### ISSUE-008: Logo con fondo blanco
Descripción: Logo de Dolores tiene fondo blanco visible sobre verde
Módulo: index.html
Estado: ✅ Resuelto — logo PNG con transparencia (140px, sesión may-2026)

### ISSUE-009: Emails no implementados
Estado: Pendiente Resend/SendGrid

### ISSUE-026: spcs.html — `id` HTML duplicado rompe la captura de caballeriza (y sexo)
Descripción: `spcs.html` reutiliza el mismo `id` en filtro de toolbar y campo de modal: `f-caballeriza` (L150 toolbar / L206 modal) y `f-sexo` (L144 / L189). `getElementById` agarra siempre el primero del DOM (el toolbar), así que el select de caballeriza del modal queda sin opciones y, en alta, `spcs.caballeriza_id` se guarda **siempre null**; en edición no se puede cambiar. `f-sexo` zafa de casualidad (openModal setea el toolbar a un valor válido antes de leerlo). Esto explica por qué el link caballo→caballeriza no se llena al cargar caballos por esta pantalla.
Módulo: spcs.html · Ver GOTCHA #48
Estado: ✅ RESUELTO y **VIVO en main** (Fix D, commit `20fdbc7`, mergeado en `ccef143` 2026-06-07). Selects del modal renombrados a `f-caballeriza-form` / `f-sexo-form`; populate/openModal/saveRecord apuntan al modal; variable muerta `filterCab` eliminada. Toolbar (`.toolbar #f-...`, filterRender) sin cambios. Probe `tests/probe_spcs_caballeriza.mjs` (11/11): jsdom con el HTML real (semántica getElementById→primer match) + saveRecord real con decoy en el toolbar + roundtrip real a DB (insert→read-back→delete).

### ISSUE-027: Caballeriza obligatoria al ratificar (fix E — captura hacia adelante de propietario)
Descripción: cierra la captura de `caballeriza_id` hacia adelante para que la derivación de propietario (migración `liquidaciones_cd_propietario_derivacion.sql`, triggers C/C3) tenga de dónde derivar. Complementa el fix D (ISSUE-026).
Módulo: ratificacion.html (E1) + inscripciones.html (E2)
Estado: ⚠️ **E1 NEUTRALIZADA en main** (`7af005c`). E2 (warning blando) vivo en main.
- **E1 — `ratificacion.html` (HARD block):** se implementó (botón Ratificar deshabilitado si `!caballeriza_id` + guard en `ratificar()` + `data-caballeriza` en el `<tr>`) pero se **neutralizó** en `7af005c` (hard-block removido en los 3 sitios) para que Fede pueda ratificar sin caballeriza obligatoria mientras falta el backfill. El gate de **jockey** sigue activo.
- **E2 — `inscripciones.html` (SOFT warning):** `saveRecord` muestra un `confirm()` si se inscribe sin caballeriza (deja continuar). Vivo en main.

> **REACTIVACIÓN de E1** = cumplir AMBAS y luego `git revert 7af005c`:
> 1. **Fede al tanto del cambio de workflow:** con E1 *no se puede ratificar un ejemplar sin caballeriza asignada*. Cambio de proceso operativo — requiere su OK explícito.
> 2. **Backfill de `caballeriza_id` en los SPC/inscripciones activos** (Fase A): sin eso, **Fede no podría ratificar NADA**. Es prerequisito duro. Fix D (ISSUE-026) ya corrige la captura hacia adelante, pero las históricas siguen sin caballeriza.

### ISSUE-028: Apoderados — tabla de autorizados (cobrar por otro) — ✅ CERRADO (v1 + v1.1, 2026-06-10)
Descripción: registrar **autorizaciones guardadas** — una persona (autorizante = propietario/profesional) autoriza a un tercero a cobrar en su nombre.
**HECHO:**
- **v1** (`feat/apoderados-v1`, `1444fa3`): tabla `apoderados` (`migrations/apoderados.sql`, aplicada en DB) — autorizante polimórfico SIN FK, unique parcial anti-dup `WHERE vigente`, RLS club-scoped `TO authenticated` (plana, no SECURITY DEFINER). UI "Autorizados a cobrar" en `propietarios.html` + `profesionales.html` (listar/agregar/revocar; revoke = `vigente=false`, conserva registro).
- **v1.1** (`feat/apoderados-v1.1-pagos`, `e7a5fb1`): display read-only de autorizados vigentes en Pagos (`cobrosDetalle`) — bloque "Autorizados a cobrar" o "cobra el titular". 0 escrituras.
- Decisión abierta (no bloqueante): `autorizado_documento` quedó `NOT NULL` — a opcional sin riesgo si Fede lo pide. v2 futura (no pedida): validar el autorizado contra la tabla al emitir el recibo.

### ISSUE-029: turno→carrera (recibo HECHO + app-wide ⏳)
Descripción: el recibo ya muestra la carrera por `numero_carrera_programa ?? numero_turno` (prefijo "C", commit `a94eb11`). **Pendiente:** (a) confirmar con Fede que el número visible sea el de carrera de programa; (b) **unificar el criterio en TODA la app** (no solo el recibo) — varios módulos siguen mostrando `numero_turno`. Módulo: liquidaciones.html (hecho) + resto de la app (pendiente). Estado: recibo HECHO, app-wide ⏳ parkeado (menor).

### ISSUE-030: Integración Stud Book API (Diego) — workstream abierto
Descripción: Diego (Stud Book Argentino) ofreció acceso a su API y mandó el formato JSON de La Punta como referencia. Hoy la ingesta es por scrape read-only (`tools/sb_extract.py` en `feat/studbook-extract`); la API reemplazaría eso por una fuente oficial. Ya existe `spcs.studbook_id` (el "Idcaballo") como clave de integración (VIVO en main, `db0b2fc`). Se armó un borrador de mapeo (campos La Punta → `spcs`) para responderle.
PENDIENTE — 7 preguntas a Diego antes de implementar:
1. Endpoints disponibles (ejemplar por id, búsqueda, listados, pedigree).
2. Auth (token / API key / IP whitelist).
3. Modelo de sincronización: pull (consultamos) vs push (nos notifican cambios).
4. Leyenda/semántica de estados (vivo / muerto / exportado / etc.).
5. Mapeo caballeriza→propietario (el SB expone caballeriza; nosotros necesitamos propietario).
6. (resto del set de 7 — vive en el borrador de respuesta a Diego, a sumar acá al confirmarse).
7. (idem).
Relacionado: `abuela_materna` (damsire vs abuela real) a aclarar contra el modelo del SB. Backfill de FKs (caballeriza/entrenador/propietario) de los 25 SPCs sigue bloqueado en data de Fede.

**Avance 2026-06-12 — exposición read-only del JSON de reunión (branch, NO en main):**
- ✅ **Edge Function `reunion-json` deployada (v7)**: `…/functions/v1/reunion-json?fecha=YYMMDD`, scope Dolores, auth `Bearer <STUDBOOK_API_TOKEN>`, `verify_jwt` OFF (Diego llama con solo el token, sin anon key), DB server-side con `STUDBOOK_DB_KEY` (`sb_secret`). Output compartido con el CLI vía `_shared/studbook_format.mjs`. Validada contra 9999 (200 + diff idéntico, 401 sin/mal token, 404 fecha inexistente). Branch `feat/edge-reunion-json`.
- ✅ **Pasada de formato del generador** (calcado de La Punta, `08f8bcb`, `feat/json-generator`): wrapper `{status:200,data}`, numéricos a string, `premios`/`competidores` doble-anidados `[[…]]`. Sample `tools/samples/9999_sample.json`.

**Pendientes nuevos:**
- ⚠️ **Rotar `STUDBOOK_API_TOKEN` antes del 20/6** — se expuso durante el setup; hoy solo protege la reunión 9999 fake. Re-setear vía dashboard (o CLI/Management API con PAT) y avisar a Diego.
- ~~Correr el teardown de 9999 antes del 20/6~~ — **no corresponde**: la 9999 se conserva como sandbox (2026-08-29). Ver ISSUE-035.
- Confirmar con Diego el **doble-anidado** `[[…]]` de `premios`/`competidores`: a propósito o se aplana de su lado.
- Diego prueba el endpoint con `fecha=990101`.

Módulo: integración Stud Book (nuevo). Estado: ⏳ Esperando respuesta de Diego; endpoint listo para que pruebe. Prioridad: Media.

## BAJOS

### ISSUE-010: Credenciales hardcodeadas
Estado: Aceptable para MVP

### ISSUE-011: Sin rate limiting en login
Estado: Pendiente

## DEUDAS TÉCNICAS (sesión may-2026)

### ISSUE-012: caballeriza_responsables no transaccional
Descripción: El guardado hace DELETE + INSERT desde JS sin RPC. Si falla el INSERT, los responsables quedan borrados.
Módulo: caballerizas.html
Solución V2: migrar a función Postgres atómica.

### ISSUE-013: usuarios.html debe usar sb.auth.admin.createUser
Descripción: La creación de usuarios choca con rate limit de emails en plan gratuito. Usar sb.auth.admin.createUser con email_confirm:true evita el email de verificación.
Módulo: usuarios.html
Estado: Pendiente

### ISSUE-014: formatDNI no distingue DNI de CUIT
Descripción: CUIT debería mostrarse con guiones (XX-XXXXXXXX-X), no con puntos. Hoy formatDNI() aplica punto de miles a cualquier campo numérico sin importar el tipo de documento.
Módulo: jockeys.html, profesionales.html, propietarios.html, caballerizas.html
Solución: lógica condicional según documento_tipo.

### ISSUE-015: super_admin sin club_id no puede usar pantallas con filtro por club_id
Descripción: Las pantallas que filtran por CLUB_ID (inscripciones, jockeys, etc.) no muestran datos cuando el super_admin no tiene club asignado.
Módulo: múltiples
Solución V2: selector de hipódromo para super_admin en pantallas que lo requieren.

### ISSUE-016: Módulo Propietarios puede ser redundante
Descripción: caballeriza_responsables cubre el concepto de propietario en Dolores. Decidir si el módulo propietarios.html debe deprecarse o mantenerse para casos distintos.
Estado: Pendiente decisión con Fede.

## SEGURIDAD (post 12/05/2026)

### ISSUE-017: RLS pendiente en 8 tablas residuales
Descripción: Las siguientes tablas aún tienen policy permisiva (`allow_all` o `dev_allow_all`) y no están aisladas por club_id: `comision_config`, `spc_propietarios`, `club_configuracion`, `performances`, `caballeriza_responsables`, `novedades_reunion`, `resolucion_entidades`, `auditoria`
Prioridad: comision_config y spc_propietarios son alta prioridad (datos financieros y titularidad de caballos). auditoria requiere tratamiento especial (SELECT acotado por club; INSERT solo desde triggers).
Estado: ✅ RESUELTO (14/05/2026) — 8/8 tablas hardenadas. Ver SESION_HARDENING_RLS_2026-05-14.md.
- ✅ comision_config → Fase 2A
- ✅ club_configuracion → Fase 2A
- ✅ spc_propietarios → Fase 3 (catálogo global)
- ✅ novedades_reunion → Fase 2B (fn_club_de_reunion)
- ✅ performances → Fase 3 (carrera_id nullable; INSERT/UPDATE solo super_admin — ADR-024)
- ✅ resolucion_entidades → Fase 2B (fn_club_de_resolucion — helper nueva)
- ✅ caballeriza_responsables → Fase 2B (fn_club_de_caballeriza — helper nueva)
- ✅ auditoria → Especial: SELECT Fase 2A, sin INSERT/UPDATE policy (triggers SECURITY DEFINER bypasean RLS), DELETE solo super_admin

### ISSUE-018: XSS escape pass pendiente
Descripción: Varios módulos usan template literals con `${variable}` dentro de `innerHTML` sin escapar. Un valor de DB con `<script>` o `"` puede ejecutar JS arbitrario en el browser del usuario.
Solución: Agregar `escapeHtml()` (reemplaza &, <, >, ", ') en todos los templates literales que van a innerHTML con datos de usuario.
Estado: Pendiente — recorrer todos los módulos HTML

### ISSUE-019: Auditoría extendida pendiente
Descripción: Los triggers de auditoría cubren 8 tablas (reuniones, carreras, inscripciones, resultados, liquidaciones, clubs, usuarios, categorias_carrera). Quedan sin auditar: caballerizas, resoluciones, hipodromos, propietarios, profesionales, spcs, sanciones.
Estado: Pendiente — agregar triggers de auditoría una vez que la RLS de esas tablas esté endurecida

## BUGS PENDIENTES — resultados.html (post rediseño 27/05/2026)

### ISSUE-020: Chapa del ganador no coincide con marcador en Vista Detallada
Descripción: En Vista Detallada, la chapa mostrada junto al dividendo GAN puede no coincidir con el caballo marcado como 1° en el marcador de posiciones. El JOIN posicion → inscripcion_id → renumerarChapas usa el orden de resultado_posiciones pero el marcador usa numero_partidor original.
Módulo: resultados.html — `buildChapaAt()` y el marcador de posiciones
Estado: Pendiente validación con Fede — puede ser bug o puede ser que el render es correcto y el marcador usa lógica diferente.
Prioridad: Alta

### ISSUE-021: Columna TERCERO no aparece en Vista Reducida
Descripción: La columna TER no se renderiza aun cuando hay dividendo cargado para ese tipo. Posible causa: `habMap[t]` es undefined si el tipo no está en carreraApuestasMap o si el precio es 0.
Módulo: resultados.html — `renderDivHTML()` filtro `habilitadas.filter(a => a.precio > 0)`
Estado: Pendiente reproducción y fix.
Prioridad: Alta

### ISSUE-022: Monto vacío cuando hay dividendo cargado en "Div a GAN"
Descripción: El monto del campo "Div a GAN" puede aparecer vacío en la Vista Reducida aunque el valor se haya guardado correctamente en `pendingApuestas`. Posible causa: `div_orig` vs `div_inc` en el campo correcto del objeto.
Módulo: resultados.html — `renderDivHTML()` y la lectura de `pendingApuestas`
Estado: Pendiente reproducción y fix.
Prioridad: Alta

### ISSUE-023: UI para DIV.INC y VAL.APU no implementada
Descripción: Las columnas `resultado_apuestas.div_inc` (dividendo con incremento) y `val_apu` (valor de la apuesta base, default 100) existen en DB pero fueron eliminadas del rediseño de la UI. No hay forma de cargar estos valores desde `resultados.html`.
Módulo: resultados.html — modal "Div. habilitadas"
Estado: Pendiente decisión con Fede — ¿se necesitan? ¿cómo se cargan?
Prioridad: Media

### ISSUE-024: Composición manual override no implementada
Descripción: Para apuestas directas (EX, IM, TR, CUAT), la composición (ej: "5/2", "8/5/2") se auto-computa vía `renderCompChips()` a partir de `resultado_posiciones`. Pero si la composición real difiere (ej: por descalificación o apuesta vacante), no hay UI para ingresar manualmente `resultado_apuestas.composicion`.
Módulo: resultados.html — modal "Div. habilitadas"
Estado: Pendiente decisión con Fede.
Prioridad: Media

### ISSUE-025: Pozo, pozo asegurado y vales — sin UI de carga
Descripción: Los campos `resultado_apuestas.pozo`, `vales` (y el campo asegurado de `carrera_apuestas`) existen en DB pero no tienen UI de carga en resultados.html. No se sabe si Dolores necesita cargar estos valores para el programa oficial.
Módulo: resultados.html — modal "Div. habilitadas"
Estado: Pendiente decisión con Fede.
Prioridad: Baja

### ISSUE-031: BOLSA cargada ≠ BOLSA impresa (bonos inflaban) + drift $1 — ✅ RESUELTO (2026-07-21)
Descripción: la BOLSA impresa no coincidía con lo esperado. Causas reales: (1) los **bonos** se sumaban al número BOLSA (no deben); (2) cada puesto redondeaba independiente y la suma desfasaba $1. El **piso `ganancia_minima` SÍ debe reflejarse** en el display (regla de Yesica) — no era un bug elevarlo, sí lo era sumar bonos y el drift.
Módulo: `premios-utils.js` + los 6 sitios de display.
Estado: ✅ RESUELTO — corregido (branch `fix/bolsa-efectiva-display`).
- **v1 (merge `d626049`) — misread**: se mostró la BOLSA **nominal** (piso solo en pago). Regla equivocada.
- **v2 (corrección, regla real de Yesica)**: BOLSA impresa = **EFECTIVA con piso** = **Σ de los puestos efectivos** (`repartoDisplay` envuelve `calcPremiosConPiso`, redondea y el puesto mayor absorbe el resto → Σ ≡ total exacto, sin drift). Los puestos por debajo del piso se muestran en el piso (ej. 4°/5° = 100.000). Ej: bolsa 1.191.666 + piso 100.000 → impresa **1.284.416**. Los **bonos** siguen **aparte**, NO sumados a la BOLSA (esto sí es decisión de Fede). `calcPremiosConPiso` intacto.
Probes `tests/probe_reparto_display.mjs` (9/9) + `tests/probe_piso_warning.mjs` (5/5). Ver GOTCHA #63.

### ISSUE-032: Anti-pausa del proyecto Supabase free — decisión Pro vs cron
Descripción: el proyecto free se pausa a los ~7 días de inactividad (pasó el 2026-07-07, restaurado el 2026-07-14 sin pérdida). Para evitar recurrencia hay que decidir entre **plan Pro** o un **cron liviano anti-pausa** (query periódica). Ver GOTCHA #58.
Módulo: infra. Estado: ⏳ Abierto — decisión de producto, hablar con Fede. Prioridad: Media.

### ISSUE-033: Edge Function `reunion-json` — redeploy + `tipo_carrera`/IDs con Diego
Descripción: pendiente **redeploy** de la Edge Function `reunion-json` y acordar con Diego el campo `tipo_carrera` y los IDs que espera el consumidor. Complementa ISSUE-030.
Módulo: `supabase/functions/reunion-json`. Estado: ⏳ Abierto — coordinación con Diego. Prioridad: Media.

### ISSUE-034: Backfill `registro_stud_book` tomo/folio
Descripción: falta backfillear tomo/folio del registro de Stud Book en los ejemplares cargados.
Módulo: `spcs` / integración Stud Book. Estado: ⏳ Abierto. Prioridad: Baja.

### ISSUE-035: Teardown de la reunión de prueba 9999
Descripción: la reunión 9999 (datos de prueba) sigue viva. El teardown estaba gateado a que Fede terminara las pruebas de pagos.

**Decisión revertida el 2026-08-29: la 9999 NO se borra.** Es el único sandbox seguro que tenemos —ya sirvió para verificar el camino de recuperación de montas— y en vez de borrarla se la marcó con `reuniones.es_prueba` y se la filtró del buscador de Pagos (`docs/diagnosticos/2026-08-29_issue-055-merge.md`). `teardown_prueba_resumen_9999.sql` queda sin usar, disponible por si alguna vez hace falta.

Si alguien vuelve a leer esta issue buscando qué ejecutar: **no hay nada que ejecutar.**
Módulo: datos de prueba. Estado: ✅ **CERRADO — no se borra** (2026-08-29). Prioridad: —.

### ISSUE-036: Propagación de certificado SPC → inscripción
Descripción: bug de propagación del certificado desde el SPC hacia la inscripción (el estado del certificado no se refleja correctamente en la inscripción).
Módulo: inscripciones / spcs. Estado: ⏳ Abierto — a investigar. Prioridad: Media.

### ISSUE-037: `fix/edad-siempre-abierta` — espera confirmación de Fede
Descripción: fix de la condición de edad "siempre abierta" en branch, esperando confirmación de Fede antes de mergear.
Módulo: por confirmar. Estado: ⏳ Abierto — branch a la espera de Fede. Prioridad: Baja.

### ISSUE-038: Programa oficial — carreras y banner desaparecían por filtro de estado no NULL-safe — ✅ RESUELTO (2026-07-22)
Descripción: dos bugs en el mismo filtro. (1) **Carreras**: `.neq('estado','anulada')` sobre `carreras.estado` (VARCHAR libre que admite NULL, gotcha #5) se traduce a `estado <> 'anulada'`, que para NULL da NULL y descarta la fila en silencio — el **turno 2 de la R6 desaparecía del programa** con todos sus ratificados. (2) **Banner de próxima reunión**: el mismo `.neq('estado','anulada')` sobre `reuniones.estado`, que es el ENUM `estado_reunion` y **no tiene** la etiqueta `anulada` (usa `cancelada`) → error `22P02`, `proximaReunion` en null y el banner **nunca renderizó**.
Módulo: `programa-oficial.html`, `programa-oficial-color.html`.
Estado: ✅ RESUELTO — merge `82f87d8` (commit `ce52658`). Filtros a `.or('estado.is.null,estado.neq.anulada')` y `.or('estado.is.null,estado.neq.cancelada')`. Probe `tests/probe_programa_null_estado.mjs`.

### ISSUE-039: Alta de usuarios rota (signUp + password_hash) — ✅ RESUELTO (2026-07-24)
Descripción: ninguno de los caminos de alta completaba el registro. Las pantallas de admin usaban `signUp()` desde el browser y después insertaban en `public.usuarios`, con `password_hash` NOT NULL sin default y RLS en el medio. El auto-registro quedaba a merced del toggle *"Allow new users to sign up"*.
Módulo: `usuarios.html`, `admin.html`, `login.html`, `reset-password.html`.
Estado: ✅ RESUELTO — alta por **invitación cerrada** v1, merge `f8f5b0a`. Edge Function `invite-user` (autorización por mapa de datos + compensación anti-huérfanos), landing con `type=invite` que activa la fila, pantallas migradas, SMTP Resend propio. Verificado end-to-end contra prod. Ver `docs/plan_alta_invitacion.md`. Etapas (c)/(d) siguen abiertas.

### ISSUE-040: Chapa "4½ cpos" faltaba en el catálogo — ✅ RESUELTO (2026-07-22)
Descripción: el margen de llegada `4½ cuerpos` se usa en la carga real pero no estaba en la paleta de `chapas.js`, así que no se podía seleccionar.
Módulo: `chapas.js`. Estado: ✅ RESUELTO — commit `f9f8807`, entrada id 20.

### ISSUE-041: Incentivo de entrenador — ¿por caballo o por entrenador? (bloquea recibos)
Descripción: hoy el motor liquida el incentivo de entrenador **por caballo corrido** (1 línea por inscripción, `inscripcion_id` seteado) — `liquidaciones-engine.js:236-243`, descripción "Incentivo entrenador por caballo corrido". El jockey en cambio es **por reunión** con dedup. En R6 esto da 57 líneas de `incentivo_entrenador`. Está **preguntado a Fede** si la regla real es por-caballo o un monto único por-entrenador y por-reunión (como el jockey).
Módulo: `liquidaciones-engine.js` + `liquidacion_config.incentivo_entrenador_monto`.
Estado: ⏳ Abierto — **bloquea la emisión de recibos** de entrenadores (si la regla cambia, cambian los montos ya liquidados y hay que regenerar). Esperando a Fede. Prioridad: Alta.

### ISSUE-042: `spcs.ult_performances` 100% NULL
Descripción: la columna está vacía en **144/144** ejemplares (verificado 2026-07-24). Sin insumo no se puede imprimir la línea de últimas performances en el programa.
Módulo: `spcs` / programa. Estado: ⏳ Abierto — falta definir origen del dato (Stud Book / carga manual / derivar de `resultado_posiciones`). Prioridad: Media.

### ISSUE-043: Bug de plataforma — Auth Admin API rechaza ~1/3 de las llamadas (`kid <nil>` / ES256)
Descripción: los endpoints **admin** de GoTrue devuelven de forma intermitente `403 invalid JWT: ... unrecognized JWT kid <nil> for algorithm ES256`, con la misma secret key que en la llamada anterior funcionó. Medido ~1 de cada 3. Alcance acotado: **sólo** secret key → endpoints admin de GoTrue; PostgREST con la misma key y el camino anon (login, `signInWithPassword`) **no** se ven afectados. Es la traducción `sb_secret_` → JWT de service_role del gateway. **No es código nuestro.**
Impacto: si le pega al `/invite`, `invite-user` devuelve `500 invite_failed` y la invitación no sale (pasó en prod el 24/07; el segundo intento funcionó).
Módulo: plataforma Supabase (Auth). Mitigación actual: wrapper `reintentar()` en los probes; la Edge Function **no** reintenta el `/invite` a propósito (no se puede afirmar que el mail no salió).
Estado: ⏳ Abierto — **reportar a Supabase**. Es precondición de la etapa (c) del alta. Prioridad: Alta.

### ISSUE-044: JSON para Diego — no filtra carreras anuladas
Descripción: la Edge Function `reunion-json` no excluye las carreras `anulada`: el consumidor recibe turnos que no se corren. En R6 son 3 de 11.
Módulo: `supabase/functions/reunion-json/index.ts`. Estado: ⏳ Abierto — coordinar con Diego junto a ISSUE-033 (mismo redeploy). Prioridad: Media.

### ISSUE-045: `findClosest` no saltea reuniones suspendidas
Descripción: `active-reunion.js:8` filtra `r.estado !== 'anulada'`, pero el ENUM `estado_reunion` **no tiene** esa etiqueta — usa `cancelada`. El filtro no descarta nada y la reunión activa puede resolverse a una suspendida (caso real: R7 del 19/07, `cancelada`).
Módulo: `active-reunion.js`. Estado: ⏳ Abierto — mismo malentendido `anulada` vs `cancelada` que ISSUE-038; conviene barrer todos los call sites de una. Prioridad: Media.

### ISSUE-046: `resultados_legacy.html` mantiene una lista de cuerpos paralela
Descripción: la pantalla legacy no usa el catálogo de `chapas.js` — arma su propio `CUERPOS_OPCIONES` para el datalist de márgenes (`resultados_legacy.html:448`). Toda entrada nueva del catálogo (ej. el `4½ cpos` de ISSUE-040) hay que agregarla dos veces, o queda desalineada.
Módulo: `resultados_legacy.html`. Estado: ⏳ Abierto — unificar contra `chapas.js` o dar de baja la pantalla legacy. Prioridad: Baja.

### ISSUE-047: Barrido de cuentas huérfanas de `auth.users` (auto-registro)
Descripción: en el flujo de auto-registro, el `signUp` crea la cuenta en `auth.users` **antes** de que `rpc_solicitar_acceso` registre la solicitud. Si la RPC falla en el medio —o si la persona confirma el email y nunca vuelve a completar los datos— queda una cuenta en `auth.users` sin fila en `usuarios` ni en `solicitudes_acceso`. Una RPC no puede borrar de `auth.users` (necesita Admin API).

Mitigación **ya implementada** (Gate 3): el DNI se valida en el cliente **antes** del `signUp`, que era la causa más probable de que la RPC fallara después de crear la cuenta. Además `solicitar-acceso.html` reintenta **sólo la RPC** cuando la cuenta ya existe, sin repetir el `signUp`.

Falta la mitigación 2: un **barrido periódico** que liste (y opcionalmente borre) las cuentas de `auth.users` sin `usuarios` ni `solicitudes_acceso` y con más de N días. Hoy hay **2 huérfanas preexistentes**, de abril, anteriores a todo esto (ver `docs/AUTOREGISTRO_GATE_0.md` §0.4).

Módulo: `supabase/functions/` o script en `tools/`. Estado: ⏳ Abierto — **queda para después del piloto**, por decisión explícita. Prioridad: Baja (una cuenta huérfana no ve nada: sin fila en `usuarios` todas las policies la deniegan).

### ISSUE-048: El Gate 4 (inscribir desde el portal) no debe bloquear inscripciones múltiples del mismo ejemplar
Descripción: regla de negocio confirmada por Yesica el 04/08 (ver GOTCHA #69) — un caballo **se anota en varias categorías de la misma reunión** y recién el **lunes previo** la secretaría define en cuál queda. El schema ya lo permite (`UNIQUE (carrera_id, spc_id)`, por carrera y no por reunión) y en prod ya pasa: R6 del 20/06 tiene 13 ejemplares en 2 turnos cada uno.

Riesgo: la reacción intuitiva al diseñar el RPC de inscripción del portal es rechazar "este caballo ya está anotado en esta reunión". Eso **rompe el proceso real** del hipódromo.

**División de responsabilidades — resuelta por Leo el 04/08**: *el portal anota, la secretaría resuelve.* El entrenador **sí** puede anotar el mismo caballo en varias categorías desde el portal: es el proceso real, el papel funciona así. Lo único que queda **exclusivo de secretaría** es la **resolución del lunes** — decidir en qué categoría queda el ejemplar y dar de baja las otras inscripciones.

Qué hay que hacer en el Gate 4:
- El RPC de inscripción **no** valida unicidad por reunión. Si hace falta, aviso informativo en la UI ("ya lo anotaste en el turno N"), nunca un rechazo.
- La pantalla del portal tiene que **mostrar** las otras inscripciones del mismo ejemplar en esa reunión, para que el entrenador vea lo que ya hizo.
- La baja de las inscripciones sobrantes **no** va en el portal del Gate 4: es la resolución del lunes y la hace la secretaría desde el back office. El portal no necesita un botón de baja para esto.
- Revisar todo conteo por caballo/reunión (incentivos de montas, resumen de la Fase 5, cupos) para que no sobrecuente estas filas.

Complemento: **ISSUE-053** cubre el otro extremo de la misma regla — la resolución del lunes no tiene ningún control y ya se olvidó tres veces.

Módulo: `portal.html` + RPC de inscripción del Gate 4 (`docs/AUTOREGISTRO_PLAN.md` §Gate 4). Estado: ⏳ Abierto — es requisito de diseño, hay que resolverlo **antes** de escribir el RPC. Prioridad: Alta (bloquea el Gate 4, apuntado a R9 del 06/09).

### ISSUE-049: `profesionales.html` listaba entrenadores de todos los clubes y los creaba sin `club_id` — RESUELTO
Descripción: dos defectos de aislamiento por tenant en el ABM de entrenadores, detectados el 05/08 mientras se cruzaba la tanda 2 de R8 (`docs/TANDA_2_R8.md` §5).

1. **Fuga cross-tenant en la lectura**: `load()` consultaba `profesionales` filtrando sólo por `tipo = 'entrenador'`, **sin** `.eq('club_id', CLUB_ID)`. Desde Dolores se veían —y se podían editar y dar de baja— los 11 profesionales de `Mi Club Hípico`. `jockeys.html:271` sí filtraba; era una asimetría entre las dos pantallas hermanas.
2. **Alta sin tenant**: el payload del INSERT no incluía `club_id`. La columna es nullable, así que toda alta por pantalla creaba la fila con `club_id = NULL`, contra 167/167 filas de la tabla que lo tienen cargado. `jockeys.html:382` sí lo mandaba.

Impacto real medido antes del fix: **0 filas huérfanas** (`count(*) FILTER (WHERE club_id IS NULL)` = 0 sobre 167). El alta por pantalla de entrenadores nunca se usó, o las filas se cargaron por otra vía. Por eso **no hizo falta ninguna migración de adopción**.

Fix: `profesionales.html` — `.eq('club_id', CLUB_ID)` en `load()` + `club_id: CLUB_ID` en el payload. Branch `fix/club-id-alta-profesionales`.

Nota: con el fix, un `super_admin` sin club seleccionado (`CLUB_ID` null) no ve entrenadores, igual que hoy no ve jockeys. Es el comportamiento de `jockeys.html`; se unifica, no se empeora.

Módulo: `profesionales.html`. Estado: ✅ Resuelto (05/08/2026). Prioridad: era Alta (aislamiento por tenant).

### ISSUE-050: Caja "APUESTAS ESPECIALES" de la tapa estaba hardcodeada — ✅ RESUELTO (2026-08-12)
Descripción: la caja de la tapa de `programa-oficial-color.html` (número grande + "Carreras 2 · 3 · 4" + pozo) era un string literal con datos de una reunión anterior de 9 carreras — tenía un `TODO` que decía que las combinadas multi-carrera "no están en DB aún", cuando sí lo están (`carrera_apuestas.nombre` / `asegurado` / `incremento`). Reportado por Yesi: las especiales del programa no coincidían con lo que había cargado Fede para R8 (16/08/2026).

Diagnóstico fila por fila en R8 — Fede cargó bien, todo era presentación:

| Fede cargó (turno → prog) | Tapa mostraba | Diferencia |
|---|---|---|
| prog 2, X3 `Triplo Incial`, $45.000 | `2` · Triplo Inicial · Carreras 2·3·4 · $50.000 | monto |
| prog 5, X4 (sin nombre), $75.000 | `5` · Cuaterna Final · Carreras 6·7·8·9 · $75.000 | rango (va 5·6·7·8; la carrera 9 no existe) |
| prog 7, X2 `Doble final`, $25.000 | `8` · Doble Final · Carreras 8·9 · $25.000 | número y rango (va 7 y 7·8) |

La sospecha inicial de desfase turno↔carrera quedó **descartada**: la caja no consultaba la DB, así que no podía desfasarse. Las líneas de apuestas *dentro* de cada carrera sí leían `carrera_apuestas` y salían correctas — de ahí la contradicción tapa vs cuerpo en el mismo PDF.

Fix: `buildApuestasEspeciales(carreras)` deriva las tarjetas de `carrera_apuestas`. Numera con `idx + 1` sobre el mismo array ordenado que recibe `render()` (filtrado por `estado != 'anulada'`, ordenado por `numero_carrera_programa ?? numero_turno`), idéntico al `num = idx + 1` de `renderCarreraColor` — tapa y cuerpo comparten el índice y no pueden desfasarse. Rango por cantidad de patas (`X2`/`X2P` 2, `X3` 3, `X4` 4, `X5` 5; `CAD` hasta el final), con el fin clampeado a la última carrera. `X3`/`X4`/`X5`/`CAD` siempre entran; `X2`/`X2P` sólo con nombre, pozo o incremento — si no, los Dobles simples de $200 que van cargados en casi toda carrera generarían tarjetas basura. Sin combinadas especiales devuelve `''` y no se dibuja ni el grid ni el título.

Módulo: `programa-oficial-color.html` (la versión B&N no tiene esta caja).
Estado: ✅ RESUELTO — branch `fix/apuestas-especiales-tapa`. Probe `tests/probe_apuestas_especiales.mjs` (corre la función real extraída del HTML contra datos de prod; requiere `SUPABASE_SECRET_KEY`, con la publishable RLS devuelve 0 carreras). Prioridad: era Alta (R8 se imprime el 16/08).

Pendiente del lado del dato (no bloquea): typo `Triplo Incial` y la Cuaterna de R8 sin `nombre` (imprime "Cuaterna", no "Cuaterna Final"). R6 (borrador) tiene 5 especiales sucias cargadas en pruebas — `"Triplo Inicial ."`, `"DOBLE FINAL BASE $500"` con el precio dentro del nombre, y un Triplo y un Doble pisándose en la carrera 4; limpiar antes de imprimir R6.

### ISSUE-051: Drift CLAUDE.md — R1–R5 sin filas en `carreras`
Descripción: detectado de paso al barrer todas las reuniones de Dolores con la caja de especiales nueva (ISSUE-050). Las reuniones 1 a 5 tienen **0 filas** en `carreras` (`count(c.id) = 0`, no son anuladas: no existen). CLAUDE.md documenta la reunión 5 (17/05/2026) como reunión de prueba con "11 turnos, ~81 inscripciones" y la propone para fijar como reunión activa en testing. Hoy esa reunión imprimiría un programa vacío.

No se investigó si las carreras se borraron, si se migraron a otra reunión, o si el UUID de la R5 cambió y CLAUDE.md quedó apuntando a otro lado. Tampoco se tocó nada.

Módulo: datos (`carreras`) + `CLAUDE.md` §"Reunión activa para testing".
Estado: ⏳ Abierto — a revisar después del domingo 16/08. Prioridad: Baja (R1–R5 son reuniones viejas, ninguna se imprime esta semana; no afecta a R8).

### ISSUE-052: R6 en estado `borrador` con fecha pasada y sus 8 carreras oficiales
Descripción: la reunión 6 (`b02ca761-6f44-4720-86aa-a3c3099019ea`, 20/06/2026) sigue en `reuniones.estado = 'borrador'` aunque la fecha ya pasó y **las 8 carreras están oficiales**. Ya había aparecido durante el cotejo de R6 (`docs/COTEJO_R6.md:6`); volvió a surgir el 2026-08-23 al sanear `peso_balanza`, que fue el disparador de anotarlo como issue propio.

Antes de tocar el estado hay que entender dos cosas:
1. **Qué significa `borrador` a nivel reunión** cuando las carreras de abajo ya están oficiales — si es un estado inconsistente o si el flujo lo admite a propósito.
2. **Qué filtra por ese estado**. Si algún módulo (calendario, resumen, portal, export) excluye reuniones en `borrador`, cambiarlo hace aparecer R6 en lugares donde hoy no está, y eso puede ser el efecto deseado o un problema.

Explícitamente NO tocar hasta responder ambas. No es un fix de una línea aunque lo parezca.

Módulo: `reuniones` (datos) + posibles filtros app-wide.
Estado: ⏳ Abierto — a investigar. Prioridad: Baja (no bloquea nada hoy; R6 ya está liquidada y cotejada).

### ISSUE-053: La resolución de las anotaciones multi-turno no tiene ningún control (y una doble ratificación imprimiría el caballo dos veces)
Descripción: complemento directo de ISSUE-048. Aquel dice que el portal **no debe bloquear** que un ejemplar se anote en varios turnos de la misma reunión, y que la resolución (dejarlo en uno y dar de baja el resto) es la pasada del lunes de secretaría. Este issue es sobre el otro extremo: **esa resolución no tiene ningún control, y ya se olvidó tres veces**.

Relevado el 2026-08-23 (`docs/REGLA_INSCRIPCION_MULTITURNO.md`). Tres ejemplares quedaron ratificados en un turno y con la otra anotación colgada en `inscripto`, ni forfait ni mal_inscrito:

| Reunión | Ejemplar | Ratificado en turno | Quedó `inscripto` en turno |
|---|---|---|---|
| 6 (20/06) | LATIN PRESUMIDA | 9 | 10 |
| 8 (16/08) | FALAYS | 5 | 7 |
| 8 (16/08) | TATA FOOT | 11 | 9 |

Las dos de R8 sobrevivieron la reunión entera, con los resultados ya oficializados.

Por qué hoy no molesta: `renumerarChapas` filtra con `estado === 'ratificado'` (filtro positivo, GOTCHA #7), así que una fila en `inscripto` no entra al programa, ni al mandil, ni a la carta de llamados, ni al JSON del Stud Book. Es ruido en la tabla, no un dato malo en pantalla.

Por qué va a molestar: hoy las inscripciones las carga secretaría a mano y son ~100 por reunión. Con el portal del Gate 4 las carga cada entrenador, y el proceso que ISSUE-048 declara correcto — anotarse en varias categorías — pasa a ser masivo. En R8 el 30 % de los SPC ya estaba en 2+ turnos con carga manual. Cada anotación que no se resuelve queda como fila colgada, y no hay nada que las junte ni las muestre.

**EL ESCENARIO QUE HAY QUE EVITAR — el programa oficial imprime el caballo dos veces.**

Si un SPC queda **ratificado en dos carreras de la misma reunión**, `renumerarChapas` lo cuenta como ratificado en las dos y le asigna **un mandil en cada una** (números distintos, porque el mandil es 1..N por carrera). El caballo sale impreso **dos veces en el programa oficial, en dos turnos distintos, como si fuera a correr las dos**. Se propaga a todo lo que deriva de ratificados: `programa-oficial.html` y `programa-oficial-color.html`, `carta-llamados.html`, el JSON del Stud Book de Diego y el marcador de `resultados.html`.

No hay error, no hay warning, no revienta nada. Sale un programa con un caballo duplicado y se detecta cuando alguien lo lee. **Esto no es un residuo de datos en una tabla: es un error visible en el papel que va a imprenta**, con el nombre del hipódromo arriba. La diferencia con las 3 filas colgadas en `inscripto` es exactamente ésa — aquéllas no se ven en ningún lado, ésta se ve en el programa oficial.

**Y hoy nada lo impide:**
- `validar_inscripcion` es per-carrera: recibe una carrera y no mira el resto de la reunión. No sabe que existe otra anotación.
- `ratificar()` (`ratificacion.html:897`) es un UPDATE pelado. Sin lectura previa, sin chequeo, sin confirmación. La única guarda del botón es que haya jockey asignado.
- No hay trigger, ni constraint, ni unique que involucre `reunion_id`. **Se puede ratificar el mismo SPC en los 11 turnos de una reunión y el sistema no dice una palabra.**

Nunca pasó — 0 casos de doble ratificación en toda la base, verificado sobre todas las reuniones de todos los clubes. Pero eso es **disciplina del operador, no un control del sistema**. Las 3 anotaciones de la tabla de arriba quedaron en `inscripto` **por suerte**: si el mismo olvido hubiera caído del lado de ratificar en vez de dejar sin resolver, hoy tendríamos dos programas oficiales impresos con un caballo duplicado. Nada del código las empujó hacia el lado inofensivo.

**PREGUNTA DE PRODUCTO — la define Fede:** al ratificar un SPC en un turno, ¿qué hace el sistema con las otras anotaciones de ese mismo SPC en la misma reunión? Tres opciones:

1. **Resolver automáticamente las otras al ratificar.** Al ratificar en un turno, las demás anotaciones del SPC pasan solas a `forfait`. Es literalmente lo que describe la regla de Fede ("se declara forfait en los demás") y es la única que cierra el problema sin depender de que alguien se acuerde. A favor: elimina las filas colgadas y hace imposible la doble ratificación. En contra: **escribe filas que nadie pidió explícitamente**, y hay que definir si el estado automático es siempre `forfait` o si a veces corresponde `mal_inscrito` (que no es lo mismo: uno es retiro, el otro es fuera de condición).
2. **Avisar y que decida Yesi.** Al ratificar, un aviso no bloqueante: "este ejemplar tiene anotaciones sin resolver en los turnos N, M". La secretaría las resuelve a mano, pero deja de tener que recordarlas. Precedente exacto en la casa: `recalcJockeyColisiones` (`ratificacion.html:813`) ya hace esto para jockeys duplicados dentro de una carrera — pinta la fila y agrega un badge `⚠ dup.`, sin bloquear. Acá sería lo mismo pero a nivel reunión. A favor: no escribe nada, respeta que la resolución es decisión de secretaría (ISSUE-048). En contra: sigue siendo posible ignorar el aviso y ratificar dos veces.
3. **Bloquear la ratificación doble.** Impedir que un SPC quede ratificado en dos turnos de la misma reunión. Es la más acotada de las tres y ataca directamente el escenario del programa duplicado: **no existe el caso legítimo de un caballo corriendo dos carreras de la misma reunión**, así que bloquearlo no le quita ninguna opción real a la secretaría. En contra: no resuelve las anotaciones colgadas en `inscripto`, sólo evita que el olvido llegue al papel.

No son excluyentes: 3 se puede combinar con 1 o con 2. Si hay que elegir una sola, 3 es la que cubre el daño visible.

Nota de implementación para cuando se decida: el dato ya está cargado. `ratificacion.html:586` trae **todas** las inscripciones de la reunión (`.in('carrera_id', ids)` sobre todas las carreras), así que detectar las otras anotaciones de un SPC es un `filter` sobre un array en memoria — cero queries nuevas.

Módulo: `ratificacion.html` (`ratificar`, `volverInscripto`, `marcarEstado`) + eventualmente `validar_inscripcion` y el RPC del Gate 4. Relacionado: ISSUE-048 (la otra mitad de la misma regla), GOTCHA #69.
Estado: ⏳ Abierto — **esperando definición de producto de Fede**. Las 3 filas colgadas no requieren saneamiento urgente. Prioridad: Media hoy, **Alta cuando se abra el portal del Gate 4**.

---

### ISSUE-054: El guard de `desoficializar_carrera` dice "anulá los recibos primero" cuando no hay recibos que anular

Detectado el **2026-08-28**, al saldar administrativamente R6 y R8
(`docs/diagnosticos/2026-08-28_ejecucion-saldado-r6-r8.md`). **Registrado por decisión explícita:
se anota, NO se arregla ahora.**

El guard del RPC bloquea con un **OR**, pero el mensaje sólo habla de una de las dos ramas:

```sql
SELECT count(*) INTO v_pagas
  FROM liquidacion_detalle d
 WHERE (d.recibo_id IS NOT NULL OR d.estado_linea = 'pagado')   -- ← OR
   AND ( d.carrera_id = p_carrera_id
      OR d.inscripcion_id IN (SELECT i.id FROM inscripciones i WHERE i.carrera_id = p_carrera_id) );

IF v_pagas > 0 THEN
  RAISE EXCEPTION 'carrera con pagos emitidos, anulá los recibos primero';   -- ← asume recibo
END IF;
```

Una línea con `estado_linea='pagado'` y `recibo_id IS NULL` dispara el guard igual, y el operador
recibe una instrucción imposible de cumplir: no hay recibo que anular.

**Ya está pasando en producción.** Tras el saldado del 28/08, **7 de las 11 carreras de R6 y 8 de
las 12 de R8** disparan el guard **sin un solo recibo asociado** (las 332 líneas regularizadas
quedaron `pagado` con `recibo_id` NULL a propósito — no se emitieron recibos). Quien intente
des-oficializar una de esas carreras va a ir a buscar recibos que no existen.

- **Impacto**: pérdida de tiempo y diagnóstico errado. **Sin riesgo de datos** — el guard hace lo
  correcto, sólo lo explica mal.
- **Que R6 y R8 queden trabadas para des-oficializar SE ACEPTA** (decisión de Fede vía el usuario,
  28/08): están cerradas y la plata salió por fuera del sistema; corregir una monta vieja no cambia
  nada financiero. El costo es teórico y el beneficio —congelar el histórico— era el objetivo.
- **Arreglo sugerido (no aplicado)**: distinguir las dos ramas en el mensaje, contando cada una por
  separado. Algo del tipo *"carrera con N línea(s) pagada(s) con recibo y M por saldado
  administrativo; anulá los recibos o revertí el saldado"*. Es sólo el `RAISE EXCEPTION`, la lógica
  del guard no cambia.
- **Cómo reconocer una línea de saldado administrativo**: `estado_linea='pagado' AND recibo_id IS
  NULL`, combinación que el sistema nunca produce por sí solo (`emitir_recibo` siempre asigna
  `recibo_id`). Además llevan el sufijo `[REGULARIZACION 2026-08-28: …]` en `descripcion`.

Módulo: RPC `desoficializar_carrera` (SECURITY DEFINER, en DB) · consumido por `resultados.html`.
Relacionado: `docs/diagnosticos/2026-08-28_plan-saldado-r6-r8.md` §5.2.
Estado: ⏳ Abierto — **anotado a propósito, sin arreglar**. Prioridad: Baja (cosmético), sube a
Media si alguien necesita des-oficializar una carrera de R6/R8.

---

### ISSUE-055: La reunión de prueba 9999 aparece en el buscador de Pagos junto a la plata real

Detectado el **2026-08-28**, en la verificación del saldado de R6/R8.

`cobrosBuscar` (`liquidaciones.html:810-814`) **no filtra por reunión salvo que el operador elija
una**:

```javascript
let qy = sb.from('liquidacion_detalle')
  .select('…')
  .eq('estado_linea','impago').neq('beneficiario_tipo','club').is('recibo_id', null);
if (rid) qy = qy.eq('reunion_id', rid);   // ← opcional
```

Con R6 y R8 ya saldadas, medido el 28/08 sobre prod, lo único que queda en la lista pagable es la
**reunión de prueba 9999**: **36 líneas por $488.000,00**. El 20/09 esa plata de sandbox le va a
aparecer a Valeria en la misma lista que las líneas reales de R9.

**La 9999 no se borra** (decisión del usuario, 28/08): es el único banco de pruebas seguro que hay
y ya demostró su valor en el probe de recuperación de montas
(`tests/probe_recuperacion_monta.mjs`). El `teardown_prueba_resumen_9999.sql` queda sin usar.

Tres salidas posibles, ninguna obviamente correcta — **es decisión de producto de Fede**:

1. **Disciplina de proceso**: Valeria elige siempre la reunión antes de pagar. Gratis, pero depende
   de que nadie se olvide una vez.
2. **Marcar las 36 líneas de 9999 como pagadas** (misma técnica que R6/R8). Las saca de la lista,
   pero **rompe el sandbox**: el probe de recuperación necesita líneas impagas para correr.
3. **Excluir las reuniones de prueba en `cobrosBuscar`** por código. Es la que escala: un flag
   `reuniones.es_prueba` excluido del circuito de cobro resolvería esto para cualquier sandbox
   futuro, no sólo la 9999. Requiere DDL (una columna) + el filtro en la query.

La 3 parece la buena a mediano plazo. Filtrar por `numero=9999` a mano sería un parche que no
sobrevive al próximo sandbox.

**Nota sobre el número (2026-08-29)**: en la planificación del fix se midió **27 líneas por
$396.000** y se creyó que el 36/$488.000 del párrafo de arriba estaba desactualizado. Estaba mal la
medición, no el issue: 9 líneas del sandbox habían quedado colgadas de un recibo fantasma emitido a
las 21:20 UTC del 28/08 (ver ISSUE-059). Devueltas a `impago`, la 9999 volvió a **36 líneas por
$488.000,00** — el número original. **No corregir esta cifra.**

**Resuelto el 2026-08-29** con la opción 3: columna `reuniones.es_prueba` + filtro en
`cobrosBuscar` **y en `cobrosDetalle`** (que no está acotado por reunión y traería las líneas del
sandbox ya tildadas). La 9999 no se esconde: se rotula `⚗ PRUEBA` en el selector y sigue elegible
a mano, que es lo que mantiene usable el banco de pruebas sin inventar un rol ni un parámetro de
URL. Migración `migrations/reuniones_es_prueba.sql`, rollback
`migrations/rollback_reuniones_es_prueba.sql`, probe `tests/probe_reunion_es_prueba.mjs` (16/16).

Módulo: `liquidaciones.html` (`cobrosBuscar`, `cobrosDetalle`) · `reuniones.es_prueba`.
Relacionado: `docs/diagnosticos/2026-08-28_ejecucion-saldado-r6-r8.md` §6.2 ·
`docs/diagnosticos/2026-08-29_issue-055-es-prueba-plan.md` · ISSUE-059 · ISSUE-060.
Estado: ✅ **CERRADO** (2026-08-29).

---

### ISSUE-056: No existe `anular_recibo` — revertir un recibo requiere SQL a mano sobre producción

Detectado el **2026-08-28**, con el **primer caso real**.

`emitir_recibo` es atómico y correcto, pero **no tiene contraparte**. Cuando Valeria emitió el
recibo **#4** sobre R8 como prueba (LORENA SOLEDAD VARELA, 6 líneas, $62.700), revertirlo exigió un
plan escrito, relevamiento del estado previo de cada línea y SQL manual contra prod:
`docs/diagnosticos/2026-08-28_plan-revert-recibo-4.md` +
`docs/diagnosticos/2026-08-28_ejecucion-revert-recibo-4.md`.

**Por qué urge**: el 20/09 hay reunión con gente esperando el cobro. Un recibo emitido por error
—beneficiario equivocado, líneas de más, importe mal— hoy no tiene forma limpia de arreglarse: hay
que abrir la consola de Supabase mientras la cola espera.

**Lo que aprendimos hoy y tiene que entrar en el RPC:**

1. **Soltar las líneas**: `recibo_id = NULL` en todas las del recibo.
2. **Restaurar el estado previo** de cada línea. Hoy es reconstruible **sólo por inferencia**:
   `emitir_recibo` v1.1 exige `estado_linea='impago'` (⇒ el previo siempre fue `impago`) y
   `fecha_liberacion` distingue lo que alguna vez estuvo retenido (`liberar_linea` no la toca).
   Funcionó, pero es deducción, no dato. Conviene **persistir el estado previo** — una columna en
   `liquidacion_detalle` o una tabla `recibo_lineas_snapshot`.
3. **Marcar el recibo como anulado, NO borrarlo.** `recibos` ya tiene `estado` (enum
   `estado_recibo`) y `anulado_at`, hoy sin uso: `estado='anulado'`, `anulado_at=now()`, motivo en
   `notas`. El #4 se borró porque era dato de prueba; una anulación de verdad tiene que dejar
   rastro.
4. **No devolver el correlativo.** `club_secuencias` no se toca: un número emitido no se recicla,
   aunque quede hueco. Hoy quedó el hueco del #4 — los recibos vivos son `1, 2, 3, 9001, 9002` y el
   próximo será el 5. (Decisión del usuario, 28/08.)
5. **Registrar quién anula** — ver ISSUE-057: `emitir_recibo` nunca setea `emitido_por` y la
   anulación no puede repetir ese error.

**Detalle técnico útil para implementarlo**: el único FK contra `recibos` es
`liquidacion_detalle.recibo_id` con `ON DELETE NO ACTION`, que se chequea **al final de la
sentencia**. Por eso el `UPDATE` que suelta las líneas y el `DELETE`/`UPDATE` del recibo entran en
una sola sentencia con CTEs modificantes, sin violar el FK. Verificado en prod el 28/08.

#### Lo que se construyó (2026-08-30) — RPC sí, UI no

**`anular_recibo(p_recibo_id uuid, p_motivo text)`** — `migrations/anular_recibo_v1.sql`, aplicada
en prod como `20260830025830_anular_recibo_v1`. Rollback: `migrations/rollback_anular_recibo_v1.sql`.

Contra la lista de arriba, punto por punto:

1. ✅ Suelta las líneas (`recibo_id = NULL`, `pagado_at = NULL`).
2. ✅ Restaura el estado **derivándolo de la propia línea**, no siempre a `impago`: si
   `fecha_liberacion` es futura vuelve a `retenido`. La retención por anti-doping es una
   restricción reglamentaria — devolver a `impago` una línea que el reglamento retiene haría que
   el sistema declare pagable plata que no lo es. Se descartó persistir el estado previo en una
   columna nueva: la regla ya es derivable y `fecha_liberacion` sobrevive tanto a `liberar_linea`
   como a `emitir_recibo`.
3. ✅ Marca `estado='anulado'` + `anulado_at`, **sin borrar**. El motivo va en
   `recibos.motivo_anulacion` (columna propia, no en `notas`) y es **obligatorio**, validado en el
   RPC y no con `NOT NULL` en la columna: las 5 filas históricas quedarían inválidas.
4. ✅ No devuelve el correlativo — `club_secuencias` no se toca. El probe lo assertea igual: "se
   cumple solo" es justo lo que deja de cumplirse en silencio.
5. ✅ `anulado_por` → **`usuarios(id)`, NO `auth.users`** (GOTCHA #79). NULL bajo `service_role`.

**Agregado que no estaba en la lista: `recibos.lineas_anuladas jsonb`.** Fotografía los
`liquidacion_detalle.id` del recibo **antes** de soltarlos. Sin eso el vínculo se pierde para
siempre: al poner `recibo_id = NULL` el recibo ya no las nombra, y `liquidacion_detalle` **no tiene
trigger de auditoría** (a diferencia de `recibos`, que sí). Reconstruir el #4 hoy exige leer un
informe de diagnóstico; con esto es un `SELECT`.

**Permisos**: mismo club y dentro de 5 días corridos de emitido → puede anular; pasados los 5 días,
sólo `super_admin`. La ventana no está para darle tiempo a Valeria: separa el caso rutinario (el
error se ve el mismo día, como el #4) del excepcional. Los guards van **escritos en la función**
porque es `SECURITY DEFINER` y las policies de las tablas no se evalúan adentro (GOTCHA #80).

**Probe**: `tests/probe_anular_recibo.mjs` — candado de club, la ventana de 5 días por sus dos
lados, motivo obligatorio, idempotencia, el jsonb, y el correlativo que no vuelve.

#### La UI (2026-08-30, segunda entrega — mergeada en `0a3a2ac`, VIVA en prod)

**Opción A: se anula desde el recibo recién emitido**, no desde un buscador de recibos (que sigue
fuera de alcance). Es el caso real: el #4 se emitió probando y se detectó al instante — la ventana
en la que el operador se da cuenta del error es la misma en la que todavía tiene el recibo en
pantalla.

Al planificarla apareció que **el punto de anclaje que este mismo doc daba por existente no
existía**: no hay bloque post-emisión ni botón "Imprimir". `imprimirReciboCobro` escribe en
`#recibo-print` (que es `display:none` fuera de `@media print`) y dispara `window.print()` directo.
Así que primero hubo que crear la superficie.

- **Panel `#cob-recibo-emitido`** — nº, beneficiario, cantidad de líneas, importe y hora, con
  **Imprimir de nuevo** y **Anular recibo** (rojo `--danger`, separado por `gap:28px` para que no se
  apriete de más). Va **fuera** de `#cob-detalle` a propósito: `cobrosBuscar()` vacía `#cob-detalle`
  en cada búsqueda y el panel tiene que sobrevivir al refresco que sigue a la emisión.
- **"Imprimir de nuevo" tapa un agujero que no tenía solución**: si el operador cancelaba el diálogo
  de impresión, el recibo ya estaba emitido y no había forma de volver a sacarlo.
- **Motivo obligatorio** en modal (`modal-anular`), validado en el cliente **además** del RPC. El
  motivo va primero y la confirmación después: al revés, el operador confirma y recién ahí le piden
  justificar, y el motivo termina siendo cualquier cosa para pasar el trámite.
- **La confirmación dice qué se pierde**, no sólo pregunta: número, importe, beneficiario, "las N
  líneas vuelven a quedar pendientes", "el número no se reutiliza" y —textual de Fede— *"Si ya
  imprimiste el recibo, ese impreso queda sin valor."* Es un hecho del sistema, no un procedimiento:
  qué se hace con ese papel no lo define el software.
- **Después de anular**: `cobrosBuscar()` y después `cobrosDetalle()` (en ese orden: el primero
  vacía `#cob-detalle`), y un aviso que **nombra las líneas que volvieron a `retenido`** por doping
  y hay que habilitar de nuevo. Es consecuencia del `CASE` del RPC y no hay por qué deducirla
  mirando la pantalla — por eso `toast()` ganó un parámetro de duración y ese aviso dura 15 s.
- **El panel sobrevive a la anulación**: queda como `Recibo N° X — ANULADO`, sin el botón. Si
  desapareciera, la pantalla no dejaría rastro de que alguien acaba de anular un recibo.
- **Ventana de 5 días**: `puedeAnularUI(recibo, rol)` con `currentUser.rol` — el mecanismo que
  `initAuth` ya usa, sin inventar nada. **No es un guard**: el RPC valida igual (GOTCHA #80). Usa el
  reloj del cliente contra el `now()` del servidor del RPC; si discrepan, gana el RPC.

**Probe**: `tests/probe_anular_recibo_ui.mjs` — **26/26**, más **8/8 mutantes muertos**
(`--mutantes`, sobre copias del HTML en un tmpdir). Dos de los mutantes destaparon asserts débiles
antes de quedar así: uno de ellos, el del motivo vacío, pasaba con el guard neutralizado porque el
RPC rechazaba igual — se arregló espiando `sb.rpc` para verificar que la llamada **no sale**.

Verificado contra producción, no razonado: `md5sum` de `liquidaciones.html` coincide entre el
working tree, `git show 0a3a2ac:liquidaciones.html` y lo que sirve `https://sigh.com.ar`
(`0189ecbe749cde1bf4cfa0528162f329`), y el probe corrido **contra el HTML servido** da **26/26**.

#### Lo que queda fuera, a propósito

- ~~**Buscador de recibos / vista de historial** (opción B).~~ ✅ **HECHO** el 2026-08-30, merge
  `82484e5`. Solapa 📄 Recibos: búsqueda por número, por beneficiario y por quien retiró; los
  anulados aparecen marcados con motivo, quién y cuándo; reimpresión desde el historial. De paso
  cerró dos cosas que la opción A había dejado abiertas: **anular un recibo de la semana pasada ya
  no necesita consola** (se lo busca y se lo ve), y **`anular_recibo` pasó a v2** guardando la foto
  de las líneas en vez de sólo los ids.
- **Reimprimir el anulado con sello ANULADO** — decidido: va después. ⚠️ Ahora pesa más: con el
  historial, reimprimir un anulado **funciona de verdad**, así que sale un papel idéntico al
  original de un recibo que ya no vale.
- **La policy `recibos_delete`** — migración aparte, ISSUE-065.

Módulo: RPC nuevo (DB) ✅ + `liquidaciones.html` (tab Pagos) ❌.
Relacionado: `migrations/anular_recibo_v1.sql`, `migrations/emitir_recibo_v1_1.sql`,
`migrations/liberar_linea.sql`, ISSUE-057, GOTCHA #79, GOTCHA #80 ·
`docs/diagnosticos/2026-08-30_anular-recibo-plan.md` ·
`docs/diagnosticos/2026-08-30_anular-recibo-resultados.md` ·
`docs/diagnosticos/2026-08-30_anular-recibo-estado-post-corte.md`.
Estado: ✅ **CERRADO** (2026-08-30) — RPC (`34f6e83`) + UI (`0a3a2ac`), los dos vivos en
producción y verificados contra `sigh.com.ar`. Anular un recibo dejó de requerir SQL a mano.

---

### ISSUE-057: `emitir_recibo` no registra el autor — `emitido_por` es NULL en todos los recibos

Detectado el **2026-08-28**, al investigar quién había emitido el recibo #4.

`recibos.emitido_por` existe en el schema y es nullable, pero **el RPC nunca lo setea**. Medido
sobre prod el 28/08: **NULL en los 6 recibos** de la base (`1, 2, 3, 4, 9001, 9002`).

Sabemos que el #4 lo emitió Valeria **porque lo dijo ella**, no porque la base lo registre. Si
hubiera negado haberlo hecho, no había forma de saberlo: `emitido_at` da la hora, nada más.

**Por qué importa el 20/09**: van a operar varias personas sobre el mismo módulo de dinero. Un
recibo sin autor es un agujero de auditoría en el punto exacto donde sale la plata — y es donde
más se lo va a necesitar si algo sale mal en vivo.

**Arreglo**: `emitido_por = auth.uid()` en el `INSERT INTO recibos` de `emitir_recibo`. El RPC es
`SECURITY DEFINER`, así que hay que tomar el uid **antes** de cualquier cambio de contexto, y
contemplar el caso `service_role` (sin usuario → NULL, como hoy). Tocar el RPC implica una
migración nueva en `migrations/` — no se hizo junto al fix del recibo porque el alcance de ese
trabajo excluía explícitamente tocar `emitir_recibo` o su firma.

**Nota relacionada, sin arreglo propio**: los recibos **#1, #2 y #3** son **cobros reales de R8** y
tampoco tienen `cobrador_nombre` / `cobrador_documento` — se emitieron cuando la UI mandaba `null`
a propósito (decisión previa de Fede, revertida el 28/08 en `fix/recibo-pie-cobrador`). No se
tocan: son históricos y la plata ya se pagó. Pero quedan sin registro de quién retiró.

**RESUELTO (2026-08-30)** — `migrations/emitir_recibo_v1_2_aislamiento_club.sql`, aplicada en prod
como `20260830014105_emitir_recibo_v1_2_aislamiento_club`. Salió junto con ISSUE-059, en el mismo
`CREATE OR REPLACE`.

No era una línea: la obvia (`emitido_por = auth.uid()`) **viola la FK**. `recibos.emitido_por`
apunta a `usuarios(id)`, no a `auth.users`, así que hay que resolver el usuario de la app:

```sql
SELECT u.id INTO v_usuario_id
  FROM usuarios u
 WHERE u.auth_user_id = auth.uid() AND u.activo
 LIMIT 1;
```

Bajo `service_role` (probes, MCP, jobs) `auth.uid()` es NULL y `emitido_por` **queda NULL a
propósito**: la columna sigue nullable y no se inventa un autor. Los probes existentes no se rompen.

Los 5 recibos históricos siguen con `emitido_por` NULL — son de antes del fix y no se tocan.

Verificado por `tests/probe_aislamiento_club_cobros.mjs`, asserts 17/19/20. El 17 compara los dos
ids a propósito (`emitido_por=706c4e2c… usuarios.id=706c4e2c… auth.uid=917cfe09…`): assertear sólo
`IS NOT NULL` habría dejado pasar la versión con `auth.uid()`.

Módulo: RPC `emitir_recibo` (DB).
Relacionado: ISSUE-056, ISSUE-059, GOTCHA #79,
`docs/diagnosticos/2026-08-28_ejecucion-revert-recibo-4.md`.
Estado: ✅ **RESUELTO** (2026-08-30).

---

### ISSUE-058: El restore de los probes se verificaba contando filas, no comparando estados

Detectado el **2026-08-29**, al investigar de dónde salían 9 líneas del sandbox en `pagado`.

`probe_recibo_pie_cobrador.mjs` cerraba su `finally` con dos checks:

```javascript
ok('R1 cleanup: fixtures borradas', !liqFin?.length && !recFin?.length);
ok('R2 cleanup: no quedan líneas huérfanas', !sobra?.length);
```

Los dos **cuentan filas**. El 28/08 dieron verde —76 líneas en la 9999, 0 recibos de prueba, 0
huérfanas— mientras 9 líneas del sandbox quedaban en `estado_linea='pagado'` colgadas de un recibo
ajeno. Las filas estaban; lo que había cambiado era su estado. Es la misma clase de error que el
recibo #4: **contar filas no es verificar estado**.

`probe_recuperacion_monta.mjs` tenía la variante suave del mismo defecto: su restore SÍ era
correcto (borra y reinserta las filas enteras, con `estado_linea` y `recibo_id` adentro), pero su
verificación comparaba **sólo los ids** (`finalDets.map(d=>d.id).sort()`). Ids iguales, estados sin
mirar.

**Resuelto** con `tests/lib/estado_lineas.mjs`: `snapshotLineas` (id → campos), `diffLineas`
(comparación campo por campo), `restaurarLineas` (devuelve lo que cambió) y `recibosDesde`
(recibos creados durante la corrida, **sin filtro de club** — el recibo fantasma sobrevivió
justamente porque la foto filtraba por Dolores y el recibo había salido con el club_id de Mi Club
Hípico). Los dos probes ahora asertan por estado y reportan aparte si tuvieron que restaurar algo:
haber podido arreglarlo no lo vuelve aceptable.

Checks nuevos: `R3`/`R4`/`R5` en `probe_recibo_pie_cobrador.mjs` (56 checks, todos verdes),
`R1b`/`R1c` en `probe_recuperacion_monta.mjs` (19 checks, todos verdes).

Módulo: `tests/`. Estado: ✅ **CERRADO** (2026-08-29).

---

### ISSUE-059: `emitir_recibo` no valida que las líneas pertenezcan a `p_club_id` — fuga entre hipódromos

Detectado el **2026-08-29**, con un caso **real en producción**.

La RPC marca las líneas así:

```sql
UPDATE liquidacion_detalle d
   SET estado_linea = 'pagado', recibo_id = v_recibo.id, pagado_at = now()
 WHERE d.id = ANY(p_linea_ids)
   AND d.beneficiario_id = p_beneficiario_id
   AND d.recibo_id IS NULL
   AND d.estado_linea = 'impago';
```

Chequea beneficiario, que esté impaga y que no tenga recibo. **No chequea que la línea sea del club
que emite.** El número sale de `fn_siguiente_recibo(p_club_id)`, o sea que el recibo se numera en
un hipódromo y cobra líneas de otro.

**Lo que efectivamente pasó** (`recibos.id = 2d89fb7d-3cc5-43da-ad26-28a15203f4f9`):

| campo | valor |
|---|---|
| `club_id` | `a6da7e40-…` — **Mi Club Hípico** (club inactivo) |
| `numero_recibo` | 1 |
| `profesional_id` | `6361df8c-…` — ACHINGO, entrenador de **Dolores** |
| `neto_a_cobrar` | $92.000 |
| `emitido_at` | 2026-08-28 21:20:30 UTC |
| `emitido_por` | NULL (ISSUE-057 — no hay a quién preguntarle) |
| líneas | **9, todas de la reunión 9999 de Dolores** |

**Reproducción — confirmada por el autor (2026-08-29), no es hipótesis.** Lo emitió el propio
usuario haciendo la verificación visual del recibo:

1. `liquidaciones.html`, con el **club-switcher parado en Mi Club Hípico**.
2. El tab **Pagos siguió mostrando las líneas de la 9999 de Dolores** (ISSUE-060).
3. Tocar **🧾 Pagar** → emitir → imprimir.

`emitido_por` es NULL (ISSUE-057), así que la base no lo sabe, pero el autor está identificado y el
camino es determinístico. **No hay misterio que investigar: hay dos validaciones que faltan.**

Datos revertidos el 2026-08-29 con `migrations/fix_recibo_fantasma_mch.sql` (líneas devueltas a
`impago`, recibo borrado, rollback incluido en el mismo archivo). Verificado después:
`0` líneas con `recibos.club_id <> liquidaciones.club_id` en toda la base.

**La causa no está arreglada.** El fix sería agregar a la RPC:

```sql
AND EXISTS (SELECT 1 FROM liquidaciones l WHERE l.id = d.liquidacion_id AND l.club_id = p_club_id)
```

No se aplicó en la misma pasada porque toca la RPC de cobro con Valeria operando, y merece su
propio probe. Ver también ISSUE-060: el otro extremo del mismo agujero.

**RESUELTO (2026-08-30)** — `migrations/emitir_recibo_v1_2_aislamiento_club.sql`, aplicada en prod
como `20260830014105_emitir_recibo_v1_2_aislamiento_club`.

El fix son **dos guards con criterios distintos**, y hacen falta los dos:

- **Guard 1 (permiso)** — un usuario de club no emite con `p_club_id` ajeno. Depende de la sesión:
  `service_role` (`fn_get_user_club_id()` NULL) y `super_admin` pasan, porque el super_admin
  legítimamente opera cualquier club con el club-switcher.
- **Guard 2 (invariante del dato)** — toda línea del array cuelga de una liquidación del **mismo**
  club que el recibo. **No** está condicionado a la sesión: corre igual bajo `service_role`. Es el
  que ataja el recibo fantasma. Va dos veces: pre-chequeo que cuenta las ajenas y aborta (todo o
  nada, con el conteo en el mensaje) y `AND EXISTS` dentro del `UPDATE` (carrera entre chequeo y
  escritura). Sólo el `EXISTS` habría dejado las ajenas afuera **en silencio**, emitiendo el recibo
  con menos líneas — el peor modo de falla cuando hay plata.

Las validaciones van **antes** de `fn_siguiente_recibo()`: el número correlativo se consume recién
cuando la emisión ya es válida. De paso se agregó `AND d.beneficiario_tipo = p_beneficiario_tipo` al
`UPDATE` (v1.1 comparaba sólo el id); verificado sobre las 493 líneas: 0 recibos con tipo distinto
al de sus líneas, así que no rompe nada existente.

Por qué la RLS no alcanzaba: `emitir_recibo` es `SECURITY DEFINER` y **las policies no se evalúan
adentro**. Ver GOTCHA #80.

Verificado por `tests/probe_aislamiento_club_cobros.mjs` — **27/27** contra el RPC real (asserts
1, 1b, 2, 3, 3b, 14, 15, 16, 18). El 2 y el 3 son los que importan: la mezcla propia+ajena se
rechaza **entera** y no queda escritura parcial ni recibo colgado en ningún club.

Regresión sin novedades: `probe_recibos_emision` 3 fallos previos, `probe_cobros_v11` 1 previo,
`probe_recibo_pie_cobrador` 56/56, `probe_reunion_es_prueba` 17/17.

Rollback disponible: `migrations/rollback_emitir_recibo_v1_2.sql` (vuelve a v1.1 exacta).

Módulo: RPC `emitir_recibo`. Relacionado: ISSUE-057, ISSUE-060, GOTCHA #79, GOTCHA #80.
Estado: ✅ **RESUELTO** (2026-08-30).

---

### ISSUE-060: `cobrosBuscar` no filtra por `club_id` — con el club-switcher muestra plata ajena

Detectado el **2026-08-29**, investigando ISSUE-059.

La query del buscador de Pagos no menciona `club_id` en ninguna parte:

```javascript
sb.from('liquidacion_detalle')
  .select('…')
  .eq('estado_linea','impago').neq('beneficiario_tipo','club').is('recibo_id', null);
```

Funciona porque en la práctica sólo Dolores tiene liquidaciones. Pero `club-switcher.js` deja al
`super_admin` cambiar de hipódromo en 16 páginas, y `liquidaciones.html` es una de ellas: parado en
Mi Club Hípico, el tab Pagos sigue listando las líneas de Dolores, y el botón Pagar emite con el
`CLUB_ID` del club activo. Esa es la mecánica exacta del recibo fantasma de ISSUE-059.

**Reproducción confirmada** (2026-08-29, reportada por el autor del recibo fantasma): switchear a
Mi Club Hípico → abrir Pagos → la plata de Dolores está toda ahí. No hace falta ninguna condición
rara. Es el paso 2 de la repro de ISSUE-059.

El fix es un `.eq('club_id', CLUB_ID)`, pero `liquidacion_detalle` **no tiene** `club_id` — está en
`liquidaciones`. Hay que resolverlo por embed (`liquidaciones!inner(club_id)`) o por lista de
`liquidacion_id` del club, y en ambos casos hay que cuidar el NULL-safe (GOTCHA #5). Por eso no
entró en el fix de ISSUE-055: es un cambio de query con su propia forma de romperse.

**RESUELTO (2026-08-30)** — merge de `fix/aislamiento-club-cobros`, junto con ISSUE-059.

`liquidacion_detalle` no tiene `club_id` propio, así que el club llega **por embed**
`liquidaciones(club_id)` — **sin `!inner`**, respetando la regla NULL-safe de GOTCHA #5 / ISSUE-038:
un `!inner` habría descartado filas en silencio. El filtro se aplica con un helper único:

```javascript
function cobDelClub(l){ return l?.liquidaciones?.club_id === CLUB_ID; }
```

Se aplica en **el listado y en el detalle**, no sólo en el listado. Filtrar únicamente el listado
movía el agujero un click más adentro (lección de ISSUE-055): un beneficiario que entra a la lista
por plata propia abría el detalle con las líneas del otro club mezcladas **y tildadas**.

Verificado por `tests/probe_aislamiento_club_cobros.mjs`, asserts 4a, 4b, 5-13 — incluidos los
casos inversos (11, 12, 13), que son los que impiden que el filtro pase por ser demasiado
restrictivo. El 4b fija que el embed va sin `!inner`. `probe_reunion_es_prueba` suma el **4c**, que
verifica el filtro de club dentro de `cobrosDetalle`.

Módulo: `liquidaciones.html` (`cobrosBuscar`, `cobrosDetalle`).
Relacionado: ISSUE-059, ISSUE-055, GOTCHA #5, GOTCHA #80.
Estado: ✅ **RESUELTO** (2026-08-30).

---

### ISSUE-061: Caballos de prueba en `spcs` — el guard de 181 no es el padrón real

Detectado el **2026-08-29** (sale del relevamiento de ISSUE-055 §2).

`spcs` es una tabla **global sin `club_id`** (GOTCHA #13). Los ejemplares de prueba de
"Mi Club Hípico" viven ahí y **cuentan contra el padrón de Dolores**:

| id | nombre |
|---|---|
| `a37acadd-89e9-47ca-8741-1e8c871f196c` | Pampa Libre |
| `29fc7bef-7ec1-4f44-81b8-3baaf9de4d79` | Don Facundo |

Consecuencia: el **guard de sesión de `CLAUDE.md` (`SELECT count(*) FROM spcs` → 181)** incluye
caballos falsos. Sigue sirviendo para lo que se usa —detectar que uno se conectó al proyecto
equivocado— pero **no es el padrón real de Dolores**, y no hay que citarlo como tal. Ver GOTCHA #75.

`es_prueba` **no los toca**: es un flag de `reuniones`, y estos ejemplares no cuelgan de ninguna.
Limpiarlos es del mismo orden que `docs/PLAN_DUPLICADOS_SPC.md` y necesita saber antes si algún
`inscripciones`/`resultado_posiciones` los referencia.

Módulo: `spcs`. Estado: ⏳ **Abierto**. Prioridad: **Baja** — no mueve plata.

---

### ISSUE-062: El contador de reuniones de `index.html` incluye la reunión de prueba

Detectado el **2026-08-29**. Menor, anotado a pedido.

`index.html:238` cuenta las reuniones del club para el panel de `super_admin` sin excluir la
sandbox, así que dice **13** donde hay 12 reales. El contador de `secretario_carreras`
(`index.html:251`) **no** está afectado: filtra por año en curso y la 9999 es 2099.

Se dejó afuera del fix de ISSUE-055 a propósito: ese diff ya toca dos funciones de la pantalla de
pagos y no conviene desparramarlo por algo cosmético. El arreglo es una línea:
`.eq('es_prueba', false)`.

Módulo: `index.html`. Estado: ⏳ **Abierto**. Prioridad: **Cosmética**.

---

### ISSUE-063: `probe_pagos_rol_carrera.mjs` queda en 44/46 — se quedó sin datos que probar

Detectado el **2026-08-29**, en la regresión post-merge de ISSUE-055.

Dos asserts fallan, y **los dos son guardas de precondición funcionando como fueron diseñadas**:

```
❌ 1c) hay al menos un beneficiario con más de un rol (si no, el test no prueba nada)
❌ 2c) los beneficiarios sin ninguna carrera son incentivo de jockey y quedan rotulados
```

**No es una regresión.** Verificado:

- `rolDeLinea`, `etiquetaRoles` y `etiquetaCarreras` son **byte a byte idénticas** entre `323ad85`
  (pre-merge) y `3852eaf` (post-merge) — md5 de cada bloque comparado.
- El probe **no ejecuta** `cobrosBuscar`: arma la query por su cuenta y sólo extrae las tres
  funciones y el bloque de cache. El cambio de ISSUE-055 no lo alcanza.
- Los asserts frágiles que sí dependían del diff (regex del `.select`, bloque
  `CACHE MAPAS CARRERA`, distancia `cobCaballerizas`→`cobInscCarrera` ≤600) **pasan los tres**.

La causa es de datos: con R6 y R8 saldadas (2026-08-28), **el universo pagable de toda la base es
la reunión 9999 y nada más** — 8 beneficiarios, 36 líneas:

| apellido | tipo | concepto_tipo | n |
|---|---|---|---:|
| ACHINGO | entrenador | premio, incentivo_entrenador | 9 |
| ALDAY | entrenador | premio, incentivo_entrenador | 5 |
| ALDAY | entrenador | premio, incentivo_entrenador | 4 |
| ALDECOA | entrenador | premio, incentivo_entrenador | 6 |
| CAÑETE | jockey | premio, incentivo_jockey | 4 |
| FERRARI | jockey | premio, incentivo_jockey | 4 |
| GATICA | jockey | premio | 2 |
| IBARRA | jockey | premio, incentivo_jockey | 2 |

- **1c** necesita un beneficiario con más de un rol. Los 8 son mono-rol: 4 entrenadores, 4 jockeys,
  ninguno `tipo='ambos'`. El caso multi-rol vivía en R8, hoy en `pagado`.
- **2c** necesita un beneficiario cuyo set de carreras esté **vacío**. Los 3 `incentivo_jockey` del
  sandbox pertenecen a jockeys que **también** tienen líneas de premio con carrera, así que su
  tarjeta dice `C1, C2, C3 · + incentivo por reunión` y su set no está vacío.

Sacar del universo las 9 líneas de ACHINGO (las que estuvieron colgadas del recibo fantasma) deja
7 beneficiarios, igual de mono-rol: **los dos asserts ya venían fallando desde el saldado del
28/08**, antes de todo este trabajo.

**Qué NO hacer**: aflojar los asserts. La guarda "si no, el test no prueba nada" es correcta y es
lo único que impide que 1c y 2c den verde sin verificar nada.

**Fix propuesto**: `etiquetaRoles` y `etiquetaCarreras` son funciones puras — los datos sólo tienen
que **existir**, no ser pagables. Alimentar esos dos casos desde el universo completo
(sin `.eq('estado_linea','impago')`), donde R6/R8 sí tienen beneficiarios multi-rol, y dejar los
asserts que miden la pantalla contra el universo pagable. Alternativa peor: `skip` explícito con
motivo, que al menos no pinta rojo permanente.

Riesgo de no arreglarlo: un probe que vive en 44/46 es un probe que se aprende a ignorar, y
entonces deja de avisar cuando el rojo es de verdad.

Módulo: `tests/probe_pagos_rol_carrera.mjs`. Estado: ⏳ **Abierto**. Prioridad: **Media** — no hay
bug de producto detrás, pero es deuda de señal.

---

### ISSUE-064: El logo del club no se ve — `clubs.logo_url` apunta al host viejo y la CSP lo bloquea

Reportado por **Fede el 2026-08-30** ("no se ve el logo"), con la sospecha correcta: la migración a
dominio propio. El mecanismo, sin embargo, **no era el que parecía**.

`clubs.logo_url` de Dolores valía `https://mdqclio.github.io/SGH/logo-dolores-verde.png`. Esa URL
**seguía funcionando**: GitHub Pages mantiene un 301 al dominio nuevo preservando el path, y la
imagen respondía 200.

```
$ curl -s -o /dev/null -w '%{http_code} redir=%{redirect_url}' https://mdqclio.github.io/SGH/logo-dolores-verde.png
301 redir=https://sigh.com.ar/logo-dolores-verde.png
$ curl -s -o /dev/null -w '%{http_code} sz=%{size_download}' https://sigh.com.ar/logo-dolores-verde.png
200 sz=28957
```

Las 30 páginas llevan `img-src 'self' data: blob: https://*.supabase.co
https://raw.githubusercontent.com` (introducida en `b890f57`). Mientras el sitio vivía en
`mdqclio.github.io/SGH/`, ese host **era** `'self'`. Desde el pase a `sigh.com.ar` dejó de serlo y no
está en la allowlist → **el navegador cancela el pedido antes de emitirlo** y el 301 nunca se sigue.
`curl` no tiene CSP: sigue el redirect y devuelve la imagen. **No era un 404, era CSP.**

Afectaba 9 pantallas/documentos, todos por el mismo dato único: sidebar de `index.html`, carta de
llamados, `programa.html`, programa oficial B&N y color, recibo de Pagos, PDF de inscriptos, PDF de
ratificación y el preview de `admin.html`. El más silencioso era el recibo: `precargarLogo()`
(`liquidaciones.html:666-672`) espera `onload`/`onerror` con timeout de 1000 ms, así que con la CSP
bloqueando disparaba `onerror` al instante y el recibo salía sin logo, sin error y sin demora.

**Fix aplicado (2026-08-30)** — un `UPDATE` de una fila:

```sql
UPDATE clubs SET logo_url = 'https://sigh.com.ar/logo-dolores-verde.png'
WHERE id = '0649e9c5-9e87-4aad-842f-101458e6b33c';
```

Los otros dos clubes tenían `logo_url` NULL y quedaron así. **No se tocó la CSP**: agregar
`mdqclio.github.io` a `img-src` habría sido resolver el problema al revés.

Se verificó que `logo_url` no se consume fuera del navegador antes de descartar la ruta relativa:
`reunion-json` no lee `clubs` (sólo `hipodromos(id, nombre)`), y la columna no aparece en ninguna
vista, función ni otro Edge Function. La relativa sería viable e inmune a un futuro cambio de
dominio; se mantuvo la absoluta por decisión explícita. Costo de cambiarla algún día: `admin.html`
declara el campo como `<input type="url">`, que rechaza valores relativos.

En el mismo trabajo se limpió lo que quedaba apuntando al host viejo: los defaults de
`invite-user/index.ts` (`REDIRECT_URL` y `ALLOWED_ORIGINS` — hoy los tapa el env, verificado por
preflight CORS, pero un redeploy sin esas variables mandaba los mails de invitación al host viejo),
el hint del campo de logo en `admin.html` (ahora dice qué hosts acepta la CSP, para que San Francisco
no choque con lo mismo) y `README.md:13`.

**Confirmado por Fede en navegador el 2026-08-30**: el logo se ve.

Módulo: dato en `clubs` + `admin.html` + `supabase/functions/invite-user/index.ts`.
Diagnósticos: `docs/diagnosticos/2026-08-30_logo-roto-dominio.md` y `…_logo-fix-aplicado.md` (branch
`reports`). Lección de método: **GOTCHA #78**.
Estado: ✅ **RESUELTO** (2026-08-30).

---

### ISSUE-066: `switchTab` mapea botón→panel por POSICIÓN en un array literal

**Estado**: 🟡 ABIERTO — deuda técnica conocida, sin síntoma hoy. La solapa 📄 Recibos se agregó
al array (merge `82484e5`), así que el resaltado está bien; lo que queda es el refactor.
**Detectado**: 2026-08-30, al agregar la solapa 📄 Recibos (historial, opción B de ISSUE-056).

`liquidaciones.html`:

```javascript
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((b,i)=>b.classList.toggle('active',
    ['liquidaciones','cobros','recibos','resumen','comisiones'][i]===name));
  …
}
```

El resaltado del tab activo sale de cruzar el **índice del botón en el DOM** con un **array
literal de nombres**. Las dos listas tienen que estar en el mismo orden y nada lo verifica.

**Cómo falla**: alguien agrega un `<button class="tab">` y se olvida del array (o lo agrega al
final en vez de en la posición correcta). El panel abre bien —`switchTab` lo busca por
`id="panel-${name}"`, que es robusto— pero **el resaltado queda corrido**: se ve subrayada una
solapa distinta de la que estás mirando. No tira error, no rompe nada funcional, y es de las cosas
que se descubren en producción con alguien mirando la pantalla.

**Arreglo**: `data-tab` en el botón y leerlo de ahí.

```html
<button class="tab" data-tab="recibos" onclick="switchTab('recibos')">📄 Recibos</button>
```
```javascript
document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
```

Elimina la clase de bug para siempre y saca el array.

**Por qué NO se hizo ahora** (decisión explícita del 2026-08-30): tocar las cuatro solapas que ya
andan para agregar la quinta, a 20 días de la reunión, es la mejora que rompe algo. Se agregó la
solapa al array —cambio mínimo, una palabra— y queda anotado el refactor. Va cuando no haya una
reunión encima.

Módulo: `liquidaciones.html`. El mismo patrón conviene revisarlo en otros módulos con solapas.
