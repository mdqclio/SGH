# Jockey repetido en la misma carrera — relevamiento (pedido de Yesi, 12/09/2026)

- **Fecha:** 2026-09-12
- **Rama relevada:** `main` @ `e95188471f8b52b4d771d982c0783a34f5d942e6` (código leído en `main`; informe en `reports`)
- **Guards:** `pwd` `/home/clio/dev/SGH` ✔ · `count(spcs)` **205** ✔ · ref `unlhcuanfrtpatoipwve` ✔
- **Alcance:** SOLO LECTURA. Sin cambios de código ni de base.
- **Numeración:** uso el `reuniones.numero` interno (R6 = 20/06, R7 = cancelada, R8 = 16/08, R9 = 20/09).
  El `numero_publico` va corrido: R8 interna = "Reunión 7" pública, R9 = "Reunión 8" pública.

---

## 0. Respuesta corta

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Se valida hoy? | **Ningún bloqueo en ningún lado.** Un solo **aviso visual**, en `ratificacion.html` (`⚠ dup.` + fila naranja, `:619-633` y `:813-835`, desde `d89fd20` 2026-05-15). Ni la base (sin constraint/trigger), ni el modal de inscripción, ni el portal/RPC, ni Montas, ni el gate de oficializar lo miran. El aviso de ratificación además **cuenta forfaits y mal inscriptos**: 7 de los 8 casos históricos son "uno corrió + uno borrado", que no es colisión. |
| 2 | R9 hoy | **4 turnos, 10 inscripciones, todas `inscripto`:** T2 GONZALEZ LUCAS ×3 (DEL CAMPEON, OLA DOCTOR, TOUCH OF BLUE); T5 CANTO TOBIAS ×2 (AMIGUITO JESUS, KUCCINI); T10 AGUIRRE HUGO ×3 (ABARAJALA, BABY PARADISE, INDIANA MARO); T11 CANTO TOBIAS ×2 (DESTINADO JOHAN, HEART OF GOLD). Es la etapa de inscripción: el compromiso de monta se cierra en la ratificación (Fede 25/08). |
| 3 | R6/R7/R8 | R7: cancelada, 0 inscripciones. **8 grupos** en R6+R8: **7 son forfait/mal_inscrito + ratificado** (no llegaron a correr los dos). **1 caso llegó con los dos ratificados: R8 T5 (carrera 4), AGUIRRE HUGO — NOCHE EN VELA (ratificado, NO LARGÓ) y LA LAGUNERA J (5°).** La auditoría muestra que a LA LAGUNERA J se le cargó Aguirre el **17/08 23:13, el día después de la carrera** (backfill de montas), y a NOCHE EN VELA nunca se le sacó. Es el caso legítimo: el jockey cambió de caballo porque el suyo no largó. **Un bloqueo duro habría frenado ese backfill.** |
| 4 | "DOBLE MONTA" | **No existe como campo ni concepto en el sistema.** En la planilla de Yesi de R6 significaba **dos jockeys declarados para UN caballo** (`DOBLE MONTA (DIESTRA PEDRO / DELLI QUADRI IGNACIO)` en PORTEÑO Y BAILARIN, T6), no un jockey en dos caballos. El script de carga lo salteó y Yesi lo resolvió a mano. Lo más cercano es `jockey_suplente_id` (titular + suplente), pero semánticamente es otra cosa (suplente = reemplazo, no "indeciso entre dos"). Uso real del suplente: **0 en R6–R9** (0/312). |
| 5 | Dónde se elige jockey | **5 puntos de escritura**, ninguno con la validación: (a) `inscripciones.html` modal, `:826-827`; (b) `portal.html` al anotar, `:963-989` → RPC `rpc_inscribir` (`migrations/portal_monta_al_anotar.sql:144-166`, valida padrón y titular≠suplente, nada más); (c) `ratificacion.html` select por fila, `:837-871` (aviso); (d) `resultados.html` modal Montas, `:1977-2073`; (e) SQL a mano (`migrations/montas_r6_correccion.sql`, backfills de R6/R8). |
| — | ¿Bloqueo o aviso? | **Aviso, en los 4 puntos de UI, contando sólo activos (inscripto + ratificado). No bloqueo.** Detalle en §7. Si Fede quiere un bloqueo, el único lugar defendible es el botón **Ratificar** del segundo caballo cuando ya hay uno **ratificado** con ese jockey — y Montas tiene que quedar libre (caso R8 T5). |

---

## 1. ¿Se valida hoy en algún lado?

### 1a. Base de datos — constraints, índices y triggers de `inscripciones`

```sql
select 'constraint' as tipo, conname as nombre, pg_get_constraintdef(oid) as def
from pg_constraint where conrelid = 'public.inscripciones'::regclass
union all
select 'index', indexname, indexdef from pg_indexes where schemaname='public' and tablename='inscripciones'
union all
select 'trigger', tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.inscripciones'::regclass and not tgisinternal
order by 1, 2;
```

```
constraint  inscripciones_caballeriza_id_fkey     FOREIGN KEY (caballeriza_id) REFERENCES caballerizas(id)
constraint  inscripciones_carrera_id_fkey         FOREIGN KEY (carrera_id) REFERENCES carreras(id) ON DELETE CASCADE
constraint  inscripciones_carrera_id_spc_id_key   UNIQUE (carrera_id, spc_id)
constraint  inscripciones_entrenador_id_fkey      FOREIGN KEY (entrenador_id) REFERENCES profesionales(id)
constraint  inscripciones_inscripto_por_fkey      FOREIGN KEY (inscripto_por) REFERENCES usuarios(id)
constraint  inscripciones_jockey_suplente_id_fkey FOREIGN KEY (jockey_suplente_id) REFERENCES profesionales(id)
constraint  inscripciones_jockey_titular_id_fkey  FOREIGN KEY (jockey_titular_id) REFERENCES profesionales(id)
constraint  inscripciones_peso_balanza_rango      CHECK (((peso_balanza IS NULL) OR ((peso_balanza >= (300)::numeric) AND (peso_balanza <= (600)::numeric))))
constraint  inscripciones_pkey                    PRIMARY KEY (id)
constraint  inscripciones_propietario_id_fkey     FOREIGN KEY (propietario_id) REFERENCES propietarios(id)
constraint  inscripciones_ratificado_por_fkey     FOREIGN KEY (ratificado_por) REFERENCES usuarios(id)
constraint  inscripciones_spc_id_fkey             FOREIGN KEY (spc_id) REFERENCES spcs(id)
index       idx_inscripciones_carrera             CREATE INDEX idx_inscripciones_carrera ON public.inscripciones USING btree (carrera_id)
index       idx_inscripciones_spc                 CREATE INDEX idx_inscripciones_spc ON public.inscripciones USING btree (spc_id)
index       inscripciones_carrera_id_spc_id_key   CREATE UNIQUE INDEX inscripciones_carrera_id_spc_id_key ON public.inscripciones USING btree (carrera_id, spc_id)
index       inscripciones_pkey                    CREATE UNIQUE INDEX inscripciones_pkey ON public.inscripciones USING btree (id)
index       ux_insc_partidor_carrera              CREATE UNIQUE INDEX ux_insc_partidor_carrera ON public.inscripciones USING btree (carrera_id, numero_partidor) WHERE (numero_partidor IS NOT NULL)
trigger     trg_audit_inscripciones               CREATE TRIGGER trg_audit_inscripciones AFTER INSERT OR DELETE OR UPDATE ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()
trigger     trg_insc_set_propietario              CREATE TRIGGER trg_insc_set_propietario BEFORE INSERT OR UPDATE OF caballeriza_id ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION fn_inscripcion_set_propietario()
trigger     trg_inscripciones_updated_at          CREATE TRIGGER trg_inscripciones_updated_at BEFORE UPDATE ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION set_updated_at()
```

Nada sobre `jockey_titular_id` más que la FK. Sí hay unicidad de **caballo** por carrera y de **gatera** por
carrera — el jockey no tiene el equivalente.

### 1b. Al inscribir — `inscripciones.html`, `saveRecord()` (`sed -n 813,836p`)

```
813 async function saveRecord() {
814   const spcId = document.getElementById('f-spc-id').value;
815   if (!spcId || !currentCarreraId) { toast('Seleccionar un SPC','error'); return; }
816   const cabId = document.getElementById('f-caballeriza').value || null;
817   if (!cabId && !confirm('Esta inscripción no tiene caballeriza asignada.\nSin caballeriza no se podrá ratificar ni derivar el propietario.\n¿Continuar igual?')) return;
818   const btn=document.getElementById('btn-save');
819   btn.disabled=true; btn.textContent='Guardando…';
820   const id=document.getElementById('f-id').value;
821   const payload = {
822     carrera_id: currentCarreraId,
823     spc_id: spcId,
824     caballeriza_id: cabId,
825     entrenador_id: document.getElementById('f-entrenador').value || null,
826     jockey_titular_id: document.getElementById('f-jockey-titular').value || null,
827     jockey_suplente_id: document.getElementById('f-jockey-suplente').value || null,
828     peon: document.getElementById('f-peon').value.trim() || null,
829     capataz: document.getElementById('f-capataz').value.trim() || null,
830     sereno: document.getElementById('f-sereno').value.trim() || null,
831     certificado_correr: document.getElementById('f-certificado').checked,
832     // Se guarda en mayúsculas: el programa lo imprime tal cual, y "DEBUTA"
833     // es un valor válido que tiene que salir uniforme con los códigos.
834     performance: document.getElementById('f-performance').value.trim().toUpperCase() || null,
835     estado: document.getElementById('f-estado').value,
836     motivo_estado: document.getElementById('f-motivo-forfait').value.trim() || null,
```

Única validación: SPC elegido y confirm por caballeriza vacía. El jockey va tal cual, ni siquiera se chequea
titular ≠ suplente (eso sólo lo hace el RPC del portal).

### 1c. Al inscribir desde el portal — `portal.html` + RPC `rpc_inscribir`

`portal.html:966-967`: *"El jockey NO se pide acá: el compromiso de monta va hasta el martes y se cierra en la
ratificación (Fede, 25/08/2026)."* — el jockey es opcional. Validaciones del RPC
(`migrations/portal_monta_al_anotar.sql:143-166`):

```
143   -- Jockey OPCIONAL al anotar. Si viene, tiene que ser del padrón.
144   IF p_jockey_titular_id IS NOT NULL
145      AND NOT EXISTS (
146        SELECT 1 FROM profesionales
147         WHERE id = p_jockey_titular_id AND activo
148           AND tipo IN ('jockey', 'ambos') AND club_id = v_club_id
149      )
150   THEN
151     RAISE EXCEPTION 'El jockey declarado no está en el padrón activo de este hipódromo.';
152   END IF;
153
154   IF p_jockey_suplente_id IS NOT NULL THEN
155     IF p_jockey_titular_id IS NULL THEN
156       RAISE EXCEPTION 'No se puede declarar un suplente sin jockey titular.';
157     END IF;
158     IF p_jockey_suplente_id = p_jockey_titular_id THEN
159       RAISE EXCEPTION 'El suplente no puede ser el mismo jockey que el titular.';
160     END IF;
161     IF NOT EXISTS (
162       SELECT 1 FROM profesionales
163        WHERE id = p_jockey_suplente_id AND activo
164          AND tipo IN ('jockey', 'ambos') AND club_id = v_club_id
165     ) THEN
166       RAISE EXCEPTION 'El jockey suplente no está en el padrón activo de este hipódromo.';
```

Padrón y titular≠suplente. Nada sobre otros caballos del turno.

### 1d. Al ratificar — `ratificacion.html` (el único control que existe: AVISO)

```
617     const carCerrada = isCerrada || car.estado === 'confirmada' || car.estado === 'anulada';
618     const jockeyCount = {};
619     insc.forEach(i => { if (i.jockey_titular_id) jockeyCount[i.jockey_titular_id] = (jockeyCount[i.jockey_titular_id]||0)+1; });
...
627       const hasColision = !carCerrada && !!i.jockey_titular_id && jockeyCount[i.jockey_titular_id] >= 2;
...
629       return `<tr id="row-${i.id}" data-carrera="${car.id}" data-jockey="${i.jockey_titular_id||''}" data-caballeriza="${i.caballeriza_id||''}" class="${isRat?'':'no-ratificado'}${hasColision?' jockey-duplicado':''}">
...
633         <td class="jockey-cell">${buildJockeySelect(i, carCerrada)}${hasColision?'<span class="badge-jockey-dup">⚠ dup.</span>':''}</td>
```

```
813 function recalcJockeyColisiones(carreraId) {
814   const sec = document.getElementById(`csec-${carreraId}`);
815   if (!sec) return;
816   const conteo = {};
817   sec.querySelectorAll('.jockey-select').forEach(sel => {
818     if (sel.value) conteo[sel.value] = (conteo[sel.value]||0)+1;
819   });
820   sec.querySelectorAll('.jockey-select').forEach(sel => {
821     const row = sel.closest('tr');
822     const cell = sel.closest('.jockey-cell');
823     if (!row || !cell) return;
824     const hasColision = !!sel.value && conteo[sel.value] >= 2;
825     row.classList.toggle('jockey-duplicado', hasColision);
826     let badge = cell.querySelector('.badge-jockey-dup');
827     if (hasColision && !badge) {
828       badge = document.createElement('span');
829       badge.className = 'badge-jockey-dup';
830       badge.textContent = '⚠ dup.';
831       cell.appendChild(badge);
832     } else if (!hasColision && badge) {
833       badge.remove();
834     }
835   });
836 }
```

```
857 async function onJockeyChange(sel) {
858   const inscId = sel.dataset.insc;
859   const jockeyId = sel.value || null;
860   const { error } = await sb.from('inscripciones').update({ jockey_titular_id: jockeyId }).eq('id', inscId);
...
869   if (carreraId) recalcJockeyColisiones(carreraId);
```

```
897 async function ratificar(inscId) {
898   const row = document.getElementById(`row-${inscId}`);
899   const pesoEl = document.getElementById(`peso-${inscId}`);
900   const peso = parseFloat(pesoEl?.value) || null;
901   const { error } = await sb.from('inscripciones').update({ estado:'ratificado', peso_final: peso }).eq('id', inscId);
```

Observaciones:

- **Es aviso, no bloqueo**: el UPDATE del jockey (`:860`) y el de ratificar (`:901`) salen igual.
  Documentado así en `docs/ESTADO.md:227` y `docs/SESION_2026-05-15.md:83` ("visual, no bloqueante").
- **Cuenta todos los estados** (`insc` = todas las filas del turno, `:619`; los selects de todas las filas,
  `:817`). Un forfait con jockey X + un ratificado con jockey X → los dos con `⚠ dup.`. Es el 7/8 de los
  casos históricos (§3): el aviso está gritando por no-colisiones.
- **Se apaga con la carrera cerrada** (`!carCerrada`, `:627`) — después de las 12:00 del día de reunión no
  se ve más, justo cuando Montas empieza a escribir.
- `ratificar()` exige jockey (botón deshabilitado sin jockey, `:888` y `:938`) — pero sólo en el re-render
  de `onJockeyChange`/`volverInscripto`; en el render inicial (`:640-641`) el botón sale habilitado aunque
  no haya jockey. No es el tema de este informe; lo anoto porque cualquier gate nuevo iría en el mismo
  lugar y conviene unificar.

Historia:

```
$ git log --format='%h %ad %s' --date=short -S"jockey-duplicado" -- ratificacion.html | tail -1
d89fd20 2026-05-15 feat(ratificados): alerta de colisión de jockey por carrera
```

### 1e. Al oficializar — `resultados.html`, gate de `oficializar()` (`:1620-1638`)

```
1620   // ═══ GATE MONTAS — INICIO (el probe extrae este bloque por estas anclas) ═══
1621   // Sin jockey no se oficializa. El motor descarta la línea en SILENCIO
...
1629   const faltanMontas = montasFaltantes(carreraId);
1630   if (faltanMontas.length) {
1631     const lista = faltanMontas.map(n => `  • ${n}`).join('\n');
1632     const msg = `No se puede oficializar: ${faltanMontas.length} caballo(s) que largaron no tienen jockey cargado.\n\n${lista}\n\n`
...
1638   // ═══ GATE MONTAS — FIN ═══
```

Bloquea **jockey vacío** en los que largaron. No mira repetidos. El modal Montas (`:1977-2073`) tampoco:
`saveMontas()` (`:2046`) hace un UPDATE por fila, sin cruzar filas.

### 1f. Barrido de docs

```
$ grep -rn -i "colisión de jockey\|colision de jockey\|jockey-duplicado\|mismo jockey\|jockey repetido\|doble monta" docs/*.md CHANGELOG.md CLAUDE.md
docs/ESTADO.md:227:  - Alerta de colisión de jockey: filas con mismo jockey en carrera se marcan ⚠ dup. (visual, no bloqueante)
docs/REGLA_INSCRIPCION_MULTITURNO.md:169:y pinta la fila con la clase `jockey-duplicado` más un badge `⚠ dup.`. Es un aviso visual, no bloquea.
docs/REGLA_INSCRIPCION_MULTITURNO.md:217:   **avisa**. Precedente en la casa: la colisión de jockeys avisa y deja seguir. El dato para
docs/SESION_2026-05-15.md:5:Sesión de noche en modo autónomo. Dos frentes: (1) verificación y merge de Tanda 4 de Ratificados (refactor de DB + 3 features: cierre por hora, congelamiento de peso, alerta de colisión d
docs/SESION_2026-05-15.md:35:| `d89fd20` | feat(ratificados): alerta de colisión de jockey por carrera |
docs/SESION_2026-05-15.md:83:### Feature 3: Alerta de colisión de jockey
```

`docs/REGLA_INSCRIPCION_MULTITURNO.md:216-217` ya dejó planteada la misma pregunta bloqueo/aviso para el
caballo doble-ratificado, con el jockey como precedente: *"la colisión de jockeys avisa y deja seguir"*.

---

## 2 y 3. Casos reales — R6, R7, R8, R9

### Conteo base

```sql
select r.numero, r.numero_publico, r.estado, count(i.id) as inscripciones, count(i.jockey_titular_id) as con_jockey
from reuniones r left join carreras c on c.reunion_id = r.id left join inscripciones i on i.carrera_id = c.id
where r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' and r.numero in (6,7,8,9)
group by r.numero, r.numero_publico, r.estado order by r.numero;
```

```
numero  numero_publico  estado      inscripciones  con_jockey
6       6               borrador    125            87
7       null            cancelada   0              0
8       7               finalizada  106            93
9       8               publicada   81             58
```

R7 se canceló sin inscripciones: no hay nada que mirar.

### Script (solo lectura, corrido desde `tests/` y borrado)

```js
import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://unlhcuanfrtpatoipwve.supabase.co', process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const { count } = await sb.from('spcs').select('id', { count: 'exact', head: true });
console.log('guard spcs count =', count);
const { data: reus, error: e1 } = await sb.from('reuniones').select('id,numero,numero_publico,fecha,estado').eq('club_id', CLUB).in('numero', [6,7,8,9]).order('numero');
if (e1) throw e1;
console.log('\nreuniones:'); reus.forEach(r => console.log('  ', r.numero, r.numero_publico, r.fecha, r.estado, r.id));
const { data: insc, error: e2 } = await sb.from('inscripciones')
  .select('id, estado, numero_partidor, jockey_titular_id, jockey_suplente_id, created_at, spcs(nombre), carreras!inner(id, numero_turno, numero_carrera_programa, estado, reunion_id, reuniones!inner(numero))')
  .in('carreras.reunion_id', reus.map(r => r.id));
if (e2) throw e2;
const profIds = [...new Set(insc.flatMap(i => [i.jockey_titular_id, i.jockey_suplente_id]).filter(Boolean))];
const { data: profs } = await sb.from('profesionales').select('id, apellido, nombre, tipo').in('id', profIds);
const P = Object.fromEntries((profs||[]).map(p => [p.id, `${p.apellido}, ${p.nombre}`]));
// resultados para saber qué corrió
const carIds = [...new Set(insc.map(i => i.carreras.id))];
const { data: res } = await sb.from('resultados').select('id, carrera_id, estado').in('carrera_id', carIds);
const resByCar = Object.fromEntries((res||[]).map(r => [r.carrera_id, r]));
const { data: pos } = await sb.from('resultado_posiciones').select('inscripcion_id, posicion, no_largo, resultado_id').in('resultado_id', (res||[]).map(r => r.id));
const posByInsc = Object.fromEntries((pos||[]).map(p => [p.inscripcion_id, p]));

console.log('\ntotal inscripciones R6-R9:', insc.length, '| con jockey titular:', insc.filter(i=>i.jockey_titular_id).length);
// agrupar por carrera + jockey titular
const grupos = {};
for (const i of insc) {
  if (!i.jockey_titular_id) continue;
  const k = `${i.carreras.reunion_id}|${i.carreras.id}|${i.jockey_titular_id}`;
  (grupos[k] ||= []).push(i);
}
const dups = Object.values(grupos).filter(g => g.length >= 2).sort((a,b) => a[0].carreras.reuniones.numero - b[0].carreras.reuniones.numero || a[0].carreras.numero_turno - b[0].carreras.numero_turno);
console.log('\n=== MISMO JOCKEY TITULAR EN ≥2 CABALLOS DEL MISMO TURNO (cualquier estado) ===');
console.log('grupos:', dups.length);
for (const g of dups) {
  const c = g[0].carreras; const r = resByCar[c.id];
  console.log(`\nR${c.reuniones.numero} T${c.numero_turno}${c.numero_carrera_programa ? ` (carrera ${c.numero_carrera_programa})` : ''} carrera.estado=${c.estado} resultado=${r ? r.estado : '—'} — JOCKEY: ${P[g[0].jockey_titular_id] || g[0].jockey_titular_id}`);
  for (const i of g) {
    const p = posByInsc[i.id];
    const corrio = p ? (p.no_largo ? 'NO LARGÓ' : `pos ${p.posicion}`) : (r ? 'sin fila en posiciones' : '—');
    console.log(`     ${String(i.spcs?.nombre).padEnd(24)} estado=${i.estado.padEnd(12)} gatera=${String(i.numero_partidor ?? '—').padEnd(3)} suplente=${(P[i.jockey_suplente_id]||'—').padEnd(24)} corrió: ${corrio}   insc ${i.id}`);
  }
  const activos = g.filter(i => i.estado === 'ratificado' || i.estado === 'inscripto');
  const corrieron = g.filter(i => posByInsc[i.id] && !posByInsc[i.id].no_largo);
  console.log(`     → activos (inscripto/ratificado): ${activos.length} | efectivamente corrieron: ${corrieron.length}`);
}
// titular de uno = suplente de otro, mismo turno
console.log('\n=== TITULAR DE UN CABALLO = SUPLENTE DE OTRO, MISMO TURNO ===');
let n = 0;
const byCar = {};
insc.forEach(i => (byCar[i.carreras.id] ||= []).push(i));
for (const [cid, arr] of Object.entries(byCar)) {
  for (const a of arr) for (const b of arr) {
    if (a.id !== b.id && a.jockey_titular_id && a.jockey_titular_id === b.jockey_suplente_id) {
      n++; const c = a.carreras;
      console.log(`  R${c.reuniones.numero} T${c.numero_turno}: ${P[a.jockey_titular_id]} titular de ${a.spcs?.nombre} (${a.estado}) y suplente de ${b.spcs?.nombre} (${b.estado})`);
    }
  }
}
console.log('casos:', n);
// R9 detalle: jockeys cargados por turno
console.log('\n=== R9: inscriptos con jockey titular, por turno ===');
const r9 = insc.filter(i => i.carreras.reuniones.numero === 9).sort((a,b)=>a.carreras.numero_turno-b.carreras.numero_turno || (a.spcs?.nombre||'').localeCompare(b.spcs?.nombre||'','es'));
let t = null;
for (const i of r9) {
  if (i.carreras.numero_turno !== t) { t = i.carreras.numero_turno; console.log(`\n  T${t}`); }
  console.log(`     ${String(i.spcs?.nombre).padEnd(24)} ${i.estado.padEnd(12)} titular=${(P[i.jockey_titular_id]||'—').padEnd(26)} suplente=${P[i.jockey_suplente_id]||'—'}`);
}
```

### Salida completa

```
guard spcs count = 205

reuniones:
   6 6 2026-06-20 borrador b02ca761-6f44-4720-86aa-a3c3099019ea
   7 null 2026-07-19 cancelada 7b83f624-374d-471d-a716-5310b7dbef6e
   8 7 2026-08-16 finalizada 7b6e003e-22e2-4629-bf55-f18560b1260f
   9 8 2026-09-20 publicada cafa37d6-89f4-45cb-a0d9-835bc27407e9

total inscripciones R6-R9: 312 | con jockey titular: 238

=== MISMO JOCKEY TITULAR EN ≥2 CABALLOS DEL MISMO TURNO (cualquier estado) ===
grupos: 12

R6 T9 (carrera 7) carrera.estado=abierta resultado=oficial — JOCKEY: PRESA, DANIEL
     DARIN                    estado=forfait      gatera=—   suplente=—                        corrió: sin fila en posiciones   insc 699d7bb0-8c61-48ea-b5cc-ed0242058df3
     LA DIVERTENTE            estado=ratificado   gatera=12  suplente=—                        corrió: pos 6   insc dc3ba066-b75f-46c9-a050-c90b0499540f
     → activos (inscripto/ratificado): 1 | efectivamente corrieron: 1

R8 T2 (carrera 1) carrera.estado=confirmada resultado=oficial — JOCKEY: LOPEZ, ALEXIS
     WILSON SECURITY          estado=ratificado   gatera=10  suplente=—                        corrió: pos 3   insc a350dec5-fb11-4183-984a-ac0b7286a8f3
     MAC VITAL                estado=forfait      gatera=—   suplente=—                        corrió: sin fila en posiciones   insc 89bdc271-8465-4cc4-a296-60bf9460b3d1
     → activos (inscripto/ratificado): 1 | efectivamente corrieron: 1

R8 T3 (carrera 7) carrera.estado=confirmada resultado=oficial — JOCKEY: GONZALEZ, LUCAS
     DESDEN                   estado=ratificado   gatera=2   suplente=—                        corrió: pos 1   insc d3ede44c-cad4-4c14-8350-20508dee9573
     TOUCH OF BLUE            estado=forfait      gatera=—   suplente=—                        corrió: sin fila en posiciones   insc 040a12ea-ca51-46cb-a1db-f7b695279d3e
     → activos (inscripto/ratificado): 1 | efectivamente corrieron: 1

R8 T5 (carrera 4) carrera.estado=confirmada resultado=oficial — JOCKEY: AGUIRRE, HUGO
     NOCHE EN VELA            estado=ratificado   gatera=4   suplente=—                        corrió: NO LARGÓ   insc 12913afb-e303-4d03-bb60-a272c3ed88e3
     LA LAGUNERA J            estado=ratificado   gatera=2   suplente=—                        corrió: pos 5   insc 4370d235-6dd9-479a-b7af-cd7c4d81c82f
     → activos (inscripto/ratificado): 2 | efectivamente corrieron: 1

R8 T5 (carrera 4) carrera.estado=confirmada resultado=oficial — JOCKEY: DELLI QUADRI, IGNACIO DANIEL
     WISLA KEN                estado=mal_inscrito gatera=—   suplente=—                        corrió: sin fila en posiciones   insc df7f1abc-516b-4ad9-94f0-e556bb4f2092
     CONI ROSE                estado=ratificado   gatera=8   suplente=—                        corrió: pos 4   insc 8236d271-dabb-47b8-8afb-1ee292b047c3
     → activos (inscripto/ratificado): 1 | efectivamente corrieron: 1

R8 T8 (carrera 8) carrera.estado=confirmada resultado=oficial — JOCKEY: PRESA, DANIEL
     LA DIVERTENTE            estado=forfait      gatera=—   suplente=—                        corrió: sin fila en posiciones   insc b80ff27e-b55b-4306-bbe9-a357d975a43d
     LE BATEAU                estado=ratificado   gatera=6   suplente=—                        corrió: pos 2   insc bde2d35b-bf27-4a47-8bed-c2a606e3fd55
     → activos (inscripto/ratificado): 1 | efectivamente corrieron: 1

R8 T10 (carrera 5) carrera.estado=confirmada resultado=oficial — JOCKEY: TORRES, ANIBAL
     GINIYA GOOD              estado=forfait      gatera=—   suplente=—                        corrió: sin fila en posiciones   insc 39b7f734-4f43-414c-903c-4a64f5bd88d2
     Icy Tom                  estado=ratificado   gatera=6   suplente=—                        corrió: pos 8   insc fe8a3a29-ef2a-472f-8708-2f2de495d4e7
     → activos (inscripto/ratificado): 1 | efectivamente corrieron: 1

R8 T11 (carrera 6) carrera.estado=confirmada resultado=oficial — JOCKEY: CONTRERAS, JUAN CRUZ
     INDIO VALIDO             estado=forfait      gatera=—   suplente=—                        corrió: sin fila en posiciones   insc 8f719d2a-dc35-4e4c-b1a2-13e0be328766
     TATA FOOT                estado=ratificado   gatera=1   suplente=—                        corrió: pos 5   insc 48700371-5561-4f23-bc33-6766dccdc33e
     → activos (inscripto/ratificado): 1 | efectivamente corrieron: 1

R9 T2 carrera.estado=abierta resultado=— — JOCKEY: GONZALEZ, LUCAS
     DEL CAMPEON              estado=inscripto    gatera=—   suplente=—                        corrió: —   insc ad51bb19-e625-4f7c-b80c-e58dca74202f
     TOUCH OF BLUE            estado=inscripto    gatera=—   suplente=—                        corrió: —   insc d12a65ce-1066-4d9e-91da-1094206a0520
     OLA DOCTOR               estado=inscripto    gatera=—   suplente=—                        corrió: —   insc d3075c8e-0866-4b29-b796-977056069595
     → activos (inscripto/ratificado): 3 | efectivamente corrieron: 0

R9 T5 carrera.estado=abierta resultado=— — JOCKEY: CANTO, TOBIAS
     KUCCINI                  estado=inscripto    gatera=—   suplente=—                        corrió: —   insc 192151de-8761-4af6-b568-f33c60b3185b
     AMIGUITO JESUS           estado=inscripto    gatera=—   suplente=—                        corrió: —   insc d4a84f9f-fe61-4395-ac69-907690d5a7ab
     → activos (inscripto/ratificado): 2 | efectivamente corrieron: 0

R9 T10 carrera.estado=abierta resultado=— — JOCKEY: AGUIRRE, HUGO
     BABY PARADISE            estado=inscripto    gatera=—   suplente=—                        corrió: —   insc 09acb92c-6eb7-44d3-a503-0a02e066d46c
     INDIANA MARO             estado=inscripto    gatera=—   suplente=—                        corrió: —   insc 561667a7-41f6-44d5-ae55-363b9c8d8715
     ABARAJALA                estado=inscripto    gatera=—   suplente=—                        corrió: —   insc 02ff1544-6b0a-4722-85b4-146bfcfeb9f6
     → activos (inscripto/ratificado): 3 | efectivamente corrieron: 0

R9 T11 carrera.estado=abierta resultado=— — JOCKEY: CANTO, TOBIAS
     DESTINADO JOHAN          estado=inscripto    gatera=—   suplente=—                        corrió: —   insc 8c701d19-e658-4a9e-93e8-f70849e453dd
     HEART OF GOLD            estado=inscripto    gatera=—   suplente=—                        corrió: —   insc 6cc1a215-8184-4e82-9f5d-64c5ea1ede78
     → activos (inscripto/ratificado): 2 | efectivamente corrieron: 0

=== TITULAR DE UN CABALLO = SUPLENTE DE OTRO, MISMO TURNO ===
casos: 0

=== R9: inscriptos con jockey titular, por turno ===

  T1
     ARMOÑOZO                 inscripto    titular=—                          suplente=—
     CONESERA                 inscripto    titular=HAHN, GONZALO              suplente=—
     DESERT OF DUBAI          inscripto    titular=—                          suplente=—
     DOCTORA APASIONADA       inscripto    titular=DE MAIO, FACUNDO           suplente=—
     ETERNA DOCTORA           inscripto    titular=—                          suplente=—
     HERMANOSDEMIPATRIA       inscripto    titular=—                          suplente=—
     MOSQUITA GARDEN          inscripto    titular=ACUÑA, LUIS OMAR           suplente=—
     QUE BELLA DOÑA           inscripto    titular=ALDECOA, IVAN              suplente=—
     SI TIN                   inscripto    titular=DIESTRA, PEDRO EMANUEL     suplente=—

  T2
     ALHENA                   inscripto    titular=HAHN, GONZALO              suplente=—
     ASTUTO NOTES             inscripto    titular=CONTRERAS, JUAN CRUZ       suplente=—
     DEL CAMPEON              inscripto    titular=GONZALEZ, LUCAS            suplente=—
     DOCTOR SKY               inscripto    titular=IBARRA, FERNANDO AUGUSTO   suplente=—
     DOCTORA MIA              inscripto    titular=DA SILVA, RUBEN ALEJANDRO  suplente=—
     LOCA DUBAI               inscripto    titular=—                          suplente=—
     OLA DOCTOR               inscripto    titular=GONZALEZ, LUCAS            suplente=—
     TOUCH OF BLUE            inscripto    titular=GONZALEZ, LUCAS            suplente=—

  T3
     BAHIA ROMANA             inscripto    titular=—                          suplente=—
     DAHUA                    inscripto    titular=—                          suplente=—
     LOCA DUBAI               inscripto    titular=—                          suplente=—
     MARIA CATULENGA          inscripto    titular=YALET, IRINEO              suplente=—
     OLA DOCTOR               inscripto    titular=GONZALEZ, LUCAS            suplente=—
     TORO MAÑERO              inscripto    titular=ZUBIRIA, SANTIAGO          suplente=—
     VISION SECURITY          inscripto    titular=AGUIRRE, HUGO              suplente=—

  T4
     BACON                    inscripto    titular=MENDIBURU, BRIAN ADRIAN    suplente=—
     BIEN COQUETA             inscripto    titular=AGUIRRE, HUGO              suplente=—
     COLONIAL JOHAN           inscripto    titular=CANTO, TOBIAS              suplente=—
     GRILLADA RYE             inscripto    titular=—                          suplente=—
     KRISTALINA               inscripto    titular=—                          suplente=—
     LIVIA DRUSA              inscripto    titular=DELLI QUADRI, IGNACIO DANIEL suplente=—
     LOGUACIOUS               inscripto    titular=ARREGUY, FRANCISCO         suplente=—
     MARUKA PLUS              inscripto    titular=GATICA, DARIO              suplente=—
     NIÑO OCEANICO            inscripto    titular=YALET, IRINEO              suplente=—
     NISTEL WIN               inscripto    titular=—                          suplente=—
     REY DE PILA              inscripto    titular=—                          suplente=—
     SOUTH GOTICO             inscripto    titular=—                          suplente=—
     TOY BOY                  inscripto    titular=ZUBIRIA, SANTIAGO          suplente=—

  T5
     AMIGUITO JESUS           inscripto    titular=CANTO, TOBIAS              suplente=—
     KUCCINI                  inscripto    titular=CANTO, TOBIAS              suplente=—
     NELIDA RIM               inscripto    titular=ROMAY, ABEL IGNACIO        suplente=—
     NOCHE EN VELA            inscripto    titular=AGUIRRE, HUGO              suplente=—

  T6
     EL MAS SABIO             inscripto    titular=CANTO, TOBIAS              suplente=—
     FALAYS                   inscripto    titular=IBARRA, FERNANDO AUGUSTO   suplente=—
     FREE CRY                 inscripto    titular=ARREGUY, FRANCISCO         suplente=—
     HALLOTOP                 inscripto    titular=—                          suplente=—
     IDALIA MARO              inscripto    titular=MUÑIZ, MATIAS              suplente=—
     REINA EDITION            inscripto    titular=ROMAY, ABEL IGNACIO        suplente=—

  T7
     ATOMIZADOR               inscripto    titular=CANTO, TOBIAS              suplente=—
     ECHO IN THE SKY          inscripto    titular=GONZALEZ, LUCAS            suplente=—
     EL RISKO                 inscripto    titular=—                          suplente=—
     LATIN PRESUMIDA          inscripto    titular=D'ELIA, THIAGO             suplente=—
     LE BATEAU                inscripto    titular=ARREGUY, FRANCISCO         suplente=—
     SEMBRADOR CHUCK          inscripto    titular=—                          suplente=—
     SEÑOR MONCHI             inscripto    titular=—                          suplente=—
     YOOKY                    inscripto    titular=IBARRA, FERNANDO AUGUSTO   suplente=—

  T8
     IDALIA MARO              inscripto    titular=MUÑIZ, MATIAS              suplente=—
     LATIN PRESUMIDA          inscripto    titular=D'ELIA, THIAGO             suplente=—
     YOOKY                    inscripto    titular=IBARRA, FERNANDO AUGUSTO   suplente=—

  T9
     CHINITA SALTEÑA          inscripto    titular=IBARRA, FERNANDO AUGUSTO   suplente=—
     ESPLENDID CRAF           inscripto    titular=CANTO, TOBIAS              suplente=—
     LE BATEAU                inscripto    titular=ARREGUY, FRANCISCO         suplente=—
     QUERELLANTE              inscripto    titular=—                          suplente=—
     THE BEAST PARTY          inscripto    titular=—                          suplente=—
     WISLA KEN                inscripto    titular=DELLI QUADRI, IGNACIO DANIEL suplente=—

  T10
     ABARAJALA                inscripto    titular=AGUIRRE, HUGO              suplente=—
     BABY PARADISE            inscripto    titular=AGUIRRE, HUGO              suplente=—
     GRILLADA RYE             inscripto    titular=—                          suplente=—
     INDIANA MARO             inscripto    titular=AGUIRRE, HUGO              suplente=—
     KRISTALINA               inscripto    titular=—                          suplente=—
     LATIN RAIN               inscripto    titular=D'ELIA, THIAGO             suplente=—
     LOGUACIOUS               inscripto    titular=ARREGUY, FRANCISCO         suplente=—
     QUINIELA TREND           inscripto    titular=YALET, IRINEO              suplente=—

  T11
     BABY PARADISE            inscripto    titular=AGUIRRE, HUGO              suplente=—
     BUEN MANUEL              inscripto    titular=ACUÑA, MATIAS EZEQUIEL     suplente=—
     DESTINADO JOHAN          inscripto    titular=CANTO, TOBIAS              suplente=—
     EL GRAN HECTOR           inscripto    titular=GONZALEZ, EDUARDO CECILIO  suplente=—
     ES SABALERO              inscripto    titular=YALET, IRINEO              suplente=—
     GOIADORA                 inscripto    titular=—                          suplente=—
     HEART OF GOLD            inscripto    titular=CANTO, TOBIAS              suplente=—
     INDIO VALIDO             inscripto    titular=—                          suplente=—
     TERRIBLE KING            inscripto    titular=DE MAIO, FACUNDO           suplente=—
```

### Lectura

**R9 (pregunta 2)** — 4 grupos, 10 inscripciones, **todas en `inscripto`**, sin gatera, sin suplente:

| Turno | Jockey | Caballos |
|---|---|---|
| T2 | GONZALEZ, LUCAS | DEL CAMPEON · OLA DOCTOR · TOUCH OF BLUE |
| T5 | CANTO, TOBIAS | AMIGUITO JESUS · KUCCINI |
| T10 | AGUIRRE, HUGO | ABARAJALA · BABY PARADISE · INDIANA MARO |
| T11 | CANTO, TOBIAS | DESTINADO JOHAN · HEART OF GOLD |

Ninguno es error todavía: es la foto de la inscripción, el lunes 14 se ratifica y ahí se define quién
monta qué. Tres de los cuatro jockeys (Gonzalez, Canto, Aguirre) son los que más caballos tienen en la
reunión — es la forma normal de "lo pedí para los tres, después vemos".

**R6 / R8 (pregunta 3)** — 8 grupos:

| Reunión | Turno | Jockey | Caballos (estado → corrió) | Colisión real |
|---|---|---|---|---|
| R6 | T9 (c.7) | PRESA, DANIEL | DARIN (forfait) · LA DIVERTENTE (ratificado → 6°) | no |
| R8 | T2 (c.1) | LOPEZ, ALEXIS | WILSON SECURITY (ratificado → 3°) · MAC VITAL (forfait) | no |
| R8 | T3 (c.7) | GONZALEZ, LUCAS | DESDEN (ratificado → 1°) · TOUCH OF BLUE (forfait) | no |
| **R8** | **T5 (c.4)** | **AGUIRRE, HUGO** | **NOCHE EN VELA (ratificado → NO LARGÓ) · LA LAGUNERA J (ratificado → 5°)** | **sí: los dos ratificados** |
| R8 | T5 (c.4) | DELLI QUADRI, IGNACIO | WISLA KEN (mal_inscrito) · CONI ROSE (ratificado → 4°) | no |
| R8 | T8 (c.8) | PRESA, DANIEL | LA DIVERTENTE (forfait) · LE BATEAU (ratificado → 2°) | no |
| R8 | T10 (c.5) | TORRES, ANIBAL | GINIYA GOOD (forfait) · Icy Tom (ratificado → 8°) | no |
| R8 | T11 (c.6) | CONTRERAS, JUAN CRUZ | INDIO VALIDO (forfait) · TATA FOOT (ratificado → 5°) | no |

**Ningún caso en que un mismo jockey haya corrido dos caballos** (imposible físicamente, y la base lo
confirma). El único que "llegó a correr" con los dos ratificados es R8 T5 / Aguirre. Auditoría de esas dos
inscripciones:

```sql
select a.created_at, a.accion, s.nombre as caballo,
       (select apellido||', '||nombre from profesionales where id = (a.datos_antes->>'jockey_titular_id')::uuid) as jockey_antes,
       (select apellido||', '||nombre from profesionales where id = (a.datos_despues->>'jockey_titular_id')::uuid) as jockey_despues,
       a.datos_antes->>'estado' as estado_antes, a.datos_despues->>'estado' as estado_despues
from auditoria a join inscripciones i on i.id = a.registro_id join spcs s on s.id = i.spc_id
where a.tabla = 'inscripciones'
  and a.registro_id in ('12913afb-e303-4d03-bb60-a272c3ed88e3','4370d235-6dd9-479a-b7af-cd7c4d81c82f')
  and (a.datos_antes->>'jockey_titular_id' is distinct from a.datos_despues->>'jockey_titular_id'
       or a.datos_antes->>'estado' is distinct from a.datos_despues->>'estado' or a.accion='INSERT')
order by a.created_at;
```

```
created_at                     accion  caballo        jockey_antes   jockey_despues  estado_antes  estado_despues
2026-08-10 17:24:29.27303+00   INSERT  LA LAGUNERA J  null           null            null          inscripto
2026-08-10 17:25:02.238907+00  INSERT  NOCHE EN VELA  null           AGUIRRE, HUGO   null          inscripto
2026-08-10 18:24:42.297207+00  UPDATE  LA LAGUNERA J  null           null            inscripto     ratificado
2026-08-10 18:24:45.427168+00  UPDATE  NOCHE EN VELA  AGUIRRE, HUGO  AGUIRRE, HUGO   inscripto     ratificado
2026-08-17 23:13:06.162919+00  UPDATE  LA LAGUNERA J  null           AGUIRRE, HUGO   ratificado    ratificado
```

Secuencia: NOCHE EN VELA se inscribió con Aguirre y se ratificó así; LA LAGUNERA J se ratificó **sin
jockey**; el 16/08 NOCHE EN VELA no largó y Aguirre montó LA LAGUNERA J; **el 17/08 a las 23:13 se le
cargó Aguirre a LA LAGUNERA J** (es el backfill de montas de R8 que cita el gate de oficializar,
`resultados.html:1626-1627`), y a NOCHE EN VELA nadie le sacó el jockey porque ya no importaba. Un
bloqueo por "jockey ya usado en la carrera" habría rechazado ese UPDATE del 17/08 — el dato correcto —
por culpa de un dato viejo en un caballo que no corrió. **Esa es la razón concreta para no bloquear en
Montas.**

Titular de un caballo = suplente de otro en el mismo turno: **0 casos**. Suplente cargado en R6–R9:
**0 de 312** (la columna `suplente=—` en toda la salida).

---

## 4. "DOBLE MONTA"

```
$ grep -rn -i "doble monta\|doble_monta\|doblemonta" --include=*.html --include=*.js --include=*.sql --include=*.md --include=*.mjs .
data/asignacion_prof_20j_report.md:8:- Doble monta (jockey a mano por Yesica): T6 PORTEÑO Y BAILARIN, T7 BELLO PRESAGIO.
data/asignacion_prof_20j_PREVIEW.md:3:**NO EJECUTADO.** Plan de asignación cruzando el borrador del 20/6 contra las inscripciones de la reunión 6 (club Dolores). Reglas: solo se completan campos en **NULL** (no se pisan valores existentes); `XX`=sin jockey (NULL); doble monta y no-matcheados van aparte; cruce caballo↔carrera por **turno**.
data/asignacion_prof_20j_PREVIEW.md:13:- Doble monta (jockey sin asignar): **2**
data/asignacion_prof_20j_PREVIEW.md:90:| 6 | PORTEÑO Y BAILARIN | ratificado | DOBLE MONTA (DIESTRA PEDRO / DELLI QUADRI IGNACIO) | ⛔ DOBLE MONTA (skip) | AZURI SANTIAGO | ✔ AZURI SANTIAGO DAMIAN |
data/asignacion_prof_20j_PREVIEW.md:96:| 7 | BELLO PRESAGIO | forfait | DOBLE MONTA (AGUIRRE HUGO / ROJAS HERNAN) | ⛔ DOBLE MONTA (skip) | PALLET GUIDO | = ya asignado |
data/asignacion_prof_20j_PREVIEW.md:147:## ⛔ Doble monta — NO asignar jockey (resolver a mano)
data/asignacion_prof_20j_PREVIEW.md:148:- T6 · PORTEÑO Y BAILARIN · `DOBLE MONTA (DIESTRA PEDRO / DELLI QUADRI IGNACIO)` · insc `d21f589c-2ef1-45eb-b3b8-8b180680e861`
data/asignacion_prof_20j_PREVIEW.md:149:- T7 · BELLO PRESAGIO · `DOBLE MONTA (AGUIRRE HUGO / ROJAS HERNAN)` · insc `3abb1378-ff06-4617-8773-8ce36c1b1e22`
```

Cero en código, cero en schema, cero en docs de producto. Aparece sólo en la carga de R6 (20/06), donde
el borrador de Yesi traía `DOBLE MONTA (DIESTRA PEDRO / DELLI QUADRI IGNACIO)` en **un** caballo: **dos
jockeys candidatos para un mismo caballo, sin definir**. El script lo salteó (`⛔ skip`) y Yesi lo cargó
a mano cuando se definió.

O sea: en la planilla, "DOBLE MONTA" es el problema **inverso** al que pide ahora — no "un jockey en dos
caballos" sino "dos jockeys en un caballo". El sistema no tiene cómo representar eso:

- `jockey_titular_id` + `jockey_suplente_id` es lo más parecido, pero suplente significa "reemplazo si el
  titular no puede", no "todavía no sé cuál de los dos". Y nadie lo usa (0/312).
- Al no tener campo, hoy lo único posible es dejar el jockey en `NULL` hasta que se defina, que es lo que
  se hizo en R6.

Para el T1 de R9: no tengo la planilla; en la base el T1 tiene 4 de 9 caballos sin jockey (ARMOÑOZO,
DESERT OF DUBAI, ETERNA DOCTORA, HERMANOSDEMIPATRIA), cualquiera de ellos puede ser el "DOBLE MONTA".
Hay que preguntarle a Yesi qué caballo y qué quiere decir con el rótulo — si es "dos candidatos", la
validación que pide no lo toca.

---

## 5. Dónde se elige el jockey — los puntos de escritura de `jockey_titular_id`

```
$ grep -n "jockey_titular_id\|jockey_suplente_id" *.html supabase/functions/*/index.ts migrations/*.sql | grep -v "^resultados\|^liquidaciones"   (recortado a los que ESCRIBEN)
portal.html:988:    p_jockey_titular_id: jockeyId,
portal.html:989:    p_jockey_suplente_id: suplenteId,
inscripciones.html:826:    jockey_titular_id: document.getElementById('f-jockey-titular').value || null,
inscripciones.html:827:    jockey_suplente_id: document.getElementById('f-jockey-suplente').value || null,
ratificacion.html:859:  const { error } = await sb.from('inscripciones').update({ jockey_titular_id: jockeyId }).eq('id', inscId);
migrations/portal_monta_al_anotar.sql:187:    entrenador_id, caballeriza_id, jockey_titular_id, jockey_suplente_id
migrations/montas_r6_correccion.sql:61-201: 36 UPDATE inscripciones SET jockey_titular_id = ... (backfill R6 a mano)
```

más `resultados.html:2058-2059` (`saveMontas`, que el grep excluyó por el filtro `^resultados`):

```
2058     const { error } = await sb.from('inscripciones')
2059       .update({ jockey_titular_id: u.jockey_titular_id }).eq('id', u.id);
```

| # | Dónde | Cuándo | Quién | Estado de la inscripción | Control hoy |
|---|---|---|---|---|---|
| a | `inscripciones.html` modal (alta y edición), `:826-827` | inscripción | secretaría | `inscripto` (o el que sea: el modal edita todo) | ninguno |
| b | `portal.html` "Datos de la monta", `:963-989` → `rpc_inscribir` | inscripción | entrenador | `inscripto` | padrón + titular≠suplente (RPC) |
| c | `ratificacion.html` select por fila, `:837-871` | ratificación (hasta las 12:00 del día) | secretaría | `inscripto` / `ratificado` | **aviso `⚠ dup.`** (cuenta forfaits) |
| d | `resultados.html` modal Montas, `:1977-2073` | día de la reunión, post 12:00 y post carrera | operador de resultados | `ratificado` | ninguno |
| e | SQL a mano (`migrations/montas_r6_correccion.sql`, backfill R8 del 17/08) | después | Leo | `ratificado` | ninguno |

Sólo lectura (no eligen): `programa.html:359`, `programa-oficial*.html`, `carta-llamados`, `reunion-json`
(Edge Function), `liquidaciones-engine.js` (lee `jockey_titular_id` para la línea de monta).

Si la validación va, tiene que estar en **a, c y d** como mínimo (los tres de secretaría/operador). **b**
la lleva el RPC si se decide server-side. **e** no se puede proteger salvo por constraint, y §7 explica
por qué una constraint rompe el caso real.

---

## 6. ¿Rompe algo aguas abajo tener el mismo jockey en dos ratificados?

- **Liquidación**: la línea de monta del jockey sale por inscripción (`liquidaciones-engine.js`, una por
  `jockey_titular_id` de cada caballo ubicado). Dos ratificados con el mismo jockey en la misma carrera
  → si los dos "corrieran" generarían dos líneas de monta al mismo jockey. En R8 T5 no pasó porque NOCHE
  EN VELA quedó `no_largo` y el motor sólo liquida los que largaron. El incentivo de jockey es por
  **reunión** (50k), no por carrera: no se duplica.
- **Programa oficial**: imprime el jockey de cada caballo tal cual. Dos caballos con el mismo apellido
  en la misma carrera — visible, no revienta.
- **Stud Book (`reunion-json`)**: idem, manda lo que hay.

Nada explota. El daño es un programa/JSON con un dato que se sabe falso, y si los dos largaran, una
monta pagada de más — que es exactamente lo que el gate de oficializar + Montas están para corregir el
día de la carrera.

---

## 7. Bloqueo o aviso

**Recomendación: aviso, no bloqueo.** Tres razones, todas con evidencia arriba:

1. **En la inscripción es normal.** R9 hoy: 10 inscripciones en 4 turnos con jockey repetido, todas
   `inscripto`. Fede (25/08, `portal.html:966`): el compromiso de monta se cierra en la ratificación. Un
   bloqueo en el modal de inscripción o en el RPC del portal le impide al entrenador declarar "quiero a
   Canto" en sus dos caballos, que es lo que hace hoy. Rompe el flujo del jueves para proteger un dato
   que se define el lunes.
2. **Después de la carrera el dato viejo bloquea el dato nuevo.** R8 T5: Aguirre quedó en NOCHE EN VELA
   (no largó) y hubo que cargarlo en LA LAGUNERA J al día siguiente. Un bloqueo en Montas o una
   constraint habría rechazado la corrección correcta por un residuo en un caballo que no corrió. Para
   que un bloqueo funcione ahí habría que obligar primero a "limpiar" el jockey del que no largó — un
   paso más para el operador nuevo que el 20/09 usa SGH por primera vez (el argumento del gate de
   Montas, `resultados.html:1626-1628`, corre al revés acá: el gate bloquea porque el dato faltante no se
   ve; el repetido sí se ve, si se lo muestra).
3. **Un constraint de base (`UNIQUE (carrera_id, jockey_titular_id) WHERE estado='ratificado'`) es
   inviable** por el punto 2 y porque hoy ya hay una fila que lo viola (R8 T5). Y `WHERE estado IN
   ('inscripto','ratificado')` violaría las 10 de R9.

Lo que sí conviene, y es chico:

- **Arreglar el aviso que existe**: que `ratificacion.html:619` y `:817` cuenten **sólo `inscripto` +
  `ratificado`**. Hoy 7 de los 8 casos históricos son ruido (forfait + ratificado) y el aviso pierde
  credibilidad. Y que no se apague con `carCerrada` — o que se apague, pero que Montas lo herede.
- **Replicar el mismo aviso en `inscripciones.html`** (la tabla del turno tiene todo cargado, es un
  `reduce` como en ratificación) **y en el modal Montas** (`moRenderFilas` tiene las filas de la carrera).
  Mismo badge `⚠ dup.`, misma clase. En Montas además tiene sentido un `confirm` al guardar si queda
  un jockey repetido entre ratificados que largaron ("Aguirre queda en 2 caballos que largaron: ¿seguir?")
  — porque ahí sí el dato va derecho a la liquidación.
- **Si Fede quiere un bloqueo**, el único punto donde no rompe nada es **`ratificar()`**: no dejar
  ratificar el segundo caballo si ya hay uno **ratificado** (no `inscripto`) con ese jockey en la carrera.
  Es el momento donde, según Fede, la monta se cierra; el operador tiene el select al lado para cambiarla;
  y no toca ni inscripción ni Montas. Habría que sacar antes el ⚠ de los forfaits, si no bloquea por ruido.

Esto es decisión de producto (Fede/Yesi). Lo dejo planteado, no implementado.

---

## 8. Preguntas abiertas

1. **¿Qué significa "DOBLE MONTA" en el T1 de la planilla de R9?** Si es "dos jockeys para un caballo" (como
   en R6), la validación pedida no lo cubre y hay que decidir cómo se carga (hoy: `NULL` hasta definir).
   ¿Qué caballo es?
2. **¿Bloqueo en `ratificar()` o sólo aviso?** Con la evidencia de arriba recomiendo aviso; si va bloqueo,
   sólo ahí.
3. **Montas post-carrera**: ¿está bien que quede el jockey en el caballo que no largó (R8 T5), o Yesi
   quiere que Montas lo limpie? Afecta al aviso: con el residuo, Montas siempre va a marcar ⚠ en ese caso.
4. **`jockey_suplente_id`**: 0/312 usos. ¿Lo van a usar en R9 o se puede dejar de mostrar en los selects?
   (No es de este pedido; lo anoto porque aparece en los mismos 4 puntos.)

---

## 9. Verificación de publicación

(se completa en el commit siguiente)
