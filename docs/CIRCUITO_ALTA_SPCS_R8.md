# Circuito de alta incremental de SPCs — R8

**Fecha**: 2026-08-03 · **Ventana**: inscripciones cierran el **viernes 07/08** · R8 corre 16/08
**Contexto**: Yesi manda nombres de caballos que no están en `spcs`. Hay que crearlos con datos del Stud Book Argentino, por tandas, antes del cierre.

**Modelo**: mismo patrón que el backfill de pedigree de julio (`migrations/pedigree_backfill_26.sql` + `data/pedigree_scrape_26.json`) — scraper Python read-only contra la web del SB, match exacto por nombre, propuesta de INSERT por tanda, **gate con OK de Leo antes de ejecutar**.

**Fuera de alcance**: los DNI de jockeys y las caballerizas nuevas **no van por acá**. Esos los carga Yesi a mano con el dato que le pida a la gente.

---

## 1. Verificación del scraper (hecha el 03/08)

El scraper de julio **sigue funcionando**. El HTML y el JSON del Stud Book no cambiaron.

Consulta de prueba contra un caballo ya existente: **GREAT ORPEN**, `studbook_id 447875` — el mismo que se usó en el backfill de julio, así que hay baseline contra la cual comparar.

```
$ python3 tools/sb_alta_spcs.py --selftest
16/16 OK — scraper sano, el HTML/JSON del SB no cambió.
```

| chequeo | valor obtenido | baseline julio | |
|---|---|---|---|
| `autocomplete` → matches exactos | 1 | 1 | ✅ |
| `autocomplete.id` | 447875 | 447875 | ✅ |
| `autocomplete.padre` | Orpen Farrero | Orpen Farrero | ✅ |
| `autocomplete.madre` | Great Perfection | Great Perfection | ✅ |
| `autocomplete.nacimiento` | 2023-12-12 | 2023-12-12 | ✅ |
| `autocomplete.sexo` / `.pelo` | Macho / Zaino | Macho / Zaino | ✅ |
| `perfil.pais` | Argentina | Argentina | ✅ |
| `perfil.padre` / `.madre` (HTML) | ORPEN FARRERO / GREAT PERFECTION | ídem | ✅ |
| `perfil.padre_id` / `.madre_id` / `.abuelo_materno_id` | 346187 / 337486 / 288876 | ídem | ✅ |

Endpoints en uso, sin cambios:
- `GET /ejemplares/autocomplete?tipo=1&muerto=1&term=<nombre>` → JSON con `id, text, padre, madre, abuelo_materno, sexo, nacimiento, pelo, tomo, folio, url_friendly`
- `GET /ejemplares/perfil/<id>/<slug>` → HTML; de ahí salen país, pelaje, ids de pedigree, criador, microchip

Único detalle: en el perfil de GREAT ORPEN el regex de `Caballeriza` no matchea, porque **ese perfil no tiene esa fila** (la única aparición de la palabra es el menú de navegación, que el guard de julio ya descartaba). No es regresión, y además no usamos ese campo para el alta.

**El selftest hay que correrlo antes de cada tanda.** Sale con código 1 si el SB cambió, así te enterás el lunes y no el jueves a la noche.

---

## 2. Script de alta

`tools/sb_alta_spcs.py` — **read-only total contra la DB**. No se conecta a Supabase, justamente para que no pueda escribir por accidente. Sólo lee la web del SB y escribe tres archivos.

```bash
python3 tools/sb_alta_spcs.py --tanda 1 \
    --nombres  data/r8_tanda_1.txt \
    --snapshot data/spcs_snapshot.json
```

Entradas:
- `data/r8_tanda_N.txt` — un nombre por línea, tal cual lo manda Yesi. Se ignoran líneas vacías y las que empiezan con `#`.
- `data/spcs_snapshot.json` — foto de `spcs` traída por MCP. **Se regenera antes de cada tanda** (ver §4).

Salidas:
| archivo | qué es |
|---|---|
| `data/spcs_r8_tanda_N_scrape.json` | scrape crudo — la evidencia |
| `migrations/spcs_r8_tanda_N.sql` | los INSERTs **propuestos, no ejecutados** |
| `data/spcs_r8_tanda_N_reporte.md` | los casos que vuelven a Yesi |

### Campos que se cargan

| columna | de dónde sale |
|---|---|
| `nombre` | el `text` del SB (no el que escribió Yesi — se guarda la grafía oficial) |
| `fecha_nacimiento` | `nacimiento` del autocomplete, `dd/mm/aaaa` → ISO. **NOT NULL** |
| `sexo` | `sexo` del SB → `sexo_spc` (`Macho`→`macho`, `Hembra`→`hembra`, `Castrado`→`castrado`). **NOT NULL** |
| `color` | `pelo` del autocomplete, con fallback al pelaje del perfil |
| `padrillo_nombre` | `padre` del autocomplete, con fallback al perfil |
| `madre_nombre` | `madre` ídem |
| `pais_origen` | cabecera del perfil; default `Argentina` |
| `studbook_id` | el `id` del SB |
| `estado` | `'activo'` |

Nota: la columna se llama **`color`**, no `pelaje` (en `spcs` no existe `pelaje`).

### Campos que quedan NULL a propósito

- `caballeriza_id`, `entrenador_id`, `jockey_habitual_id` → **los asigna Yesi al inscribir**.
- `club_id` → los SPCs son globales (0 de 144 filas lo tienen cargado).
- `registro_stud_book` → en la base es seed legacy (`SB-D001`, `SB-10007`…, 16 filas). **No** es el registro real del SB; llenarlo con datos del scrape ensuciaría el campo. El identificador real del SB va en `studbook_id`.
- `certificado_correr` queda en su default `false`.

### Seguridad del SQL generado

- Envuelto en `BEGIN; … COMMIT;` con dos `SELECT` de verificación **antes** del `COMMIT`.
- Cada INSERT es `INSERT … SELECT … WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = …)` → **idempotente**, respeta el índice único parcial `spcs_studbook_id_uniq`. Correrlo dos veces no duplica.
- Comillas escapadas (`Babu''s Pet (GB)`).
- Los casts (`::date`, `::sexo_spc`, `::estado_spc`) se validaron read-only contra prod el 03/08.

⚠️ `spcs` **no tiene unique en `nombre`** — sólo en `studbook_id`. Por eso la base ya tiene duplicados históricos (`Wave Rimout` ×2, `First Queen` / `Fist Queen`). La deduplicación por nombre la hace el script, no la base.

---

## 3. Manejo de casos — todos se REPORTAN, ninguno se resuelve solo

El script clasifica cada nombre en uno de seis casos. Sólo el primero genera INSERT.

| caso | cuándo | qué hace |
|---|---|---|
| **ALTA_OK** | 1 match exacto en el SB, no está en la base, `studbook_id` libre, tiene fecha y sexo | Propone el INSERT |
| **AMBIGUO_SB** | >1 homónimo exacto en el SB | **No elige.** Lista todos los candidatos con sb_id, sexo, nacimiento, padre, madre y link al perfil. Yesi dice cuál |
| **SIN_MATCH_SB** | 0 matches exactos | **No inventa.** Lista candidatos parciales del SB **y** los SPCs de la base con nombre parecido (≥0.85 de similitud) para detectar typo de Yesi |
| **YA_EXISTE_OTRO_NOMBRE** | el SB resuelve a un `studbook_id` que ya está en la base bajo otro nombre | Reporta ambos nombres. Es typo de un lado u otro; insertarlo violaría `spcs_studbook_id_uniq` |
| **YA_EXISTE_EN_DB** | el nombre normalizado ya está en `spcs` | Reporta las filas existentes. No da de alta |
| **DATOS_INSUFICIENTES** | match único pero falta `fecha_nacimiento` o `sexo` (ambos NOT NULL) | Reporta qué falta |
| **DUP_EN_TANDA** | Yesi mandó el mismo nombre dos veces | Procesa una sola vez, avisa |

**Diferencia importante contra el script de julio**: aquel desambiguaba homónimos comparando contra la `fecha_nacimiento` que ya estaba en la DB. Acá el ejemplar **no existe todavía**, así que no hay contra qué comparar → los homónimos **siempre** vuelven a Yesi. No se aplica el criterio "el de nacimiento más reciente".

La normalización (`norm()`) ignora acentos, puntuación y mayúsculas: `MR PATO` matchea contra `MR. PATO` de la base. Eso evita altas duplicadas por puntuación.

### Dry-run del 03/08 — los 6 casos verificados

Tanda sintética de 7 nombres contra el snapshot real (con una fila alterada en copia local para forzar el caso del typo). Nada tocó la base:

| pedido | caso | resultado |
|---|---|---|
| `ORPEN FARRERO` | ALTA_OK | sb 346187 · 2014-10-05 · macho · Zaino · Orpen (USA) / Linda Farra |
| `LA CHINA` | ALTA_OK | sb 5722 · 1965-09-16 · hembra · Zaino |
| `GREAT ORPEN` | YA_EXISTE_OTRO_NOMBRE | sb 447875 ya en base como otro nombre |
| `EL GAUCHO` | AMBIGUO_SB | 3 homónimos (197447 / 83472 / 372428) listados con perfil |
| `GREAT ORPENN` | SIN_MATCH_SB | 8 candidatos parciales + typo detectado contra `GREAT ORPEN` (0.957) |
| `MR PATO` | YA_EXISTE_EN_DB | matcheó `MR. PATO` pese al punto |
| `LA CHINA` (repetido) | DUP_EN_TANDA | avisado |

---

## 4. Procedimiento por tanda

Por cada tanda que pase Leo:

**1. Refrescar el snapshot** (por MCP, read-only). Sin esto, una tanda puede duplicar lo que insertó la tanda anterior:
```sql
SELECT json_agg(json_build_object(
  'id',id,'nombre',nombre,'fecha_nacimiento',fecha_nacimiento,'sexo',sexo,
  'color',color,'padrillo_nombre',padrillo_nombre,'madre_nombre',madre_nombre,
  'studbook_id',studbook_id,'estado',estado) ORDER BY nombre)::text FROM spcs;
```
→ guardar en `data/spcs_snapshot.json`.

**2. Selftest del scraper**:
```bash
python3 tools/sb_alta_spcs.py --selftest    # exit 1 = el SB cambió, parar y arreglar
```

**3. Branch + scrape**:
```bash
git checkout -b fix/spcs-r8-tanda-N main
# pegar los nombres de Yesi en data/r8_tanda_N.txt
python3 tools/sb_alta_spcs.py --tanda N --nombres data/r8_tanda_N.txt
```

**4. Commit de la propuesta** — el SQL, el JSON del scrape y el reporte:
```bash
git add data/r8_tanda_N.txt data/spcs_r8_tanda_N_scrape.json \
        data/spcs_r8_tanda_N_reporte.md migrations/spcs_r8_tanda_N.sql \
        data/spcs_snapshot.json
git commit -m "fix(spcs): R8 tanda N — propuesta de alta (sin ejecutar)"
git push -u origin fix/spcs-r8-tanda-N
```

**5. 🚦 GATE — se para acá.** Leo revisa el reporte y el SQL. **Sin OK explícito no se ejecuta nada.**

**6. Con el OK**: aplicar por MCP (`apply_migration`), y **antes del COMMIT** revisar los dos SELECT de verificación.

**7. Verificación post-ejecución**:
```sql
SELECT count(*) FROM spcs;                                  -- debe ser 144 + altas
SELECT nombre, fecha_nacimiento, sexo, color, padrillo_nombre,
       madre_nombre, studbook_id
FROM spcs WHERE studbook_id IN (<los sb_id de la tanda>) ORDER BY nombre;
SELECT studbook_id, count(*) FROM spcs WHERE studbook_id IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;                             -- debe dar 0 filas
```

**8. Devolverle a Yesi** el bloque de casos no resueltos de `data/spcs_r8_tanda_N_reporte.md` (homónimos a elegir, grafías a confirmar, typos detectados).

---

## 5. Estado al 03/08

- `spcs` = **144 filas** (27 con `studbook_id`).
- Scraper verificado, 16/16.
- Script de alta escrito y probado en dry-run sobre los 6 casos.
- Snapshot inicial en `data/spcs_snapshot.json`.
- **Cero cambios en la base.**
- Esperando la primera tanda de nombres.
