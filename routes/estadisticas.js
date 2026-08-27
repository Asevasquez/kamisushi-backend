const express = require('express');
const router = express.Router();
const Revision = require('../models/Revision');
const Local = require('../models/Local');
const UsuarioLocal = require('../models/UsuarioLocal');
const Estadistica = require('../models/Estadistica');
const { verifyToken } = require('../middleware/auth');

// Obtener estadísticas generales del dashboard
// backend/routes/estadisticas.js - Modificar el dashboard
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    let localesPermitidos = [];
    
    if (req.user.rol === 'master') {
      // Master ve todos los locales
      const todosLocales = await Local.find({ activo: true });
      localesPermitidos = todosLocales.map(l => l._id.toString());
    } else if (req.user.rol === 'administrador') {
      // Administrador solo sus locales asignados
      localesPermitidos = req.user.localesAsignados.map(l => l._id.toString());
    } else if (req.user.rol === 'gerencia') {
      // Gerencia ve todos los locales (solo lectura)
      const todosLocales = await Local.find({ activo: true });
      localesPermitidos = todosLocales.map(l => l._id.toString());
    } else {
      // Supervisor solo sus propias revisiones
      const revisiones = await Revision.find({ supervisorId: req.user.supervisorId });
      const localesIds = [...new Set(revisiones.map(r => r.localId))];
      localesPermitidos = localesIds;
    }

    const { periodo = 'mensual', fechaInicio, fechaFin, localId } = req.query;
    
    // Validar que el usuario tiene acceso al local solicitado
    if (localId && !localesPermitidos.includes(localId)) {
      return res.status(403).json({ error: 'No tienes acceso a este local' });
    }

    // Construir query de fechas
    let query = {};
    if (fechaInicio && fechaFin) {
      query.fechaRevision = {
        $gte: new Date(fechaInicio),
        $lte: new Date(fechaFin)
      };
    } else {
      // Por defecto, últimos 12 meses
      const hoy = new Date();
      const hace12Meses = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1);
      query.fechaRevision = { $gte: hace12Meses };
    }

    if (localId) {
      query.localId = localId;
    } else if (localesPermitidos.length > 0 && req.user.rol !== 'master') {
      query.localId = { $in: localesPermitidos };
    }

    // Obtener revisiones
    const revisiones = await Revision.find(query)
      .populate('localId')
      .populate('supervisorId');

    // Calcular estadísticas
    const totalRevisiones = revisiones.length;
    const promedioGeneral = totalRevisiones > 0
      ? revisiones.reduce((sum, r) => sum + (r.porcentajeTotal || 0), 0) / totalRevisiones
      : 0;

    // Distribución por categoría
    const distribucionCategorias = {
      EXCELENTE: 0, 'MUY BUENO': 0, BUENO: 0, REGULAR: 0, MALO: 0, PÉSIMO: 0
    };
    revisiones.forEach(r => {
      if (distribucionCategorias[r.categoria] !== undefined) {
        distribucionCategorias[r.categoria]++;
      }
    });

    // Estadísticas por local
    const estadisticasPorLocal = {};
    revisiones.forEach(rev => {
      const localNombre = rev.localId?.nombre || 'Desconocido';
      if (!estadisticasPorLocal[localNombre]) {
        estadisticasPorLocal[localNombre] = {
          revisiones: 0,
          promedio: 0,
          ultimaRevision: null,
          evolucion: []
        };
      }
      estadisticasPorLocal[localNombre].revisiones++;
      estadisticasPorLocal[localNombre].promedio = 
        (estadisticasPorLocal[localNombre].promedio + (rev.porcentajeTotal || 0)) / 
        estadisticasPorLocal[localNombre].revisiones;
    });

    // Evolución temporal (agrupada por mes)
    const evolucionMensual = {};
    revisiones.forEach(rev => {
      const mes = rev.fechaRevision.toISOString().slice(0, 7);
      if (!evolucionMensual[mes]) {
        evolucionMensual[mes] = { total: 0, suma: 0 };
      }
      evolucionMensual[mes].total++;
      evolucionMensual[mes].suma += (rev.porcentajeTotal || 0);
    });

    const evolucion = Object.entries(evolucionMensual).map(([mes, data]) => ({
      periodo: mes,
      total: data.total,
      promedio: data.suma / data.total
    })).sort((a, b) => a.periodo.localeCompare(b.periodo));

    // Top reclamos
    const incidencias = {};
    revisiones.forEach(rev => {
      (rev.servicioCliente?.reclamos || []).forEach(reclamo => {
        const tipo = reclamo.tipo;
        if (!incidencias[tipo]) {
          incidencias[tipo] = { count: 0, seccion: 'Servicio al Cliente' };
        }
        incidencias[tipo].count++;
      });
    });

    const topIncidencias = Object.entries(incidencias)
      .map(([tipo, data]) => ({ tipo, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Estadísticas por supervisor
    const porSupervisor = {};
    revisiones.forEach(rev => {
      const supId = rev.supervisorId?.toString();
      if (!porSupervisor[supId]) {
        porSupervisor[supId] = {
          supervisorId: supId,
          supervisorNombre: rev.supervisorNombre || 'Desconocido',
          total: 0,
          suma: 0
        };
      }
      porSupervisor[supId].total++;
      porSupervisor[supId].suma += (rev.porcentajeTotal || 0);
    });

    const estadisticasSupervisores = Object.values(porSupervisor).map(sup => ({
      ...sup,
      promedio: sup.total > 0 ? sup.suma / sup.total : 0
    })).sort((a, b) => b.promedio - a.promedio);

    // Respuesta
    res.json({
      resumen: {
        totalRevisiones,
        promedioGeneral: promedioGeneral.toFixed(1),
        periodos: {
          desde: query.fechaRevision?.$gte || null,
          hasta: query.fechaRevision?.$lte || null
        }
      },
      distribucionCategorias,
      estadisticasPorLocal: Object.entries(estadisticasPorLocal).map(([nombre, data]) => ({
        local: nombre,
        totalRevisiones: data.revisiones,
        promedio: data.promedio.toFixed(1)
      })),
      evolucion,
      topIncidencias,
      estadisticasSupervisores,
      localesPermitidos: await Local.find({ _id: { $in: localesPermitidos } }).select('nombre _id')
    });
  } catch (error) {
    console.error('Error en estadísticas:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener estadísticas detalladas de un local específico
router.get('/local/:localId', verifyToken, async (req, res) => {
  try {
    const { localId } = req.params;
    const { periodo = 'mensual' } = req.query;

    // Verificar acceso al local
    if (req.user.rol !== 'master') {
      const acceso = await UsuarioLocal.findOne({
        usuarioId: req.user.id,
        localId: localId,
        activo: true
      });
      if (!acceso) {
        return res.status(403).json({ error: 'No tienes acceso a este local' });
      }
    }

    // Obtener revisiones del local
    const revisiones = await Revision.find({ localId })
      .populate('supervisorId')
      .sort({ fechaRevision: -1 });

    const total = revisiones.length;
    const promedio = total > 0
      ? revisiones.reduce((sum, r) => sum + (r.porcentajeTotal || 0), 0) / total
      : 0;

    // Promedio por sección
    let sumSC = 0, sumCF = 0, sumCC = 0;
    revisiones.forEach(r => {
      sumSC += r.servicioCliente?.porcentaje || 0;
      sumCF += r.cuartoFrio?.porcentaje || 0;
      sumCC += r.cuartoCaliente?.porcentaje || 0;
    });

    const secciones = {
      servicioCliente: { promedio: total > 0 ? sumSC / total : 0, peso: 40 },
      cuartoFrio: { promedio: total > 0 ? sumCF / total : 0, peso: 30 },
      cuartoCaliente: { promedio: total > 0 ? sumCC / total : 0, peso: 30 }
    };

    res.json({
      local: await Local.findById(localId),
      resumen: { total, promedio: promedio.toFixed(1) },
      secciones,
      ultimasRevisiones: revisiones.slice(0, 10).map(r => ({
        id: r._id,
        fecha: r.fechaRevision,
        porcentaje: r.porcentajeTotal,
        categoria: r.categoria,
        supervisor: r.supervisorNombre
      })),
      evolucion: revisiones.slice(0, 12).map(r => ({
        fecha: r.fechaRevision,
        porcentaje: r.porcentajeTotal
      }))
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Asignar local a un usuario
router.post('/asignar-local', verifyToken, async (req, res) => {
  // Solo master puede asignar
  if (req.user.rol !== 'master') {
    return res.status(403).json({ error: 'Solo el Master puede asignar locales' });
  }

  try {
    const { usuarioId, localId, permisos = 'lectura' } = req.body;

    // Verificar que usuario y local existen
    const usuario = await Usuario.findById(usuarioId);
    const local = await Local.findById(localId);

    if (!usuario || !local) {
      return res.status(404).json({ error: 'Usuario o local no encontrado' });
    }

    // Crear o actualizar asignación
    const asignacion = await UsuarioLocal.findOneAndUpdate(
      { usuarioId, localId },
      { permisos, asignadoPor: req.user.id, activo: true },
      { upsert: true, new: true }
    );

    res.json({ message: 'Local asignado correctamente', asignacion });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener locales según el rol del usuario
router.get('/mis-locales', verifyToken, async (req, res) => {
  try {
    // Master y gerencia ven todos los locales activos
    if (req.user.rol === 'master' || req.user.rol === 'gerencia') {
      const locales = await Local.find({ activo: true }).sort({ nombre: 1 });
      return res.json(locales);
    }

    // Administrador solo ve sus locales asignados
    if (req.user.rol === 'administrador') {
      const ids = (req.user.localesAsignados || []).map(l => l._id || l);
      if (ids.length === 0) return res.json([]);
      const locales = await Local.find({ _id: { $in: ids }, activo: true }).sort({ nombre: 1 });
      return res.json(locales);
    }

    // Supervisor: usa localesAsignados o fallback a locales revisados
    if (req.user.rol === 'supervisor') {
      const ids = (req.user.localesAsignados || []).map(l => l._id || l);
      if (ids.length > 0) {
        const locales = await Local.find({ _id: { $in: ids }, activo: true }).sort({ nombre: 1 });
        return res.json(locales);
      }
      // Fallback: locales que ha revisado este supervisor
      const Revision = require('../models/Revision');
      const localIds = await Revision.distinct('localId', { supervisorId: req.user.id });
      const locales = await Local.find({ _id: { $in: localIds }, activo: true }).sort({ nombre: 1 });
      return res.json(locales);
    }

    return res.json([]);
  } catch (error) {
    console.error('Error en mis-locales:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;