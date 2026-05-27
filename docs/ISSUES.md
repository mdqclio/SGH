# SGH — Bugs, Issues y Deudas Técnicas

## CRÍTICOS

### ISSUE-001: Liquidaciones — motor de cálculo
Descripción: liquidaciones.html — motor de cálculo de premios y recibos
Módulo: liquidaciones.html
Estado: 🔄 En progreso — 2/4 bloques completos (14/05/2026)
- ✅ Bloque A: schema fixes + resultados (14/05/2026)
- ✅ Bloque B: motor de cálculo completo — 11 liquidaciones generadas vs. data sintética (14/05/2026)
- ⏳ Bloque C: montas perdidas + incentivo entrenador (próxima sesión)
- ⏳ Bloque D: recibos imprimibles + resumen de reunión
Prerequisito Bloque C: testing manual de Fede en resultados.html + correr generarLiquidaciones() contra reunión real de Dolores

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
