# SGH — Gotchas y Aprendizajes

## 1. GitHub Pages es case-sensitive
Profesionales.html ≠ profesionales.html. Siempre usar minúsculas.
Cómo detectarlo: la consola muestra el nombre con mayúscula en la URL.

## 2. Usar SIEMPRE la legacy anon key (eyJ...)
La nueva key sb_publishable_... da error 400 en consultas REST.
Dónde obtenerla: Settings → API → pestaña "Legacy anon, service_role API keys"

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

## 7. Codespace se duerme y pierde trabajo
Hacer git push frecuentemente. Antes de cerrar la Mac: push obligatorio.
Comando: cd /workspaces/SGH && git add . && git commit -m "wip" && git push

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

## 26. Funciones helper de RLS deben ser SECURITY DEFINER (12/05/2026)
Si `fn_get_user_club_id()` o `fn_is_super_admin()` fueran SECURITY INVOKER (default), al ser invocadas desde una policy sobre la tabla `usuarios` (que ya tiene RLS), la función intentaría leer `usuarios` con los permisos del usuario llamante — que a su vez pasan por la misma RLS, causando recursión infinita o devolviendo NULL. SECURITY DEFINER hace que la función se ejecute con permisos del owner de la función, bypasseando la RLS de la tabla destino. Combinado siempre con `SET search_path = public` para evitar path injection via search_path hijacking.
