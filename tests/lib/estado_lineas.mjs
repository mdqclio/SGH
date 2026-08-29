/**
 * Verificación de restore por ESTADO, no por conteo de filas.
 *
 * Por qué existe: el 2026-08-28 el restore de probe_recibo_pie_cobrador.mjs se dio por bueno
 * porque la verificación contaba filas — 76 líneas en la 9999, 0 recibos de prueba, 0 huérfanas,
 * todo verde. Las filas estaban, sí; lo que había cambiado era su `estado_linea` y su `recibo_id`.
 * Nueve líneas del sandbox quedaron en 'pagado' colgadas de un recibo ajeno. Contar filas no es
 * verificar estado. Es la misma clase de error que el recibo #4.
 *
 * Uso:
 *   const antes = await snapshotLineas(sb, REUNION);
 *   ... el probe hace lo suyo ...
 *   const arregladas = await restaurarLineas(sb, antes, await snapshotLineas(sb, REUNION));
 *   const verif = diffLineas(antes, await snapshotLineas(sb, REUNION));
 *   ok('restore por estado', verif.limpio, describir(verif));
 *
 * `monto_neto` NO va en CAMPOS: es una columna GENERATED y Postgres la recalcula sola (GOTCHA #9).
 */

export const CAMPOS = [
  'estado_linea', 'recibo_id', 'pagado_at',
  'monto_bruto', 'monto_descuento',
  'beneficiario_tipo', 'beneficiario_id',
  'liquidacion_id', 'inscripcion_id', 'carrera_id',
];

/** id → {campo: valor} de todas las líneas de una reunión. */
export async function snapshotLineas(sb, reunionId, campos = CAMPOS) {
  const { data, error } = await sb.from('liquidacion_detalle')
    .select(['id', ...campos].join(',')).eq('reunion_id', reunionId);
  if (error) throw new Error('snapshotLineas: ' + error.message);
  return Object.fromEntries((data || []).map(r =>
    [r.id, Object.fromEntries(campos.map(c => [c, r[c] ?? null]))]));
}

/** Compara dos snapshots campo por campo. `limpio` sólo si no cambió, faltó ni sobró nada. */
export function diffLineas(antes, despues, campos = CAMPOS) {
  const cambiadas = [], faltantes = [], nuevas = [];
  for (const [id, a] of Object.entries(antes)) {
    const d = despues[id];
    if (!d) { faltantes.push(id); continue; }
    const difs = campos.filter(c => String(a[c]) !== String(d[c]))
                       .map(c => `${c}: ${a[c]} → ${d[c]}`);
    if (difs.length) cambiadas.push({ id, difs });
  }
  for (const id of Object.keys(despues)) if (!(id in antes)) nuevas.push(id);
  return { cambiadas, faltantes, nuevas,
           limpio: !cambiadas.length && !faltantes.length && !nuevas.length };
}

/**
 * Devuelve al estado del snapshot toda línea que haya cambiado. Devuelve cuántas arregló:
 * si es > 0 el probe ensució algo que no era suyo y hay que mirarlo, aunque haya quedado limpio.
 */
export async function restaurarLineas(sb, antes, despues, campos = CAMPOS) {
  const { cambiadas } = diffLineas(antes, despues, campos);
  for (const c of cambiadas) {
    const { error } = await sb.from('liquidacion_detalle').update(antes[c.id]).eq('id', c.id);
    if (error) throw new Error(`restaurarLineas ${c.id}: ${error.message}`);
  }
  return cambiadas.length;
}

/** Texto corto para el `ok(...)` del probe. */
export function describir(v, max = 4) {
  if (v.limpio) return 'sin diferencias';
  const p = [];
  if (v.cambiadas.length) p.push(`${v.cambiadas.length} cambiada(s): ` +
    v.cambiadas.slice(0, max).map(c => `${c.id.slice(0, 8)} [${c.difs.join(', ')}]`).join(' · '));
  if (v.faltantes.length) p.push(`${v.faltantes.length} faltante(s): ${v.faltantes.slice(0, max).join(', ')}`);
  if (v.nuevas.length)    p.push(`${v.nuevas.length} nueva(s): ${v.nuevas.slice(0, max).join(', ')}`);
  return p.join(' | ');
}

/**
 * Recibos creados desde `desdeISO`, en CUALQUIER club. Deliberadamente sin filtro de club_id:
 * el recibo fantasma del 2026-08-28 sobrevivió justamente porque la foto de recibos del probe
 * filtraba por el club de Dolores y el recibo había salido con el club_id de Mi Club Hípico.
 */
export async function recibosDesde(sb, desdeISO) {
  const { data, error } = await sb.from('recibos')
    .select('id,club_id,numero_recibo,beneficiario_tipo,neto_a_cobrar,created_at')
    .gte('created_at', desdeISO).order('created_at');
  if (error) throw new Error('recibosDesde: ' + error.message);
  return data || [];
}
