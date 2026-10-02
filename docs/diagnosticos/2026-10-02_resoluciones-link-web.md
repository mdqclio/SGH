# Paso 5 — Resoluciones en la web del hipódromo: relevamiento sobre lo ya bajado + propuesta de guardar el link

- Fecha: 2026-10-02
- Código leído: `origin/main` (`d481e68f7195377408cdc9180a8864efe824e3e3`, post merge #47), con `git show origin/main:…`. Sin checkout.
- Base: prod (`unlhcuanfrtpatoipwve`), **sólo lectura** (`execute_sql`, todo SELECT). Guard de club: `Hipódromo de Dolores`, 1 fila.
- Sitio del hipódromo: **cero pedidos**. Fuente única: `tests/local/out/hipodromodolores_2026-09-26/` (gitignored, bajado el 2026-09-26 01:17–01:27 UTC).
- Anonimizado: los nombres de archivo de las resoluciones traen el nombre del sancionado (persona o caballo). Acá no se copia ninguno.
  Se dan el N°, la carpeta, el tipo y el comando que lista el resto.

## Conclusión

1. **El sitemap no lista resoluciones.** `posts-sitemap.xml` tiene 58 URLs de posts (resultados, estadísticas, fechas de reunión, avisos),
   y ninguna es una resolución. Las resoluciones viven en el **menú secundario** del sitio (WordPress/Divi): submenú "Resoluciones",
   con un enlace por resolución, **"Resolución N°1" a "Resolución N°40"**, a un PDF en `/wp-content/uploads/AAAA/MM/`. El menú es el
   mismo en las 7 páginas de post bajadas (md5 idéntico del conjunto de enlaces `.pdf`).
2. **40 resoluciones publicadas, N°1–N°40, sin huecos.** Hay 26 sanciones definitivas, 7 suspensiones, 2 multas, 2 "resoluciones de
   una reunión", 1 apercibimiento, 1 acta de sesión y 1 consentimiento. 31 PDF se subieron juntos en **2025/08** (carga histórica),
   y el resto, de a uno, entre 2024/10 y 2026/09. El menú no trae la **fecha** de la resolución: la carpeta es la fecha de subida, no
   la de la resolución.
3. **La base ya guarda el link y no el PDF. La propuesta, entonces, no es un cambio de modelo: es terminar de usarlo bien.**
   `resoluciones.documento_url` (text) ya existe. `resoluciones.html` lo carga con un `<input type="url">` ("URL del documento (PDF u
   otro)") y lo muestra como "📄 Ver documento". **No hay subida de archivos**: ni en el código ni en Storage, donde sólo existen los
   buckets `chaquetillas` y `public-assets`, con 4 objetos y ninguno de resoluciones. **No hay PDF subidos que migrar.**
4. **Las 2 filas de la base son las N°39 y N°40 del sitio**, con la misma URL exacta del menú. Las cargaron el 27/09 (fecha
   2026-09-25, estado `notificada`, R8). **Faltan N°1–N°38.**
5. Encontré tres agujeros en lo que ya existe, y van dentro de la propuesta:
   - `documento_url` se pinta sin escapar en un `href`, y una URL `javascript:` la ejecuta quien haga clic. Es ISSUE-018 (el XSS)
     sobre este campo. El campo lo escribe sólo el staff, por la política de escritura con `fn_is_staff` (ISSUE-093).
   - La base no valida ni el dominio ni el esquema del link.
   - `sanciones.resolucion_url` y `sanciones.codigo_resolucion` existen pero **ninguna pantalla los usa**: 5 sanciones, 0 con link,
     0 con código. La sanción no se puede atar a su resolución.

## Números

| | |
|---|---|
| URLs en `posts-sitemap.xml` | 58, ninguna de resoluciones |
| Enlaces `.pdf` en el menú | 44 = 40 resoluciones + 4 de la reunión (carta, inscriptos, ratificados, programa) |
| Resoluciones en el sitio | 40 (N°1–N°40) |
| Resoluciones en la base (`resoluciones`) | 2 (N°39 y N°40, Dolores) |
| …que coinciden con el sitio por N° y URL | 2/2 |
| Faltan en la base | 38 (N°1–N°38) |
| Objetos de Storage de resoluciones | 0 |
| `sanciones` con `resolucion_url` / `codigo_resolucion` | 0/5 y 0/5 |
| Nombres de archivo con rarezas (`.pdf.pdf`, `.docx…pdf`, sufijo de duplicado, "SANSION") | ver la tabla |

## Las 40 resoluciones del menú (anonimizado)

Lo que sale del nombre del archivo es el tipo. "En la base" quiere decir que existe una fila de `resoluciones` de Dolores con ese
`numero` y esa misma URL.

| N° | Submenú (año) | Carpeta de subida | Tipo (por el nombre del archivo) | Rareza del nombre | En la base |
|---|---|---|---|---|---|
| 1 | (sin año) | 2025/08 | sanción definitiva | typo SANSION | no |
| 2 | (sin año) | 2025/08 | sanción definitiva | typo SANSION | no |
| 3 | (sin año) | 2025/08 | sanción definitiva | — | no |
| 4 | (sin año) | 2025/08 | sanción definitiva | — | no |
| 5 | (sin año) | 2025/08 | sanción definitiva | — | no |
| 6 | (sin año) | 2025/08 | sanción definitiva | typo SANSION | no |
| 7 | (sin año) | 2025/08 | sanción definitiva | — | no |
| 8 | (sin año) | 2025/08 | sanción definitiva | — | no |
| 9 | (sin año) | 2025/08 | sanción definitiva | sufijo de duplicado, typo SANSION | no |
| 10 | (sin año) | 2025/08 | sanción definitiva | typo SANSION | no |
| 11 | (sin año) | 2025/08 | sanción definitiva | typo SANSION | no |
| 12 | (sin año) | 2025/08 | sanción definitiva | — | no |
| 13 | (sin año) | 2025/08 | sanción definitiva | — | no |
| 14 | (sin año) | 2025/08 | sanción definitiva | — | no |
| 15 | 2023 | 2025/08 | acta de sesión | — | no |
| 16 | 2023 | 2025/08 | suspensión | — | no |
| 17 | 2023 | 2025/08 | sanción definitiva | typo SANSION | no |
| 18 | 2023 | 2025/08 | suspensión | — | no |
| 19 | 2023 | 2025/08 | sanción definitiva | typo SANSION | no |
| 20 | 2023 | 2025/08 | sanción definitiva | typo SANSION | no |
| 21 | 2023 | 2025/08 | sanción definitiva | typo SANSION | no |
| 22 | 2023 | 2025/08 | multa | — | no |
| 23 | (sin año) | 2025/08 | apercibimiento | — | no |
| 24 | (sin año) | 2025/08 | suspensión | — | no |
| 25 | (sin año) | 2024/10 | resoluciones de una reunión (fecha en el nombre) | — | no |
| 26 | (sin año) | 2025/08 | resoluciones de una reunión (fecha en el nombre) | — | no |
| 27 | (sin año) | 2025/08 | suspensión | — | no |
| 28 | (sin año) | 2025/08 | suspensión | sufijo de duplicado | no |
| 29 | 2025 | 2025/08 | sanción definitiva | `.pdf.pdf` | no |
| 30 | 2025 | 2025/08 | sanción definitiva | `.pdf.pdf` | no |
| 31 | 2025 | 2025/08 | consentimiento | — | no |
| 32 | 2025 | 2025/08 | sanción definitiva | `.pdf.pdf` | no |
| 33 | 2025 | 2026/02 | multa | — | no |
| 34 | 2026 | 2026/02 | suspensión | `.docx…pdf`, sufijo de duplicado | no |
| 35 | 2026 | 2026/03 | sanción definitiva | `.docx…pdf` | no |
| 36 | 2026 | 2026/03 | sanción definitiva | `.docx…pdf` | no |
| 37 | 2026 | 2026/04 | suspensión | `.docx…pdf` | no |
| 38 | 2026 | 2026/05 | sanción definitiva | `.docx…pdf`, sufijo de duplicado | no |
| 39 | 2026 | 2026/09 | sanción definitiva | — | sí |
| 40 | 2026 | 2026/09 | sanción definitiva | `.docx…pdf` | sí |

Para ver los nombres de archivo completos (traen el nombre del sancionado; **no se copian al repo**), en el servidor y sobre lo ya
bajado:

```bash
D=tests/local/out/hipodromodolores_2026-09-26
grep -oiE 'href="[^"]+\.pdf"' $D/r160826.html | sort -u
```

## Comandos y salidas (tal como se corrieron; salidas con nombres reemplazadas por agregados)

### 1. ¿Qué hay bajado y qué trae el sitemap?

```bash
D=/home/clio/dev/SGH/tests/local/out/hipodromodolores_2026-09-26
ls -la $D ; find $D -type f | wc -l          # → 55 archivos
grep -c '<loc>' $D/posts-sitemap.xml          # → 1 (todo el XML va en una línea)
cat $D/posts_urls.txt | sed -E 's#https?://[^/]+##'
```
Salida de `posts_urls.txt`: 58 rutas. Por tipo: `resultados-*` (5), `estadistica-*` (17), fecha de reunión `D-de-mes-AAAA` (24),
avisos (`que-presentar-para-poder-correr`, `aumento-de-premios`, `dias-importantes`, `calendario-de-reuniones`, `doblete-dolores`,
`calendario-2026-dolores`, `unico-metodo-de-inscripcion`, `pago-de-premios`, `novedades-estadisticas-2026`,
`info-importante-enterate-aca`, `10-noviembre-2024-gdes-premios`) y `__trashed`. **No hay ninguna ruta con "resoluc".**
Último `lastmod` del sitemap: `2026-09-21T10:48:26+00:00`.

### 2. ¿Dónde aparece "resolución"?

```bash
grep -il 'resoluc' $D/*
```
```
31-de-agosto-2025.html
r160826.html
resultados-19-mayo-2024.html
resultados-1-mayo-2024.html
resultados-30-junio-2024.html
resultados-28-julio-2024.html
resultados-18-agosto-2024.html
```
Cada página trae 40 "Resolución" (los ítems del menú) y 1 "Resoluciones" (el título del submenú).

```bash
for f in $D/*.html; do grep -ohiE 'href="[^"]+\.pdf"' $f | sort -u | md5sum; done | sort | uniq -c
```
```
      7 a01308b2fd99117eb5c6763f3d705316  -
      2 d41d8cd98f00b204e9800998ecf8427e  -
```
→ las 7 páginas de post traen **el mismo** conjunto de enlaces; las otras 2 (`book.html` y `g0.html`) no traen ninguno, y su md5 es el
del vacío.

```bash
grep -ohiE 'href="[^"]+\.pdf"' $D/r160826.html | sort -u > pdfs.txt; wc -l < pdfs.txt                 # → 44
sed -E 's#.*uploads/([0-9]{4}/[0-9]{2})/.*#\1#' pdfs.txt | sort | uniq -c
sed -E 's#href="(https?://[^/]+)?.*#\1#' pdfs.txt | sort | uniq -c
```
```
      1 2024/10
     31 2025/08
      2 2026/02
      2 2026/03
      1 2026/04
      1 2026/05
      6 2026/09
     44 https://hipodromodolores.com
```
(La salida de los prefijos de archivo se omite: trae nombres. El conteo por tipo está en la tabla.)

### 3. Dónde cuelga cada PDF del menú (parser HTML, anclas → ítem padre)

```python
import re,html
from html.parser import HTMLParser
s=open('…/r160826.html',encoding='utf-8').read()
class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.stack=[]; s.in_a=None; s.txt=''; s.out=[]
    def handle_starttag(s,t,a):
        a=dict(a)
        if t=='li': s.stack.append(None)
        if t=='a': s.in_a=a.get('href'); s.txt=''
    def handle_endtag(s,t):
        if t=='a':
            txt=' '.join(html.unescape(s.txt).split())
            if s.stack and s.stack[-1] is None: s.stack[-1]=txt
            if s.in_a and s.in_a.lower().endswith('.pdf'):
                s.out.append((' > '.join([x for x in s.stack[:-1] if x]),s.in_a,txt))
            s.in_a=None
        if t=='li' and s.stack: s.stack.pop()
    def handle_data(s,d):
        if s.in_a is not None: s.txt+=d
```
Resultado: 44 anclas sin repetir. 4 son de la reunión (texto "Carta de llamados", "Inscriptos", "Ratificados", "Programa Oficial",
en `2026/09`) y 40 tienen el texto `Resolución N°k`, k = 1…40. Submenú por año: `2023` → N°15–22; `2025` → N°29–33; `2026` → N°34–40;
el resto cuelga sin año (el parser no encontró un año para N°1–14 ni N°23–28).

### 4. Base — esquema

```sql
select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
where table_schema='public' and table_name in ('resoluciones','resolucion_entidades','sanciones') order by table_name, ordinal_position;
```
```
resolucion_entidades: id uuid NO uuid_generate_v4() | resolucion_id uuid NO | entidad_tipo varchar NO | entidad_id uuid NO | descripcion text YES
resoluciones: id uuid NO uuid_generate_v4() | club_id uuid NO | reunion_id uuid YES | numero varchar NO | fecha date NO | tipo varchar NO |
              texto text YES | documento_url text YES | estado varchar NO 'borrador' | creado_por uuid YES | created_at timestamptz NO now() |
              modificado_por uuid YES | modificado_at timestamptz YES
sanciones: id uuid NO | club_id uuid NO | entidad_tipo USER-DEFINED NO | entidad_id uuid NO | tipo_sancion varchar NO | motivo text YES |
           codigo_resolucion varchar YES | fecha_inicio date NO | fecha_fin date YES | alcance varchar NO 'club' | estado USER-DEFINED NO 'activa' |
           resolucion_url text YES | notas text YES | creado_por uuid YES | created_at timestamptz NO now() | modificado_por uuid YES | modificado_at timestamptz YES
```

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.resoluciones'::regclass
union all select indexname, indexdef from pg_indexes where tablename='resoluciones'
union all select tgname, pg_get_triggerdef(t.oid) from pg_trigger t where tgrelid='public.resoluciones'::regclass and not tgisinternal;
```
```
resoluciones_club_id_fkey        FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
resoluciones_club_id_numero_key  UNIQUE (club_id, numero)
resoluciones_creado_por_fkey     FOREIGN KEY (creado_por) REFERENCES usuarios(id)
resoluciones_modificado_por_fkey FOREIGN KEY (modificado_por) REFERENCES usuarios(id)
resoluciones_pkey                PRIMARY KEY (id)
resoluciones_reunion_id_fkey     FOREIGN KEY (reunion_id) REFERENCES reuniones(id)
trg_audit_resoluciones           AFTER INSERT OR DELETE OR UPDATE … fn_auditoria_log()
trg_resoluciones_autor           BEFORE INSERT OR UPDATE … fn_autor_fila()
```
→ no hay ningún CHECK sobre `documento_url`.

### 5. Base — datos

```sql
select 'resoluciones' t, count(*) n, count(documento_url) con_url,
  count(*) filter (where documento_url ilike '%hipodromodolores.com%') url_sitio,
  count(*) filter (where documento_url ilike '%supabase%') url_storage, min(fecha)::text, max(fecha)::text,
  string_agg(distinct tipo, ','), string_agg(distinct estado, ',') from resoluciones
union all select 'sanciones', count(*), count(resolucion_url), …, string_agg(distinct tipo_sancion, ','), string_agg(distinct estado::text, ',') from sanciones
union all select 'sanciones con codigo_resolucion', count(codigo_resolucion), … from sanciones
union all select 'storage.buckets', count(*), …, string_agg(id||':'||public::text, ','), null from storage.buckets
union all select 'storage.objects', count(*), …, string_agg(distinct bucket_id, ','), null from storage.objects;
```
```
resoluciones                      n=2  con_url=2  url_sitio=2  url_storage=0  2026-09-25..2026-09-25  SANCIÓN  notificada
sanciones                         n=5  con_url=0  url_sitio=0  url_storage=0  2026-05-05..2026-09-15  Doping,SUSPENSIÓN  activa
sanciones con codigo_resolucion   0
storage.buckets                   2  chaquetillas:true,public-assets:true
storage.objects                   4  chaquetillas,public-assets
```

```sql
select id, numero, fecha::text, tipo, estado, reunion_id, length(texto) largo_texto,
  regexp_replace(documento_url, '^(https?://[^/]+/wp-content/uploads/[0-9]{4}/[0-9]{2}/).*$', '\1<archivo>') url_carpeta,
  created_at::text, (select count(*) from resolucion_entidades e where e.resolucion_id=r.id) entidades
from resoluciones r order by numero;
```
```
fb2d3259-772c-4961-afd2-59a3f9b5b9c8 | 39 | 2026-09-25 | SANCIÓN | notificada | 7b6e003e-22e2-4629-bf55-f18560b1260f | 1608 | https://hipodromodolores.com/wp-content/uploads/2026/09/<archivo> | 2026-09-27 21:10 UTC | 0
92eb0763-bc72-4150-8f20-73ddb8d70d21 | 40 | 2026-09-25 | SANCIÓN | notificada | 7b6e003e-22e2-4629-bf55-f18560b1260f | 1702 | https://hipodromodolores.com/wp-content/uploads/2026/09/<archivo> | 2026-09-27 21:14 UTC | 0
```
(`reunion_id` = R8, 2026-08-16, `finalizada`). Cruce local de la URL completa contra el menú: la de N°39 es la del ítem "Resolución
N°39" y la de N°40 la del ítem "Resolución N°40", iguales carácter por carácter. Ninguna de las dos tiene `resolucion_entidades`: el
sancionado no está atado a la ficha.

```sql
select id, nombre, website from clubs order by nombre;   -- website: NULL en los 3 clubs
```

### 6. Código (origin/main)

```bash
git show origin/main:resoluciones.html | grep -nE 'storage|pdf|PDF|archivo|upload|\.from\(|url|link|href'
git grep -nE 'documento_url|resolucion_url' origin/main -- '*.html' '*.js' '*.sql' '*.md'
```
```
resoluciones.html:178:  <label>URL del documento (PDF u otro)</label>
resoluciones.html:179:  <input type="url" id="f-doc-url" placeholder="https://…">
resoluciones.html:259:  ${r.documento_url?`<a href="${r.documento_url}" target="_blank" class="res-doc">📄 Ver documento</a>`:''}
resoluciones.html:288:  document.getElementById('f-doc-url').value = rec?.documento_url||'';
resoluciones.html:311:  documento_url: document.getElementById('f-doc-url').value.trim() || null,
docs/SCHEMA.md:63:   sanciones … codigo_resolucion …
docs/SCHEMA.md:219:  resoluciones … documento_url …
tests/local/politicas_escritura_sandbox.sql:34 / sanciones_sandbox.sql:49 / portal_alta_spc_sandbox.sql:72-73  (sólo fixtures)
```
→ ningún `storage.from(…)` ni `upload`. `sanciones.html` no lee ni escribe `resolucion_url` ni `codigo_resolucion`.
`resoluciones.html:258` pinta también `r.texto` sin escapar (ISSUE-018, mismo tramo).

## Propuesta: el link al PDF del sitio es el documento; no se guarda el PDF

**Criterio.** El PDF oficial lo publica el hipódromo en su web. El SGH guarda **el link** y los datos estructurados (N°, fecha, tipo,
reunión, entidades). Así no se duplica el archivo, no se abre Storage (con sus políticas y su PII en buckets) y la fuente de verdad
sigue siendo una sola. El riesgo es que el link se rompa si el sitio mueve o borra el archivo: se mitiga con una verificación a
demanda (ver "Después").

### A. Base — sin columna nueva: se reutiliza `documento_url` y se le pone guarda

No conviene una columna nueva (`url_publicacion`): `documento_url` ya es exactamente eso y las 2 filas ya la usan bien.

```sql
-- migrations/resoluciones_documento_url_check.sql  (ESBOZO — no aplicado)
-- dominio permitido: https://hipodromodolores.com/… (y www.); otro club = NULL hasta que cargue su website
ALTER TABLE public.resoluciones
  ADD CONSTRAINT resoluciones_documento_url_https
  CHECK (documento_url IS NULL OR documento_url ~ '^https://[^/[:space:]]+/[^[:space:]]*$') NOT VALID;
ALTER TABLE public.resoluciones VALIDATE CONSTRAINT resoluciones_documento_url_https;   -- hoy: 2/2 pasan
-- unicidad: un mismo PDF no puede ser dos resoluciones del mismo club
CREATE UNIQUE INDEX resoluciones_club_documento_url_key ON public.resoluciones (club_id, documento_url) WHERE documento_url IS NOT NULL;
-- (opcional) lo mismo para sanciones.resolucion_url
ALTER TABLE public.sanciones
  ADD CONSTRAINT sanciones_resolucion_url_https
  CHECK (resolucion_url IS NULL OR resolucion_url ~ '^https://[^/[:space:]]+/[^[:space:]]*$');

-- rollback_resoluciones_documento_url_check.sql
ALTER TABLE public.resoluciones DROP CONSTRAINT IF EXISTS resoluciones_documento_url_https;
DROP INDEX IF EXISTS public.resoluciones_club_documento_url_key;
ALTER TABLE public.sanciones DROP CONSTRAINT IF EXISTS sanciones_resolucion_url_https;
```
- El CHECK de base exige sólo `https://`: eso mata `javascript:`/`data:`. El **dominio** se valida en la pantalla contra
  `clubs.website`, que hoy está NULL en los 3 clubs, así que hay que cargarlo: para Dolores, `https://hipodromodolores.com`. Atar el
  dominio en un CHECK haría falta por club, y un club nuevo no podría cargar nada hasta tocar DDL.
- Probar en el sandbox `tests/local/` antes de prod (como las otras): las 2 filas actuales tienen que pasar, y `javascript:alert(1)`,
  `http://…` y una URL con espacio tienen que dar 23514.

### B. Pantalla (`resoluciones.html`)

1. Cambiar la etiqueta "URL del documento (PDF u otro)" por **"Link a la resolución publicada en la web"**, con un placeholder que
   muestre el dominio del club (`clubs.website`).
2. Al guardar: `new URL(v)` válida, `protocol === 'https:'` y `hostname` igual al de `clubs.website` (o `www.` + ese). Si no
   coincide, es **error y no aviso**. Producto: conservador. Fallo de 23514 o 23505 → mensaje traducido ("ese link ya está en la Res.
   N°…").
3. Pintar el `href` escapado y sólo si pasa `^https://`, con `rel="noopener"`, usando la `escapeHtml()` de `escape-html.js`. También
   `r.texto` (ISSUE-018, mismo tramo).
4. **Sugerir el N° desde el link** no, porque el nombre del archivo no trae el N°. Lo que sí: si el N° que se carga ya existe en la
   base, el UNIQUE (club_id, numero) ya lo corta.
5. En `sanciones.html`: un selector "Resolución" (de `resoluciones` del club) que llene `codigo_resolucion` = N° y `resolucion_url` =
   `documento_url`. Así la sanción hereda el link en vez de pedir otro. Es opcional, y podría ir en un segundo PR.

### C. Las 38 que faltan (N°1–N°38)

- **Backfill propuesto, no ejecutado**: un INSERT por resolución con `numero`, `documento_url` (del menú), `tipo` (por la tabla de
  arriba, confirmado por Yesi), `estado='notificada'` y `club_id` de Dolores. Se generaría desde `menu.tsv` (local, gitignored) a un
  `.sql` en `tests/local/out/`, **no al repo**, porque las URLs llevan nombres. **No se puede sin datos de Yesi**: `fecha` es NOT NULL
  y el menú no la trae, y `texto` está vacío (la pantalla lo exige, la base no).
- Las 2 que ya están (39, 40) no se tocan.

### D. PDF ya subidos

No hay. Storage no tiene ningún objeto de resoluciones y el código nunca subió uno. No hay nada que migrar ni borrar.

### Después (fuera de este paso)

- Verificación a demanda de links rotos: un HEAD por `documento_url`, **desde la pantalla del usuario y no desde el servidor**, para no
  pegarle al sitio por lotes. O un listado "links sin verificar desde…". Queda para cuando haya más de 2 filas.

## Preguntas abiertas

1. **Yesi/Fede**: ¿cargamos las 38 históricas (N°1–38) o el SGH arranca en la 39? Si se cargan, hace falta la **fecha** de cada una
   (el menú no la trae; 31 se subieron juntas en 2025/08).
2. **Fede**: ¿el link tiene que ser **sí o sí** del sitio del hipódromo, o vale otro (Drive, el de la comisión de carreras)? La
   propuesta dice: sólo el dominio de `clubs.website`.
3. **Yesi**: el `tipo` de la base hoy es libre (`SANCIÓN`). ¿Usamos las categorías del menú (sanción definitiva, suspensión, multa,
   apercibimiento, acta de sesión, consentimiento, resoluciones de una reunión)?
4. **Fede**: N°25 y N°26 ("resoluciones de una reunión", fechas 17-Oct-2024 y 10-Nov-2024 en el nombre) agrupan varias resoluciones en
   un PDF. ¿Son una resolución o varias?
5. **Yesi**: N°16, N°18, N°27, N°28 y N°34 son suspensiones con nombres de archivo casi iguales (sufijos `1`, `-1`, `.docx`). ¿Son
   resoluciones distintas o el mismo PDF re-subido?
6. Cargar `clubs.website` de Dolores (`https://hipodromodolores.com`): ¿lo hace Yesi desde Admin → Mi Hipódromo, o va en la migración?

## Verificación de push

```
$ git ls-remote origin reports
5f25f8175fcdf69eb9f07af33361d833871a36a1
$ git rev-parse HEAD
5f25f8175fcdf69eb9f07af33361d833871a36a1
```
Chequeo de datos personales sobre lo agregado: vacío.
