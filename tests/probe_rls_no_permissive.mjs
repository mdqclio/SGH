/**
 * probe_rls_no_permissive.mjs — Regresión: ninguna policy de ESCRITURA permisiva.
 *
 * Cierra el pendiente §2 de docs/auditoria/SGH-REMEDIACION.md: falla si queda
 * cualquier policy INSERT/UPDATE/DELETE/ALL con USING(true) o WITH CHECK(true)
 * en el schema `public` (RLS efectivamente anulada).
 *
 * Lee pg_policies vía el RPC SECURITY DEFINER `fn_audit_policies_permisivas`
 * (grant solo a service_role). NO usa browser.
 *
 *   SUPABASE_SECRET_KEY=...  node tests/probe_rls_no_permissive.mjs
 *   # o, compat legacy:
 *   SUPABASE_SERVICE_ROLE_KEY=...  node tests/probe_rls_no_permissive.mjs
 *
 * SELECT-only USING(true) se excluye a propósito (lectura pública deliberada;
 * coincide con el lint 0024 del Supabase advisor).
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';

function requireSecret() {
  const v = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!v) {
    console.error('FALTA env: exportá SUPABASE_SECRET_KEY (key nueva) o SUPABASE_SERVICE_ROLE_KEY (legacy).');
    process.exit(2);
  }
  return v;
}

// --------------------------------------------------------------------------
// ALLOWLIST — VACÍA desde el 01/08/2026. El probe es estricto total.
//
// Las 8 entradas que había (spcs, propietarios, profesionales y
// spc_propietarios, insert+update) eran los catálogos globales gateados. Se
// cerraron en SEC_RLS FASE 2a — ver docs/SEC_RLS_FASE2.md y
// migrations/sec_rls_fase2a_catalogos.sql.
//
// >>> NO volver a agregar entradas sin justificación escrita. <<<
// Una policy de escritura con USING(true) o WITH CHECK(true) es RLS anulada.
// --------------------------------------------------------------------------
const ALLOWLIST = new Set([]);

const sb = createClient(SUPABASE_URL, requireSecret(), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await sb.rpc('fn_audit_policies_permisivas');
if (error) {
  console.error('[probe_rls_no_permissive] RPC error:', error.message);
  process.exit(2);
}

const rows = data || [];
const offenders = rows.filter(r => !ALLOWLIST.has(`${r.tablename}.${r.policyname}`));
const gated     = rows.filter(r =>  ALLOWLIST.has(`${r.tablename}.${r.policyname}`));

console.log(`\nPolicies de escritura permisivas detectadas: ${rows.length}`);
console.log(`  · gateadas/toleradas (FASE 3): ${gated.length}`);
console.log(`  · NO toleradas (regresión):    ${offenders.length}`);

if (gated.length) {
  console.log('\n⚠️  GATEADAS (cerrar al aplicar FASE 3):');
  for (const r of gated) console.log(`   - ${r.tablename}.${r.policyname} [${r.cmd}]`);
}

if (offenders.length) {
  console.error('\n❌ FAIL — policies permisivas fuera de la allowlist:');
  for (const r of offenders) {
    console.error(`   - ${r.tablename}.${r.policyname} [${r.cmd}] roles=${r.roles} qual=${r.qual} check=${r.with_check}`);
  }
  console.error('\nCerrá la policy (club-scoped) o, si es deliberada, agregala a ALLOWLIST con justificación.');
  process.exit(1);
}

console.log('\n✅ PASS — ninguna policy permisiva fuera de lo gateado en FASE 3.');
process.exit(0);
