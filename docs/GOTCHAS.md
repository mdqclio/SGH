# SGH — Gotchas y Aprendizajes

## 1. GitHub Pages es case-sensitive
Profesionales.html ≠ profesionales.html. Siempre usar minúsculas.
Cómo detectarlo: la consola muestra el nombre con mayúscula en la URL.

## 2. Usar la publishable key (sb_publishable_...) — legacy DESACTIVADA (actualizado 2026-06-07)
**OBSOLETO el consejo anterior** ("usar la legacy eyJ..."). Las legacy keys (anon + service_role) fueron DESACTIVADAS en el dashboard el 2026-06-07T19:09:33Z: cualquier request con `eyJ...` devuelve 401 `"Legacy API keys are disabled"`.
- Frontend: `sb_publishable_...` (pública, va en el HTML). Verificada OK contra REST (200, RLS aplica).
- Server-side / tests: `sb_secret_...` (bypasea RLS) — por env `SUPABASE_SECRET_KEY`, NUNCA hardcodear/commitear.
Dónde obtenerlas: Settings → API → "API keys" (publishable + secret). La pestaña "Legacy" quedó deshabilitada.

## 3. nombre_completo, no nombre
La tabla usuarios tiene nombre_completo NO nombre.
Usar siempre: .select('club_id, nombre_completo, rol')
Afecta todos los archivos con verificación de auth.

## 4. jockey_habitual_id SÍ existe en spcs (CORRECCIÓN)
~~No era columna~~ → sí existe. Verificado en sesión may-2026.

## 5. spcs usa estado, no activo
La tabla spcs no tiene columna activo.
Usar .eq('estado', 'activo') no .eq('activo', true).

## 6. GitHub Pages caché agresivo
Esperar 2-3 min después de push. Cmd+Shift+R para forzar recarga.
Agregar ?v=N a la URL para saltear caché.

## 7. Push frecuente — relevo por .md (VPS Hetzner, ya NO Codespaces)
Claude Code corre en un VPS Hetzner (Ubuntu 26.04, `/home/clio/dev/SGH`), accedido por
VS Code Remote-SSH + Terminal nativa desde una MacBook Air. El copy de la terminal NO es
confiable → flujo de relevo: CC escribe resultados a archivos `.md` y los pushea; el asesor
los lee de `raw.githubusercontent.com`. Push frecuente igual (la sesión SSH se puede cortar).
Ver `docs/SERVER.md`.
Comando: cd /home/clio/dev/SGH && git add . && git commit -m "wip" && git push

## 8. iOS AirDrop convierte PNG a JPEG
Al enviar PNG del iPhone a Mac por AirDrop, iOS puede agregar fondo blanco.
Solución: descargar archivos directamente desde el navegador de la Mac.

## 9. ENUMs PostgreSQL: solo agregar valores, nunca quitar
ALTER TYPE nombre_enum ADD VALUE IF NOT EXISTS 'nuevo_valor';
Los valores viejos quedan aunque no se usen.

## 10. Foreign keys al borrar inscripciones
resultado_posiciones tiene FK a inscripciones.
Siempre borrar en orden: resultado_posiciones → inscripciones.

## 11. Columna GENERATED no se puede actualizar
total_neto en liquidaciones es GENERATED ALWAYS AS.
Actualizar total_bruto y total_descuentos — total_neto se recalcula solo.

## 12. club_id puede ser NULL para entidades globales
SPCs, propietarios y entrenadores pueden tener club_id=NULL.
El buscador de inscripciones NO debe filtrar por club_id al buscar SPCs.

## 13. Supabase rate limit de emails
Plan gratuito tiene límite de emails/hora.
Crear usuarios desde Authentication → Users → Add user con Auto Confirm activado.

## 14. mix-blend-mode para logos con fondo blanco
Para logo con fondo blanco sobre verde: agregar mix-blend-mode: multiply al img.

## 15. Carta de llamados bloqueada
Para editar una carta publicada:
UPDATE reuniones SET estado = 'borrador' WHERE id = 'UUID';

## 16. toLocaleString sin locale da formato inglés
Nunca usar .toLocaleString() ni .toFixed() directo para mostrar plata. Siempre formatMonto(). El locale default del browser suele ser en-US y mete coma de miles, que es lo opuesto al formato argentino.

## 17. Comillas curly de iOS rompen SQL (may-2026)
iOS autocompleta comillas tipográficas (' ') en lugar de rectas (' '). Si pegás SQL con strings desde el iPhone, Supabase SQL Editor no lo ejecuta. Desactivar smart quotes en iPhone: Configuración → General → Teclado → Smart Punctuation OFF.

## 18. condicion_adicional NO es la condición principal (may-2026)
A pesar del nombre, condicion_adicional es solo una nota extra (ej: "Peso x impresion"). La condición real de la carrera está en condicion_handicap. Usar condicion_handicap para mostrar la condición en dropdowns y cards.

## 19. inscripciones.estado es ENUM rígido (may-2026)
No migrar inscripciones.estado a VARCHAR — hay una vista v_inscriptos_carrera que depende del ENUM. Para agregar valores: ALTER TYPE estado_inscripcion ADD VALUE 'nuevo_valor'.
Contraste: carreras.estado es VARCHAR libre (sin ENUM ni restricciones).

## 20. super_admin sin club_id no ve datos en pantallas con filtro por club_id (may-2026)
Las pantallas que usan CLUB_ID para filtrar (inscripciones, jockeys, caballerizas) no muestran datos si el super_admin no tiene club_id asignado en la tabla usuarios. Es un problema de UX, no de código. Solución temporal: asignar club_id al super_admin en la DB.

## 21. Bucket Storage requiere policies SQL después de crearlo (may-2026)
Crear el bucket desde la UI de Supabase no genera las RLS policies. Hay que ejecutar las 4 CREATE POLICY manualmente en el SQL Editor (ver SCHEMA.md → Storage Supabase).

## 22. Supabase MCP es read-only — INSERT/UPDATE/DELETE van al SQL Editor (may-2026)
El MCP de Supabase en Claude Code ejecuta queries en modo read-only. Las herramientas `execute_sql` y `apply_migration` fallan con "cannot execute UPDATE in a read-only transaction" o "Cannot apply migration in read-only mode." cuando se intenta DML o DDL. Cualquier INSERT/UPDATE/DELETE hay que correrlo en el SQL Editor del dashboard de Supabase, no desde el agente.

## 23. CSS columns + break-inside: avoid no garantiza que una tabla grande quede entera (may-2026)
Si un bloque con `break-inside: avoid` no cabe en el espacio restante de la página, el browser lo mueve a la siguiente página completa — pero si el bloque es más alto que la página entera, se parte igual. Para forzar que un elemento empiece en su propia página: `break-before: always` o `page-break-before: always` en su wrapper. Aplica a la matriz ORDEN DE LARGADA del PDF de inscriptos.

## 24. hipodromos.cantidad_gateras no se carga en el alta de hipódromo (may-2026)
El campo existe con DEFAULT 12, pero registro.html no tiene el campo en el formulario. Para hipódromos nuevos queda en 12 hasta que alguien lo actualice por SQL. El PDF de inscriptos hace fallback a 12 si cantidad_gateras es null. Pendiente agregar el campo a registro.html y a hipodromos.html.

## 25. DROP POLICY no es magia: el nombre exacto importa (12/05/2026)
Si una policy se llama `allow_all_usuarios` (con sufijo) y ejecutás `DROP POLICY IF EXISTS "allow_all" ON usuarios`, **no se borra nada** — y PostgreSQL no da error. La policy permisiva queda viva y anula toda la RLS endurecida, porque PostgreSQL es PERMISSIVE por default: si una sola policy devuelve true, la operación se permite sin importar las demás.
Cómo auditar antes de asumir limpieza:
```sql
SELECT policyname FROM pg_policies WHERE tablename = 'usuarios' AND schemaname = 'public';
```
Para borrar todo sin adivinar nombres, usar el DO/LOOP dinámico del script de migración.

## 27. Columnas GENERATED en Postgres NO se pueden incluir en INSERT/UPDATE (14/05/2026)
`total_neto` en `liquidaciones` y `monto_neto` en `liquidacion_detalle` son `GENERATED ALWAYS AS (total_bruto - total_descuentos) STORED`. Postgres las calcula automáticamente; si las incluís en el payload de un INSERT/UPDATE, el query falla con error. Solución: excluirlas del payload y dejar que Postgres las calcule.
Patrón de detección: error "cannot insert into column X" o "column X can only be updated to DEFAULT".

## 28. El patrón `.catch(()=>{})` en queries de Supabase oculta bugs críticos (14/05/2026)
El motor de liquidaciones no había funcionado nunca por este motivo: queries que fallaban silenciosamente devolvían `undefined` en lugar de lanzar excepción. El catch vacío tragaba el error y el código seguía como si todo estuviera bien, generando datos incorrectos o no generando nada. Reemplazar siempre con `.catch(err => { console.error('[contexto]', err); throw err; })`. Revisar todos los módulos HTML ante la duda — buscar `.catch(()=>{})` como regex.

## 29. Mismatch silencioso entre código y schema (14/05/2026)
`resultados.html` escribía `apuestas` y `motivo_descalificacion` mientras la DB tenía `dividendos` y `motivo_desc`. Sin verbose error handling, el INSERT/UPDATE silenciaba el fallo y los campos quedaban NULL durante meses sin que nadie lo notara. Patrón de riesgo: usar nombres de campo de memoria o de mockups sin verificar contra el schema real. Solución: ante cualquier campo que no persiste como se espera, correr `SELECT column_name FROM information_schema.columns WHERE table_name = 'X'` en el SQL Editor para confirmar nombres exactos.

## 30. Modelo de apuestas: no asumir apuestas_combinadas ni apuestas_simples (19/05/2026)
El modelo sufrió varios refactors en la misma sesión y quedó así:
- `carreras.apuestas TEXT[]` — lista de apuestas habilitadas POR CARRERA (ej: `['Ganador','Placé']`).
- `clubs.apuestas_simples` — ELIMINADA (fue agregada y dropeada en la misma sesión).
- `reuniones.apuestas_combinadas` — ELIMINADA (fue agregada y dropeada en la misma sesión).
No buscar ni usar esas columnas eliminadas; no existen en la DB.

## 31. comisariato está en clubs, no en reuniones (19/05/2026)
`clubs.comisariato JSONB` — es club-level (stewards fijos del hipódromo).
`reuniones.comisariato` — NO EXISTE; fue agregada y dropeada en la misma sesión del 19/05.
Tanto comisariato como comision_carreras se leen desde `clubData` en programa.html y son read-only.

## 32. propietarios.nombre es el único campo de nombre — NO existe nombre_completo ni razon_social (20/05/2026)
La tabla `propietarios` tiene columna `nombre` (VARCHAR). No existen `nombre_completo` ni `razon_social`.
Varias sesiones anteriores y algún spec generado usaban esos nombres incorrectamente. El INSERT/UPDATE falla silenciosamente si se incluyen en el payload (Supabase los ignora), y el SELECT devuelve null en esos campos.
Patrón correcto: `.select('id,nombre')`, referencia: `prop?.nombre`.

## 33. carreras.numero_carrera_programa puede ser null — nunca sumar offset para ordenar (20/05/2026)
`numero_carrera_programa` es nullable (no se asigna hasta la ratificación). Para ordenar carreras en display usar nullish coalescing con fallback a `numero_turno`:
```javascript
const aN = a.numero_carrera_programa ?? a.numero_turno ?? 999;
```
NO usar `(a.numero_turno + 10000)` como offset — mezcla números reales del programa con números inflados y hace imposible detectar cuándo llegó un valor real.

## 34. Las dos keys de localStorage de navegación y cómo interactúan (20/05/2026)
- `sgh_active_reunion_id` — reunión activa (UUID). Resuelto por `window.ActiveReunion.resolve()`.
- `sgh_selected_club_id` — hipódromo activo para super_admin (UUID). Resuelto en `initAuth`.
Al cambiar de hipódromo con el club-switcher, se borra automáticamente `sgh_active_reunion_id` para evitar que apunte a una reunión de otro club. Si se limpian manualmente las keys (DevTools → Application → LocalStorage), la UI hace fallback a la próxima reunión del club y al club_id del usuario respectivamente.

## 35. carrera_apuestas reemplaza carreras.apuestas_habilitadas (27/05/2026)
`carreras.apuestas_habilitadas JSONB` fue dropeada. La tabla relacional `carrera_apuestas` es el modelo actual.
Para leer apuestas habilitadas de una carrera: `SELECT * FROM carrera_apuestas WHERE carrera_id = 'UUID'`.
No usar `.select('apuestas_habilitadas')` en la tabla carreras — la columna ya no existe.

## 36. renumerarChapas usa filtro positivo estricto (27/05/2026)
La regla es `estado === 'ratificado'` (positivo), NO listas de exclusión negativas.
El filtro negativo `!['forfait','mal_inscrito'].includes(i.estado)` pasa silenciosamente 'anulada', 'inscripto', 'pre_inscripto' y genera chapas extra (bug "chapa 16").
Usar siempre `renumerar-chapas.js` (helper centralizado). N = cantidad de inscripciones ratificadas, chapas 1..N por orden de `numero_partidor` ASC.

## 37. bindARSInput requiere guard _arsBound para no duplicar listeners (27/05/2026)
`bindARSInput(el)` agrega listeners focus+blur para normalizar moneda. Si se llama varias veces sobre el mismo elemento (ej: el modal se reabre), los listeners se acumulan y el valor se parsea/formatea múltiples veces, corrompiendo el input.
Guard: `if (el._arsBound) return; el._arsBound = true;` al inicio de la función.

## 40. numero_partidor es la GATERA (cajón de sorteo), no el mandil visible (28/05/2026)
El mandil/chapa que ve el usuario (1..N consecutivo) se DERIVA con `renumerarChapas` — no se persiste.
`numero_partidor` tiene huecos por diseño: se sortea de un pool de `cantidad_gateras` (Dolores = 16), no del N de competidores. El mismo caballo tiene gateras distintas en distintas carreras. NUNCA mostrar `numero_partidor` directo al usuario — siempre el 1..N derivado.
El `chapaCell` del marcador es el margen de llegada (nariz/pescuezo/cuerpos), no el número del caballo — no confundir.
Ver detalle completo: [docs/MODELO_NUMERACION.md](MODELO_NUMERACION.md)

## 38. Mandil no ratificado en marcador: .marc-invalid es feedback, no error (28/05/2026)
`onMarcInput` en `resultados.html` descarta posiciones cuyo mandil no corresponde a un ratificado. La UI da feedback visual con la clase `.marc-invalid` (borde rojo, fondo suave). La celda de chapa correspondiente queda `null` en el panel de dividendos — eso es semánticamente correcto (ese caballo no largó), no es un bug a fixear. El input no se bloquea: el usuario puede corregirlo libremente.

## 39. renderDivView espera `undefined`, no `[]`, para usar posicionesMap como fallback (28/05/2026)
`renderDivView(carreraId, overridePosiciones)` usa `posicionesMap` (posiciones guardadas en DB) cuando `overridePosiciones` es `undefined`. Si se le pasa `[]` (array vacío), lo trata como override válido y muestra vista vacía.
Convención en `onMarcInput`: `const tempPos = [...]; renderDivView(id, tempPos.length ? tempPos : undefined);`
No pasar `[]` como fallback — siempre `undefined` para indicar "usar DB".

## 41. renderDivHTML — lookup posicional por índice, no por orden===slot (29/05/2026)
El array `byTipo[tipo]` se ordena por `a.orden` al inicio de `renderDivHTML`. El lookup para slot N se hace por índice: `byTipo[tipo][slot - 1]`, NO con `find(x => x.orden === slot)`.

El guardado usa `i+1` global (posición en `pendingApuestas`) como `orden` en DB, así que el primer slot de SEG puede tener `orden=4`, no `orden=1`. Si se usa `find`, falla silenciosamente: `a` queda `undefined`, `a?.vacante` es falso, y el estado vacante no se refleja (el input no muestra "VAC"). El acceso por índice es correcto porque el sort ya garantiza el orden físico.

**No revertir al patrón `find(x => x.orden === slot)` — es un bug confirmado en producción.**

## 42. Estado de DB compartido entre probes — elegir la estrategia correcta (29/05/2026)
Los probes de regresión comparten las mismas carreras de producción. Sin setup/teardown, una corrida corrompe el estado para la siguiente. Cuatro estrategias probadas:

| Estrategia | Cuándo usarla | Ejemplo |
|---|---|---|
| **Estado limpio** (`DELETE resultado + posiciones + apuestas`) | Probe que crea su propio resultado desde cero | `probe_no_largo`: borra el resultado de T1 antes de correr para que no haya NC previos |
| **Estado real** (reponer posiciones de carrera reales) | Probe que depende de la secuencia de resultados ya guardada | `probe_dividendos_inline`: necesita pos1=mandil2, pos2=mandil3, etc. (resultado de carrera real) |
| **Snapshot + restore** (`setupT1` guarda todo antes, `teardownT1` repone en `finally`) | Probe que escribe via F10 pero no debe dejar rastro | `probe_vacante_vac`: snapshot de posiciones+apuestas → test → restore garantizado aunque el probe falle |
| **Carrera dedicada** (usar un turno que ningún otro probe toca) | Probe de una feature nueva que no puede interferir con los anteriores | Opción para próximos features que modifiquen lógica de T1/T2 |

El orden recomendado cuando se corren todos juntos: **dividendos_inline → no_largo → vacante_vac → smoke_t9_t16 → modelo_chapa**. Corridos fuera de orden pueden fallar por state pollution, no por bugs reales.

## 26. Funciones helper de RLS deben ser SECURITY DEFINER (12/05/2026)
Si `fn_get_user_club_id()` o `fn_is_super_admin()` fueran SECURITY INVOKER (default), al ser invocadas desde una policy sobre la tabla `usuarios` (que ya tiene RLS), la función intentaría leer `usuarios` con los permisos del usuario llamante — que a su vez pasan por la misma RLS, causando recursión infinita o devolviendo NULL. SECURITY DEFINER hace que la función se ejecute con permisos del owner de la función, bypasseando la RLS de la tabla destino. Combinado siempre con `SET search_path = public` para evitar path injection via search_path hijacking.

## 43. DOBLE mecanismo de fondo solidario — no deben coexistir (02/06/2026)
Hay dos formas de "fondo solidario" en el código y NO deben aplicarse juntas o se cobra el fondo dos veces:
(a) **Correcto (Fase 2):** la tajada del 2% del reparto que va al club como línea `concepto_tipo='fondo_solidario'` (98% roles + 2% fondo = 100%). Vive en `liquidacion_config.pct_fondo_solidario`.
(b) **Legacy:** `comision_config.descuento_fondo_solidario_pct` — un descuento porcentual por-actor sobre el neto. `generarLiquidaciones` aún lo aplica como `descPct` (solo a líneas `premio`).
Hoy Dolores **no tiene filas en `comision_config`** → `descPct=0` → solo actúa el mecanismo (a). Si se cargara `comision_config` con `descuento_fondo_solidario_pct != 0`, se estaría descontando el fondo a cada actor ADEMÁS de la tajada al club. Decidir explícitamente cuál usar antes de poblar `comision_config`.

## 44. generarLiquidaciones solo procesa resultados estado='oficial' (02/06/2026)
El motor filtra `resultados.estado='oficial'`. Carreras en `provisional` (como casi toda R5) NO liquidan. Para liquidar hay que oficializar primero (botón "Oficializar reunión" — Fase 2bis, pendiente). En testing, poner el resultado en oficial y restaurarlo (ver `probe_fase2_liquidaciones.mjs`).

## 45. Detección de empate por `posicion` duplicada era código muerto — afectaba PREMIOS (02/06/2026)
**Hallazgo real:** `generarLiquidaciones` detectaba empates agrupando por `posicion` duplicada (`byPos[p.posicion]`). Pero el schema **nunca** representa un dead-heat con dos filas en el mismo puesto: la constraint `UNIQUE (resultado_id, posicion)` lo prohíbe. Un empate se modela como filas en posiciones **distintas y consecutivas**, cada una con `empate=true` (ej. empate de dos en 6° → filas `posicion=6` y `posicion=7`, ambas `empate=true`). Resultado: `byPos` nunca agrupaba nada → la rama de reparto empate-aware (promedio de premios) era **código muerto**. Impacto en **PREMIOS (la plata grande)**: dos caballos empatados cobraban cada uno el premio de su posición física (6° y 7°) en vez del promedio `(premio6+premio7)/2`. **Fix (02/06/2026):** agrupar corridas de filas consecutivas con `empate=true`; `posNum` = puesto líder del grupo; premio efectivo = `Σ calcPremio(lead..lead+N-1)/N`. Probe: `tests/probe_fase2_liquidaciones.mjs` → **C3 (empate de premio)** + C2 (empate de bono). El probe fuerza el empate flipeando `empate=true` en dos finishers ya consecutivos (sin tocar `posicion`, respetando la constraint) y restaura el flag (R4).

**Relacionado (mismo Fase 2):** el bono 6-8 también era código muerto dentro de `calcPremio` (`if(!pct) return 0` corta antes para puestos 6-8, que no tienen `pct`); se extrajo a `calcBono68`.

**CONFIRMADO por Fede (02/06/2026) — comportamiento estable, NO pendiente.** Todo se deriva de dos reglas: el **principio de Fede** ("empate → 50% a cada uno") y la **convención de dead-heat** (el grupo toma la posición del **líder**):
- El bono 6-8 **se paga**: 100% al propietario, neto, `concepto_tipo='bono'`; monto y rango configurables por carrera (`bono_posicion_monto`, `bono_posicion_desde/hasta`).
- **Empate dentro del rango** (ej. 6°-7° con rango 6-8): el grupo comparte **UN** bono del puesto líder, dividido `monto/N` (2 → 50% c/u), 100% propietario c/u. ("50% a cada uno" ≠ bono entero × 2.) Probe C2.
- **Empate de premio** (ubicados 1-5): premio promediado `Σ calcPremio(lead..lead+N-1)/N`, repartido por roles sobre ese split. Probe C3.
- **Cruce de borde (empate 5°-6° con rango 6-8):** el grupo toma la posición del líder → `calcBono68(5)=0` → **sin bono**. No es ambigüedad: es la convención de dead-heat aplicada (el grupo es "5°", y 5° no está en rango).
- **Bono al ganador en empate de 1°:** `bono_ganador` está fundido en `calcPremio(1)`, así que en un empate de 1° (1°-2°) se reparte vía el **promedio** `(calcPremio(1)+calcPremio(2))/2` → mitad a cada empatado. Es el mismo principio "50% a cada uno".

**Limitación técnica conocida (del modelo `empate=true`, NO es decisión de producto):** empates **adyacentes** sin un caballo "limpio" en medio (ej. empate 2°-3°-4° pegado a empate 5°-6°) no se pueden separar con un solo booleano → se **fusionan** en un único grupo. Es rarísimo en datos reales. Si alguna vez hace falta distinguirlos, requeriría un `grupo_empate_id` en `resultado_posiciones`.

**Pago del propietario, hoy parcial:** el camino del propietario (premio 70% y bono) se genera solo donde hay `inscripciones.propietario_id`. Con la derivación aplicada + Fix D, hoy hay **10/95** (era 0/87); las 85 históricas sin caballeriza aún no generan línea de propietario hasta el backfill (Fase A). Ver GOTCHA #47.

## 46. liquidaciones.html usa formatMonto/parseMonto propios, no formatARS/parseARS (02/06/2026)
A diferencia del resto del proyecto (que usa `formatARS()`/`parseARS()`), `liquidaciones.html` define su propio par `formatMonto`/`parseMonto` (+ alias `fmt`). No es bug, pero revisar que el locale argentino (punto de miles) sea consistente con el resto antes de unificar.

## 47. inscripciones.propietario_id puede estar NULL — bloquea liquidar al propietario (02/06/2026; actualizado 2026-06-08)
> **Actualización 2026-06-08 — derivación YA aplicada (parcial):** la migración `liquidaciones_cd_propietario_derivacion.sql` (puente `caballeriza_responsables(titular)→propietarios` + triggers C/C3) está aplicada en prod, y **Fix D** (captura de caballeriza en `spcs.html`, GOTCHA #48 / ISSUE-026) está **vivo en main**. Estado actual: **10/95** inscripciones con `propietario_id` (era 0/87). Residual: **85 inscripciones históricas sin `caballeriza_id`** → sin dueño derivado; se cubren re-asociando caballerizas (Fase A, bloqueada por dato/Fede). `spc_propietarios` **sigue en 0 filas** (vía alternativa no usada).

`generarLiquidaciones` lee `insc.propietario_id`; si es null, NO se liquida al propietario (70%) NI el bono 6-8 (que es 100% propietario). `spcs` no tiene `propietario_id`; el dueño se modela en `spc_propietarios` (spc_id + propietario_id + %) o se deriva de la caballeriza (vía usada). NO es bug del motor (lee el campo correcto): es gap de carga de datos. La captura hacia adelante ya está cubierta (triggers + Fix D); falta el backfill histórico. Ver ISSUE-001 / ISSUE-026.

**Verificación a fondo (02/06/2026) — confirmado, no es artefacto de seeds.** Barrido de TODO el repo de `from('inscripciones').insert/.update/.upsert`: ningún payload escribe `propietario_id` (campos explícitos, sin spreads ni alias `propietario/dueño/owner`). `inscripciones.html` (insert L638, payload L621-635) y los UPDATE de `ratificacion.html` NO lo tocan. El **único** lugar que lo setea es `portal.html:574` (`payload.propietario_id` solo si `rol==='propietario'`), portal aún sin construir → 0 filas (`canal='web'`: 0/87). El form de `inscripciones.html` **no tiene campo de dueño** (grep vacío). NO hay trigger/RPC server-side que lo pueble: ninguna migración lo hace y, empíricamente, si existiera las 87 filas reales lo tendrían. Las 87 son carga **manual real por UI** (`canal='manual'` 87/87; `created_at` repartido 27/04→23/05/2026 con huecos humanos), no seeds → el 0/87 era exactamente lo que producía el flujo de entonces. ~~Para llenarlo hay que AGREGAR la captura/derivación al inscribir/ratificar (el fix se planea aparte).~~ **SUPERADO (ver nota 2026-06-08 arriba):** la captura/derivación YA está hecha y viva en main — triggers C/C3 + Fix D (`spcs.html`). Falta solo el backfill histórico (Fase A).

## 48. spcs.html: `id` HTML duplicado (`f-caballeriza`, `f-sexo`) — alta no captura caballeriza (02/06/2026) — ✅ RESUELTO (Fix D, vivo en main)
> **RESUELTO por Fix D — VIVO en main** (`20fdbc7`, mergeado en `ccef143` 2026-06-07; ISSUE-026). Selects del modal renombrados a `f-caballeriza-form` / `f-sexo-form`; ahora el alta captura `caballeriza_id`. Probe `tests/probe_spcs_caballeriza.mjs` (11/11). Lo de abajo queda como descripción del bug original.

`spcs.html` tenía DOS elementos con el mismo `id` para dos campos: `f-caballeriza` (filtro toolbar L150 **y** select del modal L206) y `f-sexo` (filtro toolbar L144 **y** select del modal L189). `document.getElementById('f-caballeriza')` devuelve SIEMPRE el primero del DOM = el del **toolbar**, no el del modal. Consecuencias reales:
- **Las opciones del select del modal nunca se cargan** (el populate de L329 cae sobre el toolbar; L337 lo repuebla con `querySelector('.toolbar #...')`). El `<select>` del modal queda vacío.
- **En alta, `spcs.caballeriza_id` se guarda SIEMPRE null:** `openModal(null)` hace `getElementById('f-caballeriza').value=''` (L446) sobre el toolbar, y `saveRecord` (L484) lee ese mismo toolbar → `'' || null`.
- **En edición no se puede cambiar la caballeriza** desde el modal (solo round-trip del valor existente; efecto colateral: re-filtra la lista visible).
- `f-sexo` tiene el mismo defecto pero zafa de casualidad: `openModal` setea el toolbar a un valor válido (`rec?.sexo || 'macho'`, L443) antes de leerlo (L481).

## 49. `.modal { margin: auto }` centra vertical en flex y pisa `align-items: flex-start` (2026-06-08)
Un overlay flex con `align-items: flex-start` + `padding` (para que el modal arranque arriba) **no** alinea arriba si el `.modal` tiene `margin: auto`: en un contenedor flex, `margin:auto` absorbe el espacio libre en AMBOS ejes → recentra vertical y anula el `flex-start`. Síntoma: modales largos quedan centrados y el header se va arriba de la vista. **Fix:** `margin: 0 auto` (centra solo horizontal, deja la vertical al `align-items` del overlay). En `liquidaciones.html` afectaba los 3 modales (detalle/reparto/comisión), un solo cambio en `.modal` (`a1565cd`).

## 50. `propietarios` NO tiene `apellido` — la búsqueda usa nombre + nombre_stud (2026-06-08)
`profesionales` tiene `nombre`, `apellido`, `documento_nro`. **`propietarios` NO tiene `apellido`** — todo el nombre va en `nombre` (+ `nombre_stud` para el stud) + `documento_nro`. Al buscar personas (ej. tab Pagos, `benefSearch`): profesional → `nombre+apellido+documento_nro`; propietario → `nombre+nombre_stud+documento_nro`. No asumir `apellido` en propietarios (rompe el match).

Regla general: **`getElementById` con `id` duplicado siempre agarra el primero del DOM.** Nunca reutilizar un `id` entre filtro de toolbar y campo de form. Fix conceptual (sin implementar — ver ISSUE-026): renombrar el `id` del modal (`f-caballeriza-form`) y apuntar populate (L329), `openModal` (L446) y `saveRecord` (L484) al select del modal; ídem `f-sexo`. Impacto: el link caballo→caballeriza no se llena por esta pantalla hasta arreglarlo.

## 51. `apoderados.autorizado_documento` es NOT NULL (2026-06-10)
La tabla `apoderados` (ISSUE-028) tiene `autorizado_documento TEXT NOT NULL` — es el dato que el operador verifica al pagar. La UI de alta exige nombre **y** DNI (`apoAdd` valida ambos). El unique parcial anti-dup es `(club_id, autorizante_tipo, autorizante_id, autorizado_documento) WHERE vigente` → depende del documento. Si Fede pide DNI opcional, es un `ALTER COLUMN DROP NOT NULL` (tabla con datos vivos, sin riesgo) **pero** el unique parcial deja de proteger contra duplicados sin documento — revisar antes.

## 52. Pagos: el detalle (y el bloque de apoderados) se renderiza DESPUÉS de la lista de beneficiarios (2026-06-10)
En el tab Pagos, `cobrosBuscar()` puebla la **lista de beneficiarios** (`#cob-beneficiarios`); `#cob-detalle` queda **vacío** hasta que el operador toca "🧾 Pagar" → `cobrosDetalle(tipo,id)`. El bloque read-only "Autorizados a cobrar" (apoderados v1.1) vive en ese detalle, no en la lista. Para verlo hay que abrir el detalle de una persona. No buscar el bloque en la lista inicial.

## 53. Seeding serie-safe: poblar "Pagado" sin correr `emitir_recibo` (2026-06-10)
Para sembrar datos de prueba con líneas en estado `pagado` (bucket Pagado del Resumen) **sin** mover la numeración real: insertar las filas de `recibos` a mano con `numero_recibo` **fijo y alto** (9001, 9002…) y setear `liquidacion_detalle.estado_linea='pagado'` + `recibo_id` directo. **NO** llamar `emitir_recibo` ni `fn_siguiente_recibo` → `club_secuencias.ultimo_numero` (tipo=recibo) queda intacto en 0. El teardown borra los recibos por id, así que tampoco lo toca al limpiar. Ver `teardown_prueba_resumen_9999.sql`.

## 54. Edge Function secrets son por-proyecto y write-only (2026-06-12)
Los secrets de Edge Functions (`supabase secrets set`) son **por-proyecto** y no se leen de vuelta. Setearlos en el proyecto equivocado (p.ej. el de "Cambios" en vez de SGH) **no da error**, pero la función nunca los ve → la función falla en runtime sin pista clara. Verificar siempre el `ref` del proyecto en la URL del dashboard (SGH = `unlhcuanfrtpatoipwve`) antes de setear. Como son write-only, si perdés el valor no hay forma de recuperarlo: solo sobrescribir.

## 55. `supabase login` no anda en el shell non-TTY de Claude Code (2026-06-12)
`npx supabase login` es interactivo y falla en el shell non-TTY de CC (`LegacyLoginMissingTokenError` / "Access token not provided"). Para operar el CLI desde acá (p.ej. `secrets set`): pasar un **PAT** vía `SUPABASE_ACCESS_TOKEN=sbp_…` inline, o hacer la operación por **dashboard** / Management API. El `linked-project.json` en `supabase/.temp/` solo guarda el link, no la auth.

## 56. En Edge Functions, la service_role auto-inyectada es la `eyJ` legacy (muerta 7/6) (2026-06-12)
Supabase inyecta `SUPABASE_SERVICE_ROLE_KEY` en el env de toda Edge Function, pero ese valor es la **legacy `eyJ…`**, desactivada el 2026-06-07 (401 "Legacy API keys are disabled"). Para acceso server-side a la DB desde una función, NO usarla: setear un secret custom (p.ej. `STUDBOOK_DB_KEY`) con un `sb_secret_…` y leerlo con `Deno.env.get(...)`.

## 57. Copiar tokens largos del terminal los wrapea y mete un espacio (2026-06-12)
Un token de 64 hex copiado desde la terminal puede venir **partido por un wrap visual** → al pegarlo aparece un espacio en el medio (`…c0 52af…`) que rompe el valor y da 401 aunque el token sea el correcto. Antes de descartar un token como inválido, probar quitándole espacios/saltos (`tr -d ' \n'`). No es artefacto inofensivo: el espacio va literal en el header `Authorization`.

## 58. Proyectos Supabase free se pausan a los 7 días de inactividad (2026-07-14)
Un proyecto en plan **free** se **pausa automáticamente tras ~7 días sin actividad** (sin API calls ni logins). Reversible: se puede **restaurar hasta 90 días** desde el dashboard (botón Restore), sin pérdida de datos. Pero free = **cero retención de backups**, así que no hay red de contención si se supera la ventana. Síntoma engañoso: el host del proyecto pausado **NO resuelve DNS** → parece borrado, pero no lo está. No entrar en pánico: revisar el estado en el dashboard antes de asumir pérdida. Mitigación posible: plan Pro, o un cron liviano que pegue una query periódica (decisión de producto pendiente).

## 59. El MCP de Supabase en Claude Code queda atado a UNA cuenta (2026-07-14)
Las tools del MCP de Supabase operan sobre los proyectos de **la cuenta con la que se autenticó el MCP**. Si el proyecto vive en **otra cuenta**, las tools **no lo ven** aunque el `.env` local tenga el `ref`/keys correctos → parece un `ref` inexistente o inaccesible. Antes de asumir que el ref está mal, **verificar qué cuenta tiene conectada el `/mcp`**. Es un problema de scope de cuenta, no de credenciales.

## 60. Probe de impresión: extraer el `.select()` REAL, no mockear datos (2026-07-14)
Un probe de impresión/PDF debe **extraer el `.select()` real del archivo y ejecutar la query** contra la DB, no armar datos a mano. Bug real (mandil/peso): la query de impresión **omitía columnas** (`id`, `peso_declarado`, `peso_final`) → un probe con datos mockeados **no lo detectó** porque los traía por su cuenta. Regla: el probe corre la query que corre el módulo. Si el `.select()` está incompleto, el probe tiene que fallar por eso.

## 61. `numero_carrera_programa` puede ser `null` O `0` → comparar con `!= null` (2026-07-15)
`numero_carrera_programa` es nullable **y** puede valer `0`. Nunca usar `x || fallback` para decidir si está seteado (`0` es falsy → rompe). Comparar siempre con `!= null` (o `!== null && !== undefined`). Mismo patrón para cualquier número que admita 0 legítimo.

## 62. Campos de monto en forms: usar `parseMonto`, no `parseFloat` directo (2026-07-19)
`parseMonto` maneja el **formato argentino**: saca los puntos de miles y convierte la coma decimal a punto (`"3.333.333,33"` → `3333333.33`). `parseFloat` directo sobre ese string da `3.333` (corta en el segundo punto). Todo input de dinero pasa por `parseMonto`/`formatMonto`/`bindARSInput` — nunca `parseFloat`/`.toFixed`/`.toLocaleString` directo.

## 63. Display de premios = BOLSA EFECTIVA (con piso), bonos aparte (2026-07-21, corregido)
⚠️ **Corrección** (regla real aclarada por Yesica): la primera versión mostraba la BOLSA **nominal** en el display — era un misread. El piso `ganancia_minima` **SÍ** entra en el display.

- Los montos **por puesto** del display = los **EFECTIVOS con piso** (`calcPremiosConPiso`): un 4°/5° por debajo del piso se muestra **en el piso** (ej. 100.000).
- La **BOLSA impresa** = `round(bolsaEfectiva)` = **Σ de los puestos efectivos** (ej. bolsa cargada 1.191.666 con piso 100.000 → impresa **1.284.416**). `repartoDisplay` la calcula: redondea cada puesto y el puesto de **mayor monto** absorbe el resto de redondeo → **Σ puestos ≡ total EXACTO** (sin drift de $1), sin desclavar los pisos.
- Los **BONOS** siguen **aparte** como líneas condicionales — **NO** se suman al número BOLSA (`calcPremiosConPiso` los excluye). Esto sí es decisión de Fede y no cambia.
- `calcPremiosConPiso` **intacto** (fuente de verdad del pago). `repartoDisplay` es un wrapper de redondeo sobre él.
- Sigue vivo el warning `pisoSospechoso()` (piso > 20% de la bolsa → `confirm` al guardar) y la línea informativa "Ganancia mínima por puesto".

## 64. Los links de invitación son de UN SOLO USO — el clic consume el token aunque no se complete (2026-07-24)
El `/verify` de GoTrue consume el token de un solo uso **al abrir el link**, y ahí mismo estampa `email_confirmed_at` — **antes** de que la persona fije la contraseña. Si abandona en ese punto (cierra la pestaña, falla el `UPDATE` de activación), la cuenta queda **confirmada sin credencial usable** y **no se puede reinvitar**: `inviteUserByEmail()` rechaza cuentas confirmadas y la función devuelve `409 auth_ya_registrado`. Reclickear el link ya quemado da `403 One-time token not found` — es el token consumido, no un problema de entrega.
Salida correcta: `resetPasswordForEmail()` (*recovery*), que sí funciona sobre una cuenta confirmada. Detector: filas de `usuarios` en `estado='pendiente'` cuyo `auth.users.email_confirmed_at` no es nulo.

## 65. El `redirect_to` se hornea al GENERAR el mail — arreglar la config después no arregla los mails viejos (2026-07-24)
La URL de retorno viaja **dentro del link** del mail, resuelta en el momento del envío. Si el `redirectTo` era incorrecto, o la URL no estaba en la allowlist de **Redirect URLs**, los mails **ya enviados** quedan rotos para siempre: cambiar la config del Dashboard no los repara. Hay que **reinvitar** para generar un link nuevo. Corolario: verificar la allowlist **antes** de la primera tanda de invitaciones, no después del primer reporte de "el link no anda".

## 66. El mailer built-in de Supabase descarta o limita envíos sin devolver error (2026-07-24)
Con el SMTP built-in la API responde `200` igual, así que un `200` **no** prueba entrega. Además el built-in tiene cuota baja por hora y puede no entregar a destinatarios externos a la organización. Verificar siempre contra una casilla **externa** real.
Contracara del SMTP propio (Resend, activo desde el 24/07): GoTrue **deja de emitir el evento `mail.send`** en el log de Auth. Antes cada envío dejaba una línea `mail.send / mail_from=... / mail_type=invite`; ahora no hay ninguna aunque el mail se entregue. **La ausencia de `mail.send` no es prueba de que el mail no salió** — diagnosticar por `/invite 200` + `auth_event action=user_invited` + `confirmation_sent_at` estampado, y confirmar la entrega en el panel del proveedor.

## 67. En las landings, capturar `location.hash` de forma SÍNCRONA al cargar (2026-07-24)
`supabase-js` **limpia el hash** de la URL cuando procesa el token de recovery/invite. Si la página lo lee después (en un handler, en un `await`, en un `DOMContentLoaded` tardío), ya no está y el flujo muere con "enlace inválido". Patrón: guardarlo en una const de módulo apenas carga el script — `const INITIAL_HASH = window.location.hash || ''` (`reset-password.html:160`) — y leer siempre de ahí, nunca de `window.location.hash` más adelante.

## 68. La allowlist de Redirect URLs matchea EXACTO (2026-07-24)
La URL del `redirectTo` tiene que estar en **Redirect URLs** del Dashboard de Auth tal cual, con el path completo. No alcanza con tener el dominio o el Site URL. Si no matchea, Auth redirige al Site URL y **el token se pierde en el camino**: el usuario cae en la home sin hash y el link parece "vencido". Síntoma característico: el mail llega, el link abre, y no hay error — simplemente aterriza en la página equivocada.

## 69. Un caballo se anota en VARIAS categorías a la vez — es proceso normal, no error (2026-08-04)
Regla de negocio confirmada por Yesica: en la ventana de inscripción **el mismo ejemplar se anota en varias carreras de la misma reunión**, en distintas categorías. El **lunes previo** la secretaría decide en cuál queda y se dan de baja las otras. Las inscripciones múltiples son el estado **esperado** entre el cierre de anotaciones y el lunes; **no** son duplicados, no son error de carga, y no hay que "limpiarlas" automáticamente.

El schema ya lo soporta: el único constraint es `inscripciones_carrera_id_spc_id_key` = `UNIQUE (carrera_id, spc_id)` — **por carrera, no por reunión**. Nada impide `N` filas del mismo `spc_id` en turnos distintos de la misma reunión.

Evidencia en prod (04/08): R6 del 20/06 tiene **13 ejemplares anotados en 2 turnos cada uno** (BELLO PRESAGIO 7/11, DESDEN 2/5, DOCTORA MIA 3/5, EL BORJA 2/5, HEART OF GOLD 2/5, LATIN PRESUMIDA 9/10, LATIN RAIN 3/5, LE BIRD 7/11, MAESTRO DE ARMAS 4/5, NO TIENE CONTRAS 7/11, QUIET GAUCHO 9/11, THE SULTAN 2/5, VISION SECURITY 2/5).

Consecuencias:
- **No** agregar un unique por `(reunion_id, spc_id)`, ni una validación de "ya está anotado en esta reunión" que **bloquee**. Como mucho, un aviso informativo.
- Todo conteo **por caballo y por reunión** (incentivos de montas, resúmenes, cupos) tiene que decidir explícitamente si cuenta inscripciones o ejemplares distintos — contar filas de `inscripciones` sobrecuenta a estos 13.
- Después de la ratificación el problema desaparece solo: el que no corre queda `forfait` / `mal_inscrito`, y `renumerarChapas` ya filtra por `estado === 'ratificado'`.

## 70. El autocomplete del Stud Book matchea por PREFIJO, no por substring (2026-08-07)
`GET /ejemplares/autocomplete?tipo=1&muerto=1&term=<t>` devuelve los ejemplares cuyo nombre **empieza** con `t`. Buscar por el final o por el medio del nombre da **0 hits por construcción**, no porque el caballo no exista: con `LE CHAT MIMOUS` en la base del SB, `term=MIMOUS`, `term=MIMOU` y `term=CHAT MIMO` devuelven los tres **0 filas**, mientras que `term=LE CHAT` lo trae junto a sus 8 parientes.

Consecuencia para el circuito de altas (`docs/CIRCUITO_ALTA_SPCS_R8.md`): cuando una grafía dudosa no da match exacto, **no** concluir "no está en el SB" sondeando variantes del sufijo. Hay que atacar por el **prefijo** — el primer token del nombre — y leer la lista completa. Herramienta: `tools/studbook_probe_terms.mjs <out.json> "TERMINO" …`, que vuelca los hits crudos sin clasificar.

Bonus del prefijo: los criaderos nombran por serie (`LE CHAT BOTTE` / `NOIR` / `SIAMOIS` / `VIOLET` / `MALEVOLO` / `MIMOUS`, todos de la línea `Le Chateau (USA)`), así que la lista del prefijo da **evidencia estructural** de que una grafía rara es la correcta, en vez de un juicio por parecido de letras.

## 71. `unaccent()` NO está instalada en la base (2026-08-07)
`SELECT unaccent(nombre) …` por MCP falla con `42883: function unaccent(character varying) does not exist`. Los scans acento-insensibles que describe `CIRCUITO_ALTA_SPCS_R8.md` hay que hacerlos con `~*` plano (que ya es case-insensitive) o con `translate()`. Los radicales de búsqueda conviene elegirlos sin acentos igual (`PORTEN` en vez de `PORTEÑ`).
