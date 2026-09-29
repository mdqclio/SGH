# Certificado de correr — qué da el Stud Book, qué traemos, qué hay en el padrón (para contestarle a Yesi)

- **Fecha:** 2026-09-29, ~19:00–19:20 UTC
- **SHA de `main`:** `7e5fc99cacce01790e594dc7e5bc2e93b9cef36a` (todo el código se leyó con `git show origin/main:…`)
- **Guards:** `pwd` → `/home/clio/dev/SGH` · `get_project_url` → `https://unlhcuanfrtpatoipwve.supabase.co` · `select count(*) from spcs` → `210`
- **SOLO LECTURA.** Cero escrituras: sólo SELECT por MCP, `git show`, y GET al sitio público del Stud Book (~1 s entre pedidos).
  No se invocó la Edge Function deployada (pedir un JWT de staff implica crear un usuario = escribir); el ejemplo se generó
  corriendo **el código de la función** (mismo harness que `tests/probe_studbook_buscar_fn.mjs`) contra el Stud Book real.
- Nombres de personas (titulares, criadores) que muestran las fichas públicas: **redactados** como «nombre».

## Respuesta corta (para Yesi)

1. **Qué devuelve hoy `studbook-buscar`:** nombre, id del Stud Book, nacimiento, sexo, pelaje, padre, madre, abuelo materno,
   país, link a la ficha, leyenda, tomo, folio y raza. **No devuelve nada del certificado de correr.**
2. **¿La ficha del Stud Book lo muestra?** **Sí.** Cada ficha pública (sin login) tiene la fila **"Certificado de Correr"**
   con tres estados: ✔ verde (**PROPIETARIO – fecha** + nombre del titular), ❗ naranja (**AUTORIZADO – fecha**, autorización
   para correr a favor de un tercero) y ✖ rojo (no tiene). **Pero no es "agregar un campo":** el JSON del buscador que usamos
   no lo trae (trae 4 indicadores —`adn`, `pasaporte`, `mc`, `revisado`— que **no** son el certificado). Para traerlo hay que
   **pedir además la ficha HTML de cada candidato y leerla** (un GET más por caballo, ~1 s), o sea más scraping.
3. **¿Otra vista?** No encontré otra página pública que lo liste (anotados, caballeriza, performance: no lo mencionan; el PDF de
   la ficha no se pudo leer como texto). El sitio tiene un **login** (email + contraseña) cuyo contenido no vi. La ficha pública
   **no requiere login**.
4. **Padrón:** **los 210 SPC tienen `spcs.certificado_correr = false`. Ninguno en `true`.** Nadie lo puede tildar desde la
   app: ninguna pantalla escribe ese campo (sólo se lee). No se puede saber si alguien lo tocó por SQL: **`spcs` no tiene
   auditoría** (0 filas, sin trigger). En cambio **el certificado que se usa es el de la INSCRIPCIÓN**
   (`inscripciones.certificado_correr`): R6 124/125, **R8 0/106**, R9 92/102, R10 0/4.
5. **Portal + SPC que no está en el padrón:** **queda trabado.** El usuario del portal no puede darlo de alta (la base lo
   impide: sólo staff inserta en `spcs`, y `studbook-buscar` le responde 403). La pantalla le dice "todavía no está cargado en
   el sistema: avisale a la secretaría del hipódromo". **No hay cola ni solicitud**: el aviso es por fuera (teléfono/WhatsApp) y
   la secretaría lo da de alta en `spcs.html`; recién ahí el usuario lo puede anotar.

---

## 1. `studbook-buscar` — campos exactos y ejemplo real

- Deployada: `get_edge_function studbook-buscar` → `version 1`, `status ACTIVE`, `verify_jwt true`; el `index.ts` deployado es el
  mismo texto que `supabase/functions/studbook-buscar/index.ts` de `main` (comparado a la vista, no por md5).
- Fuente: `GET https://www.studbook.org.ar/ejemplares/autocomplete?tipo=1&muerto=1&term=<nombre>` (buscador público, no API).
- Respuesta 200: `{ ok, term, exactos: Candidato[], parciales: Candidato[], fuente }`. `Candidato` (de `index.ts`, `interface Candidato`):
  `sb_id, nombre, fecha_nacimiento, sexo, sexo_sb, color, padrillo_nombre, madre_nombre, abuelo_materno, pais_origen,
  url_perfil, leyenda, tomo, folio, raza, alertas`.
- **Del hit crudo se descartan:** `icon` (se usa sólo para `pais_origen`), `url_friendly` (sólo para `url_perfil`) y
  **`adn`, `pasaporte`, `mc`, `revisado`** (no se mapean).
- Errores: 401 `sin_token`/`token_invalido`, 403 `solo_staff` (portal), 400 `term_invalido`/`body_invalido`, 502 `studbook_no_disponible`, 500.

Comando (script en el scratchpad; la extracción es la misma de `tests/probe_studbook_buscar_fn.mjs` líneas 1–39, y después
`mod.autocomplete(term)` + `mod.clasificar(term, hits)` + el mismo sobre que arma `Deno.serve`):

```
node ej.mjs      # términos: 'EL MAS SABIO', 'BIEN COQUETA'
```

Salida completa:

```

===== term: EL MAS SABIO
--- hits crudos del Stud Book (autocomplete) ---
[
 {
  "icon": "/img/banderas/10.png",
  "id": 431662,
  "text": "EL MAS SABIO",
  "leyenda": "(2021 M SP)",
  "padre": "Il Campione (CHI)",
  "madre": "Indigirka",
  "abuelo_materno": "Interprete",
  "tomo": 1242,
  "folio": 998,
  "sexo": "Macho",
  "nacimiento": "26/10/2021",
  "pelo": "Alazan",
  "raza": 4,
  "url_friendly": "el-mas-sabio",
  "adn": 1,
  "pasaporte": 1,
  "mc": 1,
  "revisado": 1
 }
]
--- respuesta que arma la función (mismo objeto que devuelve con HTTP 200) ---
{
 "ok": true,
 "term": "EL MAS SABIO",
 "exactos": [
  {
   "sb_id": "431662",
   "nombre": "EL MAS SABIO",
   "fecha_nacimiento": "2021-10-26",
   "sexo": "macho",
   "sexo_sb": "Macho",
   "color": "Alazan",
   "padrillo_nombre": "Il Campione (CHI)",
   "madre_nombre": "Indigirka",
   "abuelo_materno": "Interprete",
   "pais_origen": "Argentina",
   "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/431662/el-mas-sabio",
   "leyenda": "(2021 M SP)",
   "tomo": 1242,
   "folio": 998,
   "raza": 4,
   "alertas": []
  }
 ],
 "parciales": [],
 "fuente": "studbook.org.ar/ejemplares/autocomplete (scraping del buscador público, no API)"
}

===== term: BIEN COQUETA
--- hits crudos del Stud Book (autocomplete) ---
[
 {
  "icon": "/img/banderas/10.png",
  "id": 429819,
  "text": "BIEN COQUETA",
  "leyenda": "(2021 H SP)",
  "padre": "Bien Terminado",
  "madre": "Gritty",
  "abuelo_materno": "Luhuk (USA)",
  "tomo": 1241,
  "folio": 202,
  "sexo": "Hembra",
  "nacimiento": "15/10/2021",
  "pelo": "Zaino Colorado",
  "raza": 4,
  "url_friendly": "bien-coqueta",
  "adn": 1,
  "pasaporte": 1,
  "mc": 1,
  "revisado": 1
 },
 {
  "icon": "/img/banderas/10.png",
  "id": 216248,
  "text": "BIEN COQUETA",
  "leyenda": "(1998 H SP)",
  "padre": "Yale Twentyniner (USA)",
  "madre": "Coquetisima",
  "abuelo_materno": "Friul",
  "tomo": 1057,
  "folio": 260,
  "sexo": "Hembra",
  "nacimiento": "29/07/1998",
  "pelo": "Alazan",
  "raza": 4,
  "url_friendly": "bien-coqueta",
  "adn": 0,
  "pasaporte": 0,
  "mc": 0,
  "revisado": 0
 }
]
--- respuesta que arma la función (mismo objeto que devuelve con HTTP 200) ---
{
 "ok": true,
 "term": "BIEN COQUETA",
 "exactos": [
  {
   "sb_id": "429819",
   "nombre": "BIEN COQUETA",
   "fecha_nacimiento": "2021-10-15",
   "sexo": "hembra",
   "sexo_sb": "Hembra",
   "color": "Zaino Colorado",
   "padrillo_nombre": "Bien Terminado",
   "madre_nombre": "Gritty",
   "abuelo_materno": "Luhuk (USA)",
   "pais_origen": "Argentina",
   "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/429819/bien-coqueta",
   "leyenda": "(2021 H SP)",
   "tomo": 1241,
   "folio": 202,
   "raza": 4,
   "alertas": []
  },
  {
   "sb_id": "216248",
   "nombre": "BIEN COQUETA",
   "fecha_nacimiento": "1998-07-29",
   "sexo": "hembra",
   "sexo_sb": "Hembra",
   "color": "Alazan",
   "padrillo_nombre": "Yale Twentyniner (USA)",
   "madre_nombre": "Coquetisima",
   "abuelo_materno": "Friul",
   "pais_origen": "Argentina",
   "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/216248/bien-coqueta",
   "leyenda": "(1998 H SP)",
   "tomo": 1057,
   "folio": 260,
   "raza": 4,
   "alertas": []
  }
 ],
 "parciales": [],
 "fuente": "studbook.org.ar/ejemplares/autocomplete (scraping del buscador público, no API)"
}
```

## 2. La ficha del Stud Book SÍ tiene el certificado

`curl -A 'Mozilla/5.0' https://www.studbook.org.ar/ejemplares/perfil/431662/el-mas-sabio` → `HTTP 200 text/html 78825B`, **sin
login**. Texto visible: `'Certificado de Correr'` (1), `'Pasaporte Facturado'`, `'Tipificación por ADN'`, `'Revisado'`,
`'PROPIETARIO  - 30/07/2024'`, `'Ingresar'` (link de login, `javascript:void(0)`).

HTML textual de la fila (EL MAS SABIO, con certificado):

```html
<tr>
  <td colspan="2">Certificado de Correr <a role="button" data-toggle="collapse" href="#collapseCertificado"
      aria-expanded="false" style="background-color: green; …"> + </a><i
      class="fas fa-check-circle text-success pull-right"></i>
    <div class="collapse" id="collapseCertificado">
      <table class="table interno-certificado green">
        <thead><tr><th><span style="color: green">PROPIETARIO  - 30/07/2024</span></th></tr></thead>
        <tbody><tr><td>«nombre del titular, 20 caracteres»</td></tr></tbody>
      </table>
```

BIEN COQUETA de 1998 (id 216248), **sin** certificado — sin desplegable, cruz roja:

```html
<tr> <td colspan="2">Certificado de Correr <i class="fas fa-times-circle text-danger pull-right"></i> </td> </tr>
```

LUNA A BABOR (id 240086) — tercer estado, naranja:

```html
<td colspan="2">Certificado de Correr <a role="button" data-toggle="collapse" href="#collapseCertificado" aria-expanded="false"
 style="background-color: orangered; …"> + </a><i class="fas fa-exclamation-circle text-naranja pull-right"></i>
 <div class="collapse" id="collapseCertificado"> <table class="table interno-certificado orangered"> <thead> <tr>
 <th><span style="color: orangered">AUTORIZADO - 10/04/2007</span></th>
```

Qué es cada estado, según el propio sitio (`/formularios` y `/sb/preguntas-frecuentes`):

```
FORMULARIOS: Certificado para correr Formulario para solicitar un certificado para correr carreras, la primera vez que corre, o cada vez que se produzca un cambio de titularidad o una autorización para correr a otra persona. Control Filiatorio Este documento sirve para que un veterinario oficial de cualquier Jockey Club realice una filiación gráfica de un ejemplar. Convenio de Crianza Papel Oficio (216 x 356 mm) Convenio de Crian 

FAQ (1ª coincidencia: menú de la página + datos de pago del Stud Book — OMITIDA por irrelevante; trae CBU/alias)

FAQ: sentar la solicitud correspondiente debidamente cumplimentada. ¿Cómo tramito un Certificado para Correr? Deberá presentarse el formulario correspondiente firmado por el propietario del ejemplar. En caso que el propietario no posea caballeriza deberá tramitar una Autorización para Correr con firma certificada a favor de un tercero, siendo el autorizado quien firme la solicitud de Certificado para Correr. ¿Cómo solicito que me envíen Microchips? Deberá presentarse por Mesa de Entradas o escaneando por e-mail la solicitud correspondiente, adjuntando el comprobante de depósito respectivo. ¿Cuánto demora el envío de Pasaporte? El envío de Pasaporte se realiza a partir de los 15 días de tramitado el mismo. En caso de haberse tramitado como URGENTE, el envío se realiza dentro  

FAQ: ificada a favor de un tercero, siendo el autorizado quien firme la solicitud de Certificado para Correr. ¿Cómo solicito que me envíen Microchips? Deberá presentarse por Mesa de Entradas o escaneando por e-mail la solicitud correspondiente, adjuntando el comprobante de depósito respectivo. ¿Cuánto demora el envío de Pasaporte? El envío de Pasaporte se realiza a partir de los 15 días de tramitado el mismo. En caso de haberse tramitado como URGENTE, el envío se realiza dentro de las 48 horas. ¿Dónde debo remitir la correspondencia? Stud Book Argentino, Cerrito 1446, 3º Piso, C.A.B.A. (C1010ABD) ¿Cómo abono los trámites? En la página de Stud Book encontrará las cuentas bancarias donde realizar los depósitos y el e-mail donde deberá remitir escaneado el respectivo comprobant 

PDF: streams descomprimidos 3361116 chars; "Certificado" en texto crudo: 0 | "Correr": 0 | "PROPIETARIO": 0
```

→ El certificado está **atado al titular**: se pide "la primera vez que corre, o cada vez que se produzca un cambio de
titularidad o una autorización para correr a otra persona". La fecha del desplegable es la del certificado vigente
(p. ej. ALHENA: 15/09/2026). Es decir, **un "sí" de hoy puede dejar de valer si el caballo se vende**, y un booleano en `spcs`
sin fecha ni titular pierde esa información.

### 2.1 ¿Los indicadores del JSON (`adn`, `pasaporte`, `mc`, `revisado`) sirven como sustituto? No.

Cruce de 25 SPC del padrón que corrieron en R9/R10 (todos con `studbook_id`):

```
nombre | sb_id | auto: adn pasaporte mc revisado | ficha: fila_cert icono_cert fecha_cert
ABARAJALA | 433798 | 1 1 1 1 | True OK 18/12/2025
ALHENA | 434871 | 1 1 1 1 | True OK 15/09/2026
AMIGUITO JESUS | 436018 | 1 1 1 1 | True OK 08/04/2026
ARTHURUS | 425177 | 1 1 1 1 | True OK 05/02/2025
ATOMIZADOR | 422969 | 1 1 1 1 | True OK 01/09/2026
BACON | 428803 | 1 1 1 1 | True OK 17/10/2024
BAHIA ROMANA | 435330 | 1 1 1 1 | True OK 29/06/2026
BIEN COQUETA | 429819 | 1 1 1 1 | True OK 23/04/2026
CANDIDATA PIRANERA | 438953 | 1 1 1 1 | True OK 05/11/2025
CHE CARABANERA | 437182 | 1 1 1 1 | True OK 07/04/2025
COLONIAL JOHAN | 432758 | 1 1 1 1 | True OK 18/10/2024
CONESERA | 444373 | 1 1 1 1 | True OK 04/02/2026
DAHUA | 438313 | 1 1 1 1 | True OK 09/06/2025
DEL CAMPEON | 438805 | 1 1 1 1 | True OK 25/08/2026
DESERT OF DUBAI | 446340 | 1 1 1 1 | True OK 02/07/2026
EL GRAN HECTOR | 430047 | 1 1 1 1 | True OK 12/12/2024
EL MAS SABIO | 431662 | 1 1 1 1 | True OK 30/07/2024
EL RISKO | 421108 | 1 1 1 1 | True OK 11/03/2024
ES SABALERO | 432333 | 1 1 1 1 | True OK 10/11/2025
ESPLENDID CRAF | 421807 | 1 1 1 1 | True OK 21/04/2023
ETERNA DOCTORA | 442125 | 1 1 1 1 | True OK 12/12/2025
FREE CRY | 430759 | 1 1 1 1 | True OK 21/04/2026
GOIADORA | 428590 | 1 1 1 1 | True OK 10/03/2025
GRAN RAUL | 433458 | 1 1 1 1 | True OK 25/06/2024
HALLOTOP | 441122 | 1 1 1 1 | True OK 11/08/2025
```

Casos variados del Stud Book (búsquedas BIEN COQUETA / LUNA / GRAN, una por combinación de año e indicadores). La columna
`fila_cert` de este script sólo dice que el texto aparece en la página; lo que vale es `icono` (OK = ✔, NO = ✖, ? = ❗ naranja)
y la lista de filas del bloque de indicadores:

```
32 hits, 24 combinaciones distintas (año, mc, pasaporte, revisado, adn)
nombre | id | nac | adn pas mc rev | fila_cert icono fecha | filas del bloque de indicadores
BIEN COQUETA | 429819 | 15/10/2021 | 1 1 1 1 | True OK 23/04/2026 | ['Revisado', 'Implante Presentado', 'Tipificación por ADN', 'Pasaporte Facturado', 'Reproductor', 'Certificado de Correr', '«nombre»', 'Lugar Nacimiento', '«nombre»', 'Criador']
BIEN COQUETA | 216248 | 29/07/1998 | 0 0 0 0 | True NO - | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Reproductor', 'Lugar Nacimiento', '«nombre»', 'Criador']
LUNA | 95448 | 19/10/1984 | 0 0 0 0 | True NO - | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Lugar Nacimiento', '«nombre»', 'Criador']
LUNA A BABOR | 240086 | 08/10/2001 | 1 0 0 0 | True ? 10/04/2007 | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Certificado de Correr', 'Sin Asignar', 'Lugar Nacimiento', '«nombre»', 'Criador']
LUNA A MEDIAS | 115747 | 19/10/1986 | 0 0 0 0 | True NO - | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Reproductor', 'Lugar Nacimiento', '«nombre»', 'Criador']
LUNA ABORIGEN | 77410 | 13/08/1982 | 0 0 0 0 | True NO - | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Lugar Nacimiento', '«nombre»', 'Criador']
LUNA ADVOCATOR | 194608 | 08/08/1995 | 0 0 0 0 | True ? 21/10/1998 | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Reproductor', 'Certificado de Correr', 'Sin Asignar', 'Lugar Nacimiento', '«nombre»', 'Criador']
LUNA AFRICANA | 37027 | 18/08/1977 | 0 0 0 0 | True NO - | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Lugar Nacimiento', '«nombre»', 'Criador']
LUNA AGUADA | 211800 | 05/10/1997 | 0 0 0 0 | True NO - | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Lugar Nacimiento', '«nombre»', 'Criador']
LUNA AHMADA | 194076 | 11/09/1995 | 1 0 0 0 | True NO - | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Lugar Nacimiento', 'Criador', 'SIN ACTUACIONES']
LUNA ALTA | 36369 | 01/01/1976 | 0 0 0 0 | True NO - | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Reproductor', 'Lugar Nacimiento', '«nombre»', 'Criador']
LUNA AMABLE | 175959 | 31/07/1993 | 1 0 0 0 | True NO - | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Lugar Nacimiento', '«nombre»', 'Criador']
LUNA AMADA | 206294 | 28/09/1996 | 0 0 0 0 | True NO - | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Reproductor', 'Lugar Nacimiento', '«nombre»', 'Criador']
GRAN ABED | 108431 | 24/11/1985 | 0 0 0 0 | True NO - | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Reproductor', 'Lugar Nacimiento', '«nombre»', 'Criador']
GRAN ABONO | 25346 | 29/09/1974 | 0 0 0 0 | True NO - | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Reproductor', 'Lugar Nacimiento', '«nombre»', 'Criador']
GRAN ABUELA | 161394 | 04/09/1991 | 0 0 0 0 | True NO - | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Reproductor', 'Lugar Nacimiento', '«nombre»', 'Criador']
GRAN ABUELO | 365187 | 30/11/2016 | 0 0 0 0 | True NO - | ['Revisado', 'Microchip', 'Tipificación por ADN', 'Pasaporte Facturado', 'Reproductor', 'Lugar Nacimiento', '«nombre»', 'Criador']
GRAN ABUSO | 125975 | 15/09/1987 | 0 0 0 0 | True NO - | ['Microchip', 'Tipificación Sanguínea', 'Tipificación por ADN', 'Pasaporte Facturado', 'Reproductor', 'Lugar Nacimiento', '«nombre»', 'Criador']
```

- En la muestra del padrón (25/25) todo da 1-1-1-1 y ✔; en los viejos, 0-0-0-0 y ✖ — pero hay **❗ con 0-0-0-0** (LUNA ADVOCATOR)
  y **❗ con adn=1** (LUNA A BABOR). Los indicadores del JSON **no** determinan el certificado: son otras cosas (ADN, pasaporte,
  `mc` probablemente microchip/implante —no confirmado—, revisión). El dato sólo está en la ficha HTML.

## 3. Otras vistas del Stud Book

```
== /ejemplares/perfil-pdf/431662/el-mas-sabio
   HTTP 200 application/pdf 156409B loc='' pdf=True inputs=[]
== /reuniones/anotados
   HTTP 200 text/html; charset=UTF-8 267481B loc='' pdf=False inputs=[]
== /caballerizas/perfil/49888/mi-martincito-lp
   HTTP 200 text/html; charset=UTF-8 42752B loc='' pdf=False inputs=[]
== /formularios
   HTTP 200 text/html; charset=UTF-8 35474B loc='' pdf=False inputs=[]
   «…res de otra caballeriza. Cambio de nombre Con este formulario usted puede solicitar el cambio de nombre de su producto. Certificado de implante de Microchip Formulario de Certificado de implante de Microchip. Certificado para correr Formulario para solicitar un certificado para correr carre…»
   «…formulario usted puede solicitar el cambio de nombre de su producto. Certificado de implante de Microchip Formulario de Certificado de implante de Microchip. Certificado para correr Formulario para solicitar un certificado para correr carreras, la primera vez que corre, o cada vez que se pr…»
   «…mbio de nombre de su producto. Certificado de implante de Microchip Formulario de Certificado de implante de Microchip. Certificado para correr Formulario para solicitar un certificado para correr carreras, la primera vez que corre, o cada vez que se produzca un cambio de titularidad o una…»
== /login/Lw
   HTTP 200 text/html; charset=UTF-8 22355B loc='' pdf=False inputs=['email', 'pass', 'login_csrf', 'returnUrl', 'token']
== /sb/reglamento-spc
   HTTP 200 text/html; charset=UTF-8 71487B loc='' pdf=False inputs=[]
   «…ncionados en los dos articulos precedentes. Artículo 10º El Stud Book Argentino expedirá, a pedido de los propietarios, certificado de las constancias de sus registros con respecto a los animales inscriptos. Dichos documentos acreditarán la genealogía, filiación, identidad y estado de la pr…»
   «…y Estaciones de Montas podrán hacer servir yeguas de terceros cuya filiación no hayan controlado con el correspondiente Certificado Identificatorio o Documento de Identidad Equino, según correspondiere por su generación. Cuando la o las yeguas ingresadas tengan cría durante su estadía en la…»
   «…r en cuestión el ejemplar asi filiado no será sometido a una segunda inspección a efectos de obtener el correspondiente Certificado para correr. Las muestras de pelos o de cualquier otro material genético presentado a tal fín, son propiedad exclusiva del Stud Book Argentino y no podrán ser…»
== /ejemplares/performance/431662/el-mas-sabio
   HTTP 200 text/html; charset=UTF-8 152970B loc='' pdf=False inputs=[]
== /sb/preguntas-frecuentes
   HTTP 200 text/html; charset=UTF-8 60056B loc='' pdf=False inputs=[]
   «…s Anotados Contacto Ingresar PREGUNTAS FRECUENTES Departamentos General Veterinaria Exportación e Importacion Pasaporte Certificado Correr Correspondencia Cuentas corrientes del Jockey Club A. C. Se implemento MacroPago, una nueva forma de pago con acreditacion inmediata a través de tarjeta…»
   «…ando se realiza el envió de la documentación? Una vez realizado los trámites previos a la exportación y previo pago del Certificado de Exportación. El registro se encargara del envío de la documentación de Stud Book a Stud Book mediante un Currier privado para hacer efectiva la entrega. ¿Cu…»
   «…Currier privado para hacer efectiva la entrega. ¿Cuál es el costo de la exportación e importación? Los costos de dichos certificados se encuentran en la página web. Dichos costos se encuentran a variables impuestas por el Jockey Club. ¿Cómo hago para solicitar un pasaporte? Para poder solic…»
```

- `/reuniones/anotados`, `/caballerizas/perfil/…`, `/ejemplares/performance/…`: 200, públicas, **no mencionan** el certificado.
- `/ejemplares/perfil-pdf/<id>/<slug>`: PDF público de la ficha. El texto no se pudo extraer (0 coincidencias de "Certificado"
  en los streams descomprimidos: la fuente va con glifos codificados; no hay `pdftotext` en el VPS). **Inconcluso.**
- `/login/<ruta en base64>`: formulario con `email`, `pass`, `login_csrf`, `returnUrl`, `token`. Hay un área con login
  (propietarios/criadores, supongo); **no entré**, así que no sé qué muestra. La ficha pública ya trae el dato **sin** login.
- Todo lo de arriba es el sitio web, **no una API acordada** (ISSUE-030, "API de Diego", sigue pendiente). Si esa API existe algún
  día, el certificado (estado + fecha + titular) es lo primero a pedir.

## 4. El padrón (`spcs`) y el certificado

```sql
select certificado_correr, count(*), min(created_at)::date as alta_min, max(created_at)::date as alta_max,
       min(updated_at)::date as upd_min, max(updated_at)::date as upd_max, count(studbook_id) as con_studbook_id
from spcs group by 1 order by 1 nulls first;
```
```
[{"certificado_correr":false,"count":210,"alta_min":"2026-04-21","alta_max":"2026-09-14","upd_min":"2026-05-15","upd_max":"2026-09-14","con_studbook_id":97}]
```

Columna: `spcs.certificado_correr boolean DEFAULT false`, nullable. **210/210 en false.**

¿Alguien lo tildó alguna vez?

```sql
select (select count(*) from auditoria where tabla='spcs') as filas_audit_spcs, … ,
 (select string_agg(tgname||' ('||pg_get_triggerdef(t.oid)||')', ' | ') from pg_trigger t
   where tgrelid='public.spcs'::regclass and not tgisinternal) as triggers_spcs;
```
```
[{"filas_audit_spcs":0,"primera":null,"ultima":null,"alguna_vez_true":0,"updates_que_lo_cambian":0,"por_accion":null,
  "triggers_spcs":"trg_spcs_updated_at (CREATE TRIGGER trg_spcs_updated_at BEFORE UPDATE ON public.spcs FOR EACH ROW EXECUTE FUNCTION set_updated_at())"}]
```

- **`spcs` no está auditada** (0 filas en `auditoria`, sólo el trigger de `updated_at`). No hay forma de probar desde la base si
  alguna vez estuvo en true. (Ojo: el comentario de `studbook-buscar/index.ts` dice que el INSERT de spcs.html pasa por "RLS,
  auditoría…": **la auditoría no existe** para esa tabla.)
- **Desde el código:** nadie lo escribe. `git grep certificado_correr origin/main` (sin tests ni docs):
  - `inscripciones.html:726` lo **lee** de `spcs` en el buscador de SPC; `:739` pinta ✅/❌; `:749` y `:754-768` **prellenan el
    checkbox de la inscripción con ese valor** y muestran: *"⚠️ Este SPC NO tiene certificado de correr registrado en el Stud
    Book."* → como está en false para los 210, **ese cartel sale para todos los caballos, y es falso** (25/25 de la muestra
    tienen certificado vigente).
  - `spcs.html`: no lo menciona. `portal.html`: no lo menciona. Ninguna migración lo setea en true.
  - `migrations/spcs_r8_tanda_4b.sql:10`: "certificado_correr false" (las altas por migración lo dejaron en false).

### 4.1 El que SÍ se usa: `inscripciones.certificado_correr`

Es un checkbox por inscripción (`inscripciones.html:303` "Certificado de correr ✓", se guarda en `:841`). Lo usan el PDF de
inscriptos (`inscripciones.html:1022`) y ratificación (`ratificacion.html:369`): los que no lo tienen salen con un ● (`pi-nocert`).

```sql
select r.numero as reunion, r.fecha, r.es_prueba, count(*) as inscripciones,
  count(*) filter (where i.certificado_correr) as cert_true, … from inscripciones i join carreras c … join reuniones r … group by 1,2,3;
```
```
reunion 6    2026-06-20  125 insc  124 true    1 false
reunion 8    2026-08-16  106 insc    0 true  106 false
reunion 9    2026-09-20  102 insc   92 true   10 false
reunion 10   2026-10-11    4 insc    0 true    4 false
reunion 9999 2099-01-01   17 insc    0 true   17 false   (prueba)
```

Por canal: R9 manual 89/98, R9 portal 3/4, R10 portal 0/4.

Quién lo puso en true (auditoría de `inscripciones`, sólo UPDATE que cambian el campo):

```
dia         antes  despues  n    usuarios  sin_usuario
2026-06-12  false  true     124  0         124     ← R6: en bloque, sin usuario (SQL/migración)
2026-09-11  false  true      71  1         0       ← R9: una persona desde la app
2026-09-14  false  true      14  1         0       ← R9: idem (día de ratificación)
```

Además, hay altas que ya nacieron en true (INSERT con true: 43 el 15/06, 8 el 22/07, 12 el 13/08, 2 el 12/09, 6 el 14/09).
**R8 no tiene ni uno en true**: o no se controló, o se controló por fuera y no se tildó.

## 5. Portal: SPC que no está en el padrón

- `portal.html:199-200` (comentario): *"Sólo lectura. El alta de SPC es acto de secretaría: el Stud Book es global y darlo de alta
  desde acá afectaría a todos los hipódromos."*
- El buscador del modal filtra **sólo el padrón** (`rpc_padron_spcs`, `portal.html:735-803`). Sin resultados muestra
  (`portal.html:984-987`): *"Ningún caballo del padrón coincide con esa búsqueda. Si el ejemplar existe y no aparece, todavía no
  está cargado en el sistema: avisale a la secretaría del hipódromo."*
- La base lo impide aunque se intentara por fuera:
  ```
  spcs_insert  INSERT  {authenticated}  with_check: (SELECT fn_is_staff())
  spcs_update  UPDATE  {authenticated}  (SELECT fn_is_staff())
  spcs_delete  DELETE  {authenticated}  (SELECT fn_is_super_admin())
  spcs_select  SELECT  {authenticated}  fn_is_staff() OR id IN fn_mis_spc_visibles()
  ```
  y `studbook-buscar` responde **403 `solo_staff`** a un usuario de portal (probado en `tests/probe_studbook_buscar_e2e.mjs`).
- **No hay mecanismo de pedido**: tablas con `solicit|pedido|spc` en el nombre → `_bak_merge_duplicados_spc`,
  `solicitudes_acceso` (acceso de usuarios, no de caballos), `spc_entrenadores_hist`, `spc_propietarios`, `spcs`,
  `v_spcs_activos`. Ningún `.html`/`.js` de `main` tiene un "solicitar alta de SPC".
- **Resultado:** el usuario queda trabado hasta que la secretaría, avisada por fuera, lo da de alta en `spcs.html` (con el
  buscador del Stud Book). Después aparece en el padrón y lo puede anotar él.

## Preguntas abiertas / lo que haría falta decidir (no hecho)

1. Si se quiere el certificado automático: la función tendría que pedir la **ficha HTML** de cada candidato y leer la fila
   (estado ✔/❗/✖ + fecha + titular). Es más scraping, sobre una página que el Stud Book puede cambiar sin aviso.
2. Dónde guardarlo: como el certificado cambia con la titularidad, un booleano en `spcs` envejece. Lo natural es **estado +
   fecha + titular + cuándo se consultó**, y reconsultar al inscribir o ratificar.
3. **Bug de hoy, independiente de lo anterior:** `inscripciones.html` le muestra a la secretaría "⚠️ NO tiene certificado de
   correr registrado en el Stud Book" para **todos** los caballos y deja el checkbox destildado, porque lee `spcs.certificado_correr`,
   que nadie carga. Es información falsa en pantalla.
4. `spcs` sin auditoría: si el certificado (o cualquier dato del padrón) empieza a importar, falta el trigger de auditoría.
5. Portal: ¿se quiere un "pedir alta de este caballo" que le llegue a la secretaría, en lugar del aviso por fuera?

## Verificación de push

```
$ git ls-remote origin reports
df9f1630e283d16d2ae3acc4ae95508d7085e55e	refs/heads/reports
$ git rev-parse HEAD
df9f1630e283d16d2ae3acc4ae95508d7085e55e
```

El SHA de arriba es el commit con el contenido; este bloque va en el commit siguiente.
