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
id UUID PK, club_id FK nullable, tipo (persona/sociedad), nombre, documento_tipo, documento_nro, domicilio, localidad, provincia, telefono, email, colores_desc, colores_img_url, nombre_stud VARCHAR(150), activo

### caballerizas
id UUID PK, club_id FK nullable, nombre, responsable, domicilio, telefono, activo, notas

### profesionales (GLOBALES — club_id nullable)
id UUID PK, club_id FK nullable, tipo ENUM(jockey/entrenador/ambos), nombre, apellido, documento_tipo, documento_nro, fecha_nacimiento, matricula_nro, patente, hipodromo_patente, categoria_jockey ENUM(aprendiz/clasico/senior/amateur), peso_minimo, peso_maximo, caballeriza_id FK, telefono, email, foto_url, activo
NOTA: entrenadores son globales (club_id nullable). Jockeys tienen club_id del hipódromo.

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

### inscripciones
id UUID PK, carrera_id FK carreras, spc_id FK spcs, propietario_id FK, entrenador_id FK, jockey_titular_id FK, jockey_suplente_id FK, caballeriza_id FK, peon VARCHAR, capataz VARCHAR, sereno VARCHAR, numero_partidor, peso_declarado, peso_final, estado ENUM(pre_inscripto/inscripto/confirmado/ratificado/forfait/no_presentado) DEFAULT 'inscripto', canal DEFAULT 'manual', motivo_forfait, info_adicional, certificado_correr BOOLEAN, inscripto_por FK usuarios, ratificado_por FK usuarios
UNIQUE (carrera_id, spc_id)
ESTADOS ACTIVOS: solo inscripto → ratificado → forfait

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
```

## RLS
Actualmente todas las tablas tienen policy permisiva para desarrollo:
```sql
ALTER TABLE [tabla] ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON [tabla] FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
```
PENDIENTE: Implementar RLS por club_id cuando haya múltiples clientes.
