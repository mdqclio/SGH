# Relevamiento — tabla `apoderados` (autorizados a cobrar) vs. modelo descripto por Fede

- **Fecha**: 2026-08-28
- **SHA de `main` relevado**: `f928fe056c3d1fadfcd2f175b09f7e5042cd1cf2`
- **Branch de este informe**: `reports` (no se mergea)
- **Modo**: SOLO LECTURA. Únicamente `SELECT` vía MCP. Cero DDL/DML, cero cambios de código.

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

SELECT count(*) AS spcs_count FROM spcs;
[{"spcs_count":181}]

SELECT current_database();  →  postgres
get_project_url             →  https://unlhcuanfrtpatoipwve.supabase.co
```

Los tres coinciden con el baseline de `CLAUDE.md` (pwd, spcs=181, ref `unlhcuanfrtpatoipwve`).

---

## Contexto: lo que Fede describió hoy

> El titular de la caballeriza puede autorizar a otros a cobrar, con **autorización de escribano**,
> presentada en **original y copia** en cada hipódromo, que el hipódromo **valida y archiva**.
> Ejemplo suyo: es titular de El Estucazán y tiene autorizado a su hermano Mariano; en La Plata
> tiene **dos** autorizados. **La autorización es por hipódromo, no global.**

---

## 1. Estructura real de `apoderados`

```sql
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='apoderados'
ORDER BY ordinal_position;
```

Salida cruda:

```json
[{"column_name":"id","data_type":"uuid","udt_name":"uuid","is_nullable":"NO","column_default":"gen_random_uuid()"},
 {"column_name":"club_id","data_type":"uuid","udt_name":"uuid","is_nullable":"NO","column_default":null},
 {"column_name":"autorizante_tipo","data_type":"text","udt_name":"text","is_nullable":"NO","column_default":null},
 {"column_name":"autorizante_id","data_type":"uuid","udt_name":"uuid","is_nullable":"NO","column_default":null},
 {"column_name":"autorizado_nombre","data_type":"text","udt_name":"text","is_nullable":"NO","column_default":null},
 {"column_name":"autorizado_documento","data_type":"text","udt_name":"text","is_nullable":"NO","column_default":null},
 {"column_name":"vigente","data_type":"boolean","udt_name":"bool","is_nullable":"NO","column_default":"true"},
 {"column_name":"creado_at","data_type":"timestamp with time zone","udt_name":"timestamptz","is_nullable":"YES","column_default":"now()"},
 {"column_name":"creado_por","data_type":"uuid","udt_name":"uuid","is_nullable":"YES","column_default":null}]
```

**9 columnas. Ni una más.**

| Columna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `club_id` | uuid | NO | — (FK → `clubs(id)`) |
| `autorizante_tipo` | text | NO | — (CHECK: `'propietario'` \| `'profesional'`) |
| `autorizante_id` | uuid | NO | — (**polimórfico, SIN FK**) |
| `autorizado_nombre` | text | NO | — |
| `autorizado_documento` | text | NO | — |
| `vigente` | boolean | NO | `true` |
| `creado_at` | timestamptz | SÍ | `now()` |
| `creado_por` | uuid | SÍ | — |

### Constraints

```sql
SELECT con.conname, pg_get_constraintdef(con.oid), con.contype
FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
JOIN pg_namespace n ON n.oid=rel.relnamespace
WHERE n.nspname='public' AND rel.relname='apoderados';
```

```json
[{"conname":"apoderados_autorizante_tipo_check","def":"CHECK ((autorizante_tipo = ANY (ARRAY['propietario'::text, 'profesional'::text])))","contype":"c"},
 {"conname":"apoderados_club_id_fkey","def":"FOREIGN KEY (club_id) REFERENCES clubs(id)","contype":"f"},
 {"conname":"apoderados_pkey","def":"PRIMARY KEY (id)","contype":"p"}]
```

Nota: la **única FK** es a `clubs`. `autorizante_id` no tiene FK (decisión documentada en
`migrations/apoderados.sql:8-10`: "patrón beneficiario_id de liquidacion_detalle").

### Índices

```json
[{"indexname":"apoderados_pkey","indexdef":"CREATE UNIQUE INDEX apoderados_pkey ON public.apoderados USING btree (id)"},
 {"indexname":"apoderados_autorizante_idx","indexdef":"CREATE INDEX apoderados_autorizante_idx ON public.apoderados USING btree (club_id, autorizante_tipo, autorizante_id)"},
 {"indexname":"apoderados_uniq_vigente","indexdef":"CREATE UNIQUE INDEX apoderados_uniq_vigente ON public.apoderados USING btree (club_id, autorizante_tipo, autorizante_id, autorizado_documento) WHERE vigente"}]
```

### RLS

`relrowsecurity = true`. 4 policies `TO authenticated`, patrón club-scoped estándar:

```json
[{"policyname":"apoderados_select","cmd":"SELECT","qual":"((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id())))"},
 {"policyname":"apoderados_insert","cmd":"INSERT","with_check":"((NOT (SELECT fn_is_portal_user())) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))))"},
 {"policyname":"apoderados_update","cmd":"UPDATE","qual":"…idem…","with_check":"…idem…"},
 {"policyname":"apoderados_delete","cmd":"DELETE","qual":"…idem…"}]
```

### Filas hoy, por club

```sql
SELECT a.club_id, c.nombre AS club, a.autorizante_tipo, a.vigente, count(*)
FROM apoderados a LEFT JOIN clubs c ON c.id=a.club_id GROUP BY 1,2,3,4;
```

```json
[]
```

```sql
SELECT count(*) AS total_apoderados, min(creado_at) AS primera, max(creado_at) AS ultima FROM apoderados;
```

```json
[{"total_apoderados":0,"primera":null,"ultima":null}]
```

> **La tabla está VACÍA. 0 filas en los 3 clubes.** Nunca se cargó un apoderado en producción,
> ni en Dolores ni en los otros dos clubes.

Referencia de escala de los clubes:

```json
[{"club":"Hipódromo de Dolores","id":"0649e9c5-9e87-4aad-842f-101458e6b33c","propietarios":253,"profesionales":174},
 {"club":"Jockey Club San Francisco - Hipodromo Oscar C. Boero","id":"710d43c1-364e-4431-99d9-c47e87242075","propietarios":0,"profesionales":0},
 {"club":"Mi Club Hípico","id":"a6da7e40-1515-45dc-8933-4eef33ce937a","propietarios":7,"profesionales":11}]
```

---

## 2. Respaldo documental (escribano / acta / vigencia / folio / adjunto)

Se buscó en las 9 columnas cualquier campo que registre el instrumento notarial. Resultado:

| Lo que Fede pidió | Campo en la tabla |
|---|---|
| Escribano interviniente | **NO EXISTE** |
| Nº de acta / escritura | **NO EXISTE** |
| Nº de folio | **NO EXISTE** |
| Fecha de la autorización (la del instrumento) | **NO EXISTE** |
| Fecha de vencimiento / vigencia del poder | **NO EXISTE** |
| Archivo adjunto / URL del escaneo | **NO EXISTE** |
| Notas / observaciones libres | **NO EXISTE** |
| Constancia de "presentado original y copia" | **NO EXISTE** |
| Constancia de "validado y archivado por el hipódromo" | **NO EXISTE** |

**Dicho explícito: NO hay ningún campo de respaldo documental.** La tabla registra únicamente
*quién autorizó a quién* (nombre + DNI del autorizado) y *si sigue vigente* (boolean). El único
rastro temporal es `creado_at` — que es **cuándo el operador tipeó la fila en SGH**, no la fecha
del instrumento notarial. Y `creado_por` — qué usuario de SGH la cargó, no qué escribano la
otorgó.

Esto es exactamente lo que Fede describió hoy y es **lo único que falta del modelo** en el plano
de datos. Todo lo demás que describió (ver tabla de cierre) ya está soportado.

---

## 3. Alcance por hipódromo

**CUBIERTO. No hay divergencia.** La autorización es por hipódromo por diseño, en tres capas:

1. **Columna**: `club_id uuid NOT NULL REFERENCES clubs(id)` — cada fila de autorización pertenece
   a un club.
2. **Unique parcial**: `(club_id, autorizante_tipo, autorizante_id, autorizado_documento) WHERE vigente`
   — el `club_id` es la **primera** columna de la clave. El mismo DNI puede estar autorizado por el
   mismo titular en Dolores y en La Plata sin colisionar. Son dos filas independientes.
3. **RLS**: `club_id = fn_get_user_club_id()` — un operador de Dolores no ve ni escribe las
   autorizaciones de otro hipódromo.

El caso de Fede se modela sin forzar nada: en Dolores, 1 fila (Mariano); en La Plata (cuando exista
como club en SGH), 2 filas distintas. Revocar en un club no toca al otro.

Matiz sobre el autorizante: `propietarios` y `profesionales` **también** son per-club
(`propietarios.club_id` existe y está poblado — `prop_club_null = 0` sobre 260 filas). Es decir,
"Fede titular de El Estucazán" es una fila de `propietarios` **distinta** en Dolores que en La Plata,
con `id` distinto. Así que la separación por hipódromo está doblemente garantizada: por el
`club_id` de la autorización **y** por la identidad del autorizante. La contracara es que no hay
ningún concepto de "persona global" que unifique al mismo titular entre hipódromos — es la misma
deuda que ya tiene el resto del ABM, no algo propio de `apoderados`.

Nota: La Plata **no existe** como club en la base. Los 3 clubes son Dolores, Jockey Club San
Francisco y "Mi Club Hípico". El escenario multi-hipódromo de Fede hoy no es reproducible en datos.

---

## 4. Quién puede tener apoderados, y cómo se modela

**Los dos**: propietarios y profesionales.

Modelado: **tabla plana con autorizante polimórfico**, no dos FK y no dos tablas.

```
autorizante_tipo  text NOT NULL CHECK (autorizante_tipo IN ('propietario','profesional'))
autorizante_id    uuid NOT NULL     -- polimórfico, SIN FK
```

El comentario de la migración (`migrations/apoderados.sql:8-10`) lo declara y justifica:

> `autorizante_id` es POLIMÓRFICO (→ propietarios/profesionales según `autorizante_tipo`), SIN FK,
> igual que el patrón `beneficiario_id` de `liquidacion_detalle`. Se valida por aplicación + RLS
> club-scoped.

Consecuencia: **no hay integridad referencial sobre el autorizante**. Si se borra un propietario
(`propietarios.html:446` hace `DELETE` duro), sus filas de `apoderados` quedan huérfanas sin que la
base se queje. Hoy es inocuo porque la tabla está vacía.

Cobertura por rol: la UI de propietarios cubre a los titulares; la de profesionales cubre a
entrenadores y jockeys (comparten tabla `profesionales`). No hay UI para el tercer beneficiario
posible, `club` — correcto, un club no delega su cobro.

---

## 5. Vigencia y revocación

**Mecanismo: un boolean, sin fechas.**

- Campo: `vigente boolean NOT NULL DEFAULT true`.
- **No hay** fecha de baja, **no hay** fecha de alta del poder, **no hay** rango `desde`/`hasta`,
  **no hay** vencimiento automático.
- **Sí se puede revocar**, y la revocación es un soft-delete que **conserva el registro**:

  `propietarios.html:492-498` / `profesionales.html:470-476`
  ```javascript
  async function apoRevocar(id) {
    if (!confirm('¿Revocar esta autorización? El registro se conserva (no se borra).')) return;
    const { error } = await sb.from('apoderados').update({ vigente:false }).eq('id', id);
    …
  }
  ```
- El unique parcial es `WHERE vigente`, así que tras revocar **se puede volver a autorizar** al mismo
  DNI (nueva fila). Queda historial: la fila revocada persiste y se renderiza tachada
  (`propietarios.html:475`: `revocado`, con `opacity:.5;text-decoration:line-through`).
- **Cuándo** se revocó no queda registrado en ninguna parte: el `UPDATE` no escribe timestamp, no hay
  trigger de auditoría en la tabla (ver punto 8) y no hay columna `revocado_at`. Sólo se sabe *que*
  está revocada, no *desde cuándo* ni *quién* la revocó.

Sobre el rótulo "vigentes" del display de Pagos: no es una evaluación de fechas, es literalmente
`.eq('vigente', true)` (`liquidaciones.html:898`).

---

## 6. El ABM — archivo y línea, y la trampa de usabilidad

### Ubicación

| Archivo | Bloque HTML | Lógica JS |
|---|---|---|
| `propietarios.html` | `242-257` (`#apo-section`) | `452-498` (`APO_TIPO='propietario'`, `apoLoad` 456, `apoRender` 468, `apoAdd` 478, `apoRevocar` 492) |
| `profesionales.html` | `207-222` (`#apo-section`) | `430-476` (`APO_TIPO='profesional'`, `apoLoad` 434, `apoRender` 446, `apoAdd` 456, `apoRevocar` 470) |

Los dos bloques son código gemelo, sólo cambia la constante `APO_TIPO`.

### La sección sólo aparece al EDITAR — **CONFIRMADO**

`propietarios.html:391-394`:
```javascript
  // Apoderados: solo sobre un autorizante ya existente (necesita id).
  const apoSec = document.getElementById('apo-section');
  if (rec?.id) { apoSec.style.display = ''; apoLoad(rec.id); }
  else { apoSec.style.display = 'none'; document.getElementById('apo-list').innerHTML = ''; }
```

`profesionales.html:366-369`: idéntico.

Y el contenedor arranca oculto en el HTML: `style="display:none;…"` (`propietarios.html:243`,
`profesionales.html:208`).

El propio comentario del código lo rotula como "Solo al editar un propietario existente"
(`propietarios.html:242`).

**Es cierto, y la razón técnica es real**: `apoderados.autorizante_id` es `NOT NULL` y se necesita el
`id` del autorizante para insertar; en un alta nueva ese `id` todavía no existe (lo genera el
`INSERT` de `propietarios`). El formulario no hace un guardado en dos pasos.

**Es también una trampa de usabilidad, y es candidata razonable a explicar el no-uso.** El operador
que da de alta a un propietario nunca ve que la función existe: en el alta el bloque no está, y
después del `INSERT` el modal se cierra (`closeModal()` en `saveRecord`, `propietarios.html:440`) y
vuelve al listado. Para llegar a "Autorizados a cobrar" hay que **reabrir** la ficha del propietario
recién creado con el botón de editar. Nada en la UI le anticipa que ahí adentro hay algo distinto.
Sumado a que el bloque de Pagos también está enterrado (ver punto 7 y GOTCHA #52), la feature no
tiene ningún punto de descubrimiento en el flujo normal de trabajo.

Salvedad honesta: es una explicación plausible, no una causa demostrada. La tabla vacía es
compatible con "nadie la encontró" y también con "nadie la necesitó todavía" o "nunca se le contó a
la secretaría que existía". El relevamiento no distingue entre esas hipótesis.

---

## 7. El display en Pagos

### Ubicación

`liquidaciones.html`:
- **Query**: `894-898` — dentro de `cobrosDetalle(tipo, id)`, tercera promesa del `Promise.all`.
- **Render**: `932-938` (`apoBlock`), insertado en el DOM en `942` (`${apoBlock}` dentro del
  `innerHTML` de `#cob-detalle`).
- **escapeHtml** dedicado para este bloque: `393`.

### Qué consulta

```javascript
// ISSUE-028 v1.1 — apoderados vigentes del beneficiario (read-only, solo display).
sb.from('apoderados')
  .select('autorizado_nombre,autorizado_documento')
  .eq('club_id', CLUB_ID).eq('autorizante_tipo', tipo).eq('autorizante_id', id)
  .eq('vigente', true).order('creado_at', { ascending:true }),
```

Sólo `autorizado_nombre` y `autorizado_documento`. Sólo `vigente=true`.

### Qué muestra

```javascript
const apoBlock = apoderados.length
  ? `<div class="config-card" style="…border:1px solid var(--accent);…">
      <div class="config-card-title">🪪 Autorizados a cobrar</div>
      ${apoderados.map(a=>`<div style="font-size:13px;padding:3px 0;">${escapeHtml(a.autorizado_nombre)} <span style="color:var(--muted)">· DNI ${escapeHtml(a.autorizado_documento)}</span></div>`).join('')}
     </div>`
  : `<div style="font-size:12px;color:var(--muted);margin:4px 0 14px;">Sin autorizados registrados — cobra el titular.</div>`;
```

Con datos: recuadro con borde dorado, título "🪪 Autorizados a cobrar", y una línea por autorizado:
`Nombre · DNI 12345678`. Sin datos (el caso de hoy, siempre): la leyenda gris
**"Sin autorizados registrados — cobra el titular."**

Sin botones. El alta/baja no vive acá — el comentario de `932` lo dice: "sin botones; el alta/baja
vive en propietarios/profesionales".

### ¿Afecta la emisión del recibo?

**No. Es puramente informativo para el operador. Cero efecto.** Verificado en tres puntos:

1. **La UI no lee la variable al emitir.** `cobrosEmitir()` (`liquidaciones.html:970-987`) no toca
   `apoderados`; manda explícitamente `null`:
   ```javascript
   // Ya no se captura cobrador (decisión Fede). El RPC mantiene su firma; nombre/documento van null
   // (recibos.cobrador_nombre/documento son TEXT nullable).
   const { data, error } = await sb.rpc('emitir_recibo', {
     p_club_id: CLUB_ID, p_beneficiario_tipo: cobBenef.tipo, p_beneficiario_id: cobBenef.id,
     p_linea_ids: ids, p_forma_pago: forma, p_cobrador_nombre: null, p_cobrador_documento: null, p_comprobante_url: comprobante,
   });
   ```
2. **El RPC no la conoce.**
   ```sql
   SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
          (pg_get_functiondef(p.oid) ILIKE '%apoderad%') AS menciona_apoderados
   FROM pg_proc p … WHERE p.proname IN ('emitir_recibo','liberar_linea','anular_recibo');
   ```
   ```json
   [{"proname":"emitir_recibo","args":"p_club_id uuid, p_beneficiario_tipo beneficiario_tipo, p_beneficiario_id uuid, p_linea_ids uuid[], p_forma_pago forma_pago_recibo, p_cobrador_nombre text, p_cobrador_documento text, p_comprobante_url text","menciona_apoderados":false},
    {"proname":"liberar_linea","args":"p_linea_id uuid","menciona_apoderados":false}]
   ```
   (`anular_recibo` no existe.)
3. **El recibo impreso no los lista.** `imprimirReciboCobro` (`liquidaciones.html:1003-1061`) arma
   `copia('ORIGINAL')` y `copia('DUPLICADO')` sin ninguna referencia a `apoderados` — grep de
   `autorizado|apoderad` sobre el archivo no devuelve nada entre las líneas 1003 y 1061.

**Consecuencia relevante para el negocio**: `recibos` tiene `cobrador_nombre` y `cobrador_documento`
(ambos `text NULL`) — el lugar natural para asentar *quién retiró la plata*. Están **siempre vacíos**:

```sql
SELECT count(*) AS n_recibos,
 count(*) FILTER (WHERE cobrador_nombre IS NOT NULL AND btrim(cobrador_nombre)<>'') AS con_cobrador_nombre,
 count(*) FILTER (WHERE cobrador_documento IS NOT NULL AND btrim(cobrador_documento)<>'') AS con_cobrador_doc
FROM recibos;
```
```json
[{"n_recibos":5,"con_cobrador_nombre":0,"con_cobrador_doc":0}]
```

Los 5 recibos emitidos no dicen quién cobró. La captura del cobrador se sacó por decisión de Fede
(comentario en `liquidaciones.html:976`). Es decir: hoy el circuito **muestra** a los autorizados
(cuando los haya) pero **no deja asentado** cuál de ellos cobró. El vínculo apoderado→recibo no
existe en ninguna dirección.

---

## 8. Rastro de uso en auditoría

```sql
SELECT tabla, accion, count(*), min(created_at), max(created_at)
FROM auditoria WHERE tabla ILIKE '%apoderad%' GROUP BY 1,2;
```
```json
[]
```

Universo completo de la tabla `auditoria`, para contraste:

```sql
SELECT tabla, count(*) AS n FROM auditoria GROUP BY 1 ORDER BY 2 DESC;
```
```json
[{"tabla":"inscripciones","n":2919},{"tabla":"liquidaciones","n":2229},{"tabla":"carreras","n":1096},
 {"tabla":"usuarios","n":355},{"tabla":"reuniones","n":333},{"tabla":"resultados","n":320},
 {"tabla":"recibos","n":79},{"tabla":"clubs","n":11},{"tabla":"categorias_carrera","n":4},
 {"tabla":"liquidacion_config","n":1}]
```

`apoderados` no aparece. **Nunca se insertó ni se editó una fila desde que se creó la tabla el
2026-06-10.** Coincide con el `count(*) = 0` del punto 1.

**Salvedad metodológica importante**: la ausencia en `auditoria` **no sería prueba** por sí sola,
porque `apoderados` **no tiene trigger de auditoría**. Se verificó:

```sql
SELECT tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t … WHERE c.relname='apoderados' AND NOT t.tgisinternal;
```
```json
[]
```

Y las tablas que sí lo tienen son exactamente las 10 que aparecen en `auditoria`:

```json
[{"tabla":"carreras","tgname":"trg_audit_carreras"},{"tabla":"categorias_carrera","tgname":"trg_audit_categorias_carrera"},
 {"tabla":"clubs","tgname":"trg_audit_clubs"},{"tabla":"inscripciones","tgname":"trg_audit_inscripciones"},
 {"tabla":"liquidacion_config","tgname":"trg_audit_liquidacion_config"},{"tabla":"liquidaciones","tgname":"trg_audit_liquidaciones"},
 {"tabla":"recibos","tgname":"trg_audit_recibos"},{"tabla":"resultados","tgname":"trg_audit_resultados"},
 {"tabla":"reuniones","tgname":"trg_audit_reuniones"},{"tabla":"usuarios","tgname":"trg_audit_usuarios"}]
```

O sea: aunque alguien hubiera cargado y borrado un apoderado, **no habría quedado rastro en
`auditoria`**. La prueba dura del no-uso es el `count(*) = 0` de la tabla misma (y que las
revocaciones son soft-delete que conservan la fila, así que un uso previo revocado también se vería).
Ambas evidencias coinciden: **nunca se usó**.

Rastro en git, para fechar la creación:

```
946ce0c 2026-06-10 feat(apoderados): ISSUE-028 v1 — tabla apoderados + gestión en propietarios/profesionales
1444fa3 2026-06-10 Merge branch 'feat/apoderados-v1'
29a89ed 2026-06-10 feat(pagos): ISSUE-028 v1.1 — display read-only de apoderados en cobrosDetalle
e7a5fb1 2026-06-10 Merge branch 'feat/apoderados-v1.1-pagos'
```

**79 días en producción, 0 filas.** Ambas ramas ya están en `main` y las locales fueron limpiadas
(`docs/MERGE_CLEANUP_2026-08-04.md:85-86`).

Corrobora el no-uso, desde otro ángulo, `docs/PERF_AUDIT.md:221`: el advisor de Supabase reporta
`apoderados_autorizante_idx` como **`unused_index`**.

---

## Cierre — lo que Fede describió hoy vs. lo que la tabla soporta

| # | Requisito descripto por Fede | Estado | Dónde / por qué |
|---|---|---|---|
| 1 | El titular puede autorizar a **otros** (varios) a cobrar | ✅ **Cubierto** | N filas por autorizante; unique sólo impide el mismo DNI dos veces vigente |
| 2 | El autorizante es el **titular de la caballeriza** (propietario) | ✅ **Cubierto** | `autorizante_tipo='propietario'`, ABM en `propietarios.html:452-498` |
| 3 | También aplica a profesionales (entrenadores/jockeys) | ✅ **Cubierto** | `autorizante_tipo='profesional'`, ABM en `profesionales.html:430-476` |
| 4 | La autorización es **por hipódromo, no global** | ✅ **Cubierto** | `club_id NOT NULL` + unique con `club_id` como 1ª columna + RLS club-scoped |
| 5 | Distintos autorizados en Dolores y en La Plata para el mismo titular | ✅ **Cubierto** (modelo) · ⚠️ no reproducible en datos | El modelo lo permite; La Plata no existe como club en la base (3 clubes: Dolores, JC San Francisco, Mi Club Hípico) |
| 6 | Identificar al autorizado (nombre + documento) | ✅ **Cubierto** | `autorizado_nombre` + `autorizado_documento`, ambos `NOT NULL` |
| 7 | Se puede **revocar** la autorización | ✅ **Cubierto** | `vigente=false` (soft-delete, conserva registro y permite re-autorizar) |
| 8 | Que el operador de Pagos **vea** quién está autorizado | ✅ **Cubierto** · ⚠️ enterrado | `liquidaciones.html:932-938`; sólo visible tras abrir el detalle de una persona (GOTCHA #52) |
| 9 | **Autorización de escribano** — asentar el instrumento | ❌ **AUSENTE** | No hay campo de escribano, escritura, acta ni folio |
| 10 | **Fecha** de la autorización notarial | ❌ **AUSENTE** | `creado_at` es la fecha de tipeo en SGH, no la del instrumento |
| 11 | **Vigencia** del poder (vencimiento / rango de fechas) | ❌ **AUSENTE** | Sólo un boolean `vigente`; sin `desde`/`hasta` ni vencimiento automático |
| 12 | Presentada en **original y copia** — constancia | ❌ **AUSENTE** | Sin campo de constancia de presentación |
| 13 | El hipódromo **valida** la autorización — quién y cuándo | ❌ **AUSENTE** | `creado_por` dice quién cargó la fila, no quién validó el poder |
| 14 | El hipódromo **archiva** la documentación — adjunto/escaneo | ❌ **AUSENTE** | Sin `comprobante_url` ni referencia a archivo (`recibos` sí tiene `comprobante_url`; `apoderados` no) |
| 15 | Cuándo se revocó y quién revocó | ❌ **AUSENTE** | El `UPDATE vigente=false` no escribe timestamp ni usuario; sin trigger de auditoría |
| 16 | Que el recibo asiente **cuál** autorizado cobró | ❌ **AUSENTE** | `emitir_recibo` no conoce `apoderados`; `recibos.cobrador_nombre/documento` van `null` por decisión previa (0/5 recibos con cobrador) |
| 17 | Integridad: que el autorizante exista de verdad | 🟡 **Parcial** | `autorizante_id` sin FK (polimórfico, por diseño); validado sólo por app + RLS |
| 18 | Que la feature se **use** | ❌ **Sin uso** | 0 filas en 79 días; 0 eventos en `auditoria`; índice reportado `unused_index` |

### Resumen en números

- **9** columnas en la tabla. **0** de ellas de respaldo documental.
- **8** de los 18 requisitos: cubiertos. **1**: parcial. **8**: ausentes. **1**: sin uso.
- **0** filas en `apoderados`, en los **3** clubes, tras **79** días en producción (creada 2026-06-10).
- **5** recibos emitidos, **0** con cobrador asentado.
- El bloque de datos que falta es **uno solo y coherente**: el respaldo documental del poder
  (ítems 9-15) — que es exactamente lo que Fede planteó hoy.

### Preguntas abiertas

1. **¿El respaldo documental es dato estructurado o un adjunto?** Fede habla de original y copia en
   papel que el hipódromo archiva físicamente. ¿Alcanza con campos de texto (escribano, nº de
   escritura, fecha) para poder ubicar el papel en el archivo, o quiere el escaneo subido? Lo segundo
   implica Supabase Storage, que hoy no se usa para nada en el proyecto.
2. **¿El poder vence?** Determina si alcanza `vigente boolean` o hace falta `vigente_desde` /
   `vigente_hasta` con evaluación por fecha. Nadie preguntó esto en junio.
3. **¿Hay que asentar cuál autorizado cobró cada recibo?** Es el ítem 16 y choca con la decisión
   previa de Fede de **sacar** la captura del cobrador (`liquidaciones.html:976`). Si la
   autorización notarial importa, no asentar quién retiró parece la contradicción más fuerte del
   circuito actual. Requiere que Fede reconsidere aquella decisión, o que la confirme.
4. **¿Se avisó alguna vez a la secretaría de Dolores que la sección existe?** Determina si el no-uso
   es un problema de descubrimiento (que se arregla moviendo la UI) o de necesidad (que no se
   arregla con UI).
5. **¿Quién valida el poder?** El rol `secretario_carreras` que carga la fila, ¿es el mismo que
   valida el instrumento notarial, o hace falta distinguir cargador de validador?
6. **La Plata**: ¿va a existir como club en SGH antes del 20/9? El escenario multi-hipódromo de Fede
   hoy no se puede ni probar.

### Notas de método

- Todas las consultas fueron `SELECT`. Cero `INSERT`/`UPDATE`/`DELETE`/DDL, cero `apply_migration`.
- Cero modificaciones de código. `main` intacto en `f928fe0`; este informe vive sólo en `reports`.
- Los conteos son una foto del 2026-08-28. `apoderados = 0` es el número a re-verificar si alguien
  afirma haber usado la feature.
