// backend/routes/usuarios.js
const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const { verifyToken, authorize } = require('../middleware/auth');

// ============ RUTAS DE USUARIOS ============

// Obtener todos los usuarios (con filtro por rol)
router.get('/', verifyToken, authorize('master'), async (req, res) => {
  try {
    const { rol } = req.query;
    let query = {};
    if (rol) query.rol = rol;
    
    const usuarios = await Usuario.find(query)
      .select('-password')
      .populate('localesAsignados', 'nombre direccion ciudad');
    
    res.json(usuarios);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener un usuario por ID
router.get('/:id', verifyToken, authorize('master'), async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id)
      .select('-password')
      .populate('localesAsignados');
    
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(usuario);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear usuario
router.post('/', verifyToken, authorize('master'), async (req, res) => {
  try {
    const { nombre, email, password, rol, telefono } = req.body;

    const existe = await Usuario.findOne({ email });
    if (existe) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    const usuario = new Usuario({
      nombre,
      email,
      password,
      rol: rol || 'supervisor',
      telefono: telefono || '',
      localesAsignados: [],
      activo: true
    });

    await usuario.save();

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      usuario: { id: usuario._id, nombre, email, rol: usuario.rol }
    });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({ error: error.message });
  }
});

// Actualizar usuario
router.put('/:id', verifyToken, authorize('master'), async (req, res) => {
  try {
    const { nombre, email, rol, telefono, activo } = req.body;
    
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    if (nombre) usuario.nombre = nombre;
    if (email) usuario.email = email;
    if (rol) usuario.rol = rol;
    if (telefono !== undefined) usuario.telefono = telefono;
    if (activo !== undefined) usuario.activo = activo;
    
    await usuario.save();
    
    res.json({ 
      message: 'Usuario actualizado', 
      usuario: { id: usuario._id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, activo: usuario.activo }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar usuario (lógico)
router.delete('/:id', verifyToken, authorize('master'), async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    if (usuario.rol === 'master') {
      return res.status(403).json({ error: 'No se puede desactivar el usuario master' });
    }
    
    usuario.activo = false;
    await usuario.save();
    
    res.json({ message: 'Usuario desactivado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Asignar locales a un usuario
router.post('/:userId/asignar-locales', verifyToken, authorize('master'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { localesIds } = req.body;

    console.log(`📝 Asignando locales a usuario: ${userId}`);
    console.log(`📝 Locales a asignar:`, localesIds);

    const usuario = await Usuario.findById(userId);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Actualizar localesAsignados
    usuario.localesAsignados = localesIds || [];
    await usuario.save();

    // Obtener usuario actualizado con populate
    const usuarioActualizado = await Usuario.findById(userId)
      .populate('localesAsignados', 'nombre');

    console.log(`✅ Locales asignados correctamente a ${usuario.nombre}`);
    res.json({
      message: 'Locales asignados correctamente',
      localesAsignados: usuarioActualizado.localesAsignados
    });
  } catch (error) {
    console.error('Error asignando locales:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener locales asignados a un usuario
router.get('/:userId/locales', verifyToken, authorize('master'), async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.userId).populate('localesAsignados');
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(usuario.localesAsignados || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;