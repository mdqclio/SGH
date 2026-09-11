# Ejecución — studbook-buscar, Pieza D(pantalla) + deploy — 2026-09-11

**Fecha:** 2026-09-11 (noche)
**Merge a `main`:** `7a0a8ee828bd666794829167e17ed17090f7c63b` (`--no-ff` de `feat/studbook-buscar` @ `e2f9e85`), con OK de Leo ("Dale con D-pantalla y el deploy")
**Vivo en prod:** `https://sigh.com.ar/spcs.html` — md5 igual al del commit (§4)
**Guards:** `pwd` = `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` = **203** (el probe crea 1 y lo borra; verificado al final) · ref `unlhcuanfrtpatoipwve`

## 1. Qué se hizo

| # | Qué | Estado |
|---|---|---|
| D.1 | `tests/probe_spcs_studbook_alta.mjs` — pantalla con código real extraído de `spcs.html`, función y RPC reales | **24/24** |
| D.2 | Docs: `CLAUDE.md` (árbol `supabase/functions/`, `rpc_spcs_duplicados.sql`, 4 probes, 96 gotchas), `docs/GOTCHAS.md` **#96**, `docs/SCHEMA.md` (studbook_id + secciones RPC y Edge Function), `CHANGELOG.md` `[2026-09-11 noche, 6]` | commit `e2f9e85` |
| D.3 | Merge `--no-ff` a `main` + push (= deploy de la pantalla por GitHub Pages) | `7a0a8ee` |
| D.4 | Verificación en prod: md5 de `spcs.html` local vs `sigh.com.ar` | **igual** (3er intento, ~60 s) |

Lo que ya estaba vivo antes del merge (piezas A y B): `rpc_spcs_duplicados` en la base y la Edge Function `studbook-buscar` v1. Lo que se prendió con el merge: la pantalla.

## 2. Probe D(pantalla) — `tests/probe_spcs_studbook_alta.mjs`

Patrón: se extrae de `spcs.html` el bloque desde `// STUD BOOK — buscar` hasta `async function deleteRecord` (todo el código nuevo: `buscarStudBook`, `renderCandidatos`, `candidatoHTML`, `usarCandidato`, `mostrarPanelDuplicados`, `saveRecord`…), se corre con `new Function` + `document` stub + `edad-spc.js` real + cliente Supabase **de un operador real** (magiclink). La función deployada y el RPC se llaman de verdad; el INSERT en `spcs` se intercepta en los casos que no deben escribir y se hace **real** en el caso 10 (con teardown verificado por estado y `count = 203`).

```
$ set -a; . ./.env; set +a
$ node tests/probe_spcs_studbook_alta.mjs
✅ 1) BIEN COQUETA → 2 coincidencias exactas en pantalla  → <div class="sb-rotulo">2 coincidencias exactas — elegí por fecha, sexo y padres:</div><div class="sb-cand" id="sb-cand-0
✅ 1) … muestra fecha, edad, sexo, pelaje, padres y SB de cada una
✅ 1) … NADA prellenado (f-nombre y f-studbook-id vacíos)
✅ 1) … fuente visible viene de la función  → fuente: studbook.org.ar/ejemplares/autocomplete (scraping del buscador público, no API)
✅ 1) … botón Buscar vuelve a habilitado
✅ 2) Usar(0) → nombre, sb 429819, 2021-10-15, hembra, Zaino Colorado, padres, Argentina  → ["BIEN COQUETA","429819","2021-10-15","hembra","Zaino Colorado","Bien Terminado","Gritty","Argentina"]
✅ 2) … notas: SB 429819 · url perfil · alta desde spcs.html · abuelo materno; f-abuela vacía  → SB 429819 · https://www.studbook.org.ar/ejemplares/perfil/429819/bien-coqueta · alta desde spcs.html 11/09/2026 · abuelo materno: Luhuk (USA) · (2021 H SP)
✅ 2) … candidato 0 marcado sb-elegido, el 1 no
✅ 3) MARIA CATU → "Sin coincidencia exacta — parecidos" con MARIA CATULENGA  → <div class="sb-rotulo">Sin coincidencia exacta — parecidos:</div><div class="sb-cand" id="sb-cand-0"
✅ 4) ZZZZQ → "No está en el Stud Book"
✅ 5) "ab" → mensaje de la pantalla, sin llamar
✅ 6) sb 431567 → panel visible, motivo "mismo nº Stud Book", LOGUACIOUS listado  → <div class="dup-row">
      <div class="dup-motivo">mismo nº Stud Book</div>
      <div class="dup-info"><strong>LOGUACIOUS</strong> · 23/10/2021 · hembra · act
✅ 6) … BLOQUEADO: texto "mismo animal", sin botón Guardar igual, sin INSERT
✅ 6) … botón Guardar rehabilitado
✅ 7) fecha+padres de CONESERA → bloqueado por "misma fecha y padres", sin INSERT  → <div class="dup-row">
      <div class="dup-motivo">misma fecha y padres</div>
      <div class="dup-info"><strong>CONESERA</strong> · 20/09/2023 · hembra · act
✅ 8) WAVE RIMOUT 2020 → panel sólo "mismo nombre" (2 filas), botón "Guardar igual", sin INSERT  → <button type="button" class="btn-secondary" onclick="saveRecord({ omitirDuplicados: true })">Guardar igual (es otro caballo)</button>
✅ 9) omitirDuplicados → INSERT con nombre WAVE RIMOUT, studbook_id null, fecha 2020-01-01  → {"club_id":null,"nombre":"WAVE RIMOUT","registro_stud_book":null,"studbook_id":null,"fecha_nacimiento":"2020-01-01","sexo":"macho","color":null,"marcas":null,"caballeriza_id":null,"entrenador_id":null,"jockey_habitual_id":null,"estado":"activo","notas":null,"padrillo_nombre":null,"madre_nombre":null,"ult_performances":null,"abuela_materna":null,"pais_origen":"Argentina"}
✅ 9) … panel oculto, toast "SPC creado"
✅ 10) nombre único → INSERT real: fila con studbook_id, sexo hembra, padres, registro NULL, club NULL  → {"id":"39c7374b-4552-4ad6-8640-5a955ba4b2d2","nombre":"PROBE SBALTA MTXLZIRR","studbook_id":"probe-mtxlzirr","fecha_nacimiento":"2021-01-01","sexo":"hembra","padrillo_nombre":"Probe Padre","madre_nombre":"Probe Madre","registro_stud_book":null,"club_id":null}
✅ 10) mismo studbook_id de nuevo → bloqueado (motivos studbook_id + nombre), sin INSERT
✅ T) teardown: 0 spcs de prueba  → []
✅ T) count spcs = 203 (baseline CLAUDE.md)  → 203
✅ T) teardown: 0 usuarios de prueba  → []
✅ T) teardown: 0 usuarios de prueba en auth

24/24 asserts OK
```

Lo que prueba, en una línea cada uno: los homónimos **no** se prellenan solos (1); **Usar** carga los 8 campos + notas con `SB · url · alta desde spcs.html · abuelo materno · leyenda` y deja `f-abuela` vacía (2); typo → "parecidos" (3); inexistente → mensaje (4); término corto no llama (5); `studbook_id` repetido **bloquea** sin botón (6); fecha + padres repetidos **bloquean** (7); nombre solo → "Guardar igual" (8) y con eso llega al INSERT (9); alta limpia → INSERT real con `studbook_id`, `registro_stud_book NULL`, `club_id NULL`, y re-alta del mismo → bloqueada (10).

## 3. Commits

```
e2f9e85 test(spcs): probe D-pantalla del alta desde el Stud Book (24/24) + docs (CLAUDE.md, GOTCHA #96, SCHEMA, CHANGELOG)
9b364c0 feat(spcs): pantalla — buscar en el Stud Book al dar de alta, elegir candidato, prellenar, chequear duplicados antes del INSERT
c39f2fa feat(studbook): Edge Function studbook-buscar DEPLOYADA v1 (verify_jwt, solo staff) + probes lógica 11/11 y e2e 8/8
6646da4 feat(spcs): rpc_spcs_duplicados APLICADA + probe con sesiones reales (staff ok, portal 42501) 10/10
c7e7bc3 feat(spcs): rpc_spcs_duplicados — los 3 chequeos de duplicado (studbook_id, nombre normalizado, fecha+padres), solo staff, solo lectura (sin aplicar)
```

```
$ git checkout main && git pull && git merge --no-ff feat/studbook-buscar && git push origin main
7a0a8ee828bd666794829167e17ed17090f7c63b
7a0a8ee828bd666794829167e17ed17090f7c63b	refs/heads/main
```

## 4. Verificación en prod

```
$ git show 7a0a8ee:spcs.html > local.html
$ curl -s "https://sigh.com.ar/spcs.html?v=$RANDOM" -o prod.html      (cada 20 s hasta coincidir)
MATCH after 3 tries
832ad95ff59eac9dc68113cbe34d8b23  local.html
832ad95ff59eac9dc68113cbe34d8b23  prod.html
$ grep -c 'studbook-buscar' prod.html
5
```

## 5. Estado final

- **Base**: `rpc_spcs_duplicados` (A). Sin cambios de datos: `spcs` = 203.
- **Edge Functions**: `studbook-buscar` v1 `verify_jwt:true` (B); `reunion-json` v22 e `invite-user` v5 sin tocar.
- **Sitio**: `spcs.html` nuevo en `sigh.com.ar` (C). Ninguna otra página cambió.
- **Rama** `feat/studbook-buscar` mergeada; queda (no se borra sin pedido).
- Sin † de muerto (no viene en el autocomplete — GOTCHA #96, informe de la pieza C §4).

## 6. Para Yesi (borrador, por si sirve)

> Yesi, en **SPC → + Nuevo SPC** ahora hay arriba un cuadro **"Buscar en el Stud Book"**. Escribís el nombre (o parte), Buscar, y te lista lo que hay con fecha de nacimiento, edad, sexo, pelaje y padres. Apretás **Usar** en el correcto y se llenan solos nombre, fecha, sexo, pelaje, padre, madre y el nº de Stud Book (ese campo no se escribe a mano). Después completás caballeriza/entrenador como siempre y Guardar.
> Si hay dos con el mismo nombre (pasa: BIEN COQUETA son dos), fijate la fecha y los padres antes de Usar.
> Si al guardar te sale un cartel rojo de "ya hay un SPC parecido": si dice mismo nº de Stud Book o misma fecha y padres, es el mismo caballo — tocá **Abrir esa ficha** y editá esa. Si sólo coincide el nombre y es otro animal, **Guardar igual**.
> Si el Stud Book no responde, lo cargás a mano como hasta ahora.

## 7. Pendientes que no son de esta pieza

- Ramas sin mergear (esperan OK): `chore/issue-081-pii-residual-vps`, `feat/buscador-spc-autocompletado`, `fix/condicion-sexo-t8-t10-r9`, `fix/hora-ventanas-r9`, `fix/llamado-chips-fede`.
- Lunes 14/09 post-ratificación: re-correr el DO de provisorios R9 + query de control (CLAUDE.md § R9).
- Cuando exista la API de Diego: reemplazar el bloque «FUENTE» en `studbook-buscar/index.ts`; si pide IP fija, proxy en el VPS.

## 8. Verificación de push (reports)

```
$ git push -u origin reports
$ git ls-remote origin reports
ca10c07957c1261a27ab5f764ba97dd3c4cd03cf	refs/heads/reports
$ git rev-parse HEAD
ca10c07957c1261a27ab5f764ba97dd3c4cd03cf
```
