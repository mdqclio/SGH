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

## ADR-004: SPCs y entrenadores globales
Decisión: SPCs, propietarios y entrenadores sin club_id obligatorio
Justificación: Un caballo puede correr en múltiples hipódromos — el Stud Book es nacional

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

## ADR-010: Montos como DECIMAL en DB, puntos en UI
Decisión: Guardar números sin formato, mostrar con puntos para miles
Funciones: formatMonto() y parseMonto()
