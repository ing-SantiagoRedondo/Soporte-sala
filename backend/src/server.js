import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { query } from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import solicitudesRoutes from './routes/solicitudes.routes.js';
import catalogosRoutes from './routes/catalogos.routes.js';
import notificacionesRoutes from './routes/notificaciones.routes.js';
import usuariosRoutes from './routes/usuarios.routes.js';
import adminRoutes from './routes/admin.routes.js';
import reportesRoutes from './routes/reportes.routes.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/solicitudes', solicitudesRoutes);
app.use('/api/catalogos', catalogosRoutes);
app.use('/api/notificaciones', notificacionesRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reportes', reportesRoutes);

// Verifica la conexión con Neon
app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, db: 'conectada' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
