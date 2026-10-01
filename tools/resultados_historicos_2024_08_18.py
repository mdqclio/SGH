#!/usr/bin/env python3
"""Resultados históricos de una reunión: 18/08/2024.

Baja la página de esa reunión en hipodromodolores.com, lee las planillas
de Google y escribe un JSON local. Después cuenta, con solo SELECT,
cuántos caballos, jockeys, entrenadores y caballerizas de esa reunión
no están en el padrón de ese momento.

No escribe en la base. No abre .env. No guarda claves ni el id del club.

No correr hasta que Julián pase la respuesta de Leo sobre la ventana
horaria del robots.txt. La pausa de 60 segundos entre pedidos al sitio
ya está en el código. Las planillas de Google no son el sitio: no llevan
esa pausa.

Uso, con las credenciales de lectura que pase Julián:

  SUPABASE_URL=... SUPABASE_KEY=... python tools/resultados_historicos_2024_08_18.py

El JSON con nombres queda en tools/_out/ (gitignored). Por consola salen
solo conteos.
"""

import csv
import difflib
import html
import io
import json
import os
import re
import sys
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

PAGINA = "https://hipodromodolores.com/resultados-18-agosto-2024/"
FECHA = "2024-08-18"
CLUB_NOMBRE = "Hipódromo de Dolores"
PAUSA_SITIO_S = 60
UMBRAL_PARECIDO = 0.85
PAGINA_PADRON = 1000
SALIDA = "resultados-2024-08-18.json"

BOLSA_OK = re.compile(r"^\$?\d{1,3}(\.\d{3})*(,\d{2})?$")
APOSTROFOS = "'’′´"

_ultimo_pedido_sitio = None


def es_sitio(url):
    host = (urlsplit(url).hostname or "").lower().rstrip(".")
    return host == "hipodromodolores.com" or host.endswith(".hipodromodolores.com")


def pedir(url):
    """GET. Entre dos pedidos al sitio espera 60 segundos."""
    global _ultimo_pedido_sitio
    if es_sitio(url) and _ultimo_pedido_sitio is not None:
        falta = PAUSA_SITIO_S - (time.monotonic() - _ultimo_pedido_sitio)
        if falta > 0:
            time.sleep(falta)
    req = Request(url, headers={"User-Agent": "SGH-resultados-historicos/1.0"})
    try:
        with urlopen(req, timeout=60) as resp:
            crudo = resp.read()
            charset = resp.headers.get_content_charset() or "utf-8"
    except HTTPError as e:
        sys.exit(f"No se pudo pedir la URL: HTTP {e.code}")
    except URLError:
        sys.exit("No se pudo pedir la URL.")
    if es_sitio(url):
        _ultimo_pedido_sitio = time.monotonic()
    return crudo.decode(charset, errors="replace")


def _base(texto):
    """Mayúsculas, sin tildes, sin el punto • y sin el paréntesis."""
    s = unicodedata.normalize("NFD", (texto or "").upper())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.replace("•", "")
    s = re.sub(r"\([^)]*\)", " ", s)
    return s


def normalizar(texto):
    """Clave exacta: solo letras y números."""
    return re.sub(r"[^A-Z0-9]", "", _base(texto))


def tokens(texto):
    return [t for t in re.split(r"[^A-Z0-9]+", _base(texto)) if t]


def bolsa_revisar(valor):
    return BOLSA_OK.fullmatch((valor or "").strip()) is None


_TIEMPO_SEGUNDOS = re.compile("[»″\"'’′´]\\d{2}c?$")


def tiempo_revisar(valor):
    v = (valor or "").strip()
    if not v:
        return True
    if sum(v.count(a) for a in APOSTROFOS) >= 2:
        return True
    return _TIEMPO_SEGUNDOS.search(v) is None


def html_a_texto(documento):
    documento = re.sub(r"(?is)<(script|style)\b[^>]*>.*?</\1>", " ", documento)
    documento = re.sub(r"(?i)<br\s*/?>", "\n", documento)
    documento = re.sub(r"(?i)</(p|div|li|h[1-6]|tr|section|article)>", "\n", documento)
    documento = re.sub(r"(?i)<[^>]+>", " ", documento)
    lineas = []
    for ln in documento.splitlines():
        ln = re.sub(r"[ \t\u00a0]+", " ", ln).strip()
        if ln:
            lineas.append(ln)
    return "\n".join(lineas)


def iframes_planilla(documento):
    encontrados = []
    for src in re.findall(r"(?is)<iframe\b[^>]*\bsrc\s*=\s*[\"']([^\"']+)[\"']", documento):
        if "docs.google.com/spreadsheets" in html.unescape(src):
            encontrados.append(src)
    return encontrados


def url_csv(src):
    src = html.unescape(src.strip())
    partes = urlsplit(src)
    if "docs.google.com" not in (partes.netloc or ""):
        sys.exit("Una planilla no apunta a Google.")
    path = partes.path.replace("/pubhtml", "/pub")
    query = dict(parse_qsl(partes.query, keep_blank_values=True))
    gid = query.get("gid")
    if not gid:
        sys.exit("Una planilla vino sin gid.")
    return urlunsplit((
        partes.scheme or "https",
        partes.netloc,
        path,
        urlencode({"gid": gid, "single": "true", "output": "csv"}),
        "",
    ))


def bloques_carrera(texto):
    partes = re.split(r"(?=OFICIAL\s+(?:NO\s+)?COMPUTABLE)", texto, flags=re.I)
    return [
        p.strip()
        for p in partes
        if re.match(r"OFICIAL\s+(?:NO\s+)?COMPUTABLE", p.strip(), re.I)
    ]


def parsear_bloque(bloque):
    lineas = [ln.strip() for ln in bloque.splitlines() if ln.strip()]
    texto = "\n".join(lineas)
    marca = re.search(r"OFICIAL\s+(NO\s+)?COMPUTABLE", texto, re.I)
    numero = None
    premio = None
    for ln in lineas:
        premio_m = re.search(r"(\d+)\s*[°º]\s*Premio\s+(.+)$", ln, re.I)
        if premio_m:
            numero = int(premio_m.group(1))
            premio = premio_m.group(2).strip()
            break
    dist_i = None
    distancia = None
    for i, ln in enumerate(lineas):
        if re.fullmatch(r"\d+\s*m", ln, re.I):
            dist_i = i
            distancia = ln
            break
    condicion = lineas[dist_i + 1].strip() if dist_i is not None and dist_i + 1 < len(lineas) else None
    bolsa_m = re.search(r"bolsa\s*:\s*\|\s*([^|]+)", texto, re.I)
    tiempo_m = re.search(r"tiempo\s*:\s*(\S+)", texto, re.I)
    faltan = []
    if marca is None:
        faltan.append("oficial computable")
    if numero is None or premio is None:
        faltan.append("premio")
    if distancia is None:
        faltan.append("distancia")
    if condicion is None:
        faltan.append("condición")
    if bolsa_m is None:
        faltan.append("bolsa")
    if tiempo_m is None:
        faltan.append("tiempo")
    if faltan:
        raise ValueError("faltan " + ", ".join(faltan))
    bolsa = bolsa_m.group(1).strip()
    tiempo = tiempo_m.group(1).strip()
    return {
        "numero": numero,
        "premio": premio,
        "distancia": distancia,
        "condicion": condicion,
        "bolsa": bolsa,
        "bolsa_revisar": bolsa_revisar(bolsa),
        "oficial_computable": marca.group(1) is None,
        "tiempo": tiempo,
        "tiempo_revisar": tiempo_revisar(tiempo),
        "caballos": [],
    }


def _col(headers, *nombres):
    for nombre in nombres:
        if nombre in headers:
            return headers.index(nombre)
    return None


def filas_caballos(texto):
    texto = texto.lstrip("\ufeff")
    if "<html" in texto[:800].lower():
        raise ValueError("la planilla no vino en CSV")
    filas = list(csv.reader(io.StringIO(texto)))
    header_i = None
    headers = None
    for i, row in enumerate(filas):
        candidatos = [normalizar(c) for c in row]
        if "SPC" in candidatos and ("POS" in candidatos or "POSICION" in candidatos):
            header_i = i
            headers = candidatos
            break
    if headers is None:
        raise ValueError("la planilla no tiene encabezado de caballos")
    i_pos = _col(headers, "POSICION", "POS")
    i_spc = _col(headers, "SPC")
    i_dist = _col(headers, "DISTANCIA")
    i_jok = _col(headers, "JOCKEY")
    i_kg = _col(headers, "KG")
    i_ent = _col(headers, "ENTRENADOR")
    i_cab = _col(headers, "CABALLERIZA")
    if None in (i_pos, i_spc, i_dist, i_jok, i_kg, i_ent, i_cab):
        raise ValueError("falta una columna de caballos")

    def celda(row, indice):
        return row[indice].strip() if indice < len(row) else ""

    caballos = []
    for row in filas[header_i + 1:]:
        if not row or normalizar(row[0]) == "DIVIDENDOS" or normalizar(celda(row, i_pos)) == "DIVIDENDOS":
            break
        if not any(celda(row, i) for i in (i_pos, i_spc, i_jok, i_ent, i_cab)):
            continue
        caballos.append({
            "puesto": celda(row, i_pos),
            "nombre": celda(row, i_spc),
            "jockey": celda(row, i_jok),
            "entrenador": celda(row, i_ent),
            "caballeriza": celda(row, i_cab),
            "kilos": celda(row, i_kg),
            "margen": celda(row, i_dist),
        })
    if not caballos:
        raise ValueError("la planilla no tiene caballos")
    return caballos


def credenciales():
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_KEY", "").strip()
    if not url or not key:
        sys.exit("Faltan SUPABASE_URL y SUPABASE_KEY en el entorno.")
    return url, key


def rest_get(base, key, tabla, params):
    url = f"{base}/rest/v1/{tabla}?{urlencode(params)}"
    req = Request(url, headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    })
    try:
        with urlopen(req, timeout=60) as resp:
            crudo = resp.read()
    except HTTPError as e:
        sys.exit(f"Error al leer {tabla}: HTTP {e.code}")
    except URLError:
        sys.exit(f"Error al leer {tabla}.")
    if not crudo:
        return []
    try:
        data = json.loads(crudo.decode("utf-8"))
    except json.JSONDecodeError:
        sys.exit(f"Respuesta inesperada al leer {tabla}.")
    if not isinstance(data, list):
        sys.exit(f"Respuesta inesperada al leer {tabla}.")
    return data


def rest_get_all(base, key, tabla, params):
    salida = []
    offset = 0
    while True:
        q = dict(params)
        q["limit"] = str(PAGINA_PADRON)
        q["offset"] = str(offset)
        lote = rest_get(base, key, tabla, q)
        salida.extend(lote)
        if len(lote) < PAGINA_PADRON:
            return salida
        offset += PAGINA_PADRON
        if offset > 100000:
            sys.exit(f"El padrón de {tabla} no termina.")


def leer_padron(base, key):
    clubs = rest_get(base, key, "clubs", {
        "select": "id",
        "nombre": f"eq.{CLUB_NOMBRE}",
        "limit": "2",
    })
    if len(clubs) != 1 or not clubs[0].get("id"):
        sys.exit("No se pudo resolver el club por nombre.")
    club_id = clubs[0]["id"]
    spcs = rest_get_all(base, key, "spcs", {"select": "nombre"})
    profesionales = rest_get_all(base, key, "profesionales", {
        "select": "nombre,apellido",
        "club_id": f"eq.{club_id}",
    })
    caballerizas = rest_get_all(base, key, "caballerizas", {
        "select": "nombre",
        "club_id": f"eq.{club_id}",
    })
    return spcs, profesionales, caballerizas


def _grupos(valores):
    grupos = {}
    for valor in valores:
        clave = normalizar(valor)
        if clave and clave not in grupos:
            grupos[clave] = valor
    return grupos


def contar(carreras, spcs, profesionales, caballerizas):
    spc_norm = {normalizar(r.get("nombre") or "") for r in spcs}
    spc_norm.discard("")
    prof_tokens = []
    for r in profesionales:
        t = tokens(f"{r.get('apellido') or ''} {r.get('nombre') or ''}")
        if t:
            prof_tokens.append(set(t))
    cab_norm = {normalizar(r.get("nombre") or "") for r in caballerizas}
    cab_norm.discard("")

    nombres = []
    jockeys = []
    entrenadores = []
    studs = []
    for carrera in carreras:
        for caballo in carrera["caballos"]:
            nombres.append(caballo["nombre"])
            jockeys.append(caballo["jockey"])
            entrenadores.append(caballo["entrenador"])
            studs.append(caballo["caballeriza"])

    grupos_cab = _grupos(nombres)
    exactos = {n for n in grupos_cab if n in spc_norm}
    parecidos = set()
    for n in grupos_cab:
        if n in exactos:
            continue
        if any(difflib.SequenceMatcher(None, n, p).ratio() >= UMBRAL_PARECIDO for p in spc_norm):
            parecidos.add(n)

    def personas(valores):
        grupos = _grupos(valores)
        en_padron = 0
        for raw in grupos.values():
            ts = set(tokens(raw))
            if ts and any(ts <= pt for pt in prof_tokens):
                en_padron += 1
        return len(grupos), en_padron, len(grupos) - en_padron

    j_n, j_ok, j_faltan = personas(jockeys)
    e_n, e_ok, e_faltan = personas(entrenadores)
    grupos_stud = _grupos(studs)
    stud_ok = sum(1 for n in grupos_stud if n in cab_norm)
    return {
        "caballos_distintos": len(grupos_cab),
        "caballos_exactos": len(exactos),
        "caballos_parecidos": len(parecidos),
        "caballos_faltan": len(grupos_cab) - len(exactos) - len(parecidos),
        "jockeys_distintos": j_n,
        "jockeys_en_padron": j_ok,
        "jockeys_faltan": j_faltan,
        "entrenadores_distintos": e_n,
        "entrenadores_en_padron": e_ok,
        "entrenadores_faltan": e_faltan,
        "caballerizas_distintas": len(grupos_stud),
        "caballerizas_en_padron": stud_ok,
        "caballerizas_faltan": len(grupos_stud) - stud_ok,
    }


def imprimir(carreras, conteos):
    bolsa_n = sum(1 for c in carreras if c["bolsa_revisar"])
    tiempo_n = sum(1 for c in carreras if c["tiempo_revisar"])
    print(f"carreras: {len(carreras)}")
    print(
        "caballos: {caballos_distintos} distintos, exactos {caballos_exactos}, "
        "parecidos {caballos_parecidos}, faltan {caballos_faltan}".format(**conteos)
    )
    print(
        "jockeys: {jockeys_distintos} distintos, en padrón {jockeys_en_padron}, "
        "faltan {jockeys_faltan}".format(**conteos)
    )
    print(
        "entrenadores: {entrenadores_distintos} distintos, en padrón {entrenadores_en_padron}, "
        "faltan {entrenadores_faltan}".format(**conteos)
    )
    print(
        "caballerizas: {caballerizas_distintas} distintas, en padrón {caballerizas_en_padron}, "
        "faltan {caballerizas_faltan}".format(**conteos)
    )
    print(f"bolsa_revisar: {bolsa_n}")
    print(f"tiempo_revisar: {tiempo_n}")


def armar():
    documento = html.unescape(pedir(PAGINA))
    texto = html_a_texto(documento)
    bloques = bloques_carrera(texto)
    iframes = iframes_planilla(documento)
    if not bloques or len(bloques) != len(iframes):
        sys.exit(
            f"La página tiene {len(iframes)} planillas y {len(bloques)} carreras."
        )
    carreras = []
    for i, (bloque, src) in enumerate(zip(bloques, iframes), start=1):
        try:
            carrera = parsear_bloque(bloque)
        except ValueError as e:
            sys.exit(f"Carrera {i}: {e}")
        try:
            carrera["caballos"] = filas_caballos(pedir(url_csv(src)))
        except ValueError as e:
            sys.exit(f"Carrera {i}: {e}")
        carreras.append(carrera)
    return {
        "fecha": FECHA,
        "fuente": PAGINA,
        "carreras": carreras,
    }


def escribir(doc):
    destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_out", SALIDA)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    base, key = credenciales()
    doc = armar()
    escribir(doc)
    spcs, profesionales, caballerizas = leer_padron(base, key)
    imprimir(doc["carreras"], contar(doc["carreras"], spcs, profesionales, caballerizas))


if __name__ == "__main__":
    main()
