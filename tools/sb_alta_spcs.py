#!/usr/bin/env python3
"""Alta incremental de SPCs desde el Stud Book Argentino — R8.

READ-ONLY TOTAL contra la DB: no toca Supabase, no ejecuta nada. Sólo lee la
web del Stud Book y escribe tres archivos para revisión humana:

  data/spcs_r8_tanda_N_scrape.json   scrape crudo (evidencia)
  migrations/spcs_r8_tanda_N.sql     INSERTs PROPUESTOS (no ejecutados)
  data/spcs_r8_tanda_N_reporte.md    casos que vuelven a Yesi

Uso:
  python3 tools/sb_alta_spcs.py --tanda 1 \
      --nombres  data/r8_tanda_1.txt \
      --snapshot data/spcs_snapshot.json

  python3 tools/sb_alta_spcs.py --selftest     # verifica que el scraper anda

El snapshot de spcs se regenera por MCP antes de cada tanda (ver el .md del
circuito). El script NO se conecta a Supabase justamente para que no pueda
escribir por accidente.

Mismo criterio de match que el backfill de pedigree de julio
(tools/sb_pedigree_26.py): autocomplete + match EXACTO por nombre normalizado.
Diferencia clave: acá el ejemplar NO existe todavía en la DB, así que no hay
fecha_nacimiento contra la cual desambiguar homónimos → los homónimos se
REPORTAN, nunca se eligen solos.
"""
import argparse
import difflib
import html as ihtml
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.parse

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "Chrome/120 Safari/537.36")
BASE = "https://www.studbook.org.ar"

# sexo_spc: macho | hembra | castrado   (el SB devuelve Macho/Hembra/Castrado)
SEXO_MAP = {"MACHO": "macho", "HEMBRA": "hembra", "CASTRADO": "castrado"}

# Umbral de similitud para sugerir "esto puede ser un typo de un SPC existente".
UMBRAL_TYPO = 0.85

# El autocomplete del SB no tolera algunos caracteres; sólo reescribe el TÉRMINO
# DE BÚSQUEDA, el match sigue siendo exacto contra el nombre normalizado.
TERM_OVERRIDE = {
    "MR. PATO": "MR PATO",
}


# ---------------------------------------------------------------- utilidades

def norm(s):
    if s is None:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^A-Za-z0-9]+", " ", s).strip().upper()
    return re.sub(r"\s+", " ", s)


def clean(s):
    if not s:
        return None
    s = ihtml.unescape(re.sub(r"<[^>]+>", "", str(s))).strip()
    return s or None


def ddmmyyyy_to_iso(s):
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", s or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


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
            print(f"   curl err {i}: {e}", file=sys.stderr)
        time.sleep(2 + i * 2)
    return ""


def autocomplete(name):
    url = (f"{BASE}/ejemplares/autocomplete?tipo=1&muerto=1"
           f"&term={urllib.parse.quote(name)}")
    try:
        return json.loads(curl(url))
    except Exception:
        return []


def fetch_profile(pid, slug):
    """Perfil HTML: país, pelaje, ids de pedigree, criador, microchip."""
    url = f"{BASE}/ejemplares/perfil/{pid}/{slug}"
    out = {"pais": None, "pelaje": None, "padre": None, "madre": None,
           "padre_id": None, "madre_id": None, "abuelo_materno_id": None,
           "criador": None, "microchip": None, "url": url, "html_ok": False}
    h = curl(url)
    if not h:
        return out
    out["html_ok"] = True
    # cabecera: PAIS | SEXO | PELAJE | SP
    m = re.search(r"([^|<>\n]+?)\s*\|\s*(?:Hembra|Macho|Castrado)\s*\|\s*"
                  r"([^|<>\n]+?)\s*\|\s*SP", h)
    if m:
        out["pais"] = clean(m.group(1))
        out["pelaje"] = clean(m.group(2))
    # "por <PADRE> y <MADRE> por <ABUELO MATERNO>"
    m = re.search(r'por\s*<a href="/ejemplares/perfil/(\d+)/[^"]+">([^<]+)</a>\s*y\s*'
                  r'<a href="/ejemplares/perfil/(\d+)/[^"]+">([^<]+)</a>', h, re.S)
    if m:
        out["padre_id"], out["padre"] = m.group(1), clean(m.group(2))
        out["madre_id"], out["madre"] = m.group(3), clean(m.group(4))
    m = re.search(r'y\s*<a href="/ejemplares/perfil/\d+/[^"]+">[^<]+</a>\s*por\s*'
                  r'<a href="/ejemplares/perfil/(\d+)/[^"]+">[^<]+</a>', h, re.S)
    if m:
        out["abuelo_materno_id"] = m.group(1)
    m = re.search(r'label-micro">\s*#?([0-9A-Za-z]+)', h)
    if m:
        out["microchip"] = m.group(1)
    m = re.search(r'Criador</td>.*?<a href="/criadores/perfil/[^"]+">([^<]+)</a>',
                  h, re.S)
    if m:
        out["criador"] = clean(m.group(1))
    return out


def cand_resumen(c):
    return {"sb_id": c.get("id"), "nombre": clean(c.get("text")),
            "sexo": c.get("sexo"), "nacimiento": c.get("nacimiento"),
            "pelo": c.get("pelo"), "padre": clean(c.get("padre")),
            "madre": clean(c.get("madre")),
            "url_perfil": f"{BASE}/ejemplares/perfil/{c.get('id')}/"
                          f"{c.get('url_friendly') or 'x'}"}


# ---------------------------------------------------------------- selftest

SELFTEST_FIXTURE = {
    "term": "GREAT ORPEN",
    "sb_id": 447875,
    "nombre": "GREAT ORPEN",
    "padre": "Orpen Farrero",
    "madre": "Great Perfection",
    "nacimiento_iso": "2023-12-12",
    "sexo": "Macho",
    "pelo": "Zaino",
    "url_friendly": "great-orpen",
    # del perfil HTML
    "pais": "Argentina",
    "padre_id": "346187",
    "madre_id": "337486",
    "abuelo_materno_id": "288876",
}


def selftest():
    """Verifica que el HTML/JSON del SB no cambió desde el scrape de julio.

    Compara contra GREAT ORPEN (sb_id 447875), que ya está en la base y cuyo
    pedigree fue confirmado en el backfill de julio. Sale 1 si hay drift.
    """
    f = SELFTEST_FIXTURE
    fallas, chequeos = [], []

    def check(nombre, got, exp):
        ok = (got == exp)
        chequeos.append((nombre, ok, got, exp))
        if not ok:
            fallas.append(f"{nombre}: got={got!r} esperado={exp!r}")

    print(f"[selftest] autocomplete({f['term']!r}) ...")
    cands = autocomplete(f["term"])
    if not cands:
        print("[selftest] FALLA DURA: autocomplete devolvió vacío. "
              "La web cambió, está caída o el endpoint se movió.")
        return 1
    exact = [c for c in cands if norm(c.get("text")) == norm(f["nombre"])]
    check("autocomplete: matches exactos", len(exact), 1)
    if not exact:
        print("[selftest] FALLA DURA: sin match exacto — cambió el shape del JSON.")
        for c in cands[:5]:
            print("   candidato:", json.dumps(c, ensure_ascii=False)[:200])
        return 1

    c = exact[0]
    check("autocomplete.id", c.get("id"), f["sb_id"])
    check("autocomplete.padre", clean(c.get("padre")), f["padre"])
    check("autocomplete.madre", clean(c.get("madre")), f["madre"])
    check("autocomplete.nacimiento", ddmmyyyy_to_iso(c.get("nacimiento")),
          f["nacimiento_iso"])
    check("autocomplete.sexo", (c.get("sexo") or "").strip(), f["sexo"])
    check("autocomplete.pelo", clean(c.get("pelo")), f["pelo"])
    check("autocomplete.url_friendly", c.get("url_friendly"), f["url_friendly"])

    time.sleep(1)
    print(f"[selftest] perfil HTML {f['sb_id']} ...")
    prof = fetch_profile(c.get("id"), c.get("url_friendly"))
    check("perfil: descarga", prof["html_ok"], True)
    check("perfil.pais", prof["pais"], f["pais"])
    check("perfil.pelaje", prof["pelaje"], f["pelo"])
    check("perfil.padre", prof["padre"], f["padre"].upper())
    check("perfil.madre", prof["madre"], f["madre"].upper())
    check("perfil.padre_id", prof["padre_id"], f["padre_id"])
    check("perfil.madre_id", prof["madre_id"], f["madre_id"])
    check("perfil.abuelo_materno_id", prof["abuelo_materno_id"],
          f["abuelo_materno_id"])

    print("\n==== SELFTEST ====")
    for nombre, ok, got, exp in chequeos:
        print(f"  {'OK  ' if ok else 'FALLA'} {nombre:34} {got!r}")
    if fallas:
        print(f"\n{len(fallas)} FALLA(S) — el scraper necesita arreglo ANTES "
              f"de correr una tanda:")
        for x in fallas:
            print("  -", x)
        return 1
    print(f"\n{len(chequeos)}/{len(chequeos)} OK — scraper sano, "
          f"el HTML/JSON del SB no cambió.")
    return 0


# ---------------------------------------------------------------- alta

def sql_lit(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def procesar(nombres, snapshot, tanda, sleep=1.0):
    """Clasifica cada nombre. Devuelve (altas, casos)."""
    por_nombre = {}
    por_sbid = {}
    for r in snapshot:
        por_nombre.setdefault(norm(r["nombre"]), []).append(r)
        if r.get("studbook_id"):
            por_sbid[str(r["studbook_id"])] = r
    nombres_db = list(por_nombre.keys())

    altas, casos = [], []
    vistos_en_tanda = {}

    for crudo in nombres:
        nombre = crudo.strip()
        if not nombre:
            continue
        nn = norm(nombre)
        print(f"-> {nombre}")

        def caso(tipo, motivo, **extra):
            c = {"nombre_pedido": nombre, "tipo": tipo, "motivo": motivo}
            c.update(extra)
            casos.append(c)
            print(f"   {tipo}: {motivo}")

        # -- 0) duplicado dentro de la misma tanda
        if nn in vistos_en_tanda:
            caso("DUP_EN_TANDA",
                 f"Yesi mandó este nombre más de una vez en la tanda {tanda} "
                 f"(primera aparición: {vistos_en_tanda[nn]!r}). Se procesa una sola vez.")
            continue
        vistos_en_tanda[nn] = nombre

        # -- 1) ¿ya está en la base con ese mismo nombre?
        if nn in por_nombre:
            ex = por_nombre[nn]
            caso("YA_EXISTE_EN_DB",
                 f"Ya hay {len(ex)} SPC con ese nombre en la base. No se da de alta.",
                 existentes=[{"id": r["id"], "nombre": r["nombre"],
                              "fecha_nacimiento": r.get("fecha_nacimiento"),
                              "sexo": r.get("sexo"),
                              "studbook_id": r.get("studbook_id")} for r in ex])
            continue

        # -- 2) buscar en el Stud Book
        term = TERM_OVERRIDE.get(nombre, nombre)
        cands = autocomplete(term)
        exact = [c for c in cands if norm(c.get("text")) == nn]

        if not exact:
            if not cands and " " in term:
                time.sleep(sleep)
                cands = autocomplete(term.split()[0])
            # ¿se parece a algo que YA tenemos? -> probable typo de Yesi
            parecidos_db = difflib.get_close_matches(nn, nombres_db, n=3,
                                                     cutoff=UMBRAL_TYPO)
            caso("SIN_MATCH_SB",
                 "No hay match exacto en el Stud Book. No se inventa nada: "
                 "vuelve a Yesi para que confirme la grafía.",
                 candidatos_parciales_sb=[cand_resumen(c) for c in cands[:8]],
                 posibles_typos_en_db=[
                     {"nombre_db": por_nombre[k][0]["nombre"],
                      "id": por_nombre[k][0]["id"],
                      "studbook_id": por_nombre[k][0].get("studbook_id"),
                      "similitud": round(difflib.SequenceMatcher(None, nn, k).ratio(), 3)}
                     for k in parecidos_db])
            time.sleep(sleep)
            continue

        if len(exact) > 1:
            caso("AMBIGUO_SB",
                 f"{len(exact)} homónimos exactos en el Stud Book. El ejemplar no "
                 f"está en la base todavía, así que no hay fecha de nacimiento "
                 f"contra la cual desambiguar. Yesi tiene que decir cuál es.",
                 candidatos=[cand_resumen(c) for c in exact])
            time.sleep(sleep)
            continue

        c = exact[0]
        sb_id = str(c.get("id"))

        # -- 3) ese sb_id ya está en la base con OTRO nombre -> typo / renombre
        if sb_id in por_sbid:
            r = por_sbid[sb_id]
            caso("YA_EXISTE_OTRO_NOMBRE",
                 f"El Stud Book resuelve {nombre!r} al sb_id {sb_id}, que YA está "
                 f"en la base bajo el nombre {r['nombre']!r}. Es typo en un lado u "
                 f"otro. No se da de alta (violaría spcs_studbook_id_uniq).",
                 sb_id=sb_id, nombre_sb=clean(c.get("text")),
                 existente={"id": r["id"], "nombre": r["nombre"],
                            "fecha_nacimiento": r.get("fecha_nacimiento"),
                            "studbook_id": r.get("studbook_id")})
            time.sleep(sleep)
            continue

        # -- 4) perfil (país, pelaje confirmado, ids de pedigree)
        prof = fetch_profile(sb_id, c.get("url_friendly") or "x")
        padre = clean(c.get("padre")) or prof.get("padre")
        madre = clean(c.get("madre")) or prof.get("madre")
        fnac = ddmmyyyy_to_iso(c.get("nacimiento"))
        sexo_sb = (c.get("sexo") or "").strip()
        sexo = SEXO_MAP.get(norm(sexo_sb))
        pelaje = clean(c.get("pelo")) or prof.get("pelaje")

        # -- 5) campos NOT NULL: nombre, fecha_nacimiento, sexo
        faltan = []
        if not fnac:
            faltan.append("fecha_nacimiento (NOT NULL en spcs)")
        if not sexo:
            faltan.append(f"sexo mapeable (SB devolvió {sexo_sb!r}; "
                          f"sexo_spc acepta macho/hembra/castrado)")
        if faltan:
            caso("DATOS_INSUFICIENTES",
                 "Match único en el SB pero faltan campos obligatorios: "
                 + "; ".join(faltan),
                 sb_id=sb_id, candidato=cand_resumen(c))
            time.sleep(sleep)
            continue

        alertas = []
        if not padre or not madre:
            alertas.append("pedigree incompleto en el SB")
        if prof.get("pais") and norm(prof["pais"]) != "ARGENTINA":
            alertas.append(f"país de origen {prof['pais']!r} (no Argentina)")
        if not prof["html_ok"]:
            alertas.append("no se pudo bajar el perfil HTML; datos sólo del autocomplete")

        altas.append({
            "nombre_pedido": nombre,
            "nombre_sb": clean(c.get("text")),
            "sb_id": sb_id,
            "url_perfil": prof["url"],
            "fecha_nacimiento": fnac,
            "sexo_sb": sexo_sb,
            "sexo": sexo,
            "color": pelaje,
            "padrillo_nombre": padre,
            "madre_nombre": madre,
            "padre_id_sb": prof.get("padre_id"),
            "madre_id_sb": prof.get("madre_id"),
            "abuelo_materno_id_sb": prof.get("abuelo_materno_id"),
            "pais_origen": prof.get("pais") or "Argentina",
            "criador": prof.get("criador"),
            "microchip": prof.get("microchip"),
            "alertas": alertas,
        })
        print(f"   ALTA_OK sb={sb_id} {fnac} {sexo} {pelaje} "
              f"padre={padre} madre={madre}"
              + (f"  ALERTAS: {alertas}" if alertas else ""))
        time.sleep(sleep)

    return altas, casos


def render_sql(altas, tanda, snapshot_total):
    L = []
    L.append("-- ============================================================")
    L.append(f"-- spcs_r8_tanda_{tanda}.sql — alta incremental de SPCs para R8")
    L.append("-- ============================================================")
    L.append("-- PROPUESTA. NO EJECUTADO. Requiere OK explícito de Leo.")
    L.append("--")
    L.append("-- Origen: www.studbook.org.ar, match EXACTO por nombre normalizado.")
    L.append(f"-- Evidencia: data/spcs_r8_tanda_{tanda}_scrape.json")
    L.append(f"-- Casos no resueltos: data/spcs_r8_tanda_{tanda}_reporte.md")
    L.append(f"-- Snapshot spcs usado: {snapshot_total} filas.")
    L.append("--")
    L.append("-- caballeriza_id / entrenador_id / jockey_habitual_id quedan NULL:")
    L.append("--   los asigna Yesi al inscribir. club_id NULL: los SPCs son globales.")
    L.append("--   registro_stud_book queda NULL: en la base es seed legacy (SB-D001…),")
    L.append("--   no es el registro real del Stud Book.")
    L.append("--")
    L.append("-- Idempotente: cada INSERT se saltea si el studbook_id ya está")
    L.append("-- (índice único parcial spcs_studbook_id_uniq).")
    L.append("-- ============================================================")
    L.append("")
    L.append("BEGIN;")
    L.append("")
    for a in altas:
        L.append(f"-- {a['nombre_sb']}  (pedido como {a['nombre_pedido']!r})")
        L.append(f"--   {a['url_perfil']}")
        if a["alertas"]:
            for al in a["alertas"]:
                L.append(f"--   ALERTA: {al}")
        L.append("INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,")
        L.append("                  padrillo_nombre, madre_nombre, pais_origen,")
        L.append("                  studbook_id, estado)")
        L.append("SELECT {}, {}::date, {}::sexo_spc, {},".format(
            sql_lit(a["nombre_sb"]), sql_lit(a["fecha_nacimiento"]),
            sql_lit(a["sexo"]), sql_lit(a["color"])))
        L.append("       {}, {}, {},".format(
            sql_lit(a["padrillo_nombre"]), sql_lit(a["madre_nombre"]),
            sql_lit(a["pais_origen"])))
        L.append("       {}, 'activo'::estado_spc".format(sql_lit(a["sb_id"])))
        L.append("WHERE NOT EXISTS (")
        L.append(f"  SELECT 1 FROM spcs WHERE studbook_id = {sql_lit(a['sb_id'])}")
        L.append(");")
        L.append("")
    L.append("-- Verificación dentro de la misma transacción:")
    L.append("--   revisar el conteo ANTES de hacer COMMIT.")
    L.append("SELECT count(*) AS spcs_total FROM spcs;")
    L.append("SELECT nombre, fecha_nacimiento, sexo, color, padrillo_nombre,")
    L.append("       madre_nombre, studbook_id")
    L.append("FROM spcs WHERE studbook_id IN ({})".format(
        ", ".join(sql_lit(a["sb_id"]) for a in altas) or "NULL"))
    L.append("ORDER BY nombre;")
    L.append("")
    L.append("COMMIT;")
    L.append("")
    return "\n".join(L)


def render_reporte(altas, casos, tanda, snapshot_total, total_pedidos):
    L = [f"# R8 — tanda {tanda}: alta de SPCs, reporte de casos", ""]
    L.append(f"- Nombres pedidos por Yesi: **{total_pedidos}**")
    L.append(f"- Altas propuestas: **{len(altas)}**")
    L.append(f"- Casos que vuelven a Yesi: **{len(casos)}**")
    L.append(f"- Snapshot de `spcs` usado: {snapshot_total} filas")
    L.append("")
    L.append("Nada fue ejecutado contra la base. Los INSERTs están en "
             f"`migrations/spcs_r8_tanda_{tanda}.sql` y esperan OK.")
    L.append("")

    if altas:
        L.append("## Altas propuestas")
        L.append("")
        L.append("| pedido | nombre SB | sb_id | nac | sexo | pelaje | padre | madre | alertas |")
        L.append("|---|---|---|---|---|---|---|---|---|")
        for a in altas:
            L.append("| {} | {} | {} | {} | {} | {} | {} | {} | {} |".format(
                a["nombre_pedido"], a["nombre_sb"], a["sb_id"],
                a["fecha_nacimiento"], a["sexo"], a["color"] or "—",
                a["padrillo_nombre"] or "—", a["madre_nombre"] or "—",
                "; ".join(a["alertas"]) or "—"))
        L.append("")

    orden = ["AMBIGUO_SB", "SIN_MATCH_SB", "YA_EXISTE_OTRO_NOMBRE",
             "YA_EXISTE_EN_DB", "DATOS_INSUFICIENTES", "DUP_EN_TANDA"]
    titulos = {
        "AMBIGUO_SB": "Homónimos en el Stud Book — Yesi tiene que elegir",
        "SIN_MATCH_SB": "Sin match en el Stud Book — confirmar grafía",
        "YA_EXISTE_OTRO_NOMBRE": "Ya está en la base con otro nombre (typo)",
        "YA_EXISTE_EN_DB": "Ya está en la base con el mismo nombre",
        "DATOS_INSUFICIENTES": "Match único pero faltan datos obligatorios",
        "DUP_EN_TANDA": "Repetido dentro de la tanda",
    }
    for tipo in orden:
        grupo = [c for c in casos if c["tipo"] == tipo]
        if not grupo:
            continue
        L.append(f"## {titulos[tipo]} ({len(grupo)})")
        L.append("")
        for c in grupo:
            L.append(f"### `{c['nombre_pedido']}`")
            L.append("")
            L.append(c["motivo"])
            L.append("")
            if c.get("candidatos"):
                L.append("Candidatos en el SB:")
                L.append("")
                L.append("| sb_id | nombre | sexo | nacimiento | pelo | padre | madre | perfil |")
                L.append("|---|---|---|---|---|---|---|---|")
                for x in c["candidatos"]:
                    L.append("| {} | {} | {} | {} | {} | {} | {} | {} |".format(
                        x["sb_id"], x["nombre"], x["sexo"] or "—",
                        x["nacimiento"] or "—", x["pelo"] or "—",
                        x["padre"] or "—", x["madre"] or "—", x["url_perfil"]))
                L.append("")
            if c.get("candidatos_parciales_sb"):
                L.append("Candidatos parciales en el SB (NO se eligió ninguno):")
                L.append("")
                for x in c["candidatos_parciales_sb"]:
                    L.append(f"- `{x['nombre']}` · sb_id {x['sb_id']} · "
                             f"{x['sexo'] or '—'} · {x['nacimiento'] or '—'} · {x['url_perfil']}")
                L.append("")
            if c.get("posibles_typos_en_db"):
                L.append("Se parece a SPCs que YA están en la base:")
                L.append("")
                for x in c["posibles_typos_en_db"]:
                    L.append(f"- `{x['nombre_db']}` (similitud {x['similitud']}) · "
                             f"id `{x['id']}` · studbook_id {x['studbook_id'] or '—'}")
                L.append("")
            if c.get("existentes"):
                for x in c["existentes"]:
                    L.append(f"- en base: `{x['nombre']}` · id `{x['id']}` · "
                             f"nac {x['fecha_nacimiento']} · sexo {x['sexo']} · "
                             f"studbook_id {x['studbook_id'] or '—'}")
                L.append("")
            if c.get("existente"):
                x = c["existente"]
                L.append(f"- en base: `{x['nombre']}` · id `{x['id']}` · "
                         f"nac {x['fecha_nacimiento']} · studbook_id {x['studbook_id']}")
                L.append("")
    return "\n".join(L) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true",
                    help="verifica el scraper contra GREAT ORPEN (sb 447875)")
    ap.add_argument("--tanda")
    ap.add_argument("--nombres", help="archivo con un nombre por línea")
    ap.add_argument("--snapshot", default="data/spcs_snapshot.json")
    ap.add_argument("--sleep", type=float, default=1.0)
    a = ap.parse_args()

    if a.selftest:
        sys.exit(selftest())

    if not a.tanda or not a.nombres:
        ap.error("--tanda y --nombres son obligatorios (o usá --selftest)")

    nombres = [l for l in open(a.nombres, encoding="utf-8").read().splitlines()
               if l.strip() and not l.strip().startswith("#")]
    snap = json.load(open(a.snapshot, encoding="utf-8"))
    spcs = snap["spcs"] if isinstance(snap, dict) else snap

    print(f"tanda {a.tanda}: {len(nombres)} nombres | snapshot {len(spcs)} spcs\n")
    altas, casos = procesar(nombres, spcs, a.tanda, sleep=a.sleep)

    os.makedirs("data", exist_ok=True)
    os.makedirs("migrations", exist_ok=True)
    p_json = f"data/spcs_r8_tanda_{a.tanda}_scrape.json"
    p_sql = f"migrations/spcs_r8_tanda_{a.tanda}.sql"
    p_rep = f"data/spcs_r8_tanda_{a.tanda}_reporte.md"

    json.dump({"_meta": {"fuente": "www.studbook.org.ar",
                         "tanda": a.tanda, "escribe_en_db": False,
                         "nombres_pedidos": len(nombres),
                         "altas_propuestas": len(altas),
                         "casos_no_resueltos": len(casos),
                         "snapshot_spcs": len(spcs)},
               "ALTAS": altas, "CASOS": casos},
              open(p_json, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(p_sql, "w", encoding="utf-8").write(render_sql(altas, a.tanda, len(spcs)))
    open(p_rep, "w", encoding="utf-8").write(
        render_reporte(altas, casos, a.tanda, len(spcs), len(nombres)))

    print("\n==== RESUMEN ====")
    print(f"  altas propuestas : {len(altas)}")
    print(f"  casos a Yesi     : {len(casos)}")
    for t in ["AMBIGUO_SB", "SIN_MATCH_SB", "YA_EXISTE_OTRO_NOMBRE",
              "YA_EXISTE_EN_DB", "DATOS_INSUFICIENTES", "DUP_EN_TANDA"]:
        n = sum(1 for c in casos if c["tipo"] == t)
        if n:
            print(f"    {t:22} {n}")
    print(f"\n  {p_json}\n  {p_sql}\n  {p_rep}")
    print("\nNADA EJECUTADO. El SQL espera OK de Leo.")


if __name__ == "__main__":
    main()
