# SGH — Estado del Deploy

## Producción: https://mdqclio.github.io/SGH/

## Funcionando correctamente
- Login y recuperación de contraseña
- Dashboard con calendario y estadísticas
- Panel admin para gestión de hipódromos
- Alta de nuevos hipódromos (registro.html)
- Reuniones: CRUD con 7 estados
- Carta de llamados: turnos, bonos, premios, publicar/bloquear
- Inscripciones: buscador SPCs, jockey titular/suplente, peón/capataz/sereno, estado mal_inscrito, marcar carrera reabierta/anulada. Header compacto, dropdown Estado inline, contador inscriptos.
- PDF inscriptos estilo Palermo: CSS columns 4-col, bloques por turno, condición abreviada, banda REABIERTA, lista alfabética con (H) y ●, matriz consolidada ORDEN DE LARGADA al pie. 2 páginas A4 landscape.
- Ratificación (ratificacion.html) — feature-complete (15/05/2026):
  - Columnas separadas: SPC | Caballeriza | Jockey | Peso | Estado | Acciones
  - Jockey editable inline: select con suplente como primera opción, XX en rojo si NULL, save on change, actualiza botón Ratificar sin re-render
  - Tercer estado `mal_inscrito`: botón ⚠, modal compartido con forfait, badge naranja, excluido del contador de activos
  - Barra de navegación por turnos: botones numéricos, click expande + colapsa otros + scroll suave
  - Validación bloqueante al ratificar: requiere jockey_titular_id
  - Cierre por hora: campo `reuniones.hora_cierre_ratificacion TIME DEFAULT '12:00:00'`. Badge ABIERTA/CERRADA. Cuando cerrada: UI read-only completa.
  - Congelamiento de peso: al cargar reunión cerrada, copia peso_declarado → peso_final para ratificadas sin peso_final
  - Alerta de colisión de jockey: filas con mismo jockey en carrera se marcan ⚠ dup. (visual, no bloqueante)
  - `motivo_forfait` renombrado a `motivo_estado` en DB y frontend (inscripciones.html, portal.html, ratificacion.html)
- Programa hípico (programa.html) — Bloque D sub-tanda 1 completa (15/05/2026):
  - Solo inscripciones ratificadas. Columnas: # | SPC | Caballeriza | Propietario | Entrenador | Jockey | Peso | Últimas 5 performances
  - Header con logo (si existe), nombre hipódromo, número y fecha de reunión
  - Condiciones crudas por carrera (sin composer — D.2)
  - Bolsa y distribución de premios por puesto
  - CSS @media print A4 landscape. Pendiente: D.2 (composer), D.3 (logo configurable), D.4 (postponed/H)
- Stud Book, profesionales, jockeys, propietarios, caballerizas (con modelo relacional de responsables)
- Sanciones compartidas, resoluciones
- Gestión de usuarios por hipódromo
- Calendario anual de reuniones
- PWA instalable
- **RLS multi-tenant por club_id** — 26 tablas endurecidas, aislamiento cross-club verificado, ISSUE-017 cerrado (14/05/2026)
- **Sistema de auditoría** — UI completa con paginación, filtros, diff visual, export CSV (12/05/2026)

## En desarrollo
- Resultados: rediseñado — pendiente testing manual end-to-end por Fede (checklist en PLAN_LIQUIDACIONES.md)
- Carta de llamados: diseño final del PDF en ajuste; falta Carrera→Turno en PDF
- Liquidaciones: Bloques A (schema fixes + resultados) y B (motor de cálculo) completos (14/05/2026). Motor ejecutado vs. data sintética: 11 liquidaciones generadas, montos verificados. Pendiente: testing Fede → correr contra reunión real de Dolores → Bloque C (montas perdidas)

## Pendiente de construir
- Portal propietarios/entrenadores (portal.html)
- Auto-registro de profesionales (registro-profesional.html)
- API con Stud Book nacional (en gestión de acceso)
- Emails automáticos (pendiente Resend/SendGrid)
- Selector de hipódromo para super_admin sin club_id

## Clientes activos
| Hipódromo | Sigla | Estado | club_id |
|---|---|---|---|
| Hipódromo de Dolores | HDO | Piloto activo | 0649e9c5-9e87-4aad-842f-101458e6b33c |

## Datos cargados en Dolores (sesión may-2026)
- 5 reuniones (enero-mayo 2026)
- 11 carreras en reunión 5
- 7 jockeys (Dolores)
- 77 entrenadores (Dolores)
- 201 caballerizas
- 219 responsables de caballerizas (38 vinculados con profesional_id por DNI matching, 16 copropiedades)
- SPCs y entrenadores de prueba cargados

## Datos de validación PDF (reunión 5 Dolores — may-2026)
- Los 11 turnos poblados con ~81 inscripciones en total (distribución random)
- Turno 1: 11 inscriptos, condicion_sexo='ambos', nombre='Premio Apertura'
- Dourada: sexo='hembra' para validar el indicador (H) en carrera mixta
- Todos los inscriptos de turno 1: certificado_correr=false (validación del ●)
- numero_partidor asignado aleatoriamente 1-16 por carrera, sin repetir dentro de la misma carrera
- hipodromos.cantidad_gateras = 16 para Dolores (cargado por SQL)

## Limpieza pendiente (datos de prueba en Dolores)
- 9 caballerizas extra detectadas
- 14 profesionales extra detectados
- 7 propietarios de prueba detectados
- Todos identificados pero no borrados (esperar UI de baja)
