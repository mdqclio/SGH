# fix · rótulo del rol en el recibo de Pagos

Branch `fix/recibo-rotulo-rol`, salido de `main` en `2da36d6`. **No mergeado.**
Diagnóstico previo: `docs/RECIBO_ROTULO_ROL_DIAGNOSTICO.md`
(`chore/propietarios-provisorios-r8`, `8089398`).

**Qué arregla:** el recibo no traía el dato del rol. El premio del propietario y el del
entrenador, para el mismo caballo y el mismo puesto, imprimían el mismo texto —
`Carrera 1 — 1° puesto`— y no se distinguían.

---

## El diff — un solo archivo, 21 líneas nuevas

### 1 · El SELECT ahora trae las tres columnas del rol

```diff
-  const { data: lns } = await sb.from('liquidacion_detalle')
-    .select('concepto,monto_neto,posicion,reunion_id,inscripcion_id').eq('recibo_id',recibo.id);
+  const { data: lns, error: eLns } = await sb.from('liquidacion_detalle')
+    .select('concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id').eq('recibo_id',recibo.id);
+  if (eLns) console.error('[imprimirReciboCobro/lineas]', eLns);
```

*(El `console.error` va por lo mismo que en el fix anterior: era otro `error` descartado
sin capturar.)*

### 2 · La función que deriva el rol

```js
// Rol del beneficiario en cada línea del recibo. El dato ya existía en la base y el recibo
// no lo traía: para 'premio' viene dentro de `descripcion` ("… — Propietario (bolsa: …)"),
// y para el resto lo define `concepto_tipo`. Sin esto, el premio del propietario y el del
// entrenador imprimen el mismo texto (mismo caballo, mismo puesto) y no se distinguen.
const ROL_POR_BENEFICIARIO = { propietario:'Propietario', profesional:'Profesional', club:'Club' };
function rolDeLinea(l){
  if (l.concepto_tipo === 'bono') return 'Propietario';
  if (l.concepto_tipo === 'incentivo_entrenador') return 'Entrenador';
  if (l.concepto_tipo === 'incentivo_jockey') return 'Jockey';
  const m = /—\s*(Propietario|Entrenador|Jockey)\b/.exec(l.descripcion || '');
  if (m) return m[1];
  return ROL_POR_BENEFICIARIO[l.beneficiario_tipo] || '';
}
```

No inventa vocabulario: **usa las palabras que el motor ya escribe** en `descripcion`
(`liquidaciones-engine.js:186-202`). El `ROL_POR_BENEFICIARIO` es sólo la red de contención
para una línea futura que no encaje en ninguno de los casos — hoy no hay ninguna.

### 3 · La columna y el encabezado

```diff
-    return `<tr><td>${fecha}</td><td>${carrera}</td><td>${caballo}</td><td>${puesto}</td><td>${l.concepto||''}</td>…
+    return `<tr><td>${fecha}</td><td>${carrera}</td><td>${caballo}</td><td>${puesto}</td><td>${rolDeLinea(l)||'—'}</td><td>${l.concepto||''}</td>…

-    <p><strong>Beneficiario:</strong> ${cobBenef?.nombre||'—'}</p>
+    <p><strong>Beneficiario:</strong> ${cobBenef?.nombre||'—'}${rolesLineas.length?` — <strong>${rolesLineas.join(' / ')}</strong>`:''}</p>

-      <thead><tr><th>Fecha</th><th>Carrera</th><th>Caballo</th><th>Puesto</th><th>Concepto</th><th>Neto</th></tr></thead>
+      <thead><tr><th>Fecha</th><th>Carrera</th><th>Caballo</th><th>Puesto</th><th>Rol</th><th>Concepto</th><th>Neto</th></tr></thead>
```

El rol del encabezado **se deriva de las líneas del propio recibo**, no de `cobBenef.tipo`:
así un profesional sale como `Entrenador` o `Jockey`, no como el genérico `profesional`, y
el caso `ambos` —1 persona en Dolores— sale correcto sin lógica aparte.

---

## Lo que NO se tocó, como pediste

| | estado |
|---|---|
| Sub-reparto peón / capataz / sereno | **intacto.** No se agrupó, ni se separó, ni se rotuló distinto. Las líneas `actuacion` caen en el `ROL_POR_BENEFICIARIO` genérico. No hay ninguna en R6 ni en R8. |
| Vocabulario entrenador/cuidador | **intacto.** Se imprime `Entrenador`, que es lo que ya decían `descripcion` y el módulo. Cuando Fede decida, se cambia en un solo lugar. |
| Cálculo y montos | **intacto.** No se tocó `liquidaciones-engine.js`, ni `cobrosEmitir`, ni la RPC `emitir_recibo`, ni una sola cuenta. El diff sólo agrega columnas al `SELECT` y texto al HTML. |
| Base de datos | **intacta.** Cero DDL, cero DML. |

---

## Verificación

`node tests/probe_recibo_rol.mjs` → **19/19 OK**. Real-code: extrae `rolDeLinea` del propio
`liquidaciones.html` y la corre contra las 199 líneas reales de R8.

```
✅ a) el SELECT del recibo trae descripcion / concepto_tipo / beneficiario_tipo
✅ b) la tabla tiene columna Rol · el encabezado imprime el rol · cada fila imprime el rol
✅ c) premio → Entrenador, Jockey, Propietario   (derivados de descripcion)
✅ c) bono → Propietario · incentivo_entrenador → Entrenador · incentivo_jockey → Jockey
✅ c) fondo_solidario → Club
✅ c) ninguna línea de R8 queda sin rol          → 0 sin rol de 199
✅ d) ANTES las dos filas imprimían el mismo texto → "Carrera 1 — 1° puesto"
✅ d) AHORA se distinguen  → Propietario | Carrera 1 — 1° puesto
                             vs   Jockey | Carrera 1 — 1° puesto
```

**Sensibilidad:** contra la versión de `main` el probe ni siquiera arranca —
`ReferenceError: rolDeLinea is not defined`—, porque la función no existe. No puede pasar
por casualidad.

### Los dos recibos, con datos reales de R8

Renderizado con la función real sobre las líneas que hoy tiene la base:

**Recibo de propietario**

> **Beneficiario:** LA MILINGA — **Propietario**

| Caballo | Puesto | Rol | Concepto | Neto |
|---|---|---|---|---|
| ASTUTO NOTES | 7° | **Propietario** | Carrera 1 — Bono 7° puesto | $100.000,00 |
| HEART OF GOLD | 4° | **Propietario** | Carrera 6 — 4° puesto | $77.000,00 |
| Icy Tom | 8° | **Propietario** | Carrera 5 — Bono 8° puesto | $100.000,00 |

**Recibo de entrenador**

> **Beneficiario:** VARELA, LORENA SOLEDAD — **Entrenador**

| Caballo | Puesto | Rol | Concepto | Neto |
|---|---|---|---|---|
| WILSON SECURITY | 3° | **Entrenador** | Carrera 1 — 3° puesto | $12.200,00 |
| LA GRAN TEMPESTAD | 4° | **Entrenador** | Carrera 2 — 4° puesto | $10.500,00 |
| MAC VITAL | 5° | **Entrenador** | Carrera 7 — 5° puesto | $10.000,00 |
| MAC VITAL | — | **Entrenador** | Incentivo entrenador | $10.000,00 |
| LA GRAN TEMPESTAD | — | **Entrenador** | Incentivo entrenador | $10.000,00 |
| WILSON SECURITY | — | **Entrenador** | Incentivo entrenador | $10.000,00 |

Se distinguen en el encabezado y en cada renglón, sin leer los montos.

---

## Alcance y despliegue

- Un solo archivo de producción: `liquidaciones.html` (**+21 / −5**). Más el probe nuevo y su
  registro en `tests/README.md`.
- **Sin cambios en la base.** Frontend puro.
- **No mergeado**: branch pusheado, esperando revisión.
- Riesgo: bajo. El único camino tocado es el armado del HTML del print; si `descripcion`
  viniera vacía, `rolDeLinea` cae al genérico por `beneficiario_tipo` y el recibo sale igual
  que antes más una columna con `—`.

## Pendiente, no bloqueante

Sigue en pie lo del diagnóstico: **pedirle a Valeria la foto del recibo** con
`"Clase: Cuidador-Peon"`. Ese string no lo genera SGH —la palabra `Clase` no existe en el
repo— y sirve para saber si además hay que separar el sub-reparto, que es el punto que acá se
dejó explícitamente afuera.
