const express = require('express');
const router = express.Router();
const Revision = require('../models/Revision');
const Local = require('../models/Local');
const Supervisor = require('../models/Supervisor');
const { verifyToken, authorize } = require('../middleware/auth');

// Obtener estadísticas del dashboard
router.get('/stats', [verifyToken, authorize('master', 'gerencia')], async (req, res) => {
  try {
    const { localId, supervisorId, fechaInicio, fechaFin } = req.query;
    
    let query = {};
    if (localId) query.localId = localId;
    if (supervisorId) query.supervisorId = supervisorId;
    if (fechaInicio || fechaFin) {
      query.fechaVisita = {};
      if (fechaInicio) query.fechaVisita.$gte = new Date(fechaInicio);
      if (fechaFin) query.fechaVisita.$lte = new Date(fechaFin);
    }
    
    const revisiones = await Revision.find(query);
    
    // Calcular estadísticas
    const totalRevisiones = revisiones.length;
    const promedioCalificacion = totalRevisiones > 0
      ? revisiones.reduce((sum, r) => sum + r.calificacionGeneral, 0) / totalRevisiones
      : 0;
    
    // Distribución de calificaciones
    const distribucionCalificaciones = {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
    };
    revisiones.forEach(r => {
      distribucionCalificaciones[r.calificacionGeneral]++;
    });
    
    // Revisiones por local
    const revisionesPorLocal = {};
    revisiones.forEach(r => {
      const localIdStr = r.localId.toString();
      revisionesPorLocal[localIdStr] = (revisionesPorLocal[localIdStr] || 0) + 1;
    });
    
    // Revisiones por supervisor
    const revisionesPorSupervisor = {};
    revisiones.forEach(r => {
      const supervisorIdStr = r.supervisorId.toString();
      revisionesPorSupervisor[supervisorIdStr] = (revisionesPorSupervisor[supervisorIdStr] || 0) + 1;
    });
    
    res.json({
      totalRevisiones,
      promedioCalificacion,
      distribucionCalificaciones,
      revisionesPorLocal,
      revisionesPorSupervisor,
      revisiones: revisiones,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

module.exports = router;