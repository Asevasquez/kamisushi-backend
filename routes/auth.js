const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email y contraseña son requeridos',
        code: 'MISSING_FIELDS',
      });
    }

    const user = await Usuario.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(401).json({
        error: 'El correo ingresado no está registrado',
        code: 'EMAIL_NOT_FOUND',
      });
    }

    if (!user.activo) {
      return res.status(401).json({
        error: 'Tu cuenta está desactivada. Contacta al administrador.',
        code: 'ACCOUNT_DISABLED',
      });
    }

    const isValid = await user.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({
        error: 'Contraseña incorrecta',
        code: 'WRONG_PASSWORD',
      });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, rol: user.rol, nombre: user.nombre },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      usuario: {
        id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
      },
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor', code: 'SERVER_ERROR' });
  }
});

// Cambiar contraseña
router.post('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await Usuario.findById(decoded.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const { currentPassword, newPassword } = req.body;

    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    user.password = newPassword;
    await user.save();

    console.log('✅ Contraseña actualizada para usuario:', user.email);
    res.json({ message: 'Contraseña actualizada exitosamente' });
  } catch (error) {
    console.error('Error en change-password:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
