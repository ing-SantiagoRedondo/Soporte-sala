// Error de regla de negocio: se traduce a una respuesta HTTP con su código.
export class ReglaNegocioError extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

// Envuelve un handler async y centraliza el manejo de errores.
export const manejar = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e instanceof ReglaNegocioError) {
      return res.status(e.status).json({ error: e.message });
    }
    // Errores levantados por el trigger o los CHECK de la base de datos
    if (e.code === 'P0001' || e.code === '23514') {
      return res.status(409).json({ error: e.message });
    }
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un registro con ese valor' });
    }
    if (e.code === '23503') {
      return res.status(409).json({ error: 'El registro está relacionado con otros datos' });
    }
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
};

export function idParam(req, nombre = 'id') {
  const id = Number(req.params[nombre]);
  if (!Number.isInteger(id) || id < 1) throw new ReglaNegocioError('Id inválido');
  return id;
}
