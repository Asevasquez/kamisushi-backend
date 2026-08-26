const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Revision = require('../models/Revision');
const Local = require('../models/Local');
const { verifyToken } = require('../middleware/auth');

// ==================== PREGUNTAS PARA REFERENCIA ====================
const PREGUNTAS = {
  'SC-01': '¿El local cumple con la presentación y estado físico del local?',
  'SC-02': '¿Hay presencia del encargado en el local?',
  'SC-03': '¿No existen reclamos de clientes?',
  'SC-04': '¿Cumple con el protocolo de atención al cliente?',
  'SC-05': '¿Cumple con la persuasión de promociones LUX? — Presencial',
  'SC-06': '¿Cumple con la persuasión de promociones LUX? — Llamadas',
  'SC-07': '¿Cumple con la persuasión de promociones LUX? — WhatsApp',
  'SC-08': '¿Cuenta con publicidad física vigente y en buen estado?',
  'SC-09': '¿Se realiza el ofrecimiento de adicionales?',
  'SC-10': '¿Tiene las respuestas rápidas en WhatsApp Business?',
  'SC-11': '¿Tiene promociones vigentes y actualizadas?',
  'SC-12': 'Sin listas de difusión masiva — WhatsApp',
  'SC-13': '¿Tiene los contactos guardados correctamente?',
  'SC-14': '¿Existe conocimiento de carta por parte del equipo?',
  'SC-15': '¿Cuentan con los equipos operativos?',
  'SC-16': 'Ruta de flyers realizada',
  'SC-17': '¿Cumple con el protocolo de empaque?',
  'CF-01': '¿Realizan el lavado de arroz correctamente?',
  'CF-02': '¿Realizan el aliño del arroz correctamente?',
  'CF-03': '¿Realizan la cocción del arroz correctamente?',
  'CF-04': '¿Mise en place en condiciones adecuadas?',
  'CF-05': '¿Cumple con los gramajes estándar?',
  'CF-06': '¿Se realiza la rotulación de salsas?',
  'CF-07': '¿Plaquetas con gramaje adecuado?',
  'CF-09': '¿Realizan correctamente la dilución de antioxidante?',
  'CF-10': '¿Lavado y almacenamiento de verduras correcto?',
  'CF-11': '¿Control de temperatura en refrigeración?',
  'CF-12': '¿Descongelación correcta de pollo y reineta?',
  'CF-13': '¿Ceviche correcto?',
  'CF-14': '¿Sellado de rollos correcto?',
  'CC-01': '¿Batido del huevo correcto?',
  'CC-02': '¿Proceso de apanado correcto?',
  'CC-03': '¿Control de temperatura de freidora?',
  'CC-04': '¿Sellado de puntas en rolls fritos?',
  'CC-05': '¿Control de grumos en harina, huevo y panko?',
  'CC-06': '¿Uso correcto de tablas de cortar?',
  'CC-07': 'Estandarización de cortes del roll',
  'CC-08': '¿Afilado y mantenimiento de cuchillos?',
  'CC-09': '¿Aliñado del pollo correcto?',
  'CC-10': '¿Elaboración correcta de recetas de salsas?',
  'CC-11': 'Calidad y estado del aceite de fritura',
  'CC-12': '¿Presentan dudas en elaboraciones?',
  'CC-13': '¿Campana extractora operativa y limpia?',
  'CC-14': '¿Limpieza diaria y profunda de áreas?',
  'CC-15': '¿Limpieza y sanitización del área de trabajo?',
  'CC-16': '¿Utilizan elementos de protección e higiene?',
};

// ==================== KPIs COMPLETOS ====================
router.get('/kpi/completo', verifyToken, async (req, res) => {
  try {
    let localesPermitidos = [];

    if (req.user.rol === 'master') {
      const todosLocales = await Local.find({ activo: true });
      localesPermitidos = todosLocales.map(l => l._id.toString());
    } else if (req.user.rol === 'administrador') {
      if (req.user.localesAsignados && req.user.localesAsignados.length > 0) {
        localesPermitidos = req.user.localesAsignados.map(l => l._id?.toString() || l.toString());
      }
    } else if (req.user.rol === 'gerencia') {
      const todosLocales = await Local.find({ activo: true });
      localesPermitidos = todosLocales.map(l => l._id.toString());
    } else if (req.user.rol === 'supervisor') {
      const revisiones = await Revision.find({ supervisorId: req.user.id });
      const localesIds = [...new Set(revisiones.map(r => r.localId?.toString()))];
      localesPermitidos = localesIds;
    }

    const { periodo = 'mensual', localId } = req.query;

    const hoy = new Date();
    let fechaInicio, fechaFin;

    switch (periodo) {
      case 'semanal':
        fechaInicio = new Date(hoy);
        fechaInicio.setDate(hoy.getDate() - 7);
        break;
      case 'mensual':
        fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
        break;
      case 'trimestral':
        fechaInicio = new Date(hoy);
        fechaInicio.setMonth(hoy.getMonth() - 3);
        break;
      case 'anual':
        fechaInicio = new Date(hoy.getFullYear(), 0, 1);
        fechaFin = new Date(hoy.getFullYear(), 11, 31, 23, 59, 59);
        break;
      default:
        fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
    }

    let query = { fechaRevision: {} };
    if (fechaInicio) query.fechaRevision.$gte = fechaInicio;
    if (fechaFin) query.fechaRevision.$lte = fechaFin;

    if (localId && localesPermitidos.includes(localId)) {
      query.localId = new mongoose.Types.ObjectId(localId);
    } else if (localesPermitidos.length > 0) {
      query.localId = { $in: localesPermitidos.map(id => new mongoose.Types.ObjectId(id)) };
    } else {
      return res.json({ kpis: [], resumenGlobal: null, detallePorLocal: [] });
    }

    const revisiones = await Revision.find(query).populate('localId');

    if (revisiones.length === 0) {
      return res.json({ kpis: [], resumenGlobal: null, detallePorLocal: [], mensaje: 'No hay revisiones en el período seleccionado' });
    }

    let adminPresente = 0;
    let subAdminPresente = 0;
    let totalReclamos = 0;
    let sumaPorcentajes = 0;

    const distribucionCategorias = {
      EXCELENTE: 0, 'MUY BUENO': 0, BUENO: 0, REGULAR: 0, MALO: 0, PÉSIMO: 0
    };

    const detalleLocalMap = new Map();

    revisiones.forEach(rev => {
      if (rev.administrador?.presente) adminPresente++;
      if (rev.subAdministrador?.presente) subAdminPresente++;

      const numReclamos = rev.servicioCliente?.reclamos?.length || 0;
      totalReclamos += numReclamos;
      sumaPorcentajes += rev.porcentajeTotal || 0;

      if (distribucionCategorias[rev.categoria] !== undefined) {
        distribucionCategorias[rev.categoria]++;
      }

      const localNombre = rev.localId?.nombre || 'Local sin nombre';
      const localIdStr = rev.localId?._id?.toString() || 'unknown';

      if (!detalleLocalMap.has(localIdStr)) {
        detalleLocalMap.set(localIdStr, {
          localId: localIdStr,
          localNombre: localNombre,
          totalRevisiones: 0,
          sumaPorcentajes: 0,
          adminPresente: 0,
          subAdminPresente: 0,
          totalReclamos: 0,
          ultimaRevision: null
        });
      }

      const localData = detalleLocalMap.get(localIdStr);
      localData.totalRevisiones++;
      localData.sumaPorcentajes += rev.porcentajeTotal || 0;
      if (rev.administrador?.presente) localData.adminPresente++;
      if (rev.subAdministrador?.presente) localData.subAdminPresente++;
      localData.totalReclamos += numReclamos;

      if (!localData.ultimaRevision || new Date(rev.fechaRevision) > new Date(localData.ultimaRevision.fecha)) {
        localData.ultimaRevision = { fecha: rev.fechaRevision, porcentaje: rev.porcentajeTotal };
      }
    });

    const totalRevisiones = revisiones.length;

    const detallePorLocal = Array.from(detalleLocalMap.values()).map(local => ({
      ...local,
      promedioPorcentaje: local.totalRevisiones > 0 ? local.sumaPorcentajes / local.totalRevisiones : 0,
      tasaAsistenciaAdmin: local.totalRevisiones > 0 ? (local.adminPresente / local.totalRevisiones) * 100 : 0,
      tasaAsistenciaSubAdmin: local.totalRevisiones > 0 ? (local.subAdminPresente / local.totalRevisiones) * 100 : 0,
      promedioReclamosPorVisita: local.totalRevisiones > 0 ? local.totalReclamos / local.totalRevisiones : 0,
    }));

    detallePorLocal.sort((a, b) => b.promedioPorcentaje - a.promedioPorcentaje);

    const mejorLocal = detallePorLocal[0] || null;
    const peorLocal = detallePorLocal[detallePorLocal.length - 1] || null;

    let categoriaMasComun = 'Sin datos';
    let maxCount = 0;
    Object.entries(distribucionCategorias).forEach(([cat, count]) => {
      if (count > maxCount) { maxCount = count; categoriaMasComun = cat; }
    });

    const resumenGlobal = {
      totalRevisiones,
      promedioGeneral: totalRevisiones > 0 ? sumaPorcentajes / totalRevisiones : 0,
      tasaAsistenciaAdmin: totalRevisiones > 0 ? (adminPresente / totalRevisiones) * 100 : 0,
      tasaAsistenciaSubAdmin: totalRevisiones > 0 ? (subAdminPresente / totalRevisiones) * 100 : 0,
      totalReclamos,
      promedioReclamosPorVisita: totalRevisiones > 0 ? totalReclamos / totalRevisiones : 0,
      categoriaMasComun,
      mejorLocal: mejorLocal ? { nombre: mejorLocal.localNombre, promedio: mejorLocal.promedioPorcentaje } : null,
      peorLocal: peorLocal ? { nombre: peorLocal.localNombre, promedio: peorLocal.promedioPorcentaje } : null,
      distribucionCategorias
    };

    const kpis = [
      { titulo: 'Promedio General', valor: `${resumenGlobal.promedioGeneral.toFixed(1)}%`, icono: '📊', color: '#4caf50', descripcion: 'Promedio de cumplimiento' },
      { titulo: 'Asistencia Admin', valor: `${resumenGlobal.tasaAsistenciaAdmin.toFixed(1)}%`, icono: '👔', color: '#2196f3', descripcion: 'Administrador presente' },
      { titulo: 'Asistencia SubAdmin', valor: `${resumenGlobal.tasaAsistenciaSubAdmin.toFixed(1)}%`, icono: '👥', color: '#ff9800', descripcion: 'Sub-administrador presente' },
      { titulo: 'Reclamos x Visita', valor: resumenGlobal.promedioReclamosPorVisita.toFixed(1), icono: '📝', color: '#f44336', descripcion: 'Promedio de reclamos' },
      { titulo: 'Total Revisiones', valor: resumenGlobal.totalRevisiones.toString(), icono: '📋', color: '#3b82f6', descripcion: 'Revisiones realizadas' },
      { titulo: 'Categoría Común', valor: categoriaMasComun, icono: '🏆', color: '#9c27b0', descripcion: 'Clasificación más frecuente' }
    ];

    res.json({ kpis, resumenGlobal, detallePorLocal, periodo });

  } catch (error) {
    console.error('Error en KPI completo:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ITEMS FALLADOS CON DETALLE ====================
router.get('/kpi/items-fallados', verifyToken, async (req, res) => {
  try {
    const { periodo = 'mensual', localId } = req.query;

    const hoy = new Date();
    let fechaInicio, fechaFin;

    switch (periodo) {
      case 'semanal':
        fechaInicio = new Date(hoy);
        fechaInicio.setDate(hoy.getDate() - 7);
        break;
      case 'mensual':
        fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
        break;
      default:
        fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
    }

    let query = { fechaRevision: {} };
    if (fechaInicio) query.fechaRevision.$gte = fechaInicio;
    if (fechaFin) query.fechaRevision.$lte = fechaFin;

    if (localId) {
      query.localId = new mongoose.Types.ObjectId(localId);
    }

    const revisiones = await Revision.find(query).populate('localId');

    const itemsFallados = {};
    const observacionesRecientes = [];

    revisiones.forEach(rev => {
      const secciones = ['servicioCliente', 'cuartoFrio', 'cuartoCaliente'];
      secciones.forEach(seccion => {
        const respuestas = rev[seccion]?.respuestas || {};
        Object.entries(respuestas).forEach(([preguntaId, respuesta]) => {
          if (respuesta.cumple === false) {
            if (!itemsFallados[preguntaId]) {
              itemsFallados[preguntaId] = { count: 0, texto: PREGUNTAS[preguntaId] || preguntaId };
            }
            itemsFallados[preguntaId].count++;
            if (respuesta.observacion) {
              observacionesRecientes.push({
                preguntaId,
                texto: PREGUNTAS[preguntaId] || preguntaId,
                seccion,
                observacion: respuesta.observacion,
                fecha: rev.fechaRevision,
                localNombre: rev.localId?.nombre || 'Desconocido'
              });
            }
          }
        });
      });
    });

    const topItemsFallados = Object.entries(itemsFallados)
      .map(([id, data]) => ({
        id,
        texto: data.texto,
        count: data.count,
        seccion: id.startsWith('SC') ? 'Servicio Cliente' : id.startsWith('CF') ? 'Cuarto Frío' : 'Cuarto Caliente'
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({
      topItemsFallados,
      totalItemsFalladosUnicos: Object.keys(itemsFallados).length,
      totalFallos: Object.values(itemsFallados).reduce((a, b) => a + b.count, 0),
      observacionesRecientes: observacionesRecientes.slice(-20).reverse()
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== COMPARATIVA POR LOCAL ====================
router.get('/kpi/comparativa', verifyToken, async (req, res) => {
  try {
    const { tipo = 'mensual', localId } = req.query;
    const hoy = new Date();

    console.log(`📊 Comparativa - localId: ${localId}, tipo: ${tipo}`);

    let actualInicio, actualFin, anteriorInicio, anteriorFin;

    if (tipo === 'mensual') {
      actualInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      actualFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
      anteriorInicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      anteriorFin = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59);
    } else if (tipo === 'trimestral') {
      const trimestreActual = Math.floor(hoy.getMonth() / 3);
      actualInicio = new Date(hoy.getFullYear(), trimestreActual * 3, 1);
      actualFin = new Date(hoy.getFullYear(), (trimestreActual + 1) * 3, 0, 23, 59, 59);
      anteriorInicio = new Date(hoy.getFullYear(), (trimestreActual - 1) * 3, 1);
      anteriorFin = new Date(hoy.getFullYear(), trimestreActual * 3, 0, 23, 59, 59);
    } else {
      actualInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      actualFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
      anteriorInicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      anteriorFin = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59);
    }

    const calcularMetricas = (revisiones) => {
      if (revisiones.length === 0) return null;
      const total = revisiones.length;
      const sumaPorcentajes = revisiones.reduce((sum, r) => sum + (r.porcentajeTotal || 0), 0);
      let adminPresente = 0, subAdminPresente = 0, totalReclamos = 0;
      revisiones.forEach(r => {
        if (r.administrador?.presente) adminPresente++;
        if (r.subAdministrador?.presente) subAdminPresente++;
        totalReclamos += r.servicioCliente?.reclamos?.length || 0;
      });
      return {
        totalRevisiones: total,
        promedioGeneral: sumaPorcentajes / total,
        tasaAsistenciaAdmin: (adminPresente / total) * 100,
        tasaAsistenciaSubAdmin: (subAdminPresente / total) * 100,
        promedioReclamosPorVisita: totalReclamos / total,
      };
    };

    let baseQuery = {};
    if (localId && localId !== 'undefined' && localId !== 'null' && localId !== '') {
      try {
        baseQuery.localId = new mongoose.Types.ObjectId(localId);
        console.log(`📊 Filtrando por local específico: ${localId}`);
      } catch (e) {
        console.log(`📊 LocalId inválido: ${localId}`);
      }
    } else {
      console.log(`📊 Sin filtro de local - todos los locales`);
    }

    const revisionesActual = await Revision.find({
      ...baseQuery,
      fechaRevision: { $gte: actualInicio, $lte: actualFin }
    });

    const revisionesAnterior = await Revision.find({
      ...baseQuery,
      fechaRevision: { $gte: anteriorInicio, $lte: anteriorFin }
    });

    console.log(`📊 Revisiones actual: ${revisionesActual.length}, anterior: ${revisionesAnterior.length}`);

    const actual = calcularMetricas(revisionesActual);
    const anterior = calcularMetricas(revisionesAnterior);

    const variaciones = actual && anterior ? {
      promedioGeneral: ((actual.promedioGeneral - anterior.promedioGeneral) / anterior.promedioGeneral) * 100,
      totalRevisiones: ((actual.totalRevisiones - anterior.totalRevisiones) / anterior.totalRevisiones) * 100,
      tasaAsistenciaAdmin: actual.tasaAsistenciaAdmin - anterior.tasaAsistenciaAdmin,
      promedioReclamosPorVisita: ((actual.promedioReclamosPorVisita - anterior.promedioReclamosPorVisita) / anterior.promedioReclamosPorVisita) * 100,
    } : null;

    res.json({
      periodoActual: {
        nombre: tipo === 'mensual' ? 'Mes Actual' : 'Trimestre Actual',
        inicio: actualInicio,
        fin: actualFin,
        datos: actual
      },
      periodoAnterior: {
        nombre: tipo === 'mensual' ? 'Mes Anterior' : 'Trimestre Anterior',
        inicio: anteriorInicio,
        fin: anteriorFin,
        datos: anterior
      },
      variaciones,
      tendencia: variaciones ? (variaciones.promedioGeneral > 0 ? 'positiva' : 'negativa') : 'neutral',
      localFiltrado: localId || 'todos'
    });
  } catch (error) {
    console.error('Error en comparativa:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== METAS POR LOCAL ====================
let metasCache = [];

// Inicializar metas por defecto
const initMetas = async () => {
  const locales = await Local.find({ activo: true });
  metasCache = [
    {
      _id: '1',
      nombre: 'Meta General de Cumplimiento',
      tipo: 'promedioGeneral',
      valorObjetivo: 85,
      periodo: 'mensual',
      localId: null,
      localNombre: 'Todos los locales',
      activa: true,
      creadoEn: new Date()
    },
    ...locales.map(local => ({
      _id: `local_${local._id}`,
      nombre: `Meta ${local.nombre}`,
      tipo: 'promedioGeneral',
      valorObjetivo: 80,
      periodo: 'mensual',
      localId: local._id.toString(),
      localNombre: local.nombre,
      activa: true,
      creadoEn: new Date()
    }))
  ];
};
initMetas();

router.get('/metas', verifyToken, async (req, res) => {
  try {
    const { localId } = req.query;
    let metasFiltradas = metasCache;

    if (localId) {
      metasFiltradas = metasCache.filter(m => m.localId === localId || m.localId === null);
    }

    const hoy = new Date();
    const inicioPeriodo = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const finPeriodo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);

    let baseQuery = { fechaRevision: { $gte: inicioPeriodo, $lte: finPeriodo } };

    const localesData = await Local.find();
    const revisiones = await Revision.find(baseQuery).populate('localId');

    const metricasPorLocal = {};
    localesData.forEach(local => {
      const revsLocal = revisiones.filter(r => r.localId?._id?.toString() === local._id.toString());
      if (revsLocal.length > 0) {
        metricasPorLocal[local._id.toString()] = {
          promedioGeneral: revsLocal.reduce((sum, r) => sum + (r.porcentajeTotal || 0), 0) / revsLocal.length,
          asistenciaAdmin: (revsLocal.filter(r => r.administrador?.presente).length / revsLocal.length) * 100,
          reclamosPorVisita: revsLocal.reduce((sum, r) => sum + (r.servicioCliente?.reclamos?.length || 0), 0) / revsLocal.length,
          totalRevisiones: revsLocal.length
        };
      } else {
        metricasPorLocal[local._id.toString()] = { promedioGeneral: 0, asistenciaAdmin: 0, reclamosPorVisita: 0, totalRevisiones: 0 };
      }
    });

    const metricasGenerales = {
      promedioGeneral: revisiones.length > 0 ? revisiones.reduce((sum, r) => sum + (r.porcentajeTotal || 0), 0) / revisiones.length : 0,
      asistenciaAdmin: revisiones.length > 0 ? (revisiones.filter(r => r.administrador?.presente).length / revisiones.length) * 100 : 0,
      reclamosPorVisita: revisiones.length > 0 ? revisiones.reduce((sum, r) => sum + (r.servicioCliente?.reclamos?.length || 0), 0) / revisiones.length : 0,
      totalRevisiones: revisiones.length
    };

    const metasConProgreso = metasFiltradas.map(meta => {
      let valorActual = 0;

      if (meta.localId) {
        const metricas = metricasPorLocal[meta.localId] || metricasGenerales;
        if (meta.tipo === 'promedioGeneral') valorActual = metricas.promedioGeneral;
        else if (meta.tipo === 'asistenciaAdmin') valorActual = metricas.asistenciaAdmin;
        else if (meta.tipo === 'reclamosPorVisita') valorActual = metricas.reclamosPorVisita;
        else if (meta.tipo === 'revisionesPorMes') valorActual = metricas.totalRevisiones;
      } else {
        if (meta.tipo === 'promedioGeneral') valorActual = metricasGenerales.promedioGeneral;
        else if (meta.tipo === 'asistenciaAdmin') valorActual = metricasGenerales.asistenciaAdmin;
        else if (meta.tipo === 'reclamosPorVisita') valorActual = metricasGenerales.reclamosPorVisita;
        else if (meta.tipo === 'revisionesPorMes') valorActual = metricasGenerales.totalRevisiones;
      }

      const porcentajeCumplimiento = meta.valorObjetivo > 0 ? (valorActual / meta.valorObjetivo) * 100 : 0;

      return {
        ...meta,
        valorActual,
        porcentajeCumplimiento: Math.min(porcentajeCumplimiento, 100),
        cumplida: valorActual >= meta.valorObjetivo
      };
    });

    res.json(metasConProgreso);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/metas', verifyToken, async (req, res) => {
  if (req.user.rol !== 'master' && req.user.rol !== 'gerencia') {
    return res.status(403).json({ error: 'No tienes permisos para crear metas' });
  }
  try {
    const { nombre, tipo, valorObjetivo, periodo, localId, localNombre } = req.body;

    const nuevaMeta = {
      _id: Date.now().toString(),
      nombre,
      tipo,
      valorObjetivo: parseFloat(valorObjetivo),
      periodo,
      localId: localId || null,
      localNombre: localNombre || (localId ? (await Local.findById(localId))?.nombre : 'Todos los locales'),
      activa: true,
      creadoEn: new Date()
    };

    metasCache.push(nuevaMeta);
    res.json(nuevaMeta);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/metas/:id', verifyToken, async (req, res) => {
  if (req.user.rol !== 'master' && req.user.rol !== 'gerencia') {
    return res.status(403).json({ error: 'No tienes permisos para editar metas' });
  }
  try {
    const index = metasCache.findIndex(m => m._id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Meta no encontrada' });
    }
    metasCache[index] = { ...metasCache[index], ...req.body };
    res.json(metasCache[index]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/metas/:id', verifyToken, async (req, res) => {
  if (req.user.rol !== 'master' && req.user.rol !== 'gerencia') {
    return res.status(403).json({ error: 'No tienes permisos para eliminar metas' });
  }
  try {
    metasCache = metasCache.filter(m => m._id !== req.params.id);
    res.json({ message: 'Meta eliminada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RECLAMOS ====================
router.get('/reclamos/detalle', verifyToken, async (req, res) => {
  try {
    const { localId, estado, fechaInicio, fechaFin } = req.query;

    let query = {};
    if (localId) query.localId = new mongoose.Types.ObjectId(localId);
    if (fechaInicio && fechaFin) {
      query.fechaRevision = { $gte: new Date(fechaInicio), $lte: new Date(fechaFin) };
    } else {
      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
      query.fechaRevision = { $gte: inicioMes, $lte: finMes };
    }

    const revisiones = await Revision.find(query).populate('localId');

    const reclamosDetalle = [];

    revisiones.forEach(rev => {
      const reclamos = rev.servicioCliente?.reclamos || [];
      reclamos.forEach((reclamo, idx) => {
        reclamosDetalle.push({
          id: `${rev._id}_${idx}`,
          revisionId: rev._id,
          localId: rev.localId?._id,
          localNombre: rev.localId?.nombre || 'Desconocido',
          fecha: rev.fechaRevision,
          tipo: reclamo.tipo,
          telefono: reclamo.telefono || 'No registrado',
          entregoSolucion: reclamo.entregoSolucion || 'No',
          montoCompensacion: reclamo.montoCompensacion || '0',
          foto: reclamo.foto || null,
          estado: reclamo.entregoSolucion === 'Sí' ? 'Resuelto' : 'Pendiente',
          supervisor: rev.supervisorNombre
        });
      });
    });

    const resumenReclamos = {
      total: reclamosDetalle.length,
      resueltos: reclamosDetalle.filter(r => r.estado === 'Resuelto').length,
      pendientes: reclamosDetalle.filter(r => r.estado === 'Pendiente').length,
      porLocal: {},
      porTipo: {}
    };

    reclamosDetalle.forEach(r => {
      if (!resumenReclamos.porLocal[r.localNombre]) {
        resumenReclamos.porLocal[r.localNombre] = { total: 0, resueltos: 0, pendientes: 0 };
      }
      resumenReclamos.porLocal[r.localNombre].total++;
      if (r.estado === 'Resuelto') resumenReclamos.porLocal[r.localNombre].resueltos++;
      else resumenReclamos.porLocal[r.localNombre].pendientes++;

      if (!resumenReclamos.porTipo[r.tipo]) {
        resumenReclamos.porTipo[r.tipo] = 0;
      }
      resumenReclamos.porTipo[r.tipo]++;
    });

    res.json({
      reclamos: reclamosDetalle,
      resumen: resumenReclamos,
      total: reclamosDetalle.length
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/reclamos/:reclamoId', verifyToken, async (req, res) => {
  try {
    const { reclamoId } = req.params;
    const { estado, solucion, montoCompensacion } = req.body;

    const [revisionId, reclamoIndex] = reclamoId.split('_');
    const revision = await Revision.findById(revisionId);

    if (!revision) {
      return res.status(404).json({ error: 'Revisión no encontrada' });
    }

    const reclamo = revision.servicioCliente?.reclamos?.[parseInt(reclamoIndex)];
    if (!reclamo) {
      return res.status(404).json({ error: 'Reclamo no encontrado' });
    }

    reclamo.entregoSolucion = estado === 'Resuelto' ? 'Sí' : 'No';
    if (solucion) reclamo.solucion = solucion;
    if (montoCompensacion) reclamo.montoCompensacion = montoCompensacion;

    await revision.save();

    res.json({ message: 'Reclamo actualizado', reclamo });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== MIS LOCALES ====================
router.get('/mis-locales', verifyToken, async (req, res) => {
  try {
    let locales = [];

    if (req.user.rol === 'master') {
      locales = await Local.find({ activo: true });
    } else if (req.user.rol === 'administrador') {
      if (req.user.localesAsignados && req.user.localesAsignados.length > 0) {
        locales = await Local.find({ _id: { $in: req.user.localesAsignados } });
      }
    } else if (req.user.rol === 'gerencia') {
      locales = await Local.find({ activo: true });
    } else if (req.user.rol === 'supervisor') {
      const revisiones = await Revision.find({ supervisorId: req.user.id });
      const localesIds = [...new Set(revisiones.map(r => r.localId))];
      if (localesIds.length > 0) {
        locales = await Local.find({ _id: { $in: localesIds } });
      }
    }

    res.json(locales);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== KPIs POR LOCAL (DETALLE) ====================
router.get('/kpi/local/:localId', verifyToken, async (req, res) => {
  try {
    const { localId } = req.params;
    const { periodo = 'mensual' } = req.query;

    const hoy = new Date();
    let fechaInicio, fechaFin;

    switch (periodo) {
      case 'semanal':
        fechaInicio = new Date(hoy);
        fechaInicio.setDate(hoy.getDate() - 7);
        break;
      case 'mensual':
        fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
        break;
      case 'trimestral':
        fechaInicio = new Date(hoy);
        fechaInicio.setMonth(hoy.getMonth() - 3);
        break;
      case 'anual':
        fechaInicio = new Date(hoy.getFullYear(), 0, 1);
        fechaFin = new Date(hoy.getFullYear(), 11, 31, 23, 59, 59);
        break;
      default:
        fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
    }

    let query = {
      localId: new mongoose.Types.ObjectId(localId),
      fechaRevision: {}
    };

    if (fechaInicio) query.fechaRevision.$gte = fechaInicio;
    if (fechaFin) query.fechaRevision.$lte = fechaFin;

    const revisiones = await Revision.find(query).populate('localId');

    if (revisiones.length === 0) {
      return res.json({ estadisticas: null, mensaje: 'No hay revisiones en el período' });
    }

    let adminPresente = 0, subAdminPresente = 0, totalReclamos = 0, sumaPorcentajes = 0;
    const distribucionCategorias = {
      EXCELENTE: 0, 'MUY BUENO': 0, BUENO: 0, REGULAR: 0, MALO: 0, PÉSIMO: 0
    };
    const reclamosPorTipo = {};

    revisiones.forEach(rev => {
      if (rev.administrador?.presente) adminPresente++;
      if (rev.subAdministrador?.presente) subAdminPresente++;
      totalReclamos += rev.servicioCliente?.reclamos?.length || 0;
      sumaPorcentajes += rev.porcentajeTotal || 0;

      if (distribucionCategorias[rev.categoria] !== undefined) {
        distribucionCategorias[rev.categoria]++;
      }

      (rev.servicioCliente?.reclamos || []).forEach(reclamo => {
        reclamosPorTipo[reclamo.tipo] = (reclamosPorTipo[reclamo.tipo] || 0) + 1;
      });
    });

    const total = revisiones.length;
    const itemsCumplidos = revisiones.reduce((sum, rev) => {
      let count = 0;
      ['servicioCliente', 'cuartoFrio', 'cuartoCaliente'].forEach(seccion => {
        Object.values(rev[seccion]?.respuestas || {}).forEach(r => {
          if (r.cumple === true) count++;
        });
      });
      return sum + count;
    }, 0);

    const totalItems = revisiones.reduce((sum, rev) => {
      let count = 0;
      ['servicioCliente', 'cuartoFrio', 'cuartoCaliente'].forEach(seccion => {
        count += Object.keys(rev[seccion]?.respuestas || {}).length;
      });
      return sum + count;
    }, 0);

    res.json({
      estadisticas: {
        totalRevisiones: total,
        promedioPorcentaje: total > 0 ? sumaPorcentajes / total : 0,
        tasaAsistenciaAdmin: total > 0 ? (adminPresente / total) * 100 : 0,
        tasaAsistenciaSubAdmin: total > 0 ? (subAdminPresente / total) * 100 : 0,
        tasaCumplimientoItems: totalItems > 0 ? (itemsCumplidos / totalItems) * 100 : 0,
        totalReclamos,
        promedioReclamosPorVisita: total > 0 ? totalReclamos / total : 0,
        distribucionCategorias,
        reclamosPorTipo: Object.entries(reclamosPorTipo).map(([tipo, count]) => ({ tipo, count }))
      }
    });
  } catch (error) {
    console.error('Error en KPI local:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== DASHBOARD (legacy) ====================
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    let localesPermitidos = [];

    if (req.user.rol === 'master') {
      const todosLocales = await Local.find({ activo: true });
      localesPermitidos = todosLocales.map(l => l._id.toString());
    } else if (req.user.rol === 'administrador') {
      if (req.user.localesAsignados && req.user.localesAsignados.length > 0) {
        localesPermitidos = req.user.localesAsignados.map(l => l._id?.toString() || l.toString());
      }
    } else if (req.user.rol === 'gerencia') {
      const todosLocales = await Local.find({ activo: true });
      localesPermitidos = todosLocales.map(l => l._id.toString());
    } else if (req.user.rol === 'supervisor') {
      const revisiones = await Revision.find({ supervisorId: req.user.id });
      const localesIds = [...new Set(revisiones.map(r => r.localId?.toString()))];
      localesPermitidos = localesIds;
    }

    const { fechaInicio, fechaFin, localId } = req.query;

    let query = {};
    if (localId && localesPermitidos.includes(localId)) {
      query.localId = new mongoose.Types.ObjectId(localId);
    } else if (localesPermitidos.length > 0) {
      query.localId = { $in: localesPermitidos.map(id => new mongoose.Types.ObjectId(id)) };
    } else {
      return res.json({
        resumen: { totalRevisiones: 0, promedioGeneral: 0 },
        distribucionCategorias: { EXCELENTE: 0, 'MUY BUENO': 0, BUENO: 0, REGULAR: 0, MALO: 0, PÉSIMO: 0 },
        estadisticasPorLocal: [],
        evolucion: [],
        topIncidencias: [],
        estadisticasSupervisores: [],
        localesPermitidos: []
      });
    }

    if (fechaInicio && fechaFin) {
      query.fechaRevision = {
        $gte: new Date(fechaInicio),
        $lte: new Date(fechaFin)
      };
    } else {
      const hoy = new Date();
      const hace12Meses = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1);
      query.fechaRevision = { $gte: hace12Meses };
    }

    const revisiones = await Revision.find(query).populate('localId');
    res.json({ revisiones: revisiones.length });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;