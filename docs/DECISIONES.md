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

## ADR-031: Reunión activa centralizada vía helper active-reunion.js (20/05/2026)
Decisión: refactorizar la lógica de resolución de "reunión activa" a un helper global `window.ActiveReunion` en `active-reunion.js`, incluido en todas las pantallas operativas.
Justificación: antes de esta sesión, cada pantalla duplicaba ~30 líneas de lógica para resolver reunión activa (URL param → localStorage → próxima por fecha). El helper centraliza esa lógica y provee `.resolve()`, `.set()`, `.clear()`. Aplicado en 6 pantallas: programa, carta-llamados, inscripciones, ratificacion, resultados, liquidaciones.
El botón 📍 Activar en reuniones.html llama a `ActiveReunion.set(id)`.

## ADR-032: Hipódromo activo para super_admin via club-switcher.js (20/05/2026)
Decisión: `club-switcher.js` inyecta un `<select id="topbar-club-switcher">` en el topbar de todas las páginas operativas/de gestión, solo para `rol === 'super_admin'`.
Justificación: el super_admin no tiene club_id propio asignado y necesita poder cambiar de hipódromo sin ir al dashboard. El selector persiste en `localStorage.sgh_selected_club_id`. Al cambiar de hipódromo limpia `sgh_active_reunion_id` para evitar apuntar a una reunión de otro club.
Implementación: script externo que hace polling de `typeof currentUser !== 'undefined'` (no `window.currentUser` — los `let` top-level no son propiedades de window) y se inyecta en 16 páginas. Excluye login/registro/index.

## ADR-033: Programa Oficial separado de programa.html (20/05/2026)
Decisión: nueva página `programa-oficial.html` standalone para impresión, separada de `programa.html` (la vista operativa de secretaría).
Justificación: programa.html tiene auth, topbar, modales de edición y estado mutable. El programa oficial es un documento de impresión público (sin auth, sin estado) que debe verse idéntico en cualquier contexto. Separar ambas responsabilidades evita interferencia visual. Se accede vía botón 📘 en programa.html que abre nueva pestaña con `?reunion_id=UUID`.

## ADR-034: ult_performances ingreso manual hasta API Stud Book (20/05/2026)
Decisión: `spcs.ult_performances TEXT` — texto libre editable por secretaría.
Justificación: la API del Stud Book Argentino no está disponible aún. Las performances se ingresan manualmente en formato de código (ej: `5D5P3L`). El empty state en el programa es celda en blanco, no "DEBUTA" — ese texto se agrega solo cuando el caballo realmente debuta.

## ADR-035: sponsor_destacado separado de clubs.sponsors[] (20/05/2026)
Decisión: `clubs.sponsor_destacado JSONB {nombre, subtitulo, foto_url, direccion, contacto}` — objeto único, no array.
Justificación: el sponsor destacado es el aviso heroico del programa (bloque B&N a media página, foto a la derecha). Es conceptualmente diferente a los logos pequeños en `clubs.sponsors[]`. Estructura propia permite campo `foto_url` para la imagen, `subtitulo` para la bajada, y `contacto`/`direccion` para los datos operativos. Editado desde Admin → Mi Hipódromo.

## ADR-036: K E S P asumido como Kilos/Edad/Sexo/Pelaje (20/05/2026)
Decisión: la columna "K E S P" en el programa oficial se construye como `${peso} ${edad}${sexoCodigo}${pelajeCodigo}` (ej: `57 4MA` = 57kg, 4 años, Macho, Alazán).
Justificación: convención del manual impreso de Dolores. Los códigos de pelaje usados: Z=Zaino, T=Tordillo, A=Alazán, C=Colorado, N=Negro, M=Moro/Mulato. Sexo: M=Macho, H=Hembra, C=Castrado.
Estado: PENDIENTE CONFIRMACIÓN CON FEDE — si el orden o los códigos difieren, actualizar `pelajeCodigo()` y `sexoCodigo()` en programa-oficial.html.

## ADR-037: premios-utils.js como fuente de verdad para display de premios con piso (22/05/2026)
Decisión: helper compartido `premios-utils.js` expone `calcPremiosConPiso(bolsaNominal, dist)` usado por carta-llamados, inscripciones, ratificacion, programa y programa-oficial para calcular la bolsa efectiva y los montos por puesto respetando `distribucion_premios.ganancia_minima`.
Justificación: antes de este ADR, cada pantalla mostraba `bolsa * pct / 100` crudo sin aplicar el piso, creando inconsistencia entre lo que se anuncia y lo que paga liquidaciones.html (que ya aplicaba Math.max correctamente). El helper centraliza la lógica de display y garantiza coherencia.
Excepción: `liquidaciones.html` mantiene su lógica propia porque aplica el piso al pago efectivo (calc + bonos individuales), distinto del display de distribución porcentual. No migrar a calcPremiosConPiso.
Invariante: `carreras.bolsa_total` en DB es siempre la bolsa nominal. La bolsa efectiva (nominal + deltas de piso) es derivada al render y nunca se persiste.

## ADR-038: carrera_apuestas como tabla relacional (reemplaza JSONB) (27/05/2026)
Decisión: `carrera_apuestas` — tabla relacional con columnas `id`, `carrera_id`, `tipo`, `precio`, `nombre`, `asegurado`, `incremento`, `orden`. Reemplaza `carreras.apuestas_habilitadas JSONB`.
Justificación: el modelo JSONB permitía keys inválidas y hacía difícil agregar columnas (precio, nombre, asegurado). El modelo relacional tiene constraint CHECK en `tipo`, FK a carreras con CASCADE, y fácil expansión de columnas. UNIQUE `(carrera_id, tipo)` garantiza una apuesta por tipo por carrera.
Consecuencia: `carreras.apuestas_habilitadas` dropeada. `apuestas_keys_validas(jsonb)` dropeada. `carreraApuestasMap` en el cliente ahora se carga con rows de `carrera_apuestas` en lugar de parsear JSONB.
Alternativa rechazada: extender el JSONB con estructura anidada `{tipo: {precio, nombre, ...}}` — más difícil de validar y de migrar.

## ADR-039: Renumeración de chapas 1-N estrictamente positiva (27/05/2026)
Decisión: `renumerarChapas(inscripciones)` filtra `estado === 'ratificado'` (positivo estricto) y no listas de exclusión negativas.
Justificación: el bug "chapa 16" fue causado por el filtro negativo `!['forfait','mal_inscrito'].includes(i.estado)` que pasaba silenciosamente estados como 'anulada', 'inscripto', 'pre_inscripto', generando chapas extra. El filtro positivo es inambiguo: solo los ratificados corren y reciben chapas 1..N.
Centralizado en: `renumerar-chapas.js` — helper global. 7 call sites migrados en `resultados.html`, `programa-oficial.html`, `programa-oficial-color.html`.
Invariante: N = cantidad de inscripciones con `estado === 'ratificado'`. Las chapas 1..N corresponden al orden por `numero_partidor` ASC dentro de ese subset.

## ADR-040: Vista paper-style read-only de dividendos (27/05/2026)
Decisión: eliminar la grilla editable inline de dividendos en `resultados.html` y reemplazarla con una vista paper-style read-only (`renderDivHTML()`) + un modal separado ("Div. habilitadas") para la carga.
Justificación: la grilla editable (tabla con nav bar, CRUD buttons, select editable inline) era compleja, difícil de mantener, y generaba errores de estado (ej: bug 3b — grilla aparecía con datos viejos al recargar). La vista paper-style es más legible, más fiel al formato del programa impreso, y separa claramente la carga de datos de la visualización.
Consecuencia: eliminados `#modal-apuesta`, `openModal()`, `closeModal()`, `confirmApuesta()`, `deleteApuesta()`, `selectRow()`, `navFirst/Last/Prev/Next()`. El modal "Div. habilitadas" hace save directo a DB + merge en `pendingApuestas` para que el siguiente F10 incluya todo.

## ADR-041: Etiquetas 1°/2°/3° solo en modal editable (27/05/2026)
Decisión: en vistas read-only (Vista Reducida, Vista Detallada, Vista Oficial), las filas posicionales de SEG y TER no muestran etiquetas "1°", "2°", "3°". Cada fila es solo: [chapa SBARG] [monto].
Justificación: el slot de posición es implícito por la cantidad de filas y el orden (primera fila = dividendo más chico, segunda = más grande). Las etiquetas en el modal editable sí son necesarias para que el operador sepa cuál slot está llenando.
Excepción: el modal "Div. habilitadas" mantiene las etiquetas de posición para orientación del operador.

## ADR-010: Montos en DB sin formato, UI en formato argentino
Decisión: Guardar números DECIMAL planos en Postgres. En UI mostrar siempre $1.234.567,89 (punto miles, coma decimal, 2 decimales fijos).
Funciones: formatMonto() y parseMonto() en SNIPPETS.md. En resultados.html: `formatARS()` / `parseARS()` / `bindARSInput()`.
Inputs: type="text" inputmode="decimal" con normalización en blur. Guard `el._arsBound` previene listeners duplicados.

## ADR-042: La LÍNEA (liquidacion_detalle) como unidad de deuda — arquitectura C1 (02/06/2026)
Decisión: cada `liquidacion_detalle` lleva su propio `estado_linea` (impago/pagado/retenido) y su beneficiario denormalizado (`beneficiario_tipo` + `beneficiario_id`). `recibos` es una capa de cobro separada que agrupa líneas impagas — potencialmente cross-reunión — vía `liquidacion_detalle.recibo_id`.
Justificación: el cobro real en Dolores es por persona y puede cruzar reuniones; `liquidaciones.reunion_id` es obligatorio y no permite consolidar. Poner el estado en la línea (no en la liquidación) permite pagar parcial y agrupar libremente al emitir el recibo.
Alternativa rechazada: estado a nivel `liquidaciones` — no permite consolidación cross-reunión ni pago parcial.

## ADR-043: inscripcion_id + posicion en la línea (02/06/2026)
Decisión: las líneas de premio/bono/actuación/fondo guardan `inscripcion_id` y `posicion` (caballo + puesto que las originó). Las líneas de incentivo van con ambos en NULL (son por reunión, no por carrera).
Justificación: trazabilidad por caballo/puesto y reconstrucción del reparto; los incentivos no tienen puesto asociado.

## ADR-044: Numeración de recibo correlativa POR CLUB (02/06/2026)
Decisión: el correlativo de recibo se lleva por club en `club_secuencias (club_id, tipo)` y se obtiene con `fn_siguiente_recibo(club_id)` (SECURITY DEFINER, UPSERT con lock).
Justificación: cada hipódromo numera sus propios recibos desde 1; un lock evita colisiones de numeración concurrente.

## ADR-045: Fondo solidario como concepto del club (02/06/2026)
Decisión: el 2% del reparto se rutea a una línea `concepto_tipo='fondo_solidario'` con `beneficiario_tipo='club'` y `beneficiario_id=CLUB_ID`, agrupada en una liquidación `club` por reunión (sin propietario ni profesional). NO se paga a una persona ni genera recibo.
Justificación: el fondo es del club (accidentes/choques). El modelo de línea con beneficiario polimórfico lo soporta sin tabla extra. Ver GOTCHA #43 (no confundir con el descuento por-actor de comision_config).

## ADR-046: Retención DGI nullable, sin cálculo (02/06/2026)
Decisión: `liquidacion_config.retencion_dgi_pct` y `recibos.retencion_dgi` son nullables y NO se calculan. Dolores no retiene.
Justificación: evita imponer una escala impositiva que el cliente piloto no usa; queda el campo para clubes que sí retengan, sin lógica hasta que se necesite.

## ADR-047: Retención anti-doping de 1° y 2° (~30 días) — pendiente Fase 3 (02/06/2026)
Decisión: las líneas de premio de 1° y 2° quedarán en `estado_linea='retenido'` con `fecha_liberacion` a `dias_antidoping` (default 30) de la reunión, liberándose después. El schema ya tiene las columnas (`estado_linea`, `fecha_liberacion`, `liquidacion_config.dias_antidoping`); la lógica es Fase 3 (no implementada).
Justificación: práctica de control anti-doping del hipódromo; se modela ahora en schema para no re-migrar.
