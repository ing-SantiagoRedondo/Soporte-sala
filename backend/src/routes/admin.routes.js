import { Router } from 'express';
import { query } from '../config/db.js';
import { autenticar, requerirRol } from '../middleware/auth.js';
import { manejar, idParam, ReglaNegocioError } from '../utils/errores.js';
import { actualizarFila, texto } from '../utils/sql.js';

const TIPOS_EQUIPO = ['PC', 'PORTATIL', 'IMPRESORA', 'PROYECTOR', 'RED', 'OTRO'];

const router = Router();
router.use(autenticar, requerirRol('ADMINISTRADOR'));

// ----- Categorías (no se borran: se desactivan para conservar el historial) -----
router.get('/categorias', manejar(async (_req, res) => {
  const { rows } = await query('SELECT * FROM categorias ORDER BY nombre');
  res.json(rows);
}));

router.post('/categorias', manejar(async (req, res) => {
  if (!texto(req.body.nombre)) throw new ReglaNegocioError('El nombre es obligatorio');
  const { rows } = await query(
    'INSERT INTO categorias (nombre, descripcion) VALUES ($1, $2) RETURNING *',
    [texto(req.body.nombre), texto(req.body.descripcion) || null]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/categorias/:id', manejar(async (req, res) => {
  const { nombre, descripcion, activa } = req.body;
  if (nombre !== undefined && !texto(nombre)) throw new ReglaNegocioError('Nombre inválido');
  if (activa !== undefined && typeof activa !== 'boolean') throw new ReglaNegocioError('"activa" debe ser true o false');
  res.json(await actualizarFila('categorias', idParam(req), {
    nombre: nombre !== undefined ? texto(nombre) : undefined,
    descripcion: descripcion !== undefined ? texto(descripcion) : undefined,
    activa,
  }));
}));

// ----- Equipos de la sala -----
router.get('/equipos', manejar(async (_req, res) => {
  const { rows } = await query('SELECT * FROM equipos ORDER BY codigo');
  res.json(rows);
}));

router.post('/equipos', manejar(async (req, res) => {
  const { codigo, tipo, ubicacion } = req.body;
  if (!texto(codigo)) throw new ReglaNegocioError('El código es obligatorio');
  if (!TIPOS_EQUIPO.includes(tipo)) throw new ReglaNegocioError(`Tipo inválido. Use: ${TIPOS_EQUIPO.join(', ')}`);
  const { rows } = await query(
    'INSERT INTO equipos (codigo, tipo, ubicacion) VALUES ($1, $2, $3) RETURNING *',
    [texto(codigo), tipo, texto(ubicacion) || null]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/equipos/:id', manejar(async (req, res) => {
  const { codigo, tipo, ubicacion, activo } = req.body;
  if (codigo !== undefined && !texto(codigo)) throw new ReglaNegocioError('Código inválido');
  if (tipo !== undefined && !TIPOS_EQUIPO.includes(tipo)) throw new ReglaNegocioError('Tipo inválido');
  if (activo !== undefined && typeof activo !== 'boolean') throw new ReglaNegocioError('"activo" debe ser true o false');
  res.json(await actualizarFila('equipos', idParam(req), {
    codigo: codigo !== undefined ? texto(codigo) : undefined,
    tipo,
    ubicacion: ubicacion !== undefined ? texto(ubicacion) : undefined,
    activo,
  }));
}));

export default router;
