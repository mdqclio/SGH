# PLAN — `studbook-buscar`: el scraper del Stud Book como Edge Function, para el alta de SPC desde `spcs.html` (NADA aplicado)

**Fecha:** 2026-09-11 (noche) · **`main`:** `4f6ff13` · **Base:** `2026-09-11_relevamiento-scraper-studbook-como-edge-function.md`
**Estado:** plan. Ni función, ni HTML, ni RPC, ni probe escritos. Cada pieza va con su OK.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 203 | ✅ |
| ref | `unlhcuanfrtpatoipwve` | ✅ |

---

## 1. En una página

```
Yesi tipea "BIEN COQUETA" en el modal "+ Nuevo SPC"  →  botón Buscar
   ↓  sb.functions.invoke('studbook-buscar', { body: { term } })      (JWT de Yesi, staff)
   ↓  la función pega al autocomplete público del Stud Book y devuelve TODOS los hits, ya en forma `spcs`
   ↓  spcs.html muestra la lista: nombre · nac. · sexo · pelaje · padre × madre · † · [Usar]
   ↓  Yesi elige uno  →  se prellena el formulario (+ studbook_id oculto, + notas con SB/url)
   ↓  antes de guardar: RPC `rpc_spcs_duplicados` (los 3 chequeos de siempre) → aviso con la fila existente si hay
   ↓  Guardar = el INSERT de siempre desde el cliente (RLS + auditoría + índice único de studbook_id)
```

Cuatro piezas, cuatro OK: **(A)** RPC de duplicados · **(B)** Edge Function · **(C)** `spcs.html` · **(D)** probes. Orden de ejecución: A → B → D(función) → C → D(pantalla) → deploy. A y B son independientes.

---

## 2. Pieza A — RPC `rpc_spcs_duplicados` (los tres chequeos, en la base, una sola vez)

Hoy los chequeos se hacen por SQL a mano en cada tanda (`spcs_r9_tanda_1.sql` §0.b/c/d). Los mismos tres, como función `SECURITY DEFINER` para que la pantalla los use igual que yo, y para que un día `tools/studbook_scrape_tanda.mjs` también:

```sql
-- migrations/rpc_spcs_duplicados.sql
CREATE OR REPLACE FUNCTION rpc_spcs_duplicados(
  p_studbook_id text, p_nombre text, p_fecha_nacimiento date, p_padrillo text, p_madre text
) RETURNS TABLE (motivo text, id uuid, nombre text, fecha_nacimiento date, sexo sexo_spc,
                 padrillo_nombre text, madre_nombre text, studbook_id text, estado estado_spc)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH n AS (SELECT upper(regexp_replace(translate(coalesce(p_nombre,''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^A-Za-z0-9]','','g')) AS nn)
  SELECT 'studbook_id', s.id, s.nombre, s.fecha_nacimiento, s.sexo, s.padrillo_nombre, s.madre_nombre, s.studbook_id, s.estado
    FROM spcs s WHERE p_studbook_id IS NOT NULL AND s.studbook_id = p_studbook_id
  UNION ALL
  SELECT 'nombre', s.id, s.nombre, s.fecha_nacimiento, s.sexo, s.padrillo_nombre, s.madre_nombre, s.studbook_id, s.estado
    FROM spcs s, n WHERE n.nn <> '' AND upper(regexp_replace(translate(s.nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^A-Za-z0-9]','','g')) = n.nn
  UNION ALL
  SELECT 'fecha_padre_madre', s.id, s.nombre, s.fecha_nacimiento, s.sexo, s.padrillo_nombre, s.madre_nombre, s.studbook_id, s.estado
    FROM spcs s WHERE p_fecha_nacimiento IS NOT NULL AND s.fecha_nacimiento = p_fecha_nacimiento
      AND upper(coalesce(s.padrillo_nombre,'')) = upper(coalesce(p_padrillo,'')) AND upper(coalesce(s.madre_nombre,'')) = upper(coalesce(p_madre,''));
$$;
REVOKE ALL ON FUNCTION rpc_spcs_duplicados(text,text,date,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION rpc_spcs_duplicados(text,text,date,text,text) TO authenticated;
-- guard adentro (GOTCHA #80: la RLS no protege una SECURITY DEFINER): IF NOT fn_is_staff() THEN RAISE ... (en la versión plpgsql)
```

- Devuelve **cero o más filas con `motivo`**; la pantalla no decide nada, muestra.
- **Es lo que atrapó a Wave Rimout** (mismo nombre, dos filas) y a **LOGUACIOUS ×3 grafías** (normalización: `LOGUARCIUS`/`LOGUARCIOUS` no dan igual que `LOGUACIOUS` por nombre — por eso también va el chequeo por `studbook_id` y por fecha+padre+madre, que sí lo agarran cuando el candidato viene del Stud Book con su id). Y a `Conesera`/`CONESERSA` la agarra el tercero (misma fecha, Emmanuel × Milonga Burrera).
- Nota sobre `unaccent()`: no está instalada (GOTCHA #71) → `translate` manual, el mismo que se usó en las tres tandas de hoy.
- Se escribe en `plpgsql` con el `IF NOT fn_is_staff() THEN RAISE` arriba (el SQL de arriba es la lógica; el archivo real lleva el guard).
- Probe: `tests/probe_rpc_spcs_duplicados.mjs` — llama la RPC con (a) `studbook_id` de LOGUACIOUS, (b) nombre `loguacious` en minúscula con acento inventado, (c) fecha+padres de CONESERA con otro nombre, (d) un caballo inexistente → 1 / 1 / 1 / 0 filas. Solo lectura.

---

## 3. Pieza B — Edge Function `supabase/functions/studbook-buscar/index.ts`

### Contrato

| | |
|---|---|
| método | `POST`, body `{ "term": "BIEN COQUETA" }` |
| auth | `verify_jwt: true` + `getUser(jwt)` (patrón `invite-user:271-306`) + `fn_is_staff()` por RPC con el JWT del caller. Portal (`profesional`/`propietario`) → 403 |
| validación | `term` string, 3–60 chars, sin control chars |
| salida 200 | `{ ok: true, term, exactos: Candidato[], parciales: Candidato[], fuente: 'studbook.org.ar/autocomplete' }` |
| salida 502 | `{ ok: false, error: 'studbook_no_disponible', detalle }` — cuando el Stud Book no responde 200 con JSON (el 404-HTML de "sin `X-Requested-With`" cae acá también) |
| escribe en DB | **nunca** |
| secretos | **ninguno** |
| CORS | headers de `invite-user:139` + `OPTIONS` |

`Candidato` = lo que hoy arma el scraper para una alta, ya en nombres de columna de `spcs`:

```ts
{
  sb_id: "429819", nombre: "BIEN COQUETA", fecha_nacimiento: "2021-10-15", sexo: "hembra",   // sexo_sb → macho/hembra/castrado, null si desconocido
  color: "Zaino Colorado", padrillo_nombre: "Bien Terminado", madre_nombre: "Gritty", abuelo_materno: "Luhuk (USA)",
  pais_origen: "Argentina", url_perfil: "https://www.studbook.org.ar/ejemplares/perfil/429819/bien-coqueta",
  leyenda: "(2021 H SP)", tomo: 1241, folio: 202, muerto: false,        // muerto: sin verificar qué campo lo indica; ver §3 abajo
  alertas: []                                                            // 'sexo desconocido', 'raza != 4 (SPC)', 'bandera no argentina'
}
```

### Código: qué se copia y qué es nuevo

| bloque | origen | líneas |
|---|---|---|
| `autocomplete(term)` con los 4 headers | `tools/studbook_scrape_tanda.mjs:26-40` **tal cual** | 15 |
| `norm`, `SEXO`, `toISO`, armado del candidato + alertas | idem `:23-24, 28, 42-45, 80-99` | 40 |
| clasificación exactos/parciales (`norm(h.text) === norm(term)`) | idem `:57-79`, sin la rama `MATCH_AMBIGUO`: **no se elige**, se devuelven todos | 10 |
| CORS, `OPTIONS`, auth, staff, validación, 502, `Deno.serve` | `invite-user` + nuevo | 50 |
| **total** | | **~115** |

Sin `_shared`, sin `build.mjs`: archivo único, entra directo por `deploy_edge_function`. El scraper CLI **queda como está** (sigue sirviendo para tandas grandes por archivo); no se toca en esta tanda. Deuda anotada: unificar los dos en un módulo compartido cuando haya un tercer consumidor.

### Lo que va escrito en el código, arriba de todo (pedido tuyo)

```ts
// ============================================================
// studbook-buscar — consulta al Stud Book Argentino para el alta de SPC desde spcs.html
// ============================================================
// FUENTE DE DATOS (2026-09): el autocomplete PÚBLICO del sitio del Stud Book,
//   GET https://www.studbook.org.ar/ejemplares/autocomplete?tipo=1&muerto=1&term=<nombre>
//   con el header X-Requested-With: XMLHttpRequest (sin él responde 404 HTML).
//   NO es una API acordada: es el endpoint interno de su propio buscador. Sin token, sin
//   allowlist de IP, sin rate limit documentado (~1 s por consulta). Puede cambiar o cerrarse
//   sin aviso. Es el mismo que usa tools/studbook_scrape_tanda.mjs desde el VPS.
//
// CUANDO EXISTA LA API DE DIEGO (Stud Book, ISSUE-030): se reemplaza SOLO la función
//   autocomplete() de abajo y el mapeo a Candidato. El contrato hacia spcs.html
//   ({ exactos, parciales, fuente }) no cambia. Ojo: si esa API exige allowlist de IP, una
//   Edge Function NO puede salir con IP fija (docs/diagnosticos/2026-09-10_ips-fijas-consulta-studbook.md §3.1)
//   y la consulta tiene que pasar a un proxy con IP propia (el VPS). Cambiar `fuente` en la respuesta.
//
// ESTA FUNCIÓN NO ESCRIBE EN LA BASE. Devuelve candidatos; el INSERT lo hace spcs.html con el
//   cliente del usuario (RLS, auditoría, índice único spcs_studbook_id_uniq). Los homónimos NO se
//   desambiguan acá: se devuelven todos y elige la persona (ver docs/diagnosticos/2026-09-11_plan-studbook-buscar-edge-function.md §4).
// ============================================================
```

Y lo mismo, en dos líneas, en `CLAUDE.md` (árbol + un gotcha: "`studbook-buscar` scrapea el autocomplete público; no es API") y en `docs/INTEGRACION_STUDBOOK_ESTADO.md` (o su sucesor vivo).

---

## 4. Pieza C — `spcs.html`: buscar, elegir, prellenar, chequear, guardar

### 4.1 El bloque de búsqueda (sólo en alta, no en edición)

Arriba del tab "Datos" del modal, cuando `editingId` es null:

```
┌ Stud Book ─────────────────────────────────────────────────────────────────┐
│ [ BIEN COQUETA               ] [ Buscar ]   fuente: studbook.org.ar (autocomplete público) │
│                                                                              │
│ 2 coincidencias exactas:                                                     │
│  ○ BIEN COQUETA · 15/10/2021 (5 años) · Hembra · Zaino Colorado              │
│      Bien Terminado × Gritty · ab. mat. Luhuk (USA) · SB 429819      [Usar] │
│  ○ BIEN COQUETA · 29/07/1998 (28 años) · Hembra · Alazan · †                 │
│      Yale Twentyniner (USA) × Coquetisima · SB 216248                [Usar] │
│ parecidos: —                                                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Esto resuelve el MATCH_AMBIGUO (tu punto 1).** La función nunca elige; la lista trae, por candidato, exactamente lo que hoy pongo en las tablas de los informes para decidir: **fecha de nacimiento y edad reglamentaria** (`edadSPC()` de `edad-spc.js`, ya cargado en `spcs.html`, con la fecha de hoy), **sexo, pelaje, padre × madre, abuelo materno, número de Stud Book** y **†** si el ejemplar figura muerto. Con eso Yesi distingue la de 2021 de la de 1998 sin salir del modal, igual que lo hice yo hoy con el informe. Reglas:

- 1 exacto → se muestra igual, con rótulo "1 coincidencia", y **no se prellena hasta que aprieta Usar** (evita que un homónimo único pero equivocado entre solo).
- 0 exactos y N parciales (`MARIA CATU` → `MARIA CATULENGA`) → sección "parecidos", mismos datos, mismo botón. Cubre los typos de planilla.
- 0 y 0 → "No está en el Stud Book con ese nombre. Probá con menos letras, o cargalo a mano." — el formulario sigue disponible.
- `alertas` del candidato (`raza != 4`, bandera no argentina, sexo desconocido) → chip rojo al lado, no bloquea.
- Error 502 → "El Stud Book no responde. Cargalo a mano." (es lo que Yesi hace hoy).
- Opcional v1.1: si el modal se abre desde Inscripciones con turno, `edad_esperada` → el candidato que cierra se marca en verde. **No en v1.**

### 4.2 Prellenado al elegir

`f-nombre`, `f-nacimiento`, `f-sexo-form` (macho/hembra/castrado — el select ya tiene los tres), `f-color`, `f-padrillo`, `f-madre`, `f-pais`, y `f-notas` = `SB <sb_id> · <url_perfil> · alta desde spcs.html <fecha>` (mismo formato que las tandas 1-3). `f-abuela` **no**: el Stud Book da abuelo materno, no abuela (GOTCHA anotado en ESTADO 11/06); va en notas. `f-registro` queda vacío (criterio: `registro_stud_book` NULL).

**Nuevo: `studbook_id`.** Hoy `saveRecord()` (`spcs.html:482-499`) no lo manda. Se agrega un campo **visible y read-only** "Nº Stud Book" (`#f-studbook-id`) que se llena al elegir y viaja en el payload como `studbook_id`. Visible, para que Yesi vea que quedó vinculado; read-only, para que no lo tipee a mano (el índice único `spcs_studbook_id_uniq` frenaría un duplicado, pero un número mal tipeado no lo frena nada). En edición se muestra el existente, también read-only.

### 4.3 El chequeo de duplicados antes de guardar (tu punto 2)

En `saveRecord()`, sólo en **alta** (`editingId` null), antes del INSERT:

```javascript
const { data: dups, error } = await sb.rpc('rpc_spcs_duplicados', {
  p_studbook_id: payload.studbook_id, p_nombre: payload.nombre,
  p_fecha_nacimiento: payload.fecha_nacimiento, p_padrillo: payload.padrillo_nombre, p_madre: payload.madre_nombre,
});
if (error) { console.error('[spcs.duplicados]', error); throw error; }   // no .catch silencioso
if (dups.length) { mostrarPanelDuplicados(dups); return; }               // NO inserta
```

Panel: una fila por hallazgo — `motivo` (mismo nº de Stud Book / mismo nombre / misma fecha y padres), y la fila existente con nombre, nacimiento, sexo, padres, `studbook_id`, estado, y botón **"Abrir esa ficha"** (edición) y **"Guardar igual"** (sólo si el único motivo es `nombre` — homónimos legítimos existen; si el motivo es `studbook_id` o `fecha_padre_madre`, **bloquea**: es el mismo animal). Es más estricto que `profesionales-duplicados.js` (que nunca bloquea), a propósito: un caballo no comparte fecha, padre y madre con otro, y un `studbook_id` es único por definición.

Los tres chequeos son **los mismos** que corrimos por SQL en las tandas 1, 2 y 3 (`§0.b/c/d` de cada migración), ahora en la base y reutilizables. Wave Rimout (mismo nombre, dos filas) y LOGUACIOUS (tres grafías; con el candidato del Stud Book viene el `studbook_id` 431567 y la fecha+padres, que lo agarran aunque el nombre tipeado no) quedan cubiertos.

### 4.4 Otros toques
- El botón "Guardar" también corre el chequeo si Yesi cargó a mano sin buscar (sin `studbook_id`: aplican los otros dos).
- `openModal(rec)` en edición: no muestra el bloque de búsqueda; muestra `studbook_id` read-only.
- Nada cambia para el portal (`spcs.html` es de staff).

---

## 5. Pieza D — probes

| probe | qué | red |
|---|---|---|
| `tests/probe_rpc_spcs_duplicados.mjs` | 4 casos de §2 contra prod, solo lectura | Supabase |
| `tests/probe_studbook_buscar_fn.mjs` | extrae `autocomplete` + clasificación **del archivo de la función** (patrón `_build/verify_build.mjs`), corre contra el Stud Book real: `EL MAS SABIO` (1 exacto), `BIEN COQUETA` (2 exactos), `MARIA CATU` (0 exactos, 1 parcial), `ZZZZQ` (0/0) — assertea forma y conteos | Stud Book |
| `tests/probe_spcs_alta_duplicados.mjs` | extrae de `spcs.html` el bloque de `saveRecord` por ancla, con `sb` real y DOM stub; caso "candidato = LOGUACIOUS" → la RPC devuelve 1 y **no hay INSERT** (se verifica que `count(spcs)` no cambia) | Supabase |
| `tests/probe_studbook_buscar_e2e.mjs` | opcional: llama la función deployada con un JWT de staff (**sin verificar** cómo obtener un JWT de prueba desde el VPS; `invite-user` lo resolvió — ver `docs/PROBE_INVITE_USER_ANALISIS.md`) | ambos |

---

## 6. Doc (en la misma tanda, no después)

- `CLAUDE.md`: árbol (`supabase/functions/studbook-buscar/`), gotcha nuevo "`studbook-buscar` y `tools/studbook_scrape_tanda.mjs` scrapean el **autocomplete público** del Stud Book — no es API, no hay contrato; cuando exista la de Diego se cambia `autocomplete()` adentro de la función".
- `docs/GOTCHAS.md` #96: lo mismo + "`X-Requested-With` obligatorio, sin él 404 HTML".
- `docs/SCHEMA.md`: `rpc_spcs_duplicados`.
- `CHANGELOG.md`: entrada.
- `docs/INTEGRACION_STUDBOOK_ESTADO.md` es foto del 03/08 (relevamiento de docs, §1): la nota va en `CLAUDE.md` y GOTCHAS, que son los vivos.

---

## 7. Orden, tamaño, riesgos

| # | pieza | líneas | OK |
|---|---|---|---|
| 1 | RPC `rpc_spcs_duplicados` + probe | 40 + 60 | uno |
| 2 | Edge Function `studbook-buscar` + probe de la función | 115 + 80 | uno (deploy incluido) |
| 3 | `spcs.html`: búsqueda + lista + prellenado + `studbook_id` + chequeo + panel | ~150 | uno (merge = va a prod) |
| 4 | docs | — | con el 3 |

**Medio día largo / un día.** Riesgos: el Stud Book cambia el autocomplete (igual que hoy; la función devuelve 502 y Yesi carga a mano); un JWT de staff para el probe e2e (**sin verificar**); y el único cambio de comportamiento que puede molestar a Yesi es que el alta **bloquea** cuando el animal ya está — que es exactamente lo que queremos.

Fuera de alcance (v1): caballeriza/entrenador/propietario del caballo (no están en el Stud Book); búsqueda por Nº de Stud Book en vez de nombre (trivial de agregar: el autocomplete no lo soporta, pero el perfil `/ejemplares/perfil/<id>` sí — **sin verificar** que devuelva algo parseable); reemplazar el scraper CLI.
