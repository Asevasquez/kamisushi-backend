const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const Supervisor = require('../models/Supervisor');
const UsuarioLocal = require('../models/UsuarioLocal');
const Local = require('../models/Local');
const { verifyToken, authorize } = require('../middleware/auth');

// Obtener todos los usuarios (solo master)
router.get('/', verifyToken, authorize('master'), async (req, res) => {
  try {
    const usuarios = await Usuario.find().select('-password').sort({ createdAt: -1 });
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear usuario (solo master)
router.post('/', verifyToken, authorize('master'), async (req, res) => {
  try {
    const { nombre, email, password, rol, supervisorId } = req.body;

    const existe = await Usuario.findOne({ email });
    if (existe) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    const usuario = new Usuario({
      nombre,
      email,
      password,
      rol,
      supervisorId: rol === 'supervisor' ? supervisorId : null,
      activo: true,
    });

    await usuario.save();

    if (rol === 'supervisor' && supervisorId) {
      await Supervisor.findByIdAndUpdate(supervisorId, { nombre, email, activo: true });
    }

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      usuario: { id: usuario._id, nombre, email, rol },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Editar usuario (solo master)
router.put('/:id', verifyToken, authorize('master'), async (req, res) => {
  try {
    const { nombre, email, rol, activo, password } = req.body;
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    // No permitir editar el propio rol de master
    if (usuario.rol === 'master' && rol !== 'master') {
      return res.status(400).json({ error: 'No puedes cambiar el rol de un master' });
    }

    // Verificar email duplicado si cambió
    if (email && email !== usuario.email) {
      const existe = await Usuario.findOne({ email, _id: { $ne: req.params.id } });
      if (existe) return res.status(400).json({ error: 'El email ya está en uso' });
    }

    if (nombre) usuario.nombre = nombre;
    if (email) usuario.email = email;
    if (rol) usuario.rol = rol;
    if (activo !== undefined) usuario.activo = activo;

    // Solo actualizar contraseña si se envía una nueva
    if (password && password.trim().length >= 6) {
      usuario.password = password;
      await usuario.save(); // save() dispara el hook pre-save que hashea
    } else {
      // Usar updateOne para no disparar el hook de hash si no hay nueva contraseña
      await Usuario.updateOne({ _id: req.params.id }, {
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        activo: usuario.activo,
      });
    }

    const actualizado = await Usuario.findById(req.params.id).select('-password');
    res.json({ message: 'Usuario actualizado', usuario: actualizado });
  } catch (error) {
    console.error('Error editando usuario:', error);
    res.status(500).json({ error: error.message });
  }
});

// Eliminar usuario (solo master)
router.delete('/:id', verifyToken, authorize('master'), async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    // No permitir eliminar el propio master
    if (usuario.rol === 'master') {
      return res.status(400).json({ error: 'No puedes eliminar un usuario master' });
    }

    // En vez de eliminar, desactivar (preserva el historial de revisiones)
    await Usuario.updateOne({ _id: req.params.id }, { activo: false });

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

    await UsuarioLocal.deleteMany({ usuarioId: userId });

    if (localesIds && localesIds.length > 0) {
      const asignaciones = localesIds.map(localId => ({
        usuarioId: userId,
        localId,
        permisos: 'lectura',
        asignadoPor: req.user.id,
        activo: true,
      }));
      await UsuarioLocal.insertMany(asignaciones);
    }

    // También actualizar localesAsignados en el modelo Usuario
    await Usuario.updateOne({ _id: userId }, { localesAsignados: localesIds || [] });

    res.json({ message: 'Locales asignados correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener locales asignados a un usuario
router.get('/:userId/locales', verifyToken, authorize('master'), async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.userId).populate('localesAsignados');
    if (usuario?.localesAsignados?.length > 0) {
      return res.json(usuario.localesAsignados);
    }

    // Fallback: buscar en UsuarioLocal
    const asignaciones = await UsuarioLocal.find({
      usuarioId: req.params.userId,
      activo: true,
    }).populate('localId');
    res.json(asignaciones.map(a => a.localId).filter(Boolean));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
