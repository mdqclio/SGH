#!/usr/bin/env node
/**
 * probe_portal_carta.mjs — Carta de llamados del portal (regresión del spinner eterno)
 *
 * Bug original: loadCarta() pedía `estado in (publicada, abierta)` — 'abierta' no
 * existe en el ENUM estado_reunion — y embebía `carreras.condicion_edad`, columna
 * inexistente. Dos HTTP 400 independientes; el `return` del catch no limpiaba el
 * spinner, así que la sección quedaba en "Cargando reuniones…" para siempre.
 *
 * Patrón de harness de tests/README.md: se extrae el CÓDIGO REAL de portal.html
 * y se ejecuta con AsyncFunction + cliente Supabase real + stubs de DOM.
 * Sin browser (Playwright no corre en Ubuntu 26.04).
 *
 * Uso:  set -a; . ./.env; set +a; node tests/probe_portal_carta.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(1); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

let fallos = 0;
const ok = (nombre, cond, detalle = '') => {
  console.log(`${cond ? '  ok  ' : ' FALLA'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
  if (!cond) fallos++;
};

// --- Extracción del código real ---
const html = readFileSync(new URL('../portal.html', import.meta.url), 'utf8');
const desde = html.indexOf('function chipEdad');
const hasta = html.indexOf('function abrirInscripcion');
if (desde < 0 || hasta < 0 || hasta <= desde) { console.error('No se pudo extraer loadCarta de portal.html'); process.exit(1); }
const codigo = html.slice(desde, hasta);

// --- Stubs de DOM ---
const contenedor = { innerHTML: '' };
const document = { getElementById: (id) => (id === 'carta-container' ? contenedor : null) };
const toasts = [];
const toast = (msg, tipo) => toasts.push({ msg, tipo });
const formatMonto = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
const errores = [];
const console2 = { ...console, error: (...a) => { errores.push(a.map(String).join(' ')); } };

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const correr = new AsyncFunction(
  'sb', 'document', 'toast', 'formatMonto', 'console',
  `let cartaLoaded = false, reunionesAbiertas = [], carrerasMap = {}, carreraSeleccionada = null;
   ${codigo}
   await loadCarta();
   return { cartaLoaded, reunionesAbiertas };`
);

console.log('\n== probe_portal_carta ==\n');
const { cartaLoaded, reunionesAbiertas } = await correr(sb, document, toast, formatMonto, console2);
const out = contenedor.innerHTML;

ok('1 la consulta no devuelve error (antes: HTTP 400 22P02 + 42703)', errores.length === 0,
   errores[0] || 'sin console.error');
ok('2 el spinner se fue del contenedor', !out.includes('Cargando reuniones'));
ok('3 no quedó estado de error en pantalla', !out.includes('No se pudieron cargar'));
ok('4 cartaLoaded quedó en true tras cargar bien', cartaLoaded === true);
ok('5 trae al menos una reunión', reunionesAbiertas.length >= 1, `${reunionesAbiertas.length} reunión(es)`);
ok('6 ninguna reunión ya corrida', reunionesAbiertas.every(r => r.fecha >= new Date().toISOString().slice(0, 10)),
   reunionesAbiertas.map(r => r.fecha).join(', '));
ok('7 todas en estado publicada', reunionesAbiertas.every(r => r.estado === 'publicada'));
ok('8 las carreras vienen embebidas', reunionesAbiertas.every(r => Array.isArray(r.carreras) && r.carreras.length > 0),
   reunionesAbiertas.map(r => `R${r.numero}:${(r.carreras || []).length}`).join(' '));
ok('9 el HTML renderiza bloques de reunión', out.includes('reunion-block'));
ok('10 hay botones Inscribir', (out.match(/btn-inscribir/g) || []).length > 0,
   `${(out.match(/btn-inscribir/g) || []).length} botones`);
ok('11 no se referencia condicion_edad', !out.includes('condicion_edad') && !codigo.includes('condicion_edad'));
// El literal 'abierta' aparece en los COMENTARIOS del fix (explicando por qué se
// sacó), así que se compara contra el código sin comentarios, no contra el texto crudo.
const codigoSinComentarios = codigo.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
// Se busca el LITERAL entrecomillado, no el substring suelto: el texto de la UI
// dice "No hay reuniones abiertas" / "inscripción abierta", que es prosa legítima.
ok('12 no se pide el estado inexistente "abierta"', !codigoSinComentarios.includes("'abierta'"),
   'literal de ENUM en código sin comentarios');
ok('13 el filtro de estado es publicada', codigoSinComentarios.includes("eq('estado', 'publicada')"));

console.log('\n--- lo que ve el entrenador ---');
for (const r of reunionesAbiertas) {
  console.log(`Reunión ${r.numero_publico ?? r.numero} — ${r.hipodromos?.nombre || '—'} — ${r.fecha} — ${(r.carreras || []).length} carreras`);
  for (const c of (r.carreras || []).sort((a, b) => a.numero_turno - b.numero_turno).slice(0, 3)) {
    console.log(`   ${c.numero_turno}. ${c.nombre || '(sin nombre)'} · ${c.distancia_metros}m · edad[${c.edad_minima_anos ?? '—'}-${c.edad_maxima_anos ?? '—'}] · ${c.tipo_pista || '—'}`);
  }
  if ((r.carreras || []).length > 3) console.log(`   … y ${(r.carreras || []).length - 3} más`);
}

console.log(`\n${fallos === 0 ? '✅ TODO OK' : `❌ ${fallos} fallo(s)`}\n`);
process.exit(fallos === 0 ? 0 : 1);
