# Plan — Reunión de prueba 9998 (Fede + Yesi, ensayo pre-R8)

**Estado: PLAN APROBADO (13/08). Nada ejecutado todavía.** Ni un INSERT, ni un
UPDATE, ni DDL. Las decisiones tomadas están en §8.

> ### ⚠️ LEER PRIMERO — §9: R8 liquida sin el 70 % del propietario en 49 de 67 caballos
>
> La medición sobre R8 (pedida antes de ejecutar la 9998) confirma el peor caso:
> **49 de 67 ratificados (73 %) no tienen `propietario_id`**, dos carreras enteras
> no tienen ninguno, y **~$8,6 M de $12,1 M** de masa de propietarios no se va a
> emitir el domingo, en silencio. Esto es más urgente que la reunión de prueba.
> **Es reparable antes del domingo.** Ver §9.

- Proyecto Supabase: `unlhcuanfrtpatoipwve` (Dolores prod).
- `club_id` Dolores: `0649e9c5-9e87-4aad-842f-101458e6b33c`
- Guard de sesión verificado: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` = **183**.

## Objetivo

Fede quiere simular el resultado de una carrera y ver cómo liquida, para llegar
entrenado al domingo. Yesi necesita practicar el circuito de pagos. No se puede
hacer sobre **R8** (`7b6e003e-22e2-4629-bf55-f18560b1260f`, 16/08/2026), que es la
reunión real de este domingo.

---

## 1. Relevamiento previo (read-only, ya ejecutado)

### Reuniones con `numero >= 9990`

| numero | id | fecha | estado | carreras | insc | resultados | posiciones | liq (headers) | liq_detalle |
|---|---|---|---|---|---|---|---|---|---|
| 9999 | `a0000000-0000-0000-0000-000000009999` | 2099-01-01 | cancelada | 3 | 17 | 3 | 17 | 10 | 76 |

**No existe la 9998 ni ninguna otra descartable.** El rango 9990–9998 está libre.

### Estado de la 9999 (fixture de Diego) — intacta, NO se toca

- 3 carreras (`c0000000-…-0001/0002/0003`), turnos 1–3, con 6 + 6 + 5 inscripciones,
  **todas en estado `ratificado`**.
- Los 3 resultados en estado `oficial`; 17 filas en `resultado_posiciones`.
- 10 headers en `liquidaciones`, 76 filas en `liquidacion_detalle`, de las cuales
  4 tienen `recibo_id`.
- 2 recibos fixture: `e9000000-…-9001` y `e9000000-…-9002`, numerados 9001 y 9002.
- `club_secuencias` de Dolores: `tipo='recibo'`, `ultimo_numero = 0`.

Es decir: **el fixture numeró sus recibos a mano y nunca consumió la secuencia.**
Los recibos 9001/9002 son los únicos 2 recibos de Dolores en prod, y la secuencia
real sigue en 0 — el primer recibo real del domingo sería el **1**.

### Configuración de liquidación vigente (`liquidacion_config`, activa)

| pct_propietario | pct_entrenador | pct_jockey | pct_peon | pct_capataz | pct_sereno | fondo_solidario | inc. jockey | inc. entrenador | días antidoping |
|---|---|---|---|---|---|---|---|---|---|
| **70 %** | 10 % | 10 % | 4 % | 3 % | 1 % | 2 % | $50.000 | $10.000 | 30 |

`comision_config` activas para Dolores: **0 filas**. Consecuencia: en el motor,
`descPct = 0` → no se generan descuentos de comisión. No rompe nada, pero la
columna "Descuentos" va a salir en cero. Vale igual para R8 el domingo: es el
estado real de la config, no un artefacto de la prueba.

---

## 2. Fecha: 2098-01-01 (corregido)

La propuesta inicial era 2026-08-14. **Descartada.** `active-reunion.js` resuelve
la reunión activa así:

```js
function findClosest(reuniones) {
  const today = new Date().toISOString().slice(0,10);
  const validas  = (reuniones||[]).filter(r => r.estado !== 'anulada' && r.fecha);
  const upcoming = validas.filter(r => r.fecha >= today).sort((a,b) => a.fecha.localeCompare(b.fecha));
  if (upcoming.length) return upcoming[0].id;      // ← la MÁS PRÓXIMA hacia adelante
  ...
}
```

Una reunión fechada el 14/08 sería la próxima antes que R8 (16/08), y en cualquier
browser sin `localStorage.sgh_active_reunion_id` seteado — máquina nueva, sesión
limpia, incógnito — `resolve()` caería en `findClosest()` y activaría la de prueba.
Yesi podría operar el domingo sobre la reunión equivocada sin notarlo.

Con **2098-01-01** queda al final de la lista y nunca gana el `findClosest()`.
Se elige 2098 y no 2099 para no confundirla visualmente con la 9999 de Diego.

---

## 3. Fuente del clon: R6, turnos 1 / 6 / 11

Fuente: **R6** = `b02ca761-6f44-4720-86aa-a3c3099019ea`, 20/06/2026, estado
`borrador`, 11 carreras, 81 ratificados, **8 resultados oficiales**, 79 headers de
liquidación. Es la única reunión real del sistema con el ciclo completo cerrado
(inscripción → ratificación → resultado oficial → liquidación). **Cero lecturas
sobre R8.**

### Por qué esos tres turnos

| turno R6 | nombre | id | ratif | c/propietario | c/entrenador | c/jockey | bolsa_total | `distribucion_premios` |
|---|---|---|---|---|---|---|---|---|
| 1 | MARTIN MIGUEL DE GÜEMES | `ea034989-d262-458a-85a6-134b0a6454b1` | 10 | 3 | 9 | 9 | $2.000.000 | 60/19/12/6/3 · **bono_ganador 250k** · ganancia_mínima 100k · bono 6-8 100k |
| 6 | MUNDIAL 2026 | `770deb70-36cd-4a4e-8782-a49f2e2a34a2` | 15 | 4 | 15 | 13 | $1.300.000 | idem, **con bono_ganador** |
| 11 | ESPECIAL MANUEL BELGRANO | `80c4fdcd-a03e-452a-82d3-ea3e56087ff5` | 6 | 3 | 6 | 6 | $4.000.000 | 60/19/12/6/3 · **sin bono_ganador** · ganancia_mínima 100k · bono 6-8 100k |

Los tres se eligieron por características concretas, no por ser los primeros:

1. **Tamaño de campo escalonado: 6 / 10 / 15.**
   - El de 6 permite cargar un marcador completo en menos de un minuto: es el que
     Fede va a usar para el primer intento sin frustrarse.
   - El de 15 es el caso duro del marcador — supera los 12 cajones que tiene
     Dolores por defecto, obliga a scrollear la grilla y es donde aparecieron
     históricamente los bugs de mandil (Bug 2, `sportCells`/`mfCells` iterando
     `1..rowCount` en lugar de los mandiles reales). Si algo se rompe el domingo,
     se rompe en una carrera así.
   - El de 10 es el tamaño mediano típico.

2. **Cobertura del bono 6-8.** Los tres tienen `bono_posicion_desde:6`,
   `bono_posicion_hasta:8`, `bono_posicion_monto:100000`. Sólo el turno 6 (15
   caballos) tiene realmente puestos 6°, 7° y 8° con caballos suficientes para
   ver el bono dispararse tres veces. En el de 6 caballos el bono nunca se paga
   (no hay 6° puesto). Ese contraste es deliberado: muestra que el bono depende
   del tamaño del campo, que es exactamente la duda que suele aparecer.

3. **Con y sin `bono_ganador`.** Turnos 1 y 6 tienen `bono_ganador: 250000`, que el
   motor **funde dentro del premio del 1°** (`calcPremio`: `p += bono_ganador`), y
   por lo tanto se reparte 70/10/10 como cualquier premio. El turno 11 no lo
   tiene. Poner ambos casos lado a lado deja ver que el bono del ganador NO es una
   línea aparte, mientras que el bono 6-8 SÍ lo es (línea `concepto_tipo='bono'`,
   **100 % al propietario**, sin reparto). Es la distinción que más se presta a
   confusión al leer un recibo.

4. **`ganancia_minima` de 100.000 en los tres.** Con la bolsa de $4.000.000 del
   turno 11, el 5° puesto paga 3 % = $120.000 (por encima del piso). Con la bolsa
   de $1.300.000 del turno 6, el 5° paga 3 % = $39.000 → **el piso lo levanta a
   $100.000**. El piso se activa en una carrera y no en la otra. Fede ve la regla
   funcionando, no la lee en un manual.

5. **Mejor cobertura de propietario disponible.** 10 de 31 ratificados tienen
   propietario resoluble. No hay ningún trío de carreras de R6 con cobertura
   sustancialmente mejor. Ver sección 5 — es el punto flojo del plan y hay que
   decidirlo explícitamente.

6. **Retención anti-doping.** El motor marca `estado_linea='retenido'` para
   `concepto_tipo='premio'` en posiciones **1° y 2°**, con
   `fecha_liberacion = fecha_reunión + 30 días`. Con fecha 2098-01-01, la
   liberación cae en **2098-01-31**: siempre futura, nunca se auto-libera. Yesi
   está obligada a practicar la liberación manual con el RPC `liberar_linea`,
   que es justo el paso nuevo de la v1.1 y el que menos manejan. Efecto lateral
   deseable de la fecha futurista.

Totales del clon: **3 carreras, 31 inscripciones ratificadas.**

---

## 4. Los inserts

Todos con UUIDs determinísticos, para que el teardown sea un match exacto y no un
JOIN que pueda arrastrar filas ajenas:

| entidad | UUID |
|---|---|
| reunión | `a0000000-0000-0000-0000-000000009998` |
| carreras | `c9980000-0000-0000-0000-00000000000{1,2,3}` |
| inscripciones | generadas por `uuid_generate_v4()`, alcanzables sólo vía `carrera_id` |

### 4.1 `reuniones` — 1 fila

```sql
INSERT INTO reuniones (id, club_id, hipodromo_id, numero, numero_publico, fecha,
                       tipo, estado, observaciones)
SELECT 'a0000000-0000-0000-0000-000000009998',
       club_id, hipodromo_id,
       9998,          -- marcador de descartable, mismo criterio que la 9999
       NULL,          -- numero_publico NULL: no ensucia la numeración pública
       '2098-01-01',
       'oficial'::tipo_reunion,
       'borrador'::estado_reunion,
       'PRUEBA FEDE/YESI — DESCARTABLE — borrar con migrations/teardown_prueba_9998.sql'
FROM reuniones WHERE id = 'b02ca761-6f44-4720-86aa-a3c3099019ea';
```

`estado='borrador'` es lo mismo que tienen R6 y R8; `resultados.html` carga sin
problema con ese estado.

### 4.2 `carreras` — 3 filas

```sql
INSERT INTO carreras (id, reunion_id, numero_turno, numero_carrera_programa, nombre,
                      categoria_id, tipo_pista, distancia_metros,
                      edad_minima_anos, edad_maxima_anos, condicion_sexo,
                      condicion_handicap, condicion_adicional,
                      bolsa_total, bolsa_bonos, distribucion_premios,
                      cupo_maximo, estado, apuestas, apuestas_notas)
SELECT
  ('c9980000-0000-0000-0000-00000000000' || nuevo.turno)::uuid,
  'a0000000-0000-0000-0000-000000009998',
  nuevo.turno, nuevo.turno, c.nombre,
  c.categoria_id, c.tipo_pista, c.distancia_metros,
  c.edad_minima_anos, c.edad_maxima_anos, c.condicion_sexo,
  c.condicion_handicap, c.condicion_adicional,
  c.bolsa_total, c.bolsa_bonos, c.distribucion_premios,
  c.cupo_maximo, 'programada', c.apuestas, c.apuestas_notas
FROM (VALUES
  ('ea034989-d262-458a-85a6-134b0a6454b1'::uuid, 1),
  ('770deb70-36cd-4a4e-8782-a49f2e2a34a2'::uuid, 2),
  ('80c4fdcd-a03e-452a-82d3-ea3e56087ff5'::uuid, 3)
) AS nuevo(src_id, turno)
JOIN carreras c ON c.id = nuevo.src_id;
```

Se renumeran los turnos a 1/2/3 y se setea `numero_carrera_programa` igual, porque
el motor usa `numero_carrera_programa ?? numero_turno` para armar el texto
`"Carrera N — X° puesto"` que sale impreso en el recibo.

### 4.3 `carrera_apuestas`

```sql
INSERT INTO carrera_apuestas (carrera_id, ...)
SELECT ('c9980000-0000-0000-0000-00000000000' || nuevo.turno)::uuid, ...
FROM carrera_apuestas ca JOIN (VALUES ...) AS nuevo(src_id, turno) ON ca.carrera_id = nuevo.src_id;
```

Si los turnos origen no tienen filas (hay que verificarlo en el momento; R6 turno 1
guarda las apuestas como texto libre en `carreras.apuestas`, que ya se copia arriba),
se dan de alta a mano las 7 habituales: GAN, SEG, TER, EX, IM, TR, X2. Sin esto el
panel de dividendos de `resultados.html` sale vacío y Fede no puede practicar la
carga de dividendos, que es la mitad de lo que quiere probar.

### 4.4 `inscripciones` — 31 filas

```sql
INSERT INTO inscripciones (carrera_id, spc_id, caballeriza_id,
                           entrenador_id, jockey_titular_id, jockey_suplente_id,
                           numero_partidor, peso_declarado, peso_final,
                           estado, canal, peon, capataz, sereno, certificado_correr)
SELECT ('c9980000-0000-0000-0000-00000000000' || nuevo.turno)::uuid,
       i.spc_id, i.caballeriza_id,
       i.entrenador_id, i.jockey_titular_id, i.jockey_suplente_id,
       i.numero_partidor, i.peso_declarado, i.peso_final,
       'ratificado'::estado_inscripcion, 'manual'::canal_inscripcion,
       i.peon, i.capataz, i.sereno, i.certificado_correr
FROM inscripciones i
JOIN (VALUES
  ('ea034989-d262-458a-85a6-134b0a6454b1'::uuid, 1),
  ('770deb70-36cd-4a4e-8782-a49f2e2a34a2'::uuid, 2),
  ('80c4fdcd-a03e-452a-82d3-ea3e56087ff5'::uuid, 3)
) AS nuevo(src_id, turno) ON i.carrera_id = nuevo.src_id
WHERE i.estado = 'ratificado';
```

Cero datos inventados: mismos SPC, mismos entrenadores, mismos jockeys, mismas
caballerizas, mismos pesos, mismas gateras que corrieron de verdad en junio.

Notar que **`propietario_id` no se copia en el SELECT**: el trigger
`trg_insc_set_propietario` es `BEFORE INSERT OR UPDATE OF caballeriza_id` y lo
pisa igual, derivándolo de `caballeriza_responsables`. Se verificó que para estas
31 filas el valor almacenado y el derivable coinciden exactamente (los mismos 10),
así que el trigger no pierde información respecto del origen. Ver sección 5.

### 4.5 Lo que NO se inserta

**Ni resultados ni liquidaciones.** La gracia del ejercicio es que Fede cargue el
marcador en `resultados.html` y apriete F10 (→ RPC `aplicar_resultado`), y que al
oficializar se dispare `liquidaciones-engine.js` solo. Ése es literalmente el
camino de producción del domingo. Precargarlos convertiría la prueba en una
demo de lectura.

**Total del seed: 1 + 3 + ~21 + 31 ≈ 56 filas.** Ningún UPDATE fuera de la 9998.

---

## 5. Los 21 sin propietario — qué rompe exactamente

**Números medidos, no estimados.** De los 31 ratificados clonados:

| | cantidad |
|---|---|
| con `propietario_id` resoluble | **10** |
| sin `propietario_id` | **21** |
| de esos 21, con alguna fila en `caballeriza_responsables` | **0** |
| de esos 21, con fila de responsable que tenga `propietario_id` no nulo | **0** |

Desglose por carrera: turno 1 → 3 de 10 · turno 6 → 4 de 15 · turno 11 → 3 de 6.

(En un conteo intermedio anoté 11 con propietario; el número correcto es **10**.
Verificado fila por fila: `propietario_id` almacenado y derivable coinciden en las
10, no hay ninguna con valor almacenado huérfano.)

No hay fuente de backfill disponible: `spc_propietarios` tiene **0 filas**, y la
tabla `spcs` no tiene columna de propietario (sólo `caballeriza_id`). Es el
GOTCHA #47 en estado puro.

### Qué hace el motor cuando `propietario_id` es NULL

En `liquidaciones-engine.js`:

```js
const addActor = (id, tipo, item) => {
  if (!id) return;                       // ← sale sin hacer nada
  ...
};
...
addActor(insc.propietario_id, 'propietario', { premio: premioEfectivo, pct: PCTS.propietario, ... });
```

**No tira error. No loguea. No deja rastro.** Simplemente no se emite la línea.
Consecuencias concretas para un caballo sin propietario que entre en puestos
pagadores:

- **No se genera la línea del 70 %** (`concepto_tipo='premio'`, beneficiario
  propietario). Ese dinero no aparece en ningún lado: no se redistribuye, no queda
  en un bucket "sin asignar", no se acumula en el club. Desaparece del recibo.
- **No se genera la línea del bono 6-8** (`concepto_tipo='bono'`, 100 % propietario).
  Misma desaparición.
- **Sí se generan** las líneas del entrenador (10 %), del jockey (10 %), las subs
  de peón/capataz/sereno si esos campos de texto están cargados, y el fondo
  solidario del club (2 %) — el fondo se calcula sobre el premio y se asigna a
  `beneficiario_tipo='club'` con `beneficiario_id = clubId`, no depende del
  propietario.
- **No se crea header en `liquidaciones`** para ese propietario, con lo cual no
  aparece en el buscador de Pagos y Yesi no tiene a quién pagarle.

O sea: la liquidación **queda internamente consistente pero incompleta**, y la
incompletitud es silenciosa. Es exactamente el modo de falla más difícil de
detectar mirando la pantalla.

### El riesgo práctico, cuantificado

El 70 % es la parte que Fede quiere ver. Si el caballo que él elige como ganador
está entre los 21, la carrera liquida **sin la línea principal** y la prueba no
sirve para lo que la pidió. La probabilidad de que eso pase por azar en cada
puesto pagador es ~68 % (21/31). Con 3 carreras y ~5 puestos pagadores por
carrera, es prácticamente seguro que va a toparse con el caso varias veces.

### Opciones — descripción, sin recomendación

**Opción 1 — dejar los 21 en NULL.**
Refleja el estado real de la base. Fede ve el domingo simulado tal cual va a ser:
si el caballo ganador de R8 no tiene propietario cargado, el recibo va a salir sin
el 70 % y eso va a pasar de verdad. Contra: si el ganador que elige cae entre los
21, la prueba no muestra lo que él quería ver, y puede leerlo como "el sistema no
calcula el 70 %" en lugar de "faltan datos de propietario". Riesgo de diagnóstico
equivocado sobre software que funciona bien. Cero escrituras extra.

**Opción 2 — backfill de `propietario_id` sólo en las 31 filas clonadas.**
Un `UPDATE inscripciones SET propietario_id = <uuid> WHERE carrera_id IN (las 3 de
la 9998)`, asignando propietarios reales de la tabla `propietarios` (hay 213
cargados para Dolores) a los 21 que están en NULL. El trigger es
`BEFORE UPDATE OF caballeriza_id`, así que un UPDATE que toca sólo `propietario_id`
**no se dispara** y el valor persiste. Toca exclusivamente filas de la 9998; no
modifica `caballerizas`, ni `caballeriza_responsables`, ni las inscripciones de R6
ni de R8. A favor: los 3 turnos liquidan completos, cualquier ganador que Fede
elija muestra el 70 %, y la mecánica de reparto queda demostrada de punta a punta.
Contra: la asignación caballo↔propietario es **ficticia** — el nombre que salga en
el recibo de prueba no es el dueño real de ese caballo. Si Fede o Yesi sacan una
captura y la comparten como si fuera real, es información incorrecta circulando.
Mitigación posible: usar propietarios reales pero avisar por escrito que los
vínculos son de prueba, o crear 2-3 propietarios con nombre explícito tipo
"PRUEBA — PROPIETARIO A" (que después habría que borrar en el teardown, agregando
un paso).

**Opción 3 — mixta: backfill sólo en el turno de 6 caballos (turno 11 de R6).**
Se completan los 3 que faltan de esa carrera y las otras dos quedan como están.
Fede tiene una carrera "limpia" donde el 70 % se ve siempre, y dos carreras
"realistas" que muestran el hueco de datos. A favor: cubre los dos objetivos sin
elegir uno. Contra: es la opción que más hay que explicar antes de que la usen; si
no se explica, la inconsistencia entre carreras confunde más que las otras dos.

**Opción 4 — arreglar los datos de verdad, cargando los responsables faltantes en
`caballeriza_responsables`.**
Es el backfill que el sistema necesita igual, y beneficiaría a R8 el domingo.
Contra: son 21 caballerizas sin ningún responsable cargado, requiere el dato real
de quién es el dueño de cada una (no lo tenemos), y **escribe sobre tablas de
producción compartidas** — deja de ser una prueba descartable. Fuera de alcance
para esto; queda anotado como la deuda de fondo.

Decisión pendiente. No la tomo yo.

---

## 6. Recibos — qué es la opción A y contra qué se eligió

**Restricción no negociable: `club_secuencias` no se toca. Ninguna de las opciones
propuestas la modifica, salvo la C, que se lista sólo para descartarla.**

### El problema

Si Yesi prueba emitir un recibo, el RPC `emitir_recibo` llama a
`fn_siguiente_recibo(p_club_id)`, que **incrementa `club_secuencias.ultimo_numero`**
para Dolores. Hoy está en 0. Cada recibo de prueba quema un número. Si emite 3, el
primer recibo real del domingo sería el **4**, no el 1.

Esto es un efecto del RPC, no del plan: pasa apenas se aprieta el botón, y ningún
teardown puede "devolver" el número sin escribir en `club_secuencias`.

### Opción A — dejar que emitan, y anular los recibos en el teardown

```sql
UPDATE recibos SET estado = 'anulado', anulado_at = now()
WHERE id IN (SELECT DISTINCT recibo_id FROM liquidacion_detalle
             WHERE reunion_id = 'a0000000-0000-0000-0000-000000009998'
               AND recibo_id IS NOT NULL);
```

Las filas de `recibos` **no se borran**: quedan como recibos anulados. El número
consumido queda consumido y la numeración del domingo arranca donde haya quedado.

- `club_secuencias`: **intacta**, nunca se escribe.
- Yesi practica el circuito completo, incluido `emitir_recibo`, que es el paso
  que menos maneja.
- El salto de numeración con recibos anulados de por medio es **exactamente lo
  que pasa en la vida real** cuando se anula un recibo: la secuencia no retrocede,
  y queda el rastro de por qué falta ese número. Un auditor que pregunte "¿dónde
  está el recibo 2?" encuentra la fila anulada, no un agujero.
- Costo: la numeración real del domingo no arranca en 1. Hay que avisarlo. Si eso
  es inaceptable por algún motivo contable, la opción A no sirve.

### Opción B — pedirles que no toquen el botón de emitir

- `club_secuencias`: intacta, trivialmente.
- Costo: Yesi no practica emisión de recibos, que es la mitad de su trabajo del
  domingo y la parte más nueva del sistema (Fase 4 v1.1, RPC `liberar_linea` +
  pagable sólo impago). Se prueba todo menos lo que hace falta probar.
- Además es frágil: depende de que nadie apriete un botón que está ahí, visible,
  en la pantalla que están usando.

### Opción C — borrar los recibos y bajar `ultimo_numero` a 0

- **Viola la restricción explícita: escribe en `club_secuencias`.**
- Se lista sólo para dejar constancia de que se evaluó y se descartó por eso, no
  por criterio técnico.
- Riesgo adicional aunque estuviera permitida: si por cualquier motivo quedara un
  recibo real emitido entre medio, bajar el contador provocaría una colisión de
  `numero_recibo` en el próximo INSERT.

### Opción D — que emitan contra otro club

Emitir los recibos de prueba con el `club_id` de otro hipódromo, para que consuma
la secuencia de ése y no la de Dolores.

- `club_secuencias` de Dolores: intacta.
- Costo: `emitir_recibo` valida coherencia entre `p_club_id` y las líneas; forzarlo
  implicaría clonar la reunión bajo otro club, lo que cambia todo el plan y mete
  datos de prueba en el tenant de otro hipódromo. Peor que el problema que resuelve.

**Elegida: A**, porque es la única que deja practicar el circuito completo sin
escribir en `club_secuencias`, y porque el residuo que deja (salto de numeración
con recibos anulados) es un estado que el sistema ya sabe representar y que se
explica solo. Queda sujeta a tu confirmación de que el salto de numeración es
aceptable.

---

## 7. Teardown

Va versionado como `migrations/teardown_prueba_9998.sql`.

### Por qué el orden importa

Hay 8 FKs con `ON DELETE NO ACTION` apuntando a la cadena de la reunión. Un
`DELETE FROM reuniones` a secas no alcanza:

| tabla hija | columna | tabla padre | delete_rule |
|---|---|---|---|
| `liquidacion_detalle` | `reunion_id` | `reuniones` | **NO ACTION** |
| `liquidaciones` | `reunion_id` | `reuniones` | **NO ACTION** |
| `resoluciones` | `reunion_id` | `reuniones` | **NO ACTION** |
| `liquidacion_detalle` | `carrera_id` | `carreras` | **NO ACTION** |
| `performances` | `carrera_id` | `carreras` | **NO ACTION** |
| `novedades_reunion` | `carrera_id` | `carreras` | **NO ACTION** |
| `liquidacion_detalle` | `inscripcion_id` | `inscripciones` | **NO ACTION** |
| `resultado_posiciones` | `inscripcion_id` | `inscripciones` | **NO ACTION** |
| `liquidacion_detalle` | `recibo_id` | `recibos` | **NO ACTION** |
| `carreras` | `reunion_id` | `reuniones` | CASCADE |
| `inscripciones` | `carrera_id` | `carreras` | CASCADE |
| `carrera_apuestas` | `carrera_id` | `carreras` | CASCADE |
| `resultados` | `carrera_id` | `carreras` | CASCADE |
| `resultado_posiciones` | `resultado_id` | `resultados` | CASCADE |
| `resultado_apuestas` | `resultado_id` | `resultados` | CASCADE |
| `resultado_log` | `resultado_id` | `resultados` | CASCADE |
| `novedades_reunion` | `reunion_id` | `reuniones` | CASCADE |

El caso venenoso: borrar `carreras` cascadea a `inscripciones` **y** a `resultados`.
`resultado_posiciones` cascadea desde `resultados`, pero tiene además una FK
`NO ACTION` contra `inscripciones`. Las restricciones `NO ACTION` no diferidas se
chequean por fila dentro del mismo statement, así que el resultado depende del
orden interno del cascade y puede fallar de forma no determinística. Por eso el
script borra todo explícitamente, de hoja a raíz, y no confía en el CASCADE.

### El script

```sql
-- migrations/teardown_prueba_9998.sql
-- Borra la reunión de prueba 9998. NO toca club_secuencias. NO toca la 9999.
BEGIN;

\set rid 'a0000000-0000-0000-0000-000000009998'

-- 0. Recibos de prueba: se ANULAN, no se borran (opción A). club_secuencias intacta.
UPDATE recibos SET estado = 'anulado', anulado_at = now()
WHERE id IN (SELECT DISTINCT recibo_id FROM liquidacion_detalle
             WHERE reunion_id = 'a0000000-0000-0000-0000-000000009998'
               AND recibo_id IS NOT NULL);

-- 1. Liquidaciones: detalle antes que header.
DELETE FROM liquidacion_detalle WHERE reunion_id = 'a0000000-0000-0000-0000-000000009998';
DELETE FROM liquidaciones       WHERE reunion_id = 'a0000000-0000-0000-0000-000000009998';

-- 2. Resultados: posiciones antes que header (apuestas y log caen por CASCADE).
DELETE FROM resultado_posiciones WHERE resultado_id IN (
  SELECT r.id FROM resultados r JOIN carreras c ON c.id = r.carrera_id
  WHERE c.reunion_id = 'a0000000-0000-0000-0000-000000009998');
DELETE FROM resultados WHERE carrera_id IN (
  SELECT id FROM carreras WHERE reunion_id = 'a0000000-0000-0000-0000-000000009998');

-- 3. Satélites con FK NO ACTION.
DELETE FROM performances      WHERE carrera_id IN (
  SELECT id FROM carreras WHERE reunion_id = 'a0000000-0000-0000-0000-000000009998');
DELETE FROM novedades_reunion WHERE reunion_id = 'a0000000-0000-0000-0000-000000009998';
DELETE FROM resoluciones      WHERE reunion_id = 'a0000000-0000-0000-0000-000000009998';

-- 4. Inscripciones, apuestas, carreras, reunión.
DELETE FROM inscripciones    WHERE carrera_id IN (
  SELECT id FROM carreras WHERE reunion_id = 'a0000000-0000-0000-0000-000000009998');
DELETE FROM carrera_apuestas WHERE carrera_id IN (
  SELECT id FROM carreras WHERE reunion_id = 'a0000000-0000-0000-0000-000000009998');
DELETE FROM carreras         WHERE reunion_id = 'a0000000-0000-0000-0000-000000009998';
DELETE FROM reuniones        WHERE id = 'a0000000-0000-0000-0000-000000009998';

COMMIT;
```

### Lo que el teardown NO toca, a propósito

- **`club_secuencias`** — jamás se escribe. Requisito no negociable, cumplido.
- **`spcs`, `propietarios`, `profesionales`, `jockeys`, `caballerizas`,
  `caballeriza_responsables`** — el clon sólo los referencia; nunca los modifica
  (con la salvedad de la opción 2/3 de la sección 5, que si se aprueba escribe
  únicamente en `inscripciones` de la 9998, nunca en esas tablas).
- **La reunión 9999 y sus recibos 9001/9002** — fuera del alcance de todos los
  predicados: los `WHERE` filtran por el UUID `…9998`, que no matchea nada del
  fixture.
- **R8 `7b6e003e-22e2-4629-bf55-f18560b1260f`** — no aparece en ningún statement
  del plan, ni de lectura ni de escritura.
- **R6 `b02ca761-…`** — sólo se lee, en los `INSERT … SELECT`.

### Residuo conocido: `auditoria`

Los triggers `trg_audit_reuniones`, `trg_audit_carreras`, `trg_audit_inscripciones`,
`trg_audit_resultados` y `trg_audit_liquidaciones` van a dejar filas en `auditoria`
apuntando a IDs que después dejan de existir. **No es un huérfano relacional** (no
hay FK), es un log histórico.

Se puede agregar un paso 5 opcional:

```sql
DELETE FROM auditoria WHERE registro_id IN (...ids de la 9998...);
```

pero no se incluye por defecto: borrar registros de auditoría para tapar el rastro
de una operación es peor práctica que dejar las entradas de una reunión de prueba
correctamente identificada. Se deja a criterio tuyo.

### Verificación post-teardown

```sql
-- (a) Cero filas de la 9998 en toda la cadena
SELECT 'reuniones' t, count(*) n FROM reuniones WHERE id='a0000000-0000-0000-0000-000000009998'
UNION ALL SELECT 'carreras', count(*) FROM carreras WHERE reunion_id='a0000000-0000-0000-0000-000000009998'
UNION ALL SELECT 'inscripciones', count(*) FROM inscripciones i
  WHERE i.carrera_id IN (SELECT id FROM carreras WHERE reunion_id='a0000000-0000-0000-0000-000000009998')
UNION ALL SELECT 'liquidaciones', count(*) FROM liquidaciones WHERE reunion_id='a0000000-0000-0000-0000-000000009998'
UNION ALL SELECT 'liquidacion_detalle', count(*) FROM liquidacion_detalle WHERE reunion_id='a0000000-0000-0000-0000-000000009998'
UNION ALL SELECT 'resoluciones', count(*) FROM resoluciones WHERE reunion_id='a0000000-0000-0000-0000-000000009998'
UNION ALL SELECT 'novedades_reunion', count(*) FROM novedades_reunion WHERE reunion_id='a0000000-0000-0000-0000-000000009998';
-- Esperado: 7 filas, todas con n = 0.

-- (b) club_secuencias sin cambios respecto del valor anotado antes de la prueba
SELECT club_id, tipo, ultimo_numero FROM club_secuencias
WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c';
-- Esperado: el mismo ultimo_numero que quedó al terminar la prueba
--           (0 si nadie emitió recibos; N si emitieron N). NUNCA modificado por el teardown.

-- (c) La 9999 idéntica al relevamiento inicial
SELECT (SELECT count(*) FROM carreras WHERE reunion_id='a0000000-0000-0000-0000-000000009999') carreras,
       (SELECT count(*) FROM inscripciones i JOIN carreras c ON c.id=i.carrera_id
        WHERE c.reunion_id='a0000000-0000-0000-0000-000000009999') insc,
       (SELECT count(*) FROM resultados r JOIN carreras c ON c.id=r.carrera_id
        WHERE c.reunion_id='a0000000-0000-0000-0000-000000009999') resultados,
       (SELECT count(*) FROM liquidaciones WHERE reunion_id='a0000000-0000-0000-0000-000000009999') liq,
       (SELECT count(*) FROM liquidacion_detalle WHERE reunion_id='a0000000-0000-0000-0000-000000009999') det;
-- Esperado exacto: 3 | 17 | 3 | 10 | 76

-- (d) R8 sin tocar
SELECT (SELECT count(*) FROM carreras WHERE reunion_id='7b6e003e-22e2-4629-bf55-f18560b1260f') carreras,
       (SELECT count(*) FROM inscripciones i JOIN carreras c ON c.id=i.carrera_id
        WHERE c.reunion_id='7b6e003e-22e2-4629-bf55-f18560b1260f' AND i.estado='ratificado') ratif;
-- Esperado exacto: 12 | 67

-- (e) R6 sin tocar
SELECT (SELECT count(*) FROM carreras WHERE reunion_id='b02ca761-6f44-4720-86aa-a3c3099019ea') carreras,
       (SELECT count(*) FROM inscripciones i JOIN carreras c ON c.id=i.carrera_id
        WHERE c.reunion_id='b02ca761-6f44-4720-86aa-a3c3099019ea' AND i.estado='ratificado') ratif,
       (SELECT count(*) FROM liquidaciones WHERE reunion_id='b02ca761-6f44-4720-86aa-a3c3099019ea') liq;
-- Esperado exacto: 11 | 81 | 79

-- (f) spcs sin cambios — el guard de siempre
SELECT count(*) FROM spcs;   -- Esperado: 183
```

---

## 8. Decisiones — estado

### Aprobadas (13/08)

| # | Decisión | Resultado |
|---|---|---|
| 1 | Turnos fuente | **R6 turnos 1 / 6 / 11** |
| 2 | Fecha | **2098-01-01**, numero **9998** |
| 3 | Recibos | **Opción A** — anular, no borrar. `club_secuencias` no se toca. Proyección del contador en §10.1 |
| 4 | Propietarios | **Opción 2 con propietarios ad-hoc**: crear "PRUEBA — PROPIETARIO A/B/C", no usar propietarios reales. Borrado incluido en el teardown. Detalle en §10.2 |

### Abiertas

5. **Nueva, surgida del cruce de las decisiones 3 y 4.** `recibos.propietario_id`
   tiene FK `NO ACTION` contra `propietarios`. Si Yesi emite un recibo a un
   propietario PRUEBA, la opción A conserva esa fila de `recibos` y entonces el
   propietario PRUEBA **no se puede borrar**. Tres salidas en §10.3 — hay que
   elegir una.
6. **§4.3** — confirmar el alta de las 7 apuestas por defecto si los turnos origen
   no traen filas en `carrera_apuestas`.
7. **§7** — si el paso opcional de limpieza de `auditoria` va o no va.
8. **§9** — qué se hace con los 49 de R8 antes del domingo. Es la decisión con
   plata real encima.

**Nada se ejecuta hasta tu OK explícito.**

---

## 9. ⚠️ HALLAZGO — R8 (16/08/2026) liquida sin el 70 % en 49 de 67 caballos

Medición read-only sobre `7b6e003e-22e2-4629-bf55-f18560b1260f`, pedida antes de
ejecutar la 9998. **Confirma la sospecha, y es peor que en R6.**

### 9.1 El número

| | R8 | R6 (referencia) |
|---|---|---|
| ratificados | **67** | 31 (los 3 turnos clonados) |
| con `propietario_id` resoluble | **18 (27 %)** | 10 (32 %) |
| **sin `propietario_id`** | **49 (73 %)** | 21 (68 %) |
| sin `caballeriza_id` | 0 | 0 |
| propietarios distintos que cobrarían | **17** | — |

Las 8 carreras del programa están todas afectadas.

### 9.2 Desglose por carrera del programa

| N° prog | turno | carrera | bolsa | ratif | c/prop | **s/prop** |
|---|---|---|---|---|---|---|
| 1 | 2 | PACHAMAMA | $1.016.667 | 10 | 3 | 7 |
| 2 | 12 | GRAL JOSÉ DE SAN MARTIN | $1.750.000 | 7 | **0** | **7** |
| 3 | 4 | DIA DEL VETERINARIO | $1.000.000 | 12 | 2 | 10 |
| 4 | 5 | DIA DEL FOLKLORE | $1.166.667 | 8 | 4 | 4 |
| 5 | 10 | DÍA DEL NIÑO | $3.333.333 | 8 | 3 | 5 |
| 6 | 11 | ANIV- DOLORES PRIMER PUEBLO PATRIO | $1.833.333 | 8 | 4 | 4 |
| 7 | 3 | FUERZA AÉREA ARGENTINA | $1.118.333 | 6 | 2 | 4 |
| 8 | 8 | SANTA ROSA | $1.191.667 | 8 | **0** | **8** |

**Las carreras 2 y 8 no tienen un solo propietario cargado.** Gane quien gane,
liquidan con **cero** líneas de propietario. No es probabilístico: es seguro.

### 9.3 Dónde se corta la cadena — exactamente

El motor deriva el propietario así (trigger `trg_insc_set_propietario`):

```
inscripciones.caballeriza_id → caballeriza_responsables (rol='propietario', activo=true) → propietario_id
```

De los 49 sin propietario:

| eslabón donde se corta | casos |
|---|---|
| `inscripciones.caballeriza_id` en NULL | **0** |
| **la caballeriza no tiene NINGUNA fila en `caballeriza_responsables`** | **49** |
| tiene filas pero ninguna con `rol='propietario'` | 0 |
| tiene rol propietario pero `activo=false` | 0 |
| tiene la fila correcta pero con `propietario_id` NULL | 0 |

**El 100 % del problema está en un solo eslabón y es el primero.** No hay roles
mal cargados, ni bajas mal hechas, ni datos a medio migrar: hay 40 caballerizas
que sencillamente **nunca tuvieron cargado su responsable**.

De las **57 caballerizas** distintas que corren en R8, sólo **17** tienen
propietario activo. **Faltan 40.**

Esto es una buena noticia operativa: es un solo tipo de alta, en una sola pantalla
(`caballerizas.html` → responsables), 40 veces. No hay que tocar código ni migrar
nada.

### 9.4 La plata en juego

Masa que le corresponde a los propietarios en R8 = 70 % de los premios (puestos
1° a 5°, con `bono_ganador` ya fundido en el 1° y el piso de `ganancia_minima`
aplicado) **más** el 100 % del bono 6-8:

| N° prog | premios 1°-5° | bono 6-8 | **masa propietario** |
|---|---|---|---|
| 1 | $1.375.167 | $300.000 | $1.262.617 |
| 2 | $1.797.500 | $200.000 | $1.458.250 |
| 3 | $1.360.000 | $300.000 | $1.252.000 |
| 4 | $1.511.667 | $300.000 | $1.358.167 |
| 5 | $3.333.333 | $300.000 | $2.633.333 |
| 6 | $1.878.333 | $300.000 | $1.614.833 |
| 7 | $1.467.683 | $100.000 | $1.127.378 |
| 8 | $1.534.417 | $300.000 | $1.374.092 |
| **total** | | | **$12.080.670** |

Pérdida **segura** (carreras 2 y 8, sin ningún propietario cargado):
$1.458.250 + $1.374.092 = **$2.832.342**.

Pérdida **esperada** si el resto se reparte proporcionalmente a los ratificados
sin propietario de cada carrera: **≈ $8.643.425** de los $12.080.670, o sea
**~71 %** de la masa de propietarios.

*(La pérdida esperada asume que cualquier caballo tiene la misma chance de entrar
en puestos pagadores. No es una predicción del resultado; es el orden de magnitud.)*

### 9.5 Por qué Valeria no lo va a detectar

Repitiendo lo de §5, ahora con R8 encima:

- `addActor()` hace `if (!id) return;` — **no error, no warning, no log**.
- La liquidación queda **internamente consistente**: los totales cierran, el
  entrenador (10 %), el jockey (10 %) y el fondo solidario (2 %) se emiten bien.
  Nada se ve roto.
- El propietario ausente **no genera header en `liquidaciones`**, así que no
  aparece en el buscador de Pagos. No hay una fila en cero para notar: no hay fila.
- El Resumen de Fase 5 muestra buckets por estado y pendientes por beneficiario —
  pero sólo de los beneficiarios que **existen**. Un propietario que nunca se
  generó no figura en ningún pendiente.

La única señal visible es indirecta: la suma de lo liquidado va a dar bastante
menos que la bolsa repartida. Hay que estar buscándola para verla.

### 9.6 Opciones antes del domingo

**Opción I — cargar los 40 responsables faltantes en `caballerizas.html`.**
Es el arreglo real. Requiere el dato de quién es el dueño de cada caballeriza, que
lo tiene la secretaría, no nosotros. 40 altas. Beneficia a R8 y a todas las
reuniones siguientes. Es trabajo de datos, no de código, y se puede repartir entre
varias personas. Lista de las 40 en §9.7.

**Opción II — cargar sólo las de las carreras 2 y 8** (las que hoy liquidan con
cero propietarios). Son 15 caballos, ~15 caballerizas. Elimina la pérdida
**segura** de $2,83 M y deja el resto expuesto al azar del resultado. Menos trabajo,
cubre el peor caso.

**Opción III — no tocar nada y liquidar el domingo como está.** Después se corrigen
los datos y se recalcula: el motor es **paid-safe** e idempotente — preserva las
líneas ya pagadas y regenera el resto. Es decir, la corrección posterior **sí
funciona**, siempre que no se le haya pagado a nadie todavía por esas carreras.
El riesgo es el orden de los hechos: si Yesi paga primero y se corrigen los datos
después, las líneas de propietario aparecen recién en el recálculo y hay que pagar
en una segunda vuelta, con la gente ya en la ventanilla.

**Opción IV — avisar y no liquidar hasta tener los datos.** Se corre el resultado
el domingo pero no se oficializa hasta completar los responsables. Bloquea el pago
del día.

**Recomendación:** la **I** si la secretaría llega con los datos; la **II** como
piso mínimo. La III es aceptable únicamente si se acuerda **no pagar** premios de
las carreras 2 y 8 hasta recalcular.

Esta decisión es de Fede y Valeria, no técnica. Lo que sí es técnico y está
confirmado: **el motor calcula bien; lo que falta son datos de responsables.**

### 9.7 Las 40 caballerizas sin responsable (lista de trabajo)

Ordenadas por cantidad de caballos en R8, para atacar primero las que más pesan:

| caballeriza | caballos | ejemplares en R8 |
|---|---|---|
| LA MILINGA | 3 | ASTUTO NOTES, HEART OF GOLD, Icy Tom |
| CRAZY HORSE | 2 | EL GRAN HECTOR, GRILLADA RYE |
| EL NIETO | 2 | CHE CARABANERA, LOGUACIOUS |
| LOS CATACHOS | 2 | MARUKA PLUS, QUINIELA TREND |
| LOS MELLI | 2 | BOHEMIO TOP, SEÑOR MONCHI |
| MELINA A | 2 | CHINITA SALTEÑA, YOOKY |
| NEGRO T | 2 | FLORENTINA IN YOU, RECUERDAME IN YOU |
| RD NECOCHEA | 2 | BAHIA ROMANA, LOCA DUBAI |
| ABUELO FLORO | 1 | IDALIA MARO |
| BETTY SANTI | 1 | MAC VITAL |
| DON BENICIO | 1 | TERRIBLE KING |
| DON GIOVANNI | 1 | DEVIL'S KING |
| DON RAUL | 1 | GLAM METAL |
| EL CHINGA | 1 | REINA ATREVIDA |
| EL COLORADO | 1 | WISLA KEN |
| EL DERBY | 1 | COLONIAL JOHAN |
| EL DESTINO | 1 | LE BATEAU |
| EL HORNERITO CAFE | 1 | ECHO IN THE SKY |
| EL LALO | 1 | GRAND VUELTERA |
| El linye y Rami | 1 | DE BELLOSO |
| EL PIMPO | 1 | BENDITO PRESAGIO |
| EL VETERANO | 1 | INFILTRADO SLEW |
| EMI | 1 | REINA EDITION |
| ESTAMPA DEL SUR | 1 | NORMANDO LU |
| FEDERICO Y MIGUEL | 1 | NELIDA RIM |
| LA MORALEJA | 1 | BACHUNA |
| LA PICHI | 1 | FALAYS |
| LAGUNA VERDE | 1 | SANTA LISA |
| LOS CUERVOS | 1 | DESTINADO JOHAN |
| LOS EDUCADITOS | 1 | LA GRAN TEMPESTAD |
| LOS MONCHITOS | 1 | IX GOAL TUN |
| LOS MORENITOS | 1 | SOY RICARDO |
| LOS URONES | 1 | DOCTOR SKY |
| LUNA ROJA | 1 | LIVIA DRUSA |
| MAR DEL TUYU | 1 | ABELITO MIMOSO |
| MARTIN Y NICOLAS | 1 | AMIGUITO JESUS |
| MI MARTINCITO | 1 | ESPLENDID CRAF |
| NUEVO MUNDO | 1 | TOUCH OF BLUE |
| SANTOS VEGA | 1 | WILSON SECURITY |
| TIAN Y ROMA | 1 | LE CHAT MIMOUS |

Query para regenerar esta lista en cualquier momento:

```sql
SELECT cab.nombre AS caballeriza, count(*) AS caballos_en_r8,
       string_agg(s.nombre, ', ' ORDER BY s.nombre) AS ejemplares
FROM inscripciones i
JOIN carreras c ON c.id = i.carrera_id
JOIN caballerizas cab ON cab.id = i.caballeriza_id
JOIN spcs s ON s.id = i.spc_id
WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
  AND i.estado = 'ratificado' AND i.propietario_id IS NULL
GROUP BY cab.id, cab.nombre ORDER BY count(*) DESC, cab.nombre;
```

Query de control para verificar el avance (baja de 49 a medida que se cargan):

```sql
SELECT count(*) FILTER (WHERE i.propietario_id IS NULL) AS faltantes,
       count(i.propietario_id) AS resueltos
FROM inscripciones i JOIN carreras c ON c.id = i.carrera_id
WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' AND i.estado = 'ratificado';
```

⚠️ Ojo: `trg_insc_set_propietario` es `BEFORE INSERT OR UPDATE OF caballeriza_id`.
Cargar el responsable en `caballerizas.html` **no re-dispara el trigger** sobre las
inscripciones ya existentes de R8. Después de completar los 40, hay que forzar la
re-derivación con un UPDATE no-op sobre `caballeriza_id` de los ratificados de R8:

```sql
-- Re-deriva propietario_id sin cambiar la caballeriza (dispara el trigger).
UPDATE inscripciones i SET caballeriza_id = i.caballeriza_id
WHERE i.estado = 'ratificado'
  AND i.carrera_id IN (SELECT id FROM carreras
                       WHERE reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f');
```

**Este UPDATE escribe sobre R8 y NO está aprobado.** Queda documentado como el paso
necesario, para ejecutarlo con OK explícito después de cargar los responsables.

---

## 10. Detalle operativo de las decisiones aprobadas

### 10.1 En cuánto queda `club_secuencias.ultimo_numero` (decisión 3)

**Valor actual: 0.** No hay una respuesta fija porque depende de cuántos recibos
emitan: `emitir_recibo` llama a `fn_siguiente_recibo(club_id)`, que incrementa el
contador **una vez por recibo emitido**, y ninguna se revierte.

**Fórmula: `ultimo_numero` final = cantidad de recibos que emitan durante la
prueba. El primer recibo real del domingo será ese número + 1.**

Cota superior si pagaran absolutamente a todos los beneficiarios de la 9998
(sería el peor caso, muy improbable en una práctica):

| beneficiarios en el clon | cantidad |
|---|---|
| entrenadores distintos | 29 |
| jockeys distintos | 17 |
| propietarios reales | 10 |
| propietarios PRUEBA a crear | 3 |
| club (fondo solidario) | 1 (no se paga por recibo) |
| **techo teórico de recibos** | **~59** |

Un recibo agrupa **todas** las líneas impagas de un mismo beneficiario, así que el
techo real es la cantidad de beneficiarios distintos, no de líneas.

**Recomendación concreta para avisarle a Yesi y a Valeria:** que emitan **2 o 3
recibos** — alcanza de sobra para practicar el circuito (buscar beneficiario →
liberar retención con `liberar_linea` → emitir → imprimir). Con eso
**`ultimo_numero` queda en 2 o 3, y el primer recibo real del domingo sale con el
número 3 o 4.**

El valor exacto se confirma en cualquier momento con:

```sql
SELECT ultimo_numero FROM club_secuencias
WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND tipo = 'recibo';
```

Conviene correrla **el sábado a la noche**, después de la práctica y antes del
domingo, y pasarles el número por escrito.

### 10.2 Propietarios de prueba ad-hoc (decisión 4)

Se crean 3 propietarios con UUID fijo y nombre inconfundible:

```sql
INSERT INTO propietarios (id, club_id, tipo, nombre, activo, notas) VALUES
 ('9de00000-0000-0000-0000-0000000000a1','0649e9c5-9e87-4aad-842f-101458e6b33c','fisica',
  'PRUEBA — PROPIETARIO A', true, 'Alta para la reunión de prueba 9998. Borrar con teardown_prueba_9998.sql'),
 ('9de00000-0000-0000-0000-0000000000a2','0649e9c5-9e87-4aad-842f-101458e6b33c','fisica',
  'PRUEBA — PROPIETARIO B', true, 'idem'),
 ('9de00000-0000-0000-0000-0000000000a3','0649e9c5-9e87-4aad-842f-101458e6b33c','fisica',
  'PRUEBA — PROPIETARIO C', true, 'idem');
```

*(`tipo` es NOT NULL — hay que confirmar los valores admitidos antes de ejecutar;
`'fisica'` es tentativo.)*

Se asignan a los 21 ratificados de la 9998 que quedan en NULL, repartidos A/B/C
para que se vea el agrupamiento por beneficiario en Pagos:

```sql
UPDATE inscripciones i
SET propietario_id = ('9de00000-0000-0000-0000-0000000000a'
    || (1 + (row_number() OVER (ORDER BY i.carrera_id, i.numero_partidor) - 1) % 3))::uuid
WHERE i.propietario_id IS NULL
  AND i.carrera_id IN ('c9980000-0000-0000-0000-000000000001',
                       'c9980000-0000-0000-0000-000000000002',
                       'c9980000-0000-0000-0000-000000000003');
```

*(Se reescribe con un CTE — `row_number()` no va directo en un SET. La idea es el
reparto round-robin A/B/C.)*

El trigger es `BEFORE UPDATE OF caballeriza_id`, así que un UPDATE que sólo toca
`propietario_id` **no se dispara** y el valor persiste. Sólo se escriben filas de
la 9998: nada de `caballerizas`, `caballeriza_responsables`, R6 ni R8.

Con esto los 3 turnos liquidan completos y cualquier ganador que Fede elija
muestra el 70 %.

Paso extra en el teardown:

```sql
-- después de borrar inscripciones y liquidaciones de la 9998
DELETE FROM propietarios WHERE id IN (
  '9de00000-0000-0000-0000-0000000000a1',
  '9de00000-0000-0000-0000-0000000000a2',
  '9de00000-0000-0000-0000-0000000000a3');
```

Y en la verificación:

```sql
SELECT count(*) FROM propietarios WHERE nombre LIKE 'PRUEBA — PROPIETARIO%';
-- Esperado: 0
```

### 10.3 ⚠️ Conflicto entre la decisión 3 y la 4 — hay que resolverlo

`recibos.propietario_id` tiene FK **`NO ACTION`** contra `propietarios`. La opción
A **conserva** las filas de `recibos` (las anula, no las borra). Entonces:

> Si Yesi emite aunque sea **un** recibo a "PRUEBA — PROPIETARIO A", ese recibo
> queda para siempre, y el `DELETE FROM propietarios` de §10.2 **falla con
> violación de FK**. No se puede cumplir "anular y conservar recibos" y "borrar los
> propietarios de prueba" al mismo tiempo.

Tres salidas:

**A-1 — borrar los recibos emitidos a propietarios PRUEBA** (sólo esos; los
emitidos a entrenadores y jockeys se anulan y se conservan). Cumple el borrado
total de los propietarios ficticios. Contra: rompe la lógica de "anular, no borrar"
justamente en las filas que consumieron números de secuencia, con lo cual queda un
salto de numeración **sin** fila que lo explique — que es exactamente lo que la
opción A quería evitar.

**A-2 — no borrar los propietarios PRUEBA: desactivarlos y renombrarlos.**

```sql
UPDATE propietarios
SET activo = false,
    nombre = nombre || ' (BAJA PRUEBA 9998)',
    notas  = 'Propietario ficticio de la reunión de prueba 9998. Conservado porque tiene recibos anulados asociados.'
WHERE id IN ('9de00000-…a1','9de00000-…a2','9de00000-…a3');
```

Quedan 3 filas inactivas en `propietarios` (que hoy tiene 220). No aparecen en los
selectores porque `activo=false`, y el rastro de los recibos anulados queda
completo y explicado. Contra: no es un borrado, quedan 3 filas de prueba en una
tabla de producción.

**A-3 — que Yesi practique la emisión sólo sobre beneficiarios profesionales**
(entrenadores y jockeys, que son reales y no se borran). Los propietarios PRUEBA
existen para que la liquidación **calcule** el 70 % y se vea en pantalla, pero
nunca reciben un recibo. Cumple las dos reglas sin excepción: los propietarios
PRUEBA se borran limpio y todos los recibos se conservan anulados. Contra: no se
practica el caso "pagarle a un propietario", que tiene una diferencia real respecto
de pagarle a un profesional (la retención anti-doping de 1° y 2° cae sobre líneas
de premio, y el propietario es quien más las tiene).

**Sin recomendación** — las tres son defendibles y la elección depende de qué te
importe más: dejar cero rastro (A-1), dejar la auditoría intacta (A-2), o no
tener que elegir (A-3, a costa de practicar menos). Decidilo y ajusto el script.
