const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Auditoria = require('../models/Auditoria');
const Revision = require('../models/Revision');
const { verifyToken } = require('../middleware/auth');
const { procesarFotosEnObjeto } = require('./upload');

// Solo estos 3 roles pueden ver/usar el módulo de Auditoría, tanto desde la
// app como desde el dashboard.
const ROLES_PERMITIDOS = ['auditor', 'gerencia', 'master'];

function soloRolesPermitidos(req, res, next) {
  if (!ROLES_PERMITIDOS.includes(req.user.rol)) {
    return res.status(403).json({ error: 'No tienes acceso al módulo de Auditoría' });
  }
  next();
}
router.use(verifyToken, soloRolesPermitidos);

// ────────────────────────────────────────────────────────────
// Cálculo de puntajes — mismas categorías que Revision
// ────────────────────────────────────────────────────────────
function obtenerCategoria(pct) {
  if (pct >= 100) return 'EXCELENTE';
  if (pct >= 95) return 'MUY BUENO';
  if (pct >= 80) return 'BUENO';
  if (pct >= 70) return 'REGULAR';
  if (pct >= 60) return 'MALO';
  return 'PÉSIMO';
}

function calcularPuntajes(data) {
  const sumaPreguntas = (preguntas) =>
    (preguntas || []).reduce((acc, p) => acc + (Number(p.puntaje) || 0), 0);

  const puntajeSCBruto = sumaPreguntas(data.servicioCliente?.preguntas);
  const cantidadReclamos = (data.reclamos || []).length;
  // La cantidad de reclamos se resta directo de los puntos de Servicio al
  // Cliente, con piso en 0 (no puede quedar negativo).
  const puntajeServicioCliente = Math.max(0, puntajeSCBruto - cantidadReclamos);
  const puntajeCocina = sumaPreguntas(data.cocina?.preguntas);

  // Cada sección vale 50% sobre un máximo de 30 puntos — el total posible
  // es 60 puntos, que se lleva a porcentaje.
  const puntajeTotal = ((puntajeServicioCliente + puntajeCocina) / 60) * 100;

  return {
    puntajeServicioCliente,
    puntajeCocina,
    puntajeTotal: Math.round(puntajeTotal * 10) / 10,
    categoria: obtenerCategoria(puntajeTotal),
  };
}

// ────────────────────────────────────────────────────────────
// GET /revisiones-disponibles — revisiones finalizadas que aún no tienen
// auditoría, para la pantalla de "elegir revisión" en la app.
// ────────────────────────────────────────────────────────────
router.get('/revisiones-disponibles', async (req, res) => {
  try {
    const { busqueda, page = 1, limit = 20 } = req.query;

    const yaAuditadas = await Auditoria.find({}).distinct('revisionId');

    const query = { esBorrador: false, _id: { $nin: yaAuditadas } };
    if (busqueda) {
      const locales = await mongoose.model('Local').find({
        nombre: { $regex: busqueda, $options: 'i' },
      }).distinct('_id');
      query.localId = { $in: locales };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      Revision.find(query)
        .populate('localId', 'nombre ciudad')
        .sort({ fechaRevision: -1 })
        .skip(skip).limit(Number(limit))
        .select('localId fechaRevision supervisorNombre porcentajeTotal categoria'),
      Revision.countDocuments(query),
    ]);

    res.json({
      data: data.map(r => ({
        _id: r._id,
        localNombre: r.localId?.nombre || 'Sin local',
        localCiudad: r.localId?.ciudad || '',
        fechaRevision: r.fechaRevision,
        supervisorNombre: r.supervisorNombre,
        porcentajeTotal: r.porcentajeTotal,
        categoria: r.categoria,
      })),
      total,
    });
  } catch (error) {
    console.error('Error listando revisiones disponibles para auditar:', error);
    res.status(500).json({ error: error.message });
  }
});

// ────────────────────────────────────────────────────────────
// GET / — listado de auditorías (dashboard), con filtros
// ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { mes, localId, auditorId, categoria, page = 1, limit = 20 } = req.query;
    const query = {};

    if (mes) {
      const [anio, m] = mes.split('-').map(Number);
      const inicio = new Date(anio, m - 1, 1);
      const fin = new Date(anio, m, 0, 23, 59, 59, 999);
      query.fechaAuditoria = { $gte: inicio, $lte: fin };
    }
    if (localId) query.localId = new mongoose.Types.ObjectId(localId);
    if (auditorId) query.auditorId = new mongoose.Types.ObjectId(auditorId);
    if (categoria) query.categoria = { $in: String(categoria).split(',') };

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      Auditoria.find(query).sort({ fechaAuditoria: -1 }).skip(skip).limit(Number(limit)),
      Auditoria.countDocuments(query),
    ]);

    res.json({ data, total });
  } catch (error) {
    console.error('Error listando auditorías:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /:id — detalle de una auditoría (dashboard, PDF)
router.get('/:id', async (req, res) => {
  try {
    const auditoria = await Auditoria.findById(req.params.id);
    if (!auditoria) return res.status(404).json({ error: 'Auditoría no encontrada' });
    res.json(auditoria);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ────────────────────────────────────────────────────────────
// POST / — crear una auditoría nueva (borrador o directo finalizada)
// ────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    req.body = procesarFotosEnObjeto(req.body);
    const { revisionId } = req.body;

    if (!revisionId) return res.status(400).json({ error: 'Falta la revisión a auditar' });

    const yaExiste = await Auditoria.findOne({ revisionId });
    if (yaExiste) return res.status(400).json({ error: 'Esta revisión ya fue auditada' });

    const revision = await Revision.findById(revisionId).populate('localId', 'nombre');
    if (!revision) return res.status(404).json({ error: 'La revisión a auditar no existe' });
    if (revision.esBorrador) return res.status(400).json({ error: 'No se puede auditar una revisión que sigue como borrador' });

    const puntajes = calcularPuntajes(req.body);

    const auditoria = new Auditoria({
      revisionId,
      localId: revision.localId?._id || revision.localId,
      localNombre: revision.localId?.nombre || 'Sin local',
      fechaRevision: revision.fechaRevision,
      supervisorNombre: revision.supervisorNombre || '',
      porcentajeRevisionOriginal: revision.porcentajeTotal || 0,
      categoriaRevisionOriginal: revision.categoria || '',
      auditorId: req.user.id,
      auditorNombre: req.user.nombre,
      servicioCliente: req.body.servicioCliente || {},
      cocina: req.body.cocina || {},
      reclamos: req.body.reclamos || [],
      ...puntajes,
      esBorrador: req.body.esBorrador !== false, // por defecto queda como borrador salvo que se pida lo contrario
    });

    await auditoria.save();
    console.log('Auditoría creada:', auditoria._id.toString(), '| Local:', auditoria.localNombre, '| Auditor:', req.user.nombre);
    res.status(201).json(auditoria);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Esta revisión ya fue auditada' });
    }
    console.error('Error creando auditoría:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /:id — actualizar una auditoría (mientras sigue como borrador)
router.put('/:id', async (req, res) => {
  try {
    req.body = procesarFotosEnObjeto(req.body);
    const auditoria = await Auditoria.findById(req.params.id);
    if (!auditoria) return res.status(404).json({ error: 'Auditoría no encontrada' });

    if (req.body.servicioCliente) auditoria.servicioCliente = req.body.servicioCliente;
    if (req.body.cocina) auditoria.cocina = req.body.cocina;
    if (req.body.reclamos) auditoria.reclamos = req.body.reclamos;

    const puntajes = calcularPuntajes(auditoria.toObject());
    Object.assign(auditoria, puntajes);

    await auditoria.save();
    res.json(auditoria);
  } catch (error) {
    console.error('Error actualizando auditoría:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /:id/finalizar
router.put('/:id/finalizar', async (req, res) => {
  try {
    req.body = procesarFotosEnObjeto(req.body || {});
    const auditoria = await Auditoria.findById(req.params.id);
    if (!auditoria) return res.status(404).json({ error: 'Auditoría no encontrada' });

    if (req.body.servicioCliente) auditoria.servicioCliente = req.body.servicioCliente;
    if (req.body.cocina) auditoria.cocina = req.body.cocina;
    if (req.body.reclamos) auditoria.reclamos = req.body.reclamos;

    const puntajes = calcularPuntajes(auditoria.toObject());
    Object.assign(auditoria, puntajes);
    auditoria.esBorrador = false;

    await auditoria.save();
    console.log('Auditoría finalizada:', auditoria._id.toString());
    res.json(auditoria);
  } catch (error) {
    console.error('Error finalizando auditoría:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /:id — solo master, igual que en Revisiones
router.delete('/:id', async (req, res) => {
  if (req.user.rol !== 'master') {
    return res.status(403).json({ error: 'Solo master puede eliminar auditorías' });
  }
  try {
    await Auditoria.findByIdAndDelete(req.params.id);
    res.json({ message: 'Auditoría eliminada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
