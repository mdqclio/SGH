# SGH — Decisiones Arquitectónicas (ADR)

## ADR-001: Stack vanilla HTML/JS
Decisión: HTML + CSS + JS vanilla, sin frameworks
Justificación: Cero build process, Claude Code puede mantenerlo, compatible con GitHub Pages

## ADR-002: GitHub Pages como hosting
Decisión: GitHub Pages
Justificación: Gratis, deploy automático en push

## ADR-003: Archivos HTML autocontenidos
Decisión: Cada módulo es un HTML con CSS y JS inline
Justificación: Independiente, fácil de debuggear, sin servidor

## ADR-004: SPCs y propietarios globales (ACTUALIZADO may-2026)
Decisión: Solo SPCs y propietarios sin club_id obligatorio
Justificación: Un caballo/propietario puede estar en múltiples hipódromos — el Stud Book es nacional
CORRECCIÓN: entrenadores REMOVIDOS de esta lista. Tienen hipodromo_patente igual que jockeys.

## ADR-005: Jockeys por hipódromo
Decisión: Jockeys con club_id obligatorio
Justificación: La patente de jockey la otorga cada hipódromo individualmente

## ADR-006: Estados simplificados de inscripción
Decisión: Solo 3 estados: inscripto → ratificado → forfait
Justificación: Refleja el flujo real del hipódromo (validado con Fede)

## ADR-007: Legacy Supabase anon key
Decisión: Usar key eyJ... NO sb_publishable_...
Justificación: La nueva key da error 400 en consultas REST. Verificado en producción.

## ADR-008: Carta de llamados se bloquea al publicar
Decisión: estado=publicada bloquea edición en la UI
Justificación: Documento oficial — cambios post-publicación serían irregulares

## ADR-009: RLS permisivo en desarrollo
Decisión: Policy allow_all durante desarrollo
Deuda técnica: Implementar RLS por club_id cuando haya múltiples clientes pagando

## ADR-011: Modelo relacional caballeriza_responsables (may-2026)
Decisión: tabla caballeriza_responsables en lugar de campo texto "responsable"
Justificación: permite propietario + N copropietarios con datos personales completos (DNI, fecha nac, localidad). El campo "responsable" se conserva como texto denormalizado autogenerado para búsquedas y display rápido.
Deuda V2: migrar el DELETE+INSERT desde JS a una función Postgres para atomicidad.

## ADR-012: 3 estados (activo/inactivo/baja) en profesionales, propietarios y caballerizas (may-2026)
Decisión: campo estado VARCHAR(20) DEFAULT 'activo' reemplaza funcionalmente al booleano activo
Justificación: "inactivo" = baja temporal (sin bloqueo), "baja" = baja definitiva (oculto del sistema). El booleano activo se mantiene sincronizado para retrocompatibilidad con código legacy.

## ADR-013: Estado mal_inscrito en inscripciones (may-2026)
Decisión: agregar 'mal_inscrito' al ENUM estado_inscripcion
Justificación: permite registrar caballos fuera de condición del turno sin bloquear la operatoria. La secretaria puede inscribir con advertencia visual.
Implementación: ALTER TYPE estado_inscripcion ADD VALUE 'mal_inscrito' (no migrar a VARCHAR).

## ADR-014: Eliminación de caballerizas-propietarios.html (may-2026)
Decisión: eliminar el archivo legacy con tabs y consolidar en caballerizas.html
Justificación: propietarios.html es el módulo separado para propietarios. La pantalla combinada era inconsistente con el modelo relacional nuevo.

## ADR-015: Chaquetilla en Supabase Storage (may-2026)
Decisión: bucket público "chaquetillas" con UUID como filename
Justificación: imágenes servidas directamente desde CDN de Supabase, sin costo de servidor. La URL pública se guarda en caballerizas.chaquetilla_url.

## ADR-016: DNI con punto de miles en UI (may-2026)
Decisión: formatDNI() / parseDNI() en los 4 módulos de registro
Justificación: DNI argentino se muestra con punto de miles (12.345.678) pero se guarda sin puntos en DB. DEUDA: CUIT debería usar formato XX-XXXXXXXX-X (guiones), no puntos.

## ADR-010: Montos en DB sin formato, UI en formato argentino
Decisión: Guardar números DECIMAL planos en Postgres. En UI mostrar siempre $1.234.567,89 (punto miles, coma decimal, 2 decimales fijos).
Funciones: formatMonto() y parseMonto() en SNIPPETS.md.
Inputs: type="text" con clase monto, normalización en blur.
