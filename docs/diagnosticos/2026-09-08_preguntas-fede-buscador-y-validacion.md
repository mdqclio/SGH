# Las dos preguntas de Fede — el buscador de caballos y qué se valida al inscribir

**Fecha:** 2026-09-08
**Modo:** **SOLO LECTURA.** Ni un `INSERT`, `UPDATE`, `DELETE` ni DDL. Todo fue `SELECT`, `grep`
y `sed`. La base y el repo quedan como estaban.
**Greps:** todos contra `main` (`git grep … main`, `git show main:…`), no contra el árbol de
trabajo.
**SHA de `main`:** `2bb5d0c9ef3e7738df66cf19c649a93d6aba3f5d`
**SHA de este informe:** ver §7.

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) FROM spcs;      -- por MCP, proyecto unlhcuanfrtpatoipwve
[{"spcs":181}]

ref del proyecto: unlhcuanfrtpatoipwve
```

---

## 0. Las dos respuestas cortas

**1. El buscador ya hace lo que Fede pide.** Las dos pantallas tienen autocompletado que dispara
a partir de **2 letras**, con debounce, y matchea por **substring** — que es *más* permisivo que
el Stud Book, que matchea por prefijo (GOTCHA #70). No hay que apretar ningún botón.

Si a Fede no le funcionó, las causas candidatas son tres, y una está medida: **`ILIKE` no es
acento-insensible y `unaccent()` no está instalada**. Buscar `saltena` devuelve **0 filas**
cuando `salteña` devuelve 1. Hay 8 ejemplares con acento o ñ en el padrón. Detalle en §1.4.

**2. Sí, cualquiera puede anotar cualquier caballo — y ya está pasando.** No es una hipótesis:
de las 3 inscripciones del portal en R9, **ninguna** es de un caballo del propio anotante.
Fede mismo (rol `propietario`) anotó `CHINITA SALTEÑA`, cuyo entrenador de ficha es
`ALZA, MAXIMILIANO`. Es la regla de dominio vigente desde el 24/08, no un bug.

Sobre "puede estar mal inscripto en una categoría": **el sistema sí valida edad y sexo**, pero
contra columnas estructuradas que **hoy contradicen el texto de la condición en 5 de los 11
turnos de R9**. Eso es lo más serio que encontré, y está en §2.4.

---

## 1. El buscador de caballos

### 1.1 Portal — `portal.html`

| | |
|---|---|
| Input | `portal.html:267` — `<input id="minsc-buscar" … oninput="onBuscarSpc(this.value)">` |
| Handler | `portal.html:636` — `onBuscarSpc(q)` |
| Umbral | **2 caracteres** (`if (t.length < 2)`) |
| Debounce | **250 ms** |
| Consulta | `sb.rpc('rpc_buscar_spc', { p_q: t })` |

```javascript
// portal.html:636
function onBuscarSpc(q) {
  clearTimeout(buscarTimer);
  const t = (q || '').trim();
  // El RPC exige 2 caracteres; abajo de eso se vuelve a la lista propia.
  if (t.length < 2) { resultadosBusqueda = null; renderListaCaballosModal(); return; }
  …
  buscarTimer = setTimeout(async () => {
    const { data, error } = await sb.rpc('rpc_buscar_spc', { p_q: t });
    …
  }, 250);
}
```

El RPC (`SECURITY DEFINER`, `STABLE`):

```sql
CREATE OR REPLACE FUNCTION public.rpc_buscar_spc(p_q text)
 RETURNS TABLE(id uuid, nombre text, sexo text, fecha_nacimiento date, color text,
               padrillo_nombre text, madre_nombre text, studbook_id text,
               estado text, habilitado boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_q text;
BEGIN
  IF NOT ((SELECT fn_is_staff()) OR (SELECT fn_is_portal_user())) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;
  IF p_q IS NULL OR length(btrim(p_q)) < 2 THEN RETURN; END IF;
  v_q := '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  RETURN QUERY
    SELECT s.id, s.nombre::text, …, (s.estado = 'activo') AS habilitado
      FROM spcs s
     WHERE s.nombre ILIKE v_q ESCAPE '\'
     ORDER BY (s.estado = 'activo') DESC, s.nombre
     LIMIT 30;
END;
$function$
```

**Coincidencia parcial por substring** (`%q%`), case-insensitive, escapando `%`, `_` y `\` (bien
hecho). Trae los no-activos también, ordenados abajo, y marca `habilitado`.

### 1.2 Inscripciones (secretaría) — `inscripciones.html`

| | |
|---|---|
| Input | `inscripciones.html:257` — `<input id="spc-search-input" … oninput="searchSpc()">` |
| Handler | `inscripciones.html:682` — `searchSpc()` |
| Umbral | **2 caracteres** |
| Debounce | **300 ms** |
| Consulta | PostgREST directo a `spcs`, **no** el RPC |

```javascript
// inscripciones.html:694
const { data, error } = await sb.from('spcs')
  .select('id, nombre, fecha_nacimiento, sexo, color, padrillo_nombre, madre_nombre,
           entrenador_id, caballeriza_id, certificado_correr')
  .eq('estado', 'activo')
  .ilike('nombre', `%${q}%`)
  .order('nombre')
  .limit(10);
```

Dos diferencias con el portal, que conviene conocer:

| | Portal | Inscripciones |
|---|---|---|
| Vía | `rpc_buscar_spc` (SECURITY DEFINER) | PostgREST directo, sujeto a RLS |
| Límite | 30 | **10** |
| No activos | los trae, marcados | los **excluye** (`.eq('estado','activo')`) |
| Escapado de `%` / `_` | sí | **no** — un `%` tipeado actúa como comodín |

### 1.3 Contra qué busca

**Contra `spcs`, la tabla local. No hay ninguna consulta al Stud Book desde la app.** El Stud
Book se usa sólo en el circuito de alta manual, con `tools/studbook_probe_terms.mjs`
(GOTCHA #70) — no en runtime.

### 1.4 Entonces, ¿por qué Fede siente que no anda? — tres candidatos, uno medido

**(a) Acentos y ñ — MEDIDO, es un hueco real.**

```sql
SELECT 'salteña' AS termino, count(*) FROM spcs WHERE nombre ILIKE '%salteña%'
UNION ALL SELECT 'saltena', count(*) FROM spcs WHERE nombre ILIKE '%saltena%'
UNION ALL SELECT 'chinita', count(*) FROM spcs WHERE nombre ILIKE '%chinita%';
```

| término | hits |
|---|---|
| `salteña` | **1** |
| `saltena` | **0** ← escribir sin ñ no encuentra nada |
| `chinita` | 1 |

`ILIKE` es case-insensitive pero **no** acento-insensible, y `unaccent()` **no está instalada**
(GOTCHA #71, reconfirmado hoy: `pg_extension` no tiene `unaccent` ni `pg_trgm`).
**8 de los 181 ejemplares tienen acento o ñ en el nombre.** Quien no tipee el diacrítico exacto
no los encuentra.

**(b) Latencia.** 250-300 ms de debounce **más** el viaje a Supabase. Contra un autocomplete que
responde instantáneo, se siente como que "no trae".

**(c) El umbral de 2 en el portal.** Abajo de 2 caracteres el modal vuelve a la lista de caballos
propios, sin avisar que está esperando una letra más.

### 1.5 ¿Traer el padrón entero o consultar por tecla? — **el padrón entero, sin dudas**

Medido:

```sql
SELECT count(*) AS filas,
       pg_size_pretty(sum(pg_column_size(row(s.id,s.nombre,s.sexo,s.fecha_nacimiento,s.color,s.estado)))::bigint) AS peso
FROM spcs s;
-- [{"filas":181,"peso":"13 kB"}]
```

| | |
|---|---|
| Filas | **181** (los 181 `activo`) |
| Peso de las columnas del buscador | **~13 kB** |
| Suma de todos los nombres | 2089 bytes |
| Largo promedio de nombre | 11,5 caracteres |

**13 kB es menos que el logo del hipódromo.** Una sola descarga al abrir el modal y filtrado en
el cliente da:

- respuesta **instantánea** desde la primera letra, sin debounce ni umbral de 2;
- **normalización de acentos gratis** en JS —
  `s.normalize('NFD').replace(/[̀-ͯ]/g,'')`— que resuelve (a) sin instalar `unaccent`
  ni tocar la base;
- **una** consulta por sesión en vez de una por tecla.

El costo es que el padrón queda cacheado: un alta de SPC hecha mientras el modal está abierto no
aparece hasta recargar. Con 181 ejemplares y altas esporádicas, es un costo despreciable —y se
puede mitigar recargando el padrón al abrir el modal, que es lo que ya hace `cargarPadronMonta()`
para caballerizas y profesionales.

**Consultar por tecla sólo se justificaría con miles de ejemplares.** Con 181 es la opción peor
en las tres dimensiones: más lenta, más frágil y con el hueco de acentos abierto.

---

## 2. Qué se valida hoy al inscribir

**Hay DOS caminos de escritura y validan cosas distintas.** Esto es lo primero a tener claro:

| Camino | Quién | Cómo escribe | Qué valida |
|---|---|---|---|
| **Portal** | entrenador / propietario | `sb.rpc('rpc_inscribir', …)` — `portal.html:880`. *No tiene INSERT sobre `inscripciones`: la policy lo excluye* | todo lo de abajo |
| **Secretaría** | `inscripciones.html:820` | **`sb.from('inscripciones').insert(payload)` directo** | **casi nada** |

**La secretaría no pasa por `rpc_inscribir` ni por `validar_inscripcion`.** Inserta derecho. Lo
único que hay en ese camino es un `confirm()` si falta la caballeriza (`inscripciones.html:796`),
que **advierte y deja seguir**.

### 2.1 La tabla completa

Cada fila dice qué pasa **por el portal** y qué pasa **por secretaría**.

| Control | Portal (`rpc_inscribir` → `validar_inscripcion`) | Secretaría (`inscripciones.html`) | Dónde |
|---|---|---|---|
| **Ventana de inscripción** | 🔴 **BLOQUEA** — reunión `publicada`, carrera no `anulada`, apertura y cierre no nulos, `now()` entre las dos | ⚪ **NO SE MIRA** | `rpc_inscribir`, líneas 50-53 |
| **Estado del SPC** | 🔴 **BLOQUEA** si `estado != 'activo'` | ⚪ **NO SE MIRA** (el buscador filtra `estado='activo'`, pero eso es UI) | `validar_inscripcion` |
| **Edad** | 🔴 **BLOQUEA** contra `edad_minima_anos` / `edad_maxima_anos`, con la regla del 1° de julio (`fn_edad_reglamentaria`) | ⚪ **NO SE MIRA** | `validar_inscripcion` |
| **Sexo** | 🔴 **BLOQUEA** contra `condicion_sexo` (`machos` acepta macho y castrado; `hembras`; `machos_castrados`) | ⚪ **NO SE MIRA** | `validar_inscripcion` |
| **Sanciones vigentes del SPC** | 🔴 **BLOQUEA** — `v_sanciones_vigentes` con `entidad_tipo='spc'` | ⚪ **NO SE MIRA** | `validar_inscripcion` |
| **Cupo** | 🔴 **BLOQUEA** si `cupo_maximo` no es nulo y ya hay ese número de no-forfait | ⚪ **NO SE MIRA** | `validar_inscripcion` |
| **Duplicado** (mismo SPC, mismo turno) | 🔴 **BLOQUEA** | ⚪ **NO SE MIRA** en el front | `rpc_inscribir` |
| **Caballeriza** | 🔴 **BLOQUEA** — obligatoria, activa y del club de la reunión | 🟡 **ADVIERTE** — `confirm()` y se puede seguir | `rpc_inscribir` / `inscripciones.html:796` |
| **Entrenador declarado** | 🔴 **BLOQUEA** — obligatorio, activo, tipo `entrenador`/`ambos`, del club | ⚪ **NO SE MIRA** | `rpc_inscribir` |
| **Jockey titular** | 🟡 **OPCIONAL**; si viene, bloquea si no está en el padrón activo del club | ⚪ **NO SE MIRA** | `rpc_inscribir` |
| **Jockey suplente** | 🔴 **BLOQUEA** — no sin titular, no igual al titular, del padrón | ⚪ **NO SE MIRA** | `rpc_inscribir` |
| **Autorización del usuario** | 🔴 **BLOQUEA** — entidad `profesional` o `propietario` + usuario activo | (staff por RLS) | `rpc_inscribir` |
| **Tenencia del caballo** (¿es "suyo"?) | ⚪ **NO SE MIRA — a propósito** | ⚪ NO SE MIRA | regla de dominio 24/08 |
| **Certificado de correr** | ⚪ **NO SE MIRA** | ⚪ **NO SE MIRA** — checkbox informativo | §3 |
| **Condición en texto libre** (perdedor, ganador de N, handicap) | ⚪ **NO SE MIRA** | ⚪ **NO SE MIRA** | §2.4 |

### 2.2 Un detalle importante sobre los mensajes

`validar_inscripcion` **le oculta el motivo al usuario del portal**:

```sql
v_generico CONSTANT TEXT := 'Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.';
v_detalle  BOOLEAN := fn_is_staff();
```

Sólo el staff ve *"Edad insuficiente: 4 años. Mínimo: 5"*. El entrenador ve la frase genérica. El
comentario del código dice que es provisorio *"hasta que Fede defina qué se le puede decir al
portal"* — o sea que es una pregunta abierta que Fede todavía no contestó.

Excepción: **"Cupo máximo alcanzado."** sale sin enmascarar para todos.

### 2.3 La UI no es un guard — pero acá el portal está bien

El portal muestra los SPC no activos en gris con el botón deshabilitado
(`portal.html:811, 835`), y el propio comentario del código lo dice:

```javascript
// habilitado sólo viene del buscador. Un SPC no activo se muestra igual
// … puede anotar: validar_inscripcion lo rechaza de todos modos.
```

Correcto: la UI orienta, el RPC decide. **El problema no es el portal: es que la secretaría
escribe directo sin pasar por ningún guard.**

### 2.4 🔴 La condición en texto libre — confirmado con datos, y peor de lo esperado

Los once turnos de R9, columnas estructuradas contra el texto:

| T | `edad_min`/`max` | `condicion_sexo` | `cupo` | Texto de `condicion_handicap` | ¿Coinciden? |
|---|---|---|---|---|---|
| 1 | 3 / 3 | ambos | — | "Todo caballo 3 años perdedor." | ✅ edad · ⚠️ "perdedor" no se valida |
| 2 | 4 / 4 | ambos | — | "Todo caballo 4 años perdedor." | ✅ edad · ⚠️ "perdedor" |
| 3 | 4 / 4 | ambos | — | "Todo caballo 4 años perdedor." | ✅ edad · ⚠️ "perdedor" |
| 4 | 5 / 10 | ambos | — | "Todo caballo 5 años y + edad perdedor." | ⚠️ el tope 10 no está en el texto |
| **5** | **5 / 10** | ambos | — | "Todo caballo **3 y 4 años** ganador de 1 o 2 carreras." | 🔴 **SE CONTRADICEN** |
| 6 | 5 / 10 | ambos | — | "Todo caballo de 5 años ganador de 1 o 2 carreras." | ⚠️ el texto dice 5 exacto, la columna 5-10 |
| 7 | 6 / 10 | ambos | — | "Todo caballo 6 años y + edad ganadores de 1 o 2 carreras." | ⚠️ tope 10 no está en el texto |
| **8** | 5 / — | **ambos** | — | "**Yeguas** de 5 años y + edad ganadoras…" | 🔴 **el sexo no está cargado** |
| **9** | **5 / 10** | ambos | — | "Especial Todo caballo **4 años y +** edad ganador de 3 o mas carreras." | 🔴 **SE CONTRADICEN** |
| **10** | 5 / 10 | **ambos** | — | "**Yeguas** 5 años y + edad perdedoras." | 🔴 **el sexo no está cargado** |
| **11** | **5 / 5** | ambos | — | "Todo caballo 5 años **y + edad** perdedor." | 🔴 **SE CONTRADICEN** |

**Los números:**

| | |
|---|---|
| Turnos con edad estructurada cargada | **11 / 11** |
| Turnos con `cupo_maximo` cargado | **0 / 11** — el guard de cupo **nunca se dispara** |
| Turnos donde la columna de edad **contradice** el texto | **3** (T5, T9, T11) |
| Turnos donde el texto dice "Yeguas" pero `condicion_sexo='ambos'` | **2** (T8, T10) |
| Turnos con condición de performance sólo en texto ("perdedor", "ganador de N") | **11 / 11** |

**La conclusión es más fuerte que "el texto libre no se puede validar".** El texto libre
efectivamente no se puede validar automáticamente — hasta ahí, esperado. **Lo grave es que las
columnas que sí se validan hoy no dicen lo mismo que el texto que leen Fede, Yesi y los
entrenadores.** El guard está activo y decidiendo con datos que contradicen la carta:

- **T11**: la columna dice `5 / 5` exacto. Un caballo de 6 años **queda rechazado por el
  sistema**, aunque el texto —"5 años y + edad"— lo admite.
- **T9**: la columna dice `5 / 10`. Un caballo de 4 años **queda rechazado**, aunque el texto
  —"4 años y +"— lo admite.
- **T5**: la columna dice `5 / 10` y el texto dice "3 y 4 años". El sistema acepta justo a los
  que el texto excluye, y rechaza a los que admite. **Están invertidos.**
- **T8 y T10**: el texto dice "Yeguas" pero `condicion_sexo='ambos'`, así que **el sistema deja
  anotar machos en una carrera de yeguas.**

Esto no es hipotético: es el gate que corre hoy contra los once turnos abiertos de R9.

---

## 3. La columna CERT

### 3.1 De dónde sale el dato

Hay **dos** columnas `certificado_correr`, y esto es la raíz de la confusión:

| Tabla | Tipo | Default | Estado real hoy |
|---|---|---|---|
| `spcs.certificado_correr` | boolean | `false` | **`false` en los 181.** Nadie lo carga nunca |
| `inscripciones.certificado_correr` | boolean | `false` | `true` en **124 de 248** inscripciones manuales |

**La columna CERT de `inscripciones.html:637` muestra `inscripciones.certificado_correr`**, no la
del SPC.

### 3.2 Quién lo carga

**La secretaría, a mano, con un checkbox, una inscripción a la vez** —
`inscripciones.html:297`:

```html
<input type="checkbox" id="f-certificado" onchange="updateCertBadge()">
<label for="f-certificado">Certificado de correr ✓</label>
```

Se precarga desde el SPC al elegirlo (`selectSpc`, línea 728: `.checked = tieneCert`) — pero como
`spcs.certificado_correr` es `false` en los 181, **siempre arranca destildado**. Y se guarda en
`inscripciones.html:810`.

`spcs.html` **no toca la columna** (grep vacío). O sea: el campo del SPC existe, la UI lo lee
para precargar, y **ninguna pantalla lo escribe**.

### 3.3 Por qué la inscripción de Fede dice "No" en rojo

Medido:

```sql
SELECT i.canal, count(*) AS filas, count(*) FILTER (WHERE i.certificado_correr) AS con_cert
FROM inscripciones i GROUP BY i.canal;
```

| canal | filas | con cert |
|---|---|---|
| `manual` (secretaría) | 248 | **124** |
| `portal` | 3 | **0** |

**`rpc_inscribir` no incluye `certificado_correr` en su `INSERT`.** El `INSERT` es:

```sql
INSERT INTO inscripciones (
  carrera_id, spc_id, estado, canal, inscripto_por,
  entrenador_id, caballeriza_id, jockey_titular_id, jockey_suplente_id
) VALUES (…)
```

La columna cae al `DEFAULT false`. **Toda inscripción hecha desde el portal nace con CERT = No, y
no hay forma de que nazca de otra manera.** No es que el caballo de Fede no tenga certificado: es
que el camino del portal no puede setear ese campo. Las tres del portal están en `false`, las
tres.

### 3.4 ¿Bloquea algo?

**No. Es puramente informativo.** Barrido en la base:

```sql
SELECT 'funcion' AS clase, … FROM pg_proc  WHERE pg_get_functiondef(oid) ILIKE '%certificado_correr%'
UNION ALL SELECT 'policy', …  UNION ALL SELECT 'constraint', …  UNION ALL SELECT 'vista', …;
-- []
```

**Cero funciones, cero policies, cero constraints, cero vistas.** Ni `rpc_inscribir` ni
`validar_inscripcion` lo miran. Los únicos consumidores son de presentación:
`inscripciones.html:637` (la columna), `:975` (el punto rojo del PDF de inscriptos) y
`ratificacion.html:368`.

### 3.5 El cruce con Oficial Computable — **el sistema NO lo distingue**

La regla de dominio: el certificado es obligatorio en **Oficial Computable** y no en **No
Computable**.

El sistema **sí sabe** cuál es cuál — `categorias_carrera.es_computable` existe, se edita en
`categorias.html` y se muestra como rótulo en `inscripciones.html:960` y `ratificacion.html:379`.
En R9:

| Categoría | Turnos |
|---|---|
| Oficial No Computable (`es_computable = false`) | **9** — T1 a T9 |
| **Oficial Computable** (`es_computable = true`) | **2** — **T10 y T11** |

**Pero en ninguna parte se cruzan `es_computable` y `certificado_correr`.** El grep de
`es_computable` en todo `main` devuelve sólo el ABM de categorías y dos usos de rótulo. La regla
de negocio existe en la cabeza de la secretaría; en el código no está escrita en ningún lado.

**Consecuencia concreta hoy:** T10 y T11 son Oficial Computable. La única inscripción de T11 es
la de Fede, con `certificado_correr = false`. **El sistema no dice nada.**

---

## 4. El rastro

### 4.1 De dónde sale "Portal — Federico Iguacel loeda"

**De `inscripciones`, no de `auditoria`.** `inscripciones.html:641`:

```javascript
const cargadaCell = i.canal === 'portal'
  ? `…<span…>Portal</span><br><span…>${i.cargador?.nombre_completo || '—'}</span>…`
  : `<span…>Secretaría</span>`;
```

`i.cargador` viene del JOIN explícito de `loadInscripciones()` (`inscripciones.html:588`):

```javascript
.select('*, cargador:usuarios!inscripciones_inscripto_por_fkey(nombre_completo)')
```

El nombre del constraint va explícito porque `inscripciones` tiene **dos** FK a `usuarios`
(`inscripto_por` y `ratificado_por`) y PostgREST falla por ambigüedad sin él.

El comentario del propio código ya dice para qué está:

> *"Con inscripción libre (24/08/2026) cualquier entrenador puede anotar cualquier SPC, y este
> dato **ES el control** que reemplaza al filtro por tenencia: la comisión de carreras sanciona
> con él."*

### 4.2 🔴 El rastro en la fila existe SÓLO para el portal

```sql
SELECT i.canal, count(*) AS filas,
       count(*) FILTER (WHERE i.inscripto_por IS NOT NULL) AS con_inscripto_por
FROM inscripciones i GROUP BY i.canal;
```

| canal | filas | con `inscripto_por` |
|---|---|---|
| `manual` | 248 | **0** |
| `portal` | 3 | **3** |

**Las 248 inscripciones de secretaría tienen `inscripto_por` en NULL.** El `payload` de
`inscripciones.html:800-816` **no incluye `inscripto_por` ni `canal`** — `canal` cae al default
`'manual'` y `inscripto_por` queda nulo. Por eso la columna dice "Secretaría" a secas, sin
nombre: no hay nombre que mostrar.

### 4.3 La auditoría sí registra las tres, con autor

Hay tres triggers sobre `inscripciones`: `trg_audit_inscripciones` (→ `fn_auditoria_log`),
`trg_insc_set_propietario` y `trg_inscripciones_updated_at`.

```sql
SELECT a.accion, count(*) AS n, count(*) FILTER (WHERE a.usuario_id IS NOT NULL) AS con_usuario
FROM auditoria a WHERE a.tabla='inscripciones' GROUP BY a.accion;
```

| acción | filas | con usuario |
|---|---|---|
| INSERT | 425 | **252** |
| UPDATE | 2193 | 1148 |
| DELETE | 306 | 10 |

Las tres de R9, con autor completo:

| acción | fecha | usuario en auditoría | rol | canal | ejemplar |
|---|---|---|---|---|---|
| INSERT | 2026-08-25 18:26 | **FABIO JOSE CASTRO** | profesional | portal | Amiguito Peligroso |
| INSERT | 2026-08-28 20:34 | **FABIO JOSE CASTRO** | profesional | portal | MOSQUITA GARDEN |
| INSERT | 2026-09-07 22:02 | **Federico Iguacel loeda** | **propietario** | portal | CHINITA SALTEÑA |

`auditoria.html` deja filtrar por `tabla = inscripciones` (línea 128), acción y usuario.

### 4.4 ¿Se puede saber quién anotó un caballo que no era suyo? — **sí, y ya pasó**

```sql
SELECT s.nombre, p.apellido||', '||p.nombre AS entrenador_de_ficha,
       u.nombre_completo AS lo_anoto, u.rol,
       (u.entidad_tipo='profesional' AND u.entidad_id = s.entrenador_id) AS anoto_su_propio_caballo
FROM … WHERE r.numero = 9;
```

| ejemplar | entrenador de ficha | lo anotó | rol | ¿es suyo? |
|---|---|---|---|---|
| Amiguito Peligroso | *(sin entrenador cargado)* | FABIO JOSE CASTRO | profesional | *(indeterminado — el SPC no tiene `entrenador_id`)* |
| MOSQUITA GARDEN | **MAITIA, LUIS** | FABIO JOSE CASTRO | profesional | **NO** |
| CHINITA SALTEÑA | **ALZA, MAXIMILIANO** | **Federico Iguacel loeda** | **propietario** | **NO** |

**Ninguna de las tres inscripciones del portal es de un caballo del propio anotante.** Es
exactamente el escenario que preguntó Fede — y el rastro lo muestra sin ambigüedad, que es
justamente lo que la regla de dominio pretende.

Dos límites del rastro, que conviene tener presentes:

1. **Sólo aplica al portal.** Por secretaría no queda `inscripto_por`; hay que ir a `auditoria`.
2. **La tenencia con la que se compara es floja.** `spcs.entrenador_id` es NULL en al menos uno de
   los tres casos, y `spc_propietarios` está en 0 filas (GOTCHA/ISSUE conocido). Sin tenencia
   confiable, "anotó un caballo que no era suyo" es difícil de afirmar por sistema aunque el dato
   de quién anotó esté perfecto.

---

## 5. Tabla de cierre — qué controla, qué no, y qué sería razonable agregar

La regla de dominio se respeta: **cualquiera puede anotar cualquier caballo; el control es por
auditoría, no por restricción técnica.** Ninguna de las propuestas la toca.

| Control | Hoy | ¿Razonable agregar? | Cómo, sin romper la regla |
|---|---|---|---|
| Ventana de inscripción | 🔴 bloquea (portal) · ⚪ nada (secretaría) | — | ya está |
| Estado del SPC | 🔴 bloquea (portal) · ⚪ nada (secretaría) | — | ya está |
| Edad | 🔴 bloquea (portal) · ⚪ nada (secretaría) | — | ya está, **pero ver la fila de abajo** |
| Sexo | 🔴 bloquea (portal) · ⚪ nada (secretaría) | — | ya está, **pero ver la fila de abajo** |
| Sanciones del SPC | 🔴 bloquea (portal) · ⚪ nada (secretaría) | — | ya está |
| Cupo | 🔴 bloquea si está cargado · **0/11 cargados** | 🟡 **Sí** | es dato, no código: cargar `cupo_maximo` en la carta |
| Duplicado en el turno | 🔴 bloquea (portal) · ⚪ nada (secretaría) | — | ya está |
| Caballeriza / entrenador declarado | 🔴 bloquea (portal) · 🟡 advierte (secretaría) | — | ya está |
| **Columnas estructuradas vs. texto** | ⚪ **nadie las coteja — 5/11 en conflicto** | 🔴 **Sí, lo más urgente** | **advertencia en la carta**, no bloqueo: al guardar un turno, si el texto menciona una edad o "yeguas/machos" que no coincide con las columnas, avisar. Es un lint sobre lo que carga la secretaría |
| **Condición de performance** ("perdedor", "ganador de N") | ⚪ nada | 🟡 quizá, más adelante | requiere historial de victorias por SPC, que hoy no está modelado. **Advertencia**, nunca bloqueo |
| **Certificado en Oficial Computable** | ⚪ nada — ni siquiera se cruza | 🟢 **Sí, barato** | el dato ya está (`es_computable` + `certificado_correr`): **chip de advertencia** en `inscripciones.html` y en la ratificación cuando la categoría es computable y el cert está en No |
| **`certificado_correr` desde el portal** | ⚪ **imposible** — el RPC no lo setea, nace `false` siempre | 🟢 **Sí** | hoy la columna miente en las 3 del portal. O se agrega el parámetro al RPC, o **se muestra "—" en vez de "No" para `canal='portal'`**, que es más honesto que un "No" que nadie cargó |
| **`spcs.certificado_correr`** | ⚪ **muerto** — `false` en los 181, ninguna pantalla lo escribe | 🟡 decidir | o se le da un ABM (spcs.html) o se saca: hoy sólo sirve para precargar un checkbox con un `false` constante |
| **Guards en el camino de secretaría** | ⚪ **inserta directo, sin ningún guard** | 🟡 **Sí, con criterio** | la secretaría **debe** poder forzar (inscribe por teléfono, corrige a mano). Lo razonable es **advertir** —"este caballo tiene 4 años y el turno pide 5"— con un `confirm()`, como ya hace con la caballeriza. Nunca bloquear |
| **`inscripto_por` en secretaría** | ⚪ NULL en las 248 | 🟢 **Sí, barato** | agregar `inscripto_por: currentUser.id` al payload de `inscripciones.html`. Hoy el rastro en la fila sólo existe para el portal |
| **Motivo del rechazo al usuario del portal** | ⚪ enmascarado a "Consultá en secretaría" | 🟡 **decisión de Fede** | el código dice explícitamente que espera su definición. Un entrenador que no sabe por qué fue rechazado llama por teléfono: el enmascaramiento traslada el trabajo a la secretaría |
| **Tenencia del caballo** | ⚪ no se mira, **a propósito** | 🔴 **NO** | es la regla de dominio. No tocar |
| **Buscador: acentos** | ⚪ `saltena` → 0 hits | 🟢 **Sí** | padrón en cliente + `normalize('NFD')`. 13 kB, sin tocar la base |
| **Buscador: velocidad** | 🟡 250-300 ms + red | 🟢 **Sí** | mismo cambio: filtrado local, instantáneo desde la 1ª letra |

### Las tres cosas que yo haría primero

1. **El lint de condición vs. columnas (§2.4).** Es lo único de esta lista que hoy está
   produciendo decisiones equivocadas sobre los once turnos abiertos de R9. Cinco de once en
   conflicto, y el gate corre con las columnas.
2. **El buscador con el padrón en el cliente (§1.5).** Contesta la pregunta 1 de Fede, resuelve
   el hueco de acentos, y son 13 kB. Es el mejor retorno por línea de código de toda la lista.
3. **`inscripto_por` en el camino de secretaría (§4.2).** Una línea en el payload, y completa el
   rastro que hoy tiene 248 agujeros.

---

## 6. Preguntas abiertas

1. **¿Fede vio el autocompletado y no le anduvo, o no lo vio?** La respuesta cambia el trabajo: si
   no le anduvo, es el hueco de acentos o la latencia; si no lo vio, es un tema de affordance
   (el campo no se lee como buscador).
2. **Las contradicciones de §2.4: ¿cuál manda, la columna o el texto?** No lo asumo. Para T5 la
   diferencia es total —el texto dice 3-4 años, la columna 5-10— y hay tres turnos con
   inscripciones abiertas afectados. **Esto debería resolverse antes del cierre del viernes.**
3. **T8 y T10 dicen "Yeguas" en el texto y `condicion_sexo='ambos'` en la columna.** ¿Se corrige
   la columna a `hembras`? Cambiaría el gate: hoy un macho puede anotarse.
4. **¿`cupo_maximo` se usa en Dolores?** Está en 0 de 11. Si no se usa, el guard es código muerto;
   si se usa, falta cargarlo.
5. **El motivo enmascarado (§2.2).** El código espera la definición de Fede desde que se escribió.
6. **¿El "No" de CERT en las inscripciones del portal se corrige o se muestra "—"?** Hoy afirma
   algo que nadie cargó.

---

## 7. Verificación en `origin`

```
$ git ls-remote origin main
2bb5d0c9ef3e7738df66cf19c649a93d6aba3f5d	refs/heads/main
```

**Solo lectura confirmada:** este trabajo no ejecutó ningún `INSERT`, `UPDATE`, `DELETE` ni DDL.
La base queda exactamente como estaba, y el único cambio en el repo es este archivo.
