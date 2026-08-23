#!/usr/bin/env node
/**
 * probe_portal_validacion_rls.mjs — la validación bloquea DESDE EL PORTAL DE VERDAD
 *
 * El hermano de este probe (probe_portal_validacion.mjs) corre con
 * SUPABASE_SECRET_KEY, o sea `service_role`, que SALTEA RLS. Prueba que el front
 * y la lógica del servidor están bien, pero mira desde el lado equivocado del
 * vidrio: no prueba que el portal bloquee.
 *
 * Este corre el mismo confirmarInscripcion real con la SESIÓN REAL del usuario de
 * portal — JWT emitido por Supabase Auth (magic link vía admin API, patrón de
 * tests/README.md), publishable key, PostgREST de prod, RLS activo. Es el camino
 * exacto del navegador.
 *
 * El INSERT sigue interceptado: se registra la intención, nunca se escribe.
 *
 * Uso:  set -a; . ./.env; set +a; node tests/probe_portal_validacion_rls.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const URL_SB = 'https://unlhcuanfrtpatoipwve.supabase.co';
const PUBLISHABLE = 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const PORTAL_EMAIL = 'hipodromodolores@gmail.com';   // único usuario rol=profesional

const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!SECRET) { console.error('Falta SUPABASE_SECRET_KEY'); process.exit(1); }

const admin = createClient(URL_SB, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });

// --- Sesión real del usuario de portal -------------------------------------
// generateLink NO manda mail y NO toca la contraseña: solo emite un OTP que se
// canjea por una sesión. Es la forma de tener el JWT real sin conocer la clave.
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
  type: 'magiclink', email: PORTAL_EMAIL,
});
if (linkErr) { console.error('No se pudo generar el magic link:', linkErr.message); process.exit(1); }

const portal = createClient(URL_SB, PUBLISHABLE, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: sesion, error: otpErr } = await portal.auth.verifyOtp({
  email: PORTAL_EMAIL, token: link.properties.email_otp, type: 'email',
});
if (otpErr) { console.error('No se pudo canjear el OTP:', otpErr.message); process.exit(1); }
console.log(`\n== probe_portal_validacion_rls ==\nsesión real de ${sesion.user.email} (sub ${sesion.user.id})\n`);

// Chequeo de cordura: si esto no da true, la sesión no es de portal y el probe
// estaría midiendo cualquier cosa.
const { data: esPortal } = await portal.rpc('fn_is_portal_user');
console.log(`fn_is_portal_user() = ${esPortal}${esPortal ? '' : '   ← ¡la sesión no es de portal!'}\n`);

// Carreras de R9 (20/09) y SPCs, verificados el 2026-08-23.
const T1 = 'c037b139-b8b5-46d7-900e-cbc7a01bd643'; // turno 1 — edad 3 a 3
const T2 = '2d4016ad-460a-44c9-9b2d-d710a510edee'; // turno 2 — edad 4 a 4
const CASOS = [
  { n: 'A edad insuficiente  (Es Mistres 2a → turno 1, mín 3)',   spc: '9fc5b39c-0579-4cd9-acbb-f023ab35d168', carrera: T1, debeBloquear: true },
  { n: 'B excede edad máxima (Pampero Real 4a → turno 1, máx 3)', spc: '555690c6-d426-45f4-82e5-c5caad9a0cec', carrera: T1, debeBloquear: true },
  { n: 'C sanción vigente    (El Pampeano 4a → turno 2, 4-4)',    spc: '3b54e7ff-6bf1-4949-ba40-3f838323b492', carrera: T2, debeBloquear: true },
  { n: 'D caso válido        (Pampero Real 4a → turno 2, 4-4)',   spc: '555690c6-d426-45f4-82e5-c5caad9a0cec', carrera: T2, debeBloquear: false },
];

// --- Código real de portal.html --------------------------------------------
const html = readFileSync(new URL('../portal.html', import.meta.url), 'utf8');
const desde = html.indexOf('async function confirmarInscripcion');
const hasta = html.indexOf('/* ========== MIS INSCRIPCIONES ========== */');
if (desde < 0 || hasta < 0) { console.error('No se pudo extraer confirmarInscripcion'); process.exit(1); }
const codigo = html.slice(desde, hasta);

let fallos = 0;
for (const c of CASOS) {
  const insertsIntentados = [];
  // Todo pasa por la sesión real; solo el INSERT sobre inscripciones se intercepta.
  const sb = {
    from: (tabla) => tabla === 'inscripciones'
      ? { insert: async (payload) => { insertsIntentados.push(payload); return { error: null }; } }
      : portal.from(tabla),
    rpc: (nombre, args) => portal.rpc(nombre, args),
  };
  const campos = {
    'minsc-spc-id': { value: c.spc },
    'minsc-btn': { disabled: false },
    'validation-msg': { textContent: '', className: '', style: {} },
  };
  const document = { getElementById: (id) => campos[id] ?? null };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const correr = new AsyncFunction('sb', 'document', 'toast', 'console', 'carreraSeleccionada', 'currentUser', 'propietarioId', 'profesionalId', 'closeModalInscribir',
    `let cartaLoaded = true, inscLoaded = true;
     ${codigo}
     await confirmarInscripcion();`);
  await correr(sb, document, () => {}, { ...console, error: () => {} },
    { id: c.carrera }, { rol: 'profesional' }, null, null, () => {});

  const bloqueo = insertsIntentados.length === 0;
  const bien = bloqueo === c.debeBloquear;
  if (!bien) fallos++;
  console.log(`${bien ? '  ok  ' : ' FALLA'} ${c.n}`);
  console.log(`        ${bloqueo ? 'BLOQUEÓ' : 'INSERTÓ'} · ${campos['validation-msg'].textContent || '(sin mensaje)'}`);
}

await portal.auth.signOut();
console.log(`\n${fallos === 0 ? '✅ TODO OK' : `❌ ${fallos} fallo(s)`} — 0 filas escritas en prod (INSERT interceptado)\n`);
process.exit(fallos === 0 ? 0 : 1);
