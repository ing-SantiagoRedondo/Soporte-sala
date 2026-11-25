import { pool, query } from '../config/db.js';
import { ReglaNegocioError } from '../utils/errores.js';

export const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'];
export const ESTADOS = ['REGISTRADA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA', 'RECHAZADA', 'REABIERTA'];

// ---------- Quién es quién respecto a una solicitud ----------
const esStaff = (u) => ['ADMINISTRADOR', 'SUPERVISOR'].includes(u.rol);
const esDueno = (u, s) => u.rol === 'USUARIO' && Number(s.solicitante_id) === Number(u.id);
const esTecnicoAsignado = (u, s) => u.rol === 'TECNICO' && Number(s.responsable_id) === Number(u.id);
const staffODueno = (u, s) => esStaff(u) || esDueno(u, s);

// ---------- Máquina de estados: transición -> quién puede y qué exige ----------
const TRANSICIONES = {
  'ASIGNADA>EN_PROCESO':   { permite: esTecnicoAsignado },
  'REABIERTA>EN_PROCESO':  { permite: esTecnicoAsignado },
  'EN_PROCESO>RESUELTA':   { permite: esTecnicoAsignado, requiere: ['solucion'] },
  'RESUELTA>CERRADA':      { permite: staffODueno },
  'REGISTRADA>RECHAZADA':  { permite: (u) => esStaff(u), requiere: ['motivo'] },
  'ASIGNADA>RECHAZADA':    { permite: (u) => esStaff(u), requiere: ['motivo'] },
  'RESUELTA>REABIERTA':    { permite: staffODueno, requiere: ['motivo'] },
  'CERRADA>REABIERTA':     { permite: staffODueno, requiere: ['motivo'] },
};

// ---------- Utilidades ----------
async function enTransaccion(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function bloquear(client, id) {
  const { rows } = await client.query('SELECT * FROM solicitudes WHERE id = $1 FOR UPDATE', [id]);
  if (!rows[0]) throw new ReglaNegocioError('Solicitud no encontrada', 404);
  return rows[0];
}

async function notificar(client, usuarioIds, solicitudId, mensaje) {
  const ids = [...new Set(usuarioIds.filter(Boolean).map(Number))];
  for (const uid of ids) {
    await client.query(
      'INSERT INTO notificaciones (usuario_id, solicitud_id, mensaje) VALUES ($1, $2, $3)',
      [uid, solicitudId, mensaje]
    );
  }
}

async function registrarHistorial(client, solicitudId, anterior, nuevo, usuarioId, motivo) {
  await client.query(
    `INSERT INTO historial_estados (solicitud_id, estado_anterior, estado_nuevo, usuario_id, motivo)
     VALUES ($1, $2, $3, $4, $5)`,
    [solicitudId, anterior, nuevo, usuarioId, motivo]
  );
}

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

const SELECT_BASE = `
  SELECT s.*, c.nombre AS categoria, e.codigo AS equipo,
         us.nombre AS solicitante, ur.nombre AS responsable
  FROM solicitudes s
  JOIN categorias c  ON c.id  = s.categoria_id
  LEFT JOIN equipos e ON e.id = s.equipo_id
  JOIN usuarios us   ON us.id = s.solicitante_id
  LEFT JOIN usuarios ur ON ur.id = s.responsable_id`;

// ---------- Casos de uso ----------

// RF04: registrar una solicitud (estado inicial REGISTRADA)
export async function registrar(usuario, { categoria_id, equipo_id, descripcion, prioridad = 'MEDIA' }) {
  if (!texto(descripcion)) throw new ReglaNegocioError('La descripción es obligatoria');
  if (!Number.isInteger(Number(categoria_id))) throw new ReglaNegocioError('La categoría es obligatoria');
  if (!PRIORIDADES.includes(prioridad)) {
    throw new ReglaNegocioError(`Prioridad inválida. Use: ${PRIORIDADES.join(', ')}`);
  }

  return enTransaccion(async (client) => {
    const cat = await client.query('SELECT id FROM categorias WHERE id = $1 AND activa', [categoria_id]);
    if (!cat.rowCount) throw new ReglaNegocioError('Categoría no válida');

    if (equipo_id) {
      const eq = await client.query('SELECT id FROM equipos WHERE id = $1 AND activo', [equipo_id]);
      if (!eq.rowCount) throw new ReglaNegocioError('Equipo no válido');
    }

    const { rows: [s] } = await client.query(
      `INSERT INTO solicitudes (solicitante_id, categoria_id, equipo_id, descripcion, prioridad)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [usuario.id, categoria_id, equipo_id || null, texto(descripcion), prioridad]
    );
    await registrarHistorial(client, s.id, null, 'REGISTRADA', usuario.id, 'Registro de la solicitud');

    const { rows: staff } = await client.query(
      `SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id
       WHERE r.nombre IN ('ADMINISTRADOR', 'SUPERVISOR') AND u.activo`
    );
    await notificar(client, staff.map((r) => r.id), s.id, `Nueva solicitud ${s.codigo} registrada`);
    return s;
  });
}

// RF05 / RF06: cada rol ve solo lo que le corresponde
export async function listar(usuario, { estado } = {}) {
  const condiciones = [];
  const params = [];

  if (usuario.rol === 'USUARIO') {
    params.push(usuario.id);
    condiciones.push(`s.solicitante_id = $${params.length}`);
  } else if (usuario.rol === 'TECNICO') {
    params.push(usuario.id);
    condiciones.push(`s.responsable_id = $${params.length}`);
  }
  if (estado) {
    if (!ESTADOS.includes(estado)) throw new ReglaNegocioError('Estado inválido');
    params.push(estado);
    condiciones.push(`s.estado = $${params.length}`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await query(`${SELECT_BASE} ${where} ORDER BY s.fecha_registro DESC`, params);
  return rows;
}

// RF09: detalle con historial y observaciones
export async function obtener(usuario, id) {
  const { rows } = await query(`${SELECT_BASE} WHERE s.id = $1`, [id]);
  const s = rows[0];
  if (!s) throw new ReglaNegocioError('Solicitud no encontrada', 404);
  if (!(esStaff(usuario) || esDueno(usuario, s) || esTecnicoAsignado(usuario, s))) {
    throw new ReglaNegocioError('No tienes acceso a esta solicitud', 403);
  }

  const historial = await query(
    `SELECT h.estado_anterior, h.estado_nuevo, h.motivo, h.fecha, u.nombre AS usuario
     FROM historial_estados h JOIN usuarios u ON u.id = h.usuario_id
     WHERE h.solicitud_id = $1 ORDER BY h.fecha, h.id`,
    [id]
  );
  const observaciones = await query(
    `SELECT o.texto, o.creada_en, u.nombre AS usuario
     FROM observaciones o JOIN usuarios u ON u.id = o.usuario_id
     WHERE o.solicitud_id = $1 ORDER BY o.creada_en, o.id`,
    [id]
  );
  return { ...s, historial: historial.rows, observaciones: observaciones.rows };
}

// Asignar o reasignar responsable (solo administrador o supervisor)
export async function asignar(usuario, id, { responsable_id, motivo }) {
  if (!esStaff(usuario)) throw new ReglaNegocioError('No tienes permiso para asignar', 403);
  if (!Number.isInteger(Number(responsable_id))) throw new ReglaNegocioError('Responsable obligatorio');

  return enTransaccion(async (client) => {
    const s = await bloquear(client, id);
    if (['RESUELTA', 'CERRADA', 'RECHAZADA'].includes(s.estado)) {
      throw new ReglaNegocioError(`No se puede asignar una solicitud en estado ${s.estado}`, 409);
    }

    const { rows: [tec] } = await client.query(
      `SELECT u.id, u.nombre FROM usuarios u JOIN roles r ON r.id = u.rol_id
       WHERE u.id = $1 AND r.nombre = 'TECNICO' AND u.activo`,
      [responsable_id]
    );
    if (!tec) throw new ReglaNegocioError('El responsable debe ser un técnico activo');

    const esReasignacion = s.responsable_id !== null;
    const nuevoEstado = ['REGISTRADA', 'REABIERTA'].includes(s.estado) ? 'ASIGNADA' : s.estado;

    const { rows: [actualizada] } = await client.query(
      'UPDATE solicitudes SET responsable_id = $1, estado = $2 WHERE id = $3 RETURNING *',
      [tec.id, nuevoEstado, id]
    );
    await registrarHistorial(
      client, id, s.estado, nuevoEstado, usuario.id,
      texto(motivo) || `${esReasignacion ? 'Reasignada' : 'Asignada'} a ${tec.nombre}`
    );
    await notificar(client, [tec.id, s.solicitante_id].filter((x) => Number(x) !== Number(usuario.id)),
      id, `La solicitud ${s.codigo} fue ${esReasignacion ? 'reasignada' : 'asignada'} a ${tec.nombre}`);
    return actualizada;
  });
}

// RF07: cambio de estado respetando permisos y reglas de negocio
export async function cambiarEstado(usuario, id, { estado, motivo, solucion }) {
  if (!ESTADOS.includes(estado)) throw new ReglaNegocioError('Estado inválido');
  if (estado === 'ASIGNADA') {
    throw new ReglaNegocioError('Para asignar o reasignar usa el endpoint de asignación');
  }

  return enTransaccion(async (client) => {
    const s = await bloquear(client, id);

    if (s.estado === 'CERRADA' && estado !== 'REABIERTA') {
      throw new ReglaNegocioError('La solicitud está cerrada: solo puede reabrirse', 409);
    }
    const regla = TRANSICIONES[`${s.estado}>${estado}`];
    if (!regla) throw new ReglaNegocioError(`Transición no permitida: ${s.estado} → ${estado}`, 409);
    if (!regla.permite(usuario, s)) throw new ReglaNegocioError('No tienes permiso para esta transición', 403);

    const datos = { motivo: texto(motivo), solucion: texto(solucion) };
    for (const campo of regla.requiere ?? []) {
      if (!datos[campo]) throw new ReglaNegocioError(`El campo "${campo}" es obligatorio para esta transición`);
    }

    const { rows: [actualizada] } = await client.query(
      'UPDATE solicitudes SET estado = $1, solucion = COALESCE($2, solucion) WHERE id = $3 RETURNING *',
      [estado, datos.solucion || null, id]
    );
    await registrarHistorial(
      client, id, s.estado, estado, usuario.id,
      datos.motivo || datos.solucion || `Cambio de estado a ${estado}`
    );
    await notificar(client, [s.solicitante_id, s.responsable_id].filter((x) => Number(x) !== Number(usuario.id)),
      id, `La solicitud ${s.codigo} cambió a ${estado}`);
    return actualizada;
  });
}

// RF08: observaciones
export async function agregarObservacion(usuario, id, { texto: contenido }) {
  if (!texto(contenido)) throw new ReglaNegocioError('La observación no puede estar vacía');

  return enTransaccion(async (client) => {
    const s = await bloquear(client, id);
    if (!(esStaff(usuario) || esDueno(usuario, s) || esTecnicoAsignado(usuario, s))) {
      throw new ReglaNegocioError('No tienes acceso a esta solicitud', 403);
    }
    if (s.estado === 'CERRADA') throw new ReglaNegocioError('La solicitud está cerrada', 409);

    const { rows: [obs] } = await client.query(
      'INSERT INTO observaciones (solicitud_id, usuario_id, texto) VALUES ($1, $2, $3) RETURNING *',
      [id, usuario.id, texto(contenido)]
    );
    await notificar(client, [s.solicitante_id, s.responsable_id].filter((x) => Number(x) !== Number(usuario.id)),
      id, `Nueva observación en la solicitud ${s.codigo}`);
    return obs;
  });
}
