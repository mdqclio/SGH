# SGH — Estado del Deploy

## Producción: https://mdqclio.github.io/SGH/

## Funcionando correctamente
- Login y recuperación de contraseña
- Dashboard con calendario y estadísticas
- Panel admin para gestión de hipódromos
- Alta de nuevos hipódromos (registro.html)
- Reuniones: CRUD con 7 estados
- Carta de llamados: turnos, bonos, premios, publicar/bloquear
- Inscripciones: buscador SPCs, jockey titular/suplente, peón/capataz/sereno
- Ratificación: inscripto ↔ ratificado, forfait
- Programa hípico con PDF
- Stud Book, profesionales, jockeys, propietarios, caballerizas
- Sanciones compartidas, resoluciones
- Gestión de usuarios por hipódromo
- Calendario anual de reuniones
- PWA instalable

## En desarrollo
- Resultados: rediseñado, sin testing completo de oficialización
- Carta de llamados: diseño final del PDF en ajuste
- PDF de inscriptos: comparando con modelo Palermo

## No funciona
- Liquidaciones: UI existe pero lógica no implementada

## Pendiente de construir
- Portal propietarios/entrenadores (portal.html)
- Auto-registro de profesionales (registro-profesional.html)
- API con Stud Book nacional (en gestión de acceso)
- Emails automáticos (pendiente Resend/SendGrid)
- RLS por club_id

## Clientes activos
| Hipódromo | Sigla | Estado | club_id |
|---|---|---|---|
| Hipódromo de Dolores | HDO | Piloto activo | 0649e9c5-9e87-4aad-842f-101458e6b33c |

## Datos de prueba en Dolores
- 5 reuniones (enero-mayo 2026)
- 11 carreras en reunión 5
- SPCs, jockeys y entrenadores de prueba cargados
