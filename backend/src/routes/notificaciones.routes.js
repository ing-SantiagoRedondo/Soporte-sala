import { Router } from 'express';
import { query } from '../config/db.js';
import { autenticar } from '../middleware/auth.js';
import { manejar, idParam } from '../utils/errores.js';

const router = Router();
router.use(autenticar);

// RF10: notificaciones internas del usuario autenticado
router.get('/', manejar(async (req, res) => {
  const soloNoLeidas = req.query.no_leidas === '1';
  const { rows } = await query(
    `SELECT id, solicitud_id, mensaje, leida, creada_en FROM notificaciones
     WHERE usuario_id = $1 ${soloNoLeidas ? 'AND NOT leida' : ''}
     ORDER BY creada_en DESC LIMIT 50`,
    [req.usuario.id]
  );
  res.json(rows);
}));

router.patch('/leer-todas', manejar(async (req, res) => {
  await query('UPDATE notificaciones SET leida = TRUE WHERE usuario_id = $1', [req.usuario.id]);
  res.json({ ok: true });
}));

router.patch('/:id/leer', manejar(async (req, res) => {
  const { rowCount } = await query(
    'UPDATE notificaciones SET leida = TRUE WHERE id = $1 AND usuario_id = $2',
    [idParam(req), req.usuario.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Notificación no encontrada' });
  res.json({ ok: true });
}));

export default router;
