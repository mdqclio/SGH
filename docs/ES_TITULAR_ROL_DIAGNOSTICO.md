# `es_titular` → `rol` en `liquidaciones.html` — diagnóstico previo al cambio

**READ-ONLY. No se aplicó ningún cambio al código ni a la base.**
Ubicación: `liquidaciones.html:797-799`, dentro de `cobrosBuscar()`.

> # El diagnóstico es peor que la hipótesis
>
> Tu lectura era que los 40 provisorios no aparecen porque no tienen `es_titular`.
> **La realidad: `es_titular` no existe como columna.** La query no devuelve un subconjunto:
> **falla entera, con error 42703**, y el `catch` implícito la deja en `[]`.
>
> **La búsqueda por caballeriza en Pagos no funciona para nadie, y no funcionó nunca.**
> No es que Valeria no encuentre a los 40 nuevos: no encuentra a ninguna de las 236.

---

## 1 · ¿Existe `es_titular`? — No

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='caballeriza_responsables'
ORDER BY ordinal_position;
```

Las 14 columnas de la tabla:

```
id · caballeriza_id · profesional_id · apellido · nombre · documento_tipo ·
documento_nro · fecha_nacimiento · localidad · rol · porcentaje · activo ·
created_at · propietario_id
```

**`es_titular` no está.** No hay filas en `true` ni en `NULL/false` que contar: **la columna
no existe**, así que la pregunta "cuántas lo tienen en true" no tiene respuesta — es la
pregunta equivocada, y eso mismo es el hallazgo.

### Comprobación contra el endpoint real

Pedido tal cual lo arma la página hoy:

```
GET /rest/v1/caballeriza_responsables
    ?select=propietario_id,caballerizas(nombre)
    &es_titular=eq.true
    &propietario_id=not.is.null
```

```json
{"code":"42703","message":"column caballeriza_responsables.es_titular does not exist"}
```

Y el reemplazo propuesto, mismo endpoint:

```
GET /rest/v1/caballeriza_responsables
    ?select=propietario_id,caballerizas(nombre)
    &rol=eq.propietario&activo=eq.true
    &propietario_id=not.is.null
```

```json
[{"propietario_id":"adfab3c8-…","caballerizas":{"nombre":"DON RAUL"}},
 {"propietario_id":"4bccbabd-…","caballerizas":{"nombre":"MARTIN Y NICOLAS"}},
 {"propietario_id":"183fb077-…","caballerizas":{"nombre":"LA MILINGA"}}, …]
```

### Por qué falla en silencio

```js
const { data: cab } = await sb.from('caballeriza_responsables')     // ← no se destructura `error`
  .select('propietario_id, caballerizas(nombre)').eq('es_titular', true)...
cobCaballerizas = (cab||[]).map(...)                                 // ← cab es undefined → []
```

**El `error` no se captura**, así que no hay `toast` ni nada en pantalla: la lista queda
vacía y la búsqueda por caballeriza simplemente no matchea nunca. Además, como el guard es
`if (!cobCaballerizas.length)`, **la query rota se repite en cada búsqueda** — nunca "cachea"
porque nunca tiene éxito.

Contrasta con la query de líneas de tres renglones más arriba, que sí lo hace bien:

```js
const { data, error } = await qy;
if (error) { toast(error.message,'error'); … return; }
```

## 2 · ¿Se usa en otro lado? — No, en código sólo acá

```bash
grep -rn "es_titular" --include=*.html --include=*.js --include=*.mjs --include=*.sql --include=*.md .
```

| archivo | línea | qué es |
|---|---|---|
| **`liquidaciones.html`** | **798** | **el único uso en código ejecutable** |
| `docs/RESULTADO_BUSCADOR_LIQUIDACIONES.md` | 71 | prosa: *"se resuelve a su propietario titular vía `caballeriza_responsables(es_titular)`"* |
| `docs/RESULTADO_COBROS_V1_1.md` | 17 | prosa: *"Caballeriza sigue resolviendo a su propietario titular (`caballeriza_responsables.es_titular`)"* |

**Un solo punto de código.** Los otros dos son documentación que describe el mismo mecanismo
—y que quedó describiendo una columna inexistente—; conviene corregirlas en el mismo commit
para no dejar la próxima búsqueda en falso.

Ni `migrations/` ni ningún `.sql` la crean o la referencian.

## 3 · ¿`rol='propietario' AND activo=true` es el reemplazo correcto? — Sí

```sql
SELECT COALESCE(rol,'(NULL)') AS rol, activo, count(*) AS filas,
       count(propietario_id) AS con_propietario_id
FROM caballeriza_responsables GROUP BY 1,2 ORDER BY 3 DESC;
```

| rol | activo | filas | con `propietario_id` |
|---|---|---|---|
| propietario | true | 241 | **236** |
| copropietario | true | 18 | 18 |

```sql
SELECT count(*) FILTER (WHERE rol='propietario' AND activo AND propietario_id IS NOT NULL) AS devuelve,
       count(DISTINCT caballeriza_id) FILTER (WHERE rol='propietario' AND activo
                                                AND propietario_id IS NOT NULL) AS caballerizas
FROM caballeriza_responsables;
```

```
devuelve = 236 · caballerizas = 236
```

- **236 filas para 236 caballerizas distintas: 1:1.** No hay riesgo de que una caballeriza
  aparezca dos veces con propietarios distintos, así que no hace falta deduplicar.
- **No hay `rol` en NULL** ni `activo=false`: el `activo=true` no cambia nada hoy, pero es el
  filtro correcto para cuando alguien dé de baja un responsable.
- **Excluye a los 18 copropietarios**, que es lo que corresponde: la búsqueda por caballeriza
  tiene que resolver al **titular**, no a los socios.
- **Incluye a los 40 provisorios de hoy** (`rol='propietario'`, `activo=true`,
  `propietario_id` cargado), que era el objetivo.

Las 5 filas `rol='propietario'` sin `propietario_id` quedan afuera por el
`.not('propietario_id','is',null)` que ya estaba — correcto, no tienen a quién resolver.

---

## 4 · El diff propuesto — NO aplicado

### Cambio mínimo, el renglón

```diff
--- a/liquidaciones.html
+++ b/liquidaciones.html
@@ -796,5 +796,5 @@
   if (!cobCaballerizas.length) {
     const { data: cab } = await sb.from('caballeriza_responsables')
-      .select('propietario_id, caballerizas(nombre)').eq('es_titular', true).not('propietario_id','is',null);
+      .select('propietario_id, caballerizas(nombre)').eq('rol','propietario').eq('activo', true).not('propietario_id','is',null);
     cobCaballerizas = (cab||[]).map(c=>({nombre:(c.caballerizas?.nombre||'').toLowerCase(), propietario_id:c.propietario_id}));
   }
```

### Recomendado además, por lo que costó encontrarlo

El error tragado es la razón por la que esto pasó desapercibido: la pantalla no dio ninguna
señal. Dos renglones más:

```diff
   if (!cobCaballerizas.length) {
-    const { data: cab } = await sb.from('caballeriza_responsables')
-      .select('propietario_id, caballerizas(nombre)').eq('es_titular', true).not('propietario_id','is',null);
+    const { data: cab, error: eCab } = await sb.from('caballeriza_responsables')
+      .select('propietario_id, caballerizas(nombre)').eq('rol','propietario').eq('activo', true).not('propietario_id','is',null);
+    if (eCab) console.error('[cobrosBuscar/caballerizas]', eCab);
     cobCaballerizas = (cab||[]).map(c=>({nombre:(c.caballerizas?.nombre||'').toLowerCase(), propietario_id:c.propietario_id}));
   }
```

Es el patrón que `CLAUDE.md` pide para consultas Supabase (*"nunca `.catch(()=>{})` silencioso"*).
Se deja en `console.error` y no en `toast` a propósito: es una lista auxiliar de búsqueda, no
la query principal; si falla, la pantalla debe seguir funcionando sin la resolución por
caballeriza en vez de tirarle un cartel de error a Valeria en medio de un cobro.

### Y las dos líneas de documentación

`docs/RESULTADO_BUSCADOR_LIQUIDACIONES.md:71` y `docs/RESULTADO_COBROS_V1_1.md:17` dicen
`es_titular`; pasan a decir `rol='propietario'`.

## Efecto esperado

| | antes | después |
|---|---|---|
| caballerizas buscables | **0** (la query falla) | **236** |
| los 40 provisorios de hoy | no aparecen | **aparecen** |
| copropietarios | — | siguen fuera (correcto) |
| señal cuando falla | ninguna | `console.error` |

**Sin cambios en la base.** Es sólo frontend, y la página es un HTML autocontenido: se
despliega con el push a `main`.

## Prueba después de aplicar

En Pagos, buscar por un nombre de caballeriza que hoy no devuelve nada — p. ej. **LA MILINGA**
o **RD NECOCHEA**, dos de los provisorios— y confirmar que aparece el beneficiario con su
deuda pagable. Antes del cambio, las dos dan "Sin deuda pagable para esa búsqueda" aunque la
deuda exista.

**Nada aplicado. Espera tu OK.**
