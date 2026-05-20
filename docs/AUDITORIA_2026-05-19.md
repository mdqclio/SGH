# Auditoría de coherencia — 19/05/2026

Fecha de ejecución: 20/05/2026  
Schema verificado vía MCP Supabase (project: unlhcuanfrtpatoipwve).  
Código verificado con grep en todos los `.html` y `.js` del repo.

---

## Resumen ejecutivo

El sistema está en buen estado general. Los cambios de schema del 19/05 están aplicados y el código los respalda en su mayoría. Se encontraron **dos bugs críticos preexistentes** (no del 19/05): inserción de categorías con nombre de tabla incorrecto y definición de `comision_config` completamente errónea en SCHEMA.md. El feature "reunión activa" del commit `ede9ea2` está **parcialmente implementado**: `active-reunion.js` existe pero ningún HTML lo importa ni usa, y `reuniones.html` no tiene el botón 📍 Activar descrito en la documentación.

---

## Schema vs base

### A) En la base pero NO documentados en SCHEMA.md

| Tabla | Columnas faltantes |
|---|---|
| `usuarios` | `entidad_tipo`, `entidad_id`, `ultimo_login` |
| `liquidaciones` | `periodo_desde`, `periodo_hasta`, `aprobado_por`, `pagado_at` |
| `propietarios` | `chaquetilla_descripcion`, `chaquetilla_url` |
| `resultados` | `created_at` |

**Tablas existentes en la DB sin definición en SCHEMA.md:**
- `novedades_reunion` — cols: id, reunion_id, carrera_id, spc_id, tipo_novedad, descripcion, hora_novedad, visibilidad, creado_por. (Solo mencionada en lista RLS)
- `club_configuracion` — cols: id, club_id, clave, valor, descripcion. (Solo en lista RLS)
- `resolucion_entidades` — cols: id, resolucion_id, entidad_tipo, entidad_id, descripcion. (Solo en lista RLS)
- `spc_entrenadores_hist` — cols: id, spc_id, entrenador_id, fecha_desde, fecha_hasta. (Sin mención)
- Vistas: `v_inscriptos_carrera`, `v_programa_reunion`, `v_sanciones_vigentes`, `v_spcs_activos`. (Sin mención)
- Tablas de backup: `backup_inscripciones_20260515`, `backup_novedades_reunion_20260515`, `backup_performances_20260515`, `backup_spc_entrenadores_hist_20260515`, `backup_spc_propietarios_20260515`, `backup_spcs_20260515`. (Aceptable que no estén documentadas — son snapshots temporales)

### B) Documentados en SCHEMA.md pero que NO existen en la base

| Item | Descripción |
|---|---|
| `comisiones_config` (nombre) | El nombre real es `comision_config`. Las columnas documentadas (pct_propietario, pct_entrenador, etc.) no existen. Columnas reales: tipo_profesional, tipo_cobro, porcentaje, monto_fijo, posicion_bono, monto_bono, descuento_fondo_solidario_pct, descuento_incentivo_pct, otros_descuentos, vigente_desde, vigente_hasta, descripcion, activo. **Discrepancia total — nombre incorrecto Y columnas incorrectas.** |
| `resultados.apuestas JSONB` | El ALTER TABLE en SCHEMA.md dice `ALTER TABLE resultados ADD COLUMN IF NOT EXISTS apuestas JSONB` pero la columna no existe en la base. El código no la usa (usa `dividendos` correctamente). Gotcha residual de un plan descartado. |

---

## Código vs schema

### C) Queries a columnas o tablas que no existen en la base

| Archivo | Línea | Tabla usada | Problema |
|---|---|---|---|
| `admin.html` | 503 | `from('categorias').insert(cats)` | La tabla se llama `categorias_carrera`. Este INSERT falla silenciosamente al crear un nuevo hipódromo desde admin.html — las 4 categorías por defecto no se crean. |
| `registro.html` | 252 | `from('categorias').insert(cats)` | Mismo problema en el flujo de auto-registro de hipódromo. |

**Nota:** `from('chaquetillas')` en `caballerizas.html` es `sb.storage.from('chaquetillas')` — es el bucket de Storage, no una tabla. Correcto.

### D) Código que usa columnas correctas (confirmatoria)

| Archivo | Columna | Verificación |
|---|---|---|
| `inscripciones.html:645` | `motivo_estado` | ✅ Correcto (no usa el viejo `motivo_forfait`) |
| `ratificacion.html:905` | `motivo_estado` | ✅ Correcto |
| `programa.html:429` | `carreras.apuestas` | ✅ Correcto (`TEXT[]`) |
| `carta-llamados.html` | `disclaimer_importante`, `disclaimer_nota`, redes sociales | ✅ Correcto (todas las columnas existen) |
| `admin.html` | `comision_carreras`, `sponsors`, `comisariato` | ✅ Correcto (usa `select('*')`) |
| `liquidaciones.html` | `comision_config` | ✅ Nombre correcto, `.eq('activo', true)` — columna existe |

---

## ESTADO.md vs realidad del código

### Marcadas COMPLETADAS sin respaldo completo

| Feature | Estado real |
|---|---|
| "Reunión activa centralizada (19/05/2026)" en ESTADO.md y ADR-030 en DECISIONES.md | **PARCIAL.** El archivo `active-reunion.js` existe pero ningún HTML lo carga con `<script src>`. Las páginas implementan el localStorage directamente (inline) y de forma inconsistente. `reuniones.html` no tiene el botón 📍 Activar ni la función `activarReunion()` descritos en la doc. Ver Validaciones puntuales §19/05 para detalle. |

### Funcionalidades existentes en el código con respaldo correcto

| Feature | Evidencia |
|---|---|
| ABM Comisión, Sponsors, Comisariato en admin.html | ✅ `admin.html` lee/escribe `comision_carreras`, `sponsors`, `comisariato` de `clubs` |
| Rediseño PDF carta-llamados | ✅ `carta-llamados.html` selecciona `disclaimer_importante`, `disclaimer_nota`, redes sociales y sponsors |
| Apuestas por carrera en programa.html | ✅ `programa.html:407-442` tiene el modal completo con guardar bulk |
| Hora cierre ratificación editable | ✅ `ratificacion.html` lee `hora_cierre_ratificacion`; `reuniones.html` lo persiste |
| Admin accesible para hipódromo-admin | ✅ `reuniones.html:258` detecta rol y ajusta `CLUB_ID` según super_admin o secretario |

---

## Validaciones puntuales sesión 19/05

| Check | Resultado | Evidencia |
|---|---|---|
| `clubs.comision_carreras` existe | ✅ SÍ | Schema Supabase, data_type: jsonb |
| `clubs.sponsors` existe | ✅ SÍ | Schema Supabase, data_type: jsonb |
| `clubs.comisariato` existe | ✅ SÍ | Schema Supabase, data_type: jsonb |
| `clubs.disclaimer_importante` existe | ✅ SÍ | Schema Supabase, data_type: text |
| `clubs.disclaimer_nota` existe | ✅ SÍ | Schema Supabase, data_type: text |
| `clubs.website/instagram/facebook/tiktok/twitter_x/youtube` existen | ✅ SÍ (todos) | Schema Supabase, data_type: text |
| `clubs` NO tiene `apuestas_simples` | ✅ CORRECTO | Columna ausente del schema |
| `reuniones.hora_cierre_ratificacion` existe | ✅ SÍ | Schema Supabase, data_type: time without time zone, NOT NULL DEFAULT '12:00:00' |
| `reuniones.fechas_inscripciones` existe | ✅ SÍ | Schema Supabase, data_type: text |
| `reuniones.fechas_forfaits` existe | ✅ SÍ | Schema Supabase, data_type: text |
| `reuniones.fechas_compromiso_montas` existe | ✅ SÍ | Schema Supabase, data_type: text |
| `reuniones` NO tiene `apuestas_combinadas` | ✅ CORRECTO | Columna ausente del schema |
| `reuniones` NO tiene `comisariato` | ✅ CORRECTO | Columna ausente del schema |
| `carreras.apuestas` existe con tipo `TEXT[]` | ✅ SÍ | Schema Supabase, data_type: ARRAY, udt_name: _text |
| Existe archivo `active-reunion.js` en raíz | ✅ SÍ | `ls /workspaces/SGH/active-reunion.js` |
| Algún HTML carga `active-reunion.js` con `<script src>` | ❌ NO | `grep -rn 'src.*active-reunion' *.html` → sin resultados |
| `inscripciones.html` usa `ActiveReunion.resolve()` | ❌ NO | No carga el módulo; sin localStorage activo |
| `ratificacion.html` usa `ActiveReunion.resolve()` | ❌ NO | Escribe a localStorage directo (`:463`) pero no usa el módulo |
| `liquidaciones.html` usa `ActiveReunion.resolve()` | ❌ NO | Sin referencia a `sgh_active_reunion_id` |
| `resultados.html` usa `ActiveReunion.resolve()` | ❌ NO | Sin referencia a `sgh_active_reunion_id` |
| `programa.html` lee `sgh_active_reunion_id` de localStorage | ✅ SÍ (inline) | `programa.html:199` — pero directo, sin el módulo |
| `reuniones.html` tiene `activarReunion(id)` | ❌ NO | `grep -n "activarReunion\|sgh_active"` → sin resultados |
| `reuniones.html` tiene botón "📍 Activar" | ❌ NO | `grep -n "Activar"` → sin resultados |

**Resumen navegación activa**: el commit `ede9ea2` creó `active-reunion.js` con el módulo centralizado, pero la integración quedó a mitad. `programa.html` y `carta-llamados.html` implementaron el localStorage inline en el mismo commit, pero `reuniones.html` no tiene la UI de activación y el módulo nunca se importó en ningún HTML.

---

## Recomendaciones priorizadas

1. **[CRÍTICO — bug silencioso]** Corregir `from('categorias')` → `from('categorias_carrera')` en `admin.html:503` y `registro.html:252`. Al crear un hipódromo nuevo, las 4 categorías por defecto no se insertan y el error queda silenciado por el catch genérico.

2. **[ALTO — feature incompleto]** Completar integración de `active-reunion.js`:
   - Agregar `<script src="active-reunion.js"></script>` en los HTMLs que usan la reunión activa.
   - Reemplazar el código inline de localStorage en `programa.html`, `carta-llamados.html` y `ratificacion.html` por llamadas a `ActiveReunion`.
   - Agregar `activarReunion(id)` y botón 📍 Activar en `reuniones.html`.
   - Considerar si `inscripciones.html`, `liquidaciones.html` y `resultados.html` también deberían usar la reunión activa.

3. **[ALTO — doc incorrecta]** Corregir `comisiones_config` en SCHEMA.md: cambiar nombre a `comision_config` y reemplazar las columnas documentadas (`pct_propietario`, etc.) por las reales (`tipo_profesional`, `tipo_cobro`, `porcentaje`, `monto_fijo`, `posicion_bono`, `monto_bono`, `descuento_fondo_solidario_pct`, `descuento_incentivo_pct`, `otros_descuentos`, `vigente_desde`, `vigente_hasta`, `descripcion`, `activo`).

4. **[MEDIO — doc incompleta]** Agregar a SCHEMA.md las columnas faltantes: `usuarios` (entidad_tipo, entidad_id, ultimo_login), `liquidaciones` (periodo_desde, periodo_hasta, aprobado_por, pagado_at), `propietarios` (chaquetilla_descripcion, chaquetilla_url).

5. **[MEDIO — doc incompleta]** Documentar en SCHEMA.md las tablas sin definición: `novedades_reunion`, `club_configuracion`, `resolucion_entidades`, `spc_entrenadores_hist`, y las 4 vistas.

6. **[BAJO — doc residual]** Eliminar o tachar `ALTER TABLE resultados ADD COLUMN IF NOT EXISTS apuestas JSONB` del bloque ALTER TABLE de SCHEMA.md — la columna nunca se aplicó, el código usa `dividendos` correctamente, y la referencia en el comentario de `resultados.html:17` es un SQL comentado sin efecto.

---

## TODO doc (inconclusas, no improvisadas)

- `resultados.html:17`: SQL comentado en el `<head>` menciona columnas a agregar (`apuestas JSONB`, `tiempo_ganador VARCHAR`). `tiempo_ganador` ya existe. `apuestas` no. ¿Era intención aplicarla o quedó obsoleta con el cambio de modelo a `carreras.apuestas`? — INDETERMINADO, verificar con Fede.
- `liquidaciones.html` usa `comision_config` con columnas leídas via `select('*')`. El código que renderiza la config asume campos como `tipo_cobro`, `porcentaje`, `tipo_profesional` que coinciden con las columnas reales — parece funcionar. Sin embargo el SCHEMA.md está totalmente desfasado de la realidad real de esta tabla, lo que sugiere que fue redesignada en alguna sesión sin que se actualizara la doc.
