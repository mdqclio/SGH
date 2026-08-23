#!/usr/bin/env node
/**
 * probe_portal_validacion.mjs — el portal SURFACEA el rechazo del servidor
 *
 * Historia: el bug original (portal.html, pre-gate-4) era que `confirmarInscripcion`
 * leía `valResult.valido`, un campo que no existe — la RPC devuelve
 * `TABLE(puede_inscribirse boolean, motivo text)`. `undefined === false` es
 * siempre falso, así que edad, sexo, cupo y sanción se calculaban en el servidor
 * y se descartaban en el cliente. Nada bloqueaba. Además el error de la RPC no se
 * capturaba: si fallaba, insertaba igual.
 *
 * El gate 4 cambió la arquitectura y con eso el bug dejó de ser posible por
 * construcción: el front ya no inserta. Llama a `rpc_inscribir`, que es
 * SECURITY DEFINER, revalida todo server-side (tenencia, ventana, reunión
 * publicada, validar_inscripcion, duplicado en el mismo turno) y es quien hace
 * el INSERT. Si el RPC levanta excepción, no se escribe nada — no hay decisión
 * del cliente que pueda saltearse la validación.
 *
 * Lo que queda por cubrir, y es lo que testea este probe, es el otro extremo:
 * que el rechazo del servidor **se vea en pantalla** y no falle en silencio.
 * Un `anotar` que se coma el error dejaría al entrenador creyendo que anotó.
 *
 * La validación server-side en sí la cubre tests/probe_gate4_inscribir.mjs,
 * que sí pega contra prod. Éste corre el `anotar` REAL de portal.html con el
 * RPC stubeado: no toca la red ni la base. Cero filas escritas.
 *
 * Uso:  node tests/probe_portal_validacion.mjs
 */
import { readFileSync } from 'node:fs';

// --- Código real, extraído de portal.html ---
const html = readFileSync(new URL('../portal.html', import.meta.url), 'utf8');
const desde = html.indexOf('async function anotar');
const hasta = html.indexOf('/* ========== MIS INSCRIPCIONES ========== */');
if (desde < 0 || hasta < 0) {
  console.error('No se pudo extraer anotar() de portal.html');
  process.exit(1);
}
const codigo = html.slice(desde, hasta);

const GENERICO = 'Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.';

const CASOS = [
  {
    n: 'A rechazo con motivo genérico (edad/sexo/sanción/cupo)',
    rpcError: { message: `No se puede inscribir: ${GENERICO}` },
    esperaError: true,
    esperaTexto: GENERICO,
  },
  {
    n: 'B duplicado en el MISMO turno (mensaje sin prefijo)',
    rpcError: { message: 'Ese caballo ya está anotado en ese turno.' },
    esperaError: true,
    esperaTexto: 'Ese caballo ya está anotado en ese turno.',
  },
  {
    n: 'C caballo ajeno — no figura a su nombre',
    rpcError: { message: 'Ese caballo no figura a su nombre. Si corresponde, pedile a la secretaría que lo vincule a su ficha.' },
    esperaError: true,
    esperaTexto: 'que lo vincule a su ficha.',
  },
  {
    n: 'D ventana de inscripción cerrada',
    rpcError: { message: 'La inscripción para ese turno no está abierta.' },
    esperaError: true,
    esperaTexto: 'La inscripción para ese turno no está abierta.',
  },
  {
    n: 'E el RPC no responde (fail-closed, no puede pasar por éxito)',
    rpcError: { message: 'network error' },
    esperaError: true,
    esperaTexto: 'network error',
  },
  {
    n: 'F caso válido — anota y refresca',
    rpcError: null,
    esperaError: false,
  },
];

let fallos = 0;
console.log('\n== probe_portal_validacion — el rechazo se ve en pantalla ==\n');

for (const c of CASOS) {
  const vm = { textContent: '', className: '', style: {} };
  const document = { getElementById: (id) => (id === 'validation-msg' ? vm : null) };

  let rpcLlamado = null;
  const sb = { rpc: async (nombre, args) => { rpcLlamado = { nombre, args }; return { error: c.rpcError }; } };

  const toasts = [];
  let refrescos = 0;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const correr = new AsyncFunction(
    'sb', 'document', 'toast', 'carreraSeleccionada',
    'cargarInscripcionesCrudas', 'renderListaCaballosModal', 'loadLlamado',
    `${codigo}
     await anotar('spc-de-prueba');`);
  await correr(
    sb, document, (m) => toasts.push(m), { id: 'carrera-de-prueba' },
    async () => { refrescos++; }, () => {}, () => {},
  );

  const problemas = [];
  // El RPC es quien inserta: si no se llamó, no se anotó nada.
  if (rpcLlamado?.nombre !== 'rpc_inscribir') problemas.push(`llamó a ${rpcLlamado?.nombre ?? '(nada)'} en vez de rpc_inscribir`);

  if (c.esperaError) {
    if (vm.style.display !== 'block') problemas.push('el mensaje quedó oculto (display != block)');
    if (!/validation-err/.test(vm.className)) problemas.push(`className sin validation-err: "${vm.className}"`);
    if (!vm.textContent.includes(c.esperaTexto)) problemas.push(`el texto no contiene "${c.esperaTexto}" (dice "${vm.textContent}")`);
    if (toasts.length) problemas.push(`toast de éxito indebido: ${toasts.join(' / ')}`);
    if (refrescos) problemas.push('refrescó la lista como si hubiera anotado');
  } else {
    if (!toasts.length) problemas.push('no avisó del alta');
    if (!refrescos) problemas.push('no refrescó las inscripciones');
    if (/validation-err/.test(vm.className)) problemas.push('marcó error en un caso válido');
  }

  const bien = problemas.length === 0;
  if (!bien) fallos++;
  console.log(`${bien ? '  ok  ' : ' FALLA'} ${c.n}`);
  if (!bien) problemas.forEach(p => console.log(`        → ${p}`));
  else if (c.esperaError) console.log(`        mensaje: ${vm.textContent}`);
}

console.log(`\n${fallos === 0 ? '✅ TODO OK' : `❌ ${fallos} fallo(s)`} — sin red y sin base: 0 filas tocadas\n`);
process.exit(fallos === 0 ? 0 : 1);
