# Aprobar una solicitud cuando no hay ficha en el padrón — qué hace hoy el sistema

**Fecha:** 2026-09-07
**Modo:** SOLO LECTURA. No se ejecutó ningún DDL/DML. Todas las consultas a prod son `SELECT`.
**Disparador:** Yesi quiso resolver la solicitud de Fede (`fedeiguacel3@hotmail.com`, rol `propietario`) y el
sistema le avisa que no está registrado como propietario. Pregunta si hay que cargarlo a mano cada vez.

## Guards verificados

```
pwd                                  → /home/clio/dev/SGH
git branch --show-current            → reports
SELECT count(*) FROM spcs            → 181            (coincide con el baseline de CLAUDE.md al 2026-08-23)
ref del proyecto Supabase            → unlhcuanfrtpatoipwve
git ls-remote origin main            → cc0ea64c8847d5eafb78a234cfedc749ab597afe
git ls-remote origin reports         → 9e84ede0666b9edcc93dc2b0035fefec81461864
```

Todos los greps y números de línea de este informe son contra `origin/main` en `cc0ea64`.
MD5 de los dos archivos leídos, en ese commit:

```
a5e88e947e156f2de71e6afe31addcb4  solicitudes.html
da47bb4e18073460bc4a18a42f794f3a  propietarios.html
```

---

## 0. Precisión sobre el estado real de la solicitud de Fede

La solicitud **no está aprobada**. Sigue `pendiente`:

```sql
select id, email, nombre, apellido, documento_tipo, documento_nro, telefono, rol_pedido,
       club_id, estado, origen_hipodromo, origen_patente_nro, origen_caballeriza,
       created_at, resuelta_at, motivo_rechazo
from solicitudes_acceso order by created_at desc limit 20;
```

Salida cruda (3 filas en toda la tabla):

```json
[
 {"id":"aa1ae749-9fbb-42d4-8f38-fc988d3ee59c","email":"fedeiguacel3@hotmail.com",
  "nombre":"Federico","apellido":"Iguacel loeda","documento_tipo":"DNI","documento_nro":"27826202",
  "telefono":"541158911520","rol_pedido":"propietario",
  "club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"pendiente",
  "origen_hipodromo":"Palermo","origen_patente_nro":null,"origen_caballeriza":"Kazan",
  "created_at":"2026-09-06 19:20:57.664274+00","resuelta_at":null,"motivo_rechazo":null},

 {"id":"790f5be6-1cf4-4e22-ad98-c986eb4151f2","email":"hipodromodolores@gmail.com",
  "nombre":"FABIO JOSE","apellido":"CASTRO","documento_nro":"14979152","telefono":null,
  "rol_pedido":"profesional","estado":"aprobada","origen_hipodromo":null,
  "created_at":"2026-08-19 16:15:28.085357+00","resuelta_at":"2026-08-19 16:20:49.852203+00"},

 {"id":"4572eccc-8821-494e-8709-8d3ccf0b67d6","email":"mdqclio@hotmail.com",
  "nombre":"Leonardo","apellido":"Fernandez","documento_nro":"99999999",
  "rol_pedido":"propietario","estado":"descartada",
  "created_at":"2026-08-04 04:28:40.590592+00","resuelta_at":"2026-08-04 04:34:08.517253+00"}
]
```

Esto importa porque cambia la pregunta: no es "aprobó y el sistema le avisó algo". Es **no pudo aprobar**.
El botón está deshabilitado. Ver §2.

---

## 1. Qué hace exactamente el flujo de aprobación

### 1.1 El botón, en el cliente

`solicitudes.html:374-396` — el handler de `[data-aprobar]`:

```js
div.querySelector(`[data-aprobar="${s.id}"]`).onclick = async (ev) => {
  const sel = elegido[s.id];
  if (!sel) return;                                   // ← 375-376
  if (!confirm(`Vincular a ${s.nombre} ${s.apellido} con la ficha "${sel.nombre}" y darle acceso?`)) return;
  ev.target.disabled = true;
  const copiar = div.querySelector(`[data-copiar="${s.id}"]`).checked;
  const { error } = await sb.rpc('rpc_aprobar_solicitud', {   // ← 380-383
    p_solicitud_id: s.id, p_entidad_tipo: sel.tipo, p_entidad_id: sel.id,
    p_copiar_documento: copiar,
  });
  ...
};
```

`elegido[s.id]` se llena **sólo** en `marcarSel()` (`solicitudes.html:349-357`), que corre al hacer click en
una `.ficha` ya renderizada. Y el botón nace deshabilitado:

```html
<!-- solicitudes.html:339 -->
<button class="btn btn-ok" data-aprobar="${s.id}" disabled>Vincular y aprobar</button>
```

`marcarSel` es el único lugar que hace `disabled = false` (`solicitudes.html:353`).

### 1.2 El RPC, en el servidor

`rpc_aprobar_solicitud(p_solicitud_id uuid, p_entidad_tipo text, p_entidad_id uuid, p_copiar_documento boolean)`
— `SECURITY DEFINER`, `search_path=public`. Definición traída de prod con `pg_get_functiondef`:

```sql
DECLARE v_staff_id uuid := fn_solicitudes_guard_staff(p_solicitud_id);
        v_sol solicitudes_acceso%ROWTYPE; v_usuario_id uuid; v_ent_club uuid; v_ent_doc text;
BEGIN
  SELECT * INTO v_sol FROM solicitudes_acceso WHERE id = p_solicitud_id FOR UPDATE;
  IF v_sol.estado <> 'pendiente' THEN RAISE EXCEPTION 'La solicitud ya fue resuelta (estado: %)' ...
  IF p_entidad_tipo NOT IN ('profesional','propietario') THEN RAISE EXCEPTION 'entidad_tipo inválido' ...
  IF p_entidad_tipo <> v_sol.rol_pedido THEN RAISE EXCEPTION 'La ficha es de tipo % y la solicitud pide %' ...
  IF p_entidad_tipo='profesional' THEN
    SELECT club_id, documento_nro INTO v_ent_club, v_ent_doc FROM profesionales WHERE id=p_entidad_id;
  ELSE
    SELECT club_id, documento_nro INTO v_ent_club, v_ent_doc FROM propietarios  WHERE id=p_entidad_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'La ficha % no existe' ...
  IF v_ent_club IS DISTINCT FROM v_sol.club_id THEN
    RAISE EXCEPTION 'La ficha pertenece a otro hipódromo' USING ERRCODE='42501'; END IF;
  BEGIN
    INSERT INTO usuarios (email,nombre_completo,telefono,club_id,rol,activo,estado,
                          auth_user_id,entidad_tipo,entidad_id,password_hash)
    VALUES (v_sol.email, btrim(v_sol.nombre||' '||v_sol.apellido), v_sol.telefono, v_sol.club_id,
            v_sol.rol_pedido::rol_usuario, true, 'activo', v_sol.auth_user_id,
            p_entidad_tipo, p_entidad_id, '')
    RETURNING id INTO v_usuario_id;
  EXCEPTION WHEN unique_violation THEN
    IF sqlerrm ILIKE '%ux_entidad_una_cuenta%'   THEN RAISE EXCEPTION 'Esa ficha ya está vinculada a otra cuenta...';
    IF sqlerrm ILIKE '%ux_usuarios_auth_user_id%' THEN RAISE EXCEPTION 'La cuenta ya tiene usuario en el sistema';
    RAISE;
  END;
  IF p_copiar_documento AND (v_ent_doc IS NULL OR btrim(v_ent_doc)='') THEN
    ... UPDATE propietarios SET documento_nro=v_sol.documento_nro, documento_tipo=v_sol.documento_tipo ...
  END IF;
  UPDATE solicitudes_acceso SET estado='aprobada', resuelta_por=v_staff_id, resuelta_at=now() WHERE id=p_solicitud_id;
  RETURN v_usuario_id;
END;
```

**Respuesta directa a la pregunta 1:**

| ¿Qué hace? | ¿Lo hace? | Dónde |
|---|---|---|
| Crea la fila en `usuarios` | ✅ sí | RPC, `INSERT INTO usuarios` |
| Vincula esa fila a una ficha existente (`entidad_tipo`/`entidad_id`) | ✅ sí, con el `p_entidad_id` que **le pasa el cliente** | RPC, mismo INSERT |
| Crea la ficha en `propietarios`/`profesionales` si no existe | ❌ **NO. Nunca.** | no existe ese código en ningún lado |
| Copia el DNI declarado a la ficha si la ficha no lo tenía | ✅ sí, opcional (checkbox `data-copiar`, `solicitudes.html:335`) | RPC, bloque `p_copiar_documento` |

El RPC **no tiene ninguna rama de creación de ficha**. Es un vinculador puro. Y eso es **por diseño explícito**,
documentado dos veces:

- `solicitudes.html:165-170` (comentario en el código):
  > "El sistema SÓLO sugiere. El vínculo se crea con la ficha que Yesi elige y que viaja como parámetro
  > explícito de `rpc_aprobar_solicitud`. No hay ninguna ruta que vincule por coincidencia."
- `docs/AUTOREGISTRO_PLAN.md:143-148` (§C.8):
  > "No existe ningún trigger ni RPC que vincule por coincidencia de DNI. El único camino a
  > `usuarios.entidad_id` es la RPC de aprobación, que es SECURITY DEFINER con guarda `fn_is_staff()`
  > y **recibe el `entidad_id` como parámetro explícito** — o sea, lo elige Yesi."

La versión anterior del registro (pre-Gate 1) **sí** creaba la ficha sola desde el navegador; se sacó a
propósito. `docs/AUTOREGISTRO_PLAN.md:70-83`:

```js
await sb.from('propietarios').insert({ ..., activo:false });  // 3. CREA LA FICHA SOLO
```
> "Auto-crea la ficha de propietario/profesional sin que intervenga nadie. Es precisamente el auto-vínculo
> que el ajuste de Leo prohíbe."

---

## 2. De dónde sale el mensaje, y si bloquea

### 2.1 El mensaje

`solicitudes.html:315-327`, dentro de `tarjetaHTML()`. Tres ramas mutuamente excluyentes:

```js
const { exactas, sugeridas } = await buscarFichas(s);
let cuerpo = '<div class="match"><div class="match-title">Matcheo por DNI</div>';
if (exactas.length) {
  cuerpo += exactas.map(f => fichaHTML(s, f, 'exacto')).join('');
} else if (sugeridas.length) {
  cuerpo += `<div class="vacio">No hay ficha con ese DNI. Estas se parecen por apellido —
             <strong>ninguna está preseleccionada</strong>:</div>`;
  cuerpo += sugeridas.map(f => fichaHTML(s, f, 'sug')).join('');
} else {
  cuerpo += `<div class="vacio">No hay ficha con ese DNI ni con ese apellido. Buscá a mano o creá la ficha desde
    ${s.rol_pedido === 'profesional' ? '<a href="profesionales.html" ...>Entrenadores</a>'
                                     : '<a href="propietarios.html" ...>Propietarios</a>'}
    y volvé.</div>`;
}
```

Para Fede cae en la **tercera** rama (verificado en §3.2): *"No hay ficha con ese DNI ni con ese apellido.
Buscá a mano o creá la ficha desde Propietarios y volvé."*

Hay un segundo texto abajo del botón, `solicitudes.html:343`:

```html
<div class="vacio" data-aviso="${s.id}">Elegí una ficha para poder aprobar.</div>
```

Ese es el que describe la situación real.

> No es el mensaje de `login.html:423` (*"Tu usuario no está registrado en el sistema. Contactá al
> administrador."*). Ése lo ve **el solicitante** al intentar entrar antes de que lo aprueben, no Yesi.

### 2.2 ¿Bloquea o advierte?

**Bloquea. Es un bloqueo duro, en tres capas independientes.**

1. **Cliente — botón.** `solicitudes.html:339` nace `disabled`; sólo `marcarSel()` (`:353`) lo habilita, y
   `marcarSel` sólo corre desde el `onclick` de una `.ficha` renderizada (`:357` y `:369`). Sin ficha en
   pantalla, no hay nada que clickear → el botón nunca se habilita.
2. **Cliente — guarda.** `solicitudes.html:375-376`: `if (!sel) return;`.
3. **Servidor — RPC.** `p_entidad_id` no tiene default. Sin él, PostgREST ni resuelve la firma; y con un UUID
   inexistente el RPC corta en `RAISE EXCEPTION 'La ficha % no existe'` (`ERRCODE='P0002'`).

**No hay ningún camino para aprobar sin ficha.** No es una advertencia que se pueda ignorar. Es la condición
de la operación.

Lo único que Yesi puede hacer hoy con esa solicitud sin salir de la pantalla es **Rechazar** (pide motivo,
`:398-411`) o **Descartar** (`:413-419`).

---

## 3. Datos que trae la solicitud vs. datos que necesita una ficha

### 3.1 Qué trae la solicitud

`rpc_solicitar_acceso` valida y persiste. Campos de `solicitudes_acceso` (de `information_schema.columns`):

| columna | null? | validación en el RPC | valor de Fede |
|---|---|---|---|
| `auth_user_id` | NO | `auth.uid()`, no lo manda el cliente | (la cuenta de Fede) |
| `email` | NO | se toma de `auth.users`, no del form; si el form manda otro → `RAISE 'El email no coincide...'` | `fedeiguacel3@hotmail.com` |
| `nombre` | NO | `btrim <> ''` obligatorio | `Federico` |
| `apellido` | NO | `btrim <> ''` obligatorio | `Iguacel loeda` |
| `documento_tipo` | NO | default `'DNI'` | `DNI` |
| `documento_nro` | NO | **`~ '^[0-9]{7,8}$'`** — sin puntos ni espacios | `27826202` |
| `telefono` | SÍ | recomendado, no obligatorio (adenda Gate 3) | `541158911520` |
| `rol_pedido` | NO | `IN ('profesional','propietario')` | `propietario` |
| `club_id` | NO | debe existir en `clubs` | Dolores |
| `origen_hipodromo` | SÍ | **obligatorio en el RPC** para los dos roles | `Palermo` |
| `origen_caballeriza` | SÍ | **obligatorio si `rol_pedido='propietario'`**; se anula si es profesional | `Kazan` |
| `origen_patente_nro` | SÍ | sólo aplica a profesional; se anula si es propietario | `null` |

### 3.2 Qué necesita una ficha de propietario

`propietarios`, columnas `NOT NULL` sin default utilizable:

| columna | null? | default | comentario |
|---|---|---|---|
| `id` | NO | `uuid_generate_v4()` | automático |
| `tipo` | NO | `'persona'` | tiene default |
| `nombre` | NO | — | **el único obligatorio real** |
| `club_id` | **SÍ (nullable)** | — | ver §4.2, acá está el problema |
| `documento_tipo`, `documento_nro`, `domicilio`, `localidad`, `provincia`, `telefono`, `email`, `colores_desc`, `colores_img_url`, `notas`, `nombre_stud`, `chaquetilla_*` | SÍ | — | opcionales |
| `activo` | NO | `true` | |
| `estado` | SÍ | `'activo'` | |

Y lo que el formulario de `propietarios.html` marca como requerido (`required` en el HTML):
`f-tipo` (`:177`) y `f-nombre` (`:192`). Nada más.

**Conclusión de la pregunta 3: los datos alcanzan de sobra.** La ficha mínima viable es
`{tipo:'persona', nombre:'Iguacel Loeda, Federico', documento_tipo:'DNI', documento_nro:'27826202',
telefono:'541158911520', email:'fedeiguacel3@hotmail.com', club_id:<Dolores>}` — y **todos** esos valores
están en la fila de `solicitudes_acceso`, ya validados.

**Lo que la secretaría sabe y la solicitud no trae** (todo opcional para la DB, pero relevante en el negocio):

- **Colores / chaquetilla registrada** (`colores_desc`, `chaquetilla_descripcion`) — dato del Stud Book, no
  se pide en el registro. Un propietario sin colores no rompe nada pero sale sin chaquetilla en el programa.
- **`nombre_stud`** — Fede declaró la caballeriza `Kazan` en `origen_caballeriza`, que es texto libre y
  distinto conceptualmente del stud. La solicitud lo tiene; nadie lo copia.
- **Domicilio / localidad / provincia** — para el recibo de premios (Fase 4).
- **`tipo`: persona vs sociedad/stud** — se puede inferir del DNI (7-8 dígitos ⇒ persona física), pero es una
  decisión, no un dato.
- **La validación misma**: que Fede realmente sea propietario en Palermo con la caballeriza Kazan. Eso es
  la llamada telefónica que describe `solicitudes.html:265-268`. Ninguna automatización la reemplaza — y no
  debería.

**Nada de eso bloquea crear la ficha.** Son campos que se completan después.

---

## 4. ¿Hay camino en la UI para crear la ficha desde la bandeja?

**No.** Y el camino alternativo que la propia UI sugiere **está roto**.

### 4.1 No hay botón

`git grep` sobre `origin/main:solicitudes.html` — la pantalla sólo hace estas escrituras:

```
:380  sb.rpc('rpc_aprobar_solicitud', ...)
:402  sb.rpc('rpc_rechazar_solicitud', ...)
:415  sb.rpc('rpc_descartar_solicitud', ...)
```

Cero `.insert()`. Los cuatro botones de una solicitud pendiente son
`Vincular y aprobar` / `Rechazar…` / `Descartar` / `Buscar` (`:328-342`). No hay "Crear ficha nueva".

**El diseño sí lo tenía.** `docs/AUTOREGISTRO_PLAN.md:347`, tabla de los tres casos:

| caso | qué ve Yesi | acción |
|---|---|---|
| **Sin ficha** — nada razonable | *"No hay ficha con ese DNI."* + buscador manual + **"Crear ficha nueva"** | crear ficha `profesionales`/`propietarios` con los datos declarados, y vincular |

Se implementaron los dos primeros elementos (mensaje + buscador manual). El tercero, no. En su lugar quedó
el link a `propietarios.html` (`solicitudes.html:325`) con el texto "creá la ficha ... **y volvé**".

### 4.2 🔴 El "salí a propietarios.html, creala y volvé" no funciona

Éste es el hallazgo principal del informe.

`propietarios.html:435-436`, el guardado:

```js
const { error } = id
  ? await sb.from('propietarios').update(payload).eq('id', id)
  : await sb.from('propietarios').insert(payload);
```

Y el `payload` completo (`:419-433`) — reproducido íntegro, sin recortes:

```js
const payload = {
  tipo, estado, activo, nombre, nombre_stud, documento_tipo, documento_nro,
  domicilio, localidad, provincia, telefono, email, colores_desc, notas,
};
```

**No incluye `club_id`.** La columna es nullable y no tiene default ni trigger que la complete:

```sql
select tgname, pg_get_triggerdef(t.oid) from pg_trigger t
  join pg_class c on c.oid=t.tgrelid where c.relname='propietarios' and not t.tgisinternal;
-- → trg_propietarios_updated_at   BEFORE UPDATE ... EXECUTE FUNCTION set_updated_at()
```

Un solo trigger, y es `BEFORE UPDATE` de `updated_at`. La policy de INSERT tampoco lo fuerza:

```
propietarios_insert  cmd=a  WITH CHECK ( SELECT fn_is_staff() )
```

**Por lo tanto: toda ficha creada desde `propietarios.html` nace con `club_id = NULL`.** Consecuencias
encadenadas:

1. **No aparece en el matcheo.** `buscarFichas()` (`solicitudes.html:182` y `:187-188` y `:198`) filtra
   siempre `.eq('club_id', CLUB_ID)`. Una fila con `club_id NULL` no matchea ese filtro — ni en el exacto por
   DNI, ni en las sugerencias por apellido, ni en el buscador manual. Yesi crea la ficha, vuelve a la bandeja,
   y **sigue sin verla**. Ni siquiera buscándola a mano por DNI.
2. **Aunque la encontrara, el RPC la rechaza.** `IF v_ent_club IS DISTINCT FROM v_sol.club_id THEN RAISE
   EXCEPTION 'La ficha pertenece a otro hipódromo'`. `NULL IS DISTINCT FROM <uuid>` es `true` → error 42501,
   con un mensaje que no describe el problema real (la ficha no es de otro hipódromo: no es de ninguno).
3. **La ficha sí se ve en `propietarios.html`**, porque esa pantalla no filtra por club (`:307`:
   `sb.from('propietarios').select('*').order('nombre')`) y `propietarios_select` para staff es
   `fn_is_staff()` a secas, sin condición de club. O sea: la ficha existe, se ve donde la creó, y es
   invisible exactamente donde la necesita. Es el peor modo de falla posible — parece que funcionó.

**Este bug es ISSUE-049 otra vez, en el archivo hermano.** `docs/ISSUES.md:330-340`:

> ### ISSUE-049: `profesionales.html` listaba entrenadores de todos los clubes y los creaba sin `club_id` — RESUELTO
> 1. **Fuga cross-tenant en la lectura**: `load()` consultaba `profesionales` ... **sin** `.eq('club_id', CLUB_ID)`.
> 2. **Alta sin tenant**: el payload del INSERT no incluía `club_id`. La columna es nullable, así que toda alta
>    por pantalla creaba la fila con `club_id = NULL` ...
> Fix: `profesionales.html` — `.eq('club_id', CLUB_ID)` en `load()` + `club_id: CLUB_ID` en el payload.

Se arregló `profesionales.html` (hoy: `:273` filtra, `:397` manda `club_id: CLUB_ID`). **`propietarios.html`
tiene los dos defectos idénticos y no se tocó.** Es el mismo bug de aislamiento por tenant, en la tabla
hermana, sin ticket propio.

### 4.3 Impacto medido hasta hoy: cero filas dañadas

```sql
select count(*) total, count(documento_nro) con_doc,
       count(*) filter (where club_id='0649e9c5-9e87-4aad-842f-101458e6b33c') en_dolores,
       count(*) filter (where club_id is null) sin_club
from propietarios;
-- → {"total":260,"con_doc":220,"en_dolores":253,"sin_club":0}

select p.club_id, c.nombre, count(*) from propietarios p left join clubs c on c.id=p.club_id group by 1,2;
-- → a6da7e40-1515-45dc-8933-4eef33ce937a  Mi Club Hípico          7
--   0649e9c5-9e87-4aad-842f-101458e6b33c  Hipódromo de Dolores  253

select date_trunc('day',created_at)::date d, count(*) from propietarios group by 1 order by 1 desc;
-- → 2026-08-18: 40 | 2026-06-02: 213 | 2026-04-21: 7
```

`sin_club = 0`: **el alta por pantalla nunca se usó.** Las 260 filas entraron en tres tandas de importación
(los 7 de abril son el seed de "Mi Club Hípico", los 213 de junio son la derivación de ISSUE-001, los 40 de
agosto son la tanda de agosto). Idéntico a lo que pasó con ISSUE-049: el bug está latente, no dañó nada
todavía. **Fede es el primer caso que lo va a disparar.**

Nota lateral del mismo defecto: los 7 propietarios de `Mi Club Hípico` **se ven y se pueden editar desde
Dolores** en `propietarios.html`, porque no hay filtro por club en la lectura. Es la mitad #1 de ISSUE-049,
también sin arreglar acá.

---

## 5. El caso inverso: alguien que YA está en el padrón se registra

**No se vincula solo. Nunca.** El sistema **sugiere**, Yesi **decide**, siempre, incluso con match exacto de
DNI. Es la garantía §C.8 del plan, citada en §1.2.

Lo que sí cambia es cuánto trabajo es. `buscarFichas()` (`solicitudes.html:171-202`):

```js
// 1) EXACTO por documento_nro.
const { data: ex } = await sb.from(tabla).select(cols)
  .eq('club_id', CLUB_ID).eq('documento_nro', sol.documento_nro).limit(5);

// 2) Sin exacto: sugerencias por apellido.
let sug = [];
if (!ex || ex.length === 0) {
  const ape = `%${sol.apellido}%`;
  const filtro = sol.rol_pedido === 'profesional'
    ? `apellido.ilike.${ape},nombre.ilike.${ape}`
    : `nombre.ilike.${ape},nombre_stud.ilike.${ape}`;
  const { data } = await sb.from(tabla).select(cols).eq('club_id', CLUB_ID).or(filtro).limit(8);
  sug = data || [];
}
```

Si hay match exacto: la ficha sale con la etiqueta `EXACTO` (`:213-215`), Yesi hace **un click** para
seleccionarla, uno más en `Vincular y aprobar`, y confirma. Tres clicks, cero carga manual. **Ése es el
camino feliz y funciona.**

### 5.1 Qué tan seguido cae el camino feliz

El match exacto es `documento_nro = documento_nro`, string contra string. La solicitud garantiza
`^[0-9]{7,8}$`. El padrón, no:

```sql
select case when documento_nro is null or btrim(documento_nro)='' then 'vacio'
            when documento_nro ~ '^[0-9]{7,8}$' then 'ok_7_8_digitos'
            when documento_nro ~ '^[0-9]+$'     then 'solo_digitos_otro_largo'
            else 'con_puntos_o_texto' end as forma, count(*)
from propietarios group by 1 order by 2 desc;
-- → ok_7_8_digitos: 218 | vacio: 40 | con_puntos_o_texto: 2
```

**218 de 260 (84 %)** pueden dar match exacto. Los otros 42:

- **40 sin documento** (la tanda del 2026-08-18) → caen en sugerencias por apellido.
- **2 con CUIT formateado** — `Stud Los Potreros S.A.` (`30-56789012-1`) y `Haras El Ombu S.R.L.`
  (`30-67890123-4`). Son sociedades; el RPC de solicitud sólo acepta 7-8 dígitos, así que una sociedad
  **no puede registrarse con su CUIT** ni siquiera en teoría. Se registra la persona física.

> `AUTOREGISTRO_PLAN.md:353` decía *"`propietarios` está mejor: **220/220 con DNI, todos distintos**"*. Ese
> número era de julio, sobre 220 filas. Con la tanda de agosto la cobertura bajó a 218/260. El dato del plan
> está desactualizado.

### 5.2 Por qué el fallback por apellido falla justo en el caso de Fede

Para `propietarios`, `sol.apellido` se busca contra `propietarios.nombre` — que es un campo único
("Apellido y nombre o razón social", `propietarios.html:192`). El apellido de Fede es `Iguacel loeda`:
compuesto, con la segunda palabra en minúscula, tal como él lo tipeó. El `ilike '%Iguacel loeda%'` exige
esa cadena literal completa, con el espacio.

```sql
select id, nombre, nombre_stud from propietarios
where nombre ilike '%Iguacel loeda%' or nombre_stud ilike '%Iguacel loeda%';
-- → []
select id, club_id, tipo, nombre, nombre_stud, documento_nro from propietarios
where documento_nro='27826202' or nombre ilike '%iguacel%' or nombre_stud ilike '%kazan%' or nombre ilike '%kazan%';
-- → []
select id, nombre from caballerizas where nombre ilike '%kazan%';
-- → []
```

Cero por DNI, cero por apellido, cero por caballeriza. **Fede no está en Dolores por ninguna vía.** Declaró
`Palermo` como origen y una caballeriza (`Kazan`) que no existe en el padrón de Dolores. Es un propietario
genuinamente nuevo para el hipódromo — no un fallo de matcheo.

Nota de diseño: `origen_caballeriza` y `origen_hipodromo` **son obligatorios en el RPC de solicitud** y se
muestran en la tarjeta (`origenHTML()`, `solicitudes.html:269-286`), pero **`buscarFichas()` no los usa
para buscar nada**. Es información para la llamada telefónica, no para el matcheo.

### 5.3 Vínculos existentes en prod

```sql
select count(*) from usuarios where entidad_tipo is not null and entidad_id is not null;
-- → 1
```

Un solo vínculo en toda la base (Fabio José Castro, la solicitud aprobada del 19/08 — entrenador, no
propietario). **El camino "propietario aprobado y vinculado" no corrió nunca en producción.** Fede sería
el primero.

---

## Veredicto

### Qué hace hoy

1. La aprobación **exige** una ficha preexistente en `propietarios`/`profesionales` del club, elegida a mano.
   No hay ninguna ruta —ni UI, ni RPC, ni trigger— que cree la ficha o la vincule sola. Es deliberado
   (`AUTOREGISTRO_PLAN.md` §C.8) y correcto como política.
2. El mensaje que ve Yesi (`solicitudes.html:323`) **no es una advertencia: es un bloqueo**, en tres capas
   (botón `disabled` → guarda `if (!sel) return` → `p_entidad_id` sin default en el RPC). No puede aprobar
   igual. Sólo puede rechazar o descartar. La solicitud de Fede sigue `pendiente` en la DB.
3. Los datos de la solicitud **alcanzan de sobra** para crear la ficha: `propietarios` sólo exige `nombre`
   (más `tipo`, que tiene default). Lo que la secretaría aporta y la solicitud no trae —colores, domicilio,
   persona vs sociedad, y sobre todo la validación telefónica con Palermo— es todo opcional o posterior.
4. **No hay camino en la UI para crearla desde la bandeja.** El plan lo tenía previsto
   (`AUTOREGISTRO_PLAN.md:347`, botón "Crear ficha nueva") y no se implementó.
5. 🔴 **Y el camino alternativo que la propia UI sugiere está roto.** `propietarios.html` crea la ficha
   **sin `club_id`** (`:419-436`), y `buscarFichas()` filtra `.eq('club_id', CLUB_ID)` (`:182,:188,:198`).
   Si Yesi sale a Propietarios, carga a Fede y vuelve, **la ficha no aparece** — ni en el matcheo, ni en el
   buscador manual. Y si por otra vía llegara a seleccionarla, el RPC corta con *"La ficha pertenece a otro
   hipódromo"*. Es ISSUE-049 (ya diagnosticado y arreglado en `profesionales.html`) sin arreglar en el
   archivo hermano. Impacto acumulado hasta hoy: **0 filas** (`club_id IS NULL` = 0 sobre 260 — el alta por
   pantalla nunca se usó). Fede es el primer caso que lo dispara.
6. El caso inverso (ya en el padrón) **tampoco se vincula solo**, pero es barato: match exacto por DNI →
   tres clicks. Cubre **218/260 = 84 %** de los propietarios de Dolores. Los 40 sin DNI caen en sugerencias
   por apellido.

**Respuesta a Yesi:** hoy sí, hay que cargarlo a mano — y además el atajo de "cargalo en Propietarios y
volvé" no le va a andar. Pero **no es cada vez**: cuando el propietario ya está en el padrón con DNI
cargado (84 % de los casos), es un click. La carga manual es sólo para los genuinamente nuevos, como Fede.

### Qué tendría que hacer para que Yesi no cargue dos veces lo mismo

Tres cosas, en este orden de prioridad:

1. **Arreglar `propietarios.html` — bloqueante, y es el mismo fix ya validado de ISSUE-049.** Dos líneas:
   `club_id: CLUB_ID` en el payload del INSERT (`:419-433`) y `.eq('club_id', CLUB_ID)` en `load()` (`:307`).
   Sin esto, cualquier ficha nueva de propietario es inservible para la aprobación **y** el listado sigue
   filtrando 7 fichas de otro club. Como `club_id IS NULL` = 0 hoy, **no hace falta migración de adopción**
   — igual que en ISSUE-049. Esto solo ya destraba a Fede: crear la ficha en Propietarios y volver pasaría
   a funcionar de verdad.

2. **Implementar el botón "Crear ficha nueva" en la bandeja** — lo que el plan ya especificaba
   (`AUTOREGISTRO_PLAN.md:347`). Un botón en la rama "sin ficha" (`solicitudes.html:322-327`) que abra un
   modal **precargado con los datos declarados** (`nombre` armado de `apellido + nombre`, `documento_tipo`,
   `documento_nro`, `telefono`, `email`, `club_id`, y `nombre_stud` sugerido desde `origen_caballeriza`),
   deje a Yesi corregirlos, y en un solo paso cree la ficha y llame a `rpc_aprobar_solicitud` con el
   `entidad_id` recién creado. Eso elimina la doble carga y el ida y vuelta entre pantallas.

   Corolario de diseño: conviene que la creación viaje **dentro** de la misma transacción del RPC —
   p.ej. una variante `rpc_aprobar_solicitud_creando_ficha(p_solicitud_id, p_entidad_tipo, p_ficha jsonb)`,
   `SECURITY DEFINER` con la misma guarda `fn_solicitudes_guard_staff` y `club_id` forzado desde
   `v_sol.club_id` (nunca desde el cliente). Así el `club_id` no puede volver a quedar NULL por olvido en
   una pantalla, y no queda ficha huérfana si la aprobación falla a mitad de camino. Esto **no debilita**
   §C.8: sigue siendo la secretaría la que decide, con datos que puede editar antes de confirmar; lo que
   se elimina es el retipeo, no el criterio humano.

3. **Ampliar el matcheo con lo que ya está en la solicitud pero no se usa.** `origen_caballeriza` es
   obligatorio para propietarios y hoy no participa de ninguna búsqueda. Sumar `nombre_stud ilike
   %origen_caballeriza%` a las sugerencias, y partir `sol.apellido` por palabras en vez de usar la cadena
   completa (`Iguacel loeda` → `%Iguacel%` OR `%loeda%`), subiría el hit rate del fallback sin tocar la
   política de "nunca preseleccionado". Barato y sin riesgo.

Nota aparte, no bloqueante: los 40 propietarios sin `documento_nro` (tanda 2026-08-18) son el 15 % del
padrón que nunca va a dar match exacto. El checkbox "copiar el DNI declarado" (`solicitudes.html:335-337`,
tildado por defecto) va cerrando ese hueco de a una aprobación por vez, tal como anticipa
`AUTOREGISTRO_PLAN.md:355`.

## Preguntas abiertas

1. **¿Se implementa el botón "Crear ficha nueva" antes de resolver la solicitud de Fede, o se lo carga a
   mano esta vez?** Si es a mano, hay que arreglar `propietarios.html` primero (punto 1) o la ficha va a
   nacer sin `club_id` y Yesi va a volver a chocar contra la misma pantalla.
2. **¿`origen_caballeriza` ("Kazan") debería copiarse a `propietarios.nombre_stud`?** Son conceptos
   parecidos pero no idénticos —caballeriza vs stud— y la decisión es de negocio. Confirmar con Fede.
3. **¿Cómo se registra una sociedad/stud?** El RPC exige `^[0-9]{7,8}$`, así que un CUIT no entra. Hoy la
   sociedad se registra por su persona física. Hay 2 fichas de sociedad en el padrón con CUIT que jamás
   van a matchear. ¿Es aceptable o hay que aceptar CUIT en `rpc_solicitar_acceso`?
4. **¿Qué se hace con los 7 propietarios de "Mi Club Hípico"** que hoy son visibles y editables desde
   Dolores? El fix del punto 1 los oculta, que es lo correcto — sólo dejarlo dicho.
5. **¿Se abre ISSUE propio para `propietarios.html`** (gemelo de ISSUE-049) o se reabre el 049 ampliándolo
   a las dos pantallas?
