# SGH — Snippets de Código Críticos

## Conexión Supabase (patrón en cada archivo)
```js
const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVubGhjdWFuZnJ0cGF0b2lwd3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MjQ0OTcsImV4cCI6MjA5MjMwMDQ5N30.rKb8BI7fBQcRdyyyxVfBOZbtCmGYKIMLUDLVmkn1SYM';
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
```

## Verificación de sesión
```js
async function initAuth() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.replace('login.html'); return null; }
  const { data: usr } = await db
    .from('usuarios')
    .select('club_id, nombre_completo, rol')
    .eq('email', session.user.email)
    .single();
  if (!usr) { await db.auth.signOut(); window.location.replace('login.html'); return null; }
  if (usr.rol === 'super_admin') return usr;
  if (!usr.club_id) { await db.auth.signOut(); window.location.replace('login.html'); return null; }
  return usr;
}
```

## Formato de moneda
```js
function formatMonto(num) {
  if (num === null || num === undefined || isNaN(num)) return '$0,00';
  const n = parseFloat(num);
  const signo = n < 0 ? '-' : '';
  const [entero, dec] = Math.abs(n).toFixed(2).split('.');
  const enteroFmt = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return signo + '$' + enteroFmt + ',' + dec;
}

function parseMonto(str) {
  if (str === null || str === undefined) return 0;
  const s = String(str)
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(s) || 0;
}
```

## Cargar última reunión publicada
```js
async function cargarUltimaReunion(clubId) {
  const { data } = await db
    .from('reuniones')
    .select('*, hipodromos(nombre, sigla, localidad)')
    .eq('club_id', clubId)
    .eq('estado', 'publicada')
    .order('fecha', { ascending: false })
    .limit(1)
    .single();
  return data;
}
```

## Buscar SPC (global, sin filtro por club)
```js
async function buscarSPC(texto) {
  const { data } = await db
    .from('spcs')
    .select('id, nombre, fecha_nacimiento, sexo, color, padrillo_nombre, madre_nombre, entrenador_id, caballeriza_id')
    .eq('estado', 'activo')
    .ilike('nombre', '%' + texto + '%')
    .order('nombre')
    .limit(10);
  return data;
}
```

## Calcular premios desde JSONB
```js
function calcularPremio(bolsaTotal, distribucion, puesto) {
  if (!distribucion || !distribucion[puesto]) return 0;
  const calculado = bolsaTotal * parseFloat(distribucion[puesto]) / 100;
  return Math.max(calculado, distribucion.ganancia_minima || 0);
}
function calcularTotalBonos(distribucion) {
  let total = 0;
  if (distribucion?.bono_ganador) total += distribucion.bono_ganador;
  if (distribucion?.bono_posicion_monto && distribucion?.bono_posicion_desde && distribucion?.bono_posicion_hasta) {
    total += distribucion.bono_posicion_monto * (distribucion.bono_posicion_hasta - distribucion.bono_posicion_desde + 1);
  }
  return total;
}
```

## Formato de DNI (sesión may-2026)
```js
function formatDNI(num) {
  if (!num) return '';
  const limpio = String(num).replace(/\D/g, '');
  if (!limpio) return '';
  return limpio.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function parseDNI(str) { return (str || '').replace(/\D/g, ''); }
// NOTA: CUIT debería usar guiones (XX-XXXXXXXX-X) — pendiente ISSUE-014
```

## Estado badge 3 valores (sesión may-2026)
```js
function estadoBadge(estado) {
  if (estado === 'baja')     return '<span class="badge badge-baja">Baja</span>';
  if (estado === 'inactivo') return '<span class="badge badge-inactivo">Inactivo</span>';
  return '<span class="badge badge-activo">Activo</span>';
}
// CSS:
// .badge-activo   { background: rgba(76,175,130,0.15); color: var(--success); border: 1px solid rgba(76,175,130,0.3); }
// .badge-inactivo { background: rgba(160,184,160,0.15); color: var(--muted);   border: 1px solid rgba(160,184,160,0.3); }
// .badge-baja     { background: rgba(224,82,82,0.1);    color: var(--danger);  border: 1px solid rgba(224,82,82,0.3); }
```

## Upload de imagen a Storage (sesión may-2026)
```js
async function uploadChaquetilla(file) {
  if (file.size > 2 * 1024 * 1024) throw new Error('La imagen no puede superar 2 MB.');
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const filename = `${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage
    .from('chaquetillas')
    .upload(filename, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  const { data: { publicUrl } } = sb.storage.from('chaquetillas').getPublicUrl(filename);
  return publicUrl;
}
```

## Guardar responsables de caballeriza (sesión may-2026)
```js
// Patrón DELETE+INSERT desde JS (no atómico — ver ISSUE-012)
async function resolveAndInsertResponsables(rows, cabId) {
  // rows = [{ rol, apellido, nombre, documento_nro, fecha_nacimiento, localidad }]
  const toInsert = [];
  for (const r of rows) {
    if (!r.apellido && !r.nombre) continue;
    let profesional_id = null;
    if (r.documento_nro) {
      const { data } = await sb.from('profesionales')
        .select('id').eq('documento_nro', r.documento_nro).eq('club_id', CLUB_ID).maybeSingle();
      profesional_id = data?.id ?? null;
    }
    toInsert.push({ caballeriza_id: cabId, profesional_id, ...r, activo: true });
  }
  if (toInsert.length) await sb.from('caballeriza_responsables').insert(toInsert);
}
// Texto denormalizado para campo responsable:
function buildResponsableText(rows) {
  return rows.filter(r => r.apellido || r.nombre)
    .map(r => `${[r.apellido, r.nombre].filter(Boolean).join(' ')} (${r.rol})`).join(' + ');
}
```

## SQL útiles
```sql
-- Agregar valor a ENUM:
ALTER TYPE nombre_enum ADD VALUE IF NOT EXISTS 'nuevo_valor';

-- Borrar inscripción con cascade:
DELETE FROM resultado_posiciones WHERE inscripcion_id = 'UUID';
DELETE FROM inscripciones WHERE id = 'UUID';

-- Volver carta a borrador:
UPDATE reuniones SET estado = 'borrador' WHERE id = 'UUID';

-- Actualizar logo hipódromo:
UPDATE clubs SET logo_url = 'https://mdqclio.github.io/SGH/logo-dolores-192x192.png' WHERE sigla = 'HDO';
```

## CSS logo sobre fondo verde
```css
.logo-hipodromo { mix-blend-mode: multiply; height: 80px; width: auto; }
```

## SQL útiles (sesión may-2026)
```sql
-- Agregar mal_inscrito al ENUM (ya ejecutado):
ALTER TYPE estado_inscripcion ADD VALUE IF NOT EXISTS 'mal_inscrito';

-- Ver responsables de una caballeriza:
SELECT cr.*, p.nombre as prof_nombre FROM caballeriza_responsables cr
LEFT JOIN profesionales p ON p.id = cr.profesional_id
WHERE cr.caballeriza_id = 'UUID' ORDER BY (cr.rol='propietario') DESC, cr.apellido;

-- Regenerar texto responsable para todas las caballerizas:
UPDATE caballerizas c SET responsable = (
  SELECT string_agg(apellido || ' ' || nombre || ' (' || rol || ')', ' + '
    ORDER BY (rol='propietario') DESC, apellido)
  FROM caballeriza_responsables WHERE caballeriza_id = c.id
);
```

## SQL útiles (sesión may-2026 — segunda iteración)
```sql
-- Asignar gateras random a inscripciones de una reunión completa (sin repetir dentro de la misma carrera)
-- Reemplazar [cantidad_gateras] por el valor real (ej: 16) y [reunion_id] por el UUID de la reunión
WITH
  gateras_pool AS (
    SELECT
      c.id AS carrera_id,
      g.gatera,
      ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY random()) AS orden_sorteo
    FROM carreras c
    CROSS JOIN generate_series(1, [cantidad_gateras]) AS g(gatera)
    WHERE c.reunion_id = '[reunion_id]'
  ),
  inscripciones_ordenadas AS (
    SELECT
      i.id,
      i.carrera_id,
      ROW_NUMBER() OVER (PARTITION BY i.carrera_id ORDER BY s.nombre) AS posicion_alf
    FROM inscripciones i
    JOIN spcs s ON s.id = i.spc_id
    WHERE i.carrera_id IN (SELECT id FROM carreras WHERE reunion_id = '[reunion_id]')
  )
UPDATE inscripciones
SET numero_partidor = gp.gatera
FROM inscripciones_ordenadas io
JOIN gateras_pool gp ON gp.carrera_id = io.carrera_id
                     AND gp.orden_sorteo = io.posicion_alf
WHERE inscripciones.id = io.id;
```
