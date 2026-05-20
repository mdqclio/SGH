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

## ADR-009: RLS permisivo en desarrollo (SUPERADO — ver ADR-020)
Decisión: Policy allow_all durante desarrollo
Deuda técnica: ✅ IMPLEMENTADA (12/05/2026) — ver ADR-020 y SECURITY.md

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

## ADR-017: PDF de inscriptos estilo Palermo con matriz consolidada (may-2026)
Decisión: rediseñar printInscriptos() para replicar el formato visual del Hipódromo de Palermo: bloques compactos por carrera en CSS columns + una sola matriz "ORDEN DE LARGADA" al pie del documento.
Justificación: convención de hipódromos argentinos; una tabla consolidada es más legible que N mini-tablas por carrera; permite cruzar nombre (posición alfabética) con gatera de un vistazo. La condición técnica abreviada (ej: "Prod.2a.perd 800 mts") compone datos estructurados de la carrera, no el texto libre de condicion_handicap.

## ADR-018: cantidad_gateras como atributo del hipódromo (may-2026)
Decisión: campo hipodromos.cantidad_gateras INTEGER DEFAULT 12
Justificación: la cantidad de gateras físicas es una propiedad estable de la instalación, no de la reunión ni de cada carrera. Default 12 para nuevos hipódromos. Dolores: 16. El PDF de inscriptos lo usa para dimensionar las filas de la matriz ORDEN DE LARGADA.
Consecuencia: al dar de alta un hipódromo nuevo hay que setear cantidad_gateras manualmente hasta que se agregue al formulario de registro.html.

## ADR-019: PDF de inscriptos en 2 páginas A4 landscape (may-2026)
Decisión: aceptar que el PDF ocupe 2 páginas: página 1 = bloques de carrera (CSS columns 4-col), página 2 = matriz ORDEN DE LARGADA + footer leyenda.
Justificación: meter todo en 1 página requería bajar fuentes por debajo de 7pt, sacrificando legibilidad. 2 páginas es el balance correcto entre compactación y lectura sin lupas.
Alternativa rechazada: column-count: 5 + suprimir la matriz.

## ADR-020: RLS de Postgres en lugar de filtrado solo en JS (12/05/2026)
Decisión: Implementar Row Level Security en Postgres como capa de seguridad primaria
Justificación: Defensa en profundidad — el filtrado solo en JS es bypasseable si alguien obtiene la anon key. RLS garantiza aislamiento incluso con acceso directo a la API de Supabase. Necesario para onboardear múltiples hipódromos sin riesgo de fuga cross-club.
Consecuencia: Todas las queries del cliente siguen funcionando sin cambios; la RLS filtra transparentemente en el servidor.

## ADR-021: Catálogos globales con SELECT/INSERT/UPDATE abiertos (12/05/2026)
Decisión: `spcs`, `propietarios` y `profesionales` mantienen SELECT/INSERT/UPDATE abiertos a todos los hipódromos autenticados. Solo DELETE restringido a super_admin.
Justificación: Respeta el modelo cooperativo federativo de la hípica argentina — un caballo, propietario o profesional puede operar en múltiples hipódromos. Restringir por club_id rompiría la carga de inscripciones con SPCs de otros hipódromos.
Alternativa rechazada: RLS por club_id en catálogos globales (requeriría resolver propietario → hipódromo en cada query, rompiendo la búsqueda cross-club de inscripciones).

## ADR-022: Trigger antes que policy para proteger rol/club_id en usuarios (12/05/2026)
Decisión: `trg_proteger_rol_club_id_usuario` como BEFORE UPDATE trigger en lugar de lógica en la policy
Justificación: Las policies de PostgreSQL no tienen acceso a `OLD` — solo pueden evaluar el estado final de la fila (`NEW`). No es posible implementar "si el rol cambió, denegar" puramente como policy. El trigger BEFORE UPDATE tiene acceso a ambos `OLD` y `NEW`.

## ADR-023: Funciones helper de RLS como SECURITY DEFINER (12/05/2026)
Decisión: `fn_get_user_club_id()`, `fn_is_super_admin()` y las `fn_club_de_X()` declaradas con SECURITY DEFINER
Justificación: Cuando una policy invoca una función, la función se ejecuta con los permisos del usuario llamante. Si ese usuario no puede ver la tabla `usuarios` (porque tiene RLS activa), la función devuelve NULL y toda la policy falla. SECURITY DEFINER hace que la función se ejecute con permisos del owner, bypasseando la RLS internamente. Combinado con `SET search_path = public` para evitar path injection.

## ADR-024: performances — Fase 3 catálogo con INSERT/UPDATE restringidos a super_admin (14/05/2026)
Decisión: `performances.carrera_id` es nullable (registra carreras de hipódromos externos). Tratar como catálogo global (SELECT abierto a authenticated), pero INSERT/UPDATE exclusivos de super_admin.
Justificación: `carrera_id` nullable obliga a Fase 3 catálogo — Fase 2B (`fn_club_de_carrera`) haría invisibles los registros importados (carrera_id IS NULL). Sin embargo, aceptar INSERT/UPDATE abiertos en un catálogo global de historial hípico permite cross-club writes en datos que son de alcance nacional. El compromiso: SELECT cooperativo (cualquier hipódromo puede ver el historial de cualquier caballo), escritura centralizada (solo el super_admin carga y corrige historiales).

## ADR-025: Peón/capataz/sereno como sub-líneas en la liquidación del entrenador (14/05/2026)
Decisión: Los actores texto libre (peón, capataz, sereno) no generan liquidaciones propias. Sus montos aparecen como filas adicionales en `liquidacion_detalle` dentro de la liquidación del entrenador, con `concepto = "Peón — [nombre]"`. El hipódromo emite un único pago al entrenador quien redistribuye a su personal.
Justificación: Sin UUID no hay FK posible en `liquidaciones`; evita ALTER TABLE; refleja el flujo real de pago en hipódromos argentinos donde el entrenador es responsable de su caballeriza.

## ADR-026: Montas perdidas en comision_config via nuevo valor de ENUM tipo_cobro (14/05/2026)
Decisión: Bloque C extenderá el ENUM `tipo_cobro` de `comision_config` con valores `monta_perdida_tipo1` y `monta_perdida_tipo2`.
Justificación: Reutiliza la infraestructura de comisiones ya existente y permite configuración por hipódromo sin nuevas tablas.

## ADR-027: Distribución interna fija 70/10/10/4/3/1/2 hardcodeada, comision_config solo para descuentos (14/05/2026)
Decisión: Los porcentajes base de distribución de premios (70% prop, 10% entr, 10% jockey, 4% peón, 3% capataz, 1% sereno) son constantes en el código. `comision_config` solo aplica descuentos adicionales (`descuento_fondo_solidario_pct`, `descuento_incentivo_pct`).
Justificación: Estos son porcentajes nacionales de la hípica argentina regulados federativamente; no varían por hipódromo. `comision_config` cubre la variabilidad operativa (montas, incentivos).

## ADR-028: Apuestas per-carrera en TEXT[] (19/05/2026)
Decisión: `carreras.apuestas TEXT[]` — cada carrera declara qué apuestas habilita (ej: `['Ganador','Placé','Exacta']`).
Justificación: Las apuestas simples son específicas de cada carrera; no todas habilitan los mismos mercados. Confirmado por Fede vía WhatsApp. Las apuestas combinadas (doblete, triple, etc.) se descartaron del modelo — si aplican se mencionan en el texto libre de la carrera.
Implementación: se editan desde el modal 🎯 Apuestas de programa.html (input por carrera, guardado bulk). Eliminadas: `clubs.apuestas_simples` y `reuniones.apuestas_combinadas`.

## ADR-029: Comisariato y Comisión de Carreras como datos club-level (19/05/2026)
Decisión: tanto `clubs.comision_carreras` como `clubs.comisariato` son JSONB en la tabla clubs.
Justificación: ambos son fijos del hipódromo — no cambian por reunión. El comisariato tuvo un ciclo: se creó como `reuniones.comisariato`, se validó que es estable, y se migró a `clubs.comisariato` en la misma sesión.
Edición: desde Admin "Mi Hipódromo" (secretario/admin del club). Visualización: read-only en el modal de Comisión de programa.html.

## ADR-030: Reunión activa centralizada en localStorage (19/05/2026)
Decisión: `localStorage.getItem('sgh_active_reunion_id')` como fuente canónica de la reunión activa para pantallas operativas.
Justificación: las pantallas operativas (programa, carta-llamados, etc.) necesitan saber qué reunión trabajar sin requerir parámetro explícito en URL en cada salto de pantalla. Prioridad: URL param > localStorage > próxima reunión por fecha.
Implementación: el usuario fija la reunión activa desde reuniones.html con el botón 📍 Activar, que escribe en localStorage. Las pantallas sin reunion_id en URL leen localStorage y si tampoco hay nada saltan a la reunión con fecha más próxima a hoy.

## ADR-010: Montos en DB sin formato, UI en formato argentino
Decisión: Guardar números DECIMAL planos en Postgres. En UI mostrar siempre $1.234.567,89 (punto miles, coma decimal, 2 decimales fijos).
Funciones: formatMonto() y parseMonto() en SNIPPETS.md.
Inputs: type="text" con clase monto, normalización en blur.
