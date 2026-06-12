#!/usr/bin/env python3
"""Read-only extractor del Stud Book Argentino (www.studbook.org.ar).
Fase 1: scrape + JSON. NO toca Supabase. NO escribe en la DB.

Por cada caballo de la lista:
  1. autocomplete (term, tipo=1, muerto=1) -> candidatos con metadata
  2. match exacto por nombre (case/acento-insensitive)
  3. desambiguacion por sexo-hint; si no -> AMBIGUO
  4. fetch del perfil -> ids de pedigree, criador, lugar nac, caballeriza, microchip, pais, estado
"""
import json, re, subprocess, time, unicodedata, urllib.parse, html as ihtml

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
BASE = "https://www.studbook.org.ar"

LISTA = [
    ("AFRICUM", "?"), ("ARMOÑOZO", "?"), ("ASTUTO NOTES", "?"),
    ("BABY PARADISE", "?"), ("BAM BAM HITS", "?"), ("BUEN DURAZNO", "?"),
    ("BUEN MANUEL", "?"), ("CALAVERIANDO", "?"), ("CARRIGAN FITZ", "?"),
    ("CHAMPION GOLDEN", "?"), ("CHINITA SALTEÑA", "?"), ("CIUDAD REAL", "?"),
    ("CLAIRE CHUCK", "?"), ("CRAZY RABID", "?"), ("DARIN", "?"),
    ("DESDEN", "?"), ("DESTINADO JOHAN", "?"), ("DOCTOR SKY", "?"),
    ("DOCTORA APASIONADA", "?"), ("DOCTORA MIA", "?"), ("DOLAR JOHAN", "?"),
    ("ECHO IN THE SKY", "?"), ("EMMOZONITO", "?"), ("ESCUCHAR TU VOZ", "?"),
    ("ESTAS A TIEMPO", "?"), ("EVER AHEAD", "?"), ("FALAYS", "?"),
    ("FURIA ENCANTADA", "?"), ("FURIOSO ON", "?"), ("GINIYA GOOD", "?"),
    ("GOIAS GREEN", "?"), ("GRAND VUELTERA", "?"), ("GRILLADA RYE", "?"),
    ("HEART OR GOLD", "?"), ("INDIO VALIDO", "?"), ("IX GOAL TUN", "?"),
    ("KRISTALINA", "?"), ("KUCCINI", "?"), ("L A RODESIA", "?"),
    ("LA ALFARERA", "?"), ("LA DIVERTENTE", "?"), ("LA NOUBITA", "?"),
    ("LA SENTADA", "?"), ("LATIN PRESUMIDA", "?"), ("LATIN RAIN", "?"),
    ("LE BIRD", "?"), ("LOCA DUBAI", "?"), ("LOCO FUN", "?"),
    ("LUMIN", "?"), ("MAESTRO DE ARMAS", "?"), ("MI ILUSION", "?"),
    ("NOCHE EN VELA", "?"), ("PAULINA KEY", "?"), ("PORTEÑO Y BAILARIN", "?"),
    ("QUE TAL OREJA", "?"), ("QUEEN OF HEART", "?"), ("QUIET GAUCHO", "?"),
    ("QUIET SANTINA", "?"), ("REY DE PILA", "?"), ("SANTA LISA", "?"),
    ("SANTA PACIENCIA", "?"), ("SEMBRADOR CHUCK", "?"), ("SIEMPREHAYESPERANZA", "?"),
    ("SIGO VIAJE", "?"), ("TAHYI TAROVA", "?"), ("TALENTOSA CACH", "?"),
    ("TATA FOOT", "?"), ("TATI SONG", "?"), ("THE SULTAN", "?"),
    ("TIRSO", "?"), ("TOY BOY", "?"), ("TURRON KEY", "?"),
    ("UNBOTHERED", "?"), ("VISION SECURITY", "?"), ("YO SOY TANGO", "?"),
    ("YUKINA", "?"),
]


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
    q = urllib.parse.quote(name)
    url = f"{BASE}/ejemplares/autocomplete?tipo=1&muerto=1&term={q}"
    raw = curl(url)
    try:
        return json.loads(raw)
    except Exception:
        return []


def ddmmyyyy_to_iso(s):
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", s or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def fetch_profile(pid, slug):
    url = f"{BASE}/ejemplares/perfil/{pid}/{slug}"
    h = curl(url)
    out = {"pais": None, "pelaje": None, "padre_id": None, "madre_id": None,
           "abuelo_materno_id": None, "criador": None, "caballeriza_studbook": None,
           "microchip": None, "lugar_nacimiento": None, "estado": None}
    if not h:
        return out, url, False
    # cabecera: PAIS | SEXO | PELAJE | SP
    m = re.search(r"([^|<>\n]+?)\s*\|\s*(?:Hembra|Macho|Castrado)\s*\|\s*([^|<>\n]+?)\s*\|\s*SP", h)
    if m:
        out["pais"] = m.group(1).strip() or None
        out["pelaje"] = m.group(2).strip() or None
    # microchip
    m = re.search(r'label-micro">\s*#?([0-9A-Za-z]+)', h)
    if m:
        out["microchip"] = m.group(1)
    # pedigree ids: por <a perfil/ID>PADRE</a> y <a perfil/ID>MADRE</a> por <a perfil/ID>ABUELO</a>
    m = re.search(
        r'por\s*<a href="/ejemplares/perfil/(\d+)/[^"]+">[^<]+</a>\s*y\s*'
        r'<a href="/ejemplares/perfil/(\d+)/[^"]+">[^<]+</a>\s*por\s*'
        r'<a href="/ejemplares/perfil/(\d+)/[^"]+">[^<]+</a>', h, re.S)
    if m:
        out["padre_id"], out["madre_id"], out["abuelo_materno_id"] = m.group(1), m.group(2), m.group(3)
    else:
        # fallback: padre y madre sin abuelo linkeado
        m2 = re.search(
            r'por\s*<a href="/ejemplares/perfil/(\d+)/[^"]+">[^<]+</a>\s*y\s*'
            r'<a href="/ejemplares/perfil/(\d+)/[^"]+">[^<]+</a>', h, re.S)
        if m2:
            out["padre_id"], out["madre_id"] = m2.group(1), m2.group(2)
    # criador
    m = re.search(r'Criador</td>.*?<a href="/criadores/perfil/[^"]+">([^<]+)</a>', h, re.S)
    if m:
        out["criador"] = ihtml.unescape(m.group(1).strip())
    # lugar nacimiento
    m = re.search(r'Lugar Nacimiento</td>\s*<td[^>]*>([^<]*)</td>', h, re.S)
    if m and m.group(1).strip():
        out["lugar_nacimiento"] = ihtml.unescape(m.group(1).strip())
    # caballeriza (fila de datos, singular)
    m = re.search(r'>\s*Caballeriza\s*</td>\s*<td[^>]*>(?:\s*<a[^>]*>)?([^<]+)', h, re.S)
    if m and m.group(1).strip() and norm(m.group(1)) not in ("CABALLERIZAS",):
        out["caballeriza_studbook"] = ihtml.unescape(m.group(1).strip())
    # estado: el perfil NO expone un marcador confiable de muerto/exportado en el
    # cuerpo (las palabras "muertos"/"exportados-importados" solo aparecen en el
    # menu de navegacion -> falso positivo). Se deja null hasta tener ancla real.
    out["estado"] = None
    return out, url, True


resultados, no_encontrados, ambiguos = [], [], []

for nombre, hint in LISTA:
    print(f"-> {nombre} [{hint}]")
    cands = autocomplete(nombre)
    nn = norm(nombre)
    exact = [c for c in cands if norm(c.get("text")) == nn]
    if not exact:
        # intento parcial informativo
        no_encontrados.append({"nombre": nombre,
                               "candidatos_parciales": [
                                   {"id": c.get("id"), "text": c.get("text"),
                                    "sexo": c.get("sexo"), "nacimiento": c.get("nacimiento")}
                                   for c in cands[:8]]})
        print("   NO ENCONTRADO")
        continue
    chosen = None
    if len(exact) == 1:
        chosen = exact[0]
    else:
        # desambiguar por sexo-hint
        if hint == "hembra":
            f = [c for c in exact if norm(c.get("sexo")) == "HEMBRA"]
        elif hint == "macho-o-castrado":
            f = [c for c in exact if norm(c.get("sexo")) in ("MACHO", "CASTRADO")]
        else:
            f = exact
        if len(f) == 1:
            chosen = f[0]
        else:
            ambiguos.append({"nombre": nombre, "hint": hint,
                             "candidatos": [
                                 {"id": c.get("id"), "text": c.get("text"),
                                  "sexo": c.get("sexo"), "nacimiento": c.get("nacimiento"),
                                  "url_friendly": c.get("url_friendly")}
                                 for c in exact]})
            print(f"   AMBIGUO ({len(exact)} candidatos)")
            continue
    pid = chosen.get("id")
    slug = chosen.get("url_friendly") or "x"
    prof, url, ok = fetch_profile(pid, slug)
    rec = {
        "nombre": chosen.get("text"),
        "id_studbook": pid,
        "url_perfil": url,
        "sexo": chosen.get("sexo"),
        "pelaje": chosen.get("pelo") or prof["pelaje"],
        "fecha_nacimiento": ddmmyyyy_to_iso(chosen.get("nacimiento")),
        "pais": prof["pais"],
        "padre": chosen.get("padre"),
        "padre_id": prof["padre_id"],
        "madre": chosen.get("madre"),
        "madre_id": prof["madre_id"],
        "abuelo_materno": chosen.get("abuelo_materno"),
        "abuelo_materno_id": prof["abuelo_materno_id"],
        "criador": prof["criador"],
        "caballeriza_studbook": prof["caballeriza_studbook"],
        "microchip": prof["microchip"],
        "estado": prof["estado"],
    }
    resultados.append(rec)
    print(f"   OK id={pid} {rec['sexo']} {rec['fecha_nacimiento']} prof_ok={ok}")
    time.sleep(1)

salida = {
    "_meta": {"fuente": "www.studbook.org.ar", "fase": "1-scrape-readonly",
              "total_lista": len(LISTA), "encontrados": len(resultados),
              "no_encontrados": len(no_encontrados), "ambiguos": len(ambiguos)},
    "ejemplares": resultados,
    "NO_ENCONTRADOS": no_encontrados,
    "AMBIGUOS": ambiguos,
}
with open("data/studbook_faltantes_20j.json", "w", encoding="utf-8") as f:
    json.dump(salida, f, ensure_ascii=False, indent=2)
print("\n==== RESUMEN ====")
print(json.dumps(salida["_meta"], ensure_ascii=False, indent=2))
print("NO_ENCONTRADOS:", [x["nombre"] for x in no_encontrados])
print("AMBIGUOS:", [x["nombre"] for x in ambiguos])
