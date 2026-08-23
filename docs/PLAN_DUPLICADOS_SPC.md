# Plan — unificar los dos pares de SPC duplicados

**Fecha:** 2026-08-23 · **NADA EJECUTADO.** Esto es el plan; el SQL está en
`migrations/merge_duplicados_spc.sql`, sin aplicar.

**Guard verificado antes de relevar:** `pwd` = `/home/clio/dev/SGH`, rama `main` en `bc9b310`,
`count(spcs)` = **183**, proyecto `unlhcuanfrtpatoipwve` (confirmado por `get_project_url`).

Confirmado por Yesi:

| Par | Queda | Se borra |
|---|---|---|
| 1 | **First Queen** `214e5a7a` | Fist Queen `0dc2f58f` |
| 2 | **Malenuchi Jack** `9c9c742c` | Malenuchi `da839b11` |

---

## Titular: no hay nada que repuntar

**Los cuatro SPC están completamente limpios.** Ninguno tiene una sola fila colgando en ninguna
tabla. El paso de "repuntar antes de borrar" **no existe en este caso**: es un DELETE de dos filas
sueltas.

Es coherente con cómo aparecieron: los dos que se borran salieron del grupo *"nunca se inscribió"*
del relevamiento de tenencia.

---

## 1. Qué cuelga de cada uno de los cuatro

Primero, el inventario de **todo** lo que puede apuntar a un SPC. Seis FK reales:

| Tabla hija | Columna | ON DELETE |
|---|---|---|
| `inscripciones` | `spc_id` | — (RESTRICT por defecto) |
| `novedades_reunion` | `spc_id` | — (RESTRICT por defecto) |
| `_gate41_backfill_tenencia` | `spc_id` | — (RESTRICT por defecto) |
| `performances` | `spc_id` | CASCADE |
| `spc_entrenadores_hist` | `spc_id` | CASCADE |
| `spc_propietarios` | `spc_id` | CASCADE |

Más las referencias **sin FK**, que hay que mirar a mano porque la base no las protege:
`sanciones` y `resolucion_entidades` (polimórficas, `entidad_tipo='spc'` + `entidad_id`),
`usuarios.entidad_id`, `auditoria.registro_id`, `bak_r8_propietario.spc_id`, y las que llegan
**indirectamente por `inscripciones`**: `resultado_posiciones.inscripcion_id` y
`liquidacion_detalle.inscripcion_id`.

Conteo real de los cuatro:

| | First Queen **(queda)** | Fist Queen *(se borra)* | Malenuchi Jack **(queda)** | Malenuchi *(se borra)* |
|---|---|---|---|---|
| `inscripciones` | 0 | 0 | 0 | 0 |
| `resultado_posiciones` (vía inscripción) | 0 | 0 | 0 | 0 |
| `liquidacion_detalle` (vía inscripción) | 0 | 0 | 0 | 0 |
| `performances` | 0 | 0 | 0 | 0 |
| `spc_propietarios` | 0 | 0 | 0 | 0 |
| `spc_entrenadores_hist` | 0 | 0 | 0 | 0 |
| `novedades_reunion` | 0 | 0 | 0 | 0 |
| `sanciones` | 0 | 0 | 0 | 0 |
| `resolucion_entidades` | 0 | 0 | 0 | 0 |
| `usuarios.entidad_id` | 0 | 0 | 0 | 0 |
| `auditoria.registro_id` | 0 | 0 | 0 | 0 |
| `_gate41_backfill_tenencia` | 0 | 0 | 0 | 0 |
| `bak_r8_propietario` | 0 | 0 | 0 | 0 |
| citado como padrillo/madre de otro SPC | 0 | 0 | 0 | 0 |

**Todo en cero, en las catorce filas.**

### Los campos propios

| Campo | First Queen (queda) | Fist Queen (se borra) |
|---|---|---|
| `fecha_nacimiento` | 2023-10-04 | 2023-10-04 |
| `sexo` | macho | macho |
| `registro_stud_book` / `color` / `padrillo` / `madre` | NULL | NULL |
| `entrenador_id` / `caballeriza_id` | NULL | NULL |
| alta | 27/04 22:35 | 27/04 22:37 (dos minutos después) |

| Campo | Malenuchi Jack (queda) | Malenuchi (se borra) |
|---|---|---|
| `fecha_nacimiento` | 2023-10-15 | 2023-10-15 |
| `sexo` | macho | macho |
| `padrillo_nombre` | **Emir Jack** | NULL |
| `madre_nombre` | **Quartermaster** | NULL |
| `registro_stud_book` / `color` | NULL | NULL |
| `entrenador_id` / `caballeriza_id` | NULL | NULL |
| alta | 09/05 00:25 | 09/05 01:11 (46 min después) |

**El que se borra no tiene ningún dato que el que queda no tenga.** En el par 2 es al revés: el
sobreviviente es el más completo. No hay nada que copiar antes de borrar.

---

## 2. Qué hay que repuntar: **nada**

Cero filas apuntando a los dos que se van. No hay UPDATE previo, no hay reasignación de
inscripciones, no hay merge de historial. La operación es un DELETE de dos filas.

Si el relevamiento hubiera dado distinto —por ejemplo inscripciones en el que se borra— el paso
sería un `UPDATE inscripciones SET spc_id = <el que queda> WHERE spc_id = <el que se va>`, y ahí sí
habría que revisar el unique `(carrera_id, spc_id)` por si los dos estuvieran en la misma carrera.
**No es el caso**, pero el SQL deja el chequeo como guarda: si aparece una fila, aborta.

---

## 3. Orden exacto

Aunque el paso 1 sea vacío, el script lo mantiene para que sea correcto si algo cambió entre este
relevamiento y la ejecución:

1. **Guarda de seguridad.** Verificar que los 4 UUID existen y que los 2 que se borran siguen sin
   dependencias. **Si aparece cualquier fila, abortar la transacción** — no borrar a ciegas.
2. **Snapshot** de las dos filas completas en `_bak_merge_duplicados_spc`, que es la base del
   rollback.
3. **Repuntar** lo que cuelgue (hoy: nada; el UPDATE afecta 0 filas y queda por si acaso).
4. **Borrar** las dos filas de `spcs`.
5. Todo en **una sola transacción**. Si algo falla, no se borra nada.

---

## 4. Rollback

El script crea `_bak_merge_duplicados_spc` con la fila **completa** de cada SPC borrado, incluido su
**UUID original**. Deshacer es reinsertar desde ahí:

```sql
INSERT INTO spcs SELECT (fila).* FROM _bak_merge_duplicados_spc;
```

Reinsertar con el mismo `id` es lo que hace que el rollback sea total: cualquier referencia externa
que hubiera quedado guardada fuera de la base (una planilla, un PDF ya impreso, un ID anotado)
vuelve a resolver. Va en `migrations/rollback_merge_duplicados_spc.sql`.

Como no hay filas hijas, el rollback no tiene que reconstruir nada más. Ésa es justamente la ventaja
de que estén limpios: la operación es trivialmente reversible.

---

## 5. Verificación posterior

```sql
-- a. los dos que se borran ya no están
select count(*) from spcs where id in ('0dc2f58f-…','da839b11-…');        -- espera 0

-- b. los dos que quedan siguen enteros, con su pedigree
select nombre, fecha_nacimiento, padrillo_nombre, madre_nombre
  from spcs where id in ('214e5a7a-…','9c9c742c-…');
-- espera: First Queen 2023-10-04 · Malenuchi Jack 2023-10-15, Emir Jack, Quartermaster

-- c. total
select count(*) from spcs;                                                -- espera 181 (183 − 2)

-- d. NINGÚN huérfano en las seis tablas hijas
select 'inscripciones' t, count(*) from inscripciones i
  where not exists (select 1 from spcs s where s.id = i.spc_id)
union all select 'performances', count(*) from performances p
  where not exists (select 1 from spcs s where s.id = p.spc_id)
union all select 'spc_propietarios', count(*) from spc_propietarios x
  where not exists (select 1 from spcs s where s.id = x.spc_id)
union all select 'spc_entrenadores_hist', count(*) from spc_entrenadores_hist x
  where not exists (select 1 from spcs s where s.id = x.spc_id)
union all select 'novedades_reunion', count(*) from novedades_reunion x
  where not exists (select 1 from spcs s where s.id = x.spc_id)
union all select 'backfill_tenencia', count(*) from _gate41_backfill_tenencia x
  where not exists (select 1 from spcs s where s.id = x.spc_id);
-- espera: 0 en las seis

-- e. cobertura de tenencia, que no se movió
select count(*) filter (where entrenador_id is not null) as con_entrenador,
       count(*) filter (where entrenador_id is null)     as sin_entrenador
  from spcs;                                              -- espera 147 y 34
```

Sobre el punto **b**: el historial del que queda **no cambia**, porque el que se borra no aportaba
ninguno. No hay "todo el historial de los dos" que verificar — los dos tienen historial vacío.

---

## 6. Lo que preguntaste puntualmente

> *Si First Queen y Fist Queen tienen inscripciones en reuniones distintas, al unificar el historial
> del caballo cambia. Confirmame que no rompe ningún resultado ya oficializado ni ninguna
> liquidación pagada.*

**Confirmado, y por el motivo más fuerte posible: no hay ninguna inscripción que unificar.**

- `First Queen` y `Fist Queen`: **0 inscripciones cada uno**. Nunca corrieron.
- `Malenuchi` y `Malenuchi Jack`: **0 inscripciones cada uno**.
- Por lo tanto **0 filas en `resultado_posiciones`** y **0 en `liquidacion_detalle`** para los
  cuatro.

No hay resultado oficializado que pueda cambiar de dueño, ni liquidación pagada que pueda quedar
apuntando a otro caballo, ni performance que se sume mal, ni orden de llegada que se recalcule.
El historial del sobreviviente después del merge es exactamente el que tiene ahora: vacío.

La preocupación es la correcta y hay que mantenerla para el próximo merge —si algún día se unifican
dos fichas **con** carreras corridas, ahí sí hay que mirar el unique `(carrera_id, spc_id)`, los
mandiles ya impresos y las liquidaciones emitidas—. Para estos dos pares, no aplica.

---

## Efecto

| | Antes | Después |
|---|---|---|
| SPC en el padrón | 183 | **181** |
| Sin entrenador | 36 | **34** |
| **La lista de Yesi** | 19 | **17** |
| Con entrenador | 147 | 147 (sin cambios) |

Los dos que se borran estaban en la lista de Yesi, así que se le achica el trabajo pendiente.
