# Diagnóstico — (1) Carta de llamados en portal.html · (2) Vinculación obligatoria en solicitudes.html

Fecha: 2026-08-19 · Rama: `diag/initauth-activo` · Base SHA: `3958dcbe2d033fb8539e44a05dadf34300d364d0`
Alcance: **read-only**. Ninguna migración, ningún DDL, ninguna escritura. Sólo `SELECT` por MCP y `GET` por PostgREST.

---

## PARTE 1 — "Cargando reuniones…" que nunca termina

### Veredicto

**Es bug de código, no falta de datos.** R9 (20/09/2026) ya existe, está en estado `publicada` y tiene 11 carreras
cargadas. La consulta de la sección falla con **dos errores HTTP 400 independientes**, y el manejo de error deja el
spinner colgado para siempre.

### La consulta

`portal.html:516-524`, función `loadCarta()`:

```javascript
const { data: reuns, error } = await sb.from('reuniones')
  .select('id,numero,numero_publico,fecha,estado,hipodromos(nombre),carreras(id,numero_turno,nombre,distancia_metros,condicion_sexo,condicion_edad,bolsa_total,cupo_maximo,tipo_pista)')
  .in('estado', ['publicada', 'abierta'])
  .order('fecha', { ascending: true });
if (error) { toast(error.message, 'error'); return; }
```

### Error A — `'abierta'` no existe en el ENUM `estado_reunion`

Valores reales del ENUM (`pg_enum`):

```
borrador · publicada · en_curso · finalizada · cancelada · suspendida · programada
```

No hay `abierta`. PostgREST castea los literales del `in.()` al tipo de la columna, así que la request entera
revienta antes de mirar una sola fila. Reproducido contra prod:

```
GET /rest/v1/reuniones?select=id,numero,estado&estado=in.(publicada,abierta)
HTTP 400
{"code":"22P02","message":"invalid input value for enum estado_reunion: \"abierta\""}
```

Contraprueba, mismo request sin `abierta` → `HTTP 200 []`.

Origen probable del literal: `carta-llamados.html:1089` escribe `estado: 'abierta'` en **`carreras`**, que es
`VARCHAR` libre (gotcha #5) y por eso allí no falla. El valor se copió de `carreras` a `reuniones`, donde sí hay ENUM.

### Error B — `carreras.condicion_edad` no existe

El embed pide `condicion_edad`. La columna no está en `carreras`; las que existen son `edad_minima_anos` y
`edad_maxima_anos`. Reproducido con el `select` textual del portal y el filtro ya corregido a sólo `publicada`:

```
HTTP 400
{"code":"42703","message":"column carreras_1.condicion_edad does not exist"}
```

Contraprueba sin esa columna → `HTTP 200`.

**Los dos errores son independientes: arreglar uno solo deja la sección igual de rota.**

### Error tragado — quinto de la serie

Mismo patrón que los cuatro anteriores, con un agravante:

```javascript
if (error) { toast(error.message, 'error'); return; }   // portal.html:523
```

- El `return` sale **sin tocar** `carta-container`, que quedó con el HTML del spinner puesto en la línea 518.
  Resultado visible: "Cargando reuniones…" eterno.
- El `toast` se autodestruye a los 3,5 s (`portal.html:397`). Si Yesi no estaba mirando la esquina en ese momento,
  el mensaje real (`invalid input value for enum…`) desaparece sin dejar rastro.
- `showSection()` marca `cartaLoaded = true` **antes** de llamar a `loadCarta()` (`portal.html:409`). Como el flag
  no se revierte en el camino de error, salir de la sección y volver a entrar **no reintenta**: el spinner queda
  clavado hasta recargar la página. Yesi puede haber probado varias veces y visto siempre lo mismo.

### Estado real de los datos (no es el problema, pero conviene saberlo)

| numero | numero_publico | fecha | estado | carreras |
|---|---|---|---|---|
| 8 | 7 | 2026-08-16 | publicada | 12 |
| 9 | 8 | **2026-09-20** | **publicada** | **11** |
| 10 | 9 | 2026-10-11 | programada | 0 |
| 11 | 10 | 2026-11-22 | programada | 0 |
| 12 | 11 | 2026-12-27 | programada | 0 |

Dos consecuencias para cuando se arregle la consulta:

1. **R9 aparece** — el dato está, el filtro `publicada` la toma.
2. **R8 también aparece**, aunque ya se corrió: quedó en `publicada`, nunca pasó a `finalizada`. Con el filtro actual
   la carta ofrecería inscribir en una reunión ya disputada. Es decisión de producto si el filtro debe sumar una
   condición por fecha o si el flujo debe cerrar la reunión al oficializarla — no lo toco acá.
3. Las `programada` (R10–R12) no aparecen y además no tienen carreras cargadas, así que hoy no aportarían nada.

### Quién puede entrar a esa pantalla

`portal.html:363`:

```javascript
if (usr.rol !== 'propietario' && usr.rol !== 'profesional') { window.location.replace('index.html'); return false; }
```

**Yesi (`yesica@sgh.com`) tiene `rol = 'operador'`.** Con su propia cuenta no llega nunca a la Carta de llamados:
el portal la rebota a `index.html`. Para haber visto el spinner tuvo que entrar con la única cuenta de portal que
existe hoy, `[EMAIL REDACTADO]` (FABIO JOSE CASTRO, `rol='profesional'`, `activo=true`, `estado='activo'`,
club Dolores). Vale confirmarlo con ella: si dice que entró con su usuario, lo que vio fue otra pantalla.

### Riesgo latente detrás del bug (aparece recién cuando se arregle A y B)

`reuniones_select` exige `club_id = fn_get_user_club_id()`, y esa función resuelve por
`usuarios.auth_user_id = auth.uid() AND activo`. Verificado: las 7 filas de `usuarios` tienen `auth_user_id`
cargado, y la cuenta profesional está `activo=true` con `club_id` de Dolores. O sea que **por RLS la consulta va a
devolver filas** una vez corregida. No hay un segundo muro escondido acá.

### Bug adicional encontrado en el mismo flujo (no bloquea la carta, sí la inscripción)

`portal.html:608-616` lee el resultado de la validación así:

```javascript
const { data: valResult } = await sb.rpc('validar_inscripcion', {...}).maybeSingle();
if (valResult && valResult.valido === false) { ... }
```

La función devuelve `TABLE(puede_inscribirse boolean, motivo text)`. **No existe ningún campo `valido`**, así que la
comparación da `undefined === false` → siempre falsa → **la validación nunca bloquea nada**. Edad, sexo, cupo máximo
y sanción vigente se calculan en el servidor y se descartan en el cliente. Hoy está tapado por el bug de la carta
(nadie llega a inscribir); en cuanto se arregle la carta, esto queda expuesto.

---

## PARTE 2 — solicitudes.html exige ficha existente

### Qué valida hoy la vinculación

El botón nace deshabilitado (`solicitudes.html:315`) y sólo se habilita al clickear una ficha (`cablear()`, 322-331).
El front no inventa vínculos: busca candidatas por DNI exacto y, si no hay, sugiere por apellido
(`buscarFichas()`, 172-201), siempre acotado con `.eq('club_id', CLUB_ID)`. La secretaría elige; el sistema sugiere.

La validación dura está en la RPC `rpc_aprobar_solicitud` (SECURITY DEFINER). En orden:

1. `fn_solicitudes_guard_staff(p_solicitud_id)` — el que aprueba tiene que ser staff.
2. La solicitud debe estar en `pendiente`; si no, `22023`.
3. `p_entidad_tipo` ∈ {`profesional`, `propietario`}.
4. `p_entidad_tipo` debe coincidir con `solicitud.rol_pedido`.
5. La ficha debe existir (`P0002` si no).
6. **`ficha.club_id` debe ser igual a `solicitud.club_id`** → si no: `42501 "La ficha pertenece a otro hipódromo"`.
7. Inserta en `usuarios` con `entidad_tipo` + `entidad_id`, `activo=true`, `estado='activo'`.
8. Índices que pueden abortar: `ux_entidad_una_cuenta (entidad_tipo, entidad_id) WHERE entidad_id IS NOT NULL AND activo`
   (una ficha = una cuenta) y `ux_usuarios_auth_user_id`.

**El punto 6 es exactamente el muro contra el entrenador de otro hipódromo.** No es un chequeo de UI que se pueda
saltear desde el front: vive en la RPC.

### Qué se rompe si se aprueba sin ficha

No es cosmético. La identidad del portal **es** el par `entidad_tipo`/`entidad_id`:

- `fn_mis_entidades()` filtra `entidad_tipo IS NOT NULL AND entidad_id IS NOT NULL`. Sin ficha devuelve vacío.
- `fn_mis_spc_ids()` se construye sobre `fn_mis_entidades()` → vacío.
- Con eso vacío: `spcs_select` y `spc_propietarios_select` no devuelven nada, e `inscripciones_select` para portal
  (`spc_id IN fn_mis_spc_ids()`) tampoco.
- Resultado: cuenta que entra al portal y ve todo vacío, sin error. El mismo modo de falla de siempre —
  RLS devuelve `[]` con HTTP 200, la app muestra pantallas en blanco.

Además, la RPC ni siquiera dejaría llegar hasta ahí: con `p_entidad_id` nulo o inexistente corta en el paso 5.

**Inconsistencia aparte, ya presente:** `portal.html:373-378` no usa `usuarios.entidad_id`. Resuelve la identidad
consultando `propietarios`/`profesionales` **por email** con `.single()`, ignorando el vínculo que la aprobación
dejó grabado. Si la ficha tiene otro email, o ninguno, o hay dos filas que matchean, `.single()` falla, el error no
se chequea y `propietarioId`/`profesionalId` quedan en `null` — portal vacío otra vez. Son dos fuentes de verdad
para lo mismo.

### ¿Es viable el alta de profesional desde solicitudes.html?

**Técnicamente sí. No hay bloqueo de esquema ni de permisos.** Lo que hay son decisiones de negocio pendientes.

Lo que **no** es obstáculo:

- **Columnas obligatorias de `profesionales`**: sólo `tipo` (ENUM), `nombre`, `apellido` — más los defaults de
  `activo` y `estado`. Todo eso ya viaja en la solicitud.
- **Matrícula**: `matricula_nro` es **nullable**. No bloquea. Tampoco `patente`, `hipodromo_patente`, `documento_nro`,
  `email` ni `telefono`.
- **Permisos**: `profesionales_insert` pide `WITH CHECK fn_is_staff()`, y `fn_is_staff()` incluye `operador`.
  **Yesi puede insertar fichas.** Y `rpc_aprobar_solicitud` es SECURITY DEFINER, así que el `INSERT` sobre `usuarios`
  (que por RLS pediría super_admin) no es problema.
- **Unicidad**: `profesionales` no tiene índice único sobre `documento_nro` ni sobre `patente`. Nada rebota por eso
  (lo cual también significa que nada impide duplicar una ficha por error — ver riesgos).

Lo que **sí** es dependencia real:

1. **`club_id` es la decisión de fondo.** La columna es nullable, pero la RPC exige
   `ficha.club_id = solicitud.club_id`. Un alta desde solicitudes tiene que nacer con `club_id` = Dolores. Eso
   significa que "entrenador de otro hipódromo" se modela como **ficha local en Dolores con patente de origen ajena**
   (`hipodromo_patente`), no como ficha compartida entre clubes. Es coherente con el gotcha #13 (entrenadores y
   jockeys son per-hipódromo) y con cómo funciona el turf, pero es una definición que conviene que la firme Fede.
2. **`solicitudes_acceso` no captura nada del hipódromo de origen.** Sus columnas son `nombre`, `apellido`,
   `documento_tipo/nro`, `telefono`, `email`, `rol_pedido`, `club_id`, `estado`. No hay campo para hipódromo de
   procedencia, patente ni matrícula. Si el alta tiene que registrar de dónde viene el entrenador, el dato **hoy no
   se pide en el formulario** — habría que sumarlo ahí, no en la pantalla de aprobación.
3. **`profesionales.tipo` es ENUM** (valores en uso: `entrenador`, `jockey`, `ambos`). El alta tiene que elegir uno;
   como `rol_pedido` sólo distingue `profesional` vs `propietario`, el tipo lo tendría que decidir la secretaría en
   el momento de aprobar.
4. **`ux_solicitud_pendiente_doc (club_id, documento_nro) WHERE estado='pendiente'`**: un mismo DNI no puede tener
   dos solicitudes pendientes en el mismo club. No afecta al alta, sí a reintentos.

Riesgos que trae el alta directa, para tener en cuenta cuando se diseñe:

- **Duplicados.** No hay unique por documento. La pantalla busca por DNI y por apellido justamente para evitar esto;
  un botón "crear ficha nueva" al lado de las sugerencias invierte el incentivo — el camino rápido pasa a ser el que
  duplica. Los 103/167 entrenadores sin DNI cargado (comentario en `solicitudes.html:189`) hacen que el matcheo
  automático no alcance para detectarlo.
- **La ficha nueva nace sin historial.** Sin patente, sin matrícula, sin caballeriza. Habilita a inscribir, pero
  liquidaciones y recibos van a arrastrar una ficha incompleta.
- **El vínculo es 1 a 1 e irreversible desde la UI.** `ux_entidad_una_cuenta` impide reapuntar la cuenta a otra
  ficha sin desvincular la anterior, y hoy no hay pantalla para desvincular. Una ficha creada por error y ya
  vinculada requiere intervención manual en DB.

---

## Resumen

| # | Hallazgo | Dónde | Severidad |
|---|---|---|---|
| 1 | `'abierta'` no existe en el ENUM `estado_reunion` → HTTP 400 `22P02` | `portal.html:521` | **Bloqueante** |
| 2 | `carreras.condicion_edad` no existe → HTTP 400 `42703` | `portal.html:520` | **Bloqueante** |
| 3 | Error tragado: `return` sin limpiar el spinner + toast de 3,5 s + `cartaLoaded=true` antes de llamar (no reintenta) | `portal.html:409,518,523` | Alta |
| 4 | `validar_inscripcion` devuelve `puede_inscribirse`, el front lee `valido` → la validación nunca bloquea | `portal.html:608` | Alta (latente) |
| 5 | Portal resuelve identidad por email en vez de `usuarios.entidad_id`, con `.single()` sin chequear error | `portal.html:373-378` | Media |
| 6 | R8 sigue en `publicada` después de corrida — reaparecería en la carta como inscribible | datos | Producto |
| 7 | Yesi es `operador`: el portal la rebota a `index.html`, no puede ver esa pantalla con su cuenta | `portal.html:363` | A confirmar con ella |
| 8 | La ficha de otro hipódromo la corta la RPC (`42501`), no la UI | `rpc_aprobar_solicitud` paso 6 | Diseño |
| 9 | Aprobar sin ficha deja la cuenta sin `entidad_id` → todo el portal vacío por RLS, sin error | `fn_mis_entidades` / `fn_mis_spc_ids` | Diseño |
| 10 | Alta de profesional desde solicitudes: viable (RLS ok, matrícula nullable); faltan hipódromo de origen en el formulario, definición de `club_id` y `tipo`, y control de duplicados | `solicitudes_acceso`, `profesionales` | Diseño |

Nada de esto fue modificado. Sin cambios en código, esquema ni datos.
