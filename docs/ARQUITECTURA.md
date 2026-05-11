# SGH — Arquitectura

## Estructura de archivos
Cada módulo es un archivo HTML autocontenido con CSS y JS inline. No hay build process. Se despliega directamente en GitHub Pages.

## Convenciones de naming
- Archivos HTML: minúscula kebab-case. CRÍTICO: GitHub Pages es case-sensitive
- Variables JS: camelCase
- Tablas Supabase: snake_case
- IDs: UUID generados por Supabase

## Patrón de cada archivo HTML
1. DOCTYPE + meta + title
2. Google Fonts link
3. Supabase CDN script
4. style (CSS inline)
5. body con HTML
6. script con: SUPABASE_URL, SUPABASE_KEY, CLUB_ID, createClient, initAuth(), lógica del módulo

## Colores del sistema
--verde: #0e2318 / --verde-mid: #163520 / --verde-card: #1a3d26
--verde-borde: #245033 / --oro: #c9a84c / --oro-suave: #e8d5a3
--crema: #f5f0e8 / --gris: #8a9e90

## Tipografía
- Títulos: Playfair Display (serif)
- Cuerpo: DM Sans (sans-serif)

## Accesos y credenciales
- SUPABASE_URL: https://unlhcuanfrtpatoipwve.supabase.co
- SUPABASE_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVubGhjdWFuZnJ0cGF0b2lwd3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MjQ0OTcsImV4cCI6MjA5MjMwMDQ5N30.rKb8BI7fBQcRdyyyxVfBOZbtCmGYKIMLUDLVmkn1SYM
- CLUB_ID Dolores: 0649e9c5-9e87-4aad-842f-101458e6b33c
- CLUB_ID prueba: a6da7e40-1515-45dc-8933-4eef33ce937a
- CRÍTICO: Usar siempre la key eyJ... NO la sb_publishable_...

## Usuarios de producción
- Super admin: admin@sgh.com / rol: super_admin
- Dolores: dolores@sgh.com / rol: secretario_carreras

## Flujo de auth
1. signInWithPassword con Supabase Auth
2. Consultar tabla usuarios: .select('club_id, nombre_completo, rol')
3. super_admin → admin.html
4. secretario_carreras con club_id → index.html
5. propietario/profesional → portal.html (pendiente)

## CRÍTICO: nombre_completo
La tabla usuarios tiene nombre_completo NO nombre.
Usar SIEMPRE: .select('club_id, nombre_completo, rol')

## Archivos eliminados (sesión may-2026)
- `caballerizas-propietarios.html` — legacy con tabs Caballerizas+Propietarios. Reemplazado por `caballerizas.html` como pantalla estándar. index.html actualizado.

## Refactorizaciones grandes (sesión may-2026)
- **caballerizas.html**: modelo relacional de responsables (caballeriza_responsables), chaquetilla con upload a Storage, 3 estados (activo/inactivo/baja), hipódromo otorgante, sin campo domicilio en UI.
- **jockeys.html**: 5 categorías nuevas (VARCHAR), sin pesos, hipódromo otorgante, 3 estados, chip Inactivos, formatDNI.
- **profesionales.html**: 3 estados, formatDNI.
- **propietarios.html**: 3 estados, formatDNI.
- **inscripciones.html**: 9 columnas en tabla, condición en dropdown (condicion_handicap), sereno en celda, jockey suplente separado, estado mal_inscrito, marcar carrera reabierta/anulada.
- **carta-llamados.html**: rótulo CARRERA → TURNO en UI y PDF.
