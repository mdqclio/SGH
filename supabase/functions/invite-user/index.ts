// ============================================================
// Edge Function: invite-user
// ============================================================
// Alta de usuarios por INVITACIÓN CERRADA (v1).
// Implementa el §2 de docs/plan_alta_invitacion.md (con las correcciones C1/C2
// aprobadas por Leo el 22/07/2026).
//
//   POST /functions/v1/invite-user
//   Auth: header  Authorization: Bearer <access_token DEL CALLER>
//         (el token del admin ya logueado, NO un token de servicio)
//
// Es el ÚNICO lugar del sistema donde existe la key secreta server-side.
// El auto-registro (signUp desde el browser) queda descartado en v1.
//
// SECRETOS — NUNCA en el repo (es público). Sólo por env de la función:
//   INVITE_DB_KEY   → key secreta server-side del proyecto (bypassa RLS).
//                     Se setea con `supabase secrets set`. Se lee SOLO con
//                     Deno.env.get, y el cliente admin se construye DENTRO
//                     del handler (nunca en scope de módulo).
//                     Si no está, se cae a las que inyecta la plataforma
//                     (SGH_SECRET_KEY / SB_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY),
//                     DESCARTANDO las legacy `eyJ...` — están desactivadas en
//                     este proyecto desde 2026-06-07 y devuelven 401. Ver
//                     resolverDbKey().
// Env NO secretas (con fallback razonable):
//   SUPABASE_URL             → lo inyecta la plataforma
//   INVITE_PUBLISHABLE_KEY   → key publishable (pública, ya vive en el repo)
//   INVITE_REDIRECT_URL      → landing del mail de invitación (reset-password.html)
//   INVITE_ALLOWED_ORIGINS   → orígenes CORS permitidos, separados por coma
//
// NOTA de plataforma: si la función queda con `verify_jwt = true` (default),
// la plataforma ya rechaza con 401 antes de llegar acá cuando falta el JWT.
// Igual validamos nosotros: la autorización no puede depender de un default.
// ============================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ------------------------------------------------------------------
// Config
// ------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://unlhcuanfrtpatoipwve.supabase.co';

// Key publishable: es pública por diseño (está en todos los .html del repo).
const PUBLISHABLE_KEY = Deno.env.get('INVITE_PUBLISHABLE_KEY')
  ?? 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';

// Landing del mail de invitación. Ver §4.1 del plan: reset-password.html tiene
// que aceptar `type=invite` y activar la fila de public.usuarios.
// Esta URL DEBE estar en la allowlist de Redirect URLs del Dashboard de Auth,
// si no Auth redirige al Site URL y el token se pierde.
const REDIRECT_URL = Deno.env.get('INVITE_REDIRECT_URL')
  ?? 'https://sigh.com.ar/reset-password.html';

const ALLOWED_ORIGINS = (Deno.env.get('INVITE_ALLOWED_ORIGINS') ?? 'https://sigh.com.ar')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Enum rol_usuario en prod (verificado 22/07/2026 contra pg_enum).
const ROLES_VALIDOS = [
  'super_admin', 'secretario_carreras', 'operador', 'profesional', 'propietario', 'publico',
] as const;
type Rol = typeof ROLES_VALIDOS[number];

// ------------------------------------------------------------------
// §2.1 paso 4 — MAPA de autorización (corrección C2)
// ------------------------------------------------------------------
// Los roles que cada caller puede invitar, y el alcance de club, viven en un
// MAPA DE DATOS — no en una cadena de `if`. Motivo: cuando exista el portal de
// propietarios, `secretario_carreras` va a necesitar invitar `propietario` y
// `profesional`. v1 NO lo habilita, pero el diseño no lo cierra:
// agregar un rol invitable en v2 = agregar un string a `puedeInvitar`.
//
//   puedeInvitar : Set de roles que este caller puede otorgar.
//   alcanceClub  : 'propio'     → el club_id sale de la fila del caller,
//                                 el del body se IGNORA.
//                  'cualquiera' → el club_id sale del body (y es obligatorio).
//
// Un rol de caller que no esté en este mapa → 403. Sin excepciones.
type AlcanceClub = 'propio' | 'cualquiera';
interface ReglaCaller {
  puedeInvitar: ReadonlySet<Rol>;
  alcanceClub: AlcanceClub;
}

const REGLAS_POR_ROL_CALLER: Readonly<Record<string, ReglaCaller>> = {
  super_admin: {
    puedeInvitar: new Set<Rol>(ROLES_VALIDOS),
    alcanceClub: 'cualquiera',
  },
  secretario_carreras: {
    puedeInvitar: new Set<Rol>([
      'secretario_carreras',
      'operador',
      // v2 (portal de propietarios): sumar 'propietario' y 'profesional' acá.
      // Ojo: esos roles tienen club_id nullable en el modelo del portal y
      // `usuarios.club_id` hoy es NOT NULL — v2 tiene que resolver eso también.
    ]),
    alcanceClub: 'propio',
  },
  // operador / profesional / propietario / publico → sin entrada = 403.
};

// ------------------------------------------------------------------
// Resolución de la key admin
// ------------------------------------------------------------------
// Orden de preferencia. `INVITE_DB_KEY` es el secret propio del proyecto y
// gana siempre; el resto son los nombres que la plataforma puede inyectar sola.
const CANDIDATAS_DB_KEY = [
  'INVITE_DB_KEY',
  'SGH_SECRET_KEY',
  'SB_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

// Las legacy `eyJ...` (anon + service_role) están DESACTIVADAS en este proyecto
// desde 2026-06-07: devuelven 401 "Legacy API keys are disabled". Si la
// plataforma sigue inyectando una, usarla daría un fallo tardío y confuso
// (401 en la Admin API) en vez de un `server_misconfigured` claro. Se descarta.
const esLegacyMuerta = (v: string) => v.startsWith('eyJ');

// Devuelve la key y DE DÓNDE salió — el nombre de la env se loguea para poder
// diagnosticar el deploy sin exponer nunca el valor.
function resolverDbKey(): { key: string; fuente: string } | null {
  for (const nombre of CANDIDATAS_DB_KEY) {
    const v = (Deno.env.get(nombre) ?? '').trim();
    if (v && !esLegacyMuerta(v)) return { key: v, fuente: nombre };
  }
  return null;
}

// ------------------------------------------------------------------
// Helpers HTTP
// ------------------------------------------------------------------

function corsHeaders(origin: string | null): Record<string, string> {
  const permitido = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(obj: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}

// Error uniforme. `code` es estable y se usa desde la UI y desde el probe.
// Los mensajes NO revelan si un email existe en Auth salvo al caller ya
// autenticado como admin (§2.2).
function fail(status: number, code: string, error: string, origin: string | null): Response {
  return json({ ok: false, code, error }, status, origin);
}

// ------------------------------------------------------------------
// Helpers de dominio
// ------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Normalización canónica del email. §1.3: el vínculo entre auth.users y
// public.usuarios es el EMAIL (no hay FK), así que tiene que ser idéntico de
// los dos lados. Un solo lugar, una sola función.
const normEmail = (raw: string) => raw.trim().toLowerCase();

// PostgREST `ilike` traduce a SQL LIKE: `%` y `_` son comodines. Los emails
// pueden contener `_` legítimamente (foo_bar@x.com), así que hay que escapar
// o `foo_bar@` matchearía también `fooXbar@`.
const ilikeLiteral = (s: string) => s.replace(/([\\%_])/g, '\\$1');

// Busca un usuario en Auth por email exacto (case-insensitive).
// La Admin API no expone filtro por email, así que se pagina. Cota dura de
// MAX_PAGES para que un proyecto grande no cuelgue la función; SGH tiene
// unidades de usuarios, no miles.
const PER_PAGE = 200;
const MAX_PAGES = 25;

interface AuthUserLite { id: string; email: string | null; email_confirmed_at: string | null }

async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ user: AuthUserLite | null; truncado: boolean }> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const users = (data?.users ?? []) as unknown as AuthUserLite[];
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (hit) return { user: hit, truncado: false };
    if (users.length < PER_PAGE) return { user: null, truncado: false };
  }
  // Se agotaron las páginas sin encontrarlo: NO podemos afirmar que no existe.
  return { user: null, truncado: true };
}

// El rate limit de email de GoTrue se manifiesta como 429 o como un mensaje.
// Se mapea a 429 explícito para que la UI diga "límite de emails alcanzado,
// reintentá en una hora" y no un error genérico (§6, riesgo de etapa (a)).
function esRateLimit(err: { status?: number; code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.status === 429) return true;
  const txt = `${err.code ?? ''} ${err.message ?? ''}`.toLowerCase();
  return txt.includes('rate limit') || txt.includes('over_email_send_rate_limit')
    || txt.includes('too many requests');
}

// GoTrue rechaza invitar a un email YA CONFIRMADO en Auth.
function esYaRegistrado(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const txt = `${err.code ?? ''} ${err.message ?? ''}`.toLowerCase();
  return txt.includes('already registered') || txt.includes('email_exists')
    || txt.includes('user_already_exists');
}

// Bug de plataforma medido el 24/07/2026: los endpoints ADMIN de GoTrue rechazan
// ~1 de cada 3 llamadas con `invalid JWT: unrecognized JWT kid <nil> for
// algorithm ES256`, con la MISMA key con la que la llamada anterior funcionó.
// Es transitorio: el reintento suele pasar (medido: pasó al segundo intento).
// Alcance medido: sólo secret key → endpoints admin de GoTrue. PostgREST y el
// camino anon (`signInWithPassword`) no se ven afectados.
//
// Se mapea a 503 con un code propio para que la UI ofrezca REINTENTAR en vez de
// mostrar un error definitivo (precondición 2 de la etapa (c) del plan). NO se
// reintenta acá adentro: el reintento es del operador, así ve qué pasó y no se
// duplican mails a sus espaldas.
//
// Clave para que el reintento sea seguro: es un rechazo de FIRMA. GoTrue tira el
// request antes de procesarlo, así que sobre el `/invite` significa que el mail
// NO salió. Por eso este predicado es sólo texto y NO mira status: un 502/504 de
// gateway sí puede haber procesado la invitación y mandado el mail, y ofrecer
// "reintentar" ahí duplicaría el mail y quemaría la cuota horaria.
function esKidNilAdminApi(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const txt = `${err.code ?? ''} ${err.message ?? ''}`.toLowerCase();
  return txt.includes('unrecognized jwt kid')
    || (txt.includes('invalid jwt') && txt.includes('es256'));
}

// Variante para los pasos ANTERIORES al `/invite` (lookups, escaneo de Auth).
// Ahí todavía no se mandó nada ni se escribió nada, así que un 502/503/504 de
// gateway también es seguro de reintentar.
function esTransitorioPreMail(
  err: { status?: number; code?: string; message?: string } | null,
): boolean {
  if (!err) return false;
  if (err.status === 502 || err.status === 503 || err.status === 504) return true;
  return esKidNilAdminApi(err);
}

// ------------------------------------------------------------------
// Handler
// ------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');

  // §2.1 paso 6 — preflight y método.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') {
    return fail(405, 'method_not_allowed', 'Sólo se acepta POST.', origin);
  }

  // ----------------------------------------------------------------
  // §2.1 paso 1 — extraer el JWT del caller
  // ----------------------------------------------------------------
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const jwt = authHeader && /^Bearer\s+/i.test(authHeader)
    ? authHeader.replace(/^Bearer\s+/i, '').trim()
    : null;
  if (!jwt) {
    return fail(401, 'sin_token', 'Falta el header Authorization: Bearer <access_token>.', origin);
  }

  // La key secreta se lee SOLO acá dentro, nunca en scope de módulo.
  const resuelta = resolverDbKey();
  if (!resuelta) {
    console.error('[invite-user] sin key admin usable. Probadas:', CANDIDATAS_DB_KEY.join(', '));
    return fail(500, 'server_misconfigured',
      'No hay una key admin server-side usable configurada.', origin);
  }
  const DB_KEY = resuelta.key;
  // Sólo el NOMBRE de la env, nunca el valor. Se loguea únicamente cuando NO es
  // el secret propio, para dejar rastro de que se está usando un fallback.
  if (resuelta.fuente !== 'INVITE_DB_KEY') {
    console.log('[invite-user] key admin tomada de', resuelta.fuente);
  }

  try {
    // --------------------------------------------------------------
    // §2.1 paso 2 — validar el token CONTRA AUTH (firma + expiración
    // verificadas server-side). No se decodifica el payload a mano.
    // Cliente con la key publishable + el Authorization del caller;
    // además se le pasa el jwt explícito a getUser() para no depender
    // de una sesión persistida (persistSession: false).
    // --------------------------------------------------------------
    const asCaller = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: authData, error: authErr } = await asCaller.auth.getUser(jwt);
    const authCaller = authData?.user;
    if (authErr || !authCaller?.email) {
      return fail(401, 'token_invalido', 'Token inválido o expirado.', origin);
    }
    const callerEmail = normEmail(authCaller.email);

    // Cliente admin: se construye DENTRO del handler (§2.5).
    const admin = createClient(SUPABASE_URL, DB_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // --------------------------------------------------------------
    // §2.1 paso 3 — resolver el rol EN LA APP, por tabla, no por el JWT.
    // Se busca por email porque no existe FK a auth.users (§1.3).
    // --------------------------------------------------------------
    const { data: callerRows, error: callerErr } = await admin
      .from('usuarios')
      .select('id, email, rol, club_id, activo')
      .ilike('email', ilikeLiteral(callerEmail))
      .limit(2);

    if (callerErr) {
      console.error('[invite-user] lookup caller:', callerErr.message);
      return fail(500, 'caller_lookup_failed', 'No se pudo resolver el usuario que invita.', origin);
    }
    const caller = (callerRows ?? []).find((r) => normEmail(String(r.email)) === callerEmail);
    if (!caller) {
      return fail(403, 'caller_sin_fila', 'El usuario autenticado no tiene alta en el sistema.', origin);
    }
    if (caller.activo !== true) {
      return fail(403, 'caller_inactivo', 'El usuario que invita está inactivo.', origin);
    }

    // --------------------------------------------------------------
    // §2.1 paso 4 — regla de autorización, resuelta por el MAPA (C2).
    // --------------------------------------------------------------
    const regla = REGLAS_POR_ROL_CALLER[String(caller.rol)];
    if (!regla) {
      return fail(403, 'rol_caller_no_autorizado',
        `El rol "${caller.rol}" no puede invitar usuarios.`, origin);
    }

    // --------------------------------------------------------------
    // §2.2 — parseo y validación del payload (422)
    // --------------------------------------------------------------
    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return fail(422, 'body_invalido', 'El body no es JSON válido.', origin);
    }

    const emailRaw = typeof body.email === 'string' ? body.email : '';
    const email = normEmail(emailRaw);
    if (!email || !EMAIL_RE.test(email)) {
      return fail(422, 'email_invalido', 'Email requerido y con formato válido.', origin);
    }

    const nombre = typeof body.nombre_completo === 'string' ? body.nombre_completo.trim() : '';
    if (!nombre) {
      return fail(422, 'nombre_requerido', 'nombre_completo es requerido.', origin);
    }

    const rolPedido = typeof body.rol === 'string' ? body.rol.trim() : '';
    if (!ROLES_VALIDOS.includes(rolPedido as Rol)) {
      return fail(422, 'rol_invalido',
        `rol inválido. Válidos: ${ROLES_VALIDOS.join(', ')}.`, origin);
    }
    const rol = rolPedido as Rol;

    const telefono = typeof body.telefono === 'string' && body.telefono.trim()
      ? body.telefono.trim() : null;
    const reinvitar = body.reinvitar === true;

    // --------------------------------------------------------------
    // §2.1 paso 5 — club_id y rol del body NUNCA se confían.
    // El rol se valida contra el set del mapa; el club_id se RESUELVE,
    // y para 'propio' el del body se descarta sin mirarlo.
    // --------------------------------------------------------------
    if (!regla.puedeInvitar.has(rol)) {
      return fail(403, 'rol_no_invitable',
        `Un "${caller.rol}" no puede invitar con rol "${rol}".`, origin);
    }

    const clubIdBody = typeof body.club_id === 'string' ? body.club_id.trim() : '';
    let clubId: string;

    if (regla.alcanceClub === 'propio') {
      // El club sale de la fila del caller. Si el body pidió otro club,
      // es un intento de escalada horizontal → 403 explícito (y NO se
      // escribe nada: este return está antes de cualquier write).
      if (clubIdBody && clubIdBody.toLowerCase() !== String(caller.club_id).toLowerCase()) {
        return fail(403, 'club_ajeno',
          'No podés invitar usuarios a un club que no es el tuyo.', origin);
      }
      clubId = String(caller.club_id);
    } else {
      // 'cualquiera': el club_id es OBLIGATORIO y explícito. No se hereda del
      // caller a propósito — un super_admin que se olvida el club_id no debe
      // crear el usuario en su propio club por accidente.
      if (!clubIdBody) {
        return fail(422, 'club_id_requerido',
          'club_id es requerido cuando el caller es super_admin.', origin);
      }
      if (!UUID_RE.test(clubIdBody)) {
        return fail(422, 'club_id_invalido', 'club_id no es un UUID válido.', origin);
      }
      clubId = clubIdBody;
    }

    // --------------------------------------------------------------
    // §2.4 — detección de colisiones (Auth y/o public.usuarios)
    // --------------------------------------------------------------
    const { data: destRows, error: destErr } = await admin
      .from('usuarios')
      .select('id, email, estado, activo, club_id, rol')
      .ilike('email', ilikeLiteral(email))
      .limit(2);
    if (destErr) {
      console.error('[invite-user] lookup destinatario:', destErr.message);
      return fail(500, 'dest_lookup_failed', 'No se pudo verificar el destinatario.', origin);
    }
    const filaApp = (destRows ?? []).find((r) => normEmail(String(r.email)) === email) ?? null;

    let authDest: AuthUserLite | null = null;
    try {
      const res = await findAuthUserByEmail(admin, email);
      if (res.truncado) {
        // No podemos afirmar "no existe" → no arriesgamos un alta duplicada.
        return fail(500, 'auth_scan_truncado',
          'No se pudo determinar el estado del email en Auth.', origin);
      }
      authDest = res.user;
    } catch (e) {
      const msg = (e as Error).message;
      console.error('[invite-user] findAuthUserByEmail:', msg);
      // El `kid <nil>` de la Admin API también pega en `listUsers`, antes de
      // llegar al `/invite`. Nada se escribió todavía: reintentar es seguro.
      if (esTransitorioPreMail({ message: msg })) {
        return fail(503, 'error_transitorio',
          'Fallo transitorio de la plataforma de Auth. No se envió nada: reintentá.', origin);
      }
      return fail(500, 'auth_lookup_failed', 'No se pudo consultar Auth.', origin);
    }

    const confirmado = !!authDest?.email_confirmed_at;

    // Ya opera: confirmado en Auth Y con fila activa. NO se reinvita nunca,
    // ni con reinvitar:true. Si perdió la contraseña, es un reset, no una
    // invitación (§2.4).
    if (confirmado && filaApp && filaApp.activo === true) {
      return fail(409, 'ya_activo',
        'Ese email ya tiene una cuenta activa. Si perdió la contraseña, usá el flujo de recuperación.',
        origin);
    }

    // Cualquier otra colisión requiere `reinvitar: true` explícito, para que la
    // UI pregunte antes de consumir cuota de mail (§2.4).
    if ((authDest || filaApp) && !reinvitar) {
      return fail(409, 'ya_existe',
        'Ese email ya tiene una invitación o un alta previa. Reenviá la invitación para continuar.',
        origin);
    }

    // --------------------------------------------------------------
    // §2.3 — escritura
    // --------------------------------------------------------------
    // La fila que va a public.usuarios. `password_hash: ''` porque la columna
    // es NOT NULL sin default y es un vestigio pre-Supabase-Auth (§1.2): NO es
    // una contraseña ni se usa para autenticar.
    const filaNueva = {
      email,                       // mismo string exacto que se manda a Auth
      nombre_completo: nombre,
      telefono,
      club_id: clubId,
      rol,
      activo: false,               // hasta que acepte la invitación (§4.1)
      estado: 'pendiente',
      password_hash: '',
    };

    // Compensación anti-huérfanos: SÓLO se borra el usuario de Auth si lo
    // creamos NOSOTROS en este request. Si preexistía (reparación de huérfano,
    // reinvitación), borrarlo destruiría una cuenta ajena al fallo.
    const authPreexistia = !!authDest;

    const { data: invData, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { nombre_completo: nombre },
      redirectTo: REDIRECT_URL,
    });

    if (invErr) {
      if (esRateLimit(invErr as never)) {
        return fail(429, 'rate_limit_email',
          'Se alcanzó el límite de emails por hora. Reintentá más tarde.', origin);
      }
      if (esYaRegistrado(invErr as never)) {
        // GoTrue no reinvita a un email ya confirmado.
        return fail(409, 'auth_ya_registrado',
          'Ese email ya está registrado y confirmado en Auth. No se puede reinvitar; usá recuperación de contraseña.',
          origin);
      }
      if (esKidNilAdminApi(invErr as never)) {
        // Rechazo de firma: GoTrue descartó el request antes de procesarlo, así
        // que no hay usuario de Auth nuevo, ni fila que compensar, ni mail
        // enviado. Es el ÚNICO fallo del `/invite` donde eso es demostrable —
        // de ahí que acá NO se use el predicado que mira status.
        console.error('[invite-user] inviteUserByEmail transitorio:', invErr.message);
        return fail(503, 'error_transitorio',
          'Fallo transitorio de la plataforma de Auth. No se envió el mail: reintentá.', origin);
      }
      console.error('[invite-user] inviteUserByEmail:', invErr.message);
      return fail(500, 'invite_failed', 'No se pudo enviar la invitación.', origin);
    }

    const authUserId = invData?.user?.id ?? authDest?.id ?? null;

    // Si ya hay fila en public.usuarios (reinvitación pura), NO se re-inserta.
    if (filaApp) {
      return json({
        ok: true,
        estado: 'invitado',
        email,
        ya_existia: true,
        reparado: false,
      }, 200, origin);
    }

    // No hay fila: alta nueva, o reparación de un huérfano de Auth (§2.4).
    const { error: insErr } = await admin.from('usuarios').insert(filaNueva);

    if (insErr) {
      // 23505 unique_violation → alguien la insertó entre el SELECT y el INSERT.
      if (insErr.code === '23505') {
        return fail(409, 'ya_existe', 'Ese email ya tiene un alta en el sistema.', origin);
      }
      // 23503 foreign_key_violation → el club_id no existe.
      if (insErr.code === '23503') {
        return fail(422, 'club_id_inexistente', 'El club_id indicado no existe.', origin);
      }

      console.error('[invite-user] insert usuarios:', insErr.code, insErr.message);

      // ---- Compensación (§2.3 paso 3) ----
      if (!authPreexistia && authUserId) {
        const { error: delErr } = await admin.auth.admin.deleteUser(authUserId);
        if (delErr) {
          // Peor caso: quedó un huérfano nuevo Y no lo pudimos limpiar.
          // Código propio para poder encontrarlo en los logs.
          console.error('[invite-user] COMPENSACION_FALLIDA', email, delErr.message);
          return fail(500, 'compensacion_fallida',
            'El alta falló y no se pudo revertir la cuenta de Auth. Avisá a soporte.', origin);
        }
        return fail(500, 'alta_revertida',
          'No se pudo dar de alta al usuario. La invitación fue revertida, reintentá.', origin);
      }

      // El usuario de Auth preexistía: NO se toca. Sólo falló la reparación.
      return fail(500, 'reparacion_fallida',
        'No se pudo completar el alta del usuario existente en Auth.', origin);
    }

    return json({
      ok: true,
      estado: 'invitado',
      email,
      ya_existia: authPreexistia,
      reparado: authPreexistia,   // huérfano de Auth que ahora sí tiene fila
    }, 200, origin);

  } catch (e) {
    console.error('[invite-user] unhandled:', (e as Error).message);
    return fail(500, 'error_inesperado', 'Error inesperado.', origin);
  }
});
