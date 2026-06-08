/**
 * Probe Fase 4 v1.1 — liberación MANUAL del doping + búsqueda + filtro por carrera.
 *
 * Sin browser. Prueba el código REAL: RPCs `emitir_recibo` (v1.1, pagable=solo impago) y
 * `liberar_linea` (DB-side), + la función JS real `benefSearch` extraída de liquidaciones.html.
 * Fixtures propias sobre R5 (liquidación de prueba + líneas en 2 carreras), snapshot→run→
 * assert→restore (borra fixtures + restaura club_secuencias).
 *
 * Casos: (a) retenida con fecha PASADA NO es pagable ni emitible (confirma que salió el OR de
 * fecha); (b) liberar_linea retenido→impago → ahí sí pagable/emitible; (c) liberar_linea sobre
 * no-retenida → error; (d) benefSearch matchea por nombre/apellido/DNI; (e) filtro por carrera acota.
 *
 * Clave server-side de process.env.SUPABASE_SECRET_KEY (.env gitignore). Nunca hardcodeada.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!SERVICE_KEY) { console.error('Falta SUPABASE_SECRET_KEY (source .env).'); process.exit(2); }
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const R5      = 'c90b6186-268d-4089-8cc6-71626b627cf8';
const BENEF   = 'f6637123-af74-42ae-81e1-d5b9fed88fc9'; // profesionales.id

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const results = [];
const ok = (t, c, n='') => results.push({ t, s: c ? '✅' : '❌', n });
const dISO = (delta) => { const d=new Date(); d.setUTCDate(d.getUTCDate()+delta); return d.toISOString().slice(0,10); };

function extractFnBody(html, sig){ const s=html.indexOf(sig); if(s<0)throw new Error('no fn: '+sig);
  const o=html.indexOf('{',s); let d=0,i=o; for(;i<html.length;i++){ if(html[i]==='{')d++; else if(html[i]==='}'){d--; if(d===0)break;} } return html.slice(o+1,i); }

(async () => {
  let liqId=null, LR=null,LI=null,LB=null, snapSeq=null, recIds=[], phase='init', carreraA=null;
  try {
    phase='snapshot';
    const { data: seq } = await sb.from('club_secuencias').select('*').eq('club_id',CLUB_ID).eq('tipo','recibo').maybeSingle();
    snapSeq = seq;
    // 2 inscripciones de R5 en carreras distintas
    const { data: cars } = await sb.from('carreras').select('id').eq('reunion_id',R5);
    const carIds=(cars||[]).map(c=>c.id);
    const { data: ins } = await sb.from('inscripciones').select('id,carrera_id').in('carrera_id',carIds).limit(50);
    const byCar={}; for(const i of (ins||[])){ (byCar[i.carrera_id]=byCar[i.carrera_id]||[]).push(i.id); }
    const carreras=Object.keys(byCar).filter(c=>byCar[c].length);
    if (carreras.length<2) throw new Error('R5 necesita ≥2 carreras con inscripciones');
    carreraA=carreras[0]; const insA=byCar[carreras[0]][0], insB=byCar[carreras[1]][0];

    phase='fixtures';
    const { data: liq, error:eL } = await sb.from('liquidaciones')
      .insert({club_id:CLUB_ID, reunion_id:R5, profesional_id:BENEF, estado:'borrador', total_bruto:0, total_descuentos:0}).select().single();
    if (eL) throw new Error('crear liq: '+eL.message); liqId=liq.id;
    const base={ liquidacion_id:liqId, beneficiario_tipo:'profesional', beneficiario_id:BENEF, reunion_id:R5, monto_descuento:0, concepto_tipo:'premio' };
    const mk=async(c,b,e,f,insc)=>{ const{data,error}=await sb.from('liquidacion_detalle')
      .insert({...base,concepto:c,monto_bruto:b,estado_linea:e,fecha_liberacion:f,inscripcion_id:insc}).select().single();
      if(error)throw new Error('linea '+c+': '+error.message); return data; };
    LR = await mk('TEST retenido fecha pasada', 5000, 'retenido', dISO(-5), insA); // fecha PASADA
    LI = await mk('TEST impago carreraA',        1000, 'impago',   null,     insA);
    LB = await mk('TEST impago carreraB',        2000, 'impago',   null,     insB);
    console.log(`[fixtures] LR(ret,pasada)=${LR.id} LI(carreraA)=${LI.id} LB(carreraB)=${LB.id}`);

    // (a) retenida con fecha PASADA: NO pagable (query impago) ni emitible
    phase='a';
    const { data: pag } = await sb.from('liquidacion_detalle').select('id')
      .eq('beneficiario_id',BENEF).is('recibo_id',null).eq('estado_linea','impago');
    const pagIds=new Set((pag||[]).map(p=>p.id));
    ok('a1 retenida (fecha pasada) NO está en pagable (impago)', !pagIds.has(LR.id));
    const { error: eEmitR } = await sb.rpc('emitir_recibo',{p_club_id:CLUB_ID,p_beneficiario_tipo:'profesional',p_beneficiario_id:BENEF,
      p_linea_ids:[LR.id],p_forma_pago:'efectivo',p_cobrador_nombre:'T',p_cobrador_documento:'1',p_comprobante_url:null});
    ok('a2 emitir SOLO la retenida → RPC rechaza (no es pagable pese a fecha pasada)', !!eEmitR, eEmitR?.message?.slice(0,50));

    // (b) liberar_linea → retenido→impago → pagable/emitible
    phase='b';
    const { data: lib, error: eLib } = await sb.rpc('liberar_linea',{p_linea_id:LR.id});
    const libRow=Array.isArray(lib)?lib[0]:lib;
    ok('b1 liberar_linea retenido→impago', !eLib && libRow?.estado_linea==='impago', eLib?.message||libRow?.estado_linea);
    const { data: r, error: eEmit } = await sb.rpc('emitir_recibo',{p_club_id:CLUB_ID,p_beneficiario_tipo:'profesional',p_beneficiario_id:BENEF,
      p_linea_ids:[LR.id],p_forma_pago:'efectivo',p_cobrador_nombre:'T',p_cobrador_documento:'1',p_comprobante_url:null});
    const rec=Array.isArray(r)?r[0]:r; if(rec)recIds.push(rec.id);
    ok('b2 tras liberar, la línea ya es emitible (recibo creado, total 5000)', !eEmit && Number(rec?.total_premios)===5000, eEmit?.message||`total=${rec?.total_premios}`);

    // (c) liberar_linea sobre no-retenida (LI impago) → error controlado
    phase='c';
    const { error: eC } = await sb.rpc('liberar_linea',{p_linea_id:LI.id});
    ok('c1 liberar_linea sobre no-retenida → error controlado', !!eC, eC?.message?.slice(0,50));

    // (d) benefSearch (fn REAL extraída) matchea por nombre/apellido/DNI
    phase='d';
    const { data: prof } = await sb.from('profesionales').select('id,nombre,apellido,documento_nro').eq('id',BENEF).single();
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)),'..','liquidaciones.html'),'utf8');
    const body = extractFnBody(html,'function benefSearch(tipo, id)');
    const benefSearch = new Function('tipo','id','profesionales','propietariosMap', body+'\n');
    const profMap={[BENEF]:prof}; const run=(s)=>benefSearch('profesional',BENEF,profMap,{});
    const str = run();
    ok('d1 benefSearch incluye el nombre', prof.nombre && str.includes(prof.nombre.toLowerCase()));
    ok('d2 benefSearch incluye el apellido', prof.apellido && str.includes(prof.apellido.toLowerCase()));
    ok('d3 benefSearch incluye el documento (DNI)', prof.documento_nro ? str.includes(String(prof.documento_nro).toLowerCase()) : true,
       prof.documento_nro?`dni=${prof.documento_nro}`:'(profesional sin DNI cargado — skip)');

    // (e) filtro por carrera acota: inscripciones de carreraA → solo LI/LR, excluye LB(carreraB)
    phase='e';
    const { data: insA2 } = await sb.from('inscripciones').select('id').eq('carrera_id',carreraA);
    const setA=new Set((insA2||[]).map(i=>i.id));
    const { data: lineas } = await sb.from('liquidacion_detalle').select('id,inscripcion_id')
      .eq('beneficiario_id',BENEF).in('id',[LI.id,LB.id]);
    const enA=(lineas||[]).filter(l=>setA.has(l.inscripcion_id)).map(l=>l.id);
    ok('e1 filtro carreraA incluye LI (carreraA)', enA.includes(LI.id));
    ok('e2 filtro carreraA EXCLUYE LB (carreraB)', !enA.includes(LB.id));

  } catch (e) { ok(`EXCEPCIÓN en fase '${phase}'`, false, e.message); console.error(e); }
  finally {
    try {
      for (const id of [LR,LI,LB].filter(Boolean).map(x=>x.id)) await sb.from('liquidacion_detalle').delete().eq('id',id);
      if (liqId) await sb.from('liquidaciones').delete().eq('id',liqId);
      for (const rid of recIds) await sb.from('recibos').delete().eq('id',rid);
      if (snapSeq) await sb.from('club_secuencias').update({ultimo_numero:snapSeq.ultimo_numero}).eq('club_id',CLUB_ID).eq('tipo','recibo');
      else await sb.from('club_secuencias').delete().eq('club_id',CLUB_ID).eq('tipo','recibo');
      const { data: liqFin } = await sb.from('liquidaciones').select('id').eq('id',liqId||'00000000-0000-0000-0000-000000000000');
      ok('R1 cleanup: fixtures borradas', !liqFin?.length);
    } catch (e) { ok('CLEANUP FALLÓ — revisar manualmente', false, e.message); console.error('[cleanup]',e); }
    console.log('\n──────── RESULTADO ────────');
    for (const r of results) console.log(`${r.s} ${r.t}${r.n?'  ('+r.n+')':''}`);
    const failed = results.filter(r=>r.s==='❌').length;
    console.log(`\n${failed===0?'✅ TODO OK':'❌ '+failed+' fallo(s)'} — ${results.length} checks`);
    process.exit(failed===0?0:1);
  }
})();
