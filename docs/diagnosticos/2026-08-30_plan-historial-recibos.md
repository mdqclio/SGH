# Plan — Vista de historial de recibos (opción B de ISSUE-056)

**Fecha:** 2026-08-30
**SHA de `main` al relevar:** `2821c7c223a00d6f9bb53c8ea389a145f0efb424`
**Rama de este informe:** `reports`
**Estado:** PLAN. **No se escribió una línea de código.** `liquidaciones.html` sigue intacto.

**Pedido — tres veces:**
- Fede, 27/08: *"si vas al histórico de esa persona, sí te puede poner todos los pagos. Entonces podés decir, se cobró tal día en tal horario, y podés buscar el recibo y mostrar el recibo de quién lo firmó."*
- Valeria, 30/08: *"cuando se vayan pagando y emitiendo los recibos, ¿en esos aparece que ya fue impreso o que fue pagado? Así me queda diferenciado."*
- Fede, 30/08: *"¿podemos poner algún número o algo que identifique a la búsqueda de los recibos?"* — el número ya existe y es correlativo; lo que falta es **buscar**. Sin prefijos A1/A2.

---

## Guards verificados

```
$ pwd
/home/clio/dev/SGH
```

```sql
SELECT count(*) AS spcs_count FROM spcs;
```
```json
[{"spcs_count":181}]
```

```
ref del proyecto: unlhcuanfrtpatoipwve
```

---

# 0. LOS CINCO HALLAZGOS QUE CAMBIAN EL DISEÑO

Antes de nada, porque tres de estos corrigen premisas del pedido:

| # | Hallazgo | Consecuencia |
|---|---|---|
| 1 | **`lineas_anuladas` guarda sólo un array de UUIDs**, no un snapshot de las filas | Reconstruir el detalle de un anulado es un `.in('id', ids)` contra `liquidacion_detalle` — las filas **siguen existiendo**, anular sólo les pone `recibo_id = NULL` |
| 2 | **`cobDelClub` NO sirve para `recibos`** | `cobDelClub` mira `l.liquidaciones.club_id`; `recibos` tiene **columna propia** `club_id`. Se filtra directo. `cobDelClub` sí se reusa, pero para las **líneas** |
| 3 | **`imprimirReciboCobro` recibe `lineaIds` y NO lo usa** — relee por `.eq('recibo_id', …)` | Para un **anulado** ese campo es `NULL` → **la reimpresión saldría vacía**. Es un bug latente que el requisito 4 destapa |
| 4 | **La RLS de `recibos` NO acota por club a un `super_admin`** | El aislamiento tiene que ser de aplicación, igual que ISSUE-060. No es defensa en profundidad: es la única defensa para ese rol |
| 5 | **No existe ningún registro de "impreso"** | La pregunta de Valeria "¿aparece que ya fue impreso?" **no se puede responder con el schema actual**. Sí se puede responder "¿fue pagado?" |

---

# 1. RELEVAMIENTO

## 1.a — La tabla `recibos`

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_name = 'recibos' ORDER BY ordinal_position;
```
```json
[{"column_name":"id","data_type":"uuid","is_nullable":"NO","column_default":"gen_random_uuid()"},
 {"column_name":"club_id","data_type":"uuid","is_nullable":"NO","column_default":null},
 {"column_name":"numero_recibo","data_type":"integer","is_nullable":"NO","column_default":null},
 {"column_name":"beneficiario_tipo","data_type":"USER-DEFINED","is_nullable":"NO","column_default":null},
 {"column_name":"profesional_id","data_type":"uuid","is_nullable":"YES","column_default":null},
 {"column_name":"propietario_id","data_type":"uuid","is_nullable":"YES","column_default":null},
 {"column_name":"forma_pago","data_type":"USER-DEFINED","is_nullable":"NO","column_default":null},
 {"column_name":"total_premios","data_type":"numeric","is_nullable":"NO","column_default":"0"},
 {"column_name":"total_descuentos","data_type":"numeric","is_nullable":"NO","column_default":"0"},
 {"column_name":"retencion_dgi","data_type":"numeric","is_nullable":"YES","column_default":null},
 {"column_name":"neto_a_cobrar","data_type":"numeric","is_nullable":"YES","column_default":null},
 {"column_name":"cobrador_nombre","data_type":"text","is_nullable":"YES","column_default":null},
 {"column_name":"cobrador_documento","data_type":"text","is_nullable":"YES","column_default":null},
 {"column_name":"comprobante_url","data_type":"text","is_nullable":"YES","column_default":null},
 {"column_name":"estado","data_type":"USER-DEFINED","is_nullable":"NO","column_default":"'emitido'::estado_recibo"},
 {"column_name":"emitido_por","data_type":"uuid","is_nullable":"YES","column_default":null},
 {"column_name":"emitido_at","data_type":"timestamp with time zone","is_nullable":"NO","column_default":"now()"},
 {"column_name":"anulado_at","data_type":"timestamp with time zone","is_nullable":"YES","column_default":null},
 {"column_name":"notas","data_type":"text","is_nullable":"YES","column_default":null},
 {"column_name":"created_at","data_type":"timestamp with time zone","is_nullable":"NO","column_default":"now()"},
 {"column_name":"anulado_por","data_type":"uuid","is_nullable":"YES","column_default":null},
 {"column_name":"motivo_anulacion","data_type":"text","is_nullable":"YES","column_default":null},
 {"column_name":"lineas_anuladas","data_type":"jsonb","is_nullable":"YES","column_default":null}]
```

**Ojo con el beneficiario: no hay un `beneficiario_id` genérico.** Hay `profesional_id` **y**
`propietario_id`, nullables, discriminados por `beneficiario_tipo`. Esto es distinto de
`liquidacion_detalle`, que sí tiene `beneficiario_id`. Toda búsqueda por persona tiene que
contemplar las dos columnas.

ENUMs de la tabla:

```sql
SELECT a.attname, t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS valores
FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid LEFT JOIN pg_enum e ON e.enumtypid=t.oid
WHERE a.attrelid='recibos'::regclass AND t.typtype='e' GROUP BY a.attname, t.typname;
```
```json
[{"attname":"beneficiario_tipo","typname":"beneficiario_tipo","valores":"profesional, propietario, club"},
 {"attname":"estado","typname":"estado_recibo","valores":"emitido, anulado"},
 {"attname":"forma_pago","typname":"forma_pago_recibo","valores":"efectivo, transferencia"}]
```

`estado` tiene **exactamente dos** valores: `emitido` y `anulado`. No hay `impreso`, `entregado`
ni nada parecido — vuelve en §6.

Índices:

```sql
SELECT indexname, indexdef FROM pg_indexes WHERE tablename='recibos' ORDER BY indexname;
```
```json
[{"indexname":"recibos_pkey","indexdef":"CREATE UNIQUE INDEX recibos_pkey ON public.recibos USING btree (id)"},
 {"indexname":"uq_recibo_por_club","indexdef":"CREATE UNIQUE INDEX uq_recibo_por_club ON public.recibos USING btree (club_id, numero_recibo)"}]
```

**`uq_recibo_por_club (club_id, numero_recibo)` es exactamente el índice que necesita la búsqueda
por número.** Un `.eq('club_id', …).eq('numero_recibo', n)` pega el índice y además **el aislamiento
por club viaja en la misma condición**: no hay forma de buscar el número sin acotar el club. No hay
que crear ningún índice.

## 1.b — Los datos que hay hoy

```sql
SELECT count(*) AS total_recibos, count(*) FILTER (WHERE estado='anulado') AS anulados,
       count(*) FILTER (WHERE cobrador_nombre IS NOT NULL) AS con_cobrador,
       count(DISTINCT club_id) AS clubes, min(emitido_at)::date AS primero, max(emitido_at)::date AS ultimo
FROM recibos;
```
```json
[{"total_recibos":5,"anulados":0,"con_cobrador":0,"clubes":1,"primero":"2026-06-10","ultimo":"2026-08-28"}]
```

Los 5, en crudo:

```sql
SELECT r.id::text, r.numero_recibo, r.club_id::text, c.nombre AS club, r.estado::text,
       r.beneficiario_tipo::text, r.profesional_id::text, r.propietario_id::text,
       r.cobrador_nombre, r.cobrador_documento, r.forma_pago::text, r.neto_a_cobrar,
       r.emitido_at, r.anulado_at, r.motivo_anulacion,
       jsonb_typeof(r.lineas_anuladas) AS tipo_jsonb, r.lineas_anuladas
FROM recibos r LEFT JOIN clubs c ON c.id=r.club_id ORDER BY r.emitido_at;
```
```json
[{"id":"e9000000-0000-0000-0000-000000009001","numero_recibo":9001,"club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","club":"Hipódromo de Dolores","estado":"emitido","beneficiario_tipo":"profesional","profesional_id":"7381c730-f95c-459f-8b24-41637300f117","propietario_id":null,"cobrador_nombre":null,"cobrador_documento":null,"forma_pago":"efectivo","neto_a_cobrar":"0.00","emitido_at":"2026-06-10 02:33:53.506047+00","anulado_at":null,"motivo_anulacion":null,"tipo_jsonb":null,"lineas_anuladas":null},
 {"id":"e9000000-0000-0000-0000-000000009002","numero_recibo":9002,"club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","club":"Hipódromo de Dolores","estado":"emitido","beneficiario_tipo":"propietario","profesional_id":null,"propietario_id":"0e0290d7-1195-4c23-a447-1061a834e1bd","cobrador_nombre":null,"cobrador_documento":null,"forma_pago":"efectivo","neto_a_cobrar":"0.00","emitido_at":"2026-06-10 02:33:53.506047+00","anulado_at":null,"motivo_anulacion":null,"tipo_jsonb":null,"lineas_anuladas":null},
 {"id":"77774e4d-6e5a-4015-9466-76fec012e212","numero_recibo":1,"club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","club":"Hipódromo de Dolores","estado":"emitido","beneficiario_tipo":"propietario","profesional_id":null,"propietario_id":"37fa6583-08bb-47ca-9923-bbe746c88537","cobrador_nombre":null,"cobrador_documento":null,"forma_pago":"efectivo","neto_a_cobrar":"70000.00","emitido_at":"2026-08-16 18:46:44.652601+00","anulado_at":null,"motivo_anulacion":null,"tipo_jsonb":null,"lineas_anuladas":null},
 {"id":"b2966769-6613-4894-993f-f2033738e44a","numero_recibo":2,"club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","club":"Hipódromo de Dolores","estado":"emitido","beneficiario_tipo":"propietario","profesional_id":null,"propietario_id":"42c319e8-24c9-4e2d-81d2-c2760caebf58","cobrador_nombre":null,"cobrador_documento":null,"forma_pago":"efectivo","neto_a_cobrar":"100000.00","emitido_at":"2026-08-28 12:58:16.28662+00","anulado_at":null,"motivo_anulacion":null,"tipo_jsonb":null,"lineas_anuladas":null},
 {"id":"003b04c6-1b41-428c-8f16-5fe3e148d16a","numero_recibo":3,"club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","club":"Hipódromo de Dolores","estado":"emitido","beneficiario_tipo":"profesional","profesional_id":"8c358b73-8d01-4293-9ac8-0f4d44f535f6","propietario_id":null,"cobrador_nombre":null,"cobrador_documento":null,"forma_pago":"efectivo","neto_a_cobrar":"60000.00","emitido_at":"2026-08-28 14:10:26.492625+00","anulado_at":null,"motivo_anulacion":null,"tipo_jsonb":null,"lineas_anuladas":null}]
```

Líneas por recibo:

```sql
SELECT ld.recibo_id::text, count(*) AS lineas, sum(ld.monto_neto) AS suma,
       string_agg(DISTINCT ld.concepto_tipo::text, ', ') AS tipos,
       count(*) FILTER (WHERE ld.inscripcion_id IS NOT NULL) AS con_inscripcion,
       count(*) FILTER (WHERE ld.reunion_id IS NOT NULL) AS con_reunion
FROM liquidacion_detalle ld WHERE ld.recibo_id IS NOT NULL GROUP BY 1 ORDER BY 1;
```
```json
[{"recibo_id":"003b04c6-1b41-428c-8f16-5fe3e148d16a","lineas":2,"suma":"60000.00","tipos":"incentivo_jockey, premio","con_inscripcion":1,"con_reunion":2},
 {"recibo_id":"77774e4d-6e5a-4015-9466-76fec012e212","lineas":1,"suma":"70000.00","tipos":"premio","con_inscripcion":1,"con_reunion":1},
 {"recibo_id":"b2966769-6613-4894-993f-f2033738e44a","lineas":1,"suma":"100000.00","tipos":"bono","con_inscripcion":1,"con_reunion":1},
 {"recibo_id":"e9000000-0000-0000-0000-000000009001","lineas":2,"suma":"170000.00","tipos":"incentivo_jockey, premio","con_inscripcion":0,"con_reunion":2},
 {"recibo_id":"e9000000-0000-0000-0000-000000009002","lineas":2,"suma":"700000.00","tipos":"bono, premio","con_inscripcion":0,"con_reunion":2}]
```

### Lo que dicen los datos

1. **Cero recibos anulados.** El caso central del requisito 3 **no tiene un solo ejemplo en la base**.
   El probe está obligado a fabricarse el suyo — vuelve en §8.
2. **Cero recibos con `cobrador_nombre`.** Los 5 son anteriores a la captura de cobrador
   (`154c83e`). La búsqueda por cobrador **va a devolver vacío para todo lo existente** y sólo
   empieza a servir con los recibos nuevos. Es un dato de expectativa, no un impedimento.
3. **Un solo club.** No hay ningún recibo de otro hipódromo, así que el agujero de aislamiento
   **no se puede observar hoy con los datos reales** — y por eso es tan importante cerrarlo antes
   de que exista el segundo club, no después.
4. **Los seeds 9001/9002 tienen `neto_a_cobrar = 0.00` pero sus líneas suman 170.000 y 700.000.**
   Son fixtures viejas, inconsistentes. La vista muestra el `neto_a_cobrar` del recibo, así que
   esos dos van a listarse en $0 con un detalle que no suma $0. **No es un bug de la vista** — pero
   va a ser lo primero que salte a la vista y conviene saberlo de antemano. Ver §10, pregunta 4.
5. `con_inscripcion = 0` en los seeds: su detalle va a mostrar `—` en Carrera y Caballo. Correcto:
   no tienen inscripción asociada.

## 1.c — Qué escribe `anular_recibo` en `lineas_anuladas`

```sql
SELECT p.proname, pg_get_functiondef(p.oid) AS def FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='anular_recibo';
```

El fragmento que importa, textual:

```sql
  -- ── 1: fotografiar las líneas ANTES de soltarlas ──────────────────────────
  SELECT COALESCE(jsonb_agg(d.id ORDER BY d.id), '[]'::jsonb) INTO v_lineas
    FROM liquidacion_detalle d WHERE d.recibo_id = p_recibo_id;

  IF jsonb_array_length(v_lineas) = 0 THEN
    RAISE EXCEPTION 'anular_recibo: el recibo % no tiene líneas asociadas — no se anula un recibo vacío',
      v_recibo.numero_recibo;
  END IF;

  -- ── 2: soltar recibo_id y devolver el estado que corresponde ──────────────
  UPDATE liquidacion_detalle d
     SET recibo_id    = NULL,
         pagado_at    = NULL,
         estado_linea = CASE
           WHEN d.fecha_liberacion IS NOT NULL AND d.fecha_liberacion > CURRENT_DATE
             THEN 'retenido'::estado_linea_liq
           ELSE 'impago'::estado_linea_liq
         END
   WHERE d.recibo_id = p_recibo_id;
```

**`jsonb_agg(d.id)` — es un array de UUIDs, no un snapshot de las filas.** El pedido lo describe
como "guardamos las líneas en jsonb"; lo que se guarda son **los identificadores**. La diferencia
importa:

- ✅ El detalle de un anulado **sí se puede reconstruir**: las filas de `liquidacion_detalle`
  siguen existiendo con su `concepto`, `monto_neto`, `posicion`, `inscripcion_id` y `reunion_id`
  intactos. Anular sólo toca `recibo_id`, `pagado_at` y `estado_linea`.
- ⚠️ Pero **es una reconstrucción, no una foto**. Si después de anular alguien corre
  "Recalcular reunión", el motor puede cambiar el `monto_neto` de una línea impaga, y el detalle
  del recibo anulado pasaría a mostrar un importe distinto del que se imprimió en papel. Es una
  limitación conocida y **no se arregla acá** (arreglarla sería cambiar `anular_recibo` para que
  guarde el snapshot completo, y eso está fuera de alcance). Va documentada en pantalla y en §10.

También del mismo fuente, para el requisito 3: `anulado_por` se resuelve así —

```sql
  SELECT u.id INTO v_usuario_id
    FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo LIMIT 1;
```

**FK a `usuarios(id)`, no a `auth.users`** (GOTCHA #79). Para mostrar "quién anuló" hay que
joinear `usuarios` y leer `nombre_completo` (GOTCHA #3: no `nombre`).

## 1.d — RLS de `recibos`: no alcanza

```sql
SELECT c.relname, c.relrowsecurity AS rls_on, p.polname, p.polcmd,
       pg_get_expr(p.polqual, p.polrelid) AS using_expr
FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid=c.oid
WHERE c.relname IN ('recibos','usuarios') ORDER BY c.relname, p.polname;
```

La policy de lectura, reformateada:

```sql
recibos_select (r):
  (SELECT fn_is_super_admin())
  OR ((SELECT fn_is_staff()) AND (club_id = (SELECT fn_get_user_club_id())))
  OR (propietario_id IN (SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'propietario'))
  OR (profesional_id IN (SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'profesional'))
```

**El primer `OR` es el problema: un `super_admin` ve TODOS los recibos de TODOS los clubes.** Y
`super_admin` es justamente el rol que usa el `club-switcher.js` para operar como si fuera un club
determinado. Sin filtro de aplicación, la vista de historial le listaría recibos de otro hipódromo
con total naturalidad. **Es exactamente ISSUE-060 en otra tabla.**

Para `secretario_carreras` la RLS sí acota — pero eso no cambia nada: el filtro va igual, porque
la defensa no puede depender del rol de quien mira.

La policy de `usuarios` sí acota por club para staff, así que el join para "quién anuló" es seguro.

## 1.e — `imprimirReciboCobro`: el `lineaIds` que no se usa

```javascript
// liquidaciones.html:1534
async function imprimirReciboCobro(recibo, lineaIds, opts){
  // re-leer las líneas marcadas para el print
  const { data: lns, error: eLns } = await sb.from('liquidacion_detalle')
    .select('concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id').eq('recibo_id',recibo.id);
```

Verificación de que el parámetro está muerto:

```
$ awk 'NR>=1534 && NR<=1620' liquidaciones.html | grep -n "lineaIds"
1:async function imprimirReciboCobro(recibo, lineaIds, opts){
--- (vacio = lineaIds NO se usa en el cuerpo) ---
```

Aparece **sólo en la firma**. Las dos llamadas existentes le pasan un array correcto y la función
lo tira:

```
$ grep -n "imprimirReciboCobro" liquidaciones.html
1382:  imprimirReciboCobro(recibo, cobEmitirIds, { origen });
1456:// Repone cobBenef porque imprimirReciboCobro lo usa para el "A nombre de" del encabezado.
1461:  imprimirReciboCobro(recibo, lineaIds, { origen });
1534:async function imprimirReciboCobro(recibo, lineaIds, opts){
```

**Consecuencia para el requisito 4:** reimprimir un recibo **anulado** desde el historial saldría
con la tabla de líneas **vacía**, porque `recibo_id` de esas filas es `NULL`. El encabezado, el
total y la firma saldrían bien; el cuerpo, en blanco. Un recibo impreso sin líneas es peor que no
poder imprimirlo.

Además la función lee el global `cobBenef` para el "A nombre de":

```javascript
    <p class="recibo-benef"><strong>A nombre de:</strong> ${cobBenef?.nombre||'—'}…
```

Así que quien la llame desde el historial tiene que reponer `cobBenef` antes — igual que ya hace
`cobrosReimprimir` (`liquidaciones.html:1456`).

## 1.f — Dónde encaja: las solapas

```
$ sed -n '518,521p' liquidaciones.html
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((b,i)=>b.classList.toggle('active',['liquidaciones','cobros','resumen','comisiones'][i]===name));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===`panel-${name}`));
  if (name==='comisiones') { loadReparto(); loadComisiones(); }
```

Botones (`liquidaciones.html:197–200`): 💰 Liquidaciones · 🧾 Pagos · 📊 Resumen · ⚙️ Config. Comisiones.

**Trampa a documentar:** `switchTab` mapea botón→panel **por posición en un array literal**. Agregar
una solapa obliga a tocar ese array **y** a insertar el botón en la posición que le corresponde. Si
se agrega el botón sin tocar el array, el resaltado del tab activo queda corrido y no falla ruidoso
— se ve mal y nada más. Es candidato a GOTCHA.

Los paneles se muestran con `.tab-panel.active { display: block }` sobre `display: none`
(`liquidaciones.html:35-36`): **cambiar de solapa NO desmonta el DOM del panel anterior.** Esto es
decisivo para la decisión de §2.

## 1.g — Helpers reusables

| Helper | Dónde | Para qué sirve acá |
|---|---|---|
| `nombreBenef(tipo, id)` | `:913` | nombre del beneficiario del recibo, ya resuelve propietario vs profesional |
| `benefSearch(tipo, id)` | `:927` | string de búsqueda (nombre/apellido/DNI/stud) en minúscula — **es la búsqueda por persona, ya escrita y ya probada** |
| `docBenef(tipo, id)` | `:920` | documento del titular |
| `rolDeLinea(l)` | `:1512` | rol por línea (Propietario/Entrenador/Jockey) — el detalle lo necesita |
| `cobDelClub(l)` | `:892` | filtro de club **de las líneas**, vía el embed `liquidaciones(club_id)` |
| `fmt` / `formatMonto` | `:905` | dinero (nunca `toLocaleString` a mano) |
| `escapeHtml(s)` | `:906` | ISSUE-018 — obligatorio para motivo de anulación y nombre de cobrador, que son texto libre |

`profesionales` y `propietariosMap` se llenan en `init()` (`liquidaciones.html:591–598`), antes de
cualquier solapa, así que la vista nueva puede contar con ellos sin pedir nada.

---

# 2. DÓNDE VIVE — solapa nueva "Recibos"

**Decisión: una quinta solapa, entre Pagos y Resumen.**

```
💰 Liquidaciones   🧾 Pagos   📄 Recibos   📊 Resumen   ⚙️ Config. Comisiones
```

## Por qué no una segunda vista dentro de Pagos

El argumento decisivo es **el estado del cobro en curso**, y sale del trabajo de ayer.

El escenario real que describís es: Valeria está pagándole a alguien —con el detalle abierto, el
filtro por concepto puesto, algunas líneas destildadas a mano— y llega otro y pregunta *"¿yo ya
cobré?"*. Si el historial vive dentro de Pagos:

- O comparte `#cob-detalle`, y entonces **abrir el historial destruye la selección** — exactamente
  lo que acabamos de blindar con seis asserts y tres mutantes;
- o usa un contenedor propio, y hay que sostener a mano que `cobBenef`, `cobLineas`, `cobFiltro` y
  `cobUltimoRecibo` no se pisen entre las dos vistas. Cuatro variables de módulo compartidas entre
  dos flujos que el operador alterna con gente esperando.

Con una solapa aparte el problema **no existe por construcción**: los paneles son `display:none`,
no se desmontan. Valeria toca *Recibos*, responde, vuelve a *Pagos* y **encuentra la pantalla
exactamente como la dejó** — mismas líneas tildadas, mismo filtro, mismo panel de recibo emitido.

Los dos costos son chicos y conocidos: hay que tocar el array posicional de `switchTab` (§1.f), y
son dos clicks en vez de uno.

## Costo de arranque

`switchTab('recibos')` llama a `recibosInit()`, que **no consulta nada**: pinta el buscador vacío y
espera. La primera consulta ocurre cuando Valeria escribe. Nada de precargar el historial completo
"por las dudas" — el día de la reunión, cada consulta que no se pidió es latencia que alguien
espera parado.

---

# 3. BÚSQUEDA (requisito 1)

## Una sola caja, dos modos, inferidos

Con gente esperando, elegir el modo en un `<select>` antes de tipear es un paso de más. La caja
infiere:

```javascript
// PLAN — no aplicado
const q = (document.getElementById('rec-q').value || '').trim();
const esNumero = /^\d+$/.test(q);
```

- **`/^\d+$/` → número de recibo exacto.** Es un correlativo del sistema; buscar "3" tiene que
  traer el recibo 3, no todo lo que contenga un 3. Pega `uq_recibo_por_club`.
- **Cualquier otra cosa → persona.** Beneficiario y —ver abajo— cobrador.

Un DNI es todo dígitos y colisiona con el modo número. **Se resuelve mostrando las dos cosas:**
si el término es numérico, se busca el recibo N **y además** por DNI, y se listan los dos
resultados con su rótulo. Nunca hay que adivinar qué quiso decir el operador.

## Modo número

```javascript
// PLAN — no aplicado
sb.from('recibos').select(SEL)
  .eq('club_id', CLUB_ID)          // ← el aislamiento va en la misma condición que el índice
  .eq('numero_recibo', Number(q))
```

## Modo persona — el beneficiario, resuelto en memoria

`recibos` no guarda el nombre: guarda `profesional_id` / `propietario_id`. Los nombres ya están en
`profesionales` y `propietariosMap`, cargados en `init()`. Así que **la búsqueda por persona se
resuelve con `benefSearch`, que es la misma función que usa el buscador de Pagos** — ya escrita, ya
probada, y con el mismo comportamiento (nombre, apellido, DNI, nombre_stud):

```javascript
// PLAN — no aplicado
const ql = q.toLowerCase();
const profIds = Object.keys(profesionales).filter(id => benefSearch('profesional', id).includes(ql));
const propIds = Object.keys(propietariosMap).filter(id => benefSearch('propietario', id).includes(ql));
```

y después una sola consulta con `.or(...)`. **Guarda obligatoria:** PostgREST rompe con un
`in.()` vacío, así que cada término se agrega sólo si tiene ids.

## Cobrador — ¿es fácil o complica? **Es fácil. Va.**

Preguntaste explícitamente. La respuesta:

**`cobrador_nombre` y `cobrador_documento` son columnas de texto de la propia tabla `recibos`.**
No hay join, no hay tabla intermedia, no hay resolución en memoria. Son **dos términos más en el
mismo `.or()`** de la consulta que ya se va a hacer:

```javascript
// PLAN — no aplicado
const terminos = [];
if (profIds.length) terminos.push(`profesional_id.in.(${profIds.join(',')})`);
if (propIds.length) terminos.push(`propietario_id.in.(${propIds.join(',')})`);
terminos.push(`cobrador_nombre.ilike.*${q}*`);
terminos.push(`cobrador_documento.ilike.*${q}*`);
const { data } = await sb.from('recibos').select(SEL)
  .eq('club_id', CLUB_ID).or(terminos.join(',')).order('emitido_at', { ascending:false }).limit(100);
```

Costo real: **cero consultas extra, cero joins.** Es más barato que la búsqueda por beneficiario,
que necesita el paso previo en memoria.

Tres salvedades honestas:

1. **No hay índice para el `ilike`.** Con 5 filas es irrelevante; con 50.000 sería un seq scan. Si
   algún día molesta, es un `pg_trgm` sobre las dos columnas — no cambia nada del diseño.
2. **Hoy devuelve vacío siempre**: 0 de 5 recibos tienen cobrador (§1.b). Sirve para los recibos
   nuevos, no para los históricos. Es una expectativa a fijar con Fede, no un defecto.
3. **Caracteres especiales en `q`.** El `.or()` de PostgREST usa coma y paréntesis como sintaxis;
   una coma tipeada en el buscador rompe la expresión. Hay que **sanitizar** `q` (sacar `,()*`)
   antes de interpolarlo. Va como assert del probe.

**Es un beneficio directo del pedido de Fede** —*"mostrar el recibo de quién lo firmó"*—: si alguien
vuelve con el papel firmado por un apoderado, se busca por el nombre del apoderado.

## Filtro de estado — la pregunta de Valeria

Un selector chico al lado de la caja: **Todos · Emitidos · Anulados**, por defecto **Todos**.
Responde *"así me queda diferenciado"* sin pedirle que lea badges en una lista larga. Es un
`.eq('estado', v)` opcional.

## Listado por defecto

Sin nada tipeado: **los últimos 50 del club**, `emitido_at DESC`. El día de la reunión, lo que se
cobró recién está arriba y muchas veces no hace falta ni buscar.

---

# 4. EL DETALLE (requisito 2)

Al tocar un recibo de la lista se abre debajo, con las **mismas siete columnas que salen impresas**:
Fecha · Carrera · Caballo · Puesto · Rol · Concepto · Neto.

La resolución es idéntica a la de `imprimirReciboCobro` y a la de `cobrosDetalle`: `reunion_id` →
fecha de reunión; `inscripcion_id` → `spcs.nombre` y `carreras.numero_carrera_programa ??
numero_turno`, con `carrera_id` de respaldo; `rolDeLinea(l)` para el rol.

**De dónde salen las líneas — y esta es la bisagra del requisito 3:**

```javascript
// PLAN — no aplicado
async function recibosLineas(rec){
  const q = sb.from('liquidacion_detalle')
    .select('id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id,liquidaciones(club_id)');
  // Emitido: el vínculo vivo. Anulado: el vínculo se soltó y el único rastro es el jsonb de ids.
  const { data, error } = rec.estado === 'anulado'
    ? await q.in('id', (rec.lineas_anuladas || []))
    : await q.eq('recibo_id', rec.id);
  if (error) { console.error('[recibosLineas]', error); throw error; }
  return (data || []).filter(cobDelClub);   // ISSUE-060 también en el detalle
}
```

El `.filter(cobDelClub)` **acá sí** es el `cobDelClub` original: las líneas no tienen `club_id`
propio, viene por el embed `liquidaciones(club_id)`, exactamente el caso para el que se escribió.

Cabecera del detalle: N°, fecha y **hora** de emisión (Fede: *"se cobró tal día en tal horario"*),
beneficiario, forma de pago, quién retiró (nombre + documento), comprobante si es transferencia,
y los totales del recibo.

---

# 5. LOS ANULADOS (requisito 3) — la razón de ser de la vista

El caso de Fede: alguien *"vino a decir que ya cobró"*. Si el recibo se anuló, tiene que poder
verse **que existió, que se anuló, por qué, quién y cuándo**, con sus líneas.

## Cómo se ve

En la lista, un badge `ANULADO` en `var(--danger)` y la fila con el fondo apagado. **No se
esconden ni se mandan al final**: van en el mismo orden cronológico. Un anulado que hay que ir a
buscar a otra pestaña es un anulado que no se encuentra cuando hace falta.

En el detalle, un bloque arriba de la tabla:

```
┌────────────────────────────────────────────────────────────────────┐
│ ⛔ ANULADO el 30/08/2026 14:12 por Valeria Pérez                    │
│ Motivo: se cargó mal el importe del incentivo                      │
│ Las 4 líneas volvieron a quedar pendientes de cobro.               │
└────────────────────────────────────────────────────────────────────┘
```

- `anulado_at` con fecha **y hora**.
- `anulado_por` → join a `usuarios`, campo **`nombre_completo`** (GOTCHA #3), con fallback a `—`
  si el usuario fue borrado.
- `motivo_anulacion`, **pasado por `escapeHtml`** — es texto libre tipeado por el operador
  (ISSUE-018).

## La advertencia que el bloque tiene que llevar

Como el detalle de un anulado es una **reconstrucción por id** y no una foto (§1.c), corresponde
decirlo en pantalla, en letra chica, debajo del bloque:

> *Las líneas se reconstruyen desde la liquidación. Si la reunión se recalculó después de anular,
> los importes pueden no coincidir con el papel.*

Es la clase de nota que evita una discusión de mostrador. No cuesta nada y es verdad.

## Casos borde

| Caso | Qué hace la vista |
|---|---|
| `lineas_anuladas` vacío o `null` | No puede pasar: `anular_recibo` aborta si el recibo no tiene líneas. Igual se muestra "sin líneas registradas" en vez de romper |
| Una línea del jsonb ya no existe | El `.in()` la omite; se muestra el conteo real y una nota de cuántas faltan |
| Una línea volvió a cobrarse en otro recibo | Aparece igual: se está mostrando qué contenía **este** recibo, no dónde está la plata hoy |

---

# 6. REIMPRIMIR (requisito 4) — y el bug que destapa

Botón **🖨 Imprimir** en el detalle. Hoy la reimpresión sólo existe en el panel post-emisión, así
que si Valeria cierra la pantalla el recibo es irrecuperable salvo por el papel — que es
literalmente el problema que esta vista viene a resolver.

## El problema

`imprimirReciboCobro` relee las líneas con `.eq('recibo_id', recibo.id)` (§1.e). Para un anulado
eso da **cero filas** → **recibo impreso con el cuerpo vacío**.

## El arreglo, mínimo

El parámetro `lineaIds` **ya está en la firma y ya se lo pasan las dos llamadas existentes**
(`liquidaciones.html:1382` y `:1461`). Sólo hay que usarlo:

```javascript
// PLAN — no aplicado. Único cambio en imprimirReciboCobro.
  const base = sb.from('liquidacion_detalle')
    .select('concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id');
  // `lineaIds` estaba en la firma desde el principio y no se usaba: la función releía por
  // recibo_id, que para un recibo ANULADO es NULL — el cuerpo salía en blanco. Cuando el llamador
  // sabe qué líneas eran (siempre lo sabe), manda esa lista y manda ella.
  const { data: lns, error: eLns } = lineaIds?.length
    ? await base.in('id', lineaIds)
    : await base.eq('recibo_id', recibo.id);
```

- **No toca `emitir_recibo` ni `anular_recibo`** (fuera de alcance respetado): es una función de UI.
- **No cambia el comportamiento de las dos llamadas actuales**: para un recibo recién emitido,
  `.in('id', cobEmitirIds)` y `.eq('recibo_id', id)` devuelven el mismo conjunto.
- Deja el `.eq` como respaldo, así que un llamador que no pase ids sigue funcionando.

Desde el historial se llama con las mismas líneas que muestra el detalle, y **reponiendo
`cobBenef`** antes (igual que `cobrosReimprimir`, `liquidaciones.html:1456`), porque la función lo
usa para el "A nombre de".

**Sin sello ANULADO en la reimpresión** — anotado como posterior, tal como pediste. Eso sí abre una
pregunta que dejo en §10: hoy nada distingue en el papel la reimpresión de un anulado.

## La pregunta de Valeria: "¿aparece que ya fue impreso?"

**No, y no se puede con el schema actual.** `estado_recibo` tiene exactamente dos valores,
`emitido` y `anulado` (§1.a), y no hay ninguna columna `impreso_at` ni contador de impresiones.
El sistema **no sabe** si un recibo se imprimió: `window.print()` no informa si el operador
imprimió o canceló el diálogo.

Lo que la vista **sí** responde, que es lo que Valeria necesita en la práctica:

- **¿Fue pagado?** → sí: existe el recibo, con badge `EMITIDO`.
- **¿Cuándo y a qué hora?** → `emitido_at`.
- **¿Quién lo retiró?** → `cobrador_nombre` + documento.
- **¿Sigue vigente?** → badge `EMITIDO` vs `ANULADO`.

Registrar "impreso" requiere una columna nueva y decidir qué significa (¿se abrió el diálogo?
¿salió el papel?). **Fuera de alcance**, va como pregunta abierta.

---

# 7. AISLAMIENTO POR CLUB (requisito 5)

La RLS no alcanza para `super_admin` (§1.d). El filtro va de aplicación, **en las dos capas**, que
es la lección textual de ISSUE-060: *"filtrar únicamente el listado movía el agujero un click más
adentro"*.

| Capa | Filtro | Por qué |
|---|---|---|
| **Listado** de recibos | `.eq('club_id', CLUB_ID)` en **toda** consulta a `recibos` | `recibos` tiene columna propia `club_id`. Es un `.eq`, no `cobDelClub` |
| **Detalle** (líneas) | `.filter(cobDelClub)` sobre `liquidacion_detalle` | Las líneas no tienen `club_id`; viene por el embed `liquidaciones(club_id)` |
| **Reimpresión** | hereda del detalle | Imprime lo que el detalle resolvió, no vuelve a consultar |

**Corrección al pedido:** decía *"reusá `cobDelClub`"*. `cobDelClub` mira `l.liquidaciones.club_id`
y **no aplica a una fila de `recibos`**, que tiene el club a mano. Lo que se reusa es el
**principio** (filtrar en el listado **y** en el detalle) y la **función**, pero sólo donde
corresponde: en las líneas. Aplicarla a `recibos` daría `undefined === CLUB_ID` → **falso siempre**
→ la vista no mostraría nada. Falla cerrada, pero rota.

Además: `.eq('club_id', CLUB_ID)` viaja **en la misma condición que el índice
`uq_recibo_por_club`**, así que en la búsqueda por número el aislamiento no es un filtro agregado
que alguien pueda olvidar — es parte de la clave de búsqueda.

---

# 8. PROBE

`tests/probe_historial_recibos.mjs` — real-code, sin browser, con el mini-DOM del patrón vigente.

## Fixtures — hay que fabricarlas, y con los RPC reales

La base **no tiene un solo recibo anulado** ni ningún recibo de un segundo club (§1.b), así que el
probe se los tiene que construir. Dos decisiones:

**1. El anulado se fabrica llamando a `emitir_recibo` y `anular_recibo` de verdad.** No se inserta
a mano una fila con `estado='anulado'` y un `lineas_anuladas` armado por el probe. Si el probe
fabrica el jsonb, prueba la vista **contra su propia suposición** sobre la forma de ese campo, no
contra lo que el RPC escribe — y la forma de ese campo es justamente de lo que depende el requisito
3. Con los RPC reales, si mañana `anular_recibo` cambia el formato, **el probe se entera**.

Consecuencia: se consumen números de recibo y hay que **restaurar `club_secuencias`** en el
`finally`, como hace `probe_anular_recibo_ui.mjs`.

**2. El "otro club" no se fabrica: son los 5 recibos reales de Dolores.** El probe corre con
`CLUB_ID = CLUB_B` (Mi Club Hípico), así que **los 5 recibos de Dolores ya son "de otro club"**.
El assert de aislamiento se hace **sin escribir una sola fila** en el club real, y contra datos de
verdad. Mejor que cualquier fixture: los números 1, 2 y 3 existen en Dolores, así que buscar el
número 1 desde el club B tiene que traer el #1 de B (o nada), nunca el de Dolores.

## Mini-DOM

Mismo patrón que `probe_filtro_concepto_pagos.mjs`: nodos con `classList` sobre un `Set` real y un
motor de selectores que **tira ante un selector desconocido** (el guard que evita el falso verde).
Selectores previstos: `#rec-resultados tr.rec-row`, `.rec-row`, más los `getElementById` de
`#rec-q`, `#rec-estado`, `#rec-resultados`, `#rec-detalle`.

Y **espía del borde de impresión**: `imprimirReciboCobro` se stubbea para capturar
`(recibo, lineaIds, opts)` sin llamar a `window.print()`. Lo que se asserta es **qué líneas se le
mandan a imprimir** — que es donde vive el bug de §6. Es la lección de GOTCHA #81: para saber si
algo corrió hay que espiar el borde, no el estado final.

## Asserts

| ID | Assert |
|---|---|
| `N1` | buscar un número exacto trae ese recibo y **sólo** ese |
| `N1b` | un número inexistente no trae nada y no rompe |
| `N2` | el término numérico también prueba DNI, y los dos resultados se rotulan |
| `P1` | búsqueda por apellido del beneficiario trae sus recibos |
| `P1b` | y no trae los de otra persona |
| `P2` | búsqueda por **cobrador** (nombre) trae el recibo |
| `P2b` | búsqueda por **documento del cobrador** trae el recibo |
| `P3` | un término con coma/paréntesis no rompe el `.or()` (sanitización) |
| `P4` | término que no matchea a nadie: no se arma un `in.()` vacío, no hay error |
| `D1` | el detalle de un emitido trae **exactamente** sus líneas (conjunto de ids ordenado) |
| `D1b` | y las 7 celdas por línea son las correctas (fecha, carrera, caballo, puesto, rol, concepto, monto) |
| `D2` | el total del detalle coincide con `neto_a_cobrar` del recibo |
| `A1` | un recibo **anulado aparece en la lista**, marcado como tal |
| `A1b` | el filtro "Anulados" lo trae y el filtro "Emitidos" **no** |
| `A2` | el detalle del anulado muestra motivo, quién anuló y cuándo |
| `A3` | **sus líneas se reconstruyen desde `lineas_anuladas`** — mismo conjunto de ids que tenía antes de anular |
| `A3b` | y eso ocurre aunque `recibo_id` de esas filas sea `NULL` (la consulta no usa `recibo_id`) |
| `C1` | **un recibo de otro club NO aparece en el listado** (los 5 reales de Dolores) |
| `C1b` | buscar por número un recibo que existe en el otro club no lo trae |
| `C2` | una línea de otro club no entra en el detalle (`cobDelClub`) |
| `I1` | reimprimir un **emitido** manda las líneas correctas a `imprimirReciboCobro` |
| `I2` | reimprimir un **anulado** manda **sus** líneas, no un array vacío |
| `I3` | antes de imprimir se repone `cobBenef` con el beneficiario del recibo |
| `R1` | restore por ESTADO: las líneas quedaron como estaban |
| `R2` | y no hubo que restaurar nada a mano |
| `R3` | no quedó ningún recibo del probe, en NINGÚN club |
| `R4` | no quedaron líneas del probe en la base |
| `R5` | `club_secuencias` devuelto a donde estaba |

`A3` e `I2` son los dos que justifican la vista. Si sobreviven sus mutantes, el probe no prueba
nada de lo que se pidió.

## Restore

- `snapshotLineas` / `restaurarLineas` / `diffLineas` de `tests/lib/estado_lineas.mjs`, con los
  **dos** asserts de rigor (GOTCHA #77: contar filas no verifica estado).
- `recibosDesde()` **sin filtro de club** (GOTCHA #76).
- `club_secuencias` de los dos clubes restaurada (contador monótono, no `MAX+1`).
- **Limpieza preflight** al arranque, acotada al `TAG` (GOTCHA #83): un `SIGKILL` no corre el
  `finally`, y este probe planta más fixtures que el anterior.

## Mutation testing — tandas de 5, con el runner arreglado

Cada corrida ronda los 15 s (planta más que el probe del filtro), así que **tandas de 5** con
`--mutantes=M1,…` (GOTCHA #83: el timeout es por invocación). El runner ya distingue
`ERROR DE ARNÉS` de `SOBREVIVE` (GOTCHA #84), así que un mutante que no arranque **no se va a
volver a leer como agujero de cobertura**.

| # | Mutante | Debe matar |
|---|---|---|
| `M1` | la búsqueda por número no acota por club | `C1b` |
| `M2` | el listado no acota por club (`.eq('club_id')` fuera) | `C1` |
| `M3` | el detalle no filtra las líneas con `cobDelClub` | `C2` |
| `M4` | el modo número usa `ilike` en vez de igualdad exacta | `N1` |
| `M5` | la búsqueda por persona ignora `propietario_id` | `P1` |
| `M6` | se saca el término de cobrador del `.or()` | `P2`, `P2b` |
| `M7` | no se sanitiza `q` antes de interpolarlo en el `.or()` | `P3` |
| `M8` | se arma `in.()` aunque la lista de ids esté vacía | `P4` |
| `M9` | el detalle de un anulado usa `recibo_id` en vez de `lineas_anuladas` | `A3`, `A3b` |
| `M10` | los anulados se excluyen del listado | `A1` |
| `M11` | el filtro de estado no se aplica | `A1b` |
| `M12` | el bloque de anulación no muestra el motivo | `A2` |
| `M13` | **`imprimirReciboCobro` vuelve a ignorar `lineaIds`** | `I2` |
| `M14` | reimprimir no repone `cobBenef` | `I3` |
| `M15` | el detalle pierde la columna Rol | `D1b` |
| `M16` | el total del detalle suma mal | `D2` |
| `M17` | el mini-DOM devuelve `[]` ante selector desconocido (arnés) | guard del arnés |

`M13` es el mutante que representa el estado **actual** del código: si sobrevive, el arreglo de §6
no está probado.

---

# 9. RESUMEN

| | |
|---|---|
| Dónde vive | **Solapa nueva "📄 Recibos"**, entre Pagos y Resumen |
| Por qué solapa | Los paneles son `display:none`: el cobro en curso —selección, filtro, panel post-emisión— **sobrevive intacto** a la consulta |
| Búsqueda | Una caja, modo inferido: `/^\d+$/` → número exacto; si no → persona. Numérico busca **las dos cosas** (número y DNI) |
| Búsqueda por cobrador | **Va. Es fácil**: dos columnas de texto de la propia tabla, dos términos más en el mismo `.or()`, cero joins. Hoy devuelve vacío (0 de 5 recibos tienen cobrador) |
| Filtro extra | Estado: Todos · Emitidos · Anulados |
| Detalle | Las 7 columnas del impreso + cabecera con hora, cobrador y forma de pago |
| Anulados | En la lista con badge, en orden cronológico. Detalle con motivo, quién y cuándo. **Líneas reconstruidas con `.in('id', lineas_anuladas)`** |
| `lineas_anuladas` | **Array de UUIDs**, no snapshot. La reconstrucción funciona, pero puede diferir del papel si se recalculó después. Se avisa en pantalla |
| Reimprimir | Botón en el detalle. Requiere **usar el `lineaIds` que ya está en la firma** de `imprimirReciboCobro` y hoy se ignora — sin eso, un anulado imprime el cuerpo vacío |
| Aislamiento | `.eq('club_id', CLUB_ID)` en `recibos` (no `cobDelClub`) **+** `cobDelClub` en las líneas. La RLS no acota a `super_admin` |
| Probe | `tests/probe_historial_recibos.mjs` — 23 asserts + 5 de restore, 17 mutantes en 4 tandas |
| Toca | `liquidaciones.html` (solapa + panel + funciones nuevas + 3 líneas en `imprimirReciboCobro`) |
| No toca | `emitir_recibo`, `anular_recibo`, exportación, sello ANULADO, prefijos A1/A2 |

---

# 10. PREGUNTAS ABIERTAS

1. **"¿Ya fue impreso?" no se puede responder.** El schema no lo registra y `window.print()` no
   informa si salió el papel. ¿Alcanza con "¿fue pagado?" (que sí se responde), o Valeria necesita
   de verdad distinguir impreso de no impreso? Si es lo segundo, es una columna nueva
   (`impreso_at`, o un contador) y una decisión sobre qué se considera "impreso" — otra tanda.
2. **El detalle de un anulado es reconstrucción, no foto.** Si se recalcula la reunión después de
   anular, los importes pueden moverse. La vista lo avisa en letra chica. ¿Alcanza, o
   `anular_recibo` tendría que pasar a guardar el snapshot completo de las líneas en el jsonb en
   vez de sólo los ids? Eso sí sería tocar el RPC, hoy fuera de alcance.
3. **Búsqueda por cobrador: expectativa.** Va incluida porque cuesta nada, pero **no encuentra nada
   de lo ya emitido**. ¿Se lo aclaramos a Fede antes de que la pruebe con un recibo viejo y
   concluya que no anda?
4. **Los seeds 9001 y 9002 muestran `neto_a_cobrar = $0` con líneas que suman 170.000 y 700.000.**
   Van a ser las dos primeras filas raras del historial. ¿Se corrigen, se marcan como prueba (como
   se hizo con la reunión 9999 y `es_prueba`), o se dejan?
5. **Límite del listado.** Propongo 50 por defecto y 100 en búsqueda. Con 5 recibos da igual;
   la pregunta es si en un año Valeria va a querer "todos los del propietario X" sin tope.
6. **`switchTab` mapea botón→panel por posición en un array literal.** Agregar la solapa obliga a
   tocar ese array. ¿Lo dejo como está —cambio mínimo— o lo paso a `data-tab` en el botón, que
   elimina la clase de bug para siempre pero toca las 4 solapas existentes?

---

# 11. GATE

Este documento es el plan. **No se escribió código.** `liquidaciones.html` está intacto en
`2821c7c` y `tests/probe_historial_recibos.mjs` no existe.

Con el OK —y con las respuestas a las preguntas 1 a 6, o las que quieras contestar— el diff va a
`feat/historial-recibos`, pusheado, sin mergear.

---

# 12. VERIFICACIÓN DE PUBLICACIÓN

Se completa abajo con la salida real.
