# Resoluciones — sacar el contador de Borrador

- Fecha: 2026-09-30
- Rama: `chore/resoluciones-sin-contador-borrador` — SHA `b8691aa98f6415d7c35743b65c78b36eb9df7de1` (base `main` 7e5fc99)
- PR: https://github.com/mdqclio/SGH/pull/27 — **sin merge** (despliega)
- Guards: pwd `/home/clio/dev/SGH` ✔ · ref `unlhcuanfrtpatoipwve` ✔ · `count(spcs)` = **212** ✘ (CLAUDE.md dice 210). No se escribió nada en la base, así que no bloquea; pero el baseline de CLAUDE.md quedó viejo (2 altas nuevas desde el 14/09, presumiblemente de Yesi por spcs.html — no verificado). No lo actualicé: la regla era tocar sólo resoluciones.html.

## 1. Base: resoluciones por estado (antes de tocar nada)

Query (solo lectura, MCP):
```sql
select 'spcs' as k, count(*)::text as v from spcs
union all select 'res_total', count(*)::text from resoluciones
union all select 'estado=' || coalesce(estado::text,'NULL'), count(*)::text from resoluciones group by estado
union all select 'club=' || coalesce(c.nombre,'NULL') || ' / ' || coalesce(r.estado::text,'NULL'), count(*)::text from resoluciones r left join clubs c on c.id=r.club_id group by c.nombre, r.estado
order by 1;
```
Salida:
```
[{"k":"club=Hipódromo de Dolores / notificada","v":"2"},{"k":"estado=notificada","v":"2"},{"k":"res_total","v":"2"},{"k":"spcs","v":"212"}]
```

| estado | cantidad |
|---|---|
| borrador | **0** |
| publicada | 0 |
| notificada | 2 (Dolores) |
| total | 2 |

Ninguna en borrador → se siguió con el cambio.

## 2. Cambio

```diff
diff --git a/resoluciones.html b/resoluciones.html
index 82288a6..ab16f5a 100644
--- a/resoluciones.html
+++ b/resoluciones.html
@@ -113,7 +113,6 @@
 <div class="content">
   <div class="stats-row">
     <div class="stat-chip"><div class="stat-chip-val" id="cnt-total">—</div><div class="stat-chip-lbl">Total</div></div>
-    <div class="stat-chip"><div class="stat-chip-val" id="cnt-borrador">—</div><div class="stat-chip-lbl">Borrador</div></div>
     <div class="stat-chip"><div class="stat-chip-val" id="cnt-publicadas">—</div><div class="stat-chip-lbl">Publicadas</div></div>
     <div class="stat-chip"><div class="stat-chip-val" id="cnt-notificadas">—</div><div class="stat-chip-lbl">Notificadas</div></div>
   </div>
@@ -221,7 +220,6 @@ async function load() {
 
 function updateStats() {
   document.getElementById('cnt-total').textContent = allData.length;
-  document.getElementById('cnt-borrador').textContent = allData.filter(r=>r.estado==='borrador').length;
   document.getElementById('cnt-publicadas').textContent = allData.filter(r=>r.estado==='publicada').length;
   document.getElementById('cnt-notificadas').textContent = allData.filter(r=>r.estado==='notificada').length;
 }
```

Nota: la línea JS usa `'cnt-borrador'` (comillas simples); si se sacaba sólo el div, `getElementById` devolvía null y `updateStats()` tiraba TypeError → no cargaba la pantalla. Se sacaron las dos.

## 3. Nada colgado

`git grep -n "cnt-borrador" chore/resoluciones-sin-contador-borrador`:
```
git grep exit 1
```
(exit 1 = cero resultados)

Lo que queda de `borrador` en resoluciones.html (intacto a propósito: estilos, filtro, select del form, badge, botón Publicar, default del form):
```
chore/resoluciones-sin-contador-borrador:resoluciones.html:44:    .card.borrador { border-left: 4px solid var(--muted); }
chore/resoluciones-sin-contador-borrador:resoluciones.html:51:    .badge-borrador { background: rgba(160,184,160,0.1); color: var(--muted); border: 1px solid rgba(160,184,160,0.3); }
chore/resoluciones-sin-contador-borrador:resoluciones.html:126:      <option value="borrador">Borrador</option>
chore/resoluciones-sin-contador-borrador:resoluciones.html:168:            <option value="borrador">Borrador</option>
chore/resoluciones-sin-contador-borrador:resoluciones.html:239:const estadoBadge = { borrador:'badge-borrador', publicada:'badge-publicada', notificada:'badge-notificada' };
chore/resoluciones-sin-contador-borrador:resoluciones.html:262:        ${r.estado==='borrador'?`<button class="btn-sm btn-pub" onclick="cambiarEstado('${r.id}','publicada')">📢 Publicar</button>`:''}
chore/resoluciones-sin-contador-borrador:resoluciones.html:286:  document.getElementById('f-estado-r').value = rec?.estado||'borrador';
```

Layout: `.stats-row { display:flex; gap:12px; flex-wrap:wrap }`, chips con `min-width:110px`. Sin grid de 4 columnas → con 3 chips se alinean a la izquierda igual que antes, sin huecos.

## 4. Chequeo ejecutable

`updateStats()` extraída del HTML por ancla (balance de llaves) y corrida con DOM stub (`getElementById` sólo de los `cnt-*` presentes en el HTML) y 4 filas (2 notificada, 1 publicada, 1 borrador). Script entero parseado con `new Function`. Mutante: main con sólo el div borrado.
```
== rama ==
scripts parse OK: 1
chips en HTML: cnt-total,cnt-publicadas,cnt-notificadas
valores: {"cnt-total":4,"cnt-publicadas":1,"cnt-notificadas":2}
exit 0
== main ==
scripts parse OK: 1
chips en HTML: cnt-total,cnt-borrador,cnt-publicadas,cnt-notificadas
valores: {"cnt-total":4,"cnt-borrador":1,"cnt-publicadas":1,"cnt-notificadas":2}
exit 0
== mutante (sólo div sacado) ==
scripts parse OK: 1
<anonymous_script>:5
  document.getElementById('cnt-borrador').textContent = allData.filter(r=>r.estado==='borrador').length;
                                                      ^

TypeError: Cannot set properties of null (setting 'textContent')
    at eval (eval at <anonymous> (file:///tmp/claude-1000/-home-clio-dev-SGH/6df04b77-3a2c-4f0d-9158-7e047bcd4d58/scratchpad/check.mjs:13:1), <anonymous>:5:55)
    at file:///tmp/claude-1000/-home-clio-dev-SGH/6df04b77-3a2c-4f0d-9158-7e047bcd4d58/scratchpad/check.mjs:13:40
    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:665:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5)

Node.js v22.22.1
exit 1
```
Rama: 3 contadores correctos. Mutante: TypeError → el chequeo discrimina. No hay browser (Chromium no corre acá); no hubo verificación visual.

## Pendiente
- Mergear PR #27 cuando des OK; después verificar md5 contra sigh.com.ar.
- Baseline de `spcs` en CLAUDE.md: 210 → 212 (fuera del alcance de este pedido).

## Verificación de push
```
$ git ls-remote origin chore/resoluciones-sin-contador-borrador
b8691aa98f6415d7c35743b65c78b36eb9df7de1	refs/heads/chore/resoluciones-sin-contador-borrador
$ git ls-remote origin reports   (commit del informe, antes de esta adenda)
de1971468abe547a8ab54cbc6deb2f6ad926907c	refs/heads/reports
```

Nota: la rama `reports` LOCAL de /home/clio/dev/SGH diverge de origin (tiene commits que origin no tiene, p.ej. cf8461c, dd2985f). No la toqué: este informe se publicó con cherry-pick sobre `origin/reports` desde un worktree. Ver si fue una reescritura de historia (¿auditoría PII?) antes de pushear desde esa local.
