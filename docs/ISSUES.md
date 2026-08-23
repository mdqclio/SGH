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
- Correr el teardown de 9999 antes del 20/6 (`teardown_prueba_resumen_9999.sql`).
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
Descripción: la reunión 9999 (datos de prueba) sigue viva; su teardown está **gateado a que Fede termine las pruebas de pagos**. Correr `teardown_prueba_resumen_9999.sql` cuando libere.
Módulo: datos de prueba. Estado: ⏳ Abierto (gated). Prioridad: Media.

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
