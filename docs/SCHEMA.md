# SGH — Schema de Base de Datos

## Supabase Project
- URL: https://unlhcuanfrtpatoipwve.supabase.co
- ID: unlhcuanfrtpatoipwve

## Tablas principales

### clubs
id UUID PK, nombre VARCHAR(150), sigla VARCHAR(10) UNIQUE, razon_social, cuit, domicilio, localidad, provincia, telefono, email, logo_url TEXT, activo BOOLEAN DEFAULT TRUE, created_at, updated_at

### hipodromos
id UUID PK, club_id FK clubs, nombre, sigla, localidad, provincia, tipo_pista, activo
UNIQUE (club_id, sigla)

### usuarios
id UUID PK, club_id FK clubs (NULLABLE), email, password_hash, nombre_completo, rol ENUM(super_admin/secretario_carreras/operador/profesional/propietario/publico), activo, telefono, estado TEXT DEFAULT 'activo', created_at
CRÍTICO: columna se llama nombre_completo NO nombre

### categorias_carrera
id UUID PK, club_id FK clubs, nombre, codigo, descripcion, es_computable BOOLEAN, es_oficial BOOLEAN, simbolo VARCHAR(10), color_hex VARCHAR(7), orden_display INTEGER, activo
UNIQUE (club_id, codigo)

### propietarios (GLOBALES — club_id nullable)
id UUID PK, club_id FK nullable, tipo (persona/sociedad), nombre, documento_tipo, documento_nro, domicilio, localidad, provincia, telefono, email, colores_desc, colores_img_url, nombre_stud VARCHAR(150), activo, estado VARCHAR(20) DEFAULT 'activo'

### caballerizas
id UUID PK, club_id FK nullable, nombre, responsable TEXT (autogenerado de caballeriza_responsables), domicilio, telefono, activo, notas, estado VARCHAR(20) DEFAULT 'activo', hipodromo_patente VARCHAR(50), chaquetilla_descripcion VARCHAR(500), chaquetilla_url VARCHAR(500)
NOTA: campo "responsable" no se edita directamente — se regenera desde caballeriza_responsables al guardar.

### caballeriza_responsables (nueva — sesión may-2026)
id UUID PK, caballeriza_id FK caballerizas ON DELETE CASCADE, profesional_id FK profesionales (opcional — NULL si no es profesional del sistema), apellido VARCHAR(150), nombre VARCHAR(150), documento_tipo VARCHAR(10) DEFAULT 'DNI', documento_nro VARCHAR(30), fecha_nacimiento DATE, localidad VARCHAR(150), rol VARCHAR(20) CHECK (rol IN ('propietario','copropietario')), porcentaje DECIMAL (V2 — no usado aún), activo BOOLEAN DEFAULT TRUE, created_at
RLS: policy permisiva (allow_all).
REGLA: exactamente 1 fila con rol='propietario' por caballeriza, 0-N con rol='copropietario'.

### profesionales (per-hipódromo — CORRECCIÓN: NO son globales)
id UUID PK, club_id FK nullable, tipo ENUM(jockey/entrenador/ambos), nombre, apellido, documento_tipo, documento_nro, fecha_nacimiento, localidad VARCHAR(150), matricula_nro, patente, hipodromo_patente VARCHAR(50), categoria_jockey VARCHAR(50), peso_minimo, peso_maximo, caballeriza_id FK, telefono, email, foto_url, activo, estado VARCHAR(20) DEFAULT 'activo'
NOTA: categoria_jockey cambió de ENUM a VARCHAR(50) — sesión may-2026. Valores actuales: Jockey / 2ª categoría / 3ª categoría / 4ª categoría.
CORRECCIÓN: entrenadores NO son globales — tienen hipodromo_patente igual que jockeys (patente otorgada por un hipódromo específico).

### spcs (GLOBALES — club_id nullable)
id UUID PK, club_id FK nullable, nombre, registro_stud_book, fecha_nacimiento DATE, sexo ENUM(macho/hembra/castrado), color, marcas, padrillo_nombre, madre_nombre, abuela_materna, pais_origen DEFAULT 'Argentina', caballeriza_id FK, entrenador_id FK, estado ENUM(activo/retirado/suspendido/fallecido/vendido) DEFAULT 'activo', notas, doc_url, foto_url, certificado_correr BOOLEAN DEFAULT FALSE
CRÍTICO: usar .eq('estado','activo') NO .eq('activo',true) — columna activo no existe

### spc_propietarios
id UUID PK, spc_id FK spcs, propietario_id FK propietarios, porcentaje DECIMAL DEFAULT 100, fecha_desde DATE, fecha_hasta DATE, activo

### sanciones (COMPARTIDAS entre hipódromos)
id UUID PK, club_id FK nullable, entidad_tipo ENUM(profesional/spc/propietario/caballeriza), entidad_id UUID, tipo_sancion, motivo, codigo_resolucion, fecha_inicio DATE, fecha_fin DATE, alcance DEFAULT 'club', estado ENUM(activa/cumplida/apelada/revocada), resolucion_url, notas, creado_por FK usuarios

### reuniones
id UUID PK, club_id FK clubs, hipodromo_id FK hipodromos, numero INTEGER, fecha DATE, tipo ENUM(oficial/extraoficial/especial/nocturna), estado ENUM(borrador/programada/publicada/en_curso/finalizada/cancelada/suspendida), condicion_pista, tiempo_clima, observaciones, creado_por FK usuarios

### carreras
id UUID PK, reunion_id FK reuniones, numero_turno INTEGER, nombre, categoria_id FK categorias_carrera, tipo_pista ENUM(cesped/arena/tierra/sintetica), distancia_metros INTEGER, edad_minima_anos, edad_maxima_anos, condicion_sexo ENUM(ambos/machos/hembras/machos_castrados), condicion_handicap, condicion_adicional, bolsa_total DECIMAL, bolsa_bonos DECIMAL DEFAULT 0, premio_minimo DECIMAL DEFAULT 0, distribucion_premios JSONB, cupo_maximo, hora_estimada TIME, apertura_inscripcion, cierre_inscripcion, apertura_ratificacion, cierre_ratificacion, estado VARCHAR DEFAULT 'programada'
UNIQUE (reunion_id, numero_turno)
NOTA condicion: condicion_handicap es la condición principal en texto libre. condicion_adicional es nota extra ("Peso x impresion" en casos especiales).
NOTA estado: campo VARCHAR libre (sin ENUM). Valores especiales usados en UI: 'reabierta' (cupo no completado, se reabre), 'anulada' (cancelada). NULL = sin marca especial.

### inscripciones
id UUID PK, carrera_id FK carreras, spc_id FK spcs, propietario_id FK, entrenador_id FK, jockey_titular_id FK, jockey_suplente_id FK, caballeriza_id FK, peon VARCHAR, capataz VARCHAR, sereno VARCHAR, numero_partidor, peso_declarado, peso_final, estado ENUM(pre_inscripto/inscripto/confirmado/ratificado/forfait/no_presentado/mal_inscrito) DEFAULT 'inscripto', canal DEFAULT 'manual', motivo_forfait, info_adicional, certificado_correr BOOLEAN, inscripto_por FK usuarios, ratificado_por FK usuarios
UNIQUE (carrera_id, spc_id)
ESTADOS VISIBLES EN UI: inscripto / mal_inscrito / ratificado / forfait. mal_inscrito agregado en sesión may-2026.
CRÍTICO: estado es ENUM rígido (estado_inscripcion). Para agregar valores usar ALTER TYPE ADD VALUE, NO migrar a VARCHAR (v_inscriptos_carrera depende del ENUM).

### resultados
id UUID PK, carrera_id FK UNIQUE, estado ENUM(provisional/oficial/en_protesta), tiempo_ganador, estado_pista VARCHAR, dividendos JSONB, apuestas JSONB, incidentes, observaciones, oficializado_por FK, oficializado_at

### resultado_posiciones
id UUID PK, resultado_id FK resultados, inscripcion_id FK inscripciones, posicion INTEGER, tiempo, diferencia, descalificado BOOLEAN, motivo_desc
UNIQUE (resultado_id, posicion)
CRÍTICO: borrar siempre antes de borrar inscripciones

### resultado_log
id UUID PK, resultado_id FK, usuario_id FK, accion, datos_antes JSONB, datos_despues JSONB, created_at

### comisiones_config
id UUID PK, club_id FK, pct_propietario DEFAULT 70, pct_entrenador DEFAULT 10, pct_jockey DEFAULT 10, pct_peon DEFAULT 4, pct_capataz DEFAULT 3, pct_sereno DEFAULT 1, pct_fondo_solidario DEFAULT 2, monta_perdida_fija, monta_perdida_por_carrera, incentivo_entrenador

### liquidaciones
id UUID PK, club_id FK, reunion_id FK, profesional_id FK, propietario_id FK, total_bruto DECIMAL, total_descuentos DECIMAL, total_neto DECIMAL GENERATED ALWAYS AS (total_bruto - total_descuentos) STORED, estado ENUM(borrador/aprobada/pagada/anulada), numero_recibo, recibo_pdf_url, notas
CRÍTICO: total_neto es columna generada — no se puede actualizar directamente

### liquidacion_detalle
id UUID PK, liquidacion_id FK, carrera_id FK, concepto, descripcion, monto_bruto DECIMAL, porcentaje_desc DECIMAL, monto_descuento DECIMAL, monto_neto DECIMAL GENERATED

### resoluciones
id UUID PK, club_id FK, reunion_id FK, numero VARCHAR UNIQUE, fecha DATE, tipo, texto, documento_url, estado DEFAULT 'borrador', creado_por FK

### notificaciones
id UUID PK, tipo, titulo, mensaje, leida BOOLEAN DEFAULT FALSE, usuario_id FK, created_at

### auditoria
id UUID PK, club_id FK, usuario_id FK, tabla, registro_id UUID, accion, datos_antes JSONB, datos_despues JSONB, ip, created_at

## JSONB distribucion_premios
{"1": 60, "2": 19, "3": 12, "4": 6, "5": 3, "bono_ganador": 250000, "bono_posicion_desde": 6, "bono_posicion_hasta": 8, "bono_posicion_monto": 100000, "ganancia_minima": 100000}

## ALTER TABLE ejecutados posteriormente
```sql
ALTER TABLE spcs ALTER COLUMN club_id DROP NOT NULL;
ALTER TABLE profesionales ALTER COLUMN club_id DROP NOT NULL;
ALTER TABLE propietarios ALTER COLUMN club_id DROP NOT NULL;
ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS patente VARCHAR(50);
ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS hipodromo_patente VARCHAR(150);
ALTER TABLE propietarios ADD COLUMN IF NOT EXISTS nombre_stud VARCHAR(150);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'activo';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(50);
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS caballeriza_id UUID REFERENCES caballerizas(id);
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS peon VARCHAR(200);
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS capataz VARCHAR(200);
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS sereno VARCHAR(200);
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS certificado_correr BOOLEAN DEFAULT FALSE;
ALTER TABLE carreras ADD COLUMN IF NOT EXISTS bolsa_bonos DECIMAL(15,2) DEFAULT 0;
ALTER TABLE carreras ADD COLUMN IF NOT EXISTS premio_minimo DECIMAL(15,2) DEFAULT 0;
ALTER TABLE resultados ADD COLUMN IF NOT EXISTS estado_pista VARCHAR(20);
ALTER TABLE resultados ADD COLUMN IF NOT EXISTS apuestas JSONB;
ALTER TABLE spcs ADD COLUMN IF NOT EXISTS certificado_correr BOOLEAN DEFAULT FALSE;
ALTER TYPE tipo_pista ADD VALUE IF NOT EXISTS 'tierra';
ALTER TYPE estado_reunion ADD VALUE IF NOT EXISTS 'programada';
ALTER TYPE estado_inscripcion ADD VALUE IF NOT EXISTS 'inscripto';
-- Sesión may-2026:
ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS localidad VARCHAR(150);
ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'activo';
ALTER TABLE propietarios ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'activo';
ALTER TABLE caballerizas ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'activo';
ALTER TABLE caballerizas ADD COLUMN IF NOT EXISTS hipodromo_patente VARCHAR(50);
ALTER TABLE caballerizas ADD COLUMN IF NOT EXISTS chaquetilla_descripcion VARCHAR(500);
ALTER TABLE caballerizas ADD COLUMN IF NOT EXISTS chaquetilla_url VARCHAR(500);
ALTER TABLE profesionales ALTER COLUMN categoria_jockey TYPE VARCHAR(50); -- era ENUM
ALTER TYPE estado_inscripcion ADD VALUE IF NOT EXISTS 'mal_inscrito';
CREATE TABLE IF NOT EXISTS caballeriza_responsables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caballeriza_id UUID NOT NULL REFERENCES caballerizas(id) ON DELETE CASCADE,
  profesional_id UUID REFERENCES profesionales(id),
  apellido VARCHAR(150), nombre VARCHAR(150),
  documento_tipo VARCHAR(10) DEFAULT 'DNI', documento_nro VARCHAR(30),
  fecha_nacimiento DATE, localidad VARCHAR(150),
  rol VARCHAR(20) CHECK (rol IN ('propietario','copropietario')),
  porcentaje DECIMAL, activo BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE caballeriza_responsables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON caballeriza_responsables FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
```

## Storage Supabase
Bucket: **chaquetillas** (público, creado sesión may-2026)
Policies SQL requeridas después de crear el bucket desde la UI:
```sql
CREATE POLICY "chaquetillas_public_read"   ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'chaquetillas');
CREATE POLICY "chaquetillas_auth_insert"   ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chaquetillas');
CREATE POLICY "chaquetillas_auth_update"   ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'chaquetillas');
CREATE POLICY "chaquetillas_auth_delete"   ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'chaquetillas');
```
URL pública: `https://unlhcuanfrtpatoipwve.supabase.co/storage/v1/object/public/chaquetillas/{filename}`

## RLS
Actualmente todas las tablas tienen policy permisiva para desarrollo:
```sql
ALTER TABLE [tabla] ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON [tabla] FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
```
PENDIENTE: Implementar RLS por club_id cuando haya múltiples clientes.
