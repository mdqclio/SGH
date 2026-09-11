# R9 tanda 2 — EJECUCIÓN (spcs 199 → 201, merge a main) + GALLETINI EZEQUIEL

**Fecha:** 2026-09-11 (noche) · **`main`:** `95b7369` (merge `--no-ff` de `fix/spcs-r9-tanda-2`) · **Guard de `CLAUDE.md`:** **201**
**Escrituras:** `apply_migration spcs_r9_tanda_2` (2 INSERT). Conesera ya estaba aplicada (informe anterior).

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` antes → después | 199 → 201 | ✅ 199 → **201** |
| ref | `unlhcuanfrtpatoipwve` | ✅ |

---

## 1. Ejecución

Pre-chequeos justo antes (§0 del SQL): `a=199 · b=0 filas · c=0 filas · d=0 filas`.

```json
[{"chk":"a","r":"199"},{"chk":"b","r":"0 filas"},{"chk":"c","r":"0 filas"},{"chk":"d","r":"0 filas"}]
```

`apply_migration` **`spcs_r9_tanda_2`**: los 2 `INSERT … WHERE NOT EXISTS` de `migrations/spcs_r9_tanda_2.sql` + `DO` que aborta si `count <> 201`, si hay `studbook_id` repetido o si alguna de las dos no queda `hembra`. Respuesta: `{"success":true}`.

Post:

```json
[{"total":201,"sb_dup":0,"filas":[
 {"fn":"2021-09-15","sb":"432433","cab":null,"ent":null,"reg":null,"club":null,"sexo":"hembra","color":"Alazan","notas":"SB 432433 · https://www.studbook.org.ar/ejemplares/perfil/432433/indiana-maro · alta R9 tanda 2 11/09/2026 · Planilla R9: INDIA MARO.","estado":"activo","nombre":"INDIANA MARO"},
 {"fn":"2023-10-08","sb":"446458","cab":null,"ent":null,"reg":null,"club":null,"sexo":"hembra","color":"Zaino","notas":"SB 446458 · https://www.studbook.org.ar/ejemplares/perfil/446458/que-bella-dona · alta R9 tanda 2 11/09/2026 · Planilla R9: BELLA DOÑA.","estado":"activo","nombre":"QUE BELLA DOÑA"}]}]
```

| check | esperado | real |
|---|---|---|
| `count(spcs)` | 201 | **201** ✅ |
| las dos filas: hembra, `registro_stud_book` NULL, FKs NULL, `notas` con SB + variante | sí | ✅ |
| `studbook_id` repetidos | 0 | **0** ✅ |

Probe `tests/probe_spcs_r9_tanda_1.mjs` **extendido** (baseline 201, assert H = Conesera hembra, assert I = las dos de la tanda 2):

```
✅ A count(spcs) = 201  → real 201
✅ B 18 filas por studbook_id  → real 18
✅ B ETERNA DOCTORA sb=442125 una sola fila  → hay 1
✅ C ETERNA DOCTORA datos = evidencia  → ETERNA DOCTORA|2023-07-29|hembra|Zaino Doradillo|Doctor Embrujo|Eterna Diablita
✅ D ETERNA DOCTORA registro NULL, FKs NULL, activo
✅ E ETERNA DOCTORA notas con SB + url  → SB 442125 · https://www.studbook.org.ar/ejemplares/perfil/442125/eterna-doctora · alta R9 tanda 1 11/09/2026
✅ B DESERT OF DUBAI sb=446340 una sola fila  → hay 1
✅ C DESERT OF DUBAI datos = evidencia  → DESERT OF DUBAI|2023-10-09|macho|Zaino|Dubai Thunder (GB)|Grela (USA)
✅ D DESERT OF DUBAI registro NULL, FKs NULL, activo
✅ E DESERT OF DUBAI notas con SB + url  → SB 446340 · https://www.studbook.org.ar/ejemplares/perfil/446340/desert-of-dubai · alta R9 tanda 1 11/09/2026
✅ B HERMANOSDEMIPATRIA sb=443096 una sola fila  → hay 1
✅ C HERMANOSDEMIPATRIA datos = evidencia  → HERMANOSDEMIPATRIA|2023-09-07|macho|Zaino|Grand Reward (USA)|Cat The Gold
✅ D HERMANOSDEMIPATRIA registro NULL, FKs NULL, activo
✅ E HERMANOSDEMIPATRIA notas con SB + url  → SB 443096 · https://www.studbook.org.ar/ejemplares/perfil/443096/hermanosdemipatria · alta R9 tanda 1 11/09/2026
✅ B ALHENA sb=434871 una sola fila  → hay 1
✅ C ALHENA datos = evidencia  → ALHENA|2022-07-16|hembra|Zaino|Puerto Escondido|Almedha
✅ D ALHENA registro NULL, FKs NULL, activo
✅ E ALHENA notas con SB + url  → SB 434871 · https://www.studbook.org.ar/ejemplares/perfil/434871/alhena · alta R9 tanda 1 11/09/2026
✅ B OLA DOCTOR sb=438421 una sola fila  → hay 1
✅ C OLA DOCTOR datos = evidencia  → OLA DOCTOR|2022-10-24|macho|Zaino|Lead To Win|Sweet Johar (USA)
✅ D OLA DOCTOR registro NULL, FKs NULL, activo
✅ E OLA DOCTOR notas con SB + url  → SB 438421 · https://www.studbook.org.ar/ejemplares/perfil/438421/ola-doctor · alta R9 tanda 1 11/09/2026
✅ B DEL CAMPEON sb=438805 una sola fila  → hay 1
✅ C DEL CAMPEON datos = evidencia  → DEL CAMPEON|2022-10-17|macho|Zaino|Golden Cigars|Sixties Spirit
✅ D DEL CAMPEON registro NULL, FKs NULL, activo
✅ E DEL CAMPEON notas con SB + url  → SB 438805 · https://www.studbook.org.ar/ejemplares/perfil/438805/del-campeon · alta R9 tanda 1 11/09/2026
✅ B TORO MAÑERO sb=440758 una sola fila  → hay 1
✅ C TORO MAÑERO datos = evidencia  → TORO MAÑERO|2022-10-21|macho|Zaino|Hit It A Bomb (USA)|Sarawak Top
✅ D TORO MAÑERO registro NULL, FKs NULL, activo
✅ E TORO MAÑERO notas con SB + url  → SB 440758 · https://www.studbook.org.ar/ejemplares/perfil/440758/toro-manero · alta R9 tanda 1 11/09/2026
✅ B BACON sb=428803 una sola fila  → hay 1
✅ C BACON datos = evidencia  → BACON|2021-07-17|macho|Zaino|Winning Prize|Biosfera
✅ D BACON registro NULL, FKs NULL, activo
✅ E BACON notas con SB + url  → SB 428803 · https://www.studbook.org.ar/ejemplares/perfil/428803/bacon · alta R9 tanda 1 11/09/2026
✅ B NISTEL WIN sb=430420 una sola fila  → hay 1
✅ C NISTEL WIN datos = evidencia  → NISTEL WIN|2021-10-08|macho|Zaino Colorado|Lead To Win|Barbie Nistel
✅ D NISTEL WIN registro NULL, FKs NULL, activo
✅ E NISTEL WIN notas con SB + url  → SB 430420 · https://www.studbook.org.ar/ejemplares/perfil/430420/nistel-win · alta R9 tanda 1 11/09/2026
✅ B HALLOTOP sb=441122 una sola fila  → hay 1
✅ C HALLOTOP datos = evidencia  → HALLOTOP|2021-10-08|macho|Zaino|Maipo Top|Halloweeninseattle
✅ D HALLOTOP registro NULL, FKs NULL, activo
✅ E HALLOTOP notas con SB + url  → SB 441122 · https://www.studbook.org.ar/ejemplares/perfil/441122/hallotop · alta R9 tanda 1 11/09/2026
✅ B EL RISKO sb=421108 una sola fila  → hay 1
✅ C EL RISKO datos = evidencia  → EL RISKO|2020-09-10|macho|Zaino|Security Risk (USA)|Spanakopitas
✅ D EL RISKO registro NULL, FKs NULL, activo
✅ E EL RISKO notas con SB + url  → SB 421108 · https://www.studbook.org.ar/ejemplares/perfil/421108/el-risko · alta R9 tanda 1 11/09/2026
✅ B ATOMIZADOR sb=422969 una sola fila  → hay 1
✅ C ATOMIZADOR datos = evidencia  → ATOMIZADOR|2020-10-26|macho|Zaino Doradillo|Daniel Boone (BRZ)|Atomic Star
✅ D ATOMIZADOR registro NULL, FKs NULL, activo
✅ E ATOMIZADOR notas con SB + url  → SB 422969 · https://www.studbook.org.ar/ejemplares/perfil/422969/atomizador · alta R9 tanda 1 11/09/2026
✅ B THE BEAST PARTY sb=438032 una sola fila  → hay 1
✅ C THE BEAST PARTY datos = evidencia  → THE BEAST PARTY|2022-07-30|macho|Alazan|In The Dark|Rimout Party
✅ D THE BEAST PARTY registro NULL, FKs NULL, activo
✅ E THE BEAST PARTY notas con SB + url  → SB 438032 · https://www.studbook.org.ar/ejemplares/perfil/438032/the-beast-party · alta R9 tanda 1 11/09/2026
✅ B ABARAJALA sb=433798 una sola fila  → hay 1
✅ C ABARAJALA datos = evidencia  → ABARAJALA|2020-10-25|hembra|Zaino|Storm Question|Redondiya
✅ D ABARAJALA registro NULL, FKs NULL, activo
✅ E ABARAJALA notas con SB + url  → SB 433798 · https://www.studbook.org.ar/ejemplares/perfil/433798/abarajala · alta R9 tanda 1 11/09/2026
✅ B GOIADORA sb=428590 una sola fila  → hay 1
✅ C GOIADORA datos = evidencia  → GOIADORA|2021-09-23|hembra|Zaino|Goias Key|Degolladora
✅ D GOIADORA registro NULL, FKs NULL, activo
✅ E GOIADORA notas con SB + url  → SB 428590 · https://www.studbook.org.ar/ejemplares/perfil/428590/goiadora · alta R9 tanda 1 11/09/2026
✅ B QUERELLANTE sb=416936 una sola fila  → hay 1
✅ C QUERELLANTE datos = evidencia  → QUERELLANTE|2019-10-11|macho|Zaino|Daniel Boone (BRZ)|Que Felicidad
✅ D QUERELLANTE registro NULL, FKs NULL, activo
✅ E QUERELLANTE notas con SB + url  → SB 416936 · https://www.studbook.org.ar/ejemplares/perfil/416936/querellante · alta R9 tanda 1 11/09/2026 · Homónimo en el Stud Book (sb 49722, 1947) descartado por edad.
✅ B MARIA CATULENGA sb=440678 una sola fila  → hay 1
✅ C MARIA CATULENGA datos = evidencia  → MARIA CATULENGA|2022-10-15|hembra|Zaino|Fiskardo|Ever Propulsora
✅ D MARIA CATULENGA registro NULL, FKs NULL, activo
✅ E MARIA CATULENGA notas con SB + url + variante  → SB 440678 · https://www.studbook.org.ar/ejemplares/perfil/440678/maria-catulenga · alta R9 tanda 1 11/09/2026 · Planilla R9: MARIA CATULANGA.
✅ B NIÑO OCEANICO sb=428019 una sola fila  → hay 1
✅ C NIÑO OCEANICO datos = evidencia  → NIÑO OCEANICO|2021-09-01|macho|Zaino|Seahenge (USA)|Niña Divina
✅ D NIÑO OCEANICO registro NULL, FKs NULL, activo
✅ E NIÑO OCEANICO notas con SB + url + variante  → SB 428019 · https://www.studbook.org.ar/ejemplares/perfil/428019/nino-oceanico · alta R9 tanda 1 11/09/2026 · Planilla R9: NIÑO OSEANICO.
✅ F ABARAJALA hembra
✅ G 0 studbook_id repetidos en spcs  → []
✅ H CONESERA corregida (hembra, sb 444373)  → {"nombre":"CONESERA","sexo":"hembra","studbook_id":"444373"}
✅ I QUE BELLA DOÑA existe, hembra, datos = SB, nota con variante  → SB 446458 · https://www.studbook.org.ar/ejemplares/perfil/446458/que-bella-dona · alta R9 tanda 2 11/09/2026 · Planilla R9: BELLA DOÑA.
✅ I INDIANA MARO existe, hembra, datos = SB, nota con variante  → SB 432433 · https://www.studbook.org.ar/ejemplares/perfil/432433/indiana-maro · alta R9 tanda 2 11/09/2026 · Planilla R9: INDIA MARO.

79/79 asserts OK
```

## 2. Merge

`fix/spcs-r9-tanda-2` → `main` con `--no-ff`: **`95b7369`**. Trae `migrations/spcs_r9_tanda_2.sql` (EJECUTADA), `migrations/spcs_conesera_sexo.sql` (marcada EJECUTADA), `data/spcs_r9_tanda_2_*`, el probe extendido, `CLAUDE.md` (guard 201, historial 199 → 201, árbol y lista de probes) y `CHANGELOG.md` (`[2026-09-11 noche]`). `git ls-remote origin main` = `95b7369` = `HEAD`.

De la planilla de R9 quedan sin resolver sólo **BIEN COQUETA** (2021 → 5 años, T2 pide 4) y **EL MAS SABIO** (2021 → 5, T5 pide 3-4). Los otros 64 caballos distintos están en el padrón.

---

## 3. GALLETINI EZEQUIEL — por qué Yesi "no lo puede cargar"

(Está también en `2026-09-11_r9-cierre-tanda-2-conesera-galletini.md` §3, con las queries completas. Acá el resumen y la respuesta directa.)

**Respuesta corta: del lado nuestro no hay nada que lo frene.** No existe en `profesionales`, la RLS la deja insertar, el aviso de duplicados no matchea nada y aunque matcheara no bloquea, y producción sirve el archivo con el botón. Lo que queda está en su navegador.

Lo verificado, en orden:

| # | qué | resultado | cómo |
|---|---|---|---|
| 1 | ¿Ya existe? | **No.** 0 filas con `GALLET` / `GALET` en apellido o nombre, de cualquier tipo, cualquier club. | `select … from profesionales where apellido ilike '%GALLET%' or nombre ilike '%GALLET%' or apellido ilike '%GALET%' …` → `[]` |
| 2 | ¿Un EZEQUIEL que le salte? | 4 EZEQUIEL (ACHINGO, GIMENEZ, ORTIZ entrenadores; ACUÑA jockey), **todos con otro apellido**. El aviso busca por **apellido** (`profesionales-duplicados.js:80-84`, `ilike` sobre `apellido`), no por nombre. Ninguno aparece. | query §3 del informe anterior |
| 3 | ¿Le salta el aviso de duplicado? | **No puede bloquear** aunque saltara: el helper es informativo por diseño ("NO BLOQUEA, y es a propósito", header del archivo). Por apellido no hay match. Por DNI: **sin verificar** (no sé qué DNI tipeó) — pero tampoco bloquea. | lectura de `profesionales-duplicados.js` |
| 4 | ¿Hay un pariente? | En **`propietarios`** existe `GALLETTINI, GUSTAVO JAVIER` (doble T, DNI 25041080). Otra persona, otra tabla; el aviso no mira `propietarios`. No interfiere. | query |
| 5 | ¿Intentó y la base lo rechazó? | Sin rastro: 0 profesionales creados hoy, count 190 (igual que a la mañana), 0 auditoría de solicitudes. `profesionales` no tiene trigger de auditoría → un INSERT rechazado por RLS no deja huella, por eso el punto 6. | query |
| 6 | ¿La RLS la deja? | **Sí.** `profesionales_insert` = `WITH CHECK (fn_is_staff())`; `fn_is_staff()` = usuario `activo` con `auth_user_id = auth.uid()` y rol en `super_admin / secretario_carreras / operador`. Yesi: `operador`, activa, `auth_user_id` cargado, club Dolores. | `pg_policies` + `pg_get_functiondef` + `usuarios` |
| 7 | ¿Prod tiene el fix de la mañana? | **Sí.** md5 `profesionales.html` local `e2057bd73a4d` = prod; `profesionales-duplicados.js` `dfa880021c57` = prod. `#btn-nuevo` sin gate de rol (`profesionales.html:143`). | `curl` + `md5sum` |
| 8 | ¿Otro camino de alta que pueda estar usando? | **No hay.** El único "+ Nuevo Entrenador" está en `profesionales.html`; `solicitudes.html:325` sólo linkea ahí; el selector de entrenador de `inscripciones.html` no da de alta. | `grep` |

**Causas que quedan (sin verificar, orden de probabilidad):**

1. **Caché.** `profesionales.html` cambió hoy ~10 AM (merge `c540aa0`). La versión anterior **escondía el botón por JS** para todo rol que no fuera `super_admin`. Si su pestaña de Entrenadores viene de antes, o el navegador le sirvió la copia vieja, ella ve exactamente lo de ayer: sin botón, "no puedo cargar entrenadores". Es el síntoma que describe, palabra por palabra. → `Ctrl+Shift+R` en `sigh.com.ar/profesionales.html` (o `?v=2`).
2. **Un error al guardar que no nos llegó.** Si el botón está y falla el INSERT, la pantalla muestra un toast rojo con `error.message`. Sin ese texto no se puede decir más.
3. **Lo está buscando en Inscripciones**, en el selector de entrenador, no lo encuentra (porque no existe) y lo cuenta como "no lo puedo cargar". El camino es Entrenadores → + Nuevo Entrenador → volver a Inscripciones.

Para cerrar necesito de Yesi: (a) si después de `Ctrl+Shift+R` ve "+ Nuevo Entrenador"; (b) si lo ve y falla, el texto exacto del mensaje rojo; (c) el DNI de Galletini.
