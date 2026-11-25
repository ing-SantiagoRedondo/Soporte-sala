// Crea los usuarios internos (el registro público solo crea rol USUARIO).
// Ejecutar una vez:  npm run seed
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';

const usuarios = [
  { nombre: 'Administrador',        correo: 'admin@soporte.com',      password: 'Admin12345',      rol: 'ADMINISTRADOR' },
  { nombre: 'Técnico de prueba',    correo: 'tecnico@soporte.com',    password: 'Tecnico12345',    rol: 'TECNICO' },
  { nombre: 'Supervisor de prueba', correo: 'supervisor@soporte.com', password: 'Supervisor12345', rol: 'SUPERVISOR' },
];

for (const u of usuarios) {
  const hash = await bcrypt.hash(u.password, 10);
  const { rowCount } = await pool.query(
    `INSERT INTO usuarios (nombre, correo, password_hash, rol_id)
     VALUES ($1, $2, $3, (SELECT id FROM roles WHERE nombre = $4))
     ON CONFLICT (correo) DO NOTHING`,
    [u.nombre, u.correo, hash, u.rol]
  );
  console.log(`${rowCount ? 'Creado ' : 'Ya existe'}: ${u.correo} (${u.rol})`);
}
await pool.end();
