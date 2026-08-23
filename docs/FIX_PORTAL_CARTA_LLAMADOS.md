# Fix — "Cargando reuniones…" eterno en la Carta de llamados del portal

**Fecha:** 2026-08-23 · **Rama:** `fix/portal-carta-llamados` (desde `main` @ `de232b1`)
**Base:** `docs/PORTAL_CARTA_Y_SOLICITUDES_DIAGNOSTICO.md` (19/08), reverificado en vivo hoy.

---

## 1. Qué filtra la consulta y por qué no devolvía nada

La respuesta corta: **no devolvía nada porque la consulta nunca llegaba a ejecutarse.** No es que
filtrara de más — reventaba antes de mirar una sola fila, con **dos HTTP 400 independientes**.

El código original (`portal.html:516-523`):

```javascript
const { data: reuns, error } = await sb.from('reuniones')
  .select('id,…,carreras(id,…,condicion_edad,…)')
  .in('estado', ['publicada', 'abierta'])
  .order('fecha', { ascending: true });
if (error) { toast(error.message, 'error'); return; }
```

### Error A — `'abierta'` no existe en el ENUM `estado_reunion`

Valores reales, verificados hoy contra `pg_enum`:

```
borrador · publicada · en_curso · finalizada · cancelada · suspendida · programada
```

PostgREST castea los literales del `in()` al tipo de la columna, así que un valor inválido voltea la
request entera. Reproducido contra prod hoy:

```
GET /rest/v1/reuniones?select=id,numero,estado&estado=in.(publicada,abierta)
HTTP 400  {"code":"22P02","message":"invalid input value for enum estado_reunion: \"abierta\""}
```

De dónde salió el literal: `carta-llamados.html` escribe `estado: 'abierta'` en **`carreras`**, que
es VARCHAR libre (gotcha #5) y por eso ahí no falla. El valor se copió a `reuniones`, donde sí hay ENUM.

### Error B — `carreras.condicion_edad` no existe

Las columnas reales son `edad_minima_anos` y `edad_maxima_anos`. Reproducido hoy, ya con el filtro
de estado corregido:

```
HTTP 400  {"code":"42703","message":"column carreras_1.condicion_edad does not exist"}
```

Contraprueba sin esa columna → **HTTP 200**.

**Son independientes: arreglar uno solo dejaba la pantalla igual de rota.**

### Error C — el spinner que no se limpia

`if (error) { toast(…); return; }` se iba **sin tocar** `carta-container`, que había quedado con el
HTML del spinner. Tres agravantes:

1. El `toast` se autodestruye a los 3,5 s (`portal.html:397`). El mensaje real desaparecía sin rastro.
2. No había `console.error`: el error tampoco quedaba en la consola del browser.
3. `showSection()` marcaba `cartaLoaded = true` **antes** de llamar a `loadCarta()`. Como el flag no
   se revertía en el camino de error, **salir de la sección y volver a entrar no reintentaba**. El
   spinner quedaba clavado hasta recargar la página entera.

---

## 2. ¿Falta de datos o filtro mal? — **Filtro mal. Los datos están.**

Estado real de las reuniones de Dolores, hoy:

| numero | público | fecha | estado | carreras |
|---|---|---|---|---|
| 6 | 6 | 2026-06-20 | borrador | 11 |
| 7 | — | 2026-07-19 | cancelada | 12 |
| 8 | 7 | 2026-08-16 | publicada | 12 |
| **9** | **8** | **2026-09-20** | **publicada** | **11** |
| 10 | 9 | 2026-10-11 | programada | 0 |
| 11 | 10 | 2026-11-22 | programada | 0 |
| 12 | 11 | 2026-12-27 | programada | 0 |

**R9 del 20/09 existe, está `publicada` y tiene 11 carreras cargadas.** El entrenador tendría que
haberla visto desde siempre. No faltaba el dato: fallaba la consulta.

R10–R12 están `programada` y con 0 carreras, así que hoy no aportarían nada aunque entraran al filtro.

---

## 3. Qué debería ver el entrenador si no hay reunión abierta

Un mensaje explícito, nunca un spinner. Quedaron **tres** estados finales bien distinguidos —
antes los tres terminaban en el mismo spinner infinito:

| Situación | Qué ve ahora |
|---|---|
| Hay reuniones | Los bloques con sus carreras y el botón Inscribir |
| No hay ninguna abierta | 📋 **"No hay reuniones abiertas"** — "Ahora mismo no hay ninguna reunión con inscripción abierta. Cuando la secretaría publique la próxima, va a aparecer acá." + botón **Actualizar** |
| La consulta falla | ⚠️ **"No se pudieron cargar las reuniones"** + el mensaje del error + botón **Reintentar** |

El botón importa tanto como el texto: sin él, y con `cartaLoaded` mal manejado, la única salida era
recargar la página.

---

## Qué se cambió

`portal.html`, cinco cambios:

1. **`.eq('estado','publicada')`** en lugar del `in()` con el valor inexistente.
2. **`edad_minima_anos, edad_maxima_anos`** en el embed, en lugar de `condicion_edad`. El chip se
   arma con `chipEdad()`: `"4 años"`, `"3 a 5 años"`, `"desde 4 años"`, `"hasta 6 años"`.
3. **Camino de error**: `console.error` + estado de error en pantalla + botón Reintentar. El spinner
   se limpia siempre.
4. **`cartaLoaded` se setea dentro de `loadCarta()` recién al cargar bien**, no en `showSection()`
   antes de llamar. Ahora un fallo se puede reintentar saliendo y volviendo a entrar.
5. **Empty-state más claro** + botón Actualizar.

### Decisión de producto tomada por el lado conservador

Se agregó **`.gte('fecha', hoy)`**: se excluyen las reuniones ya corridas.

Motivo: **R8 (16/08) sigue en estado `publicada`** — nadie la pasa a `finalizada` al oficializarla.
Sin ese filtro, arreglar la consulta habría hecho aparecer R8 en la carta **con botón "Inscribir" en
una reunión que ya se corrió hace una semana**. El fix habría destapado un problema peor que el que
resolvía.

El filtro por fecha es el parche. **El arreglo de fondo es que oficializar la última carrera cierre
la reunión** (`publicada` → `finalizada`), y eso es decisión de Fede — no se tocó.

---

## Verificación — qué ve el entrenador

**No hay browser**: Playwright/chromium no corre en Ubuntu 26.04 (`tests/README.md`), y tampoco
tengo la contraseña de la única cuenta de portal que existe. Se verificó por los dos caminos que sí
son concluyentes.

### (a) La consulta bajo el RLS del entrenador

Ejecutada como `role authenticated` con el `sub` del usuario `profesional` real de Dolores
(transacción con `ROLLBACK`, sin escrituras):

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<auth_user_id del profesional>","role":"authenticated"}';
SELECT … FROM reuniones WHERE estado='publicada' AND fecha >= CURRENT_DATE;
```

Resultado: **1 fila — R9, 20/09/2026, `publicada`, 11 carreras.** O sea que el RLS le deja ver la
reunión: no hay un segundo muro detrás del bug.

### (b) El `loadCarta()` REAL, con el harness de `tests/README.md`

`tests/probe_portal_carta.mjs` — extrae el código real de `portal.html` y lo corre con
`AsyncFunction` + cliente Supabase real + stubs de DOM. **13/13 en verde:**

```
ok  1  la consulta no devuelve error (antes: HTTP 400 22P02 + 42703)
ok  2  el spinner se fue del contenedor
ok  3  no quedó estado de error en pantalla
ok  4  cartaLoaded quedó en true tras cargar bien
ok  5  trae al menos una reunión — 1 reunión(es)
ok  6  ninguna reunión ya corrida — 2026-09-20
ok  7  todas en estado publicada
ok  8  las carreras vienen embebidas — R9:11
ok  9  el HTML renderiza bloques de reunión
ok 10  hay botones Inscribir — 11 botones
ok 11  no se referencia condicion_edad
ok 12  no se pide el estado inexistente "abierta"
ok 13  el filtro de estado es publicada
```

**Lo que ve el entrenador:**

```
Reunión 8 — Hipódromo de Dolores — 2026-09-20 — 11 carreras
   1. (sin nombre) · 800m  · edad[3-3] · tierra
   2. (sin nombre) · 800m  · edad[4-4] · tierra
   3. (sin nombre) · 1200m · edad[4-4] · cesped
   … y 8 más
```

Once carreras, cada una con su botón Inscribir. En vez del spinner eterno.

> Detalle menor, no del fix: las 11 carreras de R9 tienen `nombre` en NULL, así que el título cae al
> fallback `"Carrera N"`. Los premios todavía no están bautizados. No molesta, pero conviene saberlo
> antes del 20/09.

### (c) El camino de error

Forzado con un cliente que devuelve el 400 original:

```
spinner sigue en pantalla?   no
muestra estado de error?     sí
tiene botón Reintentar?      sí
console.error emitido?       sí -> [loadCarta] error al traer reuniones …
toast emitido?               sí -> No se pudieron cargar las reuniones
cartaLoaded quedó en false?  sí (reintenta al volver a entrar)
```

---

## ⚠️ Bloqueante para el merge — la validación de inscripción no bloquea nada

**Este fix destapa un bug que hoy está tapado.** Mientras la carta no cargaba, nadie llegaba a
inscribir. Con la carta arreglada, el botón Inscribir funciona — y del otro lado:

`portal.html:608`:
```javascript
const { data: valResult } = await sb.rpc('validar_inscripcion', {…}).maybeSingle();
if (valResult && valResult.valido === false) { … }
```

La RPC devuelve `TABLE(puede_inscribirse boolean, motivo text)` — verificado hoy en `pg_proc`.
**No existe ningún campo `valido`**, así que la comparación es siempre `undefined === false` → falsa.
Edad, sexo, cupo máximo y sanción vigente se calculan en el servidor y **se descartan en el cliente**.

El fix es una línea:

```javascript
if (valResult && valResult.puede_inscribirse === false) {
```

**No lo apliqué**: el pedido era `loadCarta`, y esto es otra función. Pero mergear la carta sin esto
habilita inscripciones que no valida nadie. Recomiendo incluirlo antes del merge.

## Fuera de alcance, anotado

- **R8 en `publicada` después de corrida** — el `.gte('fecha')` la esconde, pero el estado sigue mal.
  Oficializar debería cerrar la reunión. Decisión de Fede.
- **Identidad por email** (`portal.html:373-378`): el portal resuelve `propietarioId`/`profesionalId`
  consultando por email con `.single()` sin chequear el error, en vez de usar `usuarios.entidad_id`,
  que es el vínculo que deja la aprobación. Dos fuentes de verdad para lo mismo.
- **`CLAUDE.md` dice que `portal.html` "no está construido"** — está desactualizado: son 701 líneas
  en producción.
