# Pendiente (lunes) — que el motor guarde el rol en un campo propio

**Anotado, sin tocar nada.** No es urgente: **degrada, no rompe.**

## El problema

`rolDeLinea()` (`liquidaciones.html`, mergeado en `4f6437c`) saca el rol de las líneas de
premio con un regex sobre `descripcion`:

```js
const m = /—\s*(Propietario|Entrenador|Jockey)\b/.exec(l.descripcion || '');
if (m) return m[1];
return ROL_POR_BENEFICIARIO[l.beneficiario_tipo] || '';
```

El texto lo escribe el motor (`liquidaciones-engine.js:186-202`):

```js
descripcion: `${conceptoBase} — Propietario (bolsa: ${bolsaFmt})`
descripcion: `${conceptoBase} — Entrenador (bolsa: ${bolsaFmt})`
descripcion: `${conceptoBase} — Jockey (bolsa: ${bolsaFmt})`
```

**El rol es un dato estructural viajando dentro de un string de presentación.** Si alguien
cambia ese texto —traducirlo, sacarle la bolsa, poner "Cuidador" cuando Fede decida el
vocabulario— el regex deja de matchear y el recibo imprime **"Profesional"** en vez de
"Entrenador" o "Jockey".

Los otros casos no dependen del regex: `bono`, `incentivo_entrenador` e `incentivo_jockey`
salen de `concepto_tipo`, que es una columna de verdad. **El acoplamiento frágil es sólo el
de las líneas de premio** — que son las más numerosas y las de mayor monto.

## Por qué no es urgente

Cae al genérico por `beneficiario_tipo`, que **siempre existe**. El recibo sigue saliendo,
con la plata correcta, y con la columna Rol diciendo "Profesional". Se pierde precisión, no
se rompe la emisión ni se altera un monto.

Ojo con la trampa: **la degradación es silenciosa.** Nadie se entera hasta que alguien mira
un recibo impreso y nota que dice "Profesional". El `probe_recibo_rol.mjs` sí lo detecta —el
check *"los premios de profesional se rotulan Entrenador o Jockey"* falla—, así que **si se
corre el probe después de tocar el motor, salta.** Vale dejarlo anotado en el propio motor.

## La solución que corresponde

Una columna `rol` en `liquidacion_detalle`, que el motor llene al construir la línea:

```js
addActor(insc.entrenador_id, 'entrenador', {
  …, rol: 'entrenador',      // ← estructural, no derivado del texto
});
```

y `rolDeLinea()` pasa a leerla, con el regex como fallback para las líneas viejas.

Requiere:

1. Migración: `ALTER TABLE liquidacion_detalle ADD COLUMN rol varchar` — nullable, sin
   default, para no tocar las 467 líneas existentes.
2. `liquidaciones-engine.js`: llenar el campo en `addActor` y en `detalleRows`.
3. `liquidaciones.html`: `rolDeLinea()` prioriza `l.rol`; el regex queda de respaldo mientras
   convivan líneas sin la columna.
4. Recalcular las reuniones para poblar lo viejo — o dejar que el fallback las cubra, que es
   suficiente.

Sin urgencia y sin riesgo de plata: el campo es descriptivo, no entra en ningún cálculo.

## Enganche con lo otro

Cuando Fede defina **"Cuidador" vs "Entrenador"**, este cambio conviene hacerlo **antes**: con
el rol en un campo propio, cambiar el rótulo es tocar un mapa de presentación en un solo
lugar. Con el regex, cambiar el texto del motor rompe el matcheo y hay que acordarse de
ajustar las dos puntas a la vez. **Ése es el momento natural para tomarlo.**
