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
- **Admin "Mi Hipódromo"** (19/05/2026): ABM de Comisión de Carreras, Sponsors y Comisariato (club-level). Campos disclaimer_importante, disclaimer_nota, redes sociales (website/instagram/facebook/tiktok/twitter_x/youtube). Rol admin-de-hipódromo puede editar sus propios datos (no requiere super_admin).
- **Carta de llamados** (19/05/2026): rediseño completo del PDF estilo Dolores — cajas de carrera con caption de categoría, bono inline en rojo, bloques de novedades editables (textarea con auto-save), disclaimers, fechas operativas, secretaría con redes sociales, logos de sponsors.
- **Apuestas por carrera** (19/05/2026): `carreras.apuestas TEXT[]`. Modal 🎯 Apuestas en programa.html muestra lista de inputs por carrera — guardado bulk vía Promise.all. Las apuestas combinadas fueron descartadas.
- **Reunión activa centralizada** (19/05/2026): `sgh_active_reunion_id` en localStorage. programa.html y otras pantallas operativas usan este valor; si no existe, saltan a la próxima reunión por fecha. Fijable desde reuniones.html con botón 📍 Activar.
- **RLS multi-tenant por club_id** — 26 tablas endurecidas, aislamiento cross-club verificado, ISSUE-017 cerrado (14/05/2026)
- **Sistema de auditoría** — UI completa con paginación, filtros, diff visual, export CSV (12/05/2026)

## En desarrollo
- Resultados: rediseñado — pendiente testing manual end-to-end por Fede (checklist en PLAN_LIQUIDACIONES.md)
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

---

## Snapshot — 19/05/2026 (cierre de sesión)

**Reunión activa**: Reunión 5 — 17/5/2026 — Hipódromo de Dolores (11 turnos). Fijada en localStorage.

**Validación de Fede**: pendiente en producción.

**Schema relevante** (columnas nuevas o eliminadas en esta sesión):
- `clubs.comision_carreras` JSONB DEFAULT '[]' — board del hipódromo.
- `clubs.sponsors` JSONB DEFAULT '[]' — sponsors para carta de llamados.
- `clubs.comisariato` JSONB DEFAULT '[]' — stewards (movido de reuniones a clubs en refactor).
- `clubs.disclaimer_importante`, `clubs.disclaimer_nota` TEXT — textos legales en carta.
- `clubs.website`, `clubs.instagram`, `clubs.facebook`, `clubs.tiktok`, `clubs.twitter_x`, `clubs.youtube` TEXT.
- `reuniones.fechas_inscripciones`, `reuniones.fechas_forfaits`, `reuniones.fechas_compromiso_montas` TEXT.
- `carreras.apuestas` TEXT[] DEFAULT '{}' — apuestas habilitadas por carrera.
- `carreras.numero_carrera_programa` INTEGER — orden post-ratificación.
- ELIMINADAS: `clubs.apuestas_simples`, `reuniones.apuestas_combinadas`, `reuniones.comisariato`.

**Archivos modificados en esta sesión**:
- admin.html (ABM comisión, sponsors, comisariato, disclaimers, redes; acceso para admin-de-hipódromo)
- carta-llamados.html (rediseño completo PDF, novedades editables)
- programa.html (modal apuestas por carrera, modal comisión read-only, reunión activa en localStorage)
- reuniones.html (hora_cierre_ratificacion, fechas operativas; eliminadas apuestas_combinadas y comisariato)

---

## Snapshot — 16/05/2026 (cierre de sesión)

**Reunión activa**: Reunión 5 — 17/5/2026 — Hipódromo de Dolores (11 turnos).

**Validación de Fede**: pendiente en producción. Sesión cerrada con feature-complete según interpretación de las directivas iterativas (WhatsApp + audios).

**Schema relevante** (estado actual de tablas tocadas):
- `carreras.estado`: nullable, default 'programada'. Valores en uso: NULL/'programada' (ABIERTA), 'confirmada' (CERRADA), 'anulada' (ANULADA), 'reabierta' (legacy, tratado como anulada en algunos lugares).
- `carreras.condicion_adicional`: usado para "Peso del jockey".
- `carreras.numero_carrera_programa`: INTEGER nullable, para asignar orden post-ratificación.
- `carreras.hora_estimada`: TIME nullable.
- `carreras.categoria_id`: FK a `categorias_carrera` (4 cats por club: OC, ONC, NO, CC).
- `reuniones.observaciones`: text, se renderiza en pie del PDF.

**Archivos modificados en esta sesión**:
- ratificacion.html (mayor parte de los cambios)
- carta-llamados.html (label del peso jockey)
- inscripciones.html (estado 'confirmada' en select)
- programa.html (no se tocó hoy)
