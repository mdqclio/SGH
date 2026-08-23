#!/usr/bin/env node
/**
 * probe_portal_validacion.mjs — la validación de inscripción del portal BLOQUEA
 *
 * Bug original (portal.html:608): la RPC devuelve
 * TABLE(puede_inscribirse boolean, motivo text) y el front leía `valResult.valido`.
 * `undefined === false` es siempre falso → edad, sexo, cupo y sanción se
 * calculaban en el servidor y se descartaban en el cliente. Nada bloqueaba.
 * Además el error de la RPC no se capturaba: si fallaba, se insertaba igual.
 *
 * Corre el confirmarInscripcion REAL de portal.html (harness de tests/README.md)
 * contra la DB de prod, con el INSERT INTERCEPTADO: se registra la intención de
 * insertar, nunca se escribe. Cero filas creadas.
 *
 * Uso:  set -a; . ./.env; set +a; node tests/probe_portal_validacion.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY'); process.exit(1); }
const real = createClient('https://unlhcuanfrtpatoipwve.supabase.co', KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

// Carreras de R9 (20/09) y SPCs, verificados en la sesión del 2026-08-23.
const T1 = 'c037b139-b8b5-46d7-900e-cbc7a01bd643'; // turno 1 — edad 3 a 3
const T2 = '2d4016ad-460a-44c9-9b2d-d710a510edee'; // turno 2 — edad 4 a 4
const CASOS = [
  { n: 'A edad insuficiente  (Es Mistres 2a → turno 1, mín 3)', spc: '9fc5b39c-0579-4cd9-acbb-f023ab35d168', carrera: T1, debeBloquear: true },
  { n: 'B excede edad máxima (Pampero Real 4a → turno 1, máx 3)', spc: '555690c6-d426-45f4-82e5-c5caad9a0cec', carrera: T1, debeBloquear: true },
  { n: 'C sanción vigente    (El Pampeano 4a → turno 2, 4-4)', spc: '3b54e7ff-6bf1-4949-ba40-3f838323b492', carrera: T2, debeBloquear: true },
  { n: 'D caso válido        (Pampero Real 4a → turno 2, 4-4)', spc: '555690c6-d426-45f4-82e5-c5caad9a0cec', carrera: T2, debeBloquear: false },
  { n: 'E la RPC falla       (fail-closed)', spc: '555690c6-d426-45f4-82e5-c5caad9a0cec', carrera: T2, debeBloquear: true, romperRpc: true },
];

// --- Código real ---
const html = readFileSync(new URL('../portal.html', import.meta.url), 'utf8');
const desde = html.indexOf('async function confirmarInscripcion');
const hasta = html.indexOf('/* ========== MIS INSCRIPCIONES ========== */');
if (desde < 0 || hasta < 0) { console.error('No se pudo extraer confirmarInscripcion'); process.exit(1); }
const codigo = html.slice(desde, hasta);

let fallos = 0;
console.log('\n== probe_portal_validacion ==\n');

for (const c of CASOS) {
  const insertsIntentados = [];
  // Cliente que delega TODO al real, salvo el INSERT sobre inscripciones, que se
  // intercepta. La RPC y el SELECT de carreras pegan contra prod de verdad.
  const sb = {
    from: (tabla) => tabla === 'inscripciones'
      ? { insert: async (payload) => { insertsIntentados.push(payload); return { error: null }; } }
      : real.from(tabla),
    rpc: (nombre, args) => c.romperRpc
      ? { maybeSingle: async () => ({ data: null, error: { message: 'simulado: la RPC no respondió' } }) }
      : real.rpc(nombre, args),
  };
  const campos = {
    'minsc-spc-id': { value: c.spc },
    'minsc-btn': { disabled: false },
    'validation-msg': { textContent: '', className: '', style: {} },
  };
  const document = { getElementById: (id) => campos[id] ?? null };
  const errores = [];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const correr = new AsyncFunction('sb', 'document', 'toast', 'console', 'carreraSeleccionada', 'currentUser', 'propietarioId', 'profesionalId', 'closeModalInscribir',
    `let cartaLoaded = true, inscLoaded = true;
     ${codigo}
     await confirmarInscripcion();`);
  await correr(sb, document, () => {}, { ...console, error: (...a) => errores.push(a.map(String).join(' ')) },
    { id: c.carrera }, { rol: 'profesional' }, null, null, () => {});

  const bloqueo = insertsIntentados.length === 0;
  const bien = bloqueo === c.debeBloquear;
  if (!bien) fallos++;
  console.log(`${bien ? '  ok  ' : ' FALLA'} ${c.n}`);
  console.log(`        ${bloqueo ? 'BLOQUEÓ' : 'INSERTÓ'} · mensaje: ${campos['validation-msg'].textContent || '(ninguno)'}`);
}

console.log(`\n${fallos === 0 ? '✅ TODO OK' : `❌ ${fallos} fallo(s)`} — 0 filas escritas en prod (INSERT interceptado)\n`);
process.exit(fallos === 0 ? 0 : 1);
