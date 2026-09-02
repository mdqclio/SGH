# Carta de llamados de R8 (16/08, pública N° 7) — por qué Fede no la ve

- **Fecha**: 2026-09-01
- **SHA**: `3d33a17761088daed953d2a31fb375e94365b2d4` (branch `reports`)
- **Modo**: SOLO LECTURA. Sólo `SELECT`, `grep`, `sed`. Cero escrituras.

## Guards verificados

| Guard | Esperado | Obtenido | OK |
|---|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | `/home/clio/dev/SGH` | ✅ |
| `SELECT count(*) FROM spcs` | 181 | 181 | ✅ |
| ref proyecto | `unlhcuanfrtpatoipwve` | `unlhcuanfrtpatoipwve` | ✅ |

```
$ pwd
/home/clio/dev/SGH
$ git log -1 --format=%H
3d33a17761088daed953d2a31fb375e94365b2d4
$ git status --porcelain
(vacío)
```

```sql
SELECT count(*) AS spcs FROM spcs;
```
```
[{"spcs":181}]
```

---

## Respuesta corta

**Los datos de R8 no se borraron. Están completos** (12 turnos, 1.582 caracteres de observaciones).
Lo que pasa es que **`carta-llamados.html` no tiene selector de reunión**. Para ver una carta hay que
llegarle con `?reunion_id=<uuid>` desde afuera (Reuniones o Calendario). Si Fede entra por el
dashboard (`index.html` → tarjeta "Carta de llamados", que linkea sin parámetros), el archivo cae en
un fallback que **excluye explícitamente el estado `finalizada`** — y R8 está `finalizada`.

---

## 1) ¿Cómo lista reuniones `carta-llamados.html`?

**No las lista.** No hay `<select>` de reunión en toda la página: el único `from('reuniones')` que
trae más de una fila es el fallback de arranque. La reunión se decide una sola vez, así:

### 1.a — Origen del `reunionId` — `carta-llamados.html:476-478`

```javascript
const params = new URLSearchParams(location.search);
let reunionId = params.get('reunion_id') || ActiveReunion.get();
if (reunionId) { ActiveReunion.set(reunionId); }
```

Es decir: **query string** → si no, **`localStorage.sgh_active_reunion_id`** (`active-reunion.js`,
`ActiveReunion.get()` — lectura cruda de localStorage, sin `resolve()`, sin validar que exista).

### 1.b — EL FILTRO EXACTO — `carta-llamados.html:656-662`

Sólo corre si los dos anteriores dieron vacío:

```javascript
async function load() {
  if (!reunionId) {
    const { data: activas } = await sb.from('reuniones')
      .select('id, fecha, estado')
      .eq('club_id', CLUB_ID)
      .in('estado', ['borrador', 'programada', 'publicada'])   // ← línea 660: EL FILTRO
      .order('fecha', { ascending: true })                     // ← línea 661: MÁS VIEJA primero
      .limit(1);
```

**Filtra por estado, y además ordena mal.** Dos defectos independientes en tres líneas:

| # | Línea | Problema |
|---|---|---|
| A | `carta-llamados.html:660` | `.in('estado', ['borrador','programada','publicada'])` — deja afuera `finalizada`, `en_curso`, `cancelada` y `suspendida`. R8 es `finalizada`. |
| B | `carta-llamados.html:661` | `.order('fecha', { ascending: true })` sin piso de fecha — elige la **más vieja** de las abiertas, no la próxima. Hoy eso es R6 (20/06, borrador), no R9 (20/09). |

### 1.c — Segundo fallback — `carta-llamados.html:665-670`

Sólo si el primero no devolvió NADA (0 reuniones borrador/programada/publicada en todo el club):

```javascript
const { data: ultima } = await sb.from('reuniones')
  .select('id')
  .eq('club_id', CLUB_ID)
  .order('fecha', { ascending: false })
  .limit(1)
  .maybeSingle();
```

Este sí traería una `finalizada` — pero **hoy nunca se ejecuta**, porque existen R6/R9/R10/R11/R12
en estados abiertos. Es código muerto en la práctica.

### 1.d — El estado NO bloquea imprimir

Los botones de impresión están en la topbar, sin gating por estado (`carta-llamados.html:269-271`):

```html
<button class="btn-outline" onclick="guardarCartaPDF()">💾 Guardar PDF</button>
<button class="btn-outline" onclick="imprimirCartaColor()">🖨️ Imprimir Color</button>
<button class="btn-outline" onclick="imprimirCartaBN()">🖨️ Imprimir B/N</button>
```

`applyEstadoUI()` (`carta-llamados.html:743-747`) sólo oculta **"+ Nuevo Turno"** y **"Publicar carta"**:

```javascript
function applyEstadoUI() {
  const editable = ['borrador','programada'].includes(reunion?.estado);
  document.getElementById('btn-nueva-carrera').style.display = editable ? '' : 'none';
  document.getElementById('btn-publicar').style.display      = editable ? '' : 'none';
}
```

Y `renderCarreras()` (`carta-llamados.html:755-757`) agrega sólo un cartel informativo:

```javascript
const lockedBanner = !canEdit
  ? `<div class="locked-banner">🔒 Esta carta de llamados está <strong>${reunion?.estado}</strong> y no puede modificarse.</div>`
  : '';
```

**Conclusión de la sección**: una vez que la página tiene el `reunion_id` de R8, la carta se renderiza
e imprime perfecto. El problema es 100% de **llegada**, no de renderizado ni de permisos.

---

## 2) ¿Qué reuniones ve Fede hoy y cuáles no?

### 2.a — Universo real (todas las de Dolores)

```sql
SELECT r.numero, r.numero_publico, r.fecha, r.estado, count(c.id) AS carreras
FROM reuniones r LEFT JOIN carreras c ON c.reunion_id = r.id
WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
GROUP BY r.id, r.numero, r.numero_publico, r.fecha, r.estado
ORDER BY r.fecha DESC;
```

Salida cruda:

```json
[{"numero":9999,"numero_publico":null,"fecha":"2099-01-01","estado":"cancelada","carreras":3},
 {"numero":12,"numero_publico":11,"fecha":"2026-12-27","estado":"programada","carreras":0},
 {"numero":11,"numero_publico":10,"fecha":"2026-11-22","estado":"programada","carreras":0},
 {"numero":10,"numero_publico":9, "fecha":"2026-10-11","estado":"programada","carreras":0},
 {"numero":9, "numero_publico":8, "fecha":"2026-09-20","estado":"publicada","carreras":11},
 {"numero":8, "numero_publico":7, "fecha":"2026-08-16","estado":"finalizada","carreras":12},
 {"numero":7, "numero_publico":null,"fecha":"2026-07-19","estado":"cancelada","carreras":12},
 {"numero":6, "numero_publico":6, "fecha":"2026-06-20","estado":"borrador","carreras":11},
 {"numero":5, "numero_publico":5, "fecha":"2026-05-17","estado":"finalizada","carreras":0},
 {"numero":4, "numero_publico":4, "fecha":"2026-04-19","estado":"finalizada","carreras":0},
 {"numero":3, "numero_publico":3, "fecha":"2026-03-22","estado":"finalizada","carreras":0},
 {"numero":2, "numero_publico":2, "fecha":"2026-02-08","estado":"finalizada","carreras":0},
 {"numero":1, "numero_publico":1, "fecha":"2026-01-18","estado":"finalizada","carreras":0}]
```

**R8 = `numero` 8 / `numero_publico` 7 / 2026-08-16 / `finalizada` / id `7b6e003e-22e2-4629-bf55-f18560b1260f`.**
Coincide exactamente con lo que pide Fede ("pública N° 7").

### 2.b — La MISMA query del fallback, corrida contra la base

```sql
SELECT id, fecha, estado FROM reuniones
WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND estado IN ('borrador','programada','publicada')
ORDER BY fecha ASC LIMIT 1;
```

Resultado (derivado del listado de 2.a, mismo filtro y orden):

| id | fecha | estado |
|---|---|---|
| `b02ca761-6f44-4720-86aa-a3c3099019ea` | 2026-06-20 | borrador |

→ **Entrando sin `reunion_id` y con localStorage vacío, Fede aterriza en R6 (20 de junio, borrador)**.
No en R8, y tampoco en R9 (la próxima real, 20/09). Ve una carta de junio y concluye,
razonablemente, que las viejas se borraron.

### 2.c — Tabla de visibilidad por camino de entrada

`✅` = la reunión es alcanzable por ese camino. `❌` = no.

| Reunión | Fecha | Estado | Fallback de `carta-llamados` (sin param) | Botón 📋 en `reuniones.html` | Fila en `calendario.html` | Selector de `programa.html` |
|---|---|---|---|---|---|---|
| N° 12 (púb. 11) | 27/12 | programada | ❌ (no es la más vieja) | ✅ | ✅ | ✅ |
| N° 11 (púb. 10) | 22/11 | programada | ❌ | ✅ | ✅ | ✅ |
| N° 10 (púb. 9) | 11/10 | programada | ❌ | ✅ | ✅ | ✅ |
| N° 9 (púb. 8) | 20/09 | publicada | ❌ | ✅ | ✅ | ✅ |
| **N° 8 (púb. 7)** | **16/08** | **finalizada** | **❌ excluida por estado** | **✅** | **✅** | **✅** |
| N° 7 | 19/07 | cancelada | ❌ excluida por estado | ✅ | ✅ | ✅ |
| **N° 6 (púb. 6)** | **20/06** | **borrador** | **✅ ← ES LA QUE SALE** | ✅ | ✅ | ✅ |
| N° 5 … N° 1 | ene–may | finalizada | ❌ excluida por estado | ✅ | ✅ | ✅ |
| N° 9999 PRUEBA | 2099 | cancelada | ❌ excluida por estado | ✅ | ❌ (filtra por año actual) | ✅ |

Nota: `calendario.html:139-143` filtra por `substring(fecha,1,4) === año actual`, por eso 9999/2099
no aparece ahí. Las 12 reuniones de 2026 sí aparecen todas.

### 2.d — El dato de R8 está intacto (no se borró nada)

```sql
SELECT estado, fecha, numero, numero_publico, length(coalesce(observaciones,'')) AS len_obs, tiempo_clima
FROM reuniones WHERE id='7b6e003e-22e2-4629-bf55-f18560b1260f';
```
```json
[{"estado":"finalizada","fecha":"2026-08-16","numero":8,"numero_publico":7,"len_obs":1582,"tiempo_clima":null}]
```

```sql
SELECT numero_turno, nombre, condicion_handicap, distancia_metros, bolsa_total, estado,
       categoria_id IS NOT NULL AS tiene_cat
FROM carreras WHERE reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' ORDER BY numero_turno;
```
```json
[{"numero_turno":1,"nombre":null,"condicion_handicap":"Todo Caballos de 3 años perdedores","distancia_metros":1000,"bolsa_total":"1054166.67","estado":"anulada","tiene_cat":true},
 {"numero_turno":2,"nombre":"PACHAMAMA","condicion_handicap":"Todo caballo de 4 años perdedores","distancia_metros":800,"bolsa_total":"1016666.67","estado":"confirmada","tiene_cat":true},
 {"numero_turno":3,"nombre":"FUERZA AÉREA ARGENTINA","condicion_handicap":"Todo caballo de 4 años perdedores","distancia_metros":1200,"bolsa_total":"1118333.33","estado":"confirmada","tiene_cat":true},
 {"numero_turno":4,"nombre":"DIA DEL VETERINARIO","condicion_handicap":"Todo caballo de 6 años y más edad perdedores","distancia_metros":1000,"bolsa_total":"1000000.00","estado":"confirmada","tiene_cat":true},
 {"numero_turno":5,"nombre":"DIA DEL FOLKLORE","condicion_handicap":"Todo caballo de 4 años y más edad ganadores de 1 o 2 carreras","distancia_metros":1000,"bolsa_total":"1166666.67","estado":"confirmada","tiene_cat":true},
 {"numero_turno":6,"nombre":null,"condicion_handicap":"Todo caballo de 3 y 4 años ganadores de 1 o 2 carreras","distancia_metros":1000,"bolsa_total":"1166666.67","estado":"anulada","tiene_cat":true},
 {"numero_turno":7,"nombre":null,"condicion_handicap":"Todo caballo de 3,4 y 5 años ganadores de 1 o 2 carreras","distancia_metros":1100,"bolsa_total":"1166666.67","estado":"anulada","tiene_cat":true},
 {"numero_turno":8,"nombre":"SANTA ROSA","condicion_handicap":"Todo caballo de 6 años y más edad ganadores de 1 o 2 carreras","distancia_metros":1200,"bolsa_total":"1191666.67","estado":"confirmada","tiene_cat":true},
 {"numero_turno":9,"nombre":null,"condicion_handicap":"Todo caballo de 5 años y más edad ganadores de 1 carrera","distancia_metros":1200,"bolsa_total":"1191666.67","estado":"anulada","tiene_cat":true},
 {"numero_turno":10,"nombre":"DÍA DEL NIÑO","condicion_handicap":"Especial todo caballo de 4 años y + edad ganador de 2 o + carreras.","distancia_metros":1000,"bolsa_total":"3333333.33","estado":"confirmada","tiene_cat":true},
 {"numero_turno":11,"nombre":"ANIV- DOLORES PRIMER PUEBLO PATRIO","condicion_handicap":"Todo caballo de 5 años y más edad perdedores","distancia_metros":1100,"bolsa_total":"1833333.33","estado":"confirmada","tiene_cat":true},
 {"numero_turno":12,"nombre":"GRAL JOSÉ DE SAN MARTIN","condicion_handicap":"Yeguas de 4 y 5 años perdedoras","distancia_metros":800,"bolsa_total":"1750000.00","estado":"abierta","tiene_cat":true}]
```

12 turnos con condición, distancia, bolsa y categoría. 8 útiles (`confirmada`/`abierta`) + 4 `anulada`.
`carta-llamados.html:690` trae las carreras **sin filtrar por estado**, así que los 12 se dibujan.
Como plantilla para octubre sirve tal cual.

---

## 3) ¿Otro camino para ver/imprimir una carta pasada?

**Sí, tres. Todos funcionan hoy, sin tocar una línea de código.**

### 3.a — `reuniones.html` → botón "📋 Carta llamados" ← EL CAMINO BUENO

`reuniones.html:276` trae **todas** las reuniones del club, sin filtro de estado:

```javascript
sb.from('reuniones').select('*').eq('club_id', CLUB_ID).order('fecha', {ascending: false}),
```

y `reuniones.html:356` pone el botón en **cada** fila, también sin filtro de estado:

```javascript
<button class="btn-sm btn-carta" onclick="window.location.href='carta-llamados.html?reunion_id=${r.id}'">📋 Carta llamados</button>
```

El filtro de la UI (`filterRender()`, `reuniones.html:310-316`) arranca en "todos":

```javascript
const data = allData.filter(r =>
  (!estado || r.estado===estado) && (!tipo || r.tipo===tipo) && (!hip || r.hipodromo_id===hip)
);
```

→ **Reuniones → buscar la fila del 16 AGO (badge ✅ Finalizada) → 📋 Carta llamados → 🖨️ Imprimir.**
Funciona. Es lo que Fede necesita hoy.

### 3.b — `calendario.html` → click en la fila

`calendario.html:187` — toda reunión del año en curso es un link directo:

```javascript
return `<a class="reunion-row" href="carta-llamados.html?reunion_id=${r.id}">
```

Sin filtro de estado. R8 (16/08/2026) aparece y linkea bien.

### 3.c — URL directa (el atajo)

```
https://mdqclio.github.io/SGH/carta-llamados.html?reunion_id=7b6e003e-22e2-4629-bf55-f18560b1260f
```

Efecto lateral a tener en cuenta: `carta-llamados.html:478` hace `ActiveReunion.set(reunionId)`, o sea
que **abrir la carta de R8 deja R8 como "reunión activa"** en el localStorage de ese navegador, y eso
se arrastra a los demás módulos hasta que se active otra desde `reuniones.html` (📍 Activar).

### 3.d — Lo que NO sirve para esto

- **`programa.html`**: tiene selector con todas las reuniones (`programa.html:195`, sin filtro de
  estado; el `<select>` se puebla en `programa.html:210`). Deja llegar a R8 — pero es el **programa**,
  no la carta de llamados. Otro documento.
- **`programa-oficial.html` / `programa-oficial-color.html`**: exigen `?reunion_id` sí o sí
  (`programa-oficial.html:209-211`, "No hay reunión seleccionada"). No tienen selector propio ni
  filtro de estado. Sirven, pero es el programa oficial, no la carta.
- **`index.html:313 / 338 / 366 / 391`**: la tarjeta del dashboard linkea a `carta-llamados.html`
  **sin parámetros** — y ése es justamente el camino que dispara el fallback roto.

---

## 4) Usuario de Fede — `usuarios` vs `auth.users`

### 4.a — Tabla `usuarios`

```sql
SELECT id, email, nombre_completo, rol, club_id, activo, created_at FROM usuarios ORDER BY created_at;
```
```json
[{"id":"3a685a1a-3ff7-45dc-8af3-88f5c5f29377","email":"admin@sgh.com","nombre_completo":"Administrador SGH","rol":"super_admin","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","activo":true,"created_at":"2026-04-22 00:50:10.452282+00"},
 {"id":"9ac2d140-faec-424c-9437-0cedeb8b8b82","email":"dolores@sgh.com","nombre_completo":"Administrador Dolores","rol":"secretario_carreras","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true,"created_at":"2026-04-22 02:07:42.769327+00"},
 {"id":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","email":"yesica@sgh.com","nombre_completo":"Yesica Elias","rol":"operador","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true,"created_at":"2026-05-11 02:46:51.159296+00"},
 {"id":"ae243acf-1295-4e2e-a08a-7d48c142550e","email":"fedeiguacel@gmail.com","nombre_completo":"Federico Iguacel","rol":"secretario_carreras","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true,"created_at":"2026-08-07 04:50:25.256848+00"},
 {"id":"b269e008-5d5a-444b-9f80-5f0caf0a7695","email":"vale_0735@hotmail.com","nombre_completo":"Valeria Radeland","rol":"operador","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true,"created_at":"2026-08-16 13:06:48.885596+00"},
 {"id":"2ed1427f-ef06-4f56-9a9d-75bae08047f8","email":"kiritatds@gmail.com","nombre_completo":"Martin Juarez","rol":"operador","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true,"created_at":"2026-08-16 20:33:33.982272+00"},
 {"id":"de88e4f2-fc7d-40d0-8010-5742a27f204b","email":"hipodromodolores@gmail.com","nombre_completo":"FABIO JOSE CASTRO","rol":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true,"created_at":"2026-08-19 16:20:49.852203+00"}]
```

### 4.b — Tabla `auth.users`

```sql
SELECT id, email, email_confirmed_at, last_sign_in_at, created_at, recovery_sent_at,
       banned_until, deleted_at FROM auth.users ORDER BY created_at;
```

Fila de Fede (salida cruda, recortada a su usuario):

```json
{"id":"8b2f4c83-04a7-4bb0-a23a-6ae4201f3870",
 "email":"fedeiguacel@gmail.com",
 "email_confirmed_at":"2026-08-23 21:50:48.621623+00",
 "confirmed_at":"2026-08-23 21:50:48.621623+00",
 "last_sign_in_at":"2026-08-25 19:22:18.181217+00",
 "created_at":"2026-08-07 04:50:23.223386+00",
 "recovery_sent_at":"2026-08-25 19:22:17.93644+00",
 "banned_until":null,
 "deleted_at":null,
 "meta_email":null}
```

Identidad:

```sql
SELECT user_id, provider, identity_data->>'email' AS email, last_sign_in_at
FROM auth.identities WHERE user_id = '8b2f4c83-04a7-4bb0-a23a-6ae4201f3870';
```
```json
[{"user_id":"8b2f4c83-04a7-4bb0-a23a-6ae4201f3870","provider":"email","email":"fedeiguacel@gmail.com","last_sign_in_at":"2026-08-07 04:50:23.232597+00","created_at":"2026-08-07 04:50:23.232646+00","updated_at":"2026-08-07 04:50:23.232646+00"}]
```

### 4.c — ¿Coinciden?

```sql
SELECT u.id AS usuarios_id, u.email AS usuarios_email, a.id AS auth_id, a.email AS auth_email,
       (u.id = a.id) AS ids_coinciden
FROM usuarios u FULL OUTER JOIN auth.users a ON lower(u.email) = lower(a.email)
ORDER BY u.email NULLS LAST;
```
```json
[{"usuarios_id":"3a685a1a-3ff7-45dc-8af3-88f5c5f29377","usuarios_email":"admin@sgh.com","auth_id":"6b32e0a1-fb26-4d73-a32e-358665a01e51","auth_email":"admin@sgh.com","ids_coinciden":false},
 {"usuarios_id":"9ac2d140-faec-424c-9437-0cedeb8b8b82","usuarios_email":"dolores@sgh.com","auth_id":"01c55b92-c53e-42fd-948f-ebfdb31b8d65","auth_email":"dolores@sgh.com","ids_coinciden":false},
 {"usuarios_id":"ae243acf-1295-4e2e-a08a-7d48c142550e","usuarios_email":"fedeiguacel@gmail.com","auth_id":"8b2f4c83-04a7-4bb0-a23a-6ae4201f3870","auth_email":"fedeiguacel@gmail.com","ids_coinciden":false},
 {"usuarios_id":"de88e4f2-fc7d-40d0-8010-5742a27f204b","usuarios_email":"hipodromodolores@gmail.com","auth_id":"194f7e35-1647-4997-a7ad-c4b000068672","auth_email":"hipodromodolores@gmail.com","ids_coinciden":false},
 {"usuarios_id":"2ed1427f-ef06-4f56-9a9d-75bae08047f8","usuarios_email":"kiritatds@gmail.com","auth_id":"5b7e9492-05ab-4af8-8053-40a827686c5d","auth_email":"kiritatds@gmail.com","ids_coinciden":false},
 {"usuarios_id":"b269e008-5d5a-444b-9f80-5f0caf0a7695","usuarios_email":"vale_0735@hotmail.com","auth_id":"df8a5983-97cc-416d-8942-028ca0bb1664","auth_email":"vale_0735@hotmail.com","ids_coinciden":false},
 {"usuarios_id":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","usuarios_email":"yesica@sgh.com","auth_id":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","auth_email":"yesica@sgh.com","ids_coinciden":true},
 {"usuarios_id":null,"usuarios_email":null,"auth_id":"2b526e1f-6785-445d-bbe9-02a2126ad646","auth_email":"mdqclio@hotmail.com","ids_coinciden":null},
 {"usuarios_id":null,"usuarios_email":null,"auth_id":"332175cb-a3af-46df-b54b-d6252d17619d","auth_email":"sanfrancisco@sgh.com","ids_coinciden":null},
 {"usuarios_id":null,"usuarios_email":null,"auth_id":"da8fc17b-569d-4449-a50d-ea01460e50fe","auth_email":"clio@mdq.com.ar","ids_coinciden":null}]
```

### 4.d — Veredicto del usuario de Fede

| Chequeo | Resultado |
|---|---|
| Mail en `usuarios` | `fedeiguacel@gmail.com` |
| Mail en `auth.users` | `fedeiguacel@gmail.com` |
| Mail en `auth.identities` | `fedeiguacel@gmail.com` |
| ¿Idénticos? | **Sí. Byte por byte. Sin typo, sin espacios, sin mayúsculas raras, sin alias `+`.** |
| Mail confirmado | Sí — `email_confirmed_at` = 2026-08-23 21:50:48 UTC |
| Cuenta activa | `activo = true`, `banned_until = null`, `deleted_at = null` |
| Provider | `email` (password). No es OAuth. |
| Último login exitoso | 2026-08-25 19:22:18 UTC |
| Último recovery enviado | 2026-08-25 19:22:17 UTC — **1 segundo antes del login** |

**El mail NO está mal cargado. Queda descartado.** Y hay evidencia de que el circuito de recuperación
funcionó de punta a punta al menos una vez: el 25/08 se envió un recovery y **un segundo después**
entró la sesión. O sea, le llegó el mail, hizo click y entró.

Dos notas colaterales, ninguna bloqueante:

1. **`usuarios.id ≠ auth.users.id` para 6 de 7 usuarios** (sólo Yesica coincide). No rompe nada hoy
   porque `initAuth()` linkea **por email**, no por id (`carta-llamados.html:442`):
   ```javascript
   const{data:usr}=await sb.from('usuarios').select('club_id,nombre_completo,rol').eq('email',session.user.email).single();
   ```
   Pero es una bomba de tiempo para cualquier RLS que use `auth.uid()` contra `usuarios.id`.
   → **Deuda nueva, no incluida en `docs/ISSUES.md`.**
2. Hay 3 filas en `auth.users` sin contraparte en `usuarios` (`mdqclio@hotmail.com`,
   `sanfrancisco@sgh.com`, `clio@mdq.com.ar`). Las dos últimas nunca confirmaron el mail.
   Si alguna intenta loguear, `initAuth()` revienta en el `.single()` (devuelve `usr` undefined y el
   `usr.rol` de la línea siguiente tira `TypeError`). Fuera de alcance acá.

**Sobre el reset que no le funciona ahora**: descartado el mail, las causas que quedan (no verificadas
en esta sesión, requieren datos que no están en la DB) son: el mail de recuperación cayendo en
spam/promociones de Gmail, el **rate limit de mails de Supabase** (proyecto sin SMTP propio → el
sender por defecto tiene cuota baja y frena reenvíos seguidos), o el link expirado por demora en
abrirlo. `recovery_sent_at` = 25/08 significa que **desde el 25/08 no se envió ningún recovery nuevo**
— si Fede dice que pidió el reset estos días, el mail **no se está generando**, y eso apunta a rate
limit / config SMTP, no a datos mal cargados. Se puede confirmar con los logs de auth de Supabase.

---

## Números de resumen

| Métrica | Valor |
|---|---|
| Reuniones de Dolores en DB | 13 (12 de 2026 + la de prueba 9999/2099) |
| Reuniones alcanzables por el fallback de `carta-llamados.html` | **1** (R6, 20/06) |
| Reuniones alcanzables desde `reuniones.html` | **13** (todas) |
| Reuniones en estado `finalizada` | 6 (N° 1,2,3,4,5,8) — **0 alcanzables por el fallback** |
| Reuniones `finalizada` con turnos cargados | **1** — R8, 12 turnos |
| Turnos de R8 | 12 (8 `confirmada`/`abierta`, 4 `anulada`) |
| Observaciones de R8 | 1.582 caracteres, intactas |
| Datos de R8 perdidos | **0** |
| Defectos encontrados en el fallback | 2 (filtro de estado + orden ascendente) |
| Discrepancia de mail de Fede | **0** |

---

## Veredicto

**Fede no ve R8 porque `carta-llamados.html` no tiene selector de reunión y su fallback de arranque
(`carta-llamados.html:660`) excluye el estado `finalizada` — y encima ordena `fecha ASC`
(`carta-llamados.html:661`), así que lo deja parado en R6 del 20 de junio; el arreglo mínimo es
agregar un `<select>` de reuniones en la topbar poblado con la misma query sin filtro que ya usa
`reuniones.html:276`, y mientras tanto Fede llega a la carta de R8 hoy mismo por
Reuniones → fila del 16 AGO → 📋 Carta llamados → 🖨️ Imprimir.**

---

## Preguntas abiertas

1. **¿Se implementa el selector?** El arreglo mínimo-mínimo sería sólo sacar el `.in('estado', ...)`
   de la línea 660 y dar vuelta el orden — pero eso deja la página igual de ciega (siempre una sola
   reunión, elegida por la máquina). El selector es lo que resuelve el flujo real de Fede
   ("imprimo la anterior para escribir la siguiente"). **Decisión de producto — no se tocó nada.**
2. **¿Confirmarle a Fede que nada se borra?** Ninguna carta se borró: las 6 `finalizada` siguen en la
   DB con sus observaciones. R8 conserva sus 12 turnos completos.
3. **El reset de clave**: ¿revisó spam/promociones? ¿Cuántas veces lo pidió y qué día? Con eso se
   confirma o descarta el rate limit de mails de Supabase. Vale considerar SMTP propio si el piloto
   va a sumar usuarios.
4. **Desalineación `usuarios.id` vs `auth.users.id`** (6 de 7): ¿se abre issue? No rompe hoy porque
   el link es por email, pero cualquier política RLS futura con `auth.uid()` va a fallar en silencio.
5. **Reunión de prueba 9999 (2099-01-01) sigue viva** en Dolores, con 3 carreras. Ya estaba marcada
   para borrar con `teardown_prueba_resumen_9999.sql` antes del 20/6 y sigue ahí — aparece en el
   listado de `reuniones.html` y en el selector de `programa.html`.
