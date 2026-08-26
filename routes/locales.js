const express = require('express');
const router = express.Router();
const Local = require('../models/Local');
const { verifyToken } = require('../middleware/auth');

// Rutas públicas
router.get('/activos', async (req, res) => {
  try {
    const locales = await Local.find({ activo: true });
    res.json(locales);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Rutas protegidas (solo master)
router.get('/', verifyToken, async (req, res) => {
  if (req.user.rol !== 'master' && req.user.rol !== 'gerencia') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  try {
    const locales = await Local.find();
    res.json(locales);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

router.post('/', verifyToken, async (req, res) => {
  if (req.user.rol !== 'master') {
    return res.status(403).json({ error: 'Solo master puede crear locales' });
  }
  try {
    const local = new Local(req.body);
    await local.save();
    res.status(201).json(local);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

router.put('/:id', verifyToken, async (req, res) => {
  if (req.user.rol !== 'master') {
    return res.status(403).json({ error: 'Solo master puede editar locales' });
  }
  try {
    const local = await Local.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(local);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  if (req.user.rol !== 'master') {
    return res.status(403).json({ error: 'Solo master puede eliminar locales' });
  }
  try {
    await Local.findByIdAndDelete(req.params.id);
    res.json({ message: 'Local eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

module.exports = router;