# Cotejo R6 (20/06/2026) — planilla oficial vs base

**Read-only. Nada ejecutado, cero UPDATE.** Medición del 14/08/2026.

- Proyecto: `unlhcuanfrtpatoipwve` (Dolores prod) · club `0649e9c5-9e87-4aad-842f-101458e6b33c`
- R6 = `b02ca761-6f44-4720-86aa-a3c3099019ea` · nº interno 6 · nº público 6 · estado `borrador`
- Guard: `pwd` = `/home/clio/dev/SGH` ✅ · `spcs` = **183** ✅
- Reproducible: `set -a && . ./.env && set +a && node tests/diag_cotejo_r6.mjs`
- Input: `tmp/R6 resultados planilla.json` (8 carreras, 81 filas)

**Motivo:** Fede reporta que los resultados de R6 "se ven mal". Hipótesis a descartar:
que la grilla vieja de `resultados.html`, que ordenaba por `numero_turno` y repetía el 4 y
el 7, haya hecho cargar los resultados de una carrera en otra.

---

## Titular

**No hay carreras cruzadas.** El orden de llegada, los mandiles, los SPC, los "NC" y los
jockeys de las 8 carreras coinciden **al 100 %** con la planilla. La hipótesis del cruce
queda descartada con datos, no por inspección visual.

Lo que sí hay son **6 diferencias ALTA y 15 MEDIA**, ninguna de orden de llegada. Una sola
mueve plata de una persona a otra: el cuidador de **WISLA KEN**, que ganó la carrera 6.

---

## PASO 0 — identificación de la reunión

11 turnos, de los cuales **3 anuladas** (turnos 4, 7 y 10: sin nombre, sin
`numero_carrera_programa`, 0 ratificados, 0 resultados) y **8 activas**. Los 8 premios de la
planilla matchean sus 8 carreras, con distancia, hora, oficialidad y cantidad de ratificados
idénticas:

| planilla | turno | prog | premio | dist | ratif DB | filas planilla |
|---|---|---|---|---|---|---|
| 1° | 1 | 1 | MARTIN MIGUEL DE GÜEMES | 1000 | 10 | 10 |
| 2° | 2 | 2 | DIA DEL PERIODISTA | 1000 | 8 | 8 |
| 3° | 3 | 3 | RADIO MAX DOLORES | 1000 | 7 | 7 |
| 4° | **8** | 4 | DIA DE LA BANDERA | 1000 | 12 | 12 |
| 5° | **11** | 5 | ESPECIAL MANUEL BELGRANO | 1000 | 6 | 6 |
| 6° | **6** | 6 | MUNDIAL 2026 | 1100 | 15 | 15 |
| 7° | **9** | 7 | DIA DEL PADRE | 1100 | 13 | 13 |
| 8° | **5** | 8 | MODO INVIERNO | 1300 | 10 | 10 |

Los 8 resultados están en estado **`oficial`**.

---

## PASO 2 — ¿hay dos carreras cruzadas?

Respuesta corta: **no.**

La grilla vieja mostraba, ordenando por `numero_turno` y cayendo al turno cuando
`numero_carrera_programa` es NULL:

```
1, 2, 3, 4, 8, 6, 7, 4, 7, 10, 5
                    ↑        ↑
```

| nº repetido | turnos que lo comparten | estado |
|---|---|---|
| **4** | turno 4 · turno 8 | anulada / abierta |
| **7** | turno 7 · turno 9 | anulada / abierta |

**Las dos colisiones son contra una carrera anulada.** Los turnos 4, 7 y 10 tienen 0
ratificados y 0 filas en `resultados` — no hay nada cargado ahí que pudiera haberse cruzado,
y tampoco falta nada en las carreras reales. Si el operador hubiera elegido la fila
equivocada del selector, el marcador le habría aparecido vacío.

Chequeo adicional, más fuerte que el de los pares: se comparó la **firma completa del orden
de llegada** (puesto → SPC) de cada carrera de la planilla contra la de **todas** las
carreras de la base. Ninguna carrera de la planilla aparece cargada en otra carrera de la
base. Tampoco el swap 5↔8, que era el candidato natural (turno 5 = programa 8 y
turno 11 = programa 5).

**Lo que Fede ve "mal" no es un cruce de resultados.** Es, casi con seguridad, la propia
grilla: `1,2,3,4,8,6,7,4,7,10,5` con números repetidos y fuera de orden se lee como si los
resultados estuvieran en la carrera equivocada, aunque los datos estén bien.

---

## PASO 3 — diferencias

### Severidad ALTA (afecta liquidación)

| # | carrera | campo | planilla | base | comentario |
|---|---|---|---|---|---|
| 1 | **C6** MUNDIAL 2026 | cuidador de WISLA KEN (1°) | SAN MARTIN **SERGIO** | SAN MARTIN **ERNESTO HUGO** | **son dos personas distintas.** Mueve $113.000 — ver PASO 4 |
| 2 | **C1** GÜEMES | cuidador de TIRSO (8°) | MALENA GUSTAVO | *(sin entrenador)* | `entrenador_id` NULL. Bloquea $10.000 |
| 3 | **C8** MODO INVIERNO | cuidador de VITO LO CAPO (NC) | VEGA ROLANDO | *(sin entrenador)* | no corrió → $0. VEGA ROLANDO **no existe** en `profesionales` |
| 4 | **C8** MODO INVIERNO | peso de LATIN RAIN (NC) | 57 | 55 | no corrió → $0 |
| 5 | **C3** RADIO MAX | SPC del mandil 7 | TALENTOSA **CACH** | TALENTOSA **CATCH** | typo de la planilla; la base está bien. NC → $0 |
| 6 | **C2** PERIODISTA | cuidador de CALAVERIANDO (1°) | **IA**PRAGUIRRE RICARDO | **IP**ARAGUIRRE RICARDO | typo de la planilla; la misma planilla lo escribe bien en C7. $0 |

De las 6, **sólo las dos primeras son errores de la base.** Las otras cuatro son typos de la
planilla o datos de caballos que no largaron.

### Severidad MEDIA (dividendos y tiempos)

**Tiempos: los 8 coinciden.** No hay ni una diferencia de tiempo.

Dividendos que no cuadran — todos parecen errores de transcripción de un dígito al cargar:

| carrera | apuesta / caballo | planilla | base | delta |
|---|---|---|---|---|
| C1 | sport de ARMOÑOZO (7°) | 17,00 | **7,00** | falta el 1 |
| C4 | sport de GRILLADA RYE (7°) | 37,50 | **31,50** | 7 → 1 |
| C6 | EXACTA 14/5 | 29.376,00 | **20.376,00** | 9 → 0 |
| C3 | TRIFECTA 6/2/4 | 6.652,80 | **6.652,40** | 8 → 4 |
| C2 | IMPERFECTA 5/1 | 398,80 | **398,60** | 8 → 6 |
| C2 | DOBLE 5-6-8/5 | 511,20 | **511,00** | centavos |

Los otros 64 dividendos coinciden exactamente.

**`resultado_apuestas.composicion` está vacía en las 8 carreras** (0 de 70 filas). La
planilla trae la combinación de cada apuesta (`6/3`, `5/1/3`, `5-6-8/5`…) y la base no la
guarda. Hoy la UI la deriva del marcador, así que no se ve el faltante — pero es información
oficial de la planilla que no está persistida. R6 es la única reunión con `resultado_apuestas`
cargadas, así que no se puede saber todavía si es un hueco de R6 o de siempre.

Además: **VITO LO CAPO no tiene caballeriza** (`caballeriza_id` NULL). La planilla dice
EL PALOMAR, que **no existe** entre las caballerizas de Dolores.

### Carreras que cuadran salvo lo listado

- **C5** ESPECIAL MANUEL BELGRANO y **C7** DIA DEL PADRE: **cuadran 100 %** en orden, mandil,
  SPC, NC, jockey, peso, cuidador, tiempo y dividendos. Su única observación es la
  composición vacía, que es transversal a las 8.

---

## PASO 4 — impacto en plata

R6 tiene **79 liquidaciones · 203 líneas de detalle · $7.438.067,84 bruto**.
Ninguna está pagada: todas en `borrador`, sin `numero_recibo` ni `pagado_at`.

### ▸ El único desvío que manda plata a la persona equivocada: WISLA KEN

WISLA KEN ganó la carrera 6 (bolsa $1.030.000). La base le asigna como entrenador a
**SAN MARTIN ERNESTO HUGO** (DNI [DNI REDACTADO]); la planilla dice **SAN MARTIN SERGIO**. Los dos
existen en `profesionales`, los dos son entrenadores con patente DOL:

| | apellido y nombre | DNI |
|---|---|---|
| en la base | SAN MARTIN ERNESTO HUGO | [DNI REDACTADO] |
| en la planilla | SAN MARTIN SERGIO SEBASTIAN | [DNI REDACTADO] |

Líneas afectadas — **son la liquidación completa de SAN MARTIN ERNESTO HUGO en R6**
(`d6f51991-954e-4932-866c-0f58a4f9f782`, total $113.000):

| concepto | monto | estado_linea |
|---|---|---|
| Carrera 6 — 1° puesto — Entrenador | **$103.000,00** | `retenido` |
| Incentivo entrenador por caballo corrido | **$10.000,00** | `impago` |
| **total** | **$113.000,00** | |

SAN MARTIN SERGIO SEBASTIAN **no tiene ninguna liquidación en R6**.

**Dato que decide:** en **R8 (16/08) WISLA KEN está inscripto con SAN MARTIN SERGIO
SEBASTIAN**, misma caballeriza EL COLORADO, en las tres inscripciones. R6 es la única donde
figura ERNESTO HUGO. Sumado a que la planilla oficial de Yesi dice SERGIO, lo más probable
es que **la base esté mal en R6** y que los dos SAN MARTIN se hayan confundido al cargar.

Corregirlo es una línea (`inscripciones.entrenador_id`) + regenerar la liquidación de esa
carrera. **No lo ejecuté.** Conviene que Fede confirme cuál de los dos SAN MARTIN entrenaba
a WISLA KEN el 20/06 antes de tocar nada — es una pregunta de una línea y hay $113.000
atrás.

### ▸ TIRSO: $10.000 que no se generaron

TIRSO llegó 8° en la carrera 1 y es **el único caballo del top-8 de toda la reunión con cero
líneas de liquidación**. Los otros 55 tienen al menos una.

La causa es `entrenador_id` NULL: sin entrenador no se genera la línea de
**incentivo entrenador ($10.000)**. La planilla dice **MALENA GUSTAVO**, que **sí existe** en
`profesionales` (DNI [DNI REDACTADO], entrenador) — o sea que el arreglo es asignable, no hay que
dar de alta a nadie.

Comparación con sus pares de 8° puesto:

| carrera | 8° puesto | entrenador | propietario | líneas | bruto |
|---|---|---|---|---|---|
| C1 | **TIRSO** | **NULL** | NULL | **0** | **$0** |
| C4 | MI ILUSION | ok | ok | 2 | $110.000 |
| C6 | LUMIN | ok | NULL | 1 | $10.000 |
| C7 | BUEN DURAZNO | ok | NULL | 1 | $10.000 |

TIRSO también tiene `propietario_id` NULL, lo que le bloquea además el **bono 6°-8° de
$100.000** — pero eso **no es un hallazgo de este cotejo**: es el hueco de propietarios
conocido, que en R6 alcanza a **41 de los 58 caballos que corrieron** (39 de ellos dentro de
los 8 primeros puestos). El delta imputable a la diferencia planilla-vs-base de TIRSO es
sólo el incentivo: **$10.000**.

### ▸ Resumen del impacto

| concepto | monto | a quién |
|---|---|---|
| mal atribuido (WISLA KEN) | **$113.000** | de SAN MARTIN SERGIO SEBASTIAN a SAN MARTIN ERNESTO HUGO |
| no generado (TIRSO) | **$10.000** | MALENA GUSTAVO |
| **total en juego** | **$123.000** | sobre $7.438.067,84 = **1,65 %** |

Nada de esto está pagado, así que se corrige sin revertir cobros.

**Los dividendos NO afectan la liquidación.** Los seis desvíos de la sección MEDIA son pagos
del tote a los apostadores, no premios de la bolsa: se publican mal, pero no mueven ni un
peso de las 203 líneas.

---

## Lo que este doc NO hace

- No corrige el entrenador de WISLA KEN ni el de TIRSO.
- No regenera ninguna liquidación.
- No toca dividendos, composiciones ni caballerizas.
- No decide cuál de los dos SAN MARTIN es el correcto — eso es de Fede.

## Pendientes que salen de acá

1. **Fede:** ¿quién entrenaba a WISLA KEN el 20/06, ERNESTO HUGO o SERGIO SEBASTIAN? ($113.000)
2. Asignar MALENA GUSTAVO como entrenador de TIRSO en R6 y regenerar la carrera 1 ($10.000).
3. Revisar los 6 dividendos de la tabla MEDIA contra la planilla del tote.
4. Dar de alta la caballeriza **EL PALOMAR** y el entrenador **VEGA ROLANDO**, y asignárselos
   a VITO LO CAPO.
5. Decidir si `resultado_apuestas.composicion` se carga desde la planilla o se sigue
   derivando del marcador.
6. **Ninguna de estas es un cruce de carreras** — la grilla vieja no dañó los datos de R6.
