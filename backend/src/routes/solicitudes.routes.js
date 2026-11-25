import { Router } from 'express';
import { autenticar, requerirRol } from '../middleware/auth.js';
import { manejar, idParam } from '../utils/errores.js';
import * as svc from '../services/solicitudes.service.js';

const router = Router();
router.use(autenticar);

router.post('/', requerirRol('USUARIO'), manejar(async (req, res) => {
  res.status(201).json(await svc.registrar(req.usuario, req.body));
}));

router.get('/', manejar(async (req, res) => {
  res.json(await svc.listar(req.usuario, { estado: req.query.estado }));
}));

router.get('/:id', manejar(async (req, res) => {
  res.json(await svc.obtener(req.usuario, idParam(req)));
}));

router.patch('/:id/asignar', manejar(async (req, res) => {
  res.json(await svc.asignar(req.usuario, idParam(req), req.body));
}));

router.patch('/:id/estado', manejar(async (req, res) => {
  res.json(await svc.cambiarEstado(req.usuario, idParam(req), req.body));
}));

router.post('/:id/observaciones', manejar(async (req, res) => {
  res.status(201).json(await svc.agregarObservacion(req.usuario, idParam(req), req.body));
}));

export default router;
