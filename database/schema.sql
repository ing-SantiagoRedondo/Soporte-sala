-- =====================================================
-- Sistema de soporte técnico de la sala de cómputo (soporte-sala)
-- Esquema PostgreSQL (compatible con Neon DB)
-- =====================================================

-- ---------- Tipos enumerados ----------
CREATE TYPE estado_solicitud AS ENUM (
  'REGISTRADA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA',
  'RECHAZADA', 'REABIERTA'
);

CREATE TYPE prioridad_solicitud AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'URGENTE');

-- ---------- Roles y usuarios ----------
CREATE TABLE roles (
  id      SMALLSERIAL PRIMARY KEY,
  nombre  VARCHAR(30) NOT NULL UNIQUE   -- ADMINISTRADOR, USUARIO, TECNICO, SUPERVISOR
);

CREATE TABLE usuarios (
  id             BIGSERIAL PRIMARY KEY,
  nombre         VARCHAR(120) NOT NULL,
  correo         VARCHAR(150) NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,                 -- bcrypt/argon2, nunca texto plano
  rol_id         SMALLINT NOT NULL REFERENCES roles(id),
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Categorías ----------
CREATE TABLE categorias (
  id           SERIAL PRIMARY KEY,
  nombre       VARCHAR(80) NOT NULL UNIQUE,
  descripcion  TEXT,
  activa       BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------- Equipos de la sala ----------
CREATE TABLE equipos (
  id         SERIAL PRIMARY KEY,
  codigo     VARCHAR(20) NOT NULL UNIQUE,      -- etiqueta física, ej. PC-01
  tipo       VARCHAR(30) NOT NULL,             -- PC, PORTATIL, IMPRESORA, PROYECTOR, RED, OTRO
  ubicacion  VARCHAR(80),
  activo     BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------- Solicitudes ----------
CREATE SEQUENCE solicitud_numero_seq START 1;

CREATE TABLE solicitudes (
  id                BIGSERIAL PRIMARY KEY,
  codigo            VARCHAR(20) NOT NULL UNIQUE
                    DEFAULT ('SOP-' || to_char(now(), 'YYYY') || '-' ||
                             lpad(nextval('solicitud_numero_seq')::text, 5, '0')),
  fecha_registro    TIMESTAMPTZ NOT NULL DEFAULT now(),
  solicitante_id    BIGINT NOT NULL REFERENCES usuarios(id),
  categoria_id      INT    NOT NULL REFERENCES categorias(id),
  equipo_id         INT    REFERENCES equipos(id),   -- equipo afectado (opcional)
  descripcion       TEXT   NOT NULL CHECK (length(trim(descripcion)) > 0),
  prioridad         prioridad_solicitud NOT NULL DEFAULT 'MEDIA',
  responsable_id    BIGINT REFERENCES usuarios(id),
  estado            estado_solicitud NOT NULL DEFAULT 'REGISTRADA',
  solucion          TEXT,                       -- obligatoria para RESUELTA
  fecha_cierre      TIMESTAMPTZ,
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Regla: para estar resuelta/cerrada debe existir solución
  CONSTRAINT chk_solucion_requerida CHECK (
    estado NOT IN ('RESUELTA', 'CERRADA') OR (solucion IS NOT NULL AND length(trim(solucion)) > 0)
  ),
  -- Regla: asignada o posterior requiere responsable
  CONSTRAINT chk_responsable_requerido CHECK (
    estado IN ('REGISTRADA', 'RECHAZADA') OR responsable_id IS NOT NULL
  )
);

CREATE INDEX idx_sol_solicitante ON solicitudes(solicitante_id);
CREATE INDEX idx_sol_responsable ON solicitudes(responsable_id);
CREATE INDEX idx_sol_estado      ON solicitudes(estado);
CREATE INDEX idx_sol_categoria   ON solicitudes(categoria_id);
CREATE INDEX idx_sol_fecha       ON solicitudes(fecha_registro);

-- ---------- Observaciones ----------
CREATE TABLE observaciones (
  id            BIGSERIAL PRIMARY KEY,
  solicitud_id  BIGINT NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  usuario_id    BIGINT NOT NULL REFERENCES usuarios(id),
  texto         TEXT NOT NULL,
  creada_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Historial de cambios de estado ----------
CREATE TABLE historial_estados (
  id               BIGSERIAL PRIMARY KEY,
  solicitud_id     BIGINT NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  estado_anterior  estado_solicitud,
  estado_nuevo     estado_solicitud NOT NULL,
  usuario_id       BIGINT NOT NULL REFERENCES usuarios(id),
  motivo           TEXT,
  fecha            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hist_solicitud ON historial_estados(solicitud_id);

-- ---------- Notificaciones internas ----------
CREATE TABLE notificaciones (
  id            BIGSERIAL PRIMARY KEY,
  usuario_id    BIGINT NOT NULL REFERENCES usuarios(id),
  solicitud_id  BIGINT REFERENCES solicitudes(id) ON DELETE CASCADE,
  mensaje       TEXT NOT NULL,
  leida         BOOLEAN NOT NULL DEFAULT FALSE,
  creada_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_usuario ON notificaciones(usuario_id, leida);

-- =====================================================
-- Reglas de negocio en la base de datos
-- =====================================================

-- Transiciones válidas del ciclo de vida
CREATE TABLE transiciones_validas (
  desde  estado_solicitud NOT NULL,
  hasta  estado_solicitud NOT NULL,
  PRIMARY KEY (desde, hasta)
);

INSERT INTO transiciones_validas (desde, hasta) VALUES
  ('REGISTRADA', 'ASIGNADA'),
  ('REGISTRADA', 'RECHAZADA'),
  ('ASIGNADA',   'EN_PROCESO'),
  ('ASIGNADA',   'RECHAZADA'),
  ('EN_PROCESO', 'RESUELTA'),
  ('RESUELTA',   'CERRADA'),
  ('RESUELTA',   'REABIERTA'),
  ('CERRADA',    'REABIERTA'),
  ('REABIERTA',  'ASIGNADA'),
  ('REABIERTA',  'EN_PROCESO');

-- Valida transición, bloquea cierre y actualiza timestamps
CREATE OR REPLACE FUNCTION fn_validar_estado() RETURNS TRIGGER AS $$
BEGIN
  -- Una solicitud CERRADA solo puede modificarse para reabrirla
  IF OLD.estado = 'CERRADA' AND NEW.estado <> 'REABIERTA' THEN
    RAISE EXCEPTION 'La solicitud % está cerrada y no puede modificarse', OLD.codigo;
  END IF;

  IF NEW.estado <> OLD.estado THEN
    IF NOT EXISTS (
      SELECT 1 FROM transiciones_validas
      WHERE desde = OLD.estado AND hasta = NEW.estado
    ) THEN
      RAISE EXCEPTION 'Transición no permitida: % -> %', OLD.estado, NEW.estado;
    END IF;

    IF NEW.estado = 'CERRADA' THEN
      NEW.fecha_cierre := now();
    ELSIF NEW.estado = 'REABIERTA' THEN
      NEW.fecha_cierre := NULL;
    END IF;
  END IF;

  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_estado
BEFORE UPDATE ON solicitudes
FOR EACH ROW EXECUTE FUNCTION fn_validar_estado();

-- Nota: el historial (con usuario y motivo) lo registra la aplicación en la
-- misma transacción que el UPDATE de estado, porque la BD no conoce qué
-- usuario de la app hizo el cambio.

-- =====================================================
-- Datos iniciales
-- =====================================================
INSERT INTO roles (nombre) VALUES
  ('ADMINISTRADOR'), ('USUARIO'), ('TECNICO'), ('SUPERVISOR');

INSERT INTO categorias (nombre, descripcion) VALUES
  ('Hardware',  'Fallas de computadores, teclados, monitores, impresoras'),
  ('Software', 'Instalación, licencias y errores de programas'),
  ('Red',      'Internet, WiFi y conectividad'),
  ('Otros',    'Cualquier otro requerimiento de la sala');

INSERT INTO equipos (codigo, tipo, ubicacion) VALUES
  ('PC-01', 'PC',        'Sala 1'),
  ('PC-02', 'PC',        'Sala 1'),
  ('PC-03', 'PC',        'Sala 1'),
  ('IMP-01', 'IMPRESORA', 'Sala 1'),
  ('PROY-01', 'PROYECTOR', 'Sala 1');
