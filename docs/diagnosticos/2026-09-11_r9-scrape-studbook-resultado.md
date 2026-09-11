# R9 — resultado del scrape del Stud Book (NADA insertado)

**Fecha:** 2026-09-11 · **Informes previos:** `2026-09-11_r9-cruce-spcs-planilla.md`, `…_addendum.md` · **`main`:** `842aa43`
**Estado: scrape corrido, DB sin tocar.** `spcs` sigue en **181**. Ningún INSERT, ningún UPDATE. Esperando OK sobre esta lista.

Decisiones que ya bajaste y se aplican al SQL cuando se arme: `registro_stud_book` queda **NULL**; `studbook_id` + `url_perfil` en `notas`, como tandas 4/5. Wave Rimout fuera de alcance.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| branch al correr el scrape | `main` @ `842aa43` | ✅ |
| `SELECT count(*) FROM spcs` | 181 | ✅ 181 (antes y después — el scraper no escribe) |
| ref | `unlhcuanfrtpatoipwve` | ✅ |

---

## 1. Veredicto en una tabla

| grupo | cant. | nombres |
|---|---|---|
| **A. Listos para alta** — match exacto o typo resuelto, edad y sexo cierran con el turno | **18** | ETERNA DOCTORA · DESERT OF DUBAI · HERMANOSDEMIPATRIA · ALHENA · OLA DOCTOR · DEL CAMPEON · TORO MAÑERO · **MARIA CATULENGA** (planilla: CATULANGA) · BACON · NISTEL WIN · **NIÑO OCEANICO** (planilla: OSEANICO) · HALLOTOP · EL RISKO · ATOMIZADOR · QUERELLANTE · THE BEAST PARTY · ABARAJALA · GOIADORA |
| **B. Encontrados pero la edad NO cierra con el turno** — vuelven a Yesi antes de insertar | **3** | BELLA DOÑA (2017, **9 años, macho** — T1 pide 3 años) · EL MAS SABIO (2021, 5 años — T5 texto "3 y 4") · BIEN COQUETA (2021, 5 años — T2 pide 4) |
| **C. No existe en el Stud Book** con ese nombre ni variantes | **1** | INDIA MARO |
| Confirmaciones (ya existen, no son alta) | 2 | LOGUACIOUS ✅ coincide todo · CONESERA ✅ coincide fecha/padre/madre, **pero el Stud Book dice Hembra y la DB dice macho** |

18 + 3 + 1 = 22. **Sexo verificado:** ABARAJALA → **hembra** ✅ (2020-10-25, Storm Question × Redondiya). INDIA MARO → no hay ficha, no se puede verificar. GOIADORA también hembra (T11 es ambos, no importa).

Homónimos desambiguados por edad del turno (§4): BIEN COQUETA 2021 vs 1998 → 2021 (y aun así no cierra con T2, va a B). QUERELLANTE 2019 vs 1947 → 2019 ✅ T9. CONESERA 2023 vs 1993 → 2023 ✅ (es la fila que ya está).

---

## 2. El scrape — comando y salida cruda

Archivo de nombres (`r9_nombres_scrape.txt`): los 22 + CONESERA + LOGUACIOUS (grafía de la DB), ver informe base §7.

```bash
# branch main @ 842aa43
node tools/studbook_scrape_tanda.mjs scratchpad/r9_tanda_1_scrape.json scratchpad/r9_nombres_scrape.txt r9-1 181
```

stdout completo:

```
{
  "fuente": "www.studbook.org.ar",
  "endpoint": "/ejemplares/autocomplete?tipo=1&muerto=1&term=",
  "tanda": "r9-1",
  "escribe_en_db": false,
  "nombres_pedidos": 24,
  "altas_propuestas": 18,
  "casos_no_resueltos": 6,
  "snapshot_spcs": 181
}
OK   ETERNA DOCTORA -> ETERNA DOCTORA sb=442125 2023-07-29 hembra Zaino Doradillo | Doctor Embrujo / Eterna Diablita 
OK   DESERT OF DUBAI -> DESERT OF DUBAI sb=446340 2023-10-09 macho Zaino | Dubai Thunder (GB) / Grela (USA) 
OK   HERMANOSDEMIPATRIA -> HERMANOSDEMIPATRIA sb=443096 2023-09-07 macho Zaino | Grand Reward (USA) / Cat The Gold 
OK   BELLA DOÑA -> BELLA DOÑA sb=403664 2017-11-13 macho Alazan | Bella Shambrock (USA) / La Mejorcita 
OK   ALHENA -> ALHENA sb=434871 2022-07-16 hembra Zaino | Puerto Escondido / Almedha 
OK   OLA DOCTOR -> OLA DOCTOR sb=438421 2022-10-24 macho Zaino | Lead To Win / Sweet Johar (USA) 
OK   DEL CAMPEON -> DEL CAMPEON sb=438805 2022-10-17 macho Zaino | Golden Cigars / Sixties Spirit 
OK   TORO MAÑERO -> TORO MAÑERO sb=440758 2022-10-21 macho Zaino | Hit It A Bomb (USA) / Sarawak Top 
OK   BACON -> BACON sb=428803 2021-07-17 macho Zaino | Winning Prize / Biosfera 
OK   NISTEL WIN -> NISTEL WIN sb=430420 2021-10-08 macho Zaino Colorado | Lead To Win / Barbie Nistel 
OK   EL MAS SABIO -> EL MAS SABIO sb=431662 2021-10-26 macho Alazan | Il Campione (CHI) / Indigirka 
OK   HALLOTOP -> HALLOTOP sb=441122 2021-10-08 macho Zaino | Maipo Top / Halloweeninseattle 
OK   EL RISKO -> EL RISKO sb=421108 2020-09-10 macho Zaino | Security Risk (USA) / Spanakopitas 
OK   ATOMIZADOR -> ATOMIZADOR sb=422969 2020-10-26 macho Zaino Doradillo | Daniel Boone (BRZ) / Atomic Star 
OK   THE BEAST PARTY -> THE BEAST PARTY sb=438032 2022-07-30 macho Alazan | In The Dark / Rimout Party 
OK   ABARAJALA -> ABARAJALA sb=433798 2020-10-25 hembra Zaino | Storm Question / Redondiya 
OK   GOIADORA -> GOIADORA sb=428590 2021-09-23 hembra Zaino | Goias Key / Degolladora 
OK   LOGUACIOUS -> LOGUACIOUS sb=431567 2021-10-23 hembra Zaino | Le Blues / Effervesence 
FALTA BIEN COQUETA [MATCH_AMBIGUO] [{"id":429819,"text":"BIEN COQUETA","leyenda":"(2021 H SP)","nacimiento":"15/10/2021","padre":"Bien Terminado","madre":"Gritty"},{"id":216248,"text":"BIEN COQUETA","leyenda":"(1998 H SP)","nacimiento":"29/07/1998","padre":"Yale Twentyniner (USA)","madre":"Coquetisima"}]
FALTA MARIA CATULANGA [SIN_MATCH_EXACTO] []
FALTA NIÑO OSEANICO [SIN_MATCH_EXACTO] []
FALTA QUERELLANTE [MATCH_AMBIGUO] [{"id":416936,"text":"QUERELLANTE","leyenda":"(2019 M SP)","nacimiento":"11/10/2019","padre":"Daniel Boone (BRZ)","madre":"Que Felicidad"},{"id":49722,"text":"QUERELLANTE","leyenda":"(1947 M SP)","nacimiento":"01/01/1947","padre":"Meadow","madre":"Querendona"}]
FALTA INDIA MARO [SIN_MATCH_EXACTO] []
FALTA CONESERA [MATCH_AMBIGUO] [{"id":444373,"text":"CONESERA","leyenda":"(2023 H SP)","nacimiento":"20/09/2023","padre":"Emmanuel","madre":"Milonga Burrera"},{"id":183273,"text":"CONESERA","leyenda":"(1993 H SP)","nacimiento":"16/11/1993","padre":"El Azar","madre":"Che Tentacion"}]
```

JSON de evidencia completo (`r9_tanda_1_scrape.json`):

```json
{
  "_meta": {
    "fuente": "www.studbook.org.ar",
    "endpoint": "/ejemplares/autocomplete?tipo=1&muerto=1&term=",
    "tanda": "r9-1",
    "escribe_en_db": false,
    "nombres_pedidos": 24,
    "altas_propuestas": 18,
    "casos_no_resueltos": 6,
    "snapshot_spcs": 181
  },
  "ALTAS": [
    {
      "nombre_pedido": "ETERNA DOCTORA",
      "nombre_sb": "ETERNA DOCTORA",
      "sb_id": "442125",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/442125/eterna-doctora",
      "fecha_nacimiento": "2023-07-29",
      "sexo_sb": "Hembra",
      "sexo": "hembra",
      "color": "Zaino Doradillo",
      "padrillo_nombre": "Doctor Embrujo",
      "madre_nombre": "Eterna Diablita",
      "abuelo_materno": "Alpha Plus (USA)",
      "leyenda": "(2023 H SP)",
      "tomo": 1253,
      "folio": 288,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "DESERT OF DUBAI",
      "nombre_sb": "DESERT OF DUBAI",
      "sb_id": "446340",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/446340/desert-of-dubai",
      "fecha_nacimiento": "2023-10-09",
      "sexo_sb": "Macho",
      "sexo": "macho",
      "color": "Zaino",
      "padrillo_nombre": "Dubai Thunder (GB)",
      "madre_nombre": "Grela (USA)",
      "abuelo_materno": "Bernstein (USA)",
      "leyenda": "(2023 M SP)",
      "tomo": 1257,
      "folio": 469,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "HERMANOSDEMIPATRIA",
      "nombre_sb": "HERMANOSDEMIPATRIA",
      "sb_id": "443096",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/443096/hermanosdemipatria",
      "fecha_nacimiento": "2023-09-07",
      "sexo_sb": "Macho",
      "sexo": "macho",
      "color": "Zaino",
      "padrillo_nombre": "Grand Reward (USA)",
      "madre_nombre": "Cat The Gold",
      "abuelo_materno": "Gold Gift",
      "leyenda": "(2023 M SP)",
      "tomo": 1254,
      "folio": 249,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "BELLA DOÑA",
      "nombre_sb": "BELLA DOÑA",
      "sb_id": "403664",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/403664/bella-dona",
      "fecha_nacimiento": "2017-11-13",
      "sexo_sb": "Macho",
      "sexo": "macho",
      "color": "Alazan",
      "padrillo_nombre": "Bella Shambrock (USA)",
      "madre_nombre": "La Mejorcita",
      "abuelo_materno": "Missionary (USA)",
      "leyenda": "(2017 M SP)",
      "tomo": 1215,
      "folio": 427,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "ALHENA",
      "nombre_sb": "ALHENA",
      "sb_id": "434871",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/434871/alhena",
      "fecha_nacimiento": "2022-07-16",
      "sexo_sb": "Hembra",
      "sexo": "hembra",
      "color": "Zaino",
      "padrillo_nombre": "Puerto Escondido",
      "madre_nombre": "Almedha",
      "abuelo_materno": "Exchange Rate (USA)",
      "leyenda": "(2022 H SP)",
      "tomo": 1246,
      "folio": 139,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "OLA DOCTOR",
      "nombre_sb": "OLA DOCTOR",
      "sb_id": "438421",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/438421/ola-doctor",
      "fecha_nacimiento": "2022-10-24",
      "sexo_sb": "Macho",
      "sexo": "macho",
      "color": "Zaino",
      "padrillo_nombre": "Lead To Win",
      "madre_nombre": "Sweet Johar (USA)",
      "abuelo_materno": "Johar",
      "leyenda": "(2022 M SP)",
      "tomo": 1249,
      "folio": 650,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "DEL CAMPEON",
      "nombre_sb": "DEL CAMPEON",
      "sb_id": "438805",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/438805/del-campeon",
      "fecha_nacimiento": "2022-10-17",
      "sexo_sb": "Macho",
      "sexo": "macho",
      "color": "Zaino",
      "padrillo_nombre": "Golden Cigars",
      "madre_nombre": "Sixties Spirit",
      "abuelo_materno": "Sixties Icon (GB)",
      "leyenda": "(2022 M SP)",
      "tomo": 1250,
      "folio": 24,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "TORO MAÑERO",
      "nombre_sb": "TORO MAÑERO",
      "sb_id": "440758",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/440758/toro-manero",
      "fecha_nacimiento": "2022-10-21",
      "sexo_sb": "Macho",
      "sexo": "macho",
      "color": "Zaino",
      "padrillo_nombre": "Hit It A Bomb (USA)",
      "madre_nombre": "Sarawak Top",
      "abuelo_materno": "Giant's Causeway (USA)",
      "leyenda": "(2022 M SP)",
      "tomo": 1251,
      "folio": 969,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "BACON",
      "nombre_sb": "BACON",
      "sb_id": "428803",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/428803/bacon",
      "fecha_nacimiento": "2021-07-17",
      "sexo_sb": "Macho",
      "sexo": "macho",
      "color": "Zaino",
      "padrillo_nombre": "Winning Prize",
      "madre_nombre": "Biosfera",
      "abuelo_materno": "Equal Stripes",
      "leyenda": "(2021 M SP)",
      "tomo": 1240,
      "folio": 196,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "NISTEL WIN",
      "nombre_sb": "NISTEL WIN",
      "sb_id": "430420",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/430420/nistel-win",
      "fecha_nacimiento": "2021-10-08",
      "sexo_sb": "Macho",
      "sexo": "macho",
      "color": "Zaino Colorado",
      "padrillo_nombre": "Lead To Win",
      "madre_nombre": "Barbie Nistel",
      "abuelo_materno": "Van Nistelrooy (USA)",
      "leyenda": "(2021 M SP)",
      "tomo": 1241,
      "folio": 793,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "EL MAS SABIO",
      "nombre_sb": "EL MAS SABIO",
      "sb_id": "431662",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/431662/el-mas-sabio",
      "fecha_nacimiento": "2021-10-26",
      "sexo_sb": "Macho",
      "sexo": "macho",
      "color": "Alazan",
      "padrillo_nombre": "Il Campione (CHI)",
      "madre_nombre": "Indigirka",
      "abuelo_materno": "Interprete",
      "leyenda": "(2021 M SP)",
      "tomo": 1242,
      "folio": 998,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "HALLOTOP",
      "nombre_sb": "HALLOTOP",
      "sb_id": "441122",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/441122/hallotop",
      "fecha_nacimiento": "2021-10-08",
      "sexo_sb": "Macho",
      "sexo": "macho",
      "color": "Zaino",
      "padrillo_nombre": "Maipo Top",
      "madre_nombre": "Halloweeninseattle",
      "abuelo_materno": "Seattle Fitz",
      "leyenda": "(2021 M SP)",
      "tomo": 1252,
      "folio": 330,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "EL RISKO",
      "nombre_sb": "EL RISKO",
      "sb_id": "421108",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/421108/el-risko",
      "fecha_nacimiento": "2020-09-10",
      "sexo_sb": "Macho",
      "sexo": "macho",
      "color": "Zaino",
      "padrillo_nombre": "Security Risk (USA)",
      "madre_nombre": "Spanakopitas",
      "abuelo_materno": "Manipulator (USA)",
      "leyenda": "(2020 M SP)",
      "tomo": 1232,
      "folio": 603,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "ATOMIZADOR",
      "nombre_sb": "ATOMIZADOR",
      "sb_id": "422969",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/422969/atomizador",
      "fecha_nacimiento": "2020-10-26",
      "sexo_sb": "Macho",
      "sexo": "macho",
      "color": "Zaino Doradillo",
      "padrillo_nombre": "Daniel Boone (BRZ)",
      "madre_nombre": "Atomic Star",
      "abuelo_materno": "Lode (USA)",
      "leyenda": "(2020 M SP)",
      "tomo": 1234,
      "folio": 467,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "THE BEAST PARTY",
      "nombre_sb": "THE BEAST PARTY",
      "sb_id": "438032",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/438032/the-beast-party",
      "fecha_nacimiento": "2022-07-30",
      "sexo_sb": "Macho",
      "sexo": "macho",
      "color": "Alazan",
      "padrillo_nombre": "In The Dark",
      "madre_nombre": "Rimout Party",
      "abuelo_materno": "Remote (GB)",
      "leyenda": "(2022 M SP)",
      "tomo": 1249,
      "folio": 262,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "ABARAJALA",
      "nombre_sb": "ABARAJALA",
      "sb_id": "433798",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/433798/abarajala",
      "fecha_nacimiento": "2020-10-25",
      "sexo_sb": "Hembra",
      "sexo": "hembra",
      "color": "Zaino",
      "padrillo_nombre": "Storm Question",
      "madre_nombre": "Redondiya",
      "abuelo_materno": "Captif",
      "leyenda": "(2020 H SP)",
      "tomo": 1245,
      "folio": 90,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "GOIADORA",
      "nombre_sb": "GOIADORA",
      "sb_id": "428590",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/428590/goiadora",
      "fecha_nacimiento": "2021-09-23",
      "sexo_sb": "Hembra",
      "sexo": "hembra",
      "color": "Zaino",
      "padrillo_nombre": "Goias Key",
      "madre_nombre": "Degolladora",
      "abuelo_materno": "Emperor Richard",
      "leyenda": "(2021 H SP)",
      "tomo": 1239,
      "folio": 986,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    },
    {
      "nombre_pedido": "LOGUACIOUS",
      "nombre_sb": "LOGUACIOUS",
      "sb_id": "431567",
      "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/431567/loguacious",
      "fecha_nacimiento": "2021-10-23",
      "sexo_sb": "Hembra",
      "sexo": "hembra",
      "color": "Zaino",
      "padrillo_nombre": "Le Blues",
      "madre_nombre": "Effervesence",
      "abuelo_materno": "Sebi Halo",
      "leyenda": "(2021 H SP)",
      "tomo": 1242,
      "folio": 903,
      "pais_origen": "Argentina",
      "icon": "/img/banderas/10.png",
      "raza": 4,
      "alertas": []
    }
  ],
  "NO_RESUELTOS": [
    {
      "nombre_pedido": "BIEN COQUETA",
      "motivo": "MATCH_AMBIGUO",
      "candidatos": [
        {
          "id": 429819,
          "text": "BIEN COQUETA",
          "leyenda": "(2021 H SP)",
          "nacimiento": "15/10/2021",
          "padre": "Bien Terminado",
          "madre": "Gritty"
        },
        {
          "id": 216248,
          "text": "BIEN COQUETA",
          "leyenda": "(1998 H SP)",
          "nacimiento": "29/07/1998",
          "padre": "Yale Twentyniner (USA)",
          "madre": "Coquetisima"
        }
      ]
    },
    {
      "nombre_pedido": "MARIA CATULANGA",
      "motivo": "SIN_MATCH_EXACTO",
      "candidatos": []
    },
    {
      "nombre_pedido": "NIÑO OSEANICO",
      "motivo": "SIN_MATCH_EXACTO",
      "candidatos": []
    },
    {
      "nombre_pedido": "QUERELLANTE",
      "motivo": "MATCH_AMBIGUO",
      "candidatos": [
        {
          "id": 416936,
          "text": "QUERELLANTE",
          "leyenda": "(2019 M SP)",
          "nacimiento": "11/10/2019",
          "padre": "Daniel Boone (BRZ)",
          "madre": "Que Felicidad"
        },
        {
          "id": 49722,
          "text": "QUERELLANTE",
          "leyenda": "(1947 M SP)",
          "nacimiento": "01/01/1947",
          "padre": "Meadow",
          "madre": "Querendona"
        }
      ]
    },
    {
      "nombre_pedido": "INDIA MARO",
      "motivo": "SIN_MATCH_EXACTO",
      "candidatos": []
    },
    {
      "nombre_pedido": "CONESERA",
      "motivo": "MATCH_AMBIGUO",
      "candidatos": [
        {
          "id": 444373,
          "text": "CONESERA",
          "leyenda": "(2023 H SP)",
          "nacimiento": "20/09/2023",
          "padre": "Emmanuel",
          "madre": "Milonga Burrera"
        },
        {
          "id": 183273,
          "text": "CONESERA",
          "leyenda": "(1993 H SP)",
          "nacimiento": "16/11/1993",
          "padre": "El Azar",
          "madre": "Che Tentacion"
        }
      ]
    }
  ]
}```

---

## 3. Los 6 no resueltos — sondeo con términos parciales

`tools/studbook_probe_terms.mjs` (read-only, vuelca hits crudos del autocomplete por prefijo).

```bash
node tools/studbook_probe_terms.mjs scratchpad/r9_probe_terms.json "MARIA CATU" "CATULANGA" "CATURANGA" "MARIA CATA" "NIÑO OSE" "NINO OSE" "OSEANICO" "OCEANICO" "NIÑO OCE" "INDIA MAR" "INDIA MA" "MARO" "BELLA DO" "BELLA DON"
```

```

=== MARIA CATU — 1 hits
  440678	MARIA CATULENGA	15/10/2022	Hembra	Zaino	Fiskardo / Ever Propulsora	raza=4	icon=/img/banderas/10.png

=== CATULANGA — 0 hits

=== CATURANGA — 0 hits

=== MARIA CATA — 2 hits
  181215	MARIA CATA	20/10/1993	Hembra	Tordillo	Super Mario (USA) / La Cataluña	raza=4	icon=/img/banderas/10.png
  189949	MARIA CATALINA	28/10/1994	Hembra	Zaino	Jang Lark / Pipiola	raza=4	icon=/img/banderas/10.png

=== NIÑO OSE — 0 hits

=== NINO OSE — 0 hits

=== OSEANICO — 0 hits

=== OCEANICO — 4 hits
  440227	OCEANICO	10/11/2022	Macho	Alazan	Bellport / E Urbana	raza=4	icon=/img/banderas/10.png
  191482	OCEANICO	30/10/1994	Macho	Zaino	Oceanside / Arkansas	raza=4	icon=/img/banderas/10.png
  58134	OCEANICO	01/01/1978	Macho	No Consigna	Amartillado / May Ko	raza=4	icon=/img/banderas/10.png
  290051	OCEANICO PA	16/09/2008	Macho	Zaino	Parrandero / Orduña	raza=4	icon=/img/banderas/10.png

=== NIÑO OCE — 1 hits
  428019	NIÑO OCEANICO	01/09/2021	Macho	Zaino	Seahenge (USA) / Niña Divina	raza=4	icon=/img/banderas/10.png

=== INDIA MAR — 6 hits
  191917	INDIA MARA	16/11/1994	Hembra	Alazan	Bravo Raul / Gran Pared	raza=4	icon=/img/banderas/10.png
  302423	INDIA MARASCA	29/10/2009	Hembra	Zaino	Indio Guapo / West Gorda	raza=4	icon=/img/banderas/10.png
  214165	INDIA MARCADA	02/11/1997	Hembra	Zaino	Mascardi / Mayal Mahuida	raza=4	icon=/img/banderas/10.png
  181224	INDIA MARIA	03/09/1993	Hembra	Alazan	Saint Cyrien / Sun Medea	raza=4	icon=/img/banderas/10.png
  291934	INDIA MARIANA	27/09/2008	Hembra	Zaino	Intrepidity / English Air	raza=4	icon=/img/banderas/10.png
  427378	INDIA MARIÑA	19/07/2021	Hembra	Zaino	Il Campione (CHI) / Evartina	raza=4	icon=/img/banderas/10.png

=== INDIA MA — 15 hits
  364181	INDIA MADRE	24/10/2016	Hembra	Alazan	Cafrune / Intrinseca	raza=4	icon=/img/banderas/10.png
  364056	INDIA MAGICA	16/10/2016	Hembra	Zaino	Freshman / Magic Formula	raza=4	icon=/img/banderas/10.png
  219983	INDIA MAHAL	24/10/1998	Hembra	Zaino	Indio Puma / Retozadora Elius	raza=4	icon=/img/banderas/10.png
  100780	INDIA MAKA	01/01/1978	Hembra	Alazan	Indian Summer / Su Alma	raza=4	icon=/img/banderas/10.png
  229513	INDIA MAKKAKA	22/07/2000	Hembra	Zaino	Cobb's Creek (USA) / Thirtyeight Charms (USA)	raza=4	icon=/img/banderas/10.png
  295927	INDIA MALA	04/11/2008	Hembra	Alazan	Musculoso / Miss Irlandesa	raza=4	icon=/img/banderas/10.png
  70531	INDIA MALA	01/01/1980	Hembra	No Consigna	Indian Black / Sin Asignar	raza=4	icon=/img/banderas/10.png
  349456	INDIA MALAGUEÑA	25/10/2014	Hembra	Zaino	Indian Power / Miss Malagueña	raza=4	icon=/img/banderas/10.png
  98208	INDIA MALEVA	25/11/1984	Hembra	Alazan	Indian Black / Damasquilla	raza=4	icon=/img/banderas/10.png
  427402	INDIA MALINCHE	07/08/2021	Hembra	Zaino	Angiolo / La Anunciacion	raza=4	icon=/img/banderas/10.png
  153652	INDIA MAMA	25/09/1990	Hembra	Alazan	Indian Mister / Mama Buena	raza=4	icon=/img/banderas/10.png
  127203	INDIA MANSA	09/10/1987	Hembra	Zaino Doradillo	Cortejante / Blondie	raza=4	icon=/img/banderas/10.png
  428025	INDIA MAPUCHE	25/08/2021	Hembra	Zaino	Seahenge (USA) / India Secreta	raza=4	icon=/img/banderas/10.png
  218183	INDIA MAPUCHE	28/09/1998	Hembra	Zaino Doradillo	Tidol / Negrita King	raza=4	icon=/img/banderas/10.png
  191917	INDIA MARA	16/11/1994	Hembra	Alazan	Bravo Raul / Gran Pared	raza=4	icon=/img/banderas/10.png

=== MARO — 15 hits
  417738	MARO RICHARD	11/10/2019	Macho	Zaino Colorado	Emperor Richard / Gloriosa Joe	raza=4	icon=/img/banderas/10.png
  366170	MARO ROAD	01/07/1981	Macho	Zaino	Sin Asignar / Sin Asignar	raza=4	icon=/img/banderas/10.png
  64247	MARO-ADUAR	19/09/1979	Macho	Zaino	Tonnerre / Hani Sabrina (US)	raza=3	icon=/img/banderas/10.png
  13183	MAROC	01/01/1958	Macho	Alazan	Sin Asignar / Sin Asignar	raza=4	icon=/img/banderas/10.png
  65920	MAROCAIN	16/08/1980	Macho	Alazan Tostado	Bossuet / Moussa	raza=4	icon=/img/banderas/10.png
  266397	MAROCAINE	02/10/2005	Macho	Alazan Tostado	Increase / Mary Paz	raza=4	icon=/img/banderas/10.png
  30152	MAROCHE	20/10/1975	Hembra	Zaino	Sin Asignar / Sin Asignar	raza=4	icon=/img/banderas/10.png
  20583	MAROHUE	01/01/1972	Hembra	Zaino Doradillo	Sin Asignar / Sin Asignar	raza=4	icon=/img/banderas/10.png
  40863	MAROISE	01/01/1977	Hembra	Zaino	In Rhythm (USA) / Marizu	raza=4	icon=/img/banderas/10.png
  96126	MAROKI	26/10/1984	Macho	Zaino	Marronier / Ukraniana	raza=4	icon=/img/banderas/10.png
  85127	MAROLA	01/01/1983	Hembra	Zaino	Dark Brown (BRZ) / Sin Asignar	raza=4	icon=/img/banderas/10.png
  47295	MAROLA	01/01/1952	Hembra	Zaino	Gulf Stream / Manila	raza=1	icon=/img/banderas/10.png
  35544	MAROLDA	01/01/1976	Hembra	No Consigna	Marouf / Sin Asignar	raza=4	icon=/img/banderas/10.png
  61380	MAROLINA	01/01/1979	Hembra	Alazan	Sin Asignar / Giroflee	raza=4	icon=/img/banderas/10.png
  33539	MAROLINA YI	01/01/1976	Hembra	Zaino	Yi / Mujer	raza=4	icon=/img/banderas/10.png

=== BELLA DO — 7 hits
  359531	BELLA DOCTA	04/09/2016	Hembra	Zaino	Que Vida Buena / Blood Of Honour	raza=4	icon=/img/banderas/10.png
  403664	BELLA DOÑA	13/11/2017	Macho	Alazan	Bella Shambrock (USA) / La Mejorcita	raza=4	icon=/img/banderas/10.png
  338752	BELLA DORADA	11/10/2013	Hembra	Alazan	My Choice / Dorada Angie	raza=4	icon=/img/banderas/10.png
  461513	BELLA DORATO	01/01/2003	Hembra	Zaino	Goldminers Gold (USA) / Wichkin (USA)	raza=4	icon=/img/banderas/239.png
  244119	BELLA DORIANA	09/08/2002	Hembra	Zaino	Dorian Gray / Abcisa	raza=4	icon=/img/banderas/10.png
  217767	BELLA DORMELLA	18/09/1998	Hembra	Zaino	Bid Us (USA) / Luna Dormella	raza=4	icon=/img/banderas/10.png
  89602	BELLA DORYS	01/01/1983	Hembra	No Consigna	Adorado / Sin Asignar	raza=4	icon=/img/banderas/10.png

=== BELLA DON — 0 hits
```

Segunda pasada (INDIA MARO y BELLA DOÑA, más variantes):

```bash
node tools/studbook_probe_terms.mjs scratchpad/r9_probe_terms_2.json "INDIA MARO" "INDIAMARO" "INDIA MAROM" "INDIO MARO" "INDIA MARR" "IDALIA" "ITZEL" "BELLADONA" "BELLA DONNA" "BELLA DONA" "BELLADONNA" "BELLA DUEÑA" "BELLA DOÑ"
```

```

=== INDIA MARO — 0 hits

=== INDIAMARO — 0 hits

=== INDIA MAROM — 0 hits

=== INDIO MARO — 0 hits

=== INDIA MARR — 0 hits

=== IDALIA — 4 hits
  456744	IDALIA	31/08/2025	Hembra	Alazan	Pneumatic (USA) / In The Moodforlove	raza=4	icon=/img/banderas/10.png
  74326	IDALIA	02/10/1981	Hembra	Alazan	Snow Caravan / Trompette	raza=4	icon=/img/banderas/10.png
  431374	IDALIA MARO	15/10/2021	Hembra	Zaino	Engelhard / Itzel Chica	raza=4	icon=/img/banderas/10.png
  246006	IDALIANA	14/10/2002	Hembra	Zaino	Interprete / Octalia	raza=4	icon=/img/banderas/10.png

=== ITZEL — 4 hits
  350007	ITZEL	09/09/2014	Hembra	Zaino	E Dubai (USA) / Ilaro Court (USA)	raza=4	icon=/img/banderas/10.png
  336199	ITZEL CHICA	02/09/2013	Hembra	Zaino	Upward Trend (USA) / Ilegal Chica	raza=4	icon=/img/banderas/10.png
  437552	ITZEL LUZ	14/09/2022	Hembra	Zaino Doradillo	Montelu / Itzel Prax	raza=4	icon=/img/banderas/10.png
  328418	ITZEL PRAX	03/10/2012	Hembra	Zaino	Praxis Parade / Itzacal	raza=4	icon=/img/banderas/10.png

=== BELLADONA — 1 hits
  27247	BELLADONA	22/08/1975	Hembra	Zaino	Bunker (GB) / Belgravia	raza=4	icon=/img/banderas/10.png

=== BELLA DONNA — 0 hits

=== BELLA DONA — 0 hits

=== BELLADONNA — 3 hits
  373617	BELLADONNA	01/01/1952	Hembra	Zaino Doradillo	Sin Asignar / Sin Asignar	raza=4	icon=/img/banderas/10.png
  382041	BELLADONNA	01/01/1885	Hembra	Zaino	Sin Asignar / Sin Asignar	raza=4	icon=/img/banderas/10.png
  138937	BELLADONNA HALIMA	26/01/1972	Hembra	Tordillo	Ansata Ibn Halima (EG) / Macdonna	raza=3	icon=/img/banderas/239.png

=== BELLA DUEÑA — 0 hits

=== BELLA DOÑ — 1 hits
  403664	BELLA DOÑA	13/11/2017	Macho	Alazan	Bella Shambrock (USA) / La Mejorcita	raza=4	icon=/img/banderas/10.png
```

### Lectura

| planilla | motivo del scraper | qué se encontró | resolución |
|---|---|---|---|
| MARIA CATULANGA (T3) | SIN_MATCH_EXACTO, 0 candidatos | prefijo `MARIA CATU` → **MARIA CATULENGA** sb 440678, 15/10/2022, Hembra, Zaino, Fiskardo × Ever Propulsora. Único hit | **Typo de planilla (A→E).** 4 años ✅ T2/T3. → grupo A con la grafía del Stud Book |
| NIÑO OSEANICO (T4) | SIN_MATCH_EXACTO, 0 candidatos | prefijo `NIÑO OCE` → **NIÑO OCEANICO** sb 428019, 01/09/2021, Macho, Zaino, Seahenge (USA) × Niña Divina. Único hit | **Typo de planilla (S→C).** 5 años ✅ T4. → grupo A |
| INDIA MARO (T10) | SIN_MATCH_EXACTO, 0 candidatos | `INDIA MAR` (6 hits), `INDIA MA` (15, truncado en MA-R), `INDIA MARO`, `INDIAMARO`, `INDIO MARO`, `INDIA MARR`: **nada**. Tampoco cuelga de la familia de IDALIA MARO (Itzel Chica tiene una sola hija registrada con MARO) | **No existe con ese nombre.** Vuelve a Yesi: ¿cómo se llama de verdad? Sin ficha no hay fecha ni sexo → no se puede dar de alta ni validar el gate |
| BELLA DOÑA (T1) | OK (match exacto, único) | sb 403664, **13/11/2017, Macho**, Alazan, Bella Shambrock (USA) × La Mejorcita. `BELLA DO` da 7 hits, ninguno otro BELLA DOÑA; BELLADONA/BELLADONNA son de 1975/1952/1885 | **Edad imposible para T1** (3 años perdedores): tiene 9. O el nombre de la planilla está mal, o está anotado en el turno equivocado. **No insertar** hasta que Yesi confirme — si se inserta tal cual, el gate lo rechaza en T1 y encima queda un caballo de 9 años en el padrón que quizás no es el que corre |
| BIEN COQUETA (T2) | MATCH_AMBIGUO (2021 H / 1998 H) | 1998 se descarta sola (28 años). Queda sb 429819, 15/10/2021, Hembra, Bien Terminado × Gritty | Por edad de turno elegiría la de 2021, **pero T2 es "4 años perdedor" y ésta tiene 5.** No cierra. Vuelve a Yesi: ¿es de T4 (5 y +) y se anotó mal el turno, o es otra yegua? |
| QUERELLANTE (T9) | MATCH_AMBIGUO (2019 M / 1947 M) | 1947 se descarta. Queda sb 416936, 11/10/2019, Macho, Daniel Boone (BRZ) × Que Felicidad | **Resuelto por edad**: 7 años, T9 es "4 y +" ✅. → grupo A |
| CONESERA (confirmación) | MATCH_AMBIGUO (2023 H / 1993 H) | 1993 se descarta. sb 444373, 20/09/2023, **Hembra**, Emmanuel × Milonga Burrera — misma fecha, mismo padre, misma madre que la fila `1f645327-…` de la DB | **Confirmado que es el mismo animal.** Pero `spcs.sexo` = `macho` y el Stud Book dice **Hembra**. La leyenda `(2023 H SP)` es inequívoca. → §6 |

---

## 4. Edad y sexo contra el turno (los 18 de A + los 3 de B)

Edad reglamentaria al 20/09/2026 (después del 1/7): `2026 − año de nacimiento`.

| nombre (Stud Book) | sb | nac. | edad | sexo | turno | el turno pide | ✓ |
|---|---|---|---|---|---|---|---|
| ETERNA DOCTORA | 442125 | 2023-07-29 | 3 | hembra | T1 | 3 años | ✅ |
| DESERT OF DUBAI | 446340 | 2023-10-09 | 3 | macho | T1 | 3 años | ✅ |
| HERMANOSDEMIPATRIA | 443096 | 2023-09-07 | 3 | macho | T1 | 3 años | ✅ |
| ALHENA | 434871 | 2022-07-16 | 4 | hembra | T2 | 4 años | ✅ |
| OLA DOCTOR | 438421 | 2022-10-24 | 4 | macho | T2, T3 | 4 años | ✅ |
| DEL CAMPEON | 438805 | 2022-10-17 | 4 | macho | T2 | 4 años | ✅ |
| TORO MAÑERO | 440758 | 2022-10-21 | 4 | macho | T3 | 4 años | ✅ |
| MARIA CATULENGA | 440678 | 2022-10-15 | 4 | hembra | T3 | 4 años | ✅ |
| BACON | 428803 | 2021-07-17 | 5 | macho | T4 | 5 y + | ✅ |
| NISTEL WIN | 430420 | 2021-10-08 | 5 | macho | T4 | 5 y + | ✅ |
| NIÑO OCEANICO | 428019 | 2021-09-01 | 5 | macho | T4 | 5 y + | ✅ |
| HALLOTOP | 441122 | 2021-10-08 | 5 | macho | T6 | 5 y + | ✅ |
| EL RISKO | 421108 | 2020-09-10 | 6 | macho | T7 | 6 y + | ✅ |
| ATOMIZADOR | 422969 | 2020-10-26 | 6 | macho | T7 | 6 y + | ✅ |
| QUERELLANTE | 416936 | 2019-10-11 | 7 | macho | T9 | 4 y + | ✅ |
| THE BEAST PARTY | 438032 | 2022-07-30 | 4 | macho | T9 | 4 y + (texto) | ✅ texto · ⚠ `edad_minima_anos=5` en DB lo rechaza (§7 ítem 1) |
| ABARAJALA | 433798 | 2020-10-25 | 6 | **hembra** | T10 | yeguas, 5 y + (DB) / 4 y 5 (planilla) | ✅ DB · ✗ planilla (§7 ítem 2) |
| GOIADORA | 428590 | 2021-09-23 | 5 | hembra | T11 | 5 y + | ✅ |
| **BELLA DOÑA** | 403664 | 2017-11-13 | **9** | **macho** | T1 | 3 años | ❌ |
| **EL MAS SABIO** | 431662 | 2021-10-26 | **5** | macho | T5 | 3 y 4 (texto) / min 5 (DB) | ❌ texto · ✅ DB — el turno está mal en un lado o en el otro |
| **BIEN COQUETA** | 429819 | 2021-10-15 | **5** | hembra | T2 | 4 años | ❌ |

Alertas automáticas del scraper (sexo desconocido / raza ≠ 4 / bandera no argentina): **ninguna** en los 18.

---

## 5. Chequeos de duplicado post-scrape (§6c del informe base, ítems 3-4)

```sql
with sc(nombre, sbid, fn, padre, madre) as (values
('ETERNA DOCTORA','442125','2023-07-29'::date,'Doctor Embrujo','Eterna Diablita'),
('DESERT OF DUBAI','446340','2023-10-09','Dubai Thunder (GB)','Grela (USA)'),
('HERMANOSDEMIPATRIA','443096','2023-09-07','Grand Reward (USA)','Cat The Gold'),
('BELLA DOÑA','403664','2017-11-13','Bella Shambrock (USA)','La Mejorcita'),
('ALHENA','434871','2022-07-16','Puerto Escondido','Almedha'),
('OLA DOCTOR','438421','2022-10-24','Lead To Win','Sweet Johar (USA)'),
('DEL CAMPEON','438805','2022-10-17','Golden Cigars','Sixties Spirit'),
('TORO MAÑERO','440758','2022-10-21','Hit It A Bomb (USA)','Sarawak Top'),
('BACON','428803','2021-07-17','Winning Prize','Biosfera'),
('NISTEL WIN','430420','2021-10-08','Lead To Win','Barbie Nistel'),
('EL MAS SABIO','431662','2021-10-26','Il Campione (CHI)','Indigirka'),
('HALLOTOP','441122','2021-10-08','Maipo Top','Halloweeninseattle'),
('EL RISKO','421108','2020-09-10','Security Risk (USA)','Spanakopitas'),
('ATOMIZADOR','422969','2020-10-26','Daniel Boone (BRZ)','Atomic Star'),
('THE BEAST PARTY','438032','2022-07-30','In The Dark','Rimout Party'),
('ABARAJALA','433798','2020-10-25','Storm Question','Redondiya'),
('GOIADORA','428590','2021-09-23','Goias Key','Degolladora'),
('BIEN COQUETA','429819','2021-10-15','Bien Terminado','Gritty'),
('QUERELLANTE','416936','2019-10-11','Daniel Boone (BRZ)','Que Felicidad'),
('MARIA CATULENGA','440678','2022-10-15','Fiskardo','Ever Propulsora'),
('NIÑO OCEANICO','428019','2021-09-01','Seahenge (USA)','Niña Divina'),
('CONESERA','444373','2023-09-20','Emmanuel','Milonga Burrera'),
('LOGUACIOUS','431567','2021-10-23','Le Blues','Effervesence'))
select sc.nombre, sc.sbid,
 (select string_agg(s.nombre||' ['||s.id||']', '; ') from spcs s where s.studbook_id=sc.sbid) as por_sbid,
 (select string_agg(s.nombre||' ['||s.id||'] sexo='||s.sexo||' sb='||coalesce(s.studbook_id,'NULL'), '; ') from spcs s where s.fecha_nacimiento=sc.fn and upper(s.padrillo_nombre)=upper(sc.padre) and upper(s.madre_nombre)=upper(sc.madre)) as por_fn_padre_madre,
 (select string_agg(s.nombre||' ['||s.id||']', '; ') from spcs s where s.fecha_nacimiento=sc.fn and (upper(s.padrillo_nombre)=upper(sc.padre) or upper(s.madre_nombre)=upper(sc.madre))) as por_fn_y_un_padre
from sc
```

Salida cruda:

```json
[{"nombre":"ETERNA DOCTORA","sbid":"442125","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"DESERT OF DUBAI","sbid":"446340","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"HERMANOSDEMIPATRIA","sbid":"443096","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"BELLA DOÑA","sbid":"403664","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"ALHENA","sbid":"434871","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"OLA DOCTOR","sbid":"438421","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"DEL CAMPEON","sbid":"438805","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":"YO SOY TANGO [67db5702-1886-4128-88fa-55e8a002cbf2]"},
 {"nombre":"TORO MAÑERO","sbid":"440758","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"BACON","sbid":"428803","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"NISTEL WIN","sbid":"430420","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"EL MAS SABIO","sbid":"431662","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"HALLOTOP","sbid":"441122","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"EL RISKO","sbid":"421108","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"ATOMIZADOR","sbid":"422969","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"THE BEAST PARTY","sbid":"438032","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"ABARAJALA","sbid":"433798","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"GOIADORA","sbid":"428590","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"BIEN COQUETA","sbid":"429819","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"QUERELLANTE","sbid":"416936","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"MARIA CATULENGA","sbid":"440678","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"NIÑO OCEANICO","sbid":"428019","por_sbid":null,"por_fn_padre_madre":null,"por_fn_y_un_padre":null},
 {"nombre":"CONESERA","sbid":"444373","por_sbid":null,"por_fn_padre_madre":"Conesera [1f645327-a6da-449b-8a62-fdb577a8658e] sexo=macho sb=NULL","por_fn_y_un_padre":"Conesera [1f645327-a6da-449b-8a62-fdb577a8658e]"},
 {"nombre":"LOGUACIOUS","sbid":"431567","por_sbid":"LOGUACIOUS [71911106-b45b-4381-b077-41195ee67f81]","por_fn_padre_madre":"LOGUACIOUS [71911106-b45b-4381-b077-41195ee67f81] sexo=hembra sb=431567","por_fn_y_un_padre":"LOGUACIOUS [71911106-b45b-4381-b077-41195ee67f81]"}]
```

- **Por `studbook_id`**: ningún sb_id de los 21 candidatos a alta ya está en la base. Único hit es LOGUACIOUS, que es la confirmación. El UNIQUE de `studbook_id` no va a reventar.
- **Por fecha + padre + madre**: ningún candidato a alta coincide con una fila existente. Los únicos hits son las dos confirmaciones (CONESERA por pedigree, LOGUACIOUS por todo).
- **Por fecha + un progenitor**: DEL CAMPEON ↔ YO SOY TANGO. Verificado:

```sql
select nombre, fecha_nacimiento, sexo, color, padrillo_nombre, madre_nombre, studbook_id from spcs where nombre ilike 'YO SOY TANGO'
```
```json
[{"nombre":"YO SOY TANGO","fecha_nacimiento":"2022-10-17","sexo":"macho","color":"Zaino","padrillo_nombre":"Golden Cigars","madre_nombre":"Bet Game","studbook_id":null}]
```
  Mismo padrillo (Golden Cigars), mismo día, **distinta madre** (Bet Game vs Sixties Spirit): medio hermanos paternos, dos caballos. No es duplicado.

**Resultado: cero duplicados entre los 21 que tienen ficha y las 181 filas existentes.**

---

## 6. Hallazgo colateral: `Conesera` tiene el sexo al revés en la DB

| fuente | sexo |
|---|---|
| `spcs` `1f645327-…` (`Conesera`, cargada 09/05/2026 a mano, sin `studbook_id`) | `macho` |
| Stud Book sb 444373, leyenda `(2023 H SP)`, misma fecha 20/09/2023, Emmanuel × Milonga Burrera | **Hembra** |

No afecta el gate de T1 (`condicion_sexo = ambos`) pero sí el **descargo de 2 kg a las hembras** del turno, y el programa. Ya está inscripta en R9 T1. **Propuesta**: en el mismo SQL de la tanda, un `UPDATE spcs SET sexo='hembra', studbook_id='444373', nombre='CONESERA', notas=… WHERE id='1f645327-…'` — es corrección, no alta. **Confirmar con Yesi** (ella la cargó; a lo mejor conoce al animal).

---

## 7. Sin resolver — lo que vuelve a Yesi antes del INSERT

1. **BELLA DOÑA**: el único del Stud Book es un macho de 2017 (9 años). T1 es 3 años. ¿Nombre mal, turno mal, o caballo no registrado?
2. **INDIA MARO**: no existe en el Stud Book. ¿Nombre real?
3. **BIEN COQUETA**: la única viable es una yegua de 2021 (5 años); T2 es 4 años. ¿Va a T4/T10?
4. **EL MAS SABIO**: 5 años. T5 dice "3 y 4 años" en el texto pero `edad_minima_anos=5` en la DB. Mismo desacuerdo de siempre (informe base §4) — acá el caballo cierra con la columna y no con el texto. ¿Cuál manda?
5. **Conesera sexo** (§6): ¿corrijo a hembra?
6. Ya conocidos, no de esta tanda: THE BEAST PARTY (4 años) y cualquier 4 años en T9 chocan con `edad_minima_anos=5`; ABARAJALA (6) choca con el "4 y 5" de la planilla en T10 pero no con la DB. Son los ítems 1 y 2 del addendum: el fix de columnas de edad es otro pedido.

---

## 8. Próximo paso (con tu OK)

- Armar `migrations/spcs_r9_tanda_1.sql` con **18 INSERTs** (grupo A, grafía del Stud Book, `registro_stud_book` NULL, `notas` = `studbook_id` + `url_perfil`, `club_id` NULL como el resto del padrón global) + el UPDATE de Conesera si lo aprobás. Los 3 de B y el de C **fuera del SQL** hasta que Yesi conteste.
- Baseline `spcs` pasaría de 181 a **199** (o 199 + lo que se sume de B).
- Probe post-insert: 18 filas nuevas por `studbook_id`, sexo/fecha iguales al JSON de evidencia, y `count(*)`.

---

## 9. Verificación de push

```
$ git push origin reports
$ git ls-remote origin reports
12e1b9fde867e69065803af2d2e20e318898f1ef	refs/heads/reports
$ git rev-parse HEAD
12e1b9fde867e69065803af2d2e20e318898f1ef
```
