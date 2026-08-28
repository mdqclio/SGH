# Aplicación — Montas reales + gate duro al oficializar

- **Fecha**: 2026-08-28
- **SHA del merge**: **`f928fe0`** — `merge: montas reales en resultados.html + gate duro de jockey al oficializar`
- **Commits mergeados**: `7f3827f` (modal + gate + probe), `b63b6d9` (marca en notas + probe de recuperación)
- **Base**: `main` = `2754c5f`
- **Branch**: `feat/montas-reales-y-gate` (mergeada con `--no-ff`, pusheada)
- **Guards verificados**:
  - `pwd` → `/home/clio/dev/SGH` ✔
  - `SELECT count(*) FROM spcs` → `181` ✔
  - ref del proyecto → `unlhcuanfrtpatoipwve` ✔
- **Diff previo**: `docs/diagnosticos/2026-08-28_diff-montas-reales-y-gate.md`
- **Relevamiento base**: `docs/diagnosticos/2026-08-28_monta-real-vs-jockey-inscripto.md`

---

## 1. La verificación pedida: el camino de recuperación

**Funciona.** Verificado end-to-end con código real, no por lectura.

### 1.1 El probe existente no servía

`tests/probe_oficializar_carrera.mjs` cubre en teoría este camino (checks d y e), pero **hoy no
corre**:

```
Error: R5 necesita ≥2 carreras con ubicados; hay 0.
❌ EXCEPCIÓN en fase 'snapshot'
```

R5 de Dolores está vacía — es el hallazgo A1 de la auditoría del 27/08, que sigue abierto.
Así que el camino **no estaba verificado por ningún probe verde**. La preocupación era correcta.

### 1.2 Qué hace `desoficializar_carrera` — leído, no supuesto

```sql
CREATE OR REPLACE FUNCTION public.desoficializar_carrera(p_carrera_id uuid)
 RETURNS resultados LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_res resultados; v_pagas int;
BEGIN
  SELECT count(*) INTO v_pagas
    FROM liquidacion_detalle d
   WHERE (d.recibo_id IS NOT NULL OR d.estado_linea = 'pagado')
     AND ( d.carrera_id = p_carrera_id
        OR d.inscripcion_id IN (SELECT i.id FROM inscripciones i WHERE i.carrera_id = p_carrera_id) );
  IF v_pagas > 0 THEN
    RAISE EXCEPTION 'carrera con pagos emitidos, anulá los recibos primero';
  END IF;
  UPDATE resultados SET estado='provisional', oficializado_at=NULL, oficializado_por=NULL
   WHERE carrera_id = p_carrera_id RETURNING * INTO v_res;
  IF NOT FOUND THEN RAISE EXCEPTION 'no hay resultado para esta carrera'; END IF;
  RETURN v_res;
END $function$
```

Tres cosas que importan:

1. **El guard cuenta sólo líneas PAGADAS** (`recibo_id IS NOT NULL OR estado_linea='pagado'`).
   Las impagas y las retenidas **no traban nada**. Responde directo a la pregunta.
2. **El guard está scopeado a esa carrera** (`carrera_id` o `inscripcion_id` de esa carrera).
   Que la carrera 2 esté paga no impide des-oficializar la carrera 1.
3. **La RPC no toca `liquidacion_detalle`.** El dropeo de las líneas lo hace después
   `generarLiquidacionesReunion` desde `resultados.html:1637`, que es paid-safe: borra lo que
   tiene `recibo_id IS NULL AND estado_linea <> 'pagado'` y regenera desde los resultados
   oficiales. Como la carrera quedó provisional, sus líneas no se regeneran.

### 1.3 Verificación real — `tests/probe_recuperacion_monta.mjs`

Sandbox: **reunión 9999**, no una reunión real. Tiene justo las dos situaciones necesarias:
turno 1 con 23 líneas y 0 pagadas, turno 2 con 3 pagadas. Corre el cuerpo real de
`desoficializar()`, `saveMontas()` y `oficializar()` extraídos de `resultados.html`, más el
motor real `liquidaciones-engine.js`. Patrón snapshot → run → assert → restore.

```
── Probe recuperación de monta post-oficialización (sandbox R9999) ──
✅  D1 · des-oficializar con líneas sin pagar → provisional — provisional
✅  D1b · no tiró el error del guard — ↩️ Resultado des-oficializado
✅  D2 · las líneas de esa carrera se dropearon — 23 → 0
✅  D2b · las PAGADAS de la otra carrera quedaron intactas — 4 pagadas antes y después
✅  D3 · carrera con pagos → NO se des-oficializa — oficial
✅  D3b · avisa con el mensaje del guard — carrera con pagos emitidos, anulá los recibos primero
✅  M1b · no tocó las montas que el operador no cambió — 5 filas sin cambios
✅  M1 · saveMontas persiste el jockey nuevo — Jockey Uno → Jockey Dos
✅  O2 · el gate nuevo no estorba: vuelve a oficializar — oficial
✅  O2b · el gate no disparó su diálogo
✅  O1 · la línea de premio del jockey se regeneró — Carrera 1 — 1° puesto — Jockey (bolsa: $600.000,00)
✅  O1b · el beneficiario es el jockey CORREGIDO, no el viejo
✅  G1 · monta vacía → el gate bloquea la re-oficialización — provisional
✅  G1b · nombra el caballo y ofrece Montas — No se puede oficializar: 1 caballo(s) que largaron no tienen jockey cargado.
✅  R1 · restore liquidacion_detalle (mismos ids) — 76 vs 76
✅  R2 · restore jockeys de inscripciones
✅  R3 · restore estados de resultados

17/17 OK
```

**`O1b` es el assert que cierra la pregunta**: después de des-oficializar → corregir la monta →
re-oficializar, la línea de premio del jockey sale con el **beneficiario nuevo**. El cambio
llega al recibo.

R9999 quedó idéntica; verificado después de correr:

```
 estado_linea | n  | con_recibo |   neto
--------------+----+------------+-----------
 impago       | 51 |          0 | 553040.00
 pagado       |  4 |          4 | 870000.00
 retenido     | 21 |          0 | 604800.00
```

3 resultados en `oficial`. Mismo estado que antes.

### 1.4 Conclusión operativa para el 20/09

El escenario planteado funciona: Martín oficializa C1 a las 12:50, a las 13:20 llega el cambio,
des-oficializa C1, corrige en Montas, vuelve a oficializar. Lo que cierra la ventana **no es el
tiempo sino el primer pago que toque esa carrera** — recién ahí el guard de la RPC lo traba.

Dos avisos que conviene que sepa Martín:

- **Des-oficializar una carrera recalcula la liquidación de TODA la reunión.** Es paid-safe, así
  que lo cobrado se preserva, pero no es una operación local a la carrera.
- **El mensaje del guard es exacto y accionable**: `carrera con pagos emitidos, anulá los
  recibos primero`. Si aparece, ya es tarde para el camino barato.

---

## 2. Dos bugs del harness que el probe encontró (y que valen como hallazgo)

Los anoto porque los dos son la misma clase de error y el segundo casi lo doy por bueno.

1. **Stub de DOM demasiado permisivo.** Mi `document.getElementById` devolvía un elemento con
   `value: ''` para cualquier id. `saveMontas()` recorre todos los ratificados, y para los que
   el operador no tocó leía `''` → los interpretaba como "jockey borrado" y mandaba 6 updates a
   `null`. **El código real está bien**: en el DOM real esos `<select>` existen con su jockey
   seleccionado, y si no existieran `getElementById` devolvería `null` y el `continue` los
   saltea. El stub era el que mentía. Corregido: ahora un `mo-<uuid>` no registrado devuelve
   `null`, como el DOM.
2. Se agregó el assert **`M1b · no tocó las montas que el operador no cambió`** justamente para
   que esa clase de error no pase inadvertida en el futuro.

---

## 3. Respuestas a lo pedido

### 3.1 Alta rápida: VA, y ahora queda marcada

`profesionales.notas` existe (text, nullable). El INSERT ahora escribe:

```javascript
const ALTA_RAPIDA_MARCA = 'ALTA RAPIDA desde Montas';
...
notas: `${ALTA_RAPIDA_MARCA} (resultados.html) el ${new Date().toISOString().slice(0,10)}`
     + ` por ${currentUser?.nombre_completo || currentUser?.email || '?'}.`
     + ` FICHA INCOMPLETA: faltan matrícula, DNI, categoría y patente — completar en jockeys.html.`
```

Se encuentran con:

```sql
SELECT * FROM profesionales WHERE notas LIKE 'ALTA RAPIDA%';
```

El toast también lo dice: `Jockey creado: X, Y — ficha incompleta, completala en Jockeys`.
Cubierto por 6 asserts nuevos (`A1`–`A1f`) en `probe_montas_reales.mjs`.

### 3.2 Los 4 jockeys de agosto: **no se completan solos**

```
 apellido | nombre       |   alta     | DNI      | matrícula | categoría | nacim.     | tel | email | patente | notas
----------+--------------+------------+----------+-----------+-----------+------------+-----+-------+---------+-------
 GUZMAN   | CLAUDIO      | 2026-08-05 | null     | null      | null      | null       | null| null  | null    | null
 MARCHANT | JUAN         | 2026-08-06 | 45399992 | null      | null      | 2003-12-22 | null| null  | null    | null
 GONZALEZ | JOSE ANTONIO | 2026-08-07 | 36625637 | null      | null      | 1992-09-26 | null| null  | null    | null
 DE MAIO  | FACUNDO      | 2026-08-07 | 38954012 | null      | null      | 1995-04-12 | null| null  | null    | null
```

**Tres semanas después: 0 de 4 tienen matrícula, categoría, teléfono, email ni patente.** Tres
tienen DNI y fecha de nacimiento; GUZMAN no tiene nada más que el nombre.

Y no son los únicos — la misma consulta muestra otros tres creados igual en agosto, todos
completamente vacíos:

```
 GONZALEZ | LUCAS           | 2026-08-05 | todo null
 GONZALEZ | AGUSTIN         | 2026-08-05 | todo null
 GONZALEZ | EDUARDO CECILIO | 2026-08-12 | todo null
```

Confirma tu lectura: es el mismo patrón de los 40 propietarios provisorios. **Nadie los
completa después.** La marca en `notas` no lo arregla — hace que se puedan encontrar, que es lo
único que se puede hacer sin meter validación obligatoria que trabaría la operación del día de
la carrera.

### 3.3 "Montas" — sin cambios. 3.4 El gate no mira `inscripto` — sin cambios. 3.5 Sin Montas después de oficializar — sin cambios

Las tres quedaron como estaban. La 3.5 queda respaldada por §1: el camino alternativo está
verificado.

---

## 4. ⚠️ Corrección — el hallazgo de `closePesoBalanza` estaba MAL

**No lo apliqué, porque no hay nada que arreglar.**

`closePesoBalanza()` **ya llama** a `_pbHasChanges()`, en `main` y desde antes de este cambio:

```javascript
function closePesoBalanza() {
  if (_pbHasChanges() && !confirm('Hay cambios sin guardar. ¿Cerrar de todas formas?')) return;
  document.getElementById('modal-peso-balanza').classList.remove('open');
}
```

El error fue mío y es del tipo que conviene dejar escrito: leí el archivo con
`sed -n '1774,1800p;1821,1864p'`, que **saltea las líneas 1801-1820** — justo donde vive la
función. Vi `_pbHasChanges` definida, no vi la llamada, y afirmé que no existía. Afirmé desde
un hueco de lectura.

Los dos modales de la pantalla ya se comportan igual: los dos preguntan antes de descartar. La
única diferencia es el texto (`"Hay cambios sin guardar. ¿Cerrar de todas formas?"` vs
`"Hay montas sin guardar. ¿Descartar?"`). No lo unifiqué: no me lo pediste y el de Montas es
más específico.

---

## 5. Lo que se aplicó

| Archivo | Cambio |
|---|---|
| `resultados.html` | +236 / −1 — modal de Montas, gate en `oficializar()`, alta rápida con marca en `notas` |
| `tests/probe_montas_reales.mjs` | nuevo — 34 asserts |
| `tests/probe_recuperacion_monta.mjs` | nuevo — 17 asserts |

**No se tocó**: `ratificacion.html`, `inscripciones.html`, `liquidaciones-engine.js`,
`jockeys.html`, `profesionales.html`, `hora_cierre_ratificacion`, `closePesoBalanza`.
**Cero DDL, cero migraciones.** Las únicas escrituras a la base fueron las del probe de
recuperación sobre R9999, revertidas y verificadas (§1.3).

### Probes sobre `main` ya mergeado

```
$ set -a; . ./.env; set +a
$ node tests/probe_montas_reales.mjs        →  34/34 OK
$ node tests/probe_recuperacion_monta.mjs   →  17/17 OK
```

### Sensibilidad (medida en el turno anterior, sigue valiendo)

- Contra `main` pre-merge: corta en `S0` — el código no existía.
- Mutation test (gate neutralizado, todo lo demás en pie): **6 asserts caen**, `S0` sigue verde.
  Los asserts del gate miden el gate, no su presencia.

---

## 6. Hallazgos laterales abiertos

1. **`resultados.oficializado_at` / `oficializado_por` nunca se escriben** — NULL en las 19
   filas de `resultados`. `oficializar()` no los setea; la RPC `desoficializar_carrera` sí los
   limpia. El histórico no sabe quién oficializó ni cuándo. Fuera de alcance, no tocado.
2. **`probe_oficializar_carrera.mjs` está muerto**: apunta a R5, que tiene 0 carreras con
   ubicados. Hoy falla en snapshot. O se le cambia la reunión o se saca. Es el hallazgo A1 de la
   auditoría del 27/08.
3. **7 jockeys con ficha vacía o casi** creados en agosto (§3.2). Ninguno tiene la marca nueva
   porque son anteriores. Si querés que queden marcados retroactivamente, es un UPDATE de 7
   filas — no lo hice, es escritura sobre datos reales y no estaba pedido.
4. **Reunión 9999 sigue viva.** Este informe la usó como sandbox y la dejó igual, pero sigue
   ensuciando toda consulta agregada y sigue vencida desde el 20/06.

---

## 7. Preguntas abiertas

1. **¿Marcamos retroactivamente los 7 jockeys de agosto?** Un `UPDATE profesionales SET notas`
   sobre 7 filas identificadas. Los hace aparecer en la misma búsqueda que los nuevos.
2. **¿Alguien completa las fichas antes del 20/09?** Los 4 que corrieron en R6 siguen sin
   matrícula ni categoría. Si `categoria_jockey` importa para algún cálculo, hoy está vacío.
3. **¿Martín tiene que saber que des-oficializar recalcula toda la reunión?** Es paid-safe, pero
   conviene que no lo descubra el domingo.
