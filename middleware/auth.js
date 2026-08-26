// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

const verifyToken = async (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token no proporcionado' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await Usuario.findById(decoded.id)
      .populate('localesAsignados')
      .select('-password');
    if (!user || !user.activo) return res.status(401).json({ error: 'Usuario no válido' });
    req.user = {
      id: user._id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      localesAsignados: user.localesAsignados || []
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  if (!roles.includes(req.user.rol)) return res.status(403).json({ error: `Requiere rol: ${roles.join(', ')}` });
  next();
};

const verificarAccesoLocal = (req, res, next) => {
  const { localId } = req.params;
  
  if (req.user.rol === 'master') return next();
  
  if (req.user.rol === 'administrador') {
    const tieneAcceso = req.user.localesAsignados.some(l => l._id.toString() === localId);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este local' });
    }
    return next();
  }
  
  if (req.user.rol === 'gerencia') return next();
  
  return res.status(403).json({ error: 'Acceso denegado' });
};

module.exports = { verifyToken, authorize, verificarAccesoLocal };