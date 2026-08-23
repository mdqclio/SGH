/**
 * probe_activacion_pendiente.mjs — red de contención del alta por invitación.
 *
 * Verifica el fix de docs/FIX_ACTIVACION_INVITADOS.md con el patrón de harness
 * de código REAL (tests/README.md): se extrae el cuerpo de las funciones tal
 * como están en el HTML que sirve prod y se ejecuta con dependencias stubbeadas.
 * No hay reimplementación: si alguien edita login.html, esto corre lo editado.
 *
 * Lo que se prueba:
 *   G1-G5  gate de esRescatable()   — activacion-pendiente.js REAL
 *   M1-M3  mensajeInactivo()        — activacion-pendiente.js REAL
 *   L1-L5  doLogin()                — login.html REAL
 *   T1-T2  toggleActivo()           — usuarios.html REAL
 *
 * El requisito central (L2-L4): un usuario inactivo ve un AVISO y NO entra a
 * una pantalla vacía.
 *
 * NO cubierto: el UPDATE real contra RLS. Exige una sesión de un usuario
 * inactivo de verdad (contraseña que no tenemos). Acá se verifica que el
 * llamado se arma bien y que el código reacciona correcto a las dos respuestas
 * posibles (filas / 0 filas), que es lo que decide qué ve el usuario.
 *
 *   node tests/probe_activacion_pendiente.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

let ok = 0, fail = 0;
const check = (id, cond, desc, extra = '') => {
  if (cond) { ok++; console.log(`  ✅ ${id}  ${desc}`); }
  else      { fail++; console.log(`  ❌ ${id}  ${desc}${extra ? '\n        → ' + extra : ''}`); }
};

/** Extrae el cuerpo de una función del fuente, balanceando llaves. */
function cuerpoDe(src, firma) {
  const i = src.indexOf(firma);
  if (i === -1) throw new Error(`no encontré "${firma}" — ¿cambió la firma?`);
  const abre = src.indexOf('{', i + firma.length - 1);
  let n = 0;
  for (let j = abre; j < src.length; j++) {
    if (src[j] === '{') n++;
    else if (src[j] === '}') { n--; if (n === 0) return src.slice(abre + 1, j); }
  }
  throw new Error(`llaves desbalanceadas en "${firma}"`);
}

/** Cliente Supabase falso, encadenable, que registra lo que se le pidió. */
function sbFalso({ fila, filasUpdate = null, errorUpdate = null, log }) {
  const q = (op) => {
    const ctx = { op, filtros: {}, payload: null };
    const chain = {
      select() {
        // ctx.op, NO el `op` del closure: update() lo reescribe.
        if (ctx.op !== 'update') return chain;
        log.push(ctx);
        return Promise.resolve({ data: filasUpdate, error: errorUpdate });
      },
      update(p) { ctx.op = 'update'; ctx.payload = p; return chain; },
      eq(c, v) { ctx.filtros[c] = v; return chain; },
      single()      { log.push(ctx); return Promise.resolve({ data: fila, error: fila ? null : { message: 'no rows' } }); },
      maybeSingle() { log.push(ctx); return Promise.resolve({ data: fila, error: null }); },
    };
    return chain;
  };
  return {
    from: () => q('select'),
    auth: {
      signInWithPassword: async () => ({ data: { session: { user: { email: 'x@y.z' } } }, error: null }),
      signOut: async () => { log.push({ op: 'signOut' }); return {}; },
      getSession: async () => ({ data: { session: { user: { email: 'x@y.z' } } } }),
    },
  };
}

// --- carga del helper REAL en un window falso -------------------------------
const helperSrc = readFileSync(join(RAIZ, 'activacion-pendiente.js'), 'utf8');
const win = {};
new Function('window', helperSrc)(win);
const AP = win.ActivacionPendiente;

console.log('\n=== G — gate esRescatable() (activacion-pendiente.js REAL) ===');
const FEDE   = { id: 'f', rol: 'secretario_carreras', activo: false, estado: 'pendiente' };
const PORTAL = { id: 'p', rol: 'propietario',         activo: false, estado: 'pendiente' };
const BAJA   = { id: 'b', rol: 'operador',            activo: false, estado: 'inactivo'  };
const BAJA_VIEJA = { id: 'v', rol: 'operador',        activo: false, estado: 'activo'    };
const SANO   = { id: 's', rol: 'operador',            activo: true,  estado: 'activo'    };

check('G1', AP.esRescatable(FEDE) === true,
  'invitación de staff sin completar (Fede) → SÍ se auto-activa');
check('G2', AP.esRescatable(PORTAL) === false,
  'autorregistro de portal pendiente → NO (es la cola de aprobación de admin.html)');
check('G3', AP.esRescatable(BAJA) === false,
  'baja administrativa (estado=inactivo) → NO (la baja no puede ser un placebo)');
check('G4', AP.esRescatable(BAJA_VIEJA) === false,
  'baja vieja que dejó estado=activo → NO');
check('G5', AP.esRescatable(SANO) === false,
  'cuenta ya activa → NO (no hay nada que rescatar)');

console.log('\n=== M — mensajeInactivo() ===');
check('M1', /pendiente de activación/i.test(AP.mensajeInactivo(FEDE)),
  'pendiente → "pendiente de activación"');
check('M2', /desactivada/i.test(AP.mensajeInactivo(BAJA)),
  'baja → "desactivada"');
check('M3', /rechazado/i.test(AP.mensajeInactivo({ estado: 'rechazado' })),
  'rechazado → "rechazado"');

// --- doLogin REAL de login.html ---------------------------------------------
const loginSrc = readFileSync(join(RAIZ, 'login.html'), 'utf8');
const doLoginBody = cuerpoDe(loginSrc, 'async function doLogin(e)');

async function correrLogin({ fila, filasUpdate }) {
  const log = [];
  const errores = [];
  const redirects = [];
  const sb = sbFalso({ fila, filasUpdate, log });
  const documentStub = {
    getElementById: (id) => ({ value: id === 'email' ? 'x@y.z' : 'secreta', disabled: false, innerHTML: '', textContent: '', classList: { add() {}, remove() {} } }),
  };
  const windowStub = { ActivacionPendiente: AP, location: { replace: (u) => redirects.push(u) } };
  const fn = new AsyncFunction(
    'e', 'sb', 'document', 'window', 'hideError', 'showError', 'setLoading', 'cfToken', 'cfReset',
    doLoginBody);
  await fn({ preventDefault() {} }, sb, documentStub, windowStub,
    () => {}, (m) => errores.push(m), () => {}, () => 'token-ok', () => {});
  return { errores, redirects, log };
}

console.log('\n=== L — doLogin() (login.html REAL) ===');

// L1 — Fede, con el UPDATE de rescate pegando: entra sin enterarse de nada.
{
  const r = await correrLogin({ fila: { ...FEDE, club_id: 'c1' }, filasUpdate: [{ id: 'f', activo: true, estado: 'activo' }] });
  check('L1', r.redirects.includes('index.html') && r.errores.length === 0,
    'invitación vencida → se auto-activa y entra normal',
    `redirects=${JSON.stringify(r.redirects)} errores=${JSON.stringify(r.errores)}`);
  const upd = r.log.find(x => x.op === 'update');
  check('L1b', upd && upd.payload.activo === true && upd.payload.estado === 'activo'
             && upd.filtros.activo === false && upd.filtros.estado === 'pendiente',
    'el UPDATE de rescate va acotado (activo+estado, y sólo sobre una fila pendiente)',
    JSON.stringify(upd));
}

// L2 — REQUISITO CENTRAL: rescate imposible → aviso, y NO entra.
{
  const r = await correrLogin({ fila: { ...FEDE, club_id: 'c1' }, filasUpdate: [] });
  check('L2', r.errores.some(m => /pendiente de activación/i.test(m)) && r.redirects.length === 0,
    'no se pudo activar → VE EL AVISO y NO entra a pantalla vacía',
    `redirects=${JSON.stringify(r.redirects)} errores=${JSON.stringify(r.errores)}`);
  check('L2b', r.log.some(x => x.op === 'signOut'),
    'además se cierra la sesión (no queda a medio camino)');
}

// L3 — portal pendiente de aprobación: aviso, y NO se auto-aprueba.
{
  const r = await correrLogin({ fila: { ...PORTAL, club_id: 'c1' }, filasUpdate: [] });
  check('L3', r.errores.length === 1 && r.redirects.length === 0 && !r.log.some(x => x.op === 'update'),
    'autorregistro pendiente → aviso, sin entrar y SIN auto-aprobarse',
    `redirects=${JSON.stringify(r.redirects)} update=${r.log.some(x => x.op === 'update')}`);
}

// L4 — baja administrativa: aviso correcto, y no revive.
{
  const r = await correrLogin({ fila: { ...BAJA, club_id: 'c1' }, filasUpdate: [] });
  check('L4', r.errores.some(m => /desactivada/i.test(m)) && r.redirects.length === 0
           && !r.log.some(x => x.op === 'update'),
    'usuario dado de baja → "cuenta desactivada", no entra y NO se reactiva',
    `errores=${JSON.stringify(r.errores)}`);
}

// L5 — no regresión: el usuario sano entra igual que siempre.
{
  const r = await correrLogin({ fila: { ...SANO, club_id: 'c1' }, filasUpdate: null });
  check('L5', r.redirects.includes('index.html') && r.errores.length === 0
           && !r.log.some(x => x.op === 'update'),
    'usuario activo → entra normal, sin UPDATE de más');
}

// --- toggleActivo REAL de usuarios.html -------------------------------------
const usuariosSrc = readFileSync(join(RAIZ, 'usuarios.html'), 'utf8');
const toggleBody = cuerpoDe(usuariosSrc, 'async function toggleActivo(id, activo)');

async function correrToggle(activo) {
  const log = [];
  const sb = sbFalso({ fila: null, filasUpdate: [], log });
  // update().eq() sin .select(): hay que resolver el thenable al final de la cadena.
  sb.from = () => {
    const ctx = { op: 'update', filtros: {}, payload: null };
    const chain = {
      update(p) { ctx.payload = p; return chain; },
      eq(c, v) { ctx.filtros[c] = v; log.push(ctx); return Promise.resolve({ error: null }); },
    };
    return chain;
  };
  const fn = new AsyncFunction('sb', 'allData', 'confirm', 'toast', 'load', 'id', 'activo', toggleBody);
  await fn(sb, [{ id: 'u1', nombre_completo: 'Test' }], () => true, () => {}, () => {}, 'u1', activo);
  return log.find(x => x.op === 'update');
}

console.log('\n=== T — toggleActivo() (usuarios.html REAL) ===');
{
  const up = await correrToggle(true);
  check('T1', up && up.payload.activo === true && up.payload.estado === 'activo',
    'Activar escribe activo=true Y estado=activo (normalización)', JSON.stringify(up?.payload));
}
{
  const up = await correrToggle(false);
  check('T2', up && up.payload.activo === false && up.payload.estado !== 'pendiente'
           && AP.esRescatable({ ...up.payload, id: 'u1', rol: 'operador' }) === false,
    'Desactivar NUNCA deja estado=pendiente → la baja no se auto-revierte',
    JSON.stringify(up?.payload));
}

console.log(`\n${'='.repeat(60)}\n${fail === 0 ? '✅ TODO VERDE' : '❌ HAY FALLAS'} — ${ok} ok, ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
