# SGH — Módulos del Sistema

## Estado actual
✅ Funciona | 🔧 En desarrollo | ❌ No funciona | 📋 Pendiente

| Módulo | Archivo | Estado |
|---|---|---|
| Login | login.html | ✅ |
| Dashboard | index.html | ✅ |
| Admin | admin.html | ✅ |
| Registro hipódromo | registro.html | ✅ |
| Reset password | reset-password.html | ✅ |
| Reuniones | reuniones.html | ✅ |
| Carta de llamados | carta-llamados.html | 🔧 |
| Inscripciones | inscripciones.html | ✅ |
| Ratificación | ratificacion.html | ✅ |
| Programa | programa.html | ✅ |
| Resultados | resultados.html | 🔧 |
| Liquidaciones | liquidaciones.html | ❌ |
| Calendario | calendario.html | ✅ |
| Profesionales | profesionales.html | ✅ |
| Jockeys | jockeys.html | ✅ |
| Propietarios | propietarios.html | ✅ |
| Caballerizas | caballerizas.html | ✅ |
| Stud Book | spcs.html | ✅ |
| Sanciones | sanciones.html | ✅ |
| Resoluciones | resoluciones.html | ✅ |
| Usuarios | usuarios.html | ✅ |
| Categorías | categorias.html | ✅ |
| Hipódromos | hipodromos.html | ✅ |
| Portal | portal.html | 📋 |
| Registro profesional | registro-profesional.html | 📋 |

## Notas por módulo

### resultados.html (🔧 27/05/2026)
**Marcador de posiciones**: 1°–20° con colores SBARG (partidor-colors.js). Solo inscripciones ratificadas. Chapa = renumerarChapas() (1..N por numero_partidor ASC, filtro `estado === 'ratificado'`).
**Condiciones de carrera**: estado_pista (seca/humeda/fangosa/pesada), tiempo_ganador, incidentes. El campo tiempo_clima fue eliminado (sesión cleanup-fede).
**Modal "Div. habilitadas"**: carga de dividendos por tipo habilitado. Posicionales en 3 columnas con chapa SBARG + input money. Directas y combinadas en lista vertical. Save directo a DB + merge en pendingApuestas.
**Vista Reducida**: posicionales GAN/SEG/TER en 3 columnas, read-only, estilo papel. Sin etiquetas de posición.
**Vista Detallada**: posicionales + Apuestas directas (composición auto-computada via chips) + Apuestas combinadas.
**Vista Oficial**: igual que Detallada, se activa al "Hacer oficial". Compartida con renderDivHTML().
**Botón "Pesos balanza"**: modal para cargar peso_balanza (300–600 kg) de inscripciones ratificadas.
**formatARS/parseARS/bindARSInput**: formato argentino para todos los inputs de dinero (type=text, inputmode=decimal, normalización en blur).
**Bugs conocidos**: ISSUE-020 al 025. Pendiente validación end-to-end con Fede.

### inscripciones.html (✅ may-2026)
**Vista de pantalla**: header compacto sin card redundante; dropdown Estado (Normal/Reabierta/Anulada) inline junto al selector de turno; contador "N inscriptos" a la derecha; placeholder condicional solo sin turno seleccionado; wrapper de tabla con margen lateral reducido.
**Aviso de jockey repetido (12/09/2026, pedido de Yesi)**: fila naranja + badge `⚠ dup. ×N` en el jockey cuando el mismo `jockey_titular_id` está en 2+ inscripciones **activas** (`inscripto` + `ratificado`) del turno, y toast al guardar. Helper compartido `jockey-repetido.js` (`conteoJockeysActivos`, `jockeysRepetidos`, `badgeJockeyDup`), el mismo en `portal.html` (sólo inscripciones propias del turno, hint bajo el select), `ratificacion.html` (el aviso que existía desde `d89fd20`, ahora sin contar forfaits/mal inscriptos y recalculado en cada cambio de estado) y el modal Montas de `resultados.html` (excluye los "no corrió"; toast warning al guardar si un jockey queda en 2+ que largaron). **Es aviso, no bloqueo** — en inscripción es normal, y en Montas el jockey queda en el que no largó (R8 T5). Probe `tests/probe_aviso_jockey_repetido.mjs`.
**Orden del listado (12/09/2026, pedido de Yesi)**: la tabla de inscriptos se ordena **alfabéticamente por nombre del SPC con `localeCompare(..., 'es')`** (nombre por JOIN `spcs(nombre)`, sort en cliente — no `ORDER BY`, porque la colación de Postgres no es la castellana: `NISTEL WIN < NIÑO OCEANICO`). Es el mismo orden del PDF de inscriptos y de la hoja "ORDEN DE LARGADA": Yesi carga la gatera leyendo el papel contra la pantalla. Antes venía por `created_at` (orden de carga, sin uso). El PDF también lleva el `'es'` explícito — sin locale dependía del idioma del navegador que imprimía (en inglés la Ñ cuenta como N: `AÑO < ANZUELO`). Mismo comparador que `ratificacion.html`. Probe: `tests/probe_orden_inscriptos.mjs`.
**Vista de impresión** (`printInscriptos()`): trae TODA la reunión, CSS columns 4-col flujo tipo diario, bloques de carrera con bolsa/$, condición técnica abreviada (ej: `Prod.2a.perd 800 mts`), banda REABIERTA negra/Anulada gris, lista alfabética con sufijo `(H)` para yeguas en carreras mixtas y `●` para inscriptos sin certificado. Al pie: matriz consolidada "ORDEN DE LARGADA" (filas = posiciones alfabéticas, columnas = T1..T11, celdas = numero_partidor). Condición de render de la matriz: al menos un inscripto con numero_partidor ≠ null. Resultado: 2 páginas A4 landscape.

## Flujo principal del negocio
1. Crear reunión (reuniones.html)
2. Cargar carta de llamados → Publicar (bloquea edición)
3. Inscripciones: buscar SPC → jockey/caballeriza/peón/capataz/sereno
4. Ratificación: inscripto → ratificado (o forfait)
5. Programa oficial + PDF
6. Resultados: posiciones + apuestas → Oficializar
7. Liquidaciones: calcular premios → generar recibos

## Reglas de negocio críticas

### Estados de inscripción
4 activos en UI: inscripto → mal_inscrito → ratificado → forfait
- mal_inscrito: caballo fuera de condición del turno, pero inscripto de igual forma. NO bloquea la inscripción.

### Carta de llamados
Una vez publicada no se puede modificar.
Para desbloquear: UPDATE reuniones SET estado='borrador' WHERE id='UUID';

### SPCs son globales
NO filtrar por club_id al buscar SPCs. Usar .eq('estado','activo') sin club_id.

### Propietarios son globales
club_id nullable. Un propietario puede tener caballos en múltiples hipódromos.

### Entrenadores son per-hipódromo (CORRECCIÓN — antes decía "globales")
Tienen hipodromo_patente (hipódromo que les otorgó la patente). NO son globales.
club_id técnicamente nullable en DB pero el campo hipodromo_patente es obligatorio.

### Jockeys son por hipódromo
club_id del hipódromo. Patente otorgada por cada hipódromo. hipodromo_patente registrado.

### Caballerizas son per-hipódromo
hipodromo_patente registra el hipódromo que las habilitó. Los responsables se gestionan en caballeriza_responsables (1 propietario + N copropietarios).

### 3 estados en profesionales, propietarios y caballerizas
activo → inactivo → baja. Campo booleano "activo" sincronizado para retrocompatibilidad.
- activo: visible en buscadores
- inactivo: baja temporal, visible con filtro explícito
- baja: baja definitiva, oculto salvo filtro de auditoría

### Sanciones son compartidas
Sin filtro por club_id — se ven en todos los hipódromos.

## Distribución de premios (porcentajes nacionales, configurables)
Propietario 70% / Entrenador 10% / Jockey 10% / Peón 4% / Capataz 3% / Sereno 1% / Fondo solidario 2%

## Sistema de bonos
- Bono ganador: monto fijo adicional al 1er puesto
- Bono posición: monto por puesto del 6° en adelante (hasta el 10°)
- Ganancia mínima: si el % calculado es menor, se paga el mínimo

## Apuestas (carga manual)
Habilitación por carrera: `carrera_apuestas` (tabla relacional). Modal 🎯 Apuestas en programa.html.
13 tipos: GAN (Ganador), SEG (Segundo), TER (Tercero), EX (Exacta), IM (Imperfecta), TR (Trifecta), CUAT (Cuatrifecta), X2 (Doble), X2P (Doble a Place), X3 (Triplo), X4 (Cuaterna), X5 (Quíntuplo), CAD (Cadena).
Grupos en UI: Posicionales / Apuestas directas (EX/IM/TR/CUAT) / Apuestas combinadas (X2/X2P/X3/X4/X5/CAD).
Dividendos por carrera: modal "Div. habilitadas" en resultados.html. Guardado en `resultado_apuestas` vía RPC `aplicar_resultado` (F10).
