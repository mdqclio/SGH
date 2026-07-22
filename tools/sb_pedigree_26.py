#!/usr/bin/env python3
"""PASO 4 — scrape read-only de padre/madre para los 26 SPCs sin pedigree.

Read-only total: NO toca Supabase, NO escribe en la DB. Sólo produce
data/pedigree_scrape_26.json para revisión antes del UPDATE.

Criterio de match (mismo de siempre + desambiguación por fecha):
  1. autocomplete(nombre) -> match exacto por nombre normalizado
  2. si hay 1 candidato exacto -> ese
  3. si hay homónimos -> preferir el que coincide en fecha_nacimiento con la DB;
     si ninguno coincide -> el de nacimiento más reciente (criterio acordado)
  4. si no hay match exacto -> NO_ENCONTRADO (se listan candidatos parciales,
     NO se inventa nada)
  5. sanity por sexo/edad: se REPORTA la discrepancia, no descarta el match
     (el `sexo` de la carga manual es poco confiable — ver paso 1)

Padre/madre salen del autocomplete; si vienen vacíos se caen al perfil HTML.
"""
import json, re, subprocess, time, unicodedata, urllib.parse, html as ihtml

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
BASE = "https://www.studbook.org.ar"
OUT = "data/pedigree_scrape_26.json"

# (spc_id, nombre, fecha_nacimiento_db, sexo_db, inscripciones)
LISTA = [
    ("019d9b9f-7b81-490e-b219-aff383fae166", "Amiguito Peligroso", "2023-07-07", "macho", 0),
    ("3ce64b58-0d87-47fd-98e6-d9705fa118d4", "Berry Nik",           "2023-10-23", "macho", 1),
    ("9944b791-3bb7-46d7-8590-1e0b8bca6bb4", "Come on Baby",        "2020-08-21", "macho", 0),
    ("1f645327-a6da-449b-8a62-fdb577a8658e", "Conesera",            "2023-09-20", "macho", 1),
    ("44abb392-8b73-4c68-9160-edfd8d58f27b", "Cursi Nik",           "2023-10-27", "macho", 0),
    ("70f275b6-0337-4617-99c2-fefb7447cb2e", "De Moda",             "2023-09-04", "macho", 1),
    ("18a21c29-8b3e-4500-9abe-adaebf717d2c", "Dourada",             "2023-07-01", "hembra", 0),
    ("9fc5b39c-0579-4cd9-acbb-f023ab35d168", "Es Mistres",          "2023-10-05", "macho", 1),
    ("f78a132a-7fe7-4713-8ac2-9bd41a34f565", "Esplendido Craf",     "2020-10-18", "macho", 0),
    ("2a35ea5b-8756-42f4-8da2-457370826280", "Fiestera Nik",        "2023-08-29", "macho", 0),
    ("214e5a7a-f773-4c44-95e9-41f0b25ef55a", "First Queen",         "2023-10-04", "macho", 0),
    ("0dc2f58f-0e2f-4915-be79-a7515fdd6ee4", "Fist Queen",          "2023-10-04", "macho", 0),
    ("1c89581b-b0ec-4588-9e28-596312ce6a7b", "Folke Dancer",        "2020-07-06", "macho", 0),
    ("6df0d170-4d32-43d3-82cb-b0c540963bc8", "GREAT ORPEN",         "2023-10-05", "macho", 1),
    ("8a6aea98-d121-4ad6-90d6-c08e8cfd8c75", "Icy Tom",             "2018-09-02", "macho", 1),
    ("fcc0bbdb-e3f7-4830-b038-beabe11faf7c", "La City Porteña",     "2023-07-01", "macho", 0),
    ("3539cab0-e2d4-4748-945d-67e36787a96d", "La Motocicleta",      "2023-08-22", "macho", 0),
    ("da839b11-00a3-4eb8-b09f-03790d425ed9", "Malenuchi",           "2023-10-15", "macho", 0),
    ("9c9c742c-86a1-4c7b-a060-6ab47900b451", "Malenuchi Jack",      "2023-10-15", "macho", 0),
    ("a91658ed-b79c-4abe-bd08-3a672bd923e4", "MONADESEDA",          "2023-10-01", "macho", 1),
    ("c1af88b9-6fbd-4883-a025-03f44f1fdfab", "MOSQUITA GARDEN",     "2023-10-10", "macho", 1),
    ("f8a81c1b-867a-4341-8757-a89fc9347a16", "MR. PATO",            "2023-08-17", "macho", 1),
    ("c4ddc3d2-2687-4dd9-9d24-469c62e64f7c", "PUNAB",               "2023-10-04", "macho", 0),
    ("53c1892a-68eb-4ce4-b198-a7985e4048b5", "Vito lo capo",        "2021-10-22", "macho", 1),
    ("f277af1c-a4ac-4a98-87d7-b41871718c8d", "Wave Rimout",         "2017-08-08", "macho", 1),
    ("5ebc5e48-2caf-4c44-be6a-ad75f2716850", "Wave Rimout",         "2017-08-08", "macho", 0),
]


# El autocomplete del SB no tolera algunos caracteres del nombre cargado en la DB.
# Sólo se reescribe el TÉRMINO DE BÚSQUEDA; el match sigue siendo exacto contra
# el nombre normalizado (norm() ya ignora puntuación), así que no afloja el criterio.
TERM_OVERRIDE = {
    "MR. PATO": "MR PATO",
}


def norm(s):
    if s is None:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^A-Za-z0-9]+", " ", s).strip().upper()
    return re.sub(r"\s+", " ", s)


def curl(url, retries=4):
    for i in range(retries):
        try:
            r = subprocess.run(
                ["curl", "-sS", "-m", "60", "--compressed",
                 "-H", "Connection: close", "-H", "X-Requested-With: XMLHttpRequest",
                 "-A", UA, url],
                capture_output=True, timeout=70)
            out = r.stdout.decode("utf-8", "replace")
            if out:
                return out
        except Exception as e:
            print(f"   curl err {i}: {e}")
        time.sleep(2 + i * 2)
    return ""


def autocomplete(name):
    url = f"{BASE}/ejemplares/autocomplete?tipo=1&muerto=1&term={urllib.parse.quote(name)}"
    try:
        return json.loads(curl(url))
    except Exception:
        return []


def ddmmyyyy_to_iso(s):
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", s or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def clean(s):
    if not s:
        return None
    s = ihtml.unescape(re.sub(r"<[^>]+>", "", str(s))).strip()
    return s or None


def fetch_profile_pedigree(pid, slug):
    """Fallback: nombres de padre/madre desde el HTML del perfil."""
    url = f"{BASE}/ejemplares/perfil/{pid}/{slug}"
    h = curl(url)
    out = {"padre": None, "madre": None, "padre_id": None, "madre_id": None,
           "pelaje": None, "url": url}
    if not h:
        return out
    m = re.search(
        r'por\s*<a href="/ejemplares/perfil/(\d+)/[^"]+">([^<]+)</a>\s*y\s*'
        r'<a href="/ejemplares/perfil/(\d+)/[^"]+">([^<]+)</a>', h, re.S)
    if m:
        out["padre_id"], out["padre"] = m.group(1), clean(m.group(2))
        out["madre_id"], out["madre"] = m.group(3), clean(m.group(4))
    m = re.search(r"([^|<>\n]+?)\s*\|\s*(?:Hembra|Macho|Castrado)\s*\|\s*([^|<>\n]+?)\s*\|\s*SP", h)
    if m:
        out["pelaje"] = clean(m.group(2))
    return out


encontrados, no_encontrados = [], []

for spc_id, nombre, fnac_db, sexo_db, insc in LISTA:
    print(f"-> {nombre} (db {fnac_db} {sexo_db})")
    term = TERM_OVERRIDE.get(nombre, nombre)
    cands = autocomplete(term)
    nn = norm(nombre)
    exact = [c for c in cands if norm(c.get("text")) == nn]

    if not exact:
        # segunda pasada sólo para enriquecer el reporte de candidatos parciales
        # (nunca para elegir un match: si no hubo exacto, queda NO ENCONTRADO)
        if not cands and " " in term:
            time.sleep(1)
            cands = autocomplete(term.split()[0])
        no_encontrados.append({
            "spc_id": spc_id, "nombre": nombre,
            "fecha_nacimiento_db": fnac_db, "sexo_db": sexo_db, "inscripciones": insc,
            "motivo": "sin match exacto en autocomplete SB",
            "candidatos_parciales": [
                {"id": c.get("id"), "text": c.get("text"), "sexo": c.get("sexo"),
                 "nacimiento": c.get("nacimiento"), "padre": clean(c.get("padre")),
                 "madre": clean(c.get("madre"))}
                for c in cands[:8]],
        })
        print("   NO ENCONTRADO")
        continue

    metodo = "match unico"
    if len(exact) > 1:
        por_fecha = [c for c in exact if ddmmyyyy_to_iso(c.get("nacimiento")) == fnac_db]
        if len(por_fecha) == 1:
            chosen, metodo = por_fecha[0], "homonimos: desambiguado por fecha_nacimiento DB"
        else:
            pool = por_fecha or exact
            chosen = sorted(pool, key=lambda c: ddmmyyyy_to_iso(c.get("nacimiento")) or "",
                            reverse=True)[0]
            metodo = f"homonimos ({len(exact)}): elegido el de nacimiento mas reciente"
    else:
        chosen = exact[0]

    pid = chosen.get("id")
    slug = chosen.get("url_friendly") or "x"
    padre, madre = clean(chosen.get("padre")), clean(chosen.get("madre"))
    prof = {}
    if not padre or not madre:
        prof = fetch_profile_pedigree(pid, slug)
        padre = padre or prof.get("padre")
        madre = madre or prof.get("madre")
        time.sleep(1)

    fnac_sb = ddmmyyyy_to_iso(chosen.get("nacimiento"))
    sexo_sb = (chosen.get("sexo") or "").strip()
    alertas = []
    if fnac_sb and fnac_sb != fnac_db:
        alertas.append(f"fecha_nacimiento SB {fnac_sb} != DB {fnac_db}")
    if sexo_sb and norm(sexo_sb) != norm(sexo_db):
        # castrado en SB vs macho en DB no es discrepancia real
        if not (norm(sexo_sb) == "CASTRADO" and norm(sexo_db) == "MACHO"):
            alertas.append(f"sexo SB {sexo_sb} != DB {sexo_db}")
    if not padre or not madre:
        alertas.append("pedigree incompleto en SB")

    encontrados.append({
        "spc_id": spc_id, "nombre_db": nombre, "nombre_sb": clean(chosen.get("text")),
        "sb_id": pid,
        "url_perfil": prof.get("url") or f"{BASE}/ejemplares/perfil/{pid}/{slug}",
        "padre": padre, "madre": madre,
        "fecha_nacimiento_db": fnac_db, "fecha_nacimiento_sb": fnac_sb,
        "sexo_db": sexo_db, "sexo_sb": sexo_sb or None,
        "pelaje_sb": clean(chosen.get("pelo")) or prof.get("pelaje"),
        "inscripciones": insc, "metodo_match": metodo,
        "candidatos_exactos": len(exact), "alertas": alertas,
    })
    print(f"   OK sb={pid} padre={padre} madre={madre} {'ALERTAS:' + str(alertas) if alertas else ''}")
    time.sleep(1)

salida = {
    "_meta": {
        "fuente": "www.studbook.org.ar", "fase": "paso4-scrape-readonly",
        "escribe_en_db": False,
        "total_lista": len(LISTA), "encontrados": len(encontrados),
        "no_encontrados": len(no_encontrados),
        "con_pedigree_completo": sum(1 for e in encontrados if e["padre"] and e["madre"]),
        "con_alertas": sum(1 for e in encontrados if e["alertas"]),
    },
    "ENCONTRADOS": encontrados,
    "NO_ENCONTRADOS": no_encontrados,
}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(salida, f, ensure_ascii=False, indent=2)

print("\n==== RESUMEN ====")
print(json.dumps(salida["_meta"], ensure_ascii=False, indent=2))
print("NO_ENCONTRADOS:", [x["nombre"] for x in no_encontrados])
print("CON ALERTAS:", [(x["nombre_db"], x["alertas"]) for x in encontrados if x["alertas"]])
