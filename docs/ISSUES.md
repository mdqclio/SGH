# SGH — Bugs, Issues y Deudas Técnicas

## CRÍTICOS

### ISSUE-001: Liquidaciones no funciona
Descripción: liquidaciones.html existe pero no implementa cálculo de premios ni genera recibos
Módulo: liquidaciones.html
Estado: Pendiente rediseño completo

### ISSUE-002: RLS sin configurar por club
Descripción: Cualquier usuario autenticado puede leer/escribir datos de cualquier hipódromo
Módulo: Backend Supabase — todas las tablas
Estado: ✅ RESUELTO (12/05/2026) — RLS implementada en 17 tablas. Aislamiento cross-club verificado. Ver SECURITY.md y migrations/2026-05-12-rls.sql. Quedan 8 tablas residuales (ver ISSUE-017).

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
Estado: Pendiente — próxima sesión de seguridad

### ISSUE-018: XSS escape pass pendiente
Descripción: Varios módulos usan template literals con `${variable}` dentro de `innerHTML` sin escapar. Un valor de DB con `<script>` o `"` puede ejecutar JS arbitrario en el browser del usuario.
Solución: Agregar `escapeHtml()` (reemplaza &, <, >, ", ') en todos los templates literales que van a innerHTML con datos de usuario.
Estado: Pendiente — recorrer todos los módulos HTML

### ISSUE-019: Auditoría extendida pendiente
Descripción: Los triggers de auditoría cubren 8 tablas (reuniones, carreras, inscripciones, resultados, liquidaciones, clubs, usuarios, categorias_carrera). Quedan sin auditar: caballerizas, resoluciones, hipodromos, propietarios, profesionales, spcs, sanciones.
Estado: Pendiente — agregar triggers de auditoría una vez que la RLS de esas tablas esté endurecida
