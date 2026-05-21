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

## Flujo de trabajo
- No hay entorno local ni build: todo el proyecto es HTML estático servido por GitHub Pages desde la rama main.
- Cada cambio se commitea y pushea directo a main; el deploy es automático y tarda 30-60 segundos.
- La validación se hace siempre en producción: mdqclio.github.io/SGH/ con refresh.
- Backend: Supabase (proyecto unlhcuanfrtpatoipwve). Cambios de schema/policies/funciones se aplican manualmente vía SQL Editor del panel de Supabase. Documentar el SQL ejecutado en la sesión correspondiente (docs/SESION_YYYY-MM-DD.md).
- Cliente piloto único hoy: Hipódromo de Dolores. Probar contra reuniones de Dolores.

## Reunión activa (actualizado 20/05/2026)

Las pantallas operativas (programa.html, carta-llamados.html, etc.) usan un concepto de "reunión activa" para no requerir parámetro en URL en cada salto. La prioridad de resolución es:

1. `?reunion_id=UUID` en la URL (explícito, máxima prioridad)
2. `localStorage.getItem('sgh_active_reunion_id')` (persistido entre sesiones)
3. Próxima reunión con fecha ≥ hoy del club del usuario (fallback automático)

El usuario puede fijar la reunión activa desde **reuniones.html** con el botón 📍 **Activar**, que escribe el UUID en localStorage bajo la clave `sgh_active_reunion_id`. Esto permite a la secretaría trabajar en una reunión específica sin necesidad de navegar por URL.

La lógica está centralizada en **`active-reunion.js`** (helper global `window.ActiveReunion`). Incluido en todas las pantallas operativas. Métodos: `.resolve(sb, clubId)` → UUID | null, `.set(id)`, `.clear()`.

## Hipódromo activo para super_admin (20/05/2026)

El `super_admin` no tiene `club_id` propio. Para que pueda operar en un hipódromo específico, **`club-switcher.js`** inyecta un dropdown en el topbar de todas las páginas operativas/de gestión. El hipódromo seleccionado se persiste en `localStorage.sgh_selected_club_id`. Al cambiar de hipódromo se borra `sgh_active_reunion_id`. Visible solo para `rol === 'super_admin'`.

## Archivos JavaScript compartidos

| Archivo | Propósito | Incluido en |
|---|---|---|
| `active-reunion.js` | Helper `window.ActiveReunion` — resuelve/persiste reunión activa | programa, carta-llamados, inscripciones, ratificacion, resultados, liquidaciones |
| `club-switcher.js` | Dropdown de hipódromo para super_admin, inyectado en topbar | 16 páginas operativas/de gestión |

## Páginas de impresión standalone

| Página | Propósito | Auth |
|---|---|---|
| `programa-oficial.html` | Programa estilo manual de Dolores: newsprint B&N, 8 columnas por carrera, sponsors, pie institucional | No (pública) |
| `carta-llamados.html` | Carta de llamados con cajas de carrera, novedades, disclaimers | No (pública) |
