# Recibo de Pagos — el rótulo del rol. Diagnóstico

**READ-ONLY sobre la base, y no se tocó código.** Función: `imprimirReciboCobro()`,
`liquidaciones.html:924-978`.

> ## Las tres respuestas, cortas
>
> 1. **El dato del rol existe en la base, pero el recibo no lo trae.** No es que lo tenga y
>    no lo muestre: el `SELECT` no pide ni `beneficiario_tipo`, ni `concepto_tipo`, ni
>    `descripcion`, que son las tres columnas donde vive el rol.
> 2. **`"Clase: Cuidador-Peon"` no lo genera SGH.** La palabra `Clase` no aparece en ningún
>    archivo del repo, y el recibo no tiene ese campo. Viene del formulario en papel.
> 3. **No, el recibo todavía no distingue solo al propietario.** Las líneas nuevas existen,
>    pero su columna `Concepto` imprime exactamente el mismo texto que la del entrenador.
>    **Hace falta tocar el render.**

---

## 1 · ¿Trae el dato o no lo muestra? — No lo trae

```js
// liquidaciones.html:926-927
const { data: lns } = await sb.from('liquidacion_detalle')
  .select('concepto,monto_neto,posicion,reunion_id,inscripcion_id').eq('recibo_id',recibo.id);
```

Cinco columnas. **Las tres que identifican el rol no están:**

| columna | ¿la trae? | qué contiene |
|---|---|---|
| `concepto` | sí | `Carrera 1 — 1° puesto` — **igual para todos los roles** |
| `beneficiario_tipo` | **no** | `propietario` / `profesional` / `club` |
| `concepto_tipo` | **no** | `premio` / `bono` / `incentivo_entrenador` / `incentivo_jockey` / `actuacion` / `fondo_solidario` |
| `descripcion` | **no** | `Carrera 1 — 1° puesto — Entrenador (bolsa: $860.000,00)` ← **acá está el rol** |

Y la fila que se imprime usa sólo `concepto` (línea 939):

```js
return `<tr><td>${fecha}</td><td>${carrera}</td><td>${caballo}</td><td>${puesto}</td>
        <td>${l.concepto||''}</td><td style="text-align:right">${fmt(l.monto_neto)}</td></tr>`;
```

Medido en R8, agrupando por `beneficiario_tipo` + `concepto_tipo`:

| beneficiario | concepto_tipo | líneas | `concepto` (lo que SÍ imprime) | `descripcion` (lo que NO trae) |
|---|---|---|---|---|
| profesional | premio | 60 | `Carrera 1 — 1° puesto` | `… — Entrenador (bolsa: $860.000,00)` |
| **propietario** | **premio** | **30** | **`Carrera 1 — 1° puesto`** | `… — Propietario (bolsa: $860.000,00)` |
| propietario | bono | 11 | `Carrera 1 — Bono 6° puesto` | `Bono 6° puesto (100% propietario)` |
| profesional | incentivo_entrenador | 45 | `Incentivo entrenador` | `Incentivo entrenador por caballo corrido` |
| profesional | incentivo_jockey | 23 | `Incentivo jockey` | `Incentivo jockey por actuación en la reunión` |
| club | fondo_solidario | 30 | `Carrera 1 — … — Fondo solidario` | `Fondo solidario 2%` |

**Las dos primeras filas son el problema entero.** El premio del propietario y el del
entrenador, para el mismo caballo y el mismo puesto, imprimen **el mismo string carácter por
carácter**. La única diferencia está en `descripcion` y en `beneficiario_tipo`, y ninguna de
las dos llega al papel.

### Y el encabezado tampoco lo dice

```js
<p><strong>Beneficiario:</strong> ${cobBenef?.nombre||'—'}</p>
```

Sólo el nombre. Pero **`cobBenef` ya tiene el tipo** —se arma como `{tipo, id, nombre}` en
`cobrosDetalle()` (línea 968)— y en la tarjeta de la pantalla sí se muestra
(`${g.tipo} · ${g.n} línea(s) pagable(s)`, línea 816). **En el recibo se descarta.**

Por eso el recibo de un propietario y el de su entrenador salen indistinguibles salvo por el
nombre de la persona: mismo encabezado, misma tabla, mismos conceptos.

## 2 · `"Clase: Cuidador-Peon"` — cómo se arma hoy: **no se arma**

```bash
$ grep -rn "Clase" --include=*.html --include=*.js --include=*.mjs .
(sin resultados)
```

**No existe esa etiqueta en el repo.** Ni en `liquidaciones.html`, ni en los otros
imprimibles (`carta-llamados.html`, `programa-oficial*.html`). El recibo que emite SGH no
tiene campo "Clase": su encabezado es club → nº de recibo → fecha → `Beneficiario:` y de ahí
pasa a la tabla.

**Conclusión: eso es del recibo en papel de Dolores, no de SGH.** Es el formulario con el que
Valeria está comparando.

Lo más parecido que sí genera SGH, y que probablemente sea el origen de la confusión:

```js
// liquidaciones-engine.js:320-321 — líneas de sub-reparto
concepto:    `${sub.rol} — ${sub.nombre}`        // → "Peón — Juan Pérez", "Capataz — …"
descripcion: `${item.concepto} — A redistribuir (4%)`
beneficiario_tipo: 'profesional',
beneficiario_id:   actorId                        // ← el ENTRENADOR, no el peón
```

Las líneas de peón, capataz y sereno **se emiten dentro del recibo del entrenador**, porque
él es quien las redistribuye. Así, un mismo recibo mezcla filas
`Carrera 5 — 1° puesto` (lo suyo como cuidador) con `Peón — Juan` (lo que tiene que
repartir), **sin ninguna etiqueta que diga cuál es cuál**. Eso encaja con el "Cuidador-Peon en
un mismo recibo" del reporte.

> Dato que conviene tener a mano: **hoy no hay ninguna línea de ese tipo en reuniones
> reales.** Sólo la reunión de prueba 9999 tiene 9 líneas `actuacion` (`Capataz — Carlos
> Capataz`). Ni R6 ni R8 tienen peón, capataz ni sereno cargados. Si Valeria vio
> "Cuidador-Peon" en un recibo **impreso desde SGH**, o fue de la 9999, o el papel es de otro
> lado. **Vale pedirle la foto antes de diseñar nada**: cambia si hay que separar sub-reparto
> o sólo rotular el rol.

Y el otro motivo de "todos dicen entrenadores": en el sistema **el módulo entero se llama
"Entrenadores"** (`profesionales.html`, título y `<h1>`; las tarjetas de `index.html`), y en
`profesionales` de Dolores hay 128 `entrenador`, 45 `jockey` y 1 `ambos`. La palabra
"cuidador" sólo aparece en un rótulo de resumen (`liquidaciones.html:655`, *"Incentivo
cuidadores"*). El vocabulario del sistema y el del hipódromo no coinciden — eso es decisión
de producto, no un bug.

## 3 · ¿Distingue ya al propietario? — **No. Hace falta tocar el render**

Las 41 líneas de propietario de R8 ya existen (30 premio + 11 bono) y son pagables. Pero:

- su `concepto` de premio es **idéntico** al del entrenador — ver la tabla de §1;
- el recibo **no trae** `beneficiario_tipo` ni `descripcion`, así que no tiene con qué
  separarlas;
- el encabezado no imprime `cobBenef.tipo`.

**Un recibo de propietario emitido hoy sale sin una sola marca de que es de propietario.** Lo
único que lo delata es el monto (70% vs 10%), y eso hay que saberlo de memoria.

El bono sí se distingue por casualidad: su `concepto` dice `Bono 6° puesto`. Los 30 de premio,
que son la plata grande, no.

---

## Qué habría que cambiar — propuesta, sin codear

Tres cambios, de menor a mayor.

### A · Rotular al beneficiario en el encabezado *(1 línea)*

```js
<p><strong>Beneficiario:</strong> ${cobBenef?.nombre||'—'} — ${ROL_LABEL[cobBenef?.tipo]||''}</p>
```

El dato ya está en memoria, no hace falta ninguna consulta. Con un mapa de rótulos en
castellano de hipódromo, a confirmar con Fede y Valeria:

```js
const ROL_LABEL = { propietario:'Propietario', profesional:'Cuidador', club:'Club' };
```

⚠️ `profesional` cubre **entrenador y jockey**: `beneficiario_tipo` no los separa. Para
distinguirlos hay que mirar `profesionales.tipo` del beneficiario —está en el mapa
`profesionales[id]` que la página ya tiene cargado—, y aun así queda el caso `ambos` (1
persona en Dolores).

### B · Traer el rol y mostrarlo por línea *(el que resuelve el reclamo)*

Agregar dos columnas al `SELECT` de la línea 927:

```diff
-  .select('concepto,monto_neto,posicion,reunion_id,inscripcion_id')
+  .select('concepto,descripcion,concepto_tipo,monto_neto,posicion,reunion_id,inscripcion_id')
```

y derivar el rótulo de la fila desde `concepto_tipo` —`premio` → el rol sale de
`descripcion`; `bono`, `incentivo_*` y `actuacion` ya se explican solos—, ya sea como columna
nueva "Rol"/"Clase" o como sufijo del concepto.

Es la opción que hace que dos recibos del mismo caballo y puesto dejen de ser idénticos.

### C · Separar el sub-reparto *(sólo si la foto lo confirma)*

Si el problema real es que el recibo del cuidador mezcla lo propio con lo que redistribuye,
agrupar la tabla en dos bloques con subtotal: **"Le corresponde"** vs **"A redistribuir"**,
usando `concepto_tipo='actuacion'` como discriminante. Hoy no hay líneas así en reuniones
reales, así que **no lo tocaría hasta ver el caso**.

## Antes de codear, dos cosas

1. **La foto del recibo de Valeria.** Determina si esto es A+B o si además hace falta C.
2. **Los rótulos, con Fede:** ¿"Cuidador" o "Entrenador"? ¿Jockey aparte? El sistema dice
   "Entrenadores" en todos lados y el hipódromo dice "cuidador"; conviene elegir uno y usarlo
   parejo en recibo, módulo y resumen, no sólo parchear el recibo.

**No se escribió una línea de código. La base no se tocó: 3 SELECT de sólo lectura.**
