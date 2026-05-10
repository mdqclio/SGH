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
