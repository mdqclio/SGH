# Rama `fix/pdf-inscriptos-condiciones` sin mergear + limpieza de ramas `fix/` y `feat/` mergeadas

- **Fecha**: 2026-10-02
- **`main`**: `054d70b945d0982a3dd57c659cf00efc472ed449`
- **Guards**: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` ✅ · `SELECT nombre FROM clubs WHERE id = '0649e9c5-9e87-4aad-842f-101458e6b33c'`
  → `Hipódromo de Dolores` ✅. Nada de esto escribe en la base; los dos probes corridos son de sólo lectura (0 `insert/update/delete/upsert/rpc`).

## Punto 2 — `fix/pdf-inscriptos-condiciones` (`436cb5d7ffb4bb270f8dd6e4b27196ba17b1669f`, 08/08)

**No se olvidó el arreglo: entró a `main` por cherry-pick. Lo que nunca entró son los dos probes y su fixture.**

La rama tiene 4 commits sobre `c304c0196e9999636281f0f3117ba7e214a5fe27` (07/08):

| Commit de la rama | Qué es | En `main` |
|---|---|---|
| `b7c9cb782dbc389795ae0c45cd5654b7bed63927` fix: condición completa, "Especial" al frente y categoría oficial | `inscripciones.html` | ✅ como **`f1afd9b06031a1d2990e767ee25176b0e5bd2872`** (mismo parche: `git cherry` lo marca `-`) |
| `ca55391d5e251e83927dcf7afd1835f79ef7e564` test: probe de condiciones contra R8 | `tests/probe_pdf_inscriptos_cond.mjs` + `tests/fixtures/r8_carreras.json` | ❌ **falta** |
| `be1292672e04c6c47862a259b4f583018250ff73` fix: R8 vuelve a una página A4 apaisada | `inscripciones.html` (CSS + `clampCond`) | ✅ como **`e1d7859f87dc00324fe6821c3488b70a95af1ff2`** (mismo parche) |
| `436cb5d7ffb4bb270f8dd6e4b27196ba17b1669f` test: probe de altura — ¿entra R8 en una página? | `tests/probe_pdf_inscriptos_layout.mjs` | ❌ **falta** |

**Qué le falta hoy al PDF: nada.** Las 18 piezas del diff de la rama están en `main` (tabla de abajo, una por una): condición
completa sin abreviar, "ESPECIAL" al frente, etiqueta OFICIAL COMPUTABLE / NO COMPUTABLE, sin prefijo de sexo duplicado,
recorte a 2 líneas por palabra con la distancia preservada, condición a 6pt, filas densas, `column-width: 52mm` para el
print móvil, footer sin `flex gap`. Después `main` siguió cambiando la misma función (orden alfabético `'es'`, bolsa efectiva),
sin pisar nada de esto.

**Los dos probes faltantes pasan contra el `main` de hoy** (corridos en un worktree temporal de `main` con los 3 archivos de la
rama): condiciones **12/12 turnos de R8 OK** (contra prod, sólo lectura) y altura **1 página con 12,0 % de holgura** (modelo con el
fixture de R8 del 07/08). Recomendación (no hecha): traerlos a `main` en un PR chico (`git checkout origin/fix/pdf-inscriptos-condiciones --
tests/probe_pdf_inscriptos_cond.mjs tests/probe_pdf_inscriptos_layout.mjs tests/fixtures/r8_carreras.json`) y recién ahí borrar la rama.
**La rama no la borré**: no está mergeada (le faltan esos dos commits) y no entraba en el punto 3. El fixture es sólo de carreras
(condiciones, distancias, conteo de inscriptos por turno): 0 campos de DNI, email, teléfono o nombre de persona.

### Salida cruda

```
$ git log --format="%H · %ad %s" --date=short main..origin/fix/pdf-inscriptos-condiciones   # (el · separa el SHA de la fecha para el chequeo de datos personales)
436cb5d7ffb4bb270f8dd6e4b27196ba17b1669f · 2026-08-08 test(pdf-inscriptos): probe de altura — ¿entra R8 en una página?
be1292672e04c6c47862a259b4f583018250ff73 · 2026-08-08 fix(pdf-inscriptos): R8 vuelve a una página A4 apaisada
ca55391d5e251e83927dcf7afd1835f79ef7e564 · 2026-08-07 test(pdf-inscriptos): probe de condiciones del template contra R8
b7c9cb782dbc389795ae0c45cd5654b7bed63927 · 2026-08-07 fix(pdf-inscriptos): condición completa, "Especial" al frente y categoría oficial
$ git merge-base main origin/fix/pdf-inscriptos-condiciones
c304c0196e9999636281f0f3117ba7e214a5fe27
$ git diff --stat <merge-base> origin/fix/pdf-inscriptos-condiciones
 inscripciones.html                    | 139 ++++++++++++++++-------
 tests/fixtures/r8_carreras.json       |  20 ++++
 tests/probe_pdf_inscriptos_cond.mjs   | 122 ++++++++++++++++++++
 tests/probe_pdf_inscriptos_layout.mjs | 203 ++++++++++++++++++++++++++++++++++
 4 files changed, 441 insertions(+), 43 deletions(-)
$ gh pr list --state all --head fix/pdf-inscriptos-condiciones --json number,state,title
[]
$ git cherry -v main origin/fix/pdf-inscriptos-condiciones
- b7c9cb782dbc389795ae0c45cd5654b7bed63927 fix(pdf-inscriptos): condición completa, "Especial" al frente y categoría oficial
+ ca55391d5e251e83927dcf7afd1835f79ef7e564 test(pdf-inscriptos): probe de condiciones del template contra R8
- be1292672e04c6c47862a259b4f583018250ff73 fix(pdf-inscriptos): R8 vuelve a una página A4 apaisada
+ 436cb5d7ffb4bb270f8dd6e4b27196ba17b1669f test(pdf-inscriptos): probe de altura — ¿entra R8 en una página?
$ git log --oneline main -S"SEXO_EN_TEXTO_RE" -- inscripciones.html | tail -1 ; git log --oneline main -S"clampCond" -- inscripciones.html | tail -1
f1afd9b fix(pdf-inscriptos): condición completa, "Especial" al frente y categoría oficial
e1d7859 fix(pdf-inscriptos): R8 vuelve a una página A4 apaisada

$ # cada pieza del diff de la rama: cuántas veces aparece en inscripciones.html de la rama y de main
column-width: 52mm                                           rama=1 main=1
.pi-especial {                                               rama=1 main=1
.pi-oficial {                                                rama=1 main=1
.pi-condiciones { font-size: 6pt                             rama=1 main=1
margin-bottom: 5pt                                           rama=1 main=1
-webkit-fit-content                                          rama=1 main=1
line-height: 1.25; }                                         rama=2 main=2
padding: 1px 4px; font-size: 8pt                             rama=1 main=1
font-size: 7pt; font-weight: 900; padding: 1px 0             rama=1 main=1
.pi-footer-left, .pi-footer-right { display: block; }        rama=1 main=1
SEXO_EN_TEXTO_RE                                             rama=2 main=2
function buildCond(car)                                      rama=1 main=1
function clampCond                                           rama=1 main=1
COND_CHARS_LINEA = 44                                        rama=1 main=1
categorias_carrera(nombre,es_oficial,es_computable)          rama=1 main=1
OFICIAL NO COMPUTABLE                                        rama=1 main=1
pi-especial">ESPECIAL                                        rama=1 main=1
especial ? 'ESPECIAL '.length                                rama=1 main=1

$ for f in tests/probe_pdf_inscriptos_cond.mjs tests/probe_pdf_inscriptos_layout.mjs tests/fixtures/r8_carreras.json; do git cat-file -e main:$f && echo si || echo no; done
tests/probe_pdf_inscriptos_cond.mjs main=no
tests/probe_pdf_inscriptos_layout.mjs main=no
tests/fixtures/r8_carreras.json main=no
$ grep -nE "\.(insert|update|delete|upsert|rpc)\(" tests/probe_pdf_inscriptos_*.mjs ; echo rc=$?
rc=1

$ # worktree temporal de main + los 3 archivos de la rama; SUPABASE_SECRET_KEY de .env
$ node tests/probe_pdf_inscriptos_cond.mjs

Reunión 8 — 2026-08-16 — 12 turnos  [fuente: prod]

T 1  Todo Caballos de 3 años perdedores 1000 mts
     OFICIAL NO COMPUTABLE
T 2  Todo caballo de 4 años perdedores 800 mts
     OFICIAL NO COMPUTABLE
T 3  Todo caballo de 4 años perdedores 1200 mts
     OFICIAL NO COMPUTABLE
T 4  Todo caballo de 6 años y más edad perdedores 1000 mts
     OFICIAL NO COMPUTABLE
T 5  Todo caballo de 4 años y más edad ganadores de 1 o 2 carreras 1000 mts
     OFICIAL NO COMPUTABLE
T 6  Todo caballo de 3 y 4 años ganadores de 1 o 2 carreras 1000 mts
     OFICIAL NO COMPUTABLE
T 7  Todo caballo de 3,4 y 5 años ganadores de 1 o 2 carreras 1100 mts
     OFICIAL NO COMPUTABLE
T 8  Todo caballo de 6 años y más edad ganadores de 1 o 2 carreras 1200 mts
     OFICIAL NO COMPUTABLE
T 9  Todo caballo de 5 años y más edad ganadores de 1 carrera 1200 mts
     OFICIAL NO COMPUTABLE
T10  ESPECIAL todo caballo de 4 años y + edad ganador de 2 o + carreras 1000 mts
     OFICIAL NO COMPUTABLE
T11  Todo caballo de 5 años y más edad perdedores 1100 mts
     OFICIAL COMPUTABLE
T12  Yeguas de 4 y 5 años perdedoras 800 mts
     OFICIAL COMPUTABLE

✓ OK — 12 turnos verificados

exit=0

$ node tests/probe_pdf_inscriptos_layout.mjs

Modelo de altura — R8, 12 turnos, 100 caballos
Layout: 5 columnas de 151.3pt · condición 6pt · caballos 8pt · categoría 6pt

  alto de página util : 477.8pt
  alto necesario      : 420.7pt  (columna más alta)
  holgura             : 57.2pt  (12.0%)

✓ Entra en 1 página con 12.0% de holgura · condición máx 2 líneas

exit=0
```

## Punto 3 — ramas `fix/` y `feat/` mergeadas en `main`, borradas de `origin`

Criterio: `git branch -r --merged origin/main` (el tip de la rama es ancestro de `main`: todo su contenido ya está). Antes de borrar
se volvió a chequear cada SHA con `git merge-base --is-ancestor` (0 fallas). PR abiertos de esas ramas: ninguno (el único abierto
de `fix/`/`feat/` era el #28, `feat/resultados-historicos-2024-08-18`, que no está mergeada y no se tocó).

- **Borradas: 65** (lista con su SHA abajo). Para restaurar una: `git push origin <sha>:refs/heads/<rama>` (los objetos siguen en
  este clon y en `main`).
- **Quedan 4** `fix/`/`feat/` en `origin`, todas **sin mergear**: `feat/pozo-ratificacion-fase1-cobro`,
  `feat/resultados-historicos-2024-08-18` (PR #28 abierto), `feat/studbook-extract`, `fix/pdf-inscriptos-condiciones` (punto 2).
- Las `chore/` no entraban en el pedido: no se tocaron.

### Lista (antes de borrar): SHA del tip · fecha del último commit · rama

```
c5c599c5cf43e761ef59072c891281f47efb5c6e · 2026-08-30 feat/anular-recibo
5ab83206e29d54586654580662bff7b6e961e2f6 · 2026-09-08 feat/buscador-spc-autocompletado
3f35445a894bef9fe32bb654f56d0ca2de52adb9 · 2026-09-11 feat/caballeriza-el-don-jorge-lp
e5c7094be19a814ae4c07d0c35eb4342ec699b38 · 2026-09-16 feat/caballeriza-titular-opcional-provisorio
481b45709278d985ac731f81209baa40fff1bd1d · 2026-09-02 feat/carta-llamados-selector-reunion
e5a02bdf39486149aab5c745cb97edc8859a59d6 · 2026-08-30 feat/filtro-concepto-pagos
c4684fc73eb0943c52e8602af2ba4942f256b4ca · 2026-09-08 feat/forfait-portal
616ab9d62f6d48e418d1f204aaa2c47e80bb82a7 · 2026-08-30 feat/historial-recibos
a152f2ded3d46397a8d47ae22099e88aad2921dd · 2026-08-23 feat/json-no-computables
b63b6d9cd38b2cc173b5a083749705ddb00d3ecd · 2026-08-28 feat/montas-reales-y-gate
87becc4ff2c1b8259c4d013ecabcdee43a74af53 · 2026-09-20 feat/pagos-carrera-busqueda
6f3508370ade8dfcb35edcb8e47d7afb3e7ff2c2 · 2026-08-27 feat/pagos-rol-y-carrera
f1af62a69a68d3e12250992708198e4248ddd325 · 2026-09-20 feat/pagos-vista-carrera
ebab1c5465d3358762023122eaea3bcb9173d489 · 2026-09-24 feat/pagos-vista-incentivo-y-pagados
07ef2aa4058001f9fca96608d3b213b5bb0b8f2f · 2026-09-08 feat/paridad-llamado-inscripciones
ab10eefe6d4c637cea921704e9ab15febdbd03e5 · 2026-10-02 feat/portal-alta-spc-studbook
83f240337333e56d53c3b7b20d2d7ecd61e0dc6e · 2026-09-16 feat/portal-modificar-inscripcion
b9629ea59272e8e0d10c6027d9778727f1237d98 · 2026-09-11 feat/provisorios-r9
762b9d373828ade1b225853037c52bb432c46fae · 2026-09-21 feat/recibo-una-hoja
1427e7e5bc30d45011bbdb4ab42d95c37015a491 · 2026-09-25 feat/reparto-100-subroles
b3811d78e06b8855c81093c4c27220887fd1d6e0 · 2026-10-02 feat/resultados-reunion-cerrada
840dc83ffce1ff63a0671e236f3181be85586161 · 2026-08-29 feat/reunion-es-prueba
e2f9e85aba0e56e3bbbf803a34131691144851b5 · 2026-09-11 feat/studbook-buscar
06183ddf2cf74f96ad5d048ebc6f559d250ccaf3 · 2026-09-11 feat/studbook-condicion-5-campos
5a1319a204e29e2aac27db3b935bd1882d694972 · 2026-08-30 feat/ui-anular-recibo
59e278ba04fd791cd0da07d2763268a324fcb592 · 2026-08-30 fix/aislamiento-club-cobros
e5050cdf04c290cad078324e8c95cc8bd065d525 · 2026-09-10 fix/alta-entrenador-operador
5e0a57ba0f8f36587991549127f2dad128870d93 · 2026-09-12 fix/aviso-jockey-repetido
72f3b509c5cc4016952b99b6cf4ac6fb75c078c6 · 2026-09-08 fix/bolsa-efectiva-portal
71a5995a796f4e2c5234dab8e47713c9cba075c0 · 2026-09-08 fix/carta-llamados-hora-local
261b3c73ef97f69dfc1ac6ac5ec3118c975c01ca · 2026-09-17 fix/carta-llamados-pdf-numero-turno
bba68945c14b739aff3e3565665c311c533b74bc · 2026-09-07 fix/club-id-alta-propietarios
0b726736cac872e5b75403dfec552522e5c7ff0a · 2026-09-08 fix/condicion-sexo-t8-t10-r9
54ccbad40478036b4ce72367314813f37598d4e0 · 2026-08-27 fix/edad-reglamentaria-unica
564bfd44824b8080088a354d1fe48895c222cad3 · 2026-09-23 fix/guard-staff-rpcs
5ed5504c0701687e1b6d41d074012ae4da6eabdc · 2026-09-08 fix/hora-ventanas-r9
abc49f14d92d1c60b7e15e403f77d1d61be216b0 · 2026-10-02 fix/inscripcion-editar-carrera-de-la-fila
33e72335fe08d626fc13c3cb80a1d0f26066decc · 2026-08-30 fix/issue-067-guard-eliminar-liq
7fcf28d8446371f9ccf1fe8079dfb94205a8ba5c · 2026-09-22 fix/issue-084-montas-post-oficial
bce8f04bfb5e1421bcefee5718e94333eb850dfd · 2026-08-23 fix/json-studbook-diego-r8
f9c314989ab095dcbede52abd9337b559a6c606a · 2026-09-19 fix/liquidaciones-fmtinput-onblur
966b6c823a48427020f1b7b3ecbfc52d302a12d4 · 2026-09-08 fix/llamado-chips-fede
704386f061b240089b9e51622fe333fc41a1456c · 2026-09-18 fix/mandil-colores-nomenclador
298acde5d23d4f42b198dfcc2789838f5b14bfa9 · 2026-09-11 fix/merge-carosueno
d49dd47cda8e875ed522b4b29bc55193357dd86f · 2026-09-12 fix/orden-inscriptos-es
05f665fa347a24ffcb7719a8604d8ab8d0170a87 · 2026-09-27 fix/politicas-escritura-staff
7c0b8161ffa4aa242860d38ac704752a46eaf871 · 2026-08-23 fix/portal-carta-llamados
93b6d3094bffc0bec07af2f5762171e510a70bfe · 2026-10-02 fix/probe-aviso-jockey-savemontas
796eea81047dd016c20a9bd9b5369ca79c620f06 · 2026-10-02 fix/probe-aviso-jockey-sinteticos
8795fec0b3fb72612412176369019b5fc5488639 · 2026-09-24 fix/probes-rojos-main
c5dc9e38dc9e17d29f8cac1347697f02dfcdab1e · 2026-09-17 fix/programa-color-columnas-fijas
92762a4e6e8781f20a822b9b6a5d9c98ade52b2a · 2026-09-23 fix/recibo-corte-mitad
145c36cde894215d03fa07e8d3027edb50c513b2 · 2026-08-28 fix/recibo-pie-cobrador
806889003db2e799c628feb6fb9db99ac4d953ab · 2026-09-27 fix/resoluciones-sanciones-autor
0af0394b02d4caaec9f05ca1a4c174122b24754d · 2026-09-22 fix/revoke-anon-anular-recibo
46c2afc1bdfa9d721c747a7dcb41291e34237966 · 2026-09-25 fix/revoke-fn-reunion-liq-cerrada
7b5999295c74f765d6e16e3af19814e316794b16 · 2026-08-30 fix/rutas-dominio-sigh
ea1f361c648248f4ce602c3dc28ff33be5a3d611 · 2026-09-25 fix/sanciones-alta-club-staff
52db3a4da49188d983220cb09544027cf359c9ce · 2026-09-03 fix/solicitar-acceso-cuenta-existente
29fec91677cecccaaa3bc60b8aa2ef68199bfdef · 2026-09-05 fix/solicitar-acceso-paso-final
03aef1dfdd2ec313af579ac8465b3eb8b10518ee · 2026-09-11 fix/spcs-r9-tanda-1
4446f4013f473adc8e4c3e0a43221428edd0fe11 · 2026-09-11 fix/spcs-r9-tanda-2
6ba34aea57a99229970bf991b967331cb42a94bb · 2026-09-11 fix/spcs-r9-tanda-3
692635939b57c9c7a07ff9e7f1d4d9dfbe1ab0a9 · 2026-09-27 fix/usuarios-pantalla-roles
4b2199f742b0371de22862a724ac7af1e76e4e9f · 2026-09-27 fix/xss-usuarios-portal
```

### Salida cruda

```
$ git fetch --prune origin && git rev-parse origin/main
054d70b945d0982a3dd57c659cf00efc472ed449
$ git branch -r --merged origin/main | grep -E '^origin/(fix|feat)/' | wc -l
65
$ git branch -r | grep -cE 'origin/(fix|feat)/'
69
$ git branch -r --no-merged origin/main | grep -E 'origin/(fix|feat)/'
  origin/feat/pozo-ratificacion-fase1-cobro
  origin/feat/resultados-historicos-2024-08-18
  origin/feat/studbook-extract
  origin/fix/pdf-inscriptos-condiciones
$ gh pr list --state open --json number,headRefName --jq '.[]|"\(.number) \(.headRefName)"'
28 feat/resultados-historicos-2024-08-18
$ for x in <65 SHA>; do git merge-base --is-ancestor $x origin/main || echo "NO ANCESTRO $x"; done
(sin salida)
$ git push origin --delete <las 65 ramas>
 - [deleted]         feat/anular-recibo
 - [deleted]         feat/buscador-spc-autocompletado
 - [deleted]         feat/caballeriza-el-don-jorge-lp
 - [deleted]         feat/caballeriza-titular-opcional-provisorio
 - [deleted]         feat/carta-llamados-selector-reunion
 - [deleted]         feat/filtro-concepto-pagos
 - [deleted]         feat/forfait-portal
 - [deleted]         feat/historial-recibos
 - [deleted]         feat/json-no-computables
 - [deleted]         feat/montas-reales-y-gate
 - [deleted]         feat/pagos-carrera-busqueda
 - [deleted]         feat/pagos-rol-y-carrera
 - [deleted]         feat/pagos-vista-carrera
 - [deleted]         feat/pagos-vista-incentivo-y-pagados
 - [deleted]         feat/paridad-llamado-inscripciones
 - [deleted]         feat/portal-alta-spc-studbook
 - [deleted]         feat/portal-modificar-inscripcion
 - [deleted]         feat/provisorios-r9
 - [deleted]         feat/recibo-una-hoja
 - [deleted]         feat/reparto-100-subroles
 - [deleted]         feat/resultados-reunion-cerrada
 - [deleted]         feat/reunion-es-prueba
 - [deleted]         feat/studbook-buscar
 - [deleted]         feat/studbook-condicion-5-campos
 - [deleted]         feat/ui-anular-recibo
 - [deleted]         fix/aislamiento-club-cobros
 - [deleted]         fix/alta-entrenador-operador
 - [deleted]         fix/aviso-jockey-repetido
 - [deleted]         fix/bolsa-efectiva-portal
 - [deleted]         fix/carta-llamados-hora-local
 - [deleted]         fix/carta-llamados-pdf-numero-turno
 - [deleted]         fix/club-id-alta-propietarios
 - [deleted]         fix/condicion-sexo-t8-t10-r9
 - [deleted]         fix/edad-reglamentaria-unica
 - [deleted]         fix/guard-staff-rpcs
 - [deleted]         fix/hora-ventanas-r9
 - [deleted]         fix/inscripcion-editar-carrera-de-la-fila
 - [deleted]         fix/issue-067-guard-eliminar-liq
 - [deleted]         fix/issue-084-montas-post-oficial
 - [deleted]         fix/json-studbook-diego-r8
 - [deleted]         fix/liquidaciones-fmtinput-onblur
 - [deleted]         fix/llamado-chips-fede
 - [deleted]         fix/mandil-colores-nomenclador
 - [deleted]         fix/merge-carosueno
 - [deleted]         fix/orden-inscriptos-es
 - [deleted]         fix/politicas-escritura-staff
 - [deleted]         fix/portal-carta-llamados
 - [deleted]         fix/probe-aviso-jockey-savemontas
 - [deleted]         fix/probe-aviso-jockey-sinteticos
 - [deleted]         fix/probes-rojos-main
 - [deleted]         fix/programa-color-columnas-fijas
 - [deleted]         fix/recibo-corte-mitad
 - [deleted]         fix/recibo-pie-cobrador
 - [deleted]         fix/resoluciones-sanciones-autor
 - [deleted]         fix/revoke-anon-anular-recibo
 - [deleted]         fix/revoke-fn-reunion-liq-cerrada
 - [deleted]         fix/rutas-dominio-sigh
 - [deleted]         fix/sanciones-alta-club-staff
 - [deleted]         fix/solicitar-acceso-cuenta-existente
 - [deleted]         fix/solicitar-acceso-paso-final
 - [deleted]         fix/spcs-r9-tanda-1
 - [deleted]         fix/spcs-r9-tanda-2
 - [deleted]         fix/spcs-r9-tanda-3
 - [deleted]         fix/usuarios-pantalla-roles
 - [deleted]         fix/xss-usuarios-portal
rc=0
$ git fetch --prune origin && git branch -r | grep -E 'origin/(fix|feat)/'
  origin/feat/pozo-ratificacion-fase1-cobro
  origin/feat/resultados-historicos-2024-08-18
  origin/feat/studbook-extract
  origin/fix/pdf-inscriptos-condiciones
```

## Verificación de push

Chequeo de datos personales sobre lo agregado respecto de `origin/reports`: 2 coincidencias en la primera pasada (el uuid de todos
ceros escrito literal en el SQL propuesto), reescritas como `:uuid_nulo`; segunda pasada: **0**. Push de los dos informes de hoy
(este y su par):

```
$ git push -q origin HEAD:reports && git ls-remote origin reports && git rev-parse HEAD
5e86ea7dda3576d9433d1e606343cdd7acb3b102	refs/heads/reports
5e86ea7dda3576d9433d1e606343cdd7acb3b102
```

Este anexo va en un commit posterior; su SHA es el tip de `origin/reports`.
