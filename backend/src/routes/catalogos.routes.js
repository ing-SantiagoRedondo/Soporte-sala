import { Router } from 'express';
import { query } from '../config/db.js';
import { autenticar, requerirRol } from '../middleware/auth.js';
import { manejar } from '../utils/errores.js';

const router = Router();
router.use(autenticar);

router.get('/categorias', manejar(async (_req, res) => {
  const { rows } = await query('SELECT id, nombre, descripcion FROM categorias WHERE activa ORDER BY nombre');
  res.json(rows);
}));

router.get('/equipos', manejar(async (_req, res) => {
  const { rows } = await query('SELECT id, codigo, tipo, ubicacion FROM equipos WHERE activo ORDER BY codigo');
  res.json(rows);
}));

// Técnicos disponibles para asignar (solo administrador y supervisor)
router.get('/tecnicos', requerirRol('ADMINISTRADOR', 'SUPERVISOR'), manejar(async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.nombre FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE r.nombre = 'TECNICO' AND u.activo ORDER BY u.nombre`
  );
  res.json(rows);
}));

export default router;
