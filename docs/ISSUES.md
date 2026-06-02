# SGH — Bugs, Issues y Deudas Técnicas

## CRÍTICOS

### ISSUE-001: Liquidaciones C+D — motor de cálculo, fondo, bonos, incentivos y recibos
Descripción: liquidaciones.html — motor de premios + capa de cobro (recibos)
Módulo: liquidaciones.html · Branch: `feat/liquidaciones-cd`
Estado: 🔄 En progreso — Fase 0/1/2 hechas (Fase 0 en prod; 1 y 2 solo en branch) (02/06/2026)

HECHO (en branch, salvo donde se aclara):
- ✅ Bloque A: schema fixes + resultados (14/05/2026)
- ✅ Bloque B: motor de cálculo (reparto directo 70/10/10/4/3/1) (14/05/2026)
- ✅ Fase 0: schema C+D — 5 ENUMs, `liquidacion_config`/`club_secuencias`/`recibos`, 10 columnas en `liquidacion_detalle`, `fn_siguiente_recibo`, RLS+auditoría, seed Dolores. **VIGENTE en prod** (`migrations/liquidaciones_cd_fase0.sql`).
- ✅ Fase 1: % de reparto e incentivos por club desde `liquidacion_config`.
- ✅ Fase 2: fondo solidario 2% al club + bono 6-8 (100% propietario, neto) + incentivos jockey/entrenador. Probe `tests/probe_fase2_liquidaciones.mjs`.
- ✅ Fix detección de empate (02/06/2026): la detección agrupaba por `posicion` duplicada (`byPos`), que **nunca** ocurre (constraint `UNIQUE (resultado_id, posicion)`); el dead-heat se modela como posiciones distintas consecutivas con `empate=true`. La rama empate-aware era código muerto → **los empates de PREMIO no se promediaban** (cada uno cobraba el premio de su posición física en vez de `Σ/N`). Ahora se agrupan corridas consecutivas con `empate=true` y se promedia premio y bono. Probe: checks C2 (empate bono) + C3 (empate premio). Ver GOTCHA #45.

PENDIENTE:
- ⏳ Fase 2bis: botón "Oficializar reunión" (setea `resultados.estado='oficial'` en bloque; sin schema).
- ⏳ Fase 3: estados de línea (impago/pagado/retenido) + retención anti-doping 1°/2° (~30 días, ADR-047) + idempotencia de regeneración.
- ⏳ Fase 4: recibos por persona on-demand (capa `recibos`, numeración con `fn_siguiente_recibo`, forma de pago/cobrador).
- ⏳ Fase 5: resumen de reunión (total pagado + pendientes de cobro).
- ⏳ Fase 6: validar A+B contra datos reales de R5.
- ⏳ **propietario_id null en inscripciones (bloqueante para liquidación real):** 0/87 inscripciones tienen `propietario_id` y `spc_propietarios` está vacía → no se liquida el propietario (70%) ni el bono 6-8. NO es bug del motor (lee `insc.propietario_id`, el campo correcto). Fix upstream en 2 partes: (1) poblar `spc_propietarios` (Stud Book), (2) setear `inscripciones.propietario_id` al inscribir/ratificar (auto desde el dueño activo). Decisión pendiente: ¿agregar además fallback de código en el generador (resolver dueño vía `spc_id → spc_propietarios`)? — solo útil tras (1). Ver GOTCHA #47.
  - **Verificación a fondo (02/06/2026):** confirmado que NINGÚN flujo escribe `propietario_id`. Barrido de todo el repo de `from('inscripciones').insert/.update/.upsert`: payloads con campos explícitos (sin spreads ni alias `propietario/dueño/owner`); `inscripciones.html` (insert L638) y los UPDATE de `ratificacion.html` no lo tocan; el form de inscripción NO tiene campo de dueño. Único setter: `portal.html:574` (rol propietario), portal sin construir → 0 filas (`canal='web'`: 0/87). No hay trigger/RPC server-side (ninguna migración; y si existiera, las 87 reales lo tendrían). Las 87 son carga manual real por UI (`canal='manual'` 87/87, `created_at` repartido 27/04→23/05), NO seeds → el 0/87 es lo que produce el flujo, no casualidad. **Hay que AGREGAR la captura/derivación al inscribir/ratificar; el fix se planea aparte.**

DECISIONES (Fede):
- ✅ **Bono 6-8 + empate — CONFIRMADO (02/06/2026):** se paga, 100% propietario, neto; monto/rango configurables (`bono_posicion_monto`, `bono_posicion_desde/hasta`). Empate (principio Fede "50% c/u" + convención dead-heat "el grupo toma la posición del líder"): grupo comparte **un** bono dividido `monto/N` (2 → 50% c/u); empate de premio promediado `Σ/N`; cruce de borde (5°-6°) → grupo es "5°" → sin bono; bono al ganador en empate de 1° → repartido vía el promedio (mitad c/u). Probe C2/C3. **Sigue gateado por `propietario_id` NULL (GOTCHA #47): no paga nada hasta poblar el dueño.**
- ⚠️ **Limitación técnica conocida (no es decisión de producto):** empates adyacentes sin caballo limpio en medio se fusionan en un grupo (modelo `empate=true` con un solo booleano; requeriría `grupo_empate_id`). Rarísimo. Ver GOTCHA #45.
- Montos de incentivo jockey/entrenador (hoy 0 en `liquidacion_config` → no se generan líneas).
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
Estado: ⏳ Documentado, fix NO implementado. Fix conceptual: renombrar el `id` del modal (`f-caballeriza-form`), apuntar populate (L329) / openModal (L446) / saveRecord (L484) al select del modal; ídem `f-sexo`. Agregar probe de la captura.

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
