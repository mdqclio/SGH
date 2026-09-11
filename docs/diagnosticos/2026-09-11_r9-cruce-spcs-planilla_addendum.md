# R9 — addendum al cruce: los 22 de alta, los ítems sin resolver, y barrido de borderline

**Fecha:** 2026-09-11 · **Informe base:** `docs/diagnosticos/2026-09-11_r9-cruce-spcs-planilla.md` (`3b73aa4` en `reports`) · **`main` relevado:** `842aa43`
**Solo lectura.** Scrape NO corrido. DB no tocada. `spcs` = 181.

(Los "cuatro ítems del §7" están numerados como **§8** en el informe base — §7 es el scrape. Van acá igual.)

---

## 1. Los 22 a dar de alta, con turno

| # | nombre (grafía de la planilla) | turno(s) | condición del turno |
|---|---|---|---|
| 1 | ETERNA DOCTORA | T1 | 3 años perdedores, 800m |
| 2 | DESERT OF DUBAI | T1 | 3 años perdedores, 800m |
| 3 | HERMANOSDEMIPATRIA | T1 | 3 años perdedores, 800m |
| 4 | BELLA DOÑA | T1 | 3 años perdedores, 800m |
| 5 | ALHENA | T2 | 4 años perdedores, 800m |
| 6 | OLA DOCTOR | **T2, T3** | 4 años perdedores, 800m / 1200m |
| 7 | BIEN COQUETA | T2 | 4 años perdedores, 800m |
| 8 | DEL CAMPEON | T2 | 4 años perdedores, 800m |
| 9 | TORO MAÑERO | T3 | 4 años perdedores, 1200m |
| 10 | MARIA CATULANGA | T3 | 4 años perdedores, 1200m |
| 11 | BACON | T4 | 5 y + perdedores, 800m |
| 12 | NISTEL WIN | T4 | 5 y + perdedores, 800m |
| 13 | NIÑO OSEANICO | T4 | 5 y + perdedores, 800m |
| 14 | EL MAS SABIO | T5 | 3 y 4 años ganadores de 1 o 2, 1000m |
| 15 | HALLOTOP | T6 | 5 y + ganadores de 1 o 2, 1000m |
| 16 | EL RISKO | T7 | 6 y + ganadores de 1 o 2, 1100m |
| 17 | ATOMIZADOR | T7 | 6 y + ganadores de 1 o 2, 1100m |
| 18 | QUERELLANTE | T9 | Especial, 4 y + ganador de 3 o más, 1100m |
| 19 | THE BEAST PARTY | T9 | Especial, 4 y + ganador de 3 o más, 1100m |
| 20 | INDIA MARO | T10 | Yeguas perdedoras (4 y 5 según planilla; 5 y + según DB), 1100m |
| 21 | ABARAJALA | T10 | Yeguas perdedoras (ídem), 1100m |
| 22 | GOIADORA | T11 | 5 y + perdedores, 1200m |

Por turno: T1 4 · T2 4 · T3 2 (+ OLA DOCTOR repetido) · T4 3 · T5 1 · T6 1 · T7 2 · T8 0 · T9 2 · T10 2 · T11 1 = **22 caballos, 23 líneas**.

La edad que espera cada turno sirve para desambiguar homónimos en el scrape: T1 → nacidos 2023 · T2/T3 → 2022 · T5 → 2022/2023 · T4/T6/T10/T11 → ≤2021 · T7 → ≤2020 · T9 → ≤2022. INDIA MARO y ABARAJALA tienen que salir **hembra**.

---

## 2. Los cuatro ítems sin resolver (§8 del informe base)

### 2.1 `edad_minima/maxima_anos` contradice el texto del handicap en T5, T9, T10, T11

| T | columnas hoy | texto `condicion_handicap` | quién se come el gate |
|---|---|---|---|
| 5 | min **5** · max 10 | "Todo caballo **3 y 4 años** ganador de 1 o 2" | los 5 anotados: NELIDA RIM, NOCHE EN VELA, KUCCINI, AMIGUITO JESUS (todos 2022 → 4 años) y EL MAS SABIO si es 3-4. **El turno entero.** |
| 9 | min **5** · max 10 | "Especial Todo caballo **4 años y +** ganador de 3 o más" | cualquier 4 años. Los ya cargados (WISLA KEN, CHINITA SALTEÑA 2021; ESPLENDID CRAF, LE BATEAU 2020) pasan; QUERELLANTE / THE BEAST PARTY dependen del scrape |
| 10 | min **5** · max 10 · hembras | "Yeguas **5 años y +** perdedoras" — **planilla dice "4 y 5"** | ver 2.2 |
| 11 | min 5 · max **5** | "Todo caballo 5 años **y +** perdedor" | BABY PARADISE (2019, 7), TERRIBLE KING (2019, 7), DESTINADO JOHAN (2020, 6) y cualquier alta ≥ 6 |

El gate valida contra las columnas (`probe_edad_reglamentaria.mjs`), no contra el texto. Es el mismo tipo de desalineación que el fix `condicion_sexo` T8/T10 del 08/09 (`fix/condicion-sexo-t8-t10-r9`), pero en las columnas de edad. **Fix chico, otro pedido, necesita la palabra de Yesi sobre qué edad manda en cada turno.** Sin esto, la carga del lunes rechaza inscripciones legítimas.

### 2.2 T10: planilla "yeguas 4 y 5 años" vs DB "5 años y +"

Las tres anotadas que ya existen no cierran con "4 y 5": QUINIELA TREND (2018 → **8**), BABY PARADISE (2019 → **7**), GRILLADA RYE (2019 → **7**). Sí cierran con "5 y +". KRISTALINA (2021 → 5) y LOGUACIOUS (2021 → 5) cierran con las dos. Lo más probable: **la planilla tiene el texto viejo/mal y la DB está bien**, pero es una decisión de Yesi/Fede, no mía. Hasta que se aclare, no se toca ni la columna ni el texto.

### 2.3 Wave Rimout duplicado en `spcs`

Dos filas, misma fecha de nacimiento (2017-08-08), mismo padre/madre, misma caballeriza LOS MELOS:

| id | `color` | `entrenador` | inscripciones |
|---|---|---|---|
| `f277af1c-…` (creada 07/05) | NULL | NULL | 1 — R6 |
| `5ebc5e48-…` (creada 12/06) | Zaino | DE LA TORRE GABRIEL | 1 — R8 |

`PLAN_DUPLICADOS_SPC.md` (23/08) cerró `Fist Queen` y `Malenuchi` y dejó este. Desde entonces cada fila ganó una inscripción, así que unificar implica repuntar `inscripciones.spc_id` de R6 a la fila superviviente (la más completa, `5ebc5e48`) y borrar la otra — con `resultado_posiciones` de R6 colgando de esa inscripción, ojo con el orden (GOTCHA #12). **No está en R9, no bloquea la tanda.** Plan aparte.

### 2.4 Formato de `registro_stud_book`

Columna `varchar`, **NULL en las 181 filas** — nunca se cargó. El scraper trae `tomo` y `folio`. Opciones: (a) dejar NULL y guardar `studbook_id` + `url_perfil` como hasta ahora (tanda 4/5) — conservadora, cero decisiones; (b) fijar un formato tipo `T{tomo} F{folio}` y empezar a llenarlo desde esta tanda. **Propuesta: (a)**, salvo que quieras estrenar la columna ahora. No bloquea.

---

## 3. Barrido borderline de los 22 contra el padrón

Con el umbral del informe base (Levenshtein ≤ 3 o trigramas ≥ 0.4) los 22 dieron "sin parecidos" salvo tres casos de ruido. Acá se afloja a propósito: Levenshtein relativo ≤ 0.5, trigramas ≥ 0.25, **o cualquier token compartido** (sacando artículos/preposiciones). Si un mismo caballo estuviera cargado con otra grafía —tipo LOGUACIOUS con tres formas, o `Conesera`— tendría que aparecer acá.

Script (`borderline.mjs`, scratchpad, solo lectura):

```javascript
import { createClient } from '@supabase/supabase-js';
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const toks = s => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
const ALTAS = ['ETERNA DOCTORA','DESERT OF DUBAI','HERMANOSDEMIPATRIA','BELLA DOÑA','ALHENA','OLA DOCTOR','BIEN COQUETA','DEL CAMPEON','TORO MAÑERO','MARIA CATULANGA','BACON','NISTEL WIN','NIÑO OSEANICO','EL MAS SABIO','HALLOTOP','EL RISKO','ATOMIZADOR','QUERELLANTE','THE BEAST PARTY','INDIA MARO','ABARAJALA','GOIADORA'];
const sb = createClient('https://unlhcuanfrtpatoipwve.supabase.co', process.env.SUPABASE_SECRET_KEY);
const { data: spcs, error } = await sb.from('spcs').select('id,nombre,fecha_nacimiento,sexo,padrillo_nombre,madre_nombre').order('nombre'); if (error) throw error;
function lev(a,b){const m=a.length,n=b.length;const d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);for(let j=1;j<=n;j++)d[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[m][n];}
const tri = s=>{const t=new Set();const p='  '+s+' ';for(let i=0;i<p.length-2;i++)t.add(p.slice(i,i+3));return t;};
const sim=(a,b)=>{const A=tri(a),B=tri(b);let c=0;for(const x of A)if(B.has(x))c++;return c/(A.size+B.size-c);};
const STOP=new Set(['EL','LA','DE','DEL','OF','THE','LOS','LAS','Y','EN','A']);
for (const a of ALTAS){ const k=norm(a); const ta=toks(a).filter(t=>!STOP.has(t));
  const c=spcs.map(s=>{const ks=norm(s.nombre);const ts=toks(s.nombre).filter(t=>!STOP.has(t));const shared=ta.filter(t=>ts.includes(t));
    return {n:s.nombre,fn:s.fecha_nacimiento,sx:s.sexo,lev:lev(k,ks),rel:+(lev(k,ks)/Math.max(k.length,ks.length)).toFixed(2),sim:+sim(k,ks).toFixed(2),shared};})
    .filter(x=>x.rel<=0.5||x.sim>=0.25||x.shared.length).sort((x,y)=>x.rel-y.rel||y.sim-x.sim).slice(0,6);
  console.log(`\n${a}  [norm ${k}]`); if(!c.length) console.log('   (nada, ni por token)');
  for(const x of c) console.log(`   ${x.n.padEnd(22)} ${x.fn} ${x.sx.padEnd(6)} lev=${x.lev} rel=${x.rel} sim=${x.sim}${x.shared.length?' token='+x.shared.join(','):''}`);
}
```

Salida cruda completa:

```

ETERNA DOCTORA  [norm ETERNADOCTORA]
   DOCTORA MIA            2022-10-26 hembra lev=9 rel=0.69 sim=0.25 token=DOCTORA
   DOCTORA APASIONADA     2023-09-29 hembra lev=12 rel=0.71 sim=0.23 token=DOCTORA

DESERT OF DUBAI  [norm DESERTOFDUBAI]
   LOCA DUBAI             2022-11-06 hembra lev=8 rel=0.62 sim=0.2 token=DUBAI

HERMANOSDEMIPATRIA  [norm HERMANOSDEMIPATRIA]
   (nada, ni por token)

BELLA DOÑA  [norm BELLADONA]
   (nada, ni por token)

ALHENA  [norm ALHENA]
   BACHUNA                2022-11-24 hembra lev=3 rel=0.43 sim=0.07

OLA DOCTOR  [norm OLADOCTOR]
   EL GRAN HECTOR         2021-08-25 macho  lev=6 rel=0.5 sim=0.15
   DOCTOR SKY             2022-10-25 macho  lev=6 rel=0.67 sim=0.25 token=DOCTOR

BIEN COQUETA  [norm BIENCOQUETA]
   LA DE ETIQUETA         2021-07-16 hembra lev=6 rel=0.5 sim=0.19

DEL CAMPEON  [norm DELCAMPEON]
   El Pampeano            2021-11-22 macho  lev=4 rel=0.4 sim=0.1

TORO MAÑERO  [norm TOROMANERO]
   (nada, ni por token)

MARIA CATULANGA  [norm MARIACATULANGA]
   (nada, ni por token)

BACON  [norm BACON]
   BACHUNA                2022-11-24 hembra lev=3 rel=0.43 sim=0.27

NISTEL WIN  [norm NISTELWIN]
   KRISTALINA             2021-11-11 hembra lev=5 rel=0.5 sim=0.05

NIÑO OSEANICO  [norm NINOOSEANICO]
   (nada, ni por token)

EL MAS SABIO  [norm ELMASSABIO]
   (nada, ni por token)

HALLOTOP  [norm HALLOTOP]
   BOHEMIO TOP            2020-08-12 macho  lev=5 rel=0.5 sim=0.18

EL RISKO  [norm ELRISKO]
   (nada, ni por token)

ATOMIZADOR  [norm ATOMIZADOR]
   (nada, ni por token)

QUERELLANTE  [norm QUERELLANTE]
   (nada, ni por token)

THE BEAST PARTY  [norm THEBEASTPARTY]
   (nada, ni por token)

INDIA MARO  [norm INDIAMARO]
   IDALIA MARO            2021-10-15 hembra lev=3 rel=0.3 sim=0.4 token=MARO
   INDIO VALIDO           2021-10-28 macho  lev=5 rel=0.45 sim=0.22

ABARAJALA  [norm ABARAJALA]
   (nada, ni por token)

GOIADORA  [norm GOIADORA]
   GOIAS GREEN            2021-10-05 macho  lev=5 rel=0.5 sim=0.25
   ALIADO SCAT            2019-08-18 macho  lev=5 rel=0.5 sim=0.11
```

### Lectura, uno por uno

| alta | candidato más cercano | veredicto |
|---|---|---|
| ETERNA DOCTORA | DOCTORA MIA (2022), DOCTORA APASIONADA (2023) | **Distintos.** Comparten el token DOCTORA — misma línea de nombres del criador (hay 4 "DOCTOR/A" en la planilla: DOCTOR SKY, DOCTORA MIA, DOCTORA APASIONADA, ETERNA DOCTORA, OLA DOCTOR). Nada de una grafía alternativa: lev 9-12 |
| DESERT OF DUBAI | LOCA DUBAI (2022) | **Distintos.** Solo comparten DUBAI, lev 8 |
| HERMANOSDEMIPATRIA | — | nada, ni por token. Ojo: viene todo junto en la planilla; el Stud Book probablemente lo tenga como `HERMANOS DE MI PATRIA` — la normalización del scraper lo absorbe (borra espacios), match exacto igual pega |
| BELLA DOÑA | — | nada |
| ALHENA | BACHUNA | **Ruido** (lev 3 sobre 6 letras, sim 0.07) |
| OLA DOCTOR | DOCTOR SKY, EL GRAN HECTOR | **Distintos.** Token DOCTOR compartido y nada más |
| BIEN COQUETA | LA DE ETIQUETA | **Ruido** (rima, lev 6) |
| DEL CAMPEON | El Pampeano | **Ruido** (lev 4 sobre 10, sim 0.10) |
| TORO MAÑERO | — | nada |
| MARIA CATULANGA | — | nada |
| BACON | BACHUNA | **Ruido** (lev 3 sobre 5 letras — con nombres tan cortos el umbral absoluto engaña; sim 0.27) |
| NISTEL WIN | KRISTALINA | **Ruido** |
| NIÑO OSEANICO | — | nada |
| EL MAS SABIO | — | nada |
| HALLOTOP | BOHEMIO TOP | **Ruido** (comparten TOP al final) |
| EL RISKO | — | nada |
| ATOMIZADOR | — | nada |
| QUERELLANTE | — | nada |
| THE BEAST PARTY | — | nada |
| **INDIA MARO** | **IDALIA MARO** (2021, hembra, Engelhard × Itzel Chica, sb 431374) | **El único borderline real.** lev 3, sim 0.40, token MARO. Pero IDALIA MARO está anotada **aparte** en la misma planilla (T6 y T8, ganadoras) y INDIA MARO en T10 (perdedoras) — una yegua no puede ser ganadora de 1-2 y perdedora a la vez. Son dos yeguas del mismo criador (sufijo MARO). **Se confirma con el scrape**: si INDIA MARO devuelve fecha/padre/madre distintos a los de IDALIA, cerrado; si el autocomplete no la encuentra, ahí sí vuelve a Yesi |
| ABARAJALA | — | nada |
| GOIADORA | GOIAS GREEN | **Ruido** (comparten GOIA) |

**Resultado: ninguno de los 22 es una grafía alternativa de algo que ya está.** El único par que merece una segunda mirada (INDIA/IDALIA MARO) se resuelve solo con los datos del Stud Book. Los tres "typo reales" del padrón (LOGUACIOUS ×3 grafías, Conesera/CONESERSA) ya quedaron fuera de la lista de altas en el informe base.

Límite del método: esto compara contra los **nombres que hay en `spcs`**. Si un caballo está en la base con un nombre totalmente distinto (no un typo, otro nombre), ni Levenshtein ni tokens lo agarran — lo agarra el chequeo 4 de §6c del informe base (fecha + padre + madre del scrape contra la DB), que corre después del scrape.
