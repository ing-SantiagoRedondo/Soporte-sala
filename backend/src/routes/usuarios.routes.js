import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { autenticar, requerirRol } from '../middleware/auth.js';
import { manejar, idParam, ReglaNegocioError } from '../utils/errores.js';
import { actualizarFila, texto } from '../utils/sql.js';

const ROLES = ['ADMINISTRADOR', 'USUARIO', 'TECNICO', 'SUPERVISOR'];
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const router = Router();
router.use(autenticar, requerirRol('ADMINISTRADOR'));

const SELECT_USUARIO = `
  SELECT u.id, u.nombre, u.correo, u.activo, u.creado_en, r.nombre AS rol
  FROM usuarios u JOIN roles r ON r.id = u.rol_id`;

async function rolId(nombre) {
  if (!ROLES.includes(nombre)) throw new ReglaNegocioError(`Rol inválido. Use: ${ROLES.join(', ')}`);
  const { rows } = await query('SELECT id FROM roles WHERE nombre = $1', [nombre]);
  return rows[0].id;
}

router.get('/', manejar(async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.rol) {
    params.push(req.query.rol);
    where = 'WHERE r.nombre = $1';
  }
  const { rows } = await query(`${SELECT_USUARIO} ${where} ORDER BY u.nombre`, params);
  res.json(rows);
}));

router.post('/', manejar(async (req, res) => {
  const { nombre, correo, password, rol } = req.body;
  if (!texto(nombre)) throw new ReglaNegocioError('El nombre es obligatorio');
  if (!CORREO.test(texto(correo))) throw new ReglaNegocioError('Correo inválido');
  if (typeof password !== 'string' || password.length < 8) {
    throw new ReglaNegocioError('La contraseña debe tener mínimo 8 caracteres');
  }
  const idRol = await rolId(rol);
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO usuarios (nombre, correo, password_hash, rol_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [texto(nombre), texto(correo).toLowerCase(), hash, idRol]
  );
  const { rows: [creado] } = await query(`${SELECT_USUARIO} WHERE u.id = $1`, [rows[0].id]);
  res.status(201).json(creado);
}));

router.patch('/:id', manejar(async (req, res) => {
  const id = idParam(req);
  const { nombre, correo, rol, activo, password } = req.body;

  const { rows: [actual] } = await query(`${SELECT_USUARIO} WHERE u.id = $1`, [id]);
  if (!actual) throw new ReglaNegocioError('Usuario no encontrado', 404);

  const cambiaRol = rol !== undefined && rol !== actual.rol;
  const desactiva = activo === false && actual.activo;

  // Evita que el administrador se bloquee a sí mismo
  if (id === Number(req.usuario.id) && (cambiaRol || desactiva)) {
    throw new ReglaNegocioError('No puedes cambiar tu propio rol ni desactivarte', 409);
  }

  // Integridad: un técnico con solicitudes abiertas no puede dejar de serlo
  if (actual.rol === 'TECNICO' && (cambiaRol || desactiva)) {
    const { rows: [{ total }] } = await query(
      `SELECT COUNT(*)::int AS total FROM solicitudes
       WHERE responsable_id = $1 AND estado IN ('ASIGNADA', 'EN_PROCESO', 'REABIERTA')`,
      [id]
    );
    if (total > 0) {
      throw new ReglaNegocioError(`El técnico tiene ${total} solicitud(es) abierta(s): reasígnalas primero`, 409);
    }
  }

  if (nombre !== undefined && !texto(nombre)) throw new ReglaNegocioError('Nombre inválido');
  if (correo !== undefined && !CORREO.test(texto(correo))) throw new ReglaNegocioError('Correo inválido');
  if (activo !== undefined && typeof activo !== 'boolean') throw new ReglaNegocioError('"activo" debe ser true o false');
  if (password !== undefined && (typeof password !== 'string' || password.length < 8)) {
    throw new ReglaNegocioError('La contraseña debe tener mínimo 8 caracteres');
  }

  await actualizarFila('usuarios', id, {
    nombre: nombre !== undefined ? texto(nombre) : undefined,
    correo: correo !== undefined ? texto(correo).toLowerCase() : undefined,
    rol_id: rol !== undefined ? await rolId(rol) : undefined,
    activo,
    password_hash: password !== undefined ? await bcrypt.hash(password, 10) : undefined,
  });
  const { rows: [actualizado] } = await query(`${SELECT_USUARIO} WHERE u.id = $1`, [id]);
  res.json(actualizado);
}));

export default router;
