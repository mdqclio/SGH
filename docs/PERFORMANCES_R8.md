# Performances en el programa — R8 (16/08/2026)

**Branch**: `feat/performances`
**Fecha**: 2026-08-12
**Pedido**: Yesi — que el programa imprima las 4 últimas performances que ella arma en sus Excel por carrera.
**Estado**: ✅ APLICADO (gate 2) y desplegado (gate 3) el 12/08/2026.

> **Post-aplicación**: 88 filas / 67 SPCs / 11 carreras, 6 DEBUTA — exactamente lo previsto.
> **67 ratificados en R8, 0 sin performance**: el mapa de Yesi coincide exactamente con el
> conjunto de ratificados, así que la columna del programa sale completa, 0 celdas en blanco.
> Las 18 filas en NULL son forfait/inscripto/mal_inscrito y no entran al programa.

---

## 1. Qué hay hoy (punto 1 — verificación previa)

La respuesta corta: **la columna del programa ya existe y ya está cableada. Lo que falta es el dato.**

| Cosa | Existe | Detalle |
|---|---|---|
| Columna "4 ULT. PERF." en `programa-oficial.html` | ✅ | header en `:419`, celda en `:389` |
| Ídem en `programa-oficial-color.html` | ✅ | header "4 ÚLT." en `:660`, celda en `:628` |
| `spcs.ult_performances` (text, nullable) | ✅ | es lo que leen las dos celdas de arriba |
| UI para editarla | ✅ | `spcs.html:246` — pero es del ABM de SPC, no de la inscripción |
| Campo de performance en `inscripciones` | ❌ | no existe |
| Tabla relacional `performances` | ✅ | ver §2 |

**El dato está vacío**: `spcs.ult_performances` está poblada en **0 de 179** SPCs. O sea, el programa del 16 imprimiría esa columna en blanco en las 80 líneas. El programa impreso de mayo la tenía llena porque se armó a mano, fuera del sistema.

## 2. La tabla `performances` no sirve para esto

Existe una tabla relacional `performances` (una fila por carrera corrida: `spc_id`, `fecha_carrera`, `hipodromo_sigla`, `posicion`, `distancia_metros`, `categoria_simbolo`…). La pobla sola `resultados.html` al oficializar (`:1509-1521`), y la consume `programa.html` para los chips de pantalla.

No alimenta el PDF, y no puede reemplazar el dato de Yesi: sólo tiene **carreras corridas en Dolores dentro del sistema**. Las performances del padrón traen corridas de otros hipódromos (códigos `S`, `L`, `P`, `T`, `Z`, `D`) y de antes de que existiera el SGH. Se quedan como están, sin tocar.

## 3. Decisión: por inscripción, no por SPC (punto 2)

Se agrega `inscripciones.performance` (text, nullable), como pidió el pedido. El argumento es correcto: el valor cambia después de cada reunión, y guardándolo en la inscripción el programa histórico queda fiel al papel que se imprimió ese día. Si viviera sólo en `spcs`, regenerar el programa de mayo en septiembre mostraría las performances de septiembre.

`spcs.ult_performances` **no se borra**: queda como fallback de lectura. El render es

```js
${i.performance || spc.ult_performances || ''}
```

así que una inscripción sin dato propio sigue cayendo al del SPC, y nada de lo que ya estaba se rompe.

## 4. Cruce del mapa contra R8 (punto 3)

| Métrica | Valor |
|---|---|
| Pares en el mapa de Yesi | **67** |
| SPCs distintos inscriptos en R8 (16/08) | 80 |
| Match por nombre normalizado | **67 / 67** ✅ |
| Sin match en la base | **0** ✅ |
| Conflictos (valor previo distinto) | **0** — no hay valor previo en ningún caso |
| Filas de `inscripciones` alcanzadas | **88**, en 11 carreras |

Las 88 filas contra 67 SPCs: varios ejemplares están inscriptos en más de un turno (Yesi inscribe en varios y ratifica uno). El valor de performance es el mismo para todas las filas de ese SPC en esa reunión.

**WISKA KEN = WISLA KEN**: confirmado, el mapa de la migración ya usa el nombre de la base.

**Duplicados**: WAVE RIMOUT tiene dos filas en `spcs`. El UPDATE matchea *dentro de la reunión del 16/08*, no globalmente, así que sólo toca la fila que está efectivamente inscripta (`5ebc5e48`). Ningún duplicado puede desviarlo.

### Los 13 de R8 que el mapa no trae — resuelto, no hay que preguntar nada

TIRSO · TIENE RITMO · INDIO VALIDO · AMOROUS · INDIO GOLDEN · GAUCHA PRECIOSA · GINIYA GOOD · MOSQUITA GARDEN · KUCCINI · CHAMPION GOLDEN · ACAPULCO · SI TIN · LUMIN

**Ninguno está ratificado.** Son forfait, inscripto o mal_inscrito, y el programa filtra por `estado === 'ratificado'`. El mapa de Yesi tiene 67 pares y R8 tiene exactamente 67 ratificados: el padrón está completo, la diferencia contra los 80 SPCs son los borrados.

| estado en R8 | filas | con performance |
|---|---|---|
| ratificado | 67 | **67** |
| forfait | 29 | 17 |
| inscripto | 7 | 2 |
| mal_inscrito | 3 | 2 |

## 5. Render (punto 4)

- `programa-oficial.html` — celda cambiada a `i.performance || spc.ult_performances`. La query ya hace `select('*')` sobre inscripciones, no hay que tocar el fetch.
- `programa-oficial-color.html` — ídem.
- `ratificacion.html` — **no**. El PDF de ratificados no es una tabla de columnas: es una lista flex (`.pi-row`: chapa · nombre · peso). No hay dónde meter la columna sin rediseñar el documento. Si Yesi la quiere ahí, es un pedido aparte.

`DEBUTA` sale tal cual: es texto libre, no hay validación de formato. Son 6 SPCs (BACHUNA, DE BELLOSO, LA GRAN TEMPESTAD, REY DE PILA, ABELITO MIMOSO, MAC VITAL).

## 6. Carga por pantalla (punto 5)

`inscripciones.html`: campo "4 últimas performances" en el modal, sección **Programa**, arriba de Estado. Se guarda en mayúsculas (`.toUpperCase()`) para que los códigos y `DEBUTA` salgan uniformes en el papel. Cableado en las tres partes: HTML, `openModal()` (alta y edición) y `payload` de `saveRecord()`.

Desde el 17/08 en adelante Yesi lo carga al inscribir, sin depender de nadie ni de una migración.

## 7. Gates

| Gate | Contenido | Estado |
|---|---|---|
| 1 | Verificación + cruce (este documento) | ✅ listo |
| 2 | Aplicar `migrations/performance_inscripciones.sql` (DDL + backfill 88 filas) | **espera OK** |
| 3 | Deploy a `main` de `inscripciones.html` + los dos programas | espera gate 2 |

El gate 3 va después del 2 sí o sí: si se deploya el HTML antes de que exista la columna, el `insert` de una inscripción nueva falla con `column "performance" does not exist`.
