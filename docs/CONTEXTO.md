# SGH — Contexto del Proyecto

## Qué es SGH
Sistema de Gestión Hípica — software SaaS para hipódromos argentinos que digitaliza y automatiza toda la operación de la secretaría de carreras.

## Para quién
Desarrollado para Fede (amigo de Leonardo), quien lo venderá como producto a hipódromos clientes. Primer cliente piloto: Hipódromo de Dolores (HDO), Buenos Aires.

## Qué problema resuelve
- Elimina el trabajo manual de la secretaría de carreras
- Centraliza la información hípica
- Permite inscripciones online a propietarios y entrenadores
- Genera documentos oficiales (carta de llamados, programa, inscriptos)
- Administra liquidaciones de premios
- Comparte información entre hipódromos (sanciones, SPCs, profesionales)

## Alcance del sistema
1. Reunión hípica → Carta de llamados → Inscripciones → Ratificación → Programa → Resultados → Liquidaciones
2. Base de datos: SPCs, propietarios, caballerizas, jockeys, entrenadores
3. Sanciones compartidas entre hipódromos
4. Portal de auto-registro para propietarios/entrenadores
5. API futura con Stud Book nacional

## Usuarios y roles
- **super_admin**: Leonardo/Fede — gestiona todos los hipódromos
- **secretario_carreras**: operador del hipódromo cliente
- **operador**: carga de datos secundario
- **profesional**: entrenador con portal propio (global)
- **propietario**: dueño de caballeriza con portal propio (global)
- **publico**: solo lectura, sin login
