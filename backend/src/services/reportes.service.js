import { query } from '../config/db.js';
import { ReglaNegocioError } from '../utils/errores.js';
import { ESTADOS, PRIORIDADES } from './solicitudes.service.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = (v) => FECHA.test(v) && !Number.isNaN(new Date(v).getTime());

// Construye el WHERE a partir de los filtros: estado, categoría, prioridad, responsable y periodo.
function construirFiltros(q) {
  const cond = [];
  const params = [];
  const agregar = (sql, valor) => {
    params.push(valor);
    cond.push(sql.replace('?', `$${params.length}`));
  };

  if (q.estado) {
    if (!ESTADOS.includes(q.estado)) throw new ReglaNegocioError('Estado inválido');
    agregar('s.estado = ?', q.estado);
  }
  if (q.prioridad) {
    if (!PRIORIDADES.includes(q.prioridad)) throw new ReglaNegocioError('Prioridad inválida');
    agregar('s.prioridad = ?', q.prioridad);
  }
  for (const campo of ['categoria_id', 'responsable_id']) {
    if (q[campo] !== undefined && q[campo] !== '') {
      const n = Number(q[campo]);
      if (!Number.isInteger(n) || n < 1) throw new ReglaNegocioError(`${campo} inválido`);
      agregar(`s.${campo} = ?`, n);
    }
  }
  if (q.desde) {
    if (!fechaValida(q.desde)) throw new ReglaNegocioError('Fecha "desde" inválida (use AAAA-MM-DD)');
    agregar('s.fecha_registro >= ?::date', q.desde);
  }
  if (q.hasta) {
    if (!fechaValida(q.hasta)) throw new ReglaNegocioError('Fecha "hasta" inválida (use AAAA-MM-DD)');
    agregar('s.fecha_registro < (?::date + 1)', q.hasta); // "hasta" es inclusivo
  }
  return { where: cond.length ? `WHERE ${cond.join(' AND ')}` : '', params };
}

export async function resumen(q) {
  const { where, params } = construirFiltros(q);
  const [total, porEstado, porCategoria, porPrioridad, porResponsable, tiempo] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM solicitudes s ${where}`, params),
    query(`SELECT s.estado, COUNT(*)::int AS total FROM solicitudes s ${where}
           GROUP BY s.estado ORDER BY total DESC`, params),
    query(`SELECT c.nombre AS categoria, COUNT(*)::int AS total
           FROM solicitudes s JOIN categorias c ON c.id = s.categoria_id ${where}
           GROUP BY c.nombre ORDER BY total DESC`, params),
    query(`SELECT s.prioridad, COUNT(*)::int AS total FROM solicitudes s ${where}
           GROUP BY s.prioridad ORDER BY total DESC`, params),
    query(`SELECT COALESCE(u.nombre, 'Sin asignar') AS responsable, COUNT(*)::int AS total
           FROM solicitudes s LEFT JOIN usuarios u ON u.id = s.responsable_id ${where}
           GROUP BY u.nombre ORDER BY total DESC`, params),
    // Tiempo promedio desde el registro hasta la primera vez que quedó RESUELTA
    query(`SELECT ROUND(AVG(EXTRACT(EPOCH FROM (r.fecha - s.fecha_registro)) / 3600)::numeric, 1) AS horas
           FROM solicitudes s
           JOIN LATERAL (SELECT MIN(h.fecha) AS fecha FROM historial_estados h
                         WHERE h.solicitud_id = s.id AND h.estado_nuevo = 'RESUELTA') r ON r.fecha IS NOT NULL
           ${where}`, params),
  ]);

  return {
    total: total.rows[0].total,
    tiempo_promedio_resolucion_horas: tiempo.rows[0].horas === null ? null : Number(tiempo.rows[0].horas),
    por_estado: porEstado.rows,
    por_categoria: porCategoria.rows,
    por_prioridad: porPrioridad.rows,
    por_responsable: porResponsable.rows,
  };
}

export async function listado(q) {
  const { where, params } = construirFiltros(q);
  const { rows } = await query(
    `SELECT s.id, s.codigo, s.fecha_registro, s.estado, s.prioridad, s.descripcion,
            c.nombre AS categoria, us.nombre AS solicitante, ur.nombre AS responsable
     FROM solicitudes s
     JOIN categorias c ON c.id = s.categoria_id
     JOIN usuarios us ON us.id = s.solicitante_id
     LEFT JOIN usuarios ur ON ur.id = s.responsable_id
     ${where} ORDER BY s.fecha_registro DESC LIMIT 500`,
    params
  );
  return rows;
}
