/**
 * activacion-pendiente.js — red de contención del alta por invitación.
 *
 * PROBLEMA (diagnóstico completo en docs/FIX_ACTIVACION_INVITADOS.md)
 * -------------------------------------------------------------------
 * `invite-user` inserta la fila con `activo=false, estado='pendiente'` y la
 * activación la hace el propio invitado en reset-password.html al fijar su
 * contraseña. Si el link de invitación vence (GoTrue: 24 h por defecto) el
 * usuario entra por "olvidé mi contraseña" y esa activación no corre: queda
 * con sesión válida y `activo=false`. Como 72 de las 124 policies filtran por
 * `fn_get_user_club_id()` —que exige `activo`— el sistema le muestra TODO
 * vacío, sin un solo mensaje. Pasó con Valeria (16/08) y con Fede (23/08).
 *
 * ESTA RED
 * --------
 * Al entrar, si la fila propia sigue pendiente, el usuario la activa él mismo.
 * No hace falta service_role: la policy `usuarios_update` ya permite la rama
 * `auth_user_id = auth.uid()`, y reset-password.html hace exactamente este
 * mismo UPDATE desde julio. No se agrega ninguna capacidad nueva al cliente.
 *
 * POR QUÉ EL GATE ES TAN ESTRECHO — leer antes de ampliarlo
 * --------------------------------------------------------
 * `activo` y `estado` están sobrecargados y hay DOS colas distintas que usan
 * el mismo `estado='pendiente'`:
 *
 *   1. Invitación de staff sin aceptar  → la barrera ya la pasó: sólo un
 *      super_admin puede invitar (`usuarios_insert WITH CHECK
 *      fn_is_super_admin()`). Invitar ES habilitar. Esto sí se auto-rescata.
 *
 *   2. Autorregistro de portal esperando aprobación → admin.html lista
 *      `usuarios WHERE estado='pendiente'` con botones Aprobar/Rechazar.
 *      Auto-rescatar esto sería AUTO-APROBAR la cola del administrador.
 *      Por eso los roles de portal quedan explícitamente afuera.
 *
 *   3. Baja administrativa (botón "Desactivar" de usuarios.html) → escribe
 *      `activo=false` dejando `estado='activo'`. Reactivar eso convertiría
 *      una baja en un placebo. Por eso se exige `estado==='pendiente'`.
 *
 * El invariante del punto 3 lo sostiene usuarios.html: al desactivar NUNCA
 * debe escribir `estado='pendiente'`. Está cubierto por
 * tests/probe_activacion_pendiente.mjs — si lo cambiás, ese probe se pone rojo.
 */
(function () {
  'use strict';

  // Roles que sólo pueden nacer de una invitación de super_admin.
  // Los de portal (propietario/profesional) se dan de alta solos y los aprueba
  // un humano: NO entran acá.
  const ROLES_STAFF = ['super_admin', 'secretario_carreras', 'operador'];

  /**
   * ¿La fila es una invitación de staff sin completar? Pura decisión, sin I/O:
   * así el probe la puede ejercitar sin tocar la base.
   */
  function esRescatable(fila) {
    if (!fila) return false;
    if (fila.activo !== false) return false;          // ya está activa
    if (fila.estado !== 'pendiente') return false;    // baja administrativa
    return ROLES_STAFF.indexOf(fila.rol) !== -1;      // portal → cola de admin
  }

  /**
   * Intenta activar la fila propia. NUNCA tira: devuelve
   * { rescatado:true, fila } | { rescatado:false, motivo }.
   * El llamador decide qué mostrar según el motivo.
   */
  async function rescatar(sb, fila) {
    if (!esRescatable(fila)) {
      return { rescatado: false, motivo: 'no_rescatable' };
    }

    // Los .eq() de activo/estado hacen el UPDATE idempotente y a prueba de
    // carreras: si otro tab ya lo activó, devuelve 0 filas en vez de pisar.
    // El filtro por auth_user_id lo pone RLS, no hace falta repetirlo acá.
    const { data, error } = await sb
      .from('usuarios')
      .update({ activo: true, estado: 'activo' })
      .eq('id', fila.id)
      .eq('activo', false)
      .eq('estado', 'pendiente')
      .select('id, activo, estado');

    if (error) {
      console.error('[activacion-pendiente] falló el UPDATE', error);
      return { rescatado: false, motivo: 'update_error', error };
    }
    if (!data || !data.length) {
      // Con RLS, un UPDATE que no matchea no da error: devuelve 0 filas.
      console.warn('[activacion-pendiente] 0 filas — ¿auth_user_id sin cargar?');
      return { rescatado: false, motivo: 'sin_filas' };
    }
    return { rescatado: true, fila: data[0] };
  }

  /**
   * Texto para el usuario cuando su cuenta sigue inactiva. Distingue los tres
   * casos: nunca más una pantalla vacía sin explicación.
   */
  function mensajeInactivo(fila) {
    if (!fila) return 'Tu usuario no está registrado en el sistema. Contactá al administrador.';
    if (fila.estado === 'rechazado') return 'Tu registro fue rechazado. Contactá al administrador.';
    if (fila.estado === 'pendiente') return 'Tu cuenta está pendiente de activación. Pedile a la secretaría del hipódromo que te habilite.';
    return 'Tu cuenta está desactivada. Contactá a la secretaría del hipódromo.';
  }

  window.ActivacionPendiente = { rescatar, esRescatable, mensajeInactivo, ROLES_STAFF };
})();
