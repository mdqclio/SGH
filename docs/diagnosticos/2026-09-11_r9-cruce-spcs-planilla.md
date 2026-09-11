# R9 — cruce de la planilla de anotaciones contra `spcs` (PLAN, nada ejecutado)

**Fecha:** 2026-09-11 · **SHA de `main` relevado:** `842aa43` · **Branch del informe:** `reports`
**Pedido:** Yesi mandó la planilla de anotaciones de R9 (reunión 9, 20/09/2026). Cruzar, buscar parecidos, chequear duplicados, preparar el scrape. **No se corrió el scraper. No se escribió nada en la DB.**

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `SELECT count(*) FROM spcs` | 181 | ✅ **181** |
| ref del proyecto | `unlhcuanfrtpatoipwve` | ✅ (cliente apuntado a `https://unlhcuanfrtpatoipwve.supabase.co`) |

Todo lo de este informe es **solo lectura**: un `select` sobre `spcs`, `reuniones`, `carreras`, `inscripciones`, `caballerizas`, `profesionales`.

Nota de sesión: apareció un bloque `## Exited Plan Mode` pidiendo trabajar por Bash en vez de Read/Edit. Es el attachment del CLI (`auto_mode`), no viene del usuario ni del system prompt — ignorado, como marca `CLAUDE.md`.

---

## 1. Veredicto

| | cantidad |
|---|---|
| Líneas en la planilla (11 turnos) | **75** |
| Nombres distintos (normalizados, sin mayúsculas ni acentos) | **67** |
| **Caballos distintos** (LOGUARCIUS = LOGUARCIOUS) | **66** |
| Ya están en `spcs` — match exacto | **42** |
| Ya están en `spcs` — match por variante ortográfica (§3) | **2** (CONESERSA → `Conesera`, LOGUARCIUS/LOGUARCIOUS → `LOGUACIOUS`) |
| **Total ya están** | **44** |
| **Hay que dar de alta** | **22** |
| **Hay que completar** (`fecha_nacimiento` o `sexo` NULL entre los que ya están) | **0** — los 181 de `spcs` tienen las dos columnas cargadas |
| Sin resolver / a confirmar con Yesi | **4 ítems** (§7) |

Repeticiones entre turnos (anotan en doble categoría, se resuelve el lunes): OLA DOCTOR (T2,T3) · LOCA DUBAI (T2,T3) · KRISTALINA (T4,T10) · GRILLADA RYE (T4,T10) · IDALIA MARO (T6,T8) · YOOKY (T7,T8) · LE BATEAU (T7,T9) · BABY PARADISE (T10,T11). Ocho caballos, 75 − 8 = 67 líneas distintas. Coincide con lo que anticipó Yesi.

---

## 2. Método

- Normalización idéntica a la del scraper (`tools/studbook_scrape_tanda.mjs`): NFD, sin diacríticos, mayúsculas, solo `[A-Z0-9]`. `BELLA DOÑA` → `BELLADONA`, `ARMOÑOZO` → `ARMONOZO`.
- Match exacto por nombre normalizado contra las **181** filas de `spcs` (sin filtro de club: `spcs` es global, GOTCHA #13).
- Para los que no matchean: Levenshtein ≤ 3 **o** similitud de trigramas ≥ 0.4 **o** contención, top 5. `unaccent()` no está instalada (GOTCHA tanda 4b), por eso el fuzzy se hace en Node, no en SQL.
- Parecidos **dentro de la planilla** (Levenshtein ≤ 2 entre nombres distintos) para detectar el caso LOGUARCIUS/LOGUARCIOUS.
- Duplicados **ya existentes** en `spcs` por nombre normalizado.

Script (`cruce.mjs`, scratchpad, solo lectura, cliente con `SUPABASE_SECRET_KEY` del `.env`):

```javascript
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const lines = readFileSync(process.argv[2],'utf8').trim().split('\n');
const porTurno = {}; const orden = []; const turnosDe = {};
for (const l of lines){ const [t,rest]=l.split('|'); const ns=rest.split('·').map(x=>x.trim()).filter(Boolean); porTurno[t]=ns;
  for(const n of ns){ const k=norm(n); if(!turnosDe[k]){turnosDe[k]={nombre:n,turnos:[]}; orden.push(k);} turnosDe[k].turnos.push(t); if(turnosDe[k].nombre!==n) turnosDe[k].variantes=(turnosDe[k].variantes||[]).concat(n);} }
const sb = createClient('https://unlhcuanfrtpatoipwve.supabase.co', process.env.SUPABASE_SECRET_KEY);
const { data: spcs, error } = await sb.from('spcs').select('id,nombre,fecha_nacimiento,sexo,color,padrillo_nombre,madre_nombre,registro_stud_book,studbook_id,club_id,estado').order('nombre');
if (error) throw error;
const idx = {}; for (const s of spcs){ (idx[norm(s.nombre)] ||= []).push(s); }
function lev(a,b){const m=a.length,n=b.length;const d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);for(let j=1;j<=n;j++)d[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[m][n];}
const tri = s=>{const t=new Set();const p='  '+s+' ';for(let i=0;i<p.length-2;i++)t.add(p.slice(i,i+3));return t;};
const sim = (a,b)=>{const A=tri(a),B=tri(b);let c=0;for(const x of A)if(B.has(x))c++;return c/(A.size+B.size-c);};
const rows=[];
for (const k of orden){ const e=turnosDe[k]; const hits=idx[k]||[];
  const row={planilla:e.nombre,norm:k,turnos:e.turnos.join(','),variantes:e.variantes||[],match:hits.map(h=>({id:h.id,nombre:h.nombre,fn:h.fecha_nacimiento,sexo:h.sexo,color:h.color,padre:h.padrillo_nombre,madre:h.madre_nombre,reg:h.registro_stud_book,sbid:h.studbook_id,club:h.club_id,estado:h.estado}))};
  if(!hits.length){ row.parecidos=spcs.map(s=>({nombre:s.nombre,id:s.id,lev:lev(k,norm(s.nombre)),sim:+sim(k,norm(s.nombre)).toFixed(2)})).filter(x=>x.lev<=3||x.sim>=0.4||norm(x.nombre).includes(k)||k.includes(norm(x.nombre))).sort((a,b)=>a.lev-b.lev||b.sim-a.sim).slice(0,5);}
  rows.push(row);}
// parecidos entre nombres de la planilla (LOGUARCIUS/LOGUARCIOUS)
const intra=[];for(let i=0;i<orden.length;i++)for(let j=i+1;j<orden.length;j++){const l=lev(orden[i],orden[j]);if(l<=2)intra.push({a:turnosDe[orden[i]].nombre,b:turnosDe[orden[j]].nombre,lev:l});}
// duplicados actuales en spcs por nombre normalizado
const dupDb=Object.entries(idx).filter(([,v])=>v.length>1).map(([k,v])=>({norm:k,filas:v.map(s=>({id:s.id,nombre:s.nombre,fn:s.fecha_nacimiento,club:s.club_id}))}));
console.log(JSON.stringify({lineas:lines.reduce((a,l)=>a+l.split('|')[1].split('·').length,0),distintos:orden.length,spcs_total:spcs.length,intra_planilla:intra,dup_en_db:dupDb,rows},null,2));
```

Entrada (`r9_planilla.txt`, un turno por línea, nombres separados por `·`):

```
T1|SI TIN · CONESERSA · ETERNA DOCTORA · DOCTORA APASIONADA · DESERT OF DUBAI · HERMANOSDEMIPATRIA · BELLA DOÑA · ARMOÑOZO
T2|ALHENA · DOCTOR SKY · OLA DOCTOR · BIEN COQUETA · DEL CAMPEON · DOCTORA MIA · LOCA DUBAI · ASTUTO NOTES · TOUCH OF BLUE
T3|OLA DOCTOR · BAHIA ROMANA · LOCA DUBAI · TORO MAÑERO · VISION SECURITY · MARIA CATULANGA
T4|BACON · COLONIAL JOHAN · MARUKA PLUS · LOGUARCIUS · KRISTALINA · REY DE PILA · TOY BOY · LIVIA DRUSA · GRILLADA RYE · NISTEL WIN · NIÑO OSEANICO
T5|NELIDA RIM · NOCHE EN VELA · KUCCINI · AMIGUITO JESUS · EL MAS SABIO
T6|REINA EDITION · FREE CRY · SEMBRADOR CHUCK · FALAYS · IDALIA MARO · HALLOTOP
T7|EL RISKO · YOOKY · SEÑOR MONCHI · ECHO IN THE SKY · ATOMIZADOR · LE BATEAU
T8|YOOKY · IDALIA MARO
T9|WISLA KEN · CHINITA SALTEÑA · QUERELLANTE · ESPLENDID CRAF · LE BATEAU · THE BEAST PARTY
T10|QUINIELA TREND · BABY PARADISE · LOGUARCIOUS · KRISTALINA · GRILLADA RYE · INDIA MARO · ABARAJALA
T11|BUEN MANUEL · TERRIBLE KING · BABY PARADISE · DESTINADO JOHAN · ES SABALERO · INDIO VALIDO · HEART OF GOLD · EL GRAN HECTOR · GOIADORA
```

Comando:

```bash
set -a; . ./.env; set +a
node scratchpad/cruce.mjs scratchpad/r9_planilla.txt > scratchpad/cruce.json
```

### Salida cruda completa

```
lineas 75 distintos 67 spcs 181
INTRA [{"a":"LOGUARCIUS","b":"LOGUARCIOUS","lev":1}]
DUP_DB [{"norm":"WAVERIMOUT","filas":[{"id":"5ebc5e48-2caf-4c44-be6a-ad75f2716850","nombre":"Wave Rimout","fn":"2017-08-08","club":null},{"id":"f277af1c-a4ac-4a98-87d7-b41871718c8d","nombre":"Wave Rimout","fn":"2017-08-08","club":null}]}]
OK    SI TIN [T1] SI TIN 2023-10-07 macho Alazan activo sb=446891 
FALTA CONESERSA [T1] Conesera(lev1,sim0.58)
FALTA ETERNA DOCTORA [T1] sin parecidos
OK    DOCTORA APASIONADA [T1] DOCTORA APASIONADA 2023-09-29 hembra Zaino activo sb=- 
FALTA DESERT OF DUBAI [T1] sin parecidos
FALTA HERMANOSDEMIPATRIA [T1] sin parecidos
FALTA BELLA DOÑA [T1] sin parecidos
OK    ARMOÑOZO [T1] ARMOÑOZO 2023-09-02 macho Zaino activo sb=- 
FALTA ALHENA [T2] BACHUNA(lev3,sim0.07)
OK    DOCTOR SKY [T2] DOCTOR SKY 2022-10-25 macho Zaino activo sb=- 
FALTA OLA DOCTOR [T2,T3] sin parecidos
FALTA BIEN COQUETA [T2] sin parecidos
FALTA DEL CAMPEON [T2] sin parecidos
OK    DOCTORA MIA [T2] DOCTORA MIA 2022-10-26 hembra Alazan activo sb=- 
OK    LOCA DUBAI [T2,T3] LOCA DUBAI 2022-11-06 hembra Zaino activo sb=- 
OK    ASTUTO NOTES [T2] ASTUTO NOTES 2022-10-13 macho Alazan activo sb=- 
OK    TOUCH OF BLUE [T2] TOUCH OF BLUE 2022-10-30 hembra Zaino activo sb=441094 
OK    BAHIA ROMANA [T3] BAHIA ROMANA 2022-08-10 hembra Alazan activo sb=435330 
FALTA TORO MAÑERO [T3] sin parecidos
OK    VISION SECURITY [T3] VISION SECURITY 2022-10-08 macho Zaino activo sb=- 
FALTA MARIA CATULANGA [T3] sin parecidos
FALTA BACON [T4] BACHUNA(lev3,sim0.27), DARIN(lev3,sim0)
OK    COLONIAL JOHAN [T4] COLONIAL JOHAN 2021-10-15 macho Zaino activo sb=432758 
OK    MARUKA PLUS [T4] MARUKA PLUS 2021-10-20 hembra Alazan activo sb=430437 
FALTA LOGUARCIUS [T4] LOGUACIOUS(lev2,sim0.38)
OK    KRISTALINA [T4,T10] KRISTALINA 2021-11-11 hembra Zaino Colorado activo sb=- 
OK    REY DE PILA [T4] REY DE PILA 2021-10-14 macho Zaino activo sb=- 
OK    TOY BOY [T4] TOY BOY 2021-10-28 macho Alazan activo sb=- 
OK    LIVIA DRUSA [T4] LIVIA DRUSA 2020-09-16 hembra Zaino activo sb=426999 
OK    GRILLADA RYE [T4,T10] GRILLADA RYE 2019-11-12 hembra Zaino Colorado activo sb=- 
FALTA NISTEL WIN [T4] sin parecidos
FALTA NIÑO OSEANICO [T4] sin parecidos
OK    NELIDA RIM [T5] NELIDA RIM 2022-11-02 hembra Zaino activo sb=439480 
OK    NOCHE EN VELA [T5] NOCHE EN VELA 2022-07-28 hembra Zaino Doradillo activo sb=- 
OK    KUCCINI [T5] KUCCINI 2022-07-28 macho Zaino Negro activo sb=- 
OK    AMIGUITO JESUS [T5] AMIGUITO JESUS 2022-07-29 macho Zaino activo sb=436018 
FALTA EL MAS SABIO [T5] sin parecidos
OK    REINA EDITION [T6] REINA EDITION 2021-10-24 hembra Alazan activo sb=432407 
OK    FREE CRY [T6] FREE CRY 2021-10-03 macho Tordillo activo sb=430759 
OK    SEMBRADOR CHUCK [T6] SEMBRADOR CHUCK 2020-09-29 macho Zaino activo sb=- 
OK    FALAYS [T6] FALAYS 2021-10-26 macho Zaino activo sb=- 
OK    IDALIA MARO [T6,T8] IDALIA MARO 2021-10-15 hembra Zaino activo sb=431374 
FALTA HALLOTOP [T6] sin parecidos
FALTA EL RISKO [T7] sin parecidos
OK    YOOKY [T7,T8] YOOKY 2020-08-15 hembra Tordillo activo sb=431580 
OK    SEÑOR MONCHI [T7] SEÑOR MONCHI 2020-09-27 macho Zaino activo sb=420852 
OK    ECHO IN THE SKY [T7] ECHO IN THE SKY 2020-10-08 macho Tordillo activo sb=- 
FALTA ATOMIZADOR [T7] sin parecidos
OK    LE BATEAU [T7,T9] LE BATEAU 2020-10-20 macho Zaino activo sb=422126 
OK    WISLA KEN [T9] WISLA KEN 2021-09-28 hembra Zaino activo sb=433894 
OK    CHINITA SALTEÑA [T9] CHINITA SALTEÑA 2021-08-01 hembra Zaino activo sb=- 
FALTA QUERELLANTE [T9] sin parecidos
OK    ESPLENDID CRAF [T9] ESPLENDID CRAF 2020-10-18 macho Zaino activo sb=421807 
FALTA THE BEAST PARTY [T9] sin parecidos
OK    QUINIELA TREND [T10] QUINIELA TREND 2018-09-23 hembra Zaino activo sb=408157 
OK    BABY PARADISE [T10,T11] BABY PARADISE 2019-10-08 hembra Alazan activo sb=- 
FALTA LOGUARCIOUS [T10] LOGUACIOUS(lev1,sim0.64)
FALTA INDIA MARO [T10] IDALIA MARO(lev3,sim0.4)
FALTA ABARAJALA [T10] sin parecidos
OK    BUEN MANUEL [T11] BUEN MANUEL 2021-09-20 macho Zaino activo sb=- 
OK    TERRIBLE KING [T11] TERRIBLE KING 2019-08-23 macho Tordillo activo sb=414959 
OK    DESTINADO JOHAN [T11] DESTINADO JOHAN 2020-09-07 macho Zaino activo sb=- 
OK    ES SABALERO [T11] ES SABALERO 2021-10-20 macho Tordillo activo sb=432333 
OK    INDIO VALIDO [T11] INDIO VALIDO 2021-10-28 macho Zaino activo sb=- 
OK    HEART OF GOLD [T11] HEART OF GOLD 2021-11-24 macho Zaino activo sb=- 
OK    EL GRAN HECTOR [T11] EL GRAN HECTOR 2021-08-25 macho Zaino activo sb=430047 
FALTA GOIADORA [T11] sin parecidos
```

---

## 3. Parecidos — los dos que son el mismo caballo con otro nombre

Query de detalle sobre los candidatos (más IDALIA MARO y Wave Rimout, ver §5 y §6):

```sql
select s.id, s.nombre, s.fecha_nacimiento, s.sexo, s.color, s.padrillo_nombre, s.madre_nombre, s.registro_stud_book, s.studbook_id, s.club_id, s.estado, s.created_at::date,
 cb.nombre caballeriza, p.apellido||' '||coalesce(p.nombre,'') entrenador,
 (select count(*) from inscripciones i where i.spc_id=s.id) n_inscr,
 (select string_agg(distinct r.numero::text, ',') from inscripciones i join carreras c on c.id=i.carrera_id join reuniones r on r.id=c.reunion_id where i.spc_id=s.id) reuniones,
 (select string_agg(distinct cb2.nombre, ' | ') from inscripciones i left join caballerizas cb2 on cb2.id=i.caballeriza_id where i.spc_id=s.id) cab_inscr
from spcs s left join caballerizas cb on cb.id=s.caballeriza_id left join profesionales p on p.id=s.entrenador_id
where upper(s.nombre) in ('LOGUACIOUS','CONESERA','WAVE RIMOUT','IDALIA MARO') order by s.nombre, s.created_at
```

Salida cruda:

```json
[{"id":"1f645327-a6da-449b-8a62-fdb577a8658e","nombre":"Conesera","fecha_nacimiento":"2023-09-20","sexo":"macho","color":null,"padrillo_nombre":"Emmanuel","madre_nombre":"Milonga Burrera","registro_stud_book":null,"studbook_id":null,"club_id":null,"estado":"activo","created_at":"2026-05-09","caballeriza":"Abuelo Calin","entrenador":"ALDAY ADRIAN ALFREDO","n_inscr":2,"reuniones":"6,9","cab_inscr":"Abuelo Calin | EL BATARAZ"},
 {"id":"b743522a-4e80-4694-a0ce-cec99663787f","nombre":"IDALIA MARO","fecha_nacimiento":"2021-10-15","sexo":"hembra","color":"Zaino","padrillo_nombre":"Engelhard","madre_nombre":"Itzel Chica","registro_stud_book":null,"studbook_id":"431374","club_id":null,"estado":"activo","created_at":"2026-08-05","caballeriza":"ABUELO FLORO","entrenador":"PAGANO JUAN MAURICIO","n_inscr":2,"reuniones":"8","cab_inscr":"ABUELO FLORO"},
 {"id":"71911106-b45b-4381-b077-41195ee67f81","nombre":"LOGUACIOUS","fecha_nacimiento":"2021-10-23","sexo":"hembra","color":"Zaino","padrillo_nombre":"Le Blues","madre_nombre":"Effervesence","registro_stud_book":null,"studbook_id":"431567","club_id":null,"estado":"activo","created_at":"2026-08-04","caballeriza":"EL NIETO","entrenador":"DIAZ EMILIANO LUJAN","n_inscr":2,"reuniones":"8","cab_inscr":"EL NIETO"},
 {"id":"f277af1c-a4ac-4a98-87d7-b41871718c8d","nombre":"Wave Rimout","fecha_nacimiento":"2017-08-08","sexo":"macho","color":null,"padrillo_nombre":"Remote (GB)","madre_nombre":"Holiday Wave","registro_stud_book":null,"studbook_id":null,"club_id":null,"estado":"activo","created_at":"2026-05-07","caballeriza":"LOS MELOS","entrenador":null,"n_inscr":1,"reuniones":"6","cab_inscr":"LOS MELOS"},
 {"id":"5ebc5e48-2caf-4c44-be6a-ad75f2716850","nombre":"Wave Rimout","fecha_nacimiento":"2017-08-08","sexo":"macho","color":"Zaino","padrillo_nombre":"Remote (GB)","madre_nombre":"Holiday Wave","registro_stud_book":null,"studbook_id":null,"club_id":null,"estado":"activo","created_at":"2026-06-12","caballeriza":"LOS MELOS","entrenador":"DE LA TORRE GABRIEL","n_inscr":1,"reuniones":"8","cab_inscr":"LOS MELOS"}]
```

### 3a. LOGUARCIUS (T4) / LOGUARCIOUS (T10) → `LOGUACIOUS` (id `71911106-…`)

| evidencia | valor |
|---|---|
| Levenshtein | LOGUARCIOUS↔LOGUACIOUS = **1** · LOGUARCIUS↔LOGUACIOUS = 2 · LOGUARCIUS↔LOGUARCIOUS = 1 |
| Caballeriza en `spcs` | **EL NIETO** — la misma que dice la planilla |
| Sexo / edad | hembra, nac. 2021-10-23 → **5 años** al 20/09/2026. Encaja en T4 (5 y + perdedores) y en T10 (yeguas perdedoras). Un mismo caballo anotado en dos categorías, como los otros 8 repetidos |
| Historial | ya corrió en R8 (2 inscripciones, caballeriza EL NIETO) |
| Stud Book | `studbook_id` 431567 — la grafía oficial es **LOGUACIOUS** (sin R). Las dos formas de la planilla son typos |

**Conclusión: es uno solo, ya existe. No es alta.** Cero altas por este par.

### 3b. CONESERSA (T1) → `Conesera` (id `1f645327-…`)

| evidencia | valor |
|---|---|
| Levenshtein | **1** (una S de más) |
| Sexo / edad | macho, nac. 2023-09-20 → **3 años**. T1 es "3 años perdedor" |
| Historial | corrió R6 y **ya está inscripto en R9 T1** (query §4) |
| Faltantes en la ficha | `color` NULL, `studbook_id` NULL, `registro_stud_book` NULL. Fecha y sexo sí están → el gate de edad lo valida |

**Conclusión: es el mismo, ya existe y ya está inscripto en el turno.** No es alta. Entra al scrape sólo para cotejar pedigree (Emmanuel × Milonga Burrera) y completar `studbook_id`/`color` — opcional, no bloquea nada.

### 3c. Descartados como parecidos (son caballos distintos)

| planilla | candidato en DB | por qué NO es el mismo |
|---|---|---|
| INDIA MARO (T10) | IDALIA MARO (lev 3) | IDALIA MARO figura **aparte** en la misma planilla (T6, T8). Mismo sufijo MARO = misma caballeriza/criador, seguramente hermanas o compañeras de stud. Se confirma con el scrape (padre/madre/fecha) |
| BACON (T4) | BACHUNA (lev 3), DARIN | ruido del umbral, nada que ver |
| ALHENA (T2) | BACHUNA (lev 3) | ruido |

---

## 4. Estado actual de R9 en la DB

```sql
select r.id, r.numero, r.fecha, r.estado, r.es_prueba,
 (select count(*) from carreras c where c.reunion_id=r.id) turnos,
 (select count(*) from inscripciones i join carreras c on c.id=i.carrera_id where c.reunion_id=r.id) inscr
from reuniones r where r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' order by r.fecha desc limit 5
```

```json
[{"id":"a0000000-0000-0000-0000-000000009999","numero":9999,"fecha":"2099-01-01","estado":"cancelada","es_prueba":true,"turnos":3,"inscr":17},
 {"id":"a982b59e-808a-4799-bc95-d50511c9b58e","numero":12,"fecha":"2026-12-27","estado":"programada","es_prueba":false,"turnos":0,"inscr":0},
 {"id":"7678b605-6cd0-4457-9e23-ea8b7d832b3c","numero":11,"fecha":"2026-11-22","estado":"programada","es_prueba":false,"turnos":0,"inscr":0},
 {"id":"4d53f231-3819-4080-a214-cd623d7d4d87","numero":10,"fecha":"2026-10-11","estado":"programada","es_prueba":false,"turnos":0,"inscr":0},
 {"id":"cafa37d6-89f4-45cb-a0d9-835bc27407e9","numero":9,"fecha":"2026-09-20","estado":"publicada","es_prueba":false,"turnos":11,"inscr":5}]
```

R9 = `cafa37d6-89f4-45cb-a0d9-835bc27407e9`, publicada, 11 turnos, **5 inscripciones ya cargadas**.

```sql
select c.numero_turno, c.estado, to_jsonb(c) - 'id' - 'reunion_id' - 'created_at' - 'updated_at' - 'club_id' as cols,
 (select string_agg(s.nombre||' ('||i.estado||')', ', ' order by s.nombre) from inscripciones i join spcs s on s.id=i.spc_id where i.carrera_id=c.id) inscriptos
from carreras c where c.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' order by c.numero_turno
```

Resumen de la salida (columnas relevantes; la fila completa tiene además bolsa, distribución de premios, fechas de apertura/cierre — todas iguales entre turnos salvo la bolsa):

| T | pista | m | `edad_min` | `edad_max` | `condicion_sexo` | `condicion_handicap` (texto) | inscriptos hoy |
|---|---|---|---|---|---|---|---|
| 1 | tierra | 800 | 3 | 3 | ambos | Todo caballo 3 años perdedor. | Conesera, SI TIN |
| 2 | tierra | 800 | 4 | 4 | ambos | Todo caballo 4 años perdedor. | — |
| 3 | cesped | 1200 | 4 | 4 | ambos | Todo caballo 4 años perdedor. | — |
| 4 | cesped | 800 | 5 | 10 | ambos | Todo caballo 5 años y + edad perdedor. | — |
| 5 | tierra | 1000 | **5** | 10 | ambos | Todo caballo **3 y 4 años** ganador de 1 o 2 carreras. | — |
| 6 | tierra | 1000 | 5 | 10 | ambos | Todo caballo de 5 años ganador de 1 o 2 carreras. | — |
| 7 | cesped | 1100 | 6 | 10 | ambos | Todo caballo 6 años y + edad ganadores de 1 o 2 carreras. | LATIN PRESUMIDA |
| 8 | tierra | 1200 | 5 | NULL | hembras | Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras. | LATIN PRESUMIDA |
| 9 | tierra | 1100 | **5** | 10 | ambos | Especial Todo caballo **4 años y +** edad ganador de 3 o mas carreras. | — |
| 10 | cesped | 1100 | **5** | 10 | hembras | Yeguas **5 años y +** edad perdedoras. (planilla: **4 y 5 años**) | LATIN RAIN |
| 11 | tierra | 1200 | 5 | **5** | ambos | Todo caballo 5 años **y +** edad perdedor. | — |

`cierre_inscripcion` de los 11 turnos: `2026-09-11T15:00:00+00:00` = **hoy 12:00 hora Argentina**. Ratificación 14/09.

Dos cosas que salen de acá y **no son de este pedido** pero pegan directo en la carga del lunes (van a §7):

- **`edad_minima/maxima` contradice el texto en T5, T9, T10 y T11.** El gate de inscripción valida contra las columnas, no contra el texto (`probe_edad_reglamentaria.mjs`). Con los datos actuales rechaza a todos los 3-4 años de T5 (NELIDA RIM, NOCHE EN VELA, KUCCINI, AMIGUITO JESUS son 2022 → 4 años), a WISLA KEN y CHINITA SALTEÑA en T9 (2021 → 5, pasan) pero rechazaría cualquier 4 años, y en T11 rechaza a todo lo mayor de 5 (BABY PARADISE 2019, TERRIBLE KING 2019, DESTINADO JOHAN 2020, GOIADORA si es ≥6). Mismo tipo de bug que el fix de `condicion_sexo` en T8/T10 del 08/09.
- **T10: "yeguas 4 y 5 años" en la planilla vs "5 años y +" en la DB.** Además, de las que ya están, QUINIELA TREND (2018, 8 años), BABY PARADISE (2019, 7) y GRILLADA RYE (2019, 7) no encajan en "4 y 5" ni bajo una lectura ni bajo la otra… salvo que el texto de la DB sea el bueno y la planilla el que está mal. **Pregunta para Yesi/Fede**, no lo resuelvo acá.
- Tres inscriptos que **no están en la planilla**: LATIN PRESUMIDA (T7 y T8), LATIN RAIN (T10). Cargados antes por otra vía (portal o secretaría). No los toco.

---

## 5. Los que ya están (44) — ¿tienen `fecha_nacimiento` y `sexo`?

```sql
select current_database(), (select count(*) from spcs) as spcs_total,
(select count(*) from spcs where fecha_nacimiento is null) as sin_fecha,
(select count(*) from spcs where sexo is null) as sin_sexo,
(select count(*) from spcs where fecha_nacimiento is null or sexo is null) as incompletos,
(select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) from information_schema.columns where table_name='spcs' and table_schema='public') as cols
```

```json
[{"current_database":"postgres","spcs_total":181,"sin_fecha":0,"sin_sexo":0,"incompletos":0,"cols":"id:uuid, club_id:uuid, nombre:character varying, registro_stud_book:character varying, fecha_nacimiento:date, sexo:USER-DEFINED, color:character varying, marcas:text, padrillo_nombre:character varying, madre_nombre:character varying, abuela_materna:character varying, pais_origen:character varying, caballeriza_id:uuid, entrenador_id:uuid, jockey_habitual_id:uuid, estado:USER-DEFINED, notas:text, doc_url:text, foto_url:text, created_at:timestamp with time zone, updated_at:timestamp with time zone, certificado_correr:boolean, ult_performances:text, studbook_id:text"}]
```

**Incompletos para el gate: 0.** Los 181 tienen las dos columnas; los 44 de la planilla también (se ve en la salida cruda de §2: cada `OK` trae fecha y sexo).

Chequeo de sexo contra los turnos de yeguas: T8 → YOOKY hembra, IDALIA MARO hembra ✅. T10 → QUINIELA TREND, BABY PARADISE, KRISTALINA, GRILLADA RYE, LOGUACIOUS: todas hembra ✅ (INDIA MARO y ABARAJALA son alta, se ve en el scrape).

Lo que sí falta, **sin bloquear nada**: `studbook_id` NULL en **23 de los 44** (DOCTORA APASIONADA, ARMOÑOZO, DOCTOR SKY, DOCTORA MIA, LOCA DUBAI, ASTUTO NOTES, VISION SECURITY, KRISTALINA, REY DE PILA, TOY BOY, GRILLADA RYE, NOCHE EN VELA, KUCCINI, SEMBRADOR CHUCK, FALAYS, ECHO IN THE SKY, CHINITA SALTEÑA, BABY PARADISE, BUEN MANUEL, DESTINADO JOHAN, INDIO VALIDO, HEART OF GOLD, Conesera) y `color` NULL en 1 (Conesera). No es parte de este pedido; queda anotado como backfill opcional por si se quiere aprovechar la tanda.

---

## 6. Duplicados

### 6a. Ya existentes en `spcs` (antes de insertar nada)

Scan por nombre normalizado sobre las 181: **un solo par**.

```
DUP_DB [{"norm":"WAVERIMOUT","filas":[{"id":"5ebc5e48-2caf-4c44-be6a-ad75f2716850","nombre":"Wave Rimout","fn":"2017-08-08","club":null},{"id":"f277af1c-a4ac-4a98-87d7-b41871718c8d","nombre":"Wave Rimout","fn":"2017-08-08","club":null}]}]
```

`Wave Rimout` sigue duplicado. Es el mismo caso anotado en `GATE_4_1_BACKFILL_TENENCIA.md`, `CIRCUITO_ALTA_SPCS_R8.md`, `FIX_JSON_STUDBOOK_R8.md`, `PERFORMANCES_R8.md` y `TANDA_5_PUNTO_5_R8.md`; el `PLAN_DUPLICADOS_SPC.md` del 23/08 unificó `Fist Queen` y `Malenuchi` pero **este par quedó**. Cambió algo desde entonces: **ahora las dos filas tienen una inscripción cada una** (`f277af1c` en R6, `5ebc5e48` en R8, ambas caballeriza LOS MELOS), así que unificar ya no es "borrar la que tiene cero" — hay que repuntar una inscripción. No está en la planilla de R9, no bloquea esta tanda. Queda en §7.

### 6b. Dentro de la planilla

```
INTRA [{"a":"LOGUARCIUS","b":"LOGUARCIOUS","lev":1}]
```

Un solo par con Levenshtein ≤ 2, ya resuelto en §3a. Ningún otro nombre de la planilla se parece a otro.

### 6c. Chequeo pre-insert propuesto para los 22 (a correr DESPUÉS del scrape, antes de cualquier INSERT)

| # | contra qué | cómo | estado |
|---|---|---|---|
| 1 | nombre normalizado vs `spcs.nombre` | hecho arriba: 0 coincidencias para los 22 | ✅ hecho |
| 2 | parecidos por Levenshtein/trigramas vs `spcs.nombre` | hecho arriba: los 2 reales se sacaron de la lista, el resto es ruido | ✅ hecho |
| 3 | `sb_id` del scrape vs `spcs.studbook_id` | `spcs.studbook_id` tiene UNIQUE (`CIRCUITO_ALTA_SPCS_R8.md`): un caballo ya cargado con otro nombre (typo tipo Conesera) revienta en el INSERT; mejor detectarlo antes con un `select … where studbook_id in (…)` | ⏳ post-scrape |
| 4 | `fecha_nacimiento + padrillo_nombre + madre_nombre` del scrape vs `spcs` | atrapa al mismo caballo cargado a mano sin `studbook_id` y con nombre distinto (los 23 de §5 no tienen `studbook_id`, así que el chequeo 3 no los cubre) | ⏳ post-scrape |
| 5 | homónimos en el Stud Book (`MATCH_AMBIGUO`) | el scraper no elige solo; se desambigua con la edad del turno (T1 = 2023, T2/T3 = 2022, etc.) y se documenta | ⏳ post-scrape |
| 6 | dentro de la tanda | 22 nombres normalizados distintos, sin parecidos entre sí | ✅ hecho |

---

## 7. El scrape — preparado, NO corrido

### Qué devuelve hoy `tools/studbook_scrape_tanda.mjs`

Lee el autocomplete público del Stud Book (`/ejemplares/autocomplete?tipo=1&muerto=1&term=`), match **exacto** por nombre normalizado, no escribe en la DB, emite JSON. Por cada alta:

| campo del scraper | → columna `spcs` | alcanza para el alta |
|---|---|---|
| `nombre_sb` | `nombre` (grafía oficial) | ✅ |
| `fecha_nacimiento` (ISO desde dd/mm/yyyy) | `fecha_nacimiento` | ✅ — el gate de edad |
| `sexo` (`Macho/Hembra/Castrado` → `macho/hembra/castrado`) | `sexo` | ✅ — el gate de yeguas |
| `color` | `color` (pelaje) | ✅ |
| `padrillo_nombre` | `padrillo_nombre` | ✅ |
| `madre_nombre` | `madre_nombre` | ✅ |
| `sb_id` | `studbook_id` (UNIQUE) | ✅ |
| `tomo` / `folio` | `registro_stud_book` (hoy NULL en toda la base — nadie lo cargó nunca; decidir formato, p.ej. `T{tomo} F{folio}`) | ⚠ campo existe, formato no fijado |
| `abuelo_materno` | *(no hay columna — `abuela_materna` sí, pero es otro dato)* | — |
| `pais_origen` (bandera `/10.png` = Argentina), `url_perfil`, `leyenda`, `raza`, `alertas` | evidencia / `notas` | ✅ |

**Sí alcanza** para los seis que se pidieron: fecha de nacimiento, sexo, pelaje, padre, madre, registro. Lo único a definir es el formato de `registro_stud_book`, que nunca se usó. Lo que **no** trae el autocomplete: caballeriza, entrenador, propietario — eso sale de la planilla de Yesi, como en las tandas anteriores.

Alertas automáticas del script: sexo desconocido, `raza != 4` (no SPC), bandera no argentina. Casos sin match exacto o con homónimos van a `NO_RESUELTOS` con los candidatos, nunca se eligen solos.

### Lista de nombres a scrapear (`r9_nombres_scrape.txt`)

```
# R9 (20/09/2026) — nombres a scrapear del Stud Book. Planilla de Yesi, 11/09.
# 22 altas (no existen en spcs por nombre normalizado ni por parecido)
ETERNA DOCTORA
DESERT OF DUBAI
HERMANOSDEMIPATRIA
BELLA DOÑA
ALHENA
OLA DOCTOR
BIEN COQUETA
DEL CAMPEON
TORO MAÑERO
MARIA CATULANGA
BACON
NISTEL WIN
NIÑO OSEANICO
EL MAS SABIO
HALLOTOP
EL RISKO
ATOMIZADOR
QUERELLANTE
THE BEAST PARTY
INDIA MARO
ABARAJALA
GOIADORA
# 2 confirmaciones (ya existen, se scrapean sólo para cotejar pedigree y completar studbook_id/color; NO son alta)
CONESERA
LOGUACIOUS
```

**22 altas + 2 confirmaciones.** Las 2 confirmaciones (CONESERA, LOGUACIOUS) van con la grafía de la DB, no la de la planilla, para que el match exacto pegue; sirven para cotejar padre/madre/fecha y llenar `studbook_id`/`color` en la fila que ya existe. **No generan INSERT.**

Comando, cuando se apruebe:

```bash
node tools/studbook_scrape_tanda.mjs data/r9_tanda_1_scrape.json data/r9_tanda_1_nombres.txt r9-1 181
```

(`snapshot_spcs` = 181, el baseline vigente.) Salida: JSON de evidencia + una línea `OK`/`FALTA` por nombre en stdout. Después de eso: chequeos 3-4-5 de §6c, y recién ahí el `.sql` de INSERTs propuestos para revisión.

Riesgo conocido: `docs/diagnosticos/2026-09-10_ips-fijas-consulta-studbook.md` — el Stud Book puede rate-limitear; 24 requests secuenciales es del orden de las tandas anteriores (tanda 4 = 11, pedigree de julio = 26).

### Lista de altas por turno (para que Yesi la vea)

| T | altas |
|---|---|
| 1 | ETERNA DOCTORA · DESERT OF DUBAI · HERMANOSDEMIPATRIA · BELLA DOÑA |
| 2 | ALHENA · OLA DOCTOR (tb. T3) · BIEN COQUETA · DEL CAMPEON |
| 3 | TORO MAÑERO · MARIA CATULANGA |
| 4 | BACON · NISTEL WIN · NIÑO OSEANICO |
| 5 | EL MAS SABIO |
| 6 | HALLOTOP |
| 7 | EL RISKO · ATOMIZADOR |
| 8 | — |
| 9 | QUERELLANTE · THE BEAST PARTY |
| 10 | INDIA MARO · ABARAJALA |
| 11 | GOIADORA |

---

## 8. Sin resolver / preguntas abiertas

1. **T5, T9, T10, T11: `edad_minima/maxima_anos` no coincide con el texto del handicap** (§4). El gate rechaza inscripciones válidas. Hay que corregir las columnas antes de cargar (fix chico tipo `fix/condicion-sexo-t8-t10-r9`), pero es otro pedido — **confirmar con Yesi** qué edad manda en cada turno.
2. **T10: planilla dice "yeguas 4 y 5 años", DB dice "5 años y +", y tres de las anotadas tienen 7-8 años.** Alguien tiene el texto mal. Pregunta para Yesi.
3. **Wave Rimout duplicado** (§6a) sigue sin unificar y ahora cada fila tiene una inscripción. Fuera de R9; conviene cerrarlo con el criterio de `PLAN_DUPLICADOS_SPC.md` en un plan aparte.
4. **Formato de `registro_stud_book`** (tomo/folio): columna existe, nunca se cargó. Decidir formato antes del INSERT o dejarlo NULL como hasta ahora (opción conservadora: NULL, y `studbook_id` + `url_perfil` en `notas` como evidencia, igual que la tanda 4/5).

Menor, sin decisión pendiente: `cierre_inscripcion` de R9 es hoy 12:00 ARG — la carga del lunes va contra un turno ya "cerrado" en la columna; en las tandas anteriores esto no bloqueó nada porque la secretaría carga por `inscripciones.html` sin ese gate, pero conviene tenerlo presente.

---

## 9. Próximo paso (esperando OK)

1. OK a la lista de 22 → correr el scrape (comando de §7), sin tocar la DB.
2. Chequeos 3-4-5 de §6c sobre el JSON.
3. Escribir `migrations/spcs_r9_tanda_1.sql` con los INSERTs **propuestos** + reporte de `NO_RESUELTOS` para Yesi.
4. Recién con OK sobre el SQL: aplicar por MCP, actualizar baseline de `spcs` en `CLAUDE.md` (181 → 181+N), probe de verificación.
