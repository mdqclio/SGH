# Paso 5 — front de resultados (ISSUE-102 paso 3): fase 1, relevamiento (solo lectura)

- **Fecha**: 2026-10-02 · **Código leído**: `main` en `e82a5484898c2868f3fe1b248985f3ba69d07b50` (`resultados.html`, `resultados_legacy.html`,
  `migrations/aplicar_resultado_v2.sql`, `desoficializar_carrera_v2.sql`, `resultados_guard_cerrada.sql`)
- **Guards**: los del paso 1 ✅ · **Solo lectura**: no se tocó nada.

## Conclusión corta

1. **F10 manda a guardar como provisional también en la vista oficial.** El atajo de teclado (`resultados.html:1836`) llama a
   `aplicar(currentCarreraId,'provisional')` sin mirar qué vista está abierta. En la vista oficial (`renderOficial`) no hay marcador ni
   inputs: `aplicar()` arma el payload vacío, pregunta "¿marcarlos como no corrió?" por todos los ratificados y, si se acepta, la RPC v2
   lo rechaza con **P0089** (oficial → provisional). La base protege; la pantalla confunde y ofrece una acción que no tiene sentido ahí.
2. **Los bloqueos de la base se muestran crudos**: `toast('Error al guardar: ' + rpcErr.message)` (`:1582`). El texto de P0092 es largo y
   técnico ("aplicar_resultado: la liquidación de esta reunión está cerrada (saldada): … ISSUE-102"). No se distingue por `rpcErr.code`.
3. **La pantalla no sabe de antemano que la reunión está cerrada**: la lista de reuniones (`:506`) no trae `liquidacion_cerrada_at`, así que
   Aplicar/F10/Oficializar se ofrecen en una reunión cerrada y recién la base corta. (Des-oficializar sí lo consulta antes, `:1703`.)
4. **`resultados_legacy.html` sigue publicada** (HTTP 200 en `sigh.com.ar`), **ninguna pantalla la enlaza**, y escribe **directo** en
   `resultados`, `resultado_posiciones`, `performances` y `resultado_log`, sin pasar por las RPC: en una reunión **abierta** puede
   des-oficializar con un `UPDATE estado='provisional'` **sin** el chequeo de pagos emitidos de `desoficializar_carrera` y sin borrar
   `oficializado_*`. En reuniones cerradas la frena el trigger P0092. Es la deuda más concreta de las cuatro.

## Propuesta (fase 2, para confirmar)

| # | Cambio | Dónde |
|---|---|---|
| A | F10 sólo actúa en el formulario: si la carrera abierta es oficial, no hace nada (o avisa "la carrera está oficial: para corregirla, des-oficializala") | `keydown` (`:1833` a `:1840`) |
| B | Traer `liquidacion_cerrada_at` con las reuniones; en reunión cerrada: banner arriba, Aplicar/F10/Oficializar/Des-oficializar deshabilitados con el motivo | `:506`, `renderFormulario`, `renderOficial` |
| C | Mapear errores por código: **P0092** → "La liquidación de esta reunión está cerrada: el resultado no se puede cambiar. Si un fallo obliga, lo corrige un super_admin con la resolución."; **P0089** → "La carrera está oficial: des-oficializala primero."; resto, como hoy | `aplicar()` (`:1580`), `desoficializar()` (`:1715`) |
| D | **Baja de `resultados_legacy.html`**: borrar el archivo (Pages deja de servirlo → 404). Antes: confirmar que nadie la usa (no hay enlaces; ver probes que la nombran en comentarios: `probe_cuerpos_oficial`). ISSUE-046 se cierra con la baja | repo |

Probe: jsdom + `sb` stub sobre `resultados.html` real (F10 en vista oficial → 0 llamadas a la RPC; P0092/P0089 → toast con el texto mapeado;
reunión cerrada → botones deshabilitados) con mutantes; y un assert de que `resultados_legacy.html` no existe en el repo.

## Preguntas

1. ¿La baja de la legacy es borrar el archivo (404) o dejar una página que diga "esta pantalla ya no se usa → Resultados"?
2. En reunión cerrada, ¿se esconde Des-oficializar o se muestra deshabilitado con el motivo?

## Evidencia (`main` en `e82a548…`)

```
$ grep -n (F10 / aplicar / oficial / P0092 / liquidacion_cerrada) resultados.html
506:    sb.from('reuniones').select('id,numero,fecha,estado,hipodromos(nombre)').eq('club_id', CLUB_ID).order('fecha', {ascending:false}),
604:  if (res?.estado==='oficial') renderOficial(carrera, res, pos, apus, insc);
605:  else                          renderFormulario(carrera, res, pos, apus, insc);
745:function renderFormulario(carrera, res, pos, apus, insc) {
909:              <button class="btn-primary" onclick="aplicar('${carrera.id}','provisional')">Aplicar <kbd>F10</kbd></button>
923:            <span id="status-txt">${res ? 'Resultado cargado. Aplicar con F10.' : 'Sin resultado previo. Cargá el marcador y apretá Aplicar.'}</span>
1377:   GUARDAR (F10-Aplicar)
1488:async function aplicar(carreraId, estado) {
1619:// Oficializar carrera (2bis): marca oficial (reusá aplicar_resultado vía aplicar()) + genera
1659:  await aplicar(carreraId, 'oficial');
1667:  const { data: reun } = await sb.from('reuniones').select('fecha,hipodromos(nombre,sigla)').eq('id', rid).single();
1702:  const { data: reuCierre } = await sb.from('reuniones').select('*').eq('id', ridCierre).single();
1703:  if (reuCierre?.liquidacion_cerrada_at) { toast('La liquidación de esta reunión está cerrada (saldada): no se puede des-oficializar.', 'error', 9000); return; }
1729:function renderOficial(carrera, res, pos, apus, insc) {
1836:  if (e.key==='F10')      { e.preventDefault(); if (currentCarreraId) aplicar(currentCarreraId,'provisional'); }

$ sed -n 1833,1840p resultados.html
document.addEventListener('keydown', e => {
  if (e.key==='F8')       { e.preventDefault(); if (currentCarreraId) f8Dividendos(); }
  if (e.key==='F9')       { e.preventDefault(); if (currentCarreraId) cancelar(currentCarreraId); }
  if (e.key==='F10')      { e.preventDefault(); if (currentCarreraId) aplicar(currentCarreraId,'provisional'); }
  if (e.key==='PageDown') { e.preventDefault(); navCarrera(1); }
  if (e.key==='PageUp')   { e.preventDefault(); navCarrera(-1); }
});


$ sed -n 1580,1590p resultados.html   # manejo del error de aplicar_resultado
1585:  if (rpcErr) {
1586-    if (rpcErr.message?.includes('CONCURRENT_MODIFICATION')) {
1587-      toast('Otro operador modificó este resultado. Recargá antes de guardar.', 'error');
1588-    } else {
1589-      toast('Error al guardar: ' + rpcErr.message, 'error');
1590-    }
1591-    return;
1592-  }
1593-

$ git grep -n "resultados_legacy" main -- '*.html' '*.js'      # ninguna pantalla la enlaza
(sin salida)
$ curl -s -o /dev/null -w "%{http_code}" https://sigh.com.ar/resultados_legacy.html
200
$ git show main:resultados_legacy.html | grep -nE "\.from\('[a-z_]+'\)\.(insert|update|delete|upsert)"
595:    const { data, error } = await sb.from('resultados').insert(resPayload).select().single();
600:    const { error } = await sb.from('resultados').update(resPayload).eq('id', resId);
630:    await sb.from('resultado_posiciones').delete().eq('resultado_id', resId);
631:    const { error } = await sb.from('resultado_posiciones').insert(posData);
656:    await sb.from('performances').delete().eq('carrera_id', carreraId);
657:    await sb.from('performances').insert(perfInserts);
661:  await sb.from('resultado_log').insert({ resultado_id: resId, usuario_id: currentUser?.id, accion: 'oficializar', datos_despues: { estado: 'oficial', fecha: new Date().toISOSt
671:  await sb.from('resultado_log').insert({ resultado_id: resId, usuario_id: currentUser?.id, accion: 'modificar_despues_oficial', datos_antes: resBefore, datos_despues: { motivo
672:  const { error } = await sb.from('resultados').update({ estado: 'provisional' }).eq('id', resId);

$ grep -n "RAISE EXCEPTION" migrations/aplicar_resultado_v2.sql migrations/desoficializar_carrera_v2.sql   (extracto)
aplicar_resultado_v2.sql:72      … 'aplicar_resultado: la liquidación de esta reunión está cerrada (saldada): el resultado de la carrera % no se puede modificar. Si un fallo (p. ej. de doping) obliga a cambiarlo, lo corrige un super_admin con la resolución. ISSUE-102' USING ERRCODE = 'P0092'
aplicar_resultado_v2.sql:94      … 'aplicar_resultado: la carrera % está oficial; para corregirla, des-oficializala primero (botón Des-oficializar). ISSUE-089' USING ERRCODE = 'P0089'
desoficializar_carrera_v2.sql:55 … 'desoficializar_carrera: la liquidación de esta reunión está cerrada (saldada): la carrera % no se puede des-oficializar. …' USING ERRCODE = 'P0092'
```

## Verificación de push

Chequeo de datos personales sobre lo agregado (los cinco informes de los pasos 1 a 5): 1 coincidencia en la primera pasada (un rango de
números de línea del paso 5 escrito con guion, reescrito con "a"); segunda pasada **0**. Nombres de personas en lo agregado: **0**. La
contraseña del rol en lo agregado: **0**.

```
$ git push -q origin HEAD:reports && git ls-remote origin reports && git rev-parse HEAD
64b6fee87cdaa025b7b7fe965e75df3b0a20abc4	refs/heads/reports
64b6fee87cdaa025b7b7fe965e75df3b0a20abc4
```

Este anexo va en un commit posterior; su SHA es el tip de `origin/reports`.
