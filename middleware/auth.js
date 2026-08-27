const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

// Verifica el token y carga el usuario completo desde la BD
// Esto es crítico para que los filtros por localesAsignados funcionen
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Cargar usuario completo desde BD con localesAsignados populados
    // Esto garantiza que req.user.localesAsignados siempre tenga los datos actuales
    const usuario = await Usuario.findById(decoded.id)
      .select('-password')
      .populate('localesAsignados', '_id nombre ciudad');

    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
    }

    req.user = {
      id: usuario._id.toString(),
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      supervisorId: usuario.supervisorId,
      localesAsignados: usuario.localesAsignados || [],
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    console.error('Error en verifyToken:', error);
    res.status(500).json({ error: 'Error de autenticación' });
  }
};

// Verifica que el usuario tenga uno de los roles permitidos
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({
        error: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}`,
      });
    }
    next();
  };
};

module.exports = { verifyToken, authorize };
