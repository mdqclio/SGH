# SGH — Bugs, Issues y Deudas Técnicas

## CRÍTICOS

### ISSUE-001: Liquidaciones no funciona
Descripción: liquidaciones.html existe pero no implementa cálculo de premios ni genera recibos
Módulo: liquidaciones.html
Estado: Pendiente rediseño completo

### ISSUE-002: RLS sin configurar por club
Descripción: Cualquier usuario autenticado puede leer/escribir datos de cualquier hipódromo
Módulo: Backend Supabase — todas las tablas
Estado: Deuda técnica aceptable en fase piloto con 1 cliente
Solución: Implementar políticas RLS con auth.uid() vinculado a club_id

## ALTOS

### ISSUE-003: PDF inscriptos no similar al modelo Palermo
Descripción: Falta columnas orden partidor + alfabético/gatera, bolsa por carrera, indicadores H y punto negro
Módulo: inscripciones.html
Estado: En progreso

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
Estado: Workaround con mix-blend-mode pendiente

### ISSUE-009: Emails no implementados
Estado: Pendiente Resend/SendGrid

## BAJOS

### ISSUE-010: Credenciales hardcodeadas
Estado: Aceptable para MVP

### ISSUE-011: Sin rate limiting en login
Estado: Pendiente
