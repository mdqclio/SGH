# ISSUE-056 — `anular_recibo`: plan (NADA APLICADO)

- **Fecha**: 2026-08-30
- **SHA**: `cbeeee82478ff41b4228a6f817f1f8f179ff862d` (`main`, con ISSUE-059/060/057 ya mergeado)
- **Estado**: **plan. No se aplicó ninguna migración, no se escribió en la base, no se tocó código.**
- **Origen**: el revert a mano del recibo #4 del 28/08 (`docs/diagnosticos/2026-08-28_ejecucion-revert-recibo-4.md`).

## Guards

```
$ pwd
/home/clio/dev/SGH

$ git rev-parse --abbrev-ref HEAD ; git rev-parse HEAD
main
cbeeee82478ff41b4228a6f817f1f8f179ff862d

$ git status --porcelain
(vacío)
```

```sql
SELECT count(*) AS spcs_count FROM spcs;
```
```json
[{"spcs_count":181}]
```

Proyecto: `unlhcuanfrtpatoipwve`. Coinciden — se sigue.

> **Nota**: tu mensaje se cortó en *"No construyas la vista de hist…"*. Asumo **historial de
> recibos**, y en §3 explico por qué esa restricción es justamente la que parte el trabajo en dos
> entregas. Si querías decir otra cosa, el §3 es lo único que cambia.

---

## 1. Relevamiento

### 1.1 Lo que ya existe — la migración es más chica de lo que parecía

```sql
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns WHERE table_schema='public' AND table_name='recibos';
```

| columna | tipo | null | default |
|---|---|---|---|
| `estado` | **`estado_recibo`** (ENUM) | NO | `'emitido'::estado_recibo` |
| `anulado_at` | `timestamptz` | SÍ | — |
| `emitido_por` | `uuid` → `usuarios(id)` | SÍ | — |
| `emitido_at` | `timestamptz` | NO | `now()` |
| `notas` | `text` | SÍ | — |

Y el ENUM:

```sql
SELECT t.typname, string_agg(e.enumlabel,' | ' ORDER BY e.enumsortorder)
FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid ...
```
```json
[{"enum_name":"estado_recibo","valores":"emitido | anulado"}]
```

**`estado_recibo` YA tiene `'anulado'`, y `anulado_at` YA existe.** El schema de Fase 0 los dejó
previstos y nunca se usaron: los 5 recibos vivos están todos en `emitido` con `anulado_at` NULL.

**Falta sólo esto** (respuesta directa a tu pregunta):

| Falta | Tipo | Por qué |
|---|---|---|
| `anulado_por` | `uuid REFERENCES usuarios(id)` | Requisito 5. **`usuarios(id)`, no `auth.users`** — mismo espejo que `emitido_por`, GOTCHA #79 |
| `motivo_anulacion` | `text` | Requisito 6. Texto libre, obligatorio por el RPC (no por `NOT NULL`, ver §2.4) |

**No hay que tocar el ENUM.** Eso elimina el riesgo de GOTCHA #11 (a un ENUM sólo se le agrega, nunca
se le quita) y hace la migración puramente aditiva y trivial de revertir.

### 1.2 ¿Quién depende de `recibos.estado` hoy?

Barrido completo antes de empezar a escribir el valor `'anulado'`, que hoy **no existe en ninguna
fila**:

```
$ grep -rn "from('recibos')" --include="*.html" --include="*.js" --include="*.mjs" .
tests/probe_recibos_emision.mjs      (delete/select de cleanup)
tests/probe_rls_portal.mjs           (insert de fixture)
tests/probe_recibo_pie_cobrador.mjs  (foto/cleanup)
tests/probe_cobros_v11.mjs           (delete de cleanup)
tests/probe_aislamiento_club_cobros.mjs (delete/update de cleanup)
tests/lib/estado_lineas.mjs          (recibosDesde)
```

```sql
-- funciones que mencionan recibos
SELECT p.proname FROM pg_proc p ... WHERE p.prosrc ILIKE '%recibos%';
```
```json
[{"fn":"desoficializar_carrera"},{"fn":"emitir_recibo"}]
```

**Conclusión: `recibos.estado` no tiene NI UN consumidor que lo lea.** Ni en el front, ni en las RPC,
ni en los probes. `emitir_recibo` lo escribe (`'emitido'`) y nadie lo consulta. El único código que
razona sobre recibos lo hace por **`liquidacion_detalle.recibo_id`**, no por el estado del recibo:

- `liquidaciones.html:711` — el Resumen cuenta recibos distintos: `if (l.estado_linea==='pagado'){ … if (l.recibo_id) recibos.add(l.recibo_id); }`
- `liquidaciones.html:927 / 1016 / 1019` — el buscador de Pagos filtra `.is('recibo_id', null)`
- `resultados.html:1686` — el guard de des-oficializar: *"carrera con pagos emitidos, anulá los recibos primero"*
- `desoficializar_carrera` — cuenta líneas pagadas, no mira `recibos.estado`

**Esto es una buena noticia y una trampa a la vez.** Buena: agregar el valor `'anulado'` no rompe
nada, porque nadie lo lee. Trampa: **nadie lo lee**, así que un recibo anulado va a seguir
comportándose como emitido en cualquier lugar que razone por `recibo_id`… salvo que
`anular_recibo` **suelte el `recibo_id` de las líneas**, que es justo el requisito 1. Con las líneas
sueltas, todos los consumidores de arriba se corrigen solos:

- el Resumen deja de contarlo (la línea ya no está `pagado`),
- el buscador de Pagos vuelve a ofrecer las líneas,
- el guard de des-oficializar deja de trabar la carrera.

O sea: **soltar `recibo_id` no es sólo "devolver la plata", es lo que hace coherente a todo el resto
del sistema.** El `estado='anulado'` es documentación; el `recibo_id = NULL` es el efecto.

### 1.3 El correlativo ya está a salvo por construcción

```sql
SELECT pg_get_functiondef(...) FROM pg_proc WHERE proname='fn_siguiente_recibo';
```
```sql
INSERT INTO club_secuencias (club_id, tipo, ultimo_numero) VALUES (p_club_id, 'recibo', 1)
ON CONFLICT (club_id, tipo) DO UPDATE SET ultimo_numero = club_secuencias.ultimo_numero + 1
RETURNING ultimo_numero INTO v_num;
```

Es un **contador monótono** en `club_secuencias`, no un `MAX(numero_recibo)+1`. El requisito 4 ("no
devolver el correlativo") se cumple **con no hacer nada**: mientras `anular_recibo` no toque
`club_secuencias`, el número no vuelve. El probe igual lo asserta explícitamente (§5, P3), porque
"se cumple solo" es exactamente el tipo de cosa que deja de cumplirse en silencio.

Si en cambio fuera `MAX+1`, anular habría sido peligroso: el #4 borrado del 28/08 se habría
reciclado. No es el caso.

### 1.4 El agujero de numeración del 28/08, visible en la base

```sql
SELECT numero_recibo, estado, emitido_at, anulado_at, emitido_por FROM recibos ORDER BY numero_recibo;
```

| nº | estado | emitido_at | anulado_at | emitido_por |
|---:|---|---|---|---|
| 1 | emitido | 2026-08-16 | NULL | NULL |
| 2 | emitido | 2026-08-28 | NULL | NULL |
| 3 | emitido | 2026-08-28 | NULL | NULL |
| 9001 | emitido | 2026-06-10 | NULL | NULL |
| 9002 | emitido | 2026-06-10 | NULL | NULL |

**El #4 no está**: se borró en el revert. Ése es exactamente el hueco que el requisito 3 quiere
evitar a futuro — la fila tiene que quedar. Con `anular_recibo`, el #4 hoy sería una fila
`estado='anulado'` con su motivo, y el salto 3 → 5 se explicaría solo.

Los 5 tienen `emitido_por` NULL: son anteriores al fix de ISSUE-057 de ayer.

### 1.5 Un hallazgo lateral, no pedido pero relevante para el 20/09

```sql
SELECT * FROM club_secuencias;
```
```json
[{"club_id":"0649e9c5…(Dolores)","tipo":"recibo","ultimo_numero":30},
 {"club_id":"a6da7e40…(MCH)","tipo":"recibo","ultimo_numero":1}]
```

**El correlativo de Dolores ya va por 30**, con sólo 3 recibos reales vivos. La diferencia son las
corridas de probes, que emiten contra Dolores y después borran la fila pero no devuelven el número
(correctamente). Consecuencia práctica: **el primer recibo real del 20/09 no va a ser el #4 ni el
#5, va a ser el #31 o más.** No es un bug —el número no se recicla, que es lo que queremos— pero si
Fede o Valeria esperan que la numeración arranque baja, conviene avisarles ahora. Ver §7, pregunta 4.

---

## 2. El RPC `anular_recibo`

### 2.1 El punto difícil: a qué estado vuelve cada línea

Pediste determinarlo, no asumirlo. Ésta es la determinación.

**Cómo nace el estado** (`liquidaciones-engine.js:307-328`):

```javascript
const retenido = item.conceptoTipo === 'premio' && (item.posicion === 1 || item.posicion === 2);
… estado_linea:     retenido ? 'retenido' : 'impago',
  fecha_liberacion: retenido ? fechaLiberacion : null,
```

`fechaLiberacion = reunión.fecha + dias_antidoping` (30 por defecto, `:100`). Nótese que **`retenido`
no depende de la fecha**: un premio de 1°/2° se regenera como `retenido` siempre, aunque hayan pasado
dos años. La liberación es **manual** desde v1.1.

**Cómo se sale de `retenido`** — sólo por `liberar_linea`, cuyo cuerpo real es:

```sql
UPDATE liquidacion_detalle SET estado_linea = 'impago'
 WHERE id = p_linea_id AND estado_linea = 'retenido'
```

**`liberar_linea` NO limpia `fecha_liberacion`.** La fecha sobrevive. Y `emitir_recibo` tampoco la
toca (sólo escribe `estado_linea`, `recibo_id`, `pagado_at`).

**Y el dato clave**: `emitir_recibo` sólo paga líneas `AND d.estado_linea = 'impago'`. Entonces:

> Toda línea colgada de un recibo estaba en **`impago`** el instante anterior al pago. Y si además
> tiene `fecha_liberacion` futura, la única forma de haber llegado ahí es que **alguien apretó
> Habilitar** (`liberar_linea`): no hay otro camino.

Eso deja **dos reglas defendibles**, y la diferencia es de producto, no técnica:

| | Regla | Qué hace | Riesgo |
|---|---|---|---|
| **(a)** | Siempre `'impago'` | Inverso literal y exacto de `emitir_recibo` | La plata queda cobrable de nuevo **sin que nadie vuelva a decidirlo**, aunque el anti-doping siga vigente |
| **(b)** | `'retenido'` si `fecha_liberacion > CURRENT_DATE`, si no `'impago'` | Re-aplica el candado del anti-doping | Deshace en silencio una liberación manual legítima: el operador tiene que volver a apretar Habilitar |

**Recomendación: (b)**, por la regla de CLAUDE.md de elegir la opción conservadora en decisiones de
producto. El costo de (b) es un click visible y barato; el costo de (a) es plata retenida que queda
pagable sin que nadie lo haya decidido. En un circuito de dinero, el error que pide un click de más
es mejor que el que abre la caja sola.

```sql
estado_linea = CASE
  WHEN d.fecha_liberacion IS NOT NULL AND d.fecha_liberacion > CURRENT_DATE THEN 'retenido'
  ELSE 'impago'
END
```

La regla es **derivable de la propia línea** — `fecha_liberacion` está persistida y sobrevive a todo
el circuito. No hace falta guardar el estado previo en ninguna parte, ni releer la reunión.

**Queda anotado como decisión de producto para Fede** (§7, pregunta 1). Si dice (a), es cambiar el
`CASE` por `'impago'` y borrar un assert del probe.

**Por qué hoy no se puede distinguir con los datos de prod** — y por qué el probe tiene que fabricar
el caso:

```sql
SELECT d.estado_linea, d.concepto_tipo, d.posicion, d.fecha_liberacion, r.numero_recibo
FROM liquidacion_detalle d JOIN recibos r ON r.id=d.recibo_id;
```

Las **8** líneas con recibo tienen **todas `fecha_liberacion` NULL** — incluidas dos `premio` con
`posicion=1` (recibos 9001/9002), que son seeds de junio anteriores a Fase C. O sea: con los datos
de hoy, (a) y (b) dan idéntico resultado. El caso que los separa **no existe en la base y el probe
tiene que construirlo** (§5, P2).

### 2.2 Permisos — los dos guards, mismo patrón que v1.2

```sql
-- guard 1 · CLUB (permiso, depende de la sesión).
-- service_role (fn_get_user_club_id() NULL) y super_admin pasan.
IF fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin()
   AND v_recibo.club_id IS DISTINCT FROM fn_get_user_club_id() THEN
  RAISE EXCEPTION 'anular_recibo: el recibo % es de otro club', v_recibo.numero_recibo
    USING ERRCODE = '42501';
END IF;

-- guard 2 · VENTANA DE 5 DÍAS (permiso, depende de la sesión).
IF NOT fn_is_super_admin()
   AND fn_get_user_club_id() IS NOT NULL
   AND v_recibo.emitido_at < now() - interval '5 days' THEN
  RAISE EXCEPTION 'anular_recibo: el recibo % se emitió el % (hace más de 5 días) — sólo un super_admin puede anularlo',
    v_recibo.numero_recibo, v_recibo.emitido_at::date
    USING ERRCODE = '42501';
END IF;
```

Diferencia importante respecto de `emitir_recibo`: allá el **guard 2 era del dato** (las líneas son
del club) y por eso corría también bajo `service_role`. Acá **los dos guards son de permiso**, porque
el club del recibo se lee de la propia fila (`v_recibo.club_id`), no viene por parámetro — no hay
nada que un llamador pueda mentir. El equivalente del "guard de invariante" acá es el §2.5.

### 2.3 Idempotencia

```sql
IF v_recibo.estado = 'anulado' THEN
  RAISE EXCEPTION 'anular_recibo: el recibo % ya fue anulado el % — no se anula dos veces',
    v_recibo.numero_recibo, v_recibo.anulado_at::date;
END IF;
```

Falla fuerte con mensaje que dice **cuándo** se anuló, no un error genérico. Y como el `UPDATE` de
`recibos` lleva `AND estado = 'emitido'` en el `WHERE`, dos llamadas concurrentes no pueden anular
dos veces aunque pasen las dos el `IF`.

### 2.4 Motivo obligatorio

Se valida **en el RPC**, no con `NOT NULL` en la columna:

```sql
IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
  RAISE EXCEPTION 'anular_recibo: el motivo de anulación es obligatorio';
END IF;
```

Por qué no `NOT NULL`: las 5 filas históricas quedarían inválidas y habría que backfillear con un
valor inventado. Con la validación en el RPC, la columna es nullable para lo viejo y obligatoria para
todo lo nuevo — que es lo que se quiere. (Mismo criterio que `emitido_por`, GOTCHA #79.)

### 2.5 El SQL completo

`migrations/anular_recibo_v1.sql` — **propuesto, NO aplicado**:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- anular_recibo v1 — ISSUE-056
--
-- Origen: el 28/08 Valeria emitió el recibo #4 probando (R8, 6 líneas, $62.700)
-- y hubo que revertirlo con SQL a mano sobre producción. Con gente en la
-- ventanilla el 20/09 eso no es viable.
--
-- Regla de Valeria que lo hace urgente: recibo impreso = pago hecho. El papel
-- existe apenas se imprime, así que anular tiene que ser una operación normal
-- del sistema, no una intervención.
--
-- NO devuelve el correlativo: fn_siguiente_recibo es un contador monótono en
-- club_secuencias, así que alcanza con no tocarlo. El probe lo asserta igual.
-- NO borra la fila: el hueco en la numeración se documenta solo.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE recibos
  ADD COLUMN IF NOT EXISTS anulado_por      uuid REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS motivo_anulacion text;

COMMENT ON COLUMN recibos.anulado_por IS
  'usuarios.id (NO auth.users) del que anuló. NULL bajo service_role. Ver GOTCHA #79.';
COMMENT ON COLUMN recibos.motivo_anulacion IS
  'Obligatorio por anular_recibo, nullable en la columna por las filas previas a ISSUE-056.';

CREATE OR REPLACE FUNCTION public.anular_recibo(
  p_recibo_id uuid,
  p_motivo    text
)
RETURNS recibos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recibo     recibos;
  v_usuario_id uuid;
  v_liberadas  int;
BEGIN
  IF p_recibo_id IS NULL THEN
    RAISE EXCEPTION 'anular_recibo: falta el recibo';
  END IF;

  -- Motivo obligatorio (requisito 6). Antes de tocar nada.
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'anular_recibo: el motivo de anulación es obligatorio';
  END IF;

  -- FOR UPDATE: serializa dos anulaciones concurrentes del mismo recibo.
  SELECT * INTO v_recibo FROM recibos WHERE id = p_recibo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'anular_recibo: el recibo no existe';
  END IF;

  -- ── guard 1: club ────────────────────────────────────────────────────────
  IF fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin()
     AND v_recibo.club_id IS DISTINCT FROM fn_get_user_club_id() THEN
    RAISE EXCEPTION 'anular_recibo: el recibo % es de otro club', v_recibo.numero_recibo
      USING ERRCODE = '42501';
  END IF;

  -- ── guard 2: ventana de 5 días ───────────────────────────────────────────
  IF NOT fn_is_super_admin() AND fn_get_user_club_id() IS NOT NULL
     AND v_recibo.emitido_at < now() - interval '5 days' THEN
    RAISE EXCEPTION
      'anular_recibo: el recibo % se emitió el % (hace más de 5 días) — sólo un super_admin puede anularlo',
      v_recibo.numero_recibo, v_recibo.emitido_at::date
      USING ERRCODE = '42501';
  END IF;

  -- ── idempotencia ─────────────────────────────────────────────────────────
  IF v_recibo.estado = 'anulado' THEN
    RAISE EXCEPTION 'anular_recibo: el recibo % ya fue anulado el % — no se anula dos veces',
      v_recibo.numero_recibo, v_recibo.anulado_at::date;
  END IF;

  -- ── quién anula (GOTCHA #79: FK a usuarios, NO a auth.users) ─────────────
  SELECT u.id INTO v_usuario_id
    FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo LIMIT 1;

  -- ── 1+2: soltar recibo_id y devolver el estado que corresponde ───────────
  -- El AND recibo_id = p_recibo_id no es decorativo: acota el UPDATE a las
  -- líneas de ESTE recibo aunque algo más cambie en el medio.
  UPDATE liquidacion_detalle d
     SET recibo_id    = NULL,
         pagado_at    = NULL,
         estado_linea = CASE
           WHEN d.fecha_liberacion IS NOT NULL AND d.fecha_liberacion > CURRENT_DATE
             THEN 'retenido'::estado_linea_liq
           ELSE 'impago'::estado_linea_liq
         END
   WHERE d.recibo_id = p_recibo_id;
  GET DIAGNOSTICS v_liberadas = ROW_COUNT;

  IF v_liberadas = 0 THEN
    RAISE EXCEPTION 'anular_recibo: el recibo % no tiene líneas asociadas — no se anula un recibo vacío',
      v_recibo.numero_recibo;
  END IF;

  -- ── 3+5+6: marcar anulado SIN borrar ─────────────────────────────────────
  UPDATE recibos
     SET estado           = 'anulado',
         anulado_at       = now(),
         anulado_por      = v_usuario_id,
         motivo_anulacion = btrim(p_motivo)
   WHERE id = p_recibo_id
     AND estado = 'emitido'          -- red ante concurrencia
  RETURNING * INTO v_recibo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'anular_recibo: el recibo % cambió de estado durante la anulación',
      v_recibo.numero_recibo;
  END IF;

  -- 4: club_secuencias NO se toca. El número no vuelve.
  RETURN v_recibo;
END $function$;

GRANT EXECUTE ON FUNCTION public.anular_recibo(uuid, text) TO authenticated;
```

**Todo o nada**: es una sola función plpgsql, o sea una sola transacción. Cualquier `RAISE` hace
rollback de los dos `UPDATE`. No hay estado parcial posible.

**Rollback** — `migrations/rollback_anular_recibo_v1.sql`:

```sql
DROP FUNCTION IF EXISTS public.anular_recibo(uuid, text);
-- Las columnas se dejan: son aditivas, nullable, y si hubo alguna anulación
-- borrarlas perdería el registro. Para revertir del todo, y sólo si no se usó:
-- ALTER TABLE recibos DROP COLUMN IF EXISTS anulado_por, DROP COLUMN IF EXISTS motivo_anulacion;
```

### 2.6 Auditoría: qué queda registrado y qué no

```sql
SELECT c.relname, t.tgname, p.proname FROM pg_trigger t ... WHERE NOT t.tgisinternal;
```
```json
[{"tabla":"liquidaciones","trigger":"trg_audit_liquidaciones","fn":"fn_auditoria_log"},
 {"tabla":"recibos","trigger":"trg_audit_recibos","fn":"fn_auditoria_log"}]
```

**`recibos` SÍ tiene trigger de auditoría** — a diferencia de `liquidacion_detalle`, que no tiene
ninguno (fue lo que obligó a la marca `[REGULARIZACION …]` en el saldado del 28/08). Entonces:

- la anulación del **recibo** deja rastro en `auditoria` sola, además de las columnas nuevas;
- el **retorno de las líneas** a impago/retenido **no deja rastro en `auditoria`**.

Para las líneas, la trazabilidad es reconstruible por `recibo_id IS NULL` + el recibo anulado que las
nombraba… salvo que **el recibo anulado ya no las nombra**, porque justamente les soltamos el
`recibo_id`. **El vínculo se pierde.** Ver §7, pregunta 3: si Fede quiere saber *qué* líneas tenía el
recibo #4, hay que guardarlo (un `jsonb` con los ids en el recibo, o una tabla puente). No lo incluyo
en v1 porque no lo pediste, pero es la pregunta que va a aparecer el 21/09.

---

## 3. La UI — y por qué esto va en dos entregas

### 3.1 Hoy no hay ninguna forma de encontrar un recibo emitido

Verificado, no supuesto:

- **El buscador de Pagos no los muestra.** `cobrosBuscar` (`liquidaciones.html:927`) filtra
  `.eq('estado_linea','impago')` + `.is('recibo_id', null)`, e ídem `cobrosDetalle` (`:1016`, `:1019`).
  En cuanto se cobra, el beneficiario **desaparece de la pantalla**. Es correcto para cobrar y fatal
  para anular.
- **`imprimirReciboCobro` se llama en un solo lugar**, `liquidaciones.html:1162`, justo después de
  `cobEmitir`, con el objeto `recibo` **en memoria**. No hay búsqueda por número ni por persona.
- **El Resumen (Fase 5) sólo cuenta.** `liquidaciones.html:711` acumula `recibos.add(l.recibo_id)`
  para mostrar *"N recibo(s)"* — un número, sin lista y sin ids en el DOM.

**No existe ninguna pantalla, ni ningún parámetro de URL, desde donde llegar a un recibo ya emitido.**

### 3.2 Consecuencia: RPC primero, UI después

Y acá pega tu restricción de no construir la vista de historial: **sin alguna superficie que liste
recibos, el botón de anular no tiene dónde vivir.** Las dos salidas:

| Opción | Qué es | Costo | Sirve el 20/09 |
|---|---|---|---|
| **A. Anular desde el recibo recién emitido** | Botón "Anular" en el modal/pantalla que ya aparece después de emitir, mientras el `recibo` está en memoria | Chico: no hay que buscar nada, el id ya está | **Sí, para el caso de Valeria** |
| **B. Buscador de recibos** | Campo por nº de recibo + listado | Es la vista de historial que dejaste fuera de alcance | No en esta entrega |

**Recomiendo A para v1**, y es más que un parche: **es exactamente el caso real**. El #4 se emitió
probando y se detectó al instante — la ventana en la que Valeria se da cuenta del error es la misma
en la que todavía tiene el recibo en pantalla. La regla que ella misma formuló ("recibo impreso =
pago hecho") dice que el momento crítico es el de la impresión, y ahí el recibo está en memoria.

Concretamente:

- **Dónde**: en el bloque que se muestra tras `cobEmitir` (`liquidaciones.html:1162`), al lado de
  "Imprimir". Etiqueta **"Anular recibo"**, en rojo (`--danger`), visualmente separado de Imprimir
  para que no se apriete de más.
- **Qué pide**: un `prompt`/modal con **motivo obligatorio** (texto libre, se rechaza vacío del lado
  del cliente además del RPC) + confirmación explícita que **nombre el número y el importe**:
  *"¿Anular el recibo #31 de $62.700 a LORENA SOLEDAD VARELA? Las 6 líneas vuelven a quedar
  pendientes. El número 31 no se reutiliza."* Sin `confirm()` pelado: la confirmación tiene que decir
  qué se pierde.
- **Después**: refrescar el buscador de Pagos, donde las líneas reaparecen solas.
- **Fuera de la ventana de 5 días**: el botón directamente no se muestra si el usuario no es
  `super_admin` y `emitido_at` es viejo — pero **el RPC igual valida**, porque la UI no es un guard
  (GOTCHA #80: si no está escrito en la función, no existe).

**B queda para la entrega siguiente**, junto con la vista de historial, cuando la habilites.

---

## 4. Guardas que faltan — el caso de las líneas de regularización

Preguntaste específicamente por las líneas saldadas administrativamente (marca
`[REGULARIZACION 2026-08-28 …]`, `estado_linea='pagado'` con `recibo_id IS NULL`). Verificado, no
razonado:

```sql
SELECT
 (SELECT count(*) FROM liquidacion_detalle WHERE estado_linea='pagado' AND recibo_id IS NULL) AS saldado_admin_sin_recibo,
 (SELECT count(*) FROM liquidacion_detalle WHERE recibo_id IS NOT NULL AND descripcion ILIKE '%REGULARIZACION%') AS regularizadas_con_recibo,
 (SELECT count(*) FROM liquidacion_detalle WHERE recibo_id IS NOT NULL AND estado_linea <> 'pagado') AS con_recibo_no_pagado,
 (SELECT count(*) FROM liquidacion_detalle WHERE recibo_id IS NOT NULL) AS con_recibo_total;
```
```json
[{"saldado_admin_sin_recibo":338,"regularizadas_con_recibo":0,"con_recibo_no_pagado":0,"con_recibo_total":8}]
```

| Chequeo | Resultado | Lectura |
|---|---|---|
| Regularizadas **con** recibo | **0** de 338 | ✅ Ninguna cuelga de un recibo |
| Líneas con recibo que **no** están pagadas | **0** de 8 | ✅ La invariante "con recibo ⇒ pagado" se cumple |

**Tu sospecha era correcta y el dato la confirma.** Las 338 regularizadas tienen `recibo_id IS NULL`,
y `anular_recibo` selecciona por `WHERE d.recibo_id = p_recibo_id` — **son inalcanzables por
construcción**. No hace falta un guard extra: agregar un `AND descripcion NOT ILIKE '%REGULARIZACION%'`
sería ruido que sugiere un riesgo que no existe.

**Lo que sí es un estado imposible y merece guard** es lo que ya está en el SQL: `v_liberadas = 0`.
Un recibo sin líneas no se anula — o el `recibo_id` ya se soltó por otra vía, o es un recibo
huérfano, y en los dos casos anularlo en silencio esconde un problema en vez de mostrarlo. Los seeds
9001/9002 tienen 2 líneas cada uno, así que no disparan este caso.

**Un agujero residual que encontré y que NO cierro acá** (fuera de alcance, pero queda anotado):

```sql
SELECT polname, polcmd FROM pg_policy WHERE polrelid='public.recibos'::regclass;
```
```
recibos_delete  | d   -- super_admin OR club_id = fn_get_user_club_id()
recibos_update  | w   -- idem
```

Existe una policy de **DELETE** sobre `recibos`. Un `secretario_carreras` puede borrar un recibo de
su club **directamente por PostgREST**, sin pasar por `anular_recibo` — que es literalmente lo que se
hizo a mano el 28/08. Tener el RPC no cierra esa puerta. Ver §7, pregunta 5.

---

## 5. El probe — `tests/probe_anular_recibo.mjs`

Mismo patrón que `probe_aislamiento_club_cobros.mjs`: código real, sin browser, fixtures propias en
un club de prueba, restore por estado en el `finally`.

**Infra obligatoria** (GOTCHA #77 / ISSUE-058): `tests/lib/estado_lineas.mjs` con `snapshotLineas`
antes, `restaurarLineas` + `diffLineas` en el `finally`, **dos** asserts de restore (quedó limpio /
no hubo que restaurar nada), y `recibosDesde()` **sin filtro de club** (GOTCHA #76).

**Fixtures**: dos clubes (A = Dolores, B = Mi Club Hípico, igual que el probe de aislamiento), dos
usuarios reales por `admin.auth.admin` + `magiclink` para tener sesión con `auth.uid()`.

### Cobertura pedida

| # | Assert | Cómo se construye |
|---|---|---|
| **P1** | Anulación exitosa: líneas vuelven a **`impago`** | Línea sin `fecha_liberacion` → emitir → anular → `estado_linea='impago'`, `recibo_id IS NULL`, `pagado_at IS NULL` |
| **P2** | Líneas vuelven a **`retenido`** | Línea con `fecha_liberacion = CURRENT_DATE + 10` **plantada a mano** (el caso no existe en prod, §2.1) → `liberar_linea` → emitir → anular → `estado_linea='retenido'` |
| **P2b** | `fecha_liberacion` **pasada** vuelve a `impago`, no a retenido | `fecha_liberacion = CURRENT_DATE - 10`. Es el otro lado del `CASE`; sin esto, (b) podría estar reteniendo todo |
| **P3** | El correlativo **no** se devuelve | `club_secuencias.ultimo_numero` antes y después de anular: **igual**. Y el recibo siguiente saca un número **mayor** al anulado |
| **P4** | El recibo **queda**, con `estado='anulado'` | `SELECT` por id: existe, `estado='anulado'`, `anulado_at` no nulo, `motivo_anulacion` = el texto, `numero_recibo` intacto |
| **P4b** | …y **no** se borró | `count(*)` de recibos antes/después de anular: **igual** (no −1) |
| **P5** | Anular dos veces **falla** | Segunda llamada → excepción cuyo mensaje contiene `ya fue anulado`; y el recibo queda con **el `anulado_at` de la primera**, no pisado |
| **P6** | Usuario de otro club **no puede** | Sesión de B intenta anular un recibo de A → excepción `es de otro club`; y **nada cambió**: líneas y recibo intactos |
| **P7** | Pasados los 5 días, el rol que emite **no puede** | Recibo con `emitido_at = now() - 6 días` (UPDATE directo en la fixture) → sesión del club → excepción `más de 5 días` |
| **P7b** | …y **super_admin sí** | Mismo recibo, sesión super_admin → anula OK |
| **P7c** | Dentro de los 5 días el rol que emite **sí puede** | Caso inverso de P7: sin esto, un guard roto que niegue siempre pasaría P7 |
| **P8** | Motivo obligatorio | `p_motivo = NULL`, `''` y `'   '` → las tres fallan con `motivo de anulación es obligatorio`; y el recibo sigue `emitido` |
| **P9** | `anulado_por` = `usuarios.id`, no `auth.uid()` | Igual que el assert 17 del probe de aislamiento: comparar **los dos ids** explícitamente (GOTCHA #79) |
| **P10** | Bajo `service_role`, `anulado_por` queda NULL | No inventa autor |
| **P11** | Las líneas vuelven a ser **cobrables** | Tras anular, `cobrosBuscar` (extraída del HTML real) vuelve a listar al beneficiario con el monto — cierra el círculo con §1.2 |
| **R1-R4** | Restore por estado + sin recibos colgados en ningún club | `diffLineas` + `recibosDesde()` sin filtro de club |

**P7c y P2b son los casos inversos** — la lección de los asserts 7/8/11/12/16 del probe de
aislamiento: sin ellos, un guard que niega siempre y un `CASE` que retiene siempre pasarían el resto.

### Mutation test — uno por guard

Con el **patrón de función sombra** de ISSUE-059: se despliega `anular_recibo_mutN` con un guard
neutralizado y el probe corre con `RPC_ANULAR=anular_recibo_mutN`, sin tocar la función real.

| Mutante | Qué se neutraliza | Asserts que **tienen** que romperse |
|---|---|---|
| `mut1` | Guard de club | P6 |
| `mut2` | Guard de 5 días | P7 (y **no** P7b/P7c) |
| `mut3` | Guard de idempotencia | P5 |
| `mut4` | Guard de motivo | P8 |
| `mut5` | `CASE` → siempre `'impago'` | P2 (y **no** P1/P2b) |
| `mut6` | `anulado_por = auth.uid()` | P9 **con error de FK**, que es el punto de GOTCHA #79 |

Si un mutante **no** rompe su assert, el assert no estaba midiendo lo que dice medir. Y las sombras
se dropean en el `finally` — el 29/08 quedó una huérfana de `mut2` y hubo que limpiarla a mano.

---

## 6. Orden de aplicación propuesto

Ninguno de estos pasos se ejecutó.

1. `migrations/anular_recibo_v1.sql` por `apply_migration` — aditiva: 2 columnas nullable + función
   nueva. **No toca `emitir_recibo`, ni el ENUM, ni el saldado.**
2. `node tests/probe_anular_recibo.mjs` → verde contra `anular_recibo` real.
3. Mutation test: los 6 mutantes, cada uno mata sus asserts. Dropear las sombras.
4. Regresión: `probe_aislamiento_club_cobros` (27/27), `probe_recibos_emision` (3 fallos previos),
   `probe_cobros_v11` (1 previo), `probe_recibo_pie_cobrador` (56/56), `probe_reunion_es_prueba`
   (17/17). **Cero regresiones nuevas.**
5. UI opción A + merge.
6. md5 contra `sigh.com.ar` + re-corrida contra el HTML servido.

**Si el paso 2 falla**: `rollback_anular_recibo_v1.sql` y aviso.

---

## 7. Preguntas abiertas

1. **(Producto, para Fede) ¿(a) o (b) en §2.1?** Al anular, ¿una línea que estaba retenida y fue
   liberada a mano vuelve a `impago` (respeta la liberación) o a `retenido` (re-aplica el candado)?
   Propongo **(b)**, la conservadora. Es un `CASE` y un assert.
2. **¿5 días corridos o hábiles?** Escribí `interval '5 days'` = corridos. Un recibo del viernes se
   vuelve super_admin-only el miércoles. Si las reuniones son domingo y la ventanilla trabaja lunes,
   quizá corresponda hábiles o 7 corridos.
3. **¿Hay que guardar qué líneas tenía el recibo anulado?** Hoy el vínculo se pierde: al soltar
   `recibo_id`, el recibo anulado ya no nombra a sus líneas, y `liquidacion_detalle` no tiene trigger
   de auditoría (§2.6). Reconstruir el #4 hoy requiere leer el informe del 28/08. Un `jsonb` con los
   ids en `recibos` lo resolvería. No está en v1.
4. **El correlativo de Dolores ya va por 30** (§1.5), por las corridas de probes. El primer recibo
   real del 20/09 va a ser #31 o más. ¿Está bien así, o Fede espera que arranque bajo? Cambiarlo es
   un `UPDATE` a `club_secuencias` **antes** del 20/09; después no, porque reciclaría números.
5. **La policy `recibos_delete` sigue abierta** (§4): un `secretario_carreras` puede borrar un recibo
   de su club por PostgREST sin pasar por el RPC. Tener `anular_recibo` no cierra esa puerta.
   ¿Se revoca el DELETE y se deja la anulación como único camino? Es una decisión aparte y la dejo
   fuera de este plan.
6. **Confirmar el corte de tu mensaje**: asumí "no construyas la vista de **historial** de recibos".
   Es lo que fuerza la opción A del §3.2.
