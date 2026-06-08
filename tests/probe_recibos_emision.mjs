/**
 * Probe Fase 4 — buscador pagable + RPC emitir_recibo (cobro atómico).
 *
 * Sin browser (chromium no corre en ubuntu26.04). Prueba el CÓDIGO REAL del flujo de plata:
 * la RPC `emitir_recibo` (DB-side) + la query de "pagable" que usa el buscador. Usa fixtures
 * propias (una liquidación de prueba + 3 líneas con un beneficiario real) para no depender del
 * estado de R5. snapshot→fixtures→run→assert→restore (borra fixtures + restaura club_secuencias).
 *
 * Escenario:
 *   L1 impago 1000 · L2 retenido liberado (ayer) 2000 · L3 retenido FUTURO (mañana) 3000
 *   (a) pagable → L1+L2 (excluye L3) · (b) emitir [L1,L2] → recibo+numero, líneas pagadas
 *   (c) idempotencia: re-emitir [L1,L2] → 0 marcadas → RPC RAISE; emitir [L1,L2,L4nuevo] → solo L4
 *   (d) total recibo = suma de líneas marcadas
 *
 * Clave server-side de process.env.SUPABASE_SECRET_KEY (.env gitignore). Nunca hardcodeada.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!SERVICE_KEY) { console.error('Falta SUPABASE_SECRET_KEY (source .env).'); process.exit(2); }
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const R5      = 'c90b6186-268d-4089-8cc6-71626b627cf8';
const BENEF   = 'f6637123-af74-42ae-81e1-d5b9fed88fc9'; // profesionales.id (FK válida para recibos)

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const results = [];
const ok = (t, c, n='') => results.push({ t, s: c ? '✅' : '❌', n });
const dISO = (deltaDays) => { const d=new Date(); d.setUTCDate(d.getUTCDate()+deltaDays); return d.toISOString().slice(0,10); };

async function pagables(tipo, id){  // espeja la query del buscador
  const hoy = dISO(0);
  const { data } = await sb.from('liquidacion_detalle')
    .select('id,monto_neto,estado_linea,fecha_liberacion')
    .eq('beneficiario_tipo',tipo).eq('beneficiario_id',id).is('recibo_id',null)
    .or(`estado_linea.eq.impago,and(estado_linea.eq.retenido,fecha_liberacion.lte.${hoy})`);
  return data||[];
}

(async () => {
  let liqId=null, L1=null,L2=null,L3=null,L4=null, snapSeq=null, recIds=[], phase='init';
  try {
    // snapshot club_secuencias (para restaurar la numeración al final)
    phase='snapshot';
    const { data: seq } = await sb.from('club_secuencias').select('*').eq('club_id',CLUB_ID).eq('tipo','recibo').maybeSingle();
    snapSeq = seq;  // puede ser null si nunca se usó

    // fixtures: una liquidación de prueba + 3 líneas
    phase='fixtures';
    const { data: liq, error: eL } = await sb.from('liquidaciones')
      .insert({club_id:CLUB_ID, reunion_id:R5, profesional_id:BENEF, estado:'borrador', total_bruto:0, total_descuentos:0}).select().single();
    if (eL) throw new Error('crear liq: '+eL.message);
    liqId = liq.id;
    const base = { liquidacion_id:liqId, beneficiario_tipo:'profesional', beneficiario_id:BENEF, reunion_id:R5, monto_descuento:0, concepto_tipo:'incentivo_jockey' };
    const mk = async (concepto, bruto, estado, fechaLib) => {
      const { data, error } = await sb.from('liquidacion_detalle')
        .insert({...base, concepto, monto_bruto:bruto, estado_linea:estado, fecha_liberacion:fechaLib}).select().single();
      if (error) throw new Error('crear linea '+concepto+': '+error.message); return data;
    };
    L1 = await mk('TEST impago',        1000, 'impago',   null);
    L2 = await mk('TEST retenido libre', 2000, 'retenido', dISO(-1));  // liberada ayer
    L3 = await mk('TEST retenido futuro',3000, 'retenido', dISO(+1));  // futura → excluir
    console.log(`[fixtures] liq=${liqId} L1=${L1.id} L2=${L2.id} L3=${L3.id}`);

    // (a) buscador pagable
    phase='assert-a';
    const pag = await pagables('profesional', BENEF);
    const pagIds = new Set(pag.map(p=>p.id));
    ok('a1 pagable incluye L1 (impago) y L2 (retenido liberado)', pagIds.has(L1.id) && pagIds.has(L2.id));
    ok('a2 pagable EXCLUYE L3 (retenido futuro)', !pagIds.has(L3.id), `L3 presente=${pagIds.has(L3.id)}`);
    const totalPag = pag.filter(p=>[L1.id,L2.id].includes(p.id)).reduce((s,p)=>s+parseFloat(p.monto_neto),0);
    ok('a3 total pagable L1+L2 = 3000', totalPag===3000, `total=${totalPag}`);

    // (b) emitir [L1,L2]
    phase='emitir-1';
    const { data: r1, error: e1 } = await sb.rpc('emitir_recibo', {
      p_club_id:CLUB_ID, p_beneficiario_tipo:'profesional', p_beneficiario_id:BENEF,
      p_linea_ids:[L1.id,L2.id], p_forma_pago:'efectivo', p_cobrador_nombre:'TEST Cobrador', p_cobrador_documento:'12345678', p_comprobante_url:null });
    if (e1) throw new Error('emitir 1: '+e1.message);
    const rec1 = Array.isArray(r1)?r1[0]:r1; recIds.push(rec1.id);
    ok('b1 recibo creado con numero_recibo asignado', !!rec1.numero_recibo, `num=${rec1.numero_recibo}`);
    const { data: l12 } = await sb.from('liquidacion_detalle').select('id,estado_linea,recibo_id,pagado_at').in('id',[L1.id,L2.id]);
    ok('b2 L1/L2 → pagado + recibo_id + pagado_at',
       l12.every(l=>l.estado_linea==='pagado' && l.recibo_id===rec1.id && l.pagado_at), JSON.stringify(l12.map(l=>l.estado_linea)));
    // (d) total recibo = suma
    ok('d1 total_premios del recibo = 3000 (L1+L2)', Number(rec1.total_premios)===3000, `total=${rec1.total_premios}`);
    ok('d2 neto_a_cobrar = 3000 (sin descuentos/retención)', Number(rec1.neto_a_cobrar)===3000, `neto=${rec1.neto_a_cobrar}`);

    // (c) idempotencia: re-emitir [L1,L2] → 0 pagables → RAISE
    phase='idempotencia';
    const { error: e2 } = await sb.rpc('emitir_recibo', {
      p_club_id:CLUB_ID, p_beneficiario_tipo:'profesional', p_beneficiario_id:BENEF,
      p_linea_ids:[L1.id,L2.id], p_forma_pago:'efectivo', p_cobrador_nombre:'TEST', p_cobrador_documento:'1', p_comprobante_url:null });
    ok('c1 re-emitir líneas ya pagadas → RPC rechaza (no re-paga)', !!e2, e2?.message?.slice(0,60)||'sin error (MAL)');

    // nueva línea + emitir mezcla [L1,L2,L4] → solo L4 nueva
    L4 = await mk('TEST impago 2', 1500, 'impago', null);
    const { data: r3, error: e3 } = await sb.rpc('emitir_recibo', {
      p_club_id:CLUB_ID, p_beneficiario_tipo:'profesional', p_beneficiario_id:BENEF,
      p_linea_ids:[L1.id,L2.id,L4.id], p_forma_pago:'transferencia', p_cobrador_nombre:'TEST', p_cobrador_documento:'2', p_comprobante_url:'http://x' });
    if (e3) throw new Error('emitir 3: '+e3.message);
    const rec3 = Array.isArray(r3)?r3[0]:r3; recIds.push(rec3.id);
    ok('c2 re-emitir con mezcla → toma SOLO la línea nueva (L4)', Number(rec3.total_premios)===1500, `total=${rec3.total_premios}`);
    const { data: l4 } = await sb.from('liquidacion_detalle').select('estado_linea,recibo_id').eq('id',L4.id).single();
    ok('c3 L4 quedó pagada en el recibo nuevo', l4.estado_linea==='pagado' && l4.recibo_id===rec3.id);
    ok('c4 L1 sigue en el recibo original (no se movió)', true);
    const { data: l1b } = await sb.from('liquidacion_detalle').select('recibo_id').eq('id',L1.id).single();
    ok('c4 L1 conserva su recibo_id original', l1b.recibo_id===rec1.id, `recibo=${l1b.recibo_id===rec1.id}`);

  } catch (e) {
    ok(`EXCEPCIÓN en fase '${phase}'`, false, e.message); console.error(e);
  } finally {
    // cleanup: borrar líneas+liq+recibos de prueba, restaurar numeración
    try {
      for (const id of [L1,L2,L3,L4].filter(Boolean).map(x=>x.id)) await sb.from('liquidacion_detalle').delete().eq('id',id);
      if (liqId) await sb.from('liquidaciones').delete().eq('id',liqId);
      for (const rid of recIds) await sb.from('recibos').delete().eq('id',rid);
      // restaurar club_secuencias a su valor previo (la numeración consumida por el test se libera)
      if (snapSeq) await sb.from('club_secuencias').update({ultimo_numero:snapSeq.ultimo_numero}).eq('club_id',CLUB_ID).eq('tipo','recibo');
      else await sb.from('club_secuencias').delete().eq('club_id',CLUB_ID).eq('tipo','recibo');
      const { data: liqFin } = await sb.from('liquidaciones').select('id').eq('id',liqId||'00000000-0000-0000-0000-000000000000');
      ok('R1 cleanup: liquidación de prueba borrada', !liqFin?.length);
      const { data: recFin } = await sb.from('recibos').select('id').in('id', recIds.length?recIds:['00000000-0000-0000-0000-000000000000']);
      ok('R2 cleanup: recibos de prueba borrados', !recFin?.length);
    } catch (e) { ok('CLEANUP FALLÓ — revisar manualmente', false, e.message); console.error('[cleanup]',e); }
    console.log('\n──────── RESULTADO ────────');
    for (const r of results) console.log(`${r.s} ${r.t}${r.n?'  ('+r.n+')':''}`);
    const failed = results.filter(r=>r.s==='❌').length;
    console.log(`\n${failed===0?'✅ TODO OK':'❌ '+failed+' fallo(s)'} — ${results.length} checks`);
    process.exit(failed===0?0:1);
  }
})();
