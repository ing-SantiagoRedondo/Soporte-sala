import { query } from '../config/db.js';
import { ReglaNegocioError } from './errores.js';

// Actualiza solo las columnas con valor definido. Los nombres de tabla y columna
// salen siempre del código (nunca del usuario), por eso es seguro interpolarlos.
export async function actualizarFila(tabla, id, campos) {
  const entradas = Object.entries(campos).filter(([, v]) => v !== undefined);
  if (!entradas.length) throw new ReglaNegocioError('No hay nada que actualizar');

  const sets = entradas.map(([col], i) => `${col} = $${i + 1}`);
  const params = [...entradas.map(([, v]) => v), id];
  const { rows } = await query(
    `UPDATE ${tabla} SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) throw new ReglaNegocioError('Registro no encontrado', 404);
  return rows[0];
}

export const texto = (v) => (typeof v === 'string' ? v.trim() : '');
