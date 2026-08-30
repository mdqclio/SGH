# Aplicación del fix del logo + limpieza de rutas al host viejo

- **Fecha**: 2026-08-30
- **SHA del trabajo**: `7b59992` en `fix/rutas-dominio-sigh` (rama creada desde `origin/main` = `25ee690`)
- **Diagnóstico previo**: `docs/diagnosticos/2026-08-30_logo-roto-dominio.md`
- **Alcance**: 1 escritura en producción (una fila de `clubs`) + 4 archivos del repo.
- **Merge a `main`**: **NO hecho.** La rama está pusheada y espera OK explícito (CLAUDE.md).

---

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ git rev-parse --abbrev-ref HEAD
fix/aislamiento-club-cobros

$ git rev-parse HEAD
09ddb5b12d6ce586470eb4907c04aef2a711b580

$ git status --porcelain
(vacío — working tree limpio)
```

```sql
SELECT count(*) AS spcs_count FROM spcs;
```
```json
[{"spcs_count":181}]
```

Proyecto: `unlhcuanfrtpatoipwve`.

---

## 1. Pregunta previa: ¿`logo_url` se consume fuera del navegador?

Era la condición que pusiste antes de considerar la ruta relativa. **Respuesta: no.**

### 1.1 `reunion-json` no toca `clubs`

Es el Edge Function que le sirve los datos a Diego (Stud Book). Todos sus `select`:

```
$ grep -n "\.select(" supabase/functions/reunion-json/index.ts
82:    const { data, error } = await db.from(tabla).select(cols).in('id', clean);
94:      .select('id, fecha, hipodromo_id, numero, numero_publico, estado')
106:        .from('hipodromos').select('id, nombre').eq('id', reunion.hipodromo_id).single();
112:      .from('carreras').select('*').eq('reunion_id', reunionId)
119:      const { data, error } = await db.from('resultados').select('*').in('carrera_id', carreraIds)
127:      const { data, error } = await db.from('inscripciones').select('*').in('carrera_id', carreraIds)
139:      const { data, error } = await db.from('resultado_posiciones').select('*').in('resultado_id', resultadoIds)
```

La única mención de club en todo el archivo es `.eq('club_id', CLUB_ID_DOLORES)` en la línea 95 — un
**filtro**, no una lectura de la tabla `clubs`. De `hipodromos` toma sólo `id, nombre`. **El payload
que recibe Diego no incluye el logo por ninguna vía.**

### 1.2 Barrido completo del resto de las vías

```
$ grep -rn "logo_url" --include="*.ts" --include="*.sql" --include="*.mjs" --include="*.js" .
(cero resultados)
```

```sql
-- ¿existe la columna en otra tabla?
SELECT table_schema, table_name, column_name FROM information_schema.columns
WHERE column_name ILIKE '%logo%' ORDER BY table_schema, table_name;
```
```json
[{"table_schema":"auth","table_name":"oauth_clients","column_name":"logo_uri"},
 {"table_schema":"public","table_name":"clubs","column_name":"logo_url"}]
```

```sql
-- ¿alguna función la lee?
SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.prokind='f' AND p.prosrc ILIKE '%logo_url%';
```
```json
[]
```

```sql
-- ¿alguna vista la expone?
SELECT schemaname, viewname FROM pg_views WHERE schemaname='public' AND definition ILIKE '%logo_url%';
```
```json
[]
```

`logo_url` vive **solo** en `public.clubs` y **solo** lo consume el navegador, en los 9 puntos
listados en el diagnóstico previo. Ni Edge Function, ni vista, ni RPC, ni probe.

### 1.3 Qué significa para el criterio

Técnicamente la ruta relativa (`logo-dolores-verde.png`) sería viable hoy y sería inmune a un futuro
cambio de dominio. **No se cambió el criterio** — se aplicó la absoluta como indicaste. Queda como
dato para cuando se decida.

El argumento que sigue en contra de la relativa, y que no depende del Edge Function: `admin.html`
declara el campo como `<input type="url">`, y esa validación del navegador **rechaza** un valor
relativo. Para pasar a relativa habría que cambiar también el tipo del input en los dos formularios.

---

## 2. El fix aplicado

```sql
UPDATE clubs
SET logo_url = 'https://sigh.com.ar/logo-dolores-verde.png'
WHERE id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
RETURNING id, sigla, logo_url;
```

```json
[{"id":"0649e9c5-9e87-4aad-842f-101458e6b33c","sigla":"DOL","logo_url":"https://sigh.com.ar/logo-dolores-verde.png"}]
```

**Una fila afectada.** Valor anterior: `https://mdqclio.github.io/SGH/logo-dolores-verde.png`
(registrado en el diagnóstico previo, §2, por si hay que revertir).

### Verificación del estado final

```sql
SELECT id, sigla, nombre, logo_url, (logo_url IS NULL) AS es_null FROM clubs ORDER BY sigla;
```

```json
[{"id":"0649e9c5-9e87-4aad-842f-101458e6b33c","sigla":"DOL","nombre":"Hipódromo de Dolores","logo_url":"https://sigh.com.ar/logo-dolores-verde.png","es_null":false},
 {"id":"710d43c1-364e-4431-99d9-c47e87242075","sigla":"HSF","nombre":"Jockey Club San Francisco - Hipodromo Oscar C. Boero","logo_url":null,"es_null":true},
 {"id":"a6da7e40-1515-45dc-8933-4eef33ce937a","sigla":"MCH","nombre":"Mi Club Hípico","logo_url":null,"es_null":true}]
```

Las dos cosas pedidas:

| Chequeo | Resultado |
|---|---|
| La fila DOL quedó con el valor nuevo | ✅ `https://sigh.com.ar/logo-dolores-verde.png` |
| Las otras dos siguen en `NULL` | ✅ HSF `null`, MCH `null` |

`clubs` sigue con 3 filas. `sponsors` no se tocó.

---

## 3. Cambios de código — commit `7b59992`

```
 README.md                               |  2 +-
 admin.html                              |  8 +++----
 docs/GOTCHAS.md                         | 37 +++++++++++++++++++++++++++++++++
 supabase/functions/invite-user/index.ts |  4 ++--
 4 files changed, 44 insertions(+), 7 deletions(-)
```

### 3.1 `invite-user/index.ts` — los dos defaults

```diff
 const REDIRECT_URL = Deno.env.get('INVITE_REDIRECT_URL')
-  ?? 'https://mdqclio.github.io/SGH/reset-password.html';
+  ?? 'https://sigh.com.ar/reset-password.html';

-const ALLOWED_ORIGINS = (Deno.env.get('INVITE_ALLOWED_ORIGINS') ?? 'https://mdqclio.github.io')
+const ALLOWED_ORIGINS = (Deno.env.get('INVITE_ALLOWED_ORIGINS') ?? 'https://sigh.com.ar')
   .split(',').map((s) => s.trim()).filter(Boolean);
```

⚠️ **La función desplegada NO se redeployó.** Es cambio de fuente solamente, o sea **cero cambio de
comportamiento en producción hoy**: el env sigue tapando los defaults y las invitaciones siguen
funcionando igual que antes. Lo que se cerró es la bomba de tiempo del redeploy sin env.

Nota de segundo orden: el nuevo default de `ALLOWED_ORIGINS` es **sólo** `sigh.com.ar`, mientras que
el env desplegado hoy permite además `mdqclio.github.io` (verificado por preflight en el diagnóstico
previo, §6). Si alguna vez se borra el env, invitar desde el host viejo dejaría de funcionar — que es
el comportamiento deseado, pero conviene tenerlo escrito.

### 3.2 `admin.html` — hint de hosts permitidos (los dos formularios, alta y edición)

```diff
-          <input type="url" id="c-logo-url" placeholder="https://raw.githubusercontent.com/...">
-          <span class="hint">Subir la imagen a GitHub y pegar la URL directa (raw). Se usa en PDF e impresiones.</span>
+          <input type="url" id="c-logo-url" placeholder="https://sigh.com.ar/mi-logo.png">
+          <span class="hint">Se usa en PDF e impresiones. La CSP del sitio sólo permite imágenes de <b>sigh.com.ar</b>, <b>*.supabase.co</b> (Storage) y <b>raw.githubusercontent.com</b>. Una URL de cualquier otro host el navegador la bloquea y el logo no se ve — sin error visible.</span>
```

Idéntico en `c-logo-url` (alta, línea 173) y `e-logo-url` (edición, línea 252). El texto es HTML
estático del archivo, no pasa por `innerHTML` con datos de usuario — no toca ISSUE-018.

### 3.3 `README.md:13`

```diff
-- **App en vivo**: https://mdqclio.github.io/SGH/
+- **App en vivo**: https://sigh.com.ar/
```

La línea 14 (`Repositorio: github.com/mdqclio/SGH`) **no se tocó**: es correcta, apunta al repo.

### 3.4 `docs/GOTCHAS.md` — entrada #78

Título: **`curl` sigue el 301; el navegador cancela por CSP antes del redirect**.

El núcleo, que es lo que pediste que quedara escrito:

> El protocolo de verificación de deploy de `CLAUDE.md` es `curl` + `md5sum` contra el archivo del
> commit. Eso es **ciego a toda esta clase de fallo**. Un md5 que coincide prueba que el archivo llegó
> al CDN — no prueba que el navegador lo pueda usar. Entre "el byte está en el servidor" y "el usuario
> lo ve" hay una capa entera que `curl` no ejecuta: CSP, CORS, mixed content, canvas tainting,
> service worker.
>
> Regla: cuando el síntoma es **"no se ve"** y no **"da 404"**, `curl` no es evidencia. Un 200 por
> `curl` frente a un "no se ve" reportado no desmiente el reporte — lo confirma, y además dice que la
> causa es de capa navegador.

Incluye la salida cruda de los dos `curl` que daban verde mientras el logo estaba roto, y el corolario
de que la CSP no se abre para acomodar un dato viejo.

---

## 4. Cómo confirmar el fix — en navegador, no con `curl`

Tenés razón en que `curl` acá no prueba nada: devolvía 200 antes y devuelve 200 ahora. Lo que cambió
es si el navegador **emite** el pedido, y eso sólo se ve en el navegador.

**El fix es de dato, no de archivo: no requiere deploy ni esperar al CDN. Ya está activo.** Alcanza
con recargar. Ojo con el caché: el `<img>` roto puede haber quedado cacheado como fallo, así que
`Ctrl+Shift+R`.

### Lo mínimo para dar por cerrado (30 segundos)

1. Abrir `https://sigh.com.ar/index.html` logueado como `dolores@sgh.com`.
2. Mirar el **logo del sidebar**: tiene que verse el escudo verde de Dolores, no un ícono roto.
3. Abrir DevTools → **Console**: no tiene que haber ninguna línea
   `Refused to load the image 'https://mdqclio.github.io/…' because it violates … "img-src 'self' …"`.

Ese único chequeo cubre la causa raíz. Si el sidebar carga, los otros 8 puntos cargan: es el mismo
dato y la misma CSP.

### Chequeo completo, si querés barrer los 9 (5 minutos)

| # | Qué abrir | Dónde mirar |
|---|---|---|
| 1 | `index.html` | logo del sidebar |
| 2 | `carta-llamados.html` → Imprimir | encabezado del documento (100×100) |
| 3 | `programa.html` → vista de impresión | logo del encabezado (60×60) |
| 4 | `programa-oficial.html` | logo del encabezado (B&N) |
| 5 | `programa-oficial-color.html` | logo del encabezado (color) |
| 6 | `liquidaciones.html` → Pagos → imprimir un recibo | logo del membrete **en el preview de impresión** |
| 7 | `inscripciones.html` → PDF de inscriptos | logo del pie |
| 8 | `ratificacion.html` → PDF | logo del pie |
| 9 | `admin.html` → Mi Hipódromo → editar Dolores | el preview del logo bajo el campo |

El **6** es el que conviene no saltear: `precargarLogo()` (`liquidaciones.html:666-672`) espera
`onload`/`onerror` con timeout de 1000 ms antes de `window.print()`. Con la CSP bloqueando disparaba
`onerror` al instante y el recibo salía sin logo, sin error y sin demora perceptible — el síntoma más
silencioso de los nueve. Hay que mirar el **preview de impresión**, no la pantalla.

### Qué NO alcanza

- `curl -s https://sigh.com.ar/logo-dolores-verde.png` → 200. Daba 200 con el bug vivo. No prueba nada.
- `md5sum` contra el commit → el fix no tocó ningún archivo servido. No aplica.
- Consultar `clubs.logo_url` por SQL → confirma el dato (§2), no que el navegador lo pinte.

---

## 5. Fuera de alcance — respetado

| Ítem | Estado |
|---|---|
| CSP (`img-src`) | **No tocada.** Ni un archivo de los 30 con el `<meta>`. |
| `logo_url` de HSF y MCH | **No tocados.** Siguen `NULL` (verificado en §2). |
| Función `invite-user` desplegada | **No redeployada.** Sólo el fuente. |
| `package.json` (URLs de GitHub) | **No tocado** — son correctas. |
| `docs/SERVER.md` (`raw.githubusercontent.com`) | **No tocado** — es correcta. |
| `docs/*.md` históricos con `mdqclio.github.io/SGH/` | **No reescritos** — son fotos de su fecha (CLAUDE.md). |
| Merge a `main` | **No hecho.** Espera OK. |

---

## 6. Números de resumen

| | |
|---|---|
| Filas de `clubs` modificadas | **1** (DOL) |
| Filas de `clubs` con `logo_url` NULL | **2** (HSF, MCH) — sin cambio |
| Otras escrituras en la base | **0** |
| Archivos del repo modificados | **4** |
| Líneas: +44 / −7 | |
| Pantallas/documentos que el fix destraba | **9** |
| Rama | `fix/rutas-dominio-sigh` @ `7b59992`, pusheada |
| Verificado en navegador | **NO todavía** — pendiente de vos (§4) |

---

## 7. Preguntas abiertas

1. **Merge a `main`.** La rama está pusheada sin mergear. Mergear despliega `admin.html` y `README.md`
   a producción (`docs/` y `supabase/functions/` no los sirve Pages). Ninguno de los dos cambia
   comportamiento: el de `admin.html` es texto de un hint. Necesita tu OK.
2. **El fix del logo ya está vivo sin ese merge.** Es un dato en la base — no depende del deploy. Si
   verificás el logo antes de mergear, lo que estás viendo es el fix completo.
3. **`INVITE_REDIRECT_URL`** — sigue sin verificarse el valor real del env en el dashboard de
   Supabase. Verificarlo requiere disparar una invitación (escritura) o leerlo del panel. Queda
   pendiente del diagnóstico anterior; el cambio de fuente de hoy no lo resuelve, sólo cubre el
   redeploy.
4. **`admin.html` no valida el host contra la CSP.** El hint avisa, pero si alguien pega una URL de
   otro host el campo la acepta y el logo simplemente no se ve. Un `pattern` en el input o un check
   de host al guardar lo convertiría en error visible. No implementado — es cambio de producto.
5. **La ruta relativa quedó descartada por ahora, no refutada.** §1 confirma que nada fuera del
   navegador lee `logo_url`, o sea que el motivo que la bloqueaba no existe. Si algún día se retoma,
   el costo es cambiar `type="url"` a `type="text"` en los dos inputs de `admin.html`.
