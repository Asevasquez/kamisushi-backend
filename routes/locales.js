const express = require('express');
const router = express.Router();
const Local = require('../models/Local');
const { verifyToken } = require('../middleware/auth');

// Si codigoExterno viene vacío/solo espacios, se quita del body en vez de
// guardarlo como "" — así el índice sparse+unique no choca entre locales
// que no tienen código (un "" guardado de verdad SÍ cuenta como valor
// duplicado para Mongo, a diferencia de un campo ausente).
function limpiarCodigoExterno(body) {
  if (typeof body.codigoExterno === 'string' && body.codigoExterno.trim() === '') {
    delete body.codigoExterno;
  }
  return body;
}

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
    const local = new Local(limpiarCodigoExterno(req.body));
    await local.save();
    res.status(201).json(local);
  } catch (error) {
    if (error.code === 11000) {
      const campo = Object.keys(error.keyPattern || {})[0] || 'valor';
      return res.status(400).json({ error: `Ya existe un local con ese ${campo === 'codigoExterno' ? 'código' : campo}` });
    }
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

router.put('/:id', verifyToken, async (req, res) => {
  if (req.user.rol !== 'master') {
    return res.status(403).json({ error: 'Solo master puede editar locales' });
  }
  try {
    const seEnvioVacio = typeof req.body.codigoExterno === 'string' && req.body.codigoExterno.trim() === '';
    const datos = limpiarCodigoExterno({ ...req.body });
    const update = seEnvioVacio ? { $set: datos, $unset: { codigoExterno: 1 } } : { $set: datos };
    const local = await Local.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    res.json(local);
  } catch (error) {
    if (error.code === 11000) {
      const campo = Object.keys(error.keyPattern || {})[0] || 'valor';
      return res.status(400).json({ error: `Ya existe un local con ese ${campo === 'codigoExterno' ? 'código' : campo}` });
    }
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