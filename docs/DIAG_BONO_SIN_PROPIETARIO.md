# Diagnóstico — recibo "LOS MONCHITOS" sin nombre de persona

**Estado: INFORME. Nada aplicado.** Sesión 100 % lectura: sólo `SELECT` por MCP, `grep` y
`sed -n` sobre el repo. Cero escrituras en producción, cero cambios de código.

- Fecha: 2026-08-27
- Proyecto: `unlhcuanfrtpatoipwve` (Dolores prod) · club `0649e9c5-9e87-4aad-842f-101458e6b33c`
- Guard verificado al abrir: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` = **181**, ref correcta.
- Disparador: Valeria, pagando la reunión, encuentra un recibo a nombre de **"LOS MONCHITOS"**
  por un bono de $100.000 de la 4ª carrera, sin ninguna persona a quién pagarle.

---

## 0. Veredicto

**Ni H1 ni H2. Es una tercera causa: el dato es correcto y está funcionando como fue
diseñado.** "LOS MONCHITOS" es un **propietario provisorio** creado a propósito el 18/08,
con el nombre de la caballeriza y sin documento, para destrabar la liquidación de R8.

No es un bug. Es la deuda técnica de R8 llegando a la caja.

---

## 1. H1 (grave) — DESCARTADA

> *H1: la línea se generó sin `propietario_id`. Cadena del propietario rota otra vez,
> mismo patrón que R8 (`if (!id) return;`, sin log ni traza).*

La cadena **no** está rota. La línea tiene todos los eslabones resueltos:

```
liquidacion_detalle  881b56d1-56d5-451a-b6fd-2d7c15e9bf4c
  concepto             Carrera 4 — Bono 7° puesto
  descripcion          Bono 7° puesto (100% propietario): $100.000,00
  concepto_tipo        bono          ·  posicion 7
  monto_bruto / neto   100000.00 / 100000.00
  beneficiario_tipo    propietario
  beneficiario_id      12b4be54-9474-4a26-ae26-fe37fb5db254   ← NO es null
  estado_linea         impago        ·  recibo_id  null
  carrera_id           baa0ee8f-9f20-417e-b106-f5bc3faffc2c
                       numero_turno 5 · numero_carrera_programa 4
  liquidacion_id       53fae08b-229f-4023-8504-d0bfa51cf991
    liquidaciones.propietario_id  12b4be54-…                  ← NO es null
    liquidaciones.profesional_id  null
  reunion_id           7b6e003e-22e2-4629-bf55-f18560b1260f  (R8 · 2026-08-16)
```

Además la FK `liquidaciones_propietario_id_fkey → propietarios` está activa: si el id
no existiera en `propietarios`, la fila no habría podido insertarse.

## 2. H2 (cosmético) — DESCARTADA

> *H2: `propietario_id` está resuelto pero el render muestra `caballerizas.nombre` en
> lugar de `propietarios.nombre`.*

El render lee la tabla correcta. `liquidaciones.html:746`:

```js
if (tipo==='propietario') return propietariosMap[id]?.nombre || '(propietario)';
```

`propietariosMap` se llena en la línea 479 desde `.from('propietarios')`. El camino del
nombre del beneficiario nunca toca `caballerizas`.

`caballerizas` sí aparece en el módulo, pero en otra función y con otro propósito:
`cobrosBuscar` (líneas 795-802) arma `cobCaballerizas` sólo para **buscar** un propietario
tipeando el nombre de su caballeriza. No alimenta el label del recibo.

**Ojo con la coincidencia de nombre**, que es la trampa de este caso:

| | UUID |
|---|---|
| propietario `LOS MONCHITOS` | `12b4be54-9474-4a26-ae26-fe37fb5db254` |
| caballeriza `LOS MONCHITOS` | `c446eb38-3f40-46eb-9d1c-ee4be2c9df6b` |

Son **dos filas distintas en dos tablas distintas**. No hay id compartido ni FK cruzada.
Se llaman igual porque una copió el nombre de la otra, a propósito (§3).

> Nota para quien relea `docs/BITACORA_R8_PROVISORIOS_18AGO.md:193`, que lista
> `LOS MONCHITOS | 12b4be54-…`: ese UUID es el del **propietario provisorio**, no el de
> la caballeriza. Fácil de leer al revés.

## 3. H3 — la causa real

`12b4be54-…` existe en `propietarios` y su `nombre` es literalmente `"LOS MONCHITOS"`:

| campo | valor |
|---|---|
| `nombre` | `LOS MONCHITOS` |
| `tipo` | `persona` |
| `documento_tipo` / `documento_nro` | `null` / `null` |
| `notas` | `provisorio R8 15/08` |
| `activo` / `estado` | `true` / `activo` |
| `created_at` | `2026-08-18 16:16:40.270291+00` |

Comparar con un propietario real: `QUINTEROS, CARLA ELISABETH`, formato `APELLIDO, NOMBRE`,
con documento. El provisorio no tiene ni el formato ni el documento.

### Origen documentado

`docs/PLAN_PROPIETARIOS_PROVISORIOS_R8.md`, línea 10:

> Fede aprobó cargar el **nombre de la caballeriza como titular provisorio**, para que la
> liquidación del domingo emita el 70 % del propietario y el bono 6°–8°.

- Línea 106 — `nombre` ← `caballerizas.nombre`, tal cual.
- Línea 148 — **"Regla: en las filas provisorias no se carga documento. Ni tipo ni número."**
- Línea 37 — marca de trazabilidad: `notas = 'provisorio R8 15/08'`.

### Por qué se hizo

Estado de R8 medido el 15/08 (§1.1 de aquel plan): 67 inscripciones ratificadas, **49 sin
`propietario_id`**, y 40 de las 57 caballerizas sin ningún responsable cargado. Sin
propietario no hay a quién liquidarle el 70 % ni el bono 6°–8°. Se creó un propietario
placeholder por caballeriza para que la liquidación del domingo pudiera emitirse.

El recibo que vio Valeria es exactamente ese mecanismo funcionando como fue diseñado.

---

## 4. Alcance — no es una línea

Los 40 provisorios siguen vivos y sin completar desde el 18/08. Ninguno fue tocado.

```sql
SELECT count(*) AS provisorios_total,
       count(*) FILTER (WHERE notas LIKE 'provisorio R8%') AS con_marca_notas
FROM propietarios
WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND (documento_nro IS NULL OR documento_nro='');
-- → 40 / 40
```

Los 40 sin documento del club son **exactamente** los 40 marcados como provisorios: no hay
propietarios reales sin documento mezclados en el conjunto. La marca es limpia.

### Plata parada contra provisorios

| | líneas | monto |
|---|---:|---:|
| **Total** | 34 | **$8.281.640** |
| `impago` — **cobrable hoy** | | **$2.230.840** |
| `retenido` (anti-doping) | | $6.050.800 |
| `pagado` | 0 | $0 |

30 caballerizas distintas con dinero esperando. **Nada pagado todavía.**

Las mayores (todas `retenido`, se liberan con `liberar_linea`):

| beneficiario provisorio | monto | estado |
|---|---:|---|
| MELINA A | $1.400.000 | retenido |
| EMI | $770.000 | retenido |
| ABUELO FLORO | $735.000 | retenido |
| EL CHINGA | $675.500 | retenido |
| MARTIN Y NICOLAS | $665.000 | retenido |
| LOS CUERVOS | $595.000 | retenido |
| EL COLORADO | $443.333,33 | retenido |
| CRAZY HORSE | $343.833,33 | impago + retenido |
| MI MARTINCITO | $280.000 | impago |
| LA MILINGA | $277.000 | impago (3 líneas) |
| **LOS MONCHITOS** | **$100.000** | **impago** |

`LOS MONCHITOS` es de los casos chicos. El riesgo real está arriba de la tabla.

---

## 5. El problema de fondo: nada frena el pago

Más grave que el label: **no hay ninguna validación que impida emitir el recibo.**

- `migrations/emitir_recibo_v1_1.sql` no valida documento del beneficiario, ni consulta
  `propietarios.notas`. Acepta `p_cobrador_nombre` / `p_cobrador_documento` como `text`
  nullable y los inserta tal cual.
- La captura del cobrador se sacó del front por decisión de producto.
  `liquidaciones.html:911-915`:

```js
// Ya no se captura cobrador (decisión Fede). El RPC mantiene su firma; nombre/documento van null
p_cobrador_nombre: null, p_cobrador_documento: null
```

Resultado: Valeria puede emitir el recibo de LOS MONCHITOS ahora mismo. Queda un
comprobante contable **a nombre de una caballeriza, sin DNI, sin persona identificada y sin
registro de quién retiró el dinero.** Ese es el agujero — no el nombre en pantalla.

---

## 6. Recomendaciones — anotadas, NO aplicadas

1. **Completar los 40 provisorios.** Es trabajo de dato, no de código: alguien tiene que
   declarar qué persona hay detrás de cada caballeriza. Son los mismos titulares que
   `docs/GATE_4_1_LISTA_YESI.md` viene reclamando. Prioridad por monto: MELINA A, EMI,
   ABUELO FLORO, EL CHINGA primero.
2. **Guard en `emitir_recibo`.** Rechazar beneficiario con `notas LIKE 'provisorio R8%'`
   o sin `documento_nro`. Es la red que hoy no existe. Decisión de producto: ¿bloqueo duro
   o confirmación explícita del operador?
3. **Marca visible en Pagos.** Que el buscador y la ficha muestren `⚠ provisorio — falta
   titular` en lugar de un nombre que se lee como normal. Valeria no tenía forma de saberlo.
4. **El rollback del plan original ya no sirve.** `PLAN_PROPIETARIOS_PROVISORIOS_R8.md`
   §6.3 borra los provisorios, pero aborta por FK si hay liquidación apuntándoles — que es
   el caso actual (34 líneas). El camino ahora es **completar**, no borrar.

---

## 7. Consultas usadas (todas SELECT)

```sql
-- Localizar la línea
SELECT d.*, c.numero_turno, c.numero_carrera_programa, l.propietario_id, r.numero
FROM liquidacion_detalle d
JOIN liquidaciones l ON l.id = d.liquidacion_id
LEFT JOIN carreras c ON c.id = d.carrera_id
LEFT JOIN reuniones r ON r.id = l.reunion_id
WHERE d.monto_bruto = 100000;

-- ¿El UUID es propietario o caballeriza?
SELECT 'propietarios', id, nombre FROM propietarios WHERE id='12b4be54-…'
UNION ALL
SELECT 'caballerizas', id, nombre FROM caballerizas WHERE id='12b4be54-…';

-- Alcance económico
SELECT count(DISTINCT p.id), count(*), sum(d.monto_neto),
       sum(d.monto_neto) FILTER (WHERE d.estado_linea='impago'),
       sum(d.monto_neto) FILTER (WHERE d.estado_linea='retenido'),
       sum(d.monto_neto) FILTER (WHERE d.estado_linea='pagado')
FROM liquidacion_detalle d
JOIN propietarios p ON p.id = d.beneficiario_id AND d.beneficiario_tipo='propietario'
WHERE p.notas LIKE 'provisorio R8%';
```
