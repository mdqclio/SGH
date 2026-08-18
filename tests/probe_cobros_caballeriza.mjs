/**
 * Probe — búsqueda por caballeriza en el tab Pagos de liquidaciones.html (real-code).
 *
 * Corre el CÓDIGO REAL extraído del archivo, no una copia:
 *   - el bloque de resolución caballeriza → propietario titular de cobrosBuscar()
 *   - benefSearch(), que es el matcheo por nombre / apellido / DNI
 * Sin browser (chromium no corre en ubuntu 26.04). Read-only: sólo SELECT.
 *
 * Checks:
 *   a) la query de caballerizas no falla y devuelve filas
 *   b) matchea una caballeriza PROVISORIA de hoy (LA MILINGA)
 *   c) matchea una caballeriza PREEXISTENTE (POR TU CULPA)
 *   d) benefSearch sigue matcheando por nombre, apellido y DNI
 *   e) los copropietarios quedan fuera de la resolución por caballeriza
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) throw new Error('Falta SUPABASE_SECRET_KEY (source .env antes de correr).');
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'liquidaciones.html'), 'utf8');

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

// ── Extraer el bloque REAL de resolución de caballerizas ────────────────────
const marca = '// caballerizas → propietario titular (para búsqueda por caballeriza)';
const desde = SRC.indexOf(marca);
if (desde < 0) throw new Error('no encontré el bloque de caballerizas en liquidaciones.html');
const bloque = SRC.slice(desde, SRC.indexOf('const propIdsPorCaballeriza', desde));
ok('el bloque extraído es el nuevo (rol/activo, no es_titular)',
   bloque.includes(".eq('rol','propietario')") && bloque.includes(".eq('activo', true)") &&
   !bloque.includes('es_titular'));
ok('el bloque captura el error (console.error)', bloque.includes('console.error'));

let cobCaballerizas = [];
const errores = [];
const consoleReal = console.error;
console.error = (...a) => errores.push(a);
await new Function('sb', 'cobCaballerizas', `return (async () => { ${bloque}
  return cobCaballerizas; })();`)(sb, cobCaballerizas)
  .then(r => { cobCaballerizas = r; });
console.error = consoleReal;

// a) la query no falla
ok('a) la query de caballerizas no emitió error', errores.length === 0,
   errores.length ? JSON.stringify(errores[0]) : '');
ok('a) devuelve filas', cobCaballerizas.length > 0, `${cobCaballerizas.length} caballerizas`);

// b/c) matcheo por nombre de caballeriza, igual que la pantalla
const matchear = q => new Set(cobCaballerizas.filter(c => c.nombre.includes(q)).map(c => c.propietario_id));

const prov = matchear('la milinga');
ok('b) LA MILINGA (provisoria de hoy) resuelve a un propietario', prov.size === 1, [...prov][0] || '');
const pre = matchear('por tu culpa');
ok('c) POR TU CULPA (preexistente) resuelve a un propietario', pre.size === 1, [...pre][0] || '');

// que el propietario resuelto sea el correcto
const { data: chk } = await sb.from('propietarios')
  .select('id,nombre,notas').in('id', [...prov, ...pre]);
const provRow = (chk || []).find(p => prov.has(p.id));
const preRow  = (chk || []).find(p => pre.has(p.id));
ok('b) el de LA MILINGA es el provisorio de hoy',
   !!provRow && /^provisorio R8/.test(provRow.notas || ''), provRow?.nombre);
ok('c) el de POR TU CULPA es un propietario real (sin marca)',
   !!preRow && !/^provisorio R8/.test(preRow.notas || ''), preRow?.nombre);

// e) los copropietarios no entran: ninguno que sea SOLO copropietario aparece resuelto
const { data: copro } = await sb.from('caballeriza_responsables')
  .select('propietario_id').eq('rol', 'copropietario').not('propietario_id', 'is', null);
const { data: titulares } = await sb.from('caballeriza_responsables')
  .select('propietario_id').eq('rol', 'propietario').eq('activo', true).not('propietario_id', 'is', null);
const idsTitular = new Set((titulares || []).map(t => t.propietario_id));
const soloCopro = [...new Set((copro || []).map(c => c.propietario_id))].filter(id => !idsTitular.has(id));
const idsResueltos = new Set(cobCaballerizas.map(c => c.propietario_id));
const filtrados = soloCopro.filter(id => idsResueltos.has(id));
ok('e) ningún propietario que sea sólo copropietario aparece resuelto',
   soloCopro.length > 0 && filtrados.length === 0,
   `${soloCopro.length} sólo-copropietarios, ${filtrados.length} colados`);

// d) benefSearch REAL, sin tocar: nombre / apellido / DNI
const benefSrc = SRC.slice(SRC.indexOf('function benefSearch'),
                           SRC.indexOf('function hoyISO'));
const [{ data: profs }, { data: props }] = await Promise.all([
  sb.from('profesionales').select('id,nombre,apellido,documento_nro').eq('club_id', CLUB_ID),
  sb.from('propietarios').select('id,nombre,nombre_stud,documento_nro').eq('activo', true),
]);
const profesionales = {}, propietariosMap = {};
(profs || []).forEach(p => { profesionales[p.id] = p; });
(props || []).forEach(p => { propietariosMap[p.id] = p; });
const benefSearch = new Function('profesionales', 'propietariosMap',
  `${benefSrc}; return benefSearch;`)(profesionales, propietariosMap);

const prof = (profs || []).find(p => p.apellido && p.nombre && p.documento_nro);
ok('d) benefSearch matchea por apellido de profesional',
   benefSearch('profesional', prof.id).includes(prof.apellido.toLowerCase()), prof.apellido);
ok('d) benefSearch matchea por nombre de profesional',
   benefSearch('profesional', prof.id).includes(prof.nombre.toLowerCase()), prof.nombre);
ok('d) benefSearch matchea por DNI de profesional',
   benefSearch('profesional', prof.id).includes(prof.documento_nro.toLowerCase()), prof.documento_nro);
const propC = (props || []).find(p => p.documento_nro);
ok('d) benefSearch matchea por DNI de propietario',
   benefSearch('propietario', propC.id).includes(propC.documento_nro.toLowerCase()), propC.nombre);
ok('d) benefSearch matchea por nombre de propietario',
   benefSearch('propietario', propC.id).includes(propC.nombre.toLowerCase()), propC.nombre);

for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  → ' + r.n : ''}`);
const fail = results.filter(r => r.s === '❌').length;
console.log(`\n${results.length - fail}/${results.length} checks OK`);
process.exit(fail ? 1 : 0);
