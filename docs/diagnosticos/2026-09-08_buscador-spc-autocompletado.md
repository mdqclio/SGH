# Buscador de SPC del portal — autocompletado

**Fecha:** 2026-09-08
**Rama:** `feat/buscador-spc-autocompletado` — **sin mergear**, como pediste
**SHA de la rama:** `5ab83206e29d54586654580662bff7b6e961e2f6`
**Base:** `main` = `eface80078b99a56c9ae3160053cd8fd0c425d31`
**Pedido:** Fede, 08/09/2026 — que el buscador de caballos del portal sugiera mientras se tipea.

## Guards

```
$ pwd
/home/clio/dev/SGH

$ git branch --show-current
feat/buscador-spc-autocompletado

SELECT count(*) FROM spcs;   →  181     (coincide con el baseline de CLAUDE.md)
ref del proyecto             →  unlhcuanfrtpatoipwve
```

> Nota de método: todo el relevamiento de código se hizo con `git show main:archivo`,
> no leyendo el árbol de `reports`, que está atrás de `main`.

---

## 1. Relevamiento — qué había antes

### 1.1 El buscador del portal YA autocompletaba

El pedido dice "que sugiera mientras se tipea". Eso ya pasaba: el input tiene
`oninput`, no un botón de buscar.

```
$ git show main:portal.html | grep -n "onBuscarSpc\|rpc_buscar_spc\|minsc-buscar\|buscarTimer"
267:        <input id="minsc-buscar" type="text" autocomplete="off" oninput="onBuscarSpc(this.value)"
657:let buscarTimer = null;
659:function onBuscarSpc(q) {
660:  clearTimeout(buscarTimer);
668:  buscarTimer = setTimeout(async () => {
669:    const { data, error } = await sb.rpc('rpc_buscar_spc', { p_q: t });
671:      console.error('[rpc_buscar_spc]', error);
780:  clearTimeout(buscarTimer);
781:  document.getElementById('minsc-buscar').value = '';
871:  clearTimeout(buscarTimer);
```

El código anterior, completo:

```javascript
function onBuscarSpc(q) {
  clearTimeout(buscarTimer);
  const t = (q || '').trim();
  // El RPC exige 2 caracteres; abajo de eso se vuelve a la lista propia.
  if (t.length < 2) { resultadosBusqueda = null; renderListaCaballosModal(); return; }

  const cont = document.getElementById('minsc-lista');
  cont.innerHTML = '<div class="loading-state"><div class="spinner"></div> Buscando…</div>';

  buscarTimer = setTimeout(async () => {
    const { data, error } = await sb.rpc('rpc_buscar_spc', { p_q: t });
    if (error) {
      console.error('[rpc_buscar_spc]', error);
      cont.innerHTML = `<div style="font-size:13px;color:var(--danger);padding:8px 0;">${esc(error.message)}</div>`;
      return;
    }
    resultadosBusqueda = data || [];
    renderListaCaballosModal();
  }, 250);
}
```

Umbral 2, debounce 250 ms, una consulta al servidor por ráfaga de tecleo.

### 1.2 Lo que sí estaba roto: los acentos

`rpc_buscar_spc` filtra con `ILIKE '%q%'`. **`ILIKE` no es acento-insensible**, y
`unaccent` no está instalada en la base (GOTCHA #71). O sea: contra el servidor,

```
"saltena"  →  0 resultados
"salteña"  →  1 resultado (CHINITA SALTEÑA)
```

Un entrenador que no pone la eñe no encuentra el caballo. Ocho ejemplares del
padrón tienen acento o eñe en el nombre:

```sql
SELECT nombre FROM spcs
WHERE nombre <> translate(nombre,'áéíóúñüÁÉÍÓÚÑÜ','aeiounuAEIOUNU') ORDER BY nombre;
```
```
ARMOÑOZO
CHINITA SALTEÑA
La City Porteña
La Porteña
PORTEÑO Y BAILARIN
Río Salado
SEÑOR MONCHI
SOY ISLEÑO
```

Este es el bug de fondo del pedido de Fede, aunque él lo haya descrito como
"que autocomplete".

### 1.3 `inscripciones.html` — mismo problema, NO se tocó

Como pediste: lo relevo y lo dejo anotado, no lo toco en esta entrega.

```
$ git show main:inscripciones.html | sed -n '688,706p'
async function searchSpc() {
  clearTimeout(spcSearchTimer);
  const q = document.getElementById('spc-search-input').value.trim();
  const dd = document.getElementById('spc-dropdown');
  if (q.length < 2) {
    dd.style.display = 'none';
    if (!q) document.getElementById('f-spc-id').value = '';
    return;
  }
  dd.innerHTML = '<div class="spc-option" style="color:var(--muted);cursor:default;">Buscando…</div>';
  dd.style.display = 'block';
  spcSearchTimer = setTimeout(async () => {
    const { data, error } = await sb.from('spcs')
      .select('id, nombre, fecha_nacimiento, sexo, color, padrillo_nombre, madre_nombre, entrenador_id, caballeriza_id, certificado_correr')
      .eq('estado', 'activo')
      .ilike('nombre', `%${q}%`)
      .order('nombre')
      .limit(10);
```

Diferencias con el portal:

| | portal (antes) | `inscripciones.html` (hoy, sin tocar) |
|---|---|---|
| Umbral | 2 | 2 |
| Debounce | 250 ms | 300 ms |
| Consulta | `rpc_buscar_spc` (SECURITY DEFINER) | PostgREST directo sobre `spcs` |
| Acentos | **no** (`ILIKE`) | **no** (`ILIKE`) |
| Tope | sin tope | `.limit(10)` — silencioso |
| Filtro | ninguno | `.eq('estado','activo')` |

Dos cosas para el ticket, ninguna arreglada acá:

1. **Mismo agujero de acentos.** "saltena" tampoco encuentra a CHINITA SALTEÑA
   desde la secretaría.
2. **`.limit(10)` sin aviso.** El peor trigrama del padrón devuelve 10
   resultados (ver §2.2), o sea que hoy justo no se corta — pero está al borde,
   y cuando se corte el usuario no se va a enterar.

---

## 2. La decisión: cliente, no servidor

Pediste que la decidiera con el número.

### 2.1 Cuánto pesa traer el padrón entero

```
$ node -e "... select id,nombre,sexo,fecha_nacimiento,color,studbook_id,padrillo_nombre,madre_nombre,estado ..."
filas 181 json 42550 bytes · gzip 11002 bytes
```

**42,5 kB de JSON; ~11 kB por el cable** con el gzip que PostgREST ya aplica.
Es menos que una foto de perfil. El assert `C3` del probe lo vuelve a medir en
cada corrida y falla si pasa de 80 kB, así que si el padrón crece nos enteramos.

Corrección respecto de lo que había estimado antes de medir: yo venía diciendo
"~19 kB". Ese número era de una proyección con menos columnas. El real es 42,5 kB
crudos. La conclusión no cambia, pero el número que quedó escrito en el comentario
del código y en la migración es el medido, no el estimado.

### 2.2 Cuánto devuelve una búsqueda de 3 letras

```sql
WITH n AS (SELECT lower(translate(nombre,'áéíóúÁÉÍÓÚñÑüÜ','aeiouAEIOUnNuU')) AS b FROM spcs),
tri AS (SELECT DISTINCT substr(b, g, 3) AS t FROM n, generate_series(1, length(b)-2) g
        WHERE substr(b,g,3) !~ ' $' AND substr(b,g,3) !~ '^ '),
c AS (SELECT t, (SELECT count(*) FROM n WHERE n.b LIKE '%' || t || '%') AS hits FROM tri)
SELECT count(*) AS trigramas, max(hits) AS peor_caso, round(avg(hits),2) AS promedio,
       percentile_disc(0.5) WITHIN GROUP (ORDER BY hits) AS mediana,
       count(*) FILTER (WHERE hits > 20) AS trigramas_con_mas_de_20
FROM c;
```
```
 trigramas | peor_caso | promedio | mediana | trigramas_con_mas_de_20
-----------+-----------+----------+---------+------------------------
       832 |        10 |     1.63 |       1 |                       0
```

Con tres letras, la mediana es **1 resultado** y el peor caso **10**. La lista
de sugerencias nunca es una pared.

### 2.3 Por qué el cliente gana

| | por tecla (servidor) | padrón en memoria (elegido) |
|---|---|---|
| Latencia por tecla | debounce 250 ms + viaje | 0 — filtrar 181 strings |
| Consultas por sesión | una por ráfaga | **una, al abrir el modal** |
| Acentos | requiere instalar `unaccent` en prod | gratis con `normalize('NFD')` |
| Transferencia | ~1 kB × N ráfagas | 11 kB una vez |
| Cuándo dejaría de servir | — | con miles de ejemplares |

El desempate real no es la latencia: es que **la insensibilidad a acentos en el
servidor exige instalar una extensión en producción**, y en el cliente son dos
líneas. Con 181 ejemplares no hay razón para pagar ese cambio de infraestructura.

Si el padrón creciera a miles, esto se revierte a servidor — pero ahí ya haría
falta `unaccent` o `pg_trgm` igual.

### 2.4 Hizo falta un RPC nuevo

`spcs_select` limita a un usuario de portal a `fn_mis_spc_visibles()`: **un
entrenador no puede leer el padrón entero con un SELECT**. Por eso
`rpc_buscar_spc` ya era `SECURITY DEFINER`, y por eso hace falta uno para traer
el padrón.

`migrations/rpc_padron_spcs.sql` — `SECURITY DEFINER STABLE`, **misma
autorización que `rpc_buscar_spc`**:

```sql
IF NOT ((SELECT fn_is_staff()) OR (SELECT fn_is_portal_user())) THEN
  RAISE EXCEPTION 'No autorizado.';
END IF;
```

Es **aditiva**: `rpc_buscar_spc` queda intacta y sigue siendo la que usa la UI
desplegada hasta que se mergee la rama.

**Asimetría a declarar, igual que con el RPC de forfait:** la función ya está
aplicada en producción, mientras la UI que la usa vive sólo en la rama. Como es
aditiva y nadie la llama todavía, no cambia ningún comportamiento actual. Si
decidís no mergear, hay que borrarla.

El probe verifica que el guard funciona (`C4`): sin sesión el RPC responde
`No autorizado.`, y con la clave de servicio también — `auth.uid()` es NULL y
ni `fn_is_staff()` ni `fn_is_portal_user()` dan true. Por eso el probe corre
firmado como usuario de portal efímero, no como servicio.

---

## 3. Qué mostrar en cada sugerencia

Pediste justificarlo con datos.

### 3.1 El nombre solo NO alcanza — hay un duplicado exacto

```sql
WITH n AS (SELECT id, nombre, lower(translate(nombre,'áéíóú…','aeiou…')) AS b FROM spcs)
SELECT b, count(*) AS veces, string_agg(nombre || ' [' || left(id::text,8) || ']', ' | ') AS filas
FROM n GROUP BY b HAVING count(*) > 1;
```
```
      b      | veces |                    filas
-------------+-------+---------------------------------------------
 wave rimout |     2 | Wave Rimout [5ebc5e48] | Wave Rimout [f277af1c]
```

Y los casi iguales, por distancia de edición sobre el nombre normalizado:

```
pares con distancia <= 2 (sobre nombres normalizados): 2
  d=0  Wave Rimout  ↔  Wave Rimout
  d=2  TATA FOOT    ↔  ZETA FOOT
```

El par que mencionaste, `First Queen` / `Fist Queen`, **ya no está**: se unificó
el 2026-08-23 (`docs/PLAN_DUPLICADOS_SPC.md`, se borró `Fist Queen`). Queda el de
`Wave Rimout`.

### 3.2 Cobertura de los campos candidatos

```sql
SELECT count(*) AS total, count(fecha_nacimiento) AS con_fnac, count(sexo) AS con_sexo,
  count(color) AS con_color, count(studbook_id) AS con_sb,
  count(*) FILTER (WHERE padrillo_nombre IS NOT NULL AND madre_nombre IS NOT NULL) AS con_padre_madre,
  min(length(nombre)) AS nombre_mas_corto,
  count(*) FILTER (WHERE nombre <> translate(nombre,'áéíóúñüÁÉÍÓÚÑÜ','aeiounuAEIOUNU')) AS con_acento
FROM spcs;
```
```
 total | con_fnac | con_sexo | con_color | con_sb | con_padre_madre | nombre_mas_corto | con_acento
-------+----------+----------+-----------+--------+-----------------+------------------+------------
   181 |      181 |      181 |       160 |     67 |             180 |                5 |          8
```

| Campo | Cobertura | ¿Va? | Por qué |
|---|---|---|---|
| Sexo | 100% | sí (ya estaba) | — |
| Fecha nac. + **edad** | 100% | sí | La condición del turno **siempre** tiene rango de edad. Es el dato que decide si el caballo entra. |
| Padre × madre | 99,4% | sí | Es como se identifica un ejemplar en el ambiente cuando dos comparten nombre. |
| Stud Book | **37,0%** | sí, **condicional** | Desambigua sin ambigüedad cuando está; con 37% de cobertura no puede ser la columna fija. |
| Color | 88,4% | **no** | No desambigua el duplicado real (ver abajo) y suma ruido. |

`nombre_mas_corto = 5` es lo que justifica el umbral de 3: ningún ejemplar queda
fuera de alcance.

### 3.3 Lo que estos chips NO resuelven

Honestidad sobre el alcance: **los chips no desambiguan `Wave Rimout`.**

```sql
SELECT id, nombre, sexo, fecha_nacimiento, color, studbook_id,
       padrillo_nombre, madre_nombre, entrenador_id
FROM spcs WHERE lower(nombre) = 'wave rimout';
```
```
5ebc5e48… | Wave Rimout | macho | 2017-08-08 | Zaino | null | Remote (GB) | Holiday Wave | e23c1260…
f277af1c… | Wave Rimout | macho | 2017-08-08 | null  | null | Remote (GB) | Holiday Wave | null
```

Sexo, fecha, padre y madre son **idénticos**; no hay Stud Book en ninguno de los
dos. Lo único que difiere es el color (uno lo tiene cargado, el otro no) y el
entrenador. Con lo que se muestra, las dos sugerencias se ven exactamente iguales.

**Esto no es un problema de pantalla, es un dato duplicado en el padrón**, del
mismo tipo que los que se limpiaron el 23/08. Ningún diseño de sugerencia lo
arregla: el arreglo es unificar las dos filas. Lo dejo señalado, no lo toco —
borrar un SPC no está en el alcance de este pedido y hay inscripciones que
podrían colgar de cualquiera de los dos ids.

El otro par sí queda distinguido: `TATA FOOT` (5 años, madre *Astata Ride*) vs
`ZETA FOOT` (6 años, madre *Bailanta Doom*, SB 423360).

---

## 4. El cambio

```
 migrations/rpc_padron_spcs.sql |  54 +++++
 portal.html                    | 112 ++++++++--
 tests/probe_buscador_spc.mjs   | 453 +++++++++++++++++++++++++++++++++++++++++
 3 files changed, 598 insertions(+), 21 deletions(-)
```

Más `migrations/rpc_padron_spcs.sql` y `tests/probe_buscador_spc.mjs`, nuevos.

### 4.1 Comportamiento

| | antes | ahora |
|---|---|---|
| Sugiere desde | 2 caracteres | **3** |
| Espera | 250 ms + viaje | ninguna |
| Coincidencia | `ILIKE '%q%'` (cualquier posición) | `includes` (cualquier posición) |
| Mayúsculas | insensible | insensible |
| **Acentos** | **sensible** — "saltena" → 0 | **insensible** — "saltena" → CHINITA SALTEÑA |
| Orden | `ORDER BY nombre` | los que **empiezan** con el término, primero |
| Chips | sexo, fecha nac. | sexo, **edad** + fecha nac., **SB** (si hay), **padre × madre** |

Subir el umbral de 2 a 3 es lo que pediste explícitamente ("desde el tercer
carácter"). No deja ningún ejemplar fuera: el nombre más corto tiene 5 letras.

### 4.2 Tres detalles del diff que vale la pena mirar

**a) La edad sale del helper compartido, no de una copia nueva.**
La primera versión que escribí tenía su propia `edadReglamentaria()`. Estaba mal:
divergía de `fn_edad_reglamentaria` de la base, que ignora el mes de nacimiento.
Con `nac = 2022-03-15` y `ref = 2026-09-08`, la base decía 4 y la mía 5. Lo
reemplacé por `edad-spc.js`, el helper que ya usa la secretaría, cargado con
`<script src="edad-spc.js">`. La regla del 1° de julio queda en dos lugares
—la base y `edad-spc.js`— y no en tres.

**b) Se eliminó `buscarTimer`.** Sin viaje al servidor no hay debounce que
cancelar; quedaban tres referencias a una variable que ya nadie asignaba.

**c) El comentario del orden citaba un caballo inexistente.** Había escrito
"buscar «la» tiene que traer LA ALFARERA antes que ESCUCHAR TU VOZ". `LA ALFARERA`
existe; `ESCUCHAR TU VOZ` **no está en el padrón** — lo inventé. Corregido al caso
real y verificado, que además es el que asertea el probe:

```sql
WITH n AS (SELECT nombre, lower(translate(nombre,'áéíóúÁÉÍÓÚñÑüÜ','aeiouAEIOUnNuU')) AS b FROM spcs)
SELECT nombre, b, b LIKE 'rio%' AS empieza FROM n WHERE b LIKE '%rio%' ORDER BY empieza DESC, b;
```
```
    nombre     |       b       | empieza
---------------+---------------+---------
 Río Salado    | rio salado    | t
 BESO CURIOSO  | beso curioso  | f
 CURIOSA GO ON | curiosa go on | f
 FURIOSO ON    | furioso on    | f
 La Criolla    | la criolla    | f
```

### 4.3 Lo que NO cambia

**Cualquier entrenador puede anotar cualquier SPC.** Regla confirmada por Fede y
Yesi el 26/08. El RPC devuelve el padrón completo, sin filtro de tenencia, y el
assert `S2` lo verifica: 181 de 181 visibles para un entrenador cualquiera. Esto
es sólo cómo se encuentra el caballo.

---

## 5. Probe

`tests/probe_buscador_spc.mjs` — 25 asserts. Cubre exactamente los casos que
pediste, más el guard del RPC y el teardown.

### 5.1 Dos cosas de método

**Corre firmado como usuario de portal, no con la clave de servicio.** La primera
versión usaba la secret key y el RPC contestó `No autorizado.` — correctamente:
con la clave de servicio `auth.uid()` es NULL. El probe crea un profesional +
usuario de portal efímeros, entra por magic link, corre el código real con esa
sesión y borra todo en el `finally`.

**El oráculo no es la pantalla** (GOTCHA #93). El padrón se lee **aparte**, con la
clave de servicio y sin pasar por el buscador; el assert `B3` compara, para once
términos, que el conjunto que devuelve el buscador sea **exactamente** el de
filtrar ese padrón por afuera. Más casos concretos escritos a mano
(`quita → MOSQUITA GARDEN`, `saltena → CHINITA SALTEÑA`).

### 5.2 Salida cruda

```
$ set -a; . ./.env; set +a
$ node tests/probe_buscador_spc.mjs

── Probe · buscador de SPC del portal ──
   portal=/home/clio/dev/SGH/portal.html
   edad=/home/clio/dev/SGH/edad-spc.js
 ✅ C1) el umbral está en 3 caracteres  → MIN=3
 ✅ C0) un ENTRENADOR trae el padrón COMPLETO — misma cuenta que el oráculo  → buscador=181 · oráculo=181
 ✅ C2) el padrón se cachea: la segunda llamada no lo vuelve a pedir
 ✅ C3) el payload es chico — filtrar en el cliente es viable  → 181 SPC · 45808 bytes
 ✅ C4) sin sesión el RPC rechaza — el padrón no queda público  → No autorizado.
 ✅ U1) con MENOS de 3 caracteres no sugiere nada  → ''=0 'w'=0 'wa'=0
 ✅ U2) con 3 caracteres YA sugiere  → 'wav'=2 · 'rio'=5
 ✅ U3) onBuscarSpc respeta el umbral: abajo de 3 vuelve a la lista propia
 ✅ B1) coincide en el MEDIO: "quita" encuentra "MOSQUITA GARDEN"  → → [MOSQUITA GARDEN]
 ✅ B2) coincide al FINAL: "garden" encuentra "MOSQUITA GARDEN"  → → [MOSQUITA GARDEN]
 ✅ B3) para 11 términos el resultado es EXACTAMENTE el del padrón real filtrado aparte  → quita:1 chinita:1 saltena:1 SALTEÑA:1 wave:2 first:1 foot:2 gauch:4 rio:5 río:5 zzz:0
 ✅ B4) los que EMPIEZAN con el término van primero  → "rio" → [Río Salado,BESO CURIOSO,CURIOSA GO ON,FURIOSO ON,La Criolla]
 ✅ A1) SIN acentos encuentra CON acentos: "saltena" → "CHINITA SALTEÑA"  → → [CHINITA SALTEÑA]
 ✅ A2) insensible a mayúsculas: "CHINITA", "chinita" y "ChInItA" dan lo mismo  → → [CHINITA SALTEÑA]
 ✅ D0) el duplicado real aparece dos veces — el nombre solo NO alcanza  → "wave rimout" → 2: [Wave Rimout/5ebc5e48,Wave Rimout/f277af1c]
 ✅ D1) la sugerencia muestra la EDAD además de la fecha  → ABELITO MIMOSO (2022-11-10) → "4 años · 10/11/2022"
 ✅ D2) el render incluye padre × madre y el Stud Book condicional
 ✅ D3) la edad mostrada coincide con fn_edad_reglamentaria de la base  → base=4 · buscador="4 años · 10/11/2022"
 ✅ D4) la regla del 1° de julio coincide con la base a los DOS lados del corte  → 5 pares, incluidos 3 con ref anterior al 1/7
 ✅ E1) un nombre inexistente devuelve lista vacía, sin explotar
 ✅ E2) onBuscarSpc con un nombre inexistente deja resultados vacíos, no null
 ✅ E3) null / undefined / espacios no rompen la normalización
 ✅ S1) elegir una sugerencia carga el SPC correcto (id → misma fila en la base)  → CHINITA SALTEÑA · f3b5ea21-49c9-44ff-a317-3fc5da91bf1c
 ✅ S2) la regla no cambia: se busca sobre TODO el padrón, sin filtro de tenencia  → 181 de 181 visibles para un entrenador cualquiera
 ✅ T1) el teardown deja el namespace del probe vacío  → usuarios=0 · profesionales=0

25/25 OK
```

### 5.3 Los casos que pediste, uno por uno

| Pedido | Assert |
|---|---|
| Con menos de 3 caracteres no sugiere | `U1`, `U3` |
| Con 3 sugiere | `U2` |
| Coincidencia parcial en cualquier posición | `B1` (medio), `B2` (final), `B3` (contra el oráculo) |
| Sin acentos y sin importar mayúsculas | `A1`, `A2`, y `B3` con `saltena` / `SALTEÑA` / `rio` / `río` |
| Elegir una sugerencia carga el SPC correcto | `S1` — el id que trae el buscador se relee en la base y tiene que ser la misma fila |
| Un nombre inexistente no rompe nada | `E1`, `E2`, `E3` |

### 5.4 Mutation testing — 10/10 muertos

```
$ node tests/probe_buscador_spc.mjs --mutantes

═══ MUTATION TESTING · 10/10 mutantes ═══
(copias en /tmp/mut-buscador-xN9xA5 — el repo no se toca)

✅ M1 muere — el umbral baja a 1 carácter  [esperaba matar U1; murieron U1]
✅ M2 muere — el umbral sube a 4 — con 3 ya no sugiere  [esperaba matar U2; murieron U2]
✅ M3 muere — la coincidencia pasa a ser por PREFIJO — "quita" pierde MOSQUITA  [esperaba matar B1,B2,B3; murieron B1,B2,B3]
✅ M4 muere — se pierde la insensibilidad a ACENTOS  [esperaba matar A1,B3; murieron A1,B3]
✅ M5 muere — se pierde la insensibilidad a MAYÚSCULAS  [esperaba matar A2,B3; murieron A2,B3]
✅ M6 muere — el padrón no se cachea: cada búsqueda lo vuelve a pedir  [esperaba matar C2; murieron C2]
✅ M7 muere — los que EMPIEZAN con el término dejan de ir primero  [esperaba matar B4; murieron B4]
✅ M8 muere — onBuscarSpc deja de respetar el umbral  [esperaba matar U3; murieron U3]
✅ M9 muere — la sugerencia deja de mostrar la edad  [esperaba matar D1; murieron D1]
✅ M10 muere — la edad ignora el corte del 1° de julio  [esperaba matar D4; murieron D4]

✅ TANDA LIMPIA — 10 probados · 10 muertos

```

Tres mutantes obligaron a arreglar el probe, no al revés:

**M7 sobrevivió la primera vez.** Mi mutante era `const pa = 0` — deja el
comparador asimétrico e inconsistente, y el orden que sale depende del algoritmo
de `sort`, no de la regla. Con estos datos el prefijo seguía saliendo primero.
Lo cambié por el mutante que expresa de verdad "se cae la prioridad de prefijo":
`return a._busca.localeCompare(b._busca)`. Ahí murió.

**M10 sobrevivió — y es el hallazgo de método de esta entrega.** El mutante borra
`if (ref.mes < 7) edad--`, o sea el corte del 1° de julio. No mataba a `D3`
porque **hoy es septiembre**: con la fecha de referencia implícita en "hoy", esa
rama ni se ejecuta. El assert que decía medir la regla del 1° de julio no la
medía la mitad del año. Es GOTCHA #94 otra vez —*el fixture tiene que incluir el
caso que el assert dice medir*—. Agregué `D4`, que fija la referencia a mano a
los dos lados del corte y contrasta contra `fn_edad_reglamentaria`:

```javascript
const PARES = [
  ['2022-11-10', '2026-06-30'],   // antes del corte
  ['2022-11-10', '2026-07-01'],   // el día del corte
  ['2022-11-10', '2026-09-08'],
  ['2018-09-02', '2026-02-15'],   // antes del corte, nacido después de julio
  ['2018-09-02', '2026-12-31'],
];
```

Con `D4`, M10 muere.

**M5 dio "error de arnés" en vez de morir.** Al perder el `toLowerCase()`, la
búsqueda de `S1` volvía vacía y `elegido.id` tiraba `TypeError` antes de la línea
`NN/NN OK`, que es lo que distingue un mutante muerto de un arnés roto
(GOTCHA #84). Blindé `S1` para que falle como assert en vez de explotar.

### 5.5 Teardown verificado por estado

La corrida completa de mutantes se murió una vez por SIGKILL (memoria), y ahí se
vio el agujero: una corrida matada nunca llega al `finally`. Quedaron colgados un
profesional y un usuario de auth:

```sql
SELECT (SELECT count(*) FROM usuarios      WHERE email LIKE 'probe-spc-%@sgh-probe.invalid') AS usuarios_probe,
       (SELECT count(*) FROM profesionales WHERE nombre = 'PROBE-SPC')                        AS profesionales_probe,
       (SELECT count(*) FROM auth.users    WHERE email LIKE 'probe-spc-%@sgh-probe.invalid') AS auth_probe,
       (SELECT count(*) FROM spcs)                                                            AS spcs;
```
```
 usuarios_probe | profesionales_probe | auth_probe | spcs
----------------+---------------------+------------+------
              0 |                   1 |          1 |  181
```

Los borré (ambos del run `r28t8p`, 11:38 UTC — el de la corrida matada) y agregué
dos cosas al probe:

- `barrerHuerfanos()` al arrancar, acotado al namespace `probe-spc-*` /
  `PROBE-SPC`, para que una corrida matada no deje basura para siempre;
- el assert `T1`, que verifica **por estado** que después de limpiar no queda
  nada — no contando filas (GOTCHA #77).

Estado final:

```
 usuarios_probe | profesionales_probe | auth_probe | spcs
----------------+---------------------+------------+------
              0 |                   0 |          0 |  181
```

---

## 6. Diff completo de `portal.html`

`git diff main feat/buscador-spc-autocompletado -- portal.html`

```diff
diff --git a/portal.html b/portal.html
index acecc4a..55d0dec 100644
--- a/portal.html
+++ b/portal.html
@@ -287,6 +287,11 @@
      ganancia_minima aplicado (GOTCHA #63, regla de Yesica). El portal era la
      única pantalla que no cargaba este helper y por eso mostraba el nominal. -->
 <script src="premios-utils.js"></script>
+<!-- edadSPC(): la regla del 1° de julio, la MISMA que usa la secretaría y que
+     fn_edad_reglamentaria en la base. Se carga el helper compartido en vez de
+     reimplementarla acá: una tercera copia de la misma regla es una tercera
+     copia que se puede desincronizar. -->
+<script src="edad-spc.js"></script>
 <script>
 let sb, currentUser, miUsuarioId = null, esEntrenador = false, miProfesionalId = null;
 let misCaballos = [], misInscripciones = [];
@@ -654,27 +659,87 @@ let carreraSeleccionada = null;
 // entrenador puede anotar cualquier SPC). null = no hay búsqueda activa y el
 // modal muestra la lista corta de caballos propios, que es el caso frecuente.
 let resultadosBusqueda = null;
-let buscarTimer = null;
 
-function onBuscarSpc(q) {
-  clearTimeout(buscarTimer);
-  const t = (q || '').trim();
-  // El RPC exige 2 caracteres; abajo de eso se vuelve a la lista propia.
-  if (t.length < 2) { resultadosBusqueda = null; renderListaCaballosModal(); return; }
+// ── El padrón, traído UNA vez al abrir el modal ─────────────────────────────
+// 181 ejemplares: 42,5 kB de JSON, ~11 kB por el cable con gzip (medido el
+// 08/09/2026). Filtrar en el cliente en vez de consultar por tecla da respuesta
+// instantánea y —lo que importa— búsqueda insensible a
+// ACENTOS: `unaccent` no está instalada en la base (GOTCHA #71) e `ILIKE` no es
+// acento-insensible, así que contra el servidor "saltena" no encontraba
+// "CHINITA SALTEÑA". En JS se resuelve con normalize('NFD').
+let padronSpcs = null;
+
+async function cargarPadronSpcs() {
+  if (padronSpcs !== null) return;
+  const { data, error } = await sb.rpc('rpc_padron_spcs');
+  if (error) { console.error('[rpc_padron_spcs]', error); throw error; }
+  padronSpcs = (data || []).map(r => ({ ...r, _busca: normalizarBusqueda(r.nombre) }));
+}
 
-  const cont = document.getElementById('minsc-lista');
-  cont.innerHTML = '<div class="loading-state"><div class="spinner"></div> Buscando…</div>';
-
-  buscarTimer = setTimeout(async () => {
-    const { data, error } = await sb.rpc('rpc_buscar_spc', { p_q: t });
-    if (error) {
-      console.error('[rpc_buscar_spc]', error);
-      cont.innerHTML = `<div style="font-size:13px;color:var(--danger);padding:8px 0;">${esc(error.message)}</div>`;
-      return;
-    }
-    resultadosBusqueda = data || [];
+// Minúsculas + sin acentos ni ñ. NFD separa la letra base del diacrítico y el
+// rango \u0300-\u036f los borra: "SALTEÑA" → "saltena", "Río" → "rio".
+// El nombre solo no alcanza para elegir: en el padrón hay un duplicado exacto
+// ("Wave Rimout" ×2) y un par casi igual ("TATA FOOT" / "ZETA FOOT"). Se
+// muestra, además del sexo:
+//   · EDAD — cobertura 100%, y es el dato que decide si el caballo entra en la
+//     condición del turno, que siempre tiene rango de edad;
+//   · PADRE × MADRE — cobertura 99%, y es como se identifica un ejemplar en el
+//     ambiente cuando dos comparten nombre;
+//   · Stud Book — cobertura 37%, así que va sólo cuando existe.
+// El color quedó afuera: 88% de cobertura y no desambigua el duplicado real.
+//
+// La edad sale de edadSPCTexto() (edad-spc.js), la regla del 1° de julio. Sin
+// fecha de referencia usa hoy, que es lo correcto acá: el buscador no cuelga de
+// ninguna reunión.
+function edadYNacimiento(fechaNac) {
+  const txt = edadSPCTexto(fechaNac);
+  const corta = fechaCorta(fechaNac);
+  return txt ? `${txt} · ${corta}` : corta;
+}
+
+function normalizarBusqueda(s) {
+  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
+}
+
+// Desde cuántos caracteres se sugiere. El nombre más corto del padrón tiene 5,
+// así que 3 no deja ningún ejemplar fuera de alcance.
+const MIN_CHARS_BUSQUEDA = 3;
+
+// Sugerencias mientras se tipea, contra el padrón ya cargado en memoria.
+// Sin debounce y sin viaje al servidor: filtrar 181 nombres es instantáneo.
+// Coincidencia parcial en CUALQUIER posición —"quita" encuentra "MOSQUITA
+// GARDEN"— e insensible a mayúsculas y acentos.
+function onBuscarSpc(q) {
+  const t = normalizarBusqueda(q);
+  if (t.length < MIN_CHARS_BUSQUEDA) {
+    resultadosBusqueda = null;
     renderListaCaballosModal();
-  }, 250);
+    return;
+  }
+  if (padronSpcs === null) {
+    // El padrón se pide al abrir el modal; si todavía no llegó, se avisa en vez
+    // de mostrar "sin resultados", que sería mentira.
+    document.getElementById('minsc-lista').innerHTML =
+      '<div class="loading-state"><div class="spinner"></div> Cargando el padrón…</div>';
+    return;
+  }
+  resultadosBusqueda = buscarEnPadron(t);
+  renderListaCaballosModal();
+}
+
+// Separada de onBuscarSpc para poder probarla sin DOM.
+// Los que empiezan con el término van primero: "rio" tiene que traer
+// "Río Salado" antes que "BESO CURIOSO", que también contiene "rio".
+function buscarEnPadron(termino) {
+  const t = normalizarBusqueda(termino);
+  if (t.length < MIN_CHARS_BUSQUEDA) return [];
+  return (padronSpcs || [])
+    .filter(r => r._busca.includes(t))
+    .sort((a, b) => {
+      const pa = a._busca.startsWith(t) ? 0 : 1;
+      const pb = b._busca.startsWith(t) ? 0 : 1;
+      return pa !== pb ? pa - pb : a._busca.localeCompare(b._busca);
+    });
 }
 
 // Inscripciones crudas del usuario. La policy de SELECT ya las limita a los
@@ -777,7 +842,6 @@ function abrirInscripcion(carreraId, reunionId) {
   vm.style.display = 'none'; vm.className = 'validation-msg';
 
   resultadosBusqueda = null;
-  clearTimeout(buscarTimer);
   document.getElementById('minsc-buscar').value = '';
   renderListaCaballosModal();
   document.getElementById('modal-inscribir').classList.add('open');
@@ -785,6 +849,10 @@ function abrirInscripcion(carreraId, reunionId) {
   // El padrón se carga después de abrir: el modal se ve al instante y los
   // selects pasan de "Cargando…" a la lista. Si falla, se avisa en el mismo
   // bloque de validación en vez de dejar tres selects mudos.
+  // El padrón del buscador se pide junto con el de monta: así, para cuando el
+  // usuario tipea la tercera letra, ya está en memoria.
+  cargarPadronSpcs().catch(err => console.error('[padron spcs]', err));
+
   cargarCaballerizaPorDefecto()
     .then(cargarPadronMonta)
     .then(renderSelectsMonta)
@@ -850,7 +918,10 @@ function renderListaCaballosModal() {
         <div style="font-family:'Playfair Display',serif;color:var(--accent);font-size:15px;">${esc(c.nombre)}</div>
         <div class="carrera-chips" style="margin-top:4px;">
           <span class="chip">${esc(c.sexo || '—')}</span>
-          ${c.fecha_nacimiento ? `<span class="chip">${esc(fechaCorta(c.fecha_nacimiento))}</span>` : ''}
+          ${c.fecha_nacimiento ? `<span class="chip">${esc(edadYNacimiento(c.fecha_nacimiento))}</span>` : ''}
+          ${c.studbook_id ? `<span class="chip">SB ${esc(c.studbook_id)}</span>` : ''}
+          ${c.padrillo_nombre || c.madre_nombre
+            ? `<span class="chip">${esc(c.padrillo_nombre || '?')} × ${esc(c.madre_nombre || '?')}</span>` : ''}
           ${noHabilitado ? `<span class="chip" style="color:var(--danger);border-color:rgba(224,82,82,0.35);">no habilitado (${esc(c.estado || '—')})</span>` : ''}
           ${aviso}
         </div>
@@ -868,7 +939,6 @@ function closeModalInscribir() {
   document.getElementById('modal-inscribir').classList.remove('open');
   carreraSeleccionada = null;
   resultadosBusqueda = null;
-  clearTimeout(buscarTimer);
 }
 
 // Toda la escritura pasa por rpc_inscribir. El portal NO tiene INSERT sobre
```

## 7. La migración

`migrations/rpc_padron_spcs.sql`

```sql
-- ============================================================================
-- rpc_padron_spcs.sql
--
-- Padrón completo de SPC para el buscador del modal de anotar (portal.html).
--
-- POR QUÉ UN RPC Y NO UN SELECT
-- La policy `spcs_select` deja a un usuario de portal ver SÓLO sus ejemplares
-- visibles (`fn_mis_spc_visibles()`); el padrón entero es staff-only. Por eso
-- `rpc_buscar_spc` ya era SECURITY DEFINER, y por eso esto también lo es.
--
-- POR QUÉ TRAER TODO EN VEZ DE CONSULTAR POR TECLA
-- El padrón son 181 ejemplares: 42,5 kB de JSON con las diez columnas que
-- devuelve esta función, ~11 kB por el cable con el gzip que ya aplica PostgREST.
-- Medido el 08/09/2026 (assert C3 del probe). Traerlo una vez al abrir el modal
-- y filtrar en el cliente da:
--   · respuesta instantánea desde la primera letra, sin debounce ni viaje;
--   · búsqueda insensible a acentos gratis, con normalize('NFD') en JS —
--     `unaccent` NO está instalada en la base (GOTCHA #71) y `ILIKE` no es
--     acento-insensible: hoy "saltena" no encuentra "CHINITA SALTEÑA";
--   · una consulta por sesión en vez de una por tecla.
-- Consultar por tecla sólo se justificaría con miles de ejemplares.
--
-- ES ADITIVO: función nueva. No cambia `rpc_buscar_spc`, que sigue existiendo
-- y sigue siendo la que usa la UI desplegada hasta que se mergee la rama.
--
-- Informe: docs/diagnosticos/2026-09-08_buscador-spc-autocompletado.md
-- Probe:   tests/probe_buscador_spc.mjs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_padron_spcs()
 RETURNS TABLE(id uuid, nombre text, sexo text, fecha_nacimiento date,
               color text, studbook_id text, padrillo_nombre text,
               madre_nombre text, estado text, habilitado boolean)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Misma autorización que rpc_buscar_spc: staff o usuario de portal.
  IF NOT ((SELECT fn_is_staff()) OR (SELECT fn_is_portal_user())) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  RETURN QUERY
    SELECT s.id, s.nombre::text, s.sexo::text, s.fecha_nacimiento,
           s.color::text, s.studbook_id::text,
           s.padrillo_nombre::text, s.madre_nombre::text,
           s.estado::text,
           (s.estado = 'activo') AS habilitado
      FROM spcs s
     ORDER BY s.nombre;
END;
$function$;
```

---

## 8. Verificación del gate

La rama está pusheada y **sin mergear**, como pediste.

```
$ git push -u origin feat/buscador-spc-autocompletado
To github.com:mdqclio/SGH.git
 * [new branch]      feat/buscador-spc-autocompletado -> feat/buscador-spc-autocompletado
branch 'feat/buscador-spc-autocompletado' set up to track 'origin/feat/buscador-spc-autocompletado'.

$ git ls-remote origin feat/buscador-spc-autocompletado
5ab83206e29d54586654580662bff7b6e961e2f6	refs/heads/feat/buscador-spc-autocompletado

$ git rev-parse HEAD
5ab83206e29d54586654580662bff7b6e961e2f6
```

Coinciden. Nada mergeado a `main`.

---

## 9. Números de resumen

| | |
|---|---|
| Archivos tocados | 1 modificado (`portal.html`), 2 nuevos |
| Líneas | +90 / −18 en `portal.html` |
| Asserts del probe | **25/25** |
| Mutantes | **10/10 muertos** |
| Padrón | 181 SPC · 42,5 kB JSON · 11 kB gzip |
| Consultas por sesión | 1 (antes: una por ráfaga de tecleo) |
| Umbral | 3 caracteres (antes 2) |
| Nombres con acento que antes no se encontraban sin tilde | 8 |
| Duplicados exactos en el padrón | 1 par (`Wave Rimout`) |
| Casi iguales (distancia ≤ 2) | 1 par (`TATA FOOT` / `ZETA FOOT`) |

---

## 10. Preguntas abiertas

1. **`Wave Rimout` está duplicado.** Dos filas idénticas en todo salvo el color
   (una lo tiene, la otra no) y el entrenador. Ningún diseño de sugerencia las
   distingue. ¿Se unifican como se hizo con `Fist Queen` y `Malenuchi` el 23/08?
   Hay que ver antes de qué id cuelgan las inscripciones existentes.

2. **`inscripciones.html` tiene el mismo agujero de acentos**, más un
   `.limit(10)` que corta en silencio y hoy queda justo al borde del peor caso
   del padrón (10). No lo toqué, como pediste. ¿Va como entrega aparte?

3. **`rpc_buscar_spc` queda sin usuarios en el portal** si esto se mergea.
   `inscripciones.html` no la usa (va por PostgREST directo). ¿Se deja como está
   o se unifican las dos pantallas contra `rpc_padron_spcs`?

4. **`rpc_padron_spcs` ya está en producción**, aditiva y sin llamadores. Si
   decidís no mergear la rama, hay que borrarla.

5. **El Stud Book tiene 37% de cobertura.** Es el único campo que desambigua sin
   ambigüedad. ¿Vale la pena completarlo, aunque sea para los ejemplares que
   corren seguido?

---

## 11. Cómo reproducir

```bash
git checkout feat/buscador-spc-autocompletado
set -a; . ./.env; set +a
node tests/probe_buscador_spc.mjs                    # 25 asserts
node --max-old-space-size=512 tests/probe_buscador_spc.mjs --mutantes   # 10 mutantes
```

La tanda completa de mutantes puede morir por SIGKILL en una máquina con poca
memoria libre; en ese caso corre por lotes:

```bash
node tests/probe_buscador_spc.mjs --mutantes=M1,M2,M3
```
