// backend/routes/supervisores.js
const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const { verifyToken, authorize } = require('../middleware/auth');

// Obtener todos los supervisores (desde usuarios con rol supervisor)
router.get('/', verifyToken, async (req, res) => {
  if (req.user.rol !== 'master' && req.user.rol !== 'gerencia') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  try {
    const supervisores = await Usuario.find({ rol: 'supervisor', activo: true })
      .select('nombre email telefono fechaContratacion activo localesAsignados');
    res.json(supervisores);
  } catch (error) {
    console.error('Error al obtener supervisores:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Obtener un supervisor por ID
router.get('/:id', verifyToken, async (req, res) => {
  if (req.user.rol !== 'master' && req.user.rol !== 'gerencia') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  try {
    const supervisor = await Usuario.findOne({ _id: req.params.id, rol: 'supervisor' })
      .select('nombre email telefono fechaContratacion activo localesAsignados');
    if (!supervisor) {
      return res.status(404).json({ error: 'Supervisor no encontrado' });
    }
    res.json(supervisor);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Crear supervisor (master only)
router.post('/', verifyToken, authorize('master'), async (req, res) => {
  try {
    const { nombre, email, telefono, password } = req.body;

    const existe = await Usuario.findOne({ email });
    if (existe) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    const usuario = new Usuario({
      nombre,
      email,
      password: password || 'Supervisor123!',
      telefono: telefono || '',
      rol: 'supervisor',
      localesAsignados: [],
      activo: true
    });

    await usuario.save();

    res.status(201).json({
      message: 'Supervisor creado exitosamente',
      supervisor: { id: usuario._id, nombre, email }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar supervisor (master only)
router.put('/:id', verifyToken, authorize('master'), async (req, res) => {
  try {
    const { nombre, email, telefono, activo } = req.body;

    const usuario = await Usuario.findOne({ _id: req.params.id, rol: 'supervisor' });
    if (!usuario) {
      return res.status(404).json({ error: 'Supervisor no encontrado' });
    }

    if (nombre) usuario.nombre = nombre;
    if (email) usuario.email = email;
    if (telefono !== undefined) usuario.telefono = telefono;
    if (activo !== undefined) usuario.activo = activo;

    await usuario.save();

    res.json({
      message: 'Supervisor actualizado',
      supervisor: { id: usuario._id, nombre: usuario.nombre, email: usuario.email, activo: usuario.activo }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar supervisor (lógico, master only)
router.delete('/:id', verifyToken, authorize('master'), async (req, res) => {
  try {
    const usuario = await Usuario.findOne({ _id: req.params.id, rol: 'supervisor' });
    if (!usuario) {
      return res.status(404).json({ error: 'Supervisor no encontrado' });
    }

    usuario.activo = false;
    await usuario.save();

    res.json({ message: 'Supervisor desactivado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;