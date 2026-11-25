import jwt from 'jsonwebtoken';

// RF01: verifica que exista un token válido
export function autenticar(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET); // { id, rol }
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// RF01: control de acceso por rol
export const requerirRol = (...roles) => (req, res, next) => {
  if (!roles.includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'No tienes permiso para esta acción' });
  }
  next();
};
