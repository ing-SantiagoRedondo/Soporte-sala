import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';

const router = Router();

// Registro público: solo crea usuarios con rol USUARIO
router.post('/registro', async (req, res) => {
  const { nombre, correo, password } = req.body;
  if (!nombre || !correo || !password || password.length < 8) {
    return res.status(400).json({ error: 'Datos inválidos (contraseña mínimo 8 caracteres)' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO usuarios (nombre, correo, password_hash, rol_id)
       VALUES ($1, $2, $3, (SELECT id FROM roles WHERE nombre = 'USUARIO'))
       RETURNING id, nombre, correo`,
      [nombre, correo.toLowerCase(), hash]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'El correo ya está registrado' });
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.post('/login', async (req, res) => {
  const { correo, password } = req.body;
  if (!correo || !password) return res.status(400).json({ error: 'Faltan datos' });

  try {
    const { rows } = await query(
      `SELECT u.id, u.nombre, u.password_hash, u.activo, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
       WHERE u.correo = $1`,
      [correo.toLowerCase()]
    );
    const u = rows[0];
    if (!u || !u.activo || !(await bcrypt.compare(password, u.password_hash))) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign({ id: u.id, rol: u.rol }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, usuario: { id: u.id, nombre: u.nombre, rol: u.rol } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
