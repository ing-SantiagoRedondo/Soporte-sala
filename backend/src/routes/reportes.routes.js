import { Router } from 'express';
import { autenticar, requerirRol } from '../middleware/auth.js';
import { manejar } from '../utils/errores.js';
import * as svc from '../services/reportes.service.js';

const router = Router();
router.use(autenticar, requerirRol('SUPERVISOR', 'ADMINISTRADOR'));

// Totales y agrupaciones. Filtros opcionales: desde, hasta, estado, prioridad, categoria_id, responsable_id
router.get('/resumen', manejar(async (req, res) => res.json(await svc.resumen(req.query))));

// Listado filtrado de solicitudes (mismos filtros)
router.get('/solicitudes', manejar(async (req, res) => res.json(await svc.listado(req.query))));

export default router;
