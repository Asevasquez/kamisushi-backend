// backend/routes/dashboardSupervision.js
//
// Endpoints para la página "Dashboard Supervisión" (nueva, independiente de
// las rutas existentes en estadisticas.js). Calcula todo directamente desde
// el modelo Revision, sin depender del modelo Estadistica.
//
// Montar en server.js / app.js con, por ejemplo:
//   app.use('/api/dashboard-supervision', require('./routes/dashboardSupervision'));
// (usa el mismo prefijo /api que ya uses para el resto de tus rutas)

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Revision = require('../models/Revision');
const { verifyToken } = require('../middleware/auth');

// ────────────────────────────────────────────────────────────
// Bancos de preguntas — deben coincidir EXACTAMENTE con los ids
// usados en NuevaRevisionScreen.js (mobile).
// ────────────────────────────────────────────────────────────
const PREGUNTAS_SC = [
  { id: 'SC-01', texto: '¿El local cumple con la presentación y estado físico?' },
  { id: 'SC-02', texto: '¿Hay presencia del encargado en el local?' },
  { id: 'SC-03', texto: '¿Utilizan correctamente los discursos de persuasión de agua PCM?' },
  { id: 'SC-04', texto: '¿Cumple con el protocolo de atención al cliente?' },
  { id: 'SC-05', texto: 'Persuasión LUX — presencial' },
  { id: 'SC-06', texto: 'Persuasión LUX — llamadas' },
  { id: 'SC-07', texto: 'Persuasión LUX — WhatsApp' },
  { id: 'SC-08', texto: '¿Cuenta con publicidad física vigente y en buen estado?' },
  { id: 'SC-09', texto: '¿Se realiza el ofrecimiento de adicionales?' },
  { id: 'SC-10', texto: '¿Tiene respuestas rápidas en WhatsApp Business?' },
  { id: 'SC-11', texto: '¿Tiene promociones vigentes y actualizadas?' },
  { id: 'SC-12', texto: 'Sin listas de difusión masiva — WhatsApp' },
  { id: 'SC-13', texto: '¿Tiene contactos de clientes guardados correctamente?' },
  { id: 'SC-14', texto: '¿Existe conocimiento de carta por parte del equipo?' },
  { id: 'SC-15', texto: '¿Cuentan con equipos operativos?' },
  { id: 'SC-16', texto: 'Ruta de flyers realizada (menos de 2 días)' },
  { id: 'SC-17', texto: '¿Cumple con el protocolo de empaque?' },
];

const PREGUNTAS_CF = [
  { id: 'CF-01', texto: '¿Realizan el lavado de arroz correctamente?' },
  { id: 'CF-02', texto: '¿Realizan el aliño del arroz correctamente?' },
  { id: 'CF-03', texto: '¿Realizan la cocción del arroz correctamente?' },
  { id: 'CF-04', texto: '¿Se encuentra el mise en place en condiciones adecuadas?' },
  { id: 'CF-05', texto: '¿Cumple con los gramajes estándar y control de calidad?' },
  { id: 'CF-06', texto: '¿Se realiza la rotulación de salsas y preparaciones?' },
  { id: 'CF-07', texto: '¿Cuenta con plaquetas con gramaje adecuado?' },
  { id: 'CF-09', texto: '¿Realizan correctamente la dilución de antioxidante?' },
  { id: 'CF-10', texto: '¿Realizan el lavado y almacenamiento de verduras correctamente?' },
  { id: 'CF-11', texto: '¿Se mantiene control de temperatura en refrigeración?' },
  { id: 'CF-12', texto: '¿Se realiza la descongelación correcta de pollo y reineta?' },
  { id: 'CF-13', texto: '¿Se realiza correctamente el Ceviche?' },
  { id: 'CF-14', texto: '¿Se realiza correctamente el sellado de rollos (no fritos)?' },
];

const PREGUNTAS_CC = [
  { id: 'CC-01', texto: '¿Se realiza correctamente el batido del huevo?' },
  { id: 'CC-02', texto: '¿Se realiza correctamente el proceso de apanado?' },
  { id: 'CC-03', texto: '¿Se mantiene el control de temperatura de la freidora?' },
  { id: 'CC-04', texto: '¿Se realiza correctamente el sellado de puntas en rolls fritos?' },
  { id: 'CC-05', texto: '¿Se realiza correctamente el control de grumos?' },
  { id: 'CC-06', texto: '¿Se usan correctamente las tablas de cortar?' },
  { id: 'CC-07', texto: 'Estandarización de cortes del roll' },
  { id: 'CC-08', texto: '¿Se realiza afilado y mantenimiento de cuchillos?' },
  { id: 'CC-09', texto: '¿Se realiza correctamente el aliñado del pollo?' },
  { id: 'CC-10', texto: '¿Cumple con la elaboración correcta de recetas de salsas?' },
  { id: 'CC-11', texto: 'Calidad y estado del aceite de fritura' },
  { id: 'CC-12', texto: '¿Presentan dudas en elaboraciones básicas o complejas?' },
  { id: 'CC-13', texto: '¿La campana extractora está operativa y limpia?' },
  { id: 'CC-14', texto: '¿Se realiza limpieza diaria y profunda de las áreas?' },
  { id: 'CC-15', texto: '¿Se realiza la limpieza y sanitización del área de trabajo?' },
  { id: 'CC-16', texto: '¿Utilizan elementos de protección e higiene personal?' },
];

const BANCO_PREGUNTAS = {
  servicioCliente: PREGUNTAS_SC,
  cuartoFrio: PREGUNTAS_CF,
  cuartoCaliente: PREGUNTAS_CC,
};

// ────────────────────────────────────────────────────────────
// Clasificación de reclamos por severidad (definida por el negocio)
// ────────────────────────────────────────────────────────────
const RECLAMOS_BAJOS = [
  'AUMENTO PRECIO', 'FALLA PAGINA WEB KAMI', 'PROBLEMAS CON LOS COBROS',
  'PUBLICIDAD', 'TARDANZA EN RESPUESTA DE SOLICITUDES',
  'CONTAMINACION POR PUBLICIDAD', 'COBROS DEMAS EN FACTURA',
];
const RECLAMOS_MEDIOS = [
  'APLICACIONES UBER-RAPPI-PEDIDOS YA', 'CAMBIOS NO REALIZADOS EN EL PRODUCTO',
  'DEMORA ENVIO', 'ERROR EMPAQUE', 'ERROR EN AGENDAR', 'MAL SABOR-TEXTURA-OLOR',
  'MALA PRESENTACION DEL PRODUCTO', 'PEDIDO ENVIADO SIN UN INGREDIENTE',
  'PEDIDO NO RECIBIDO', 'PELO', 'POCA CANTIDAD DE GRAMAJES', 'SIN STOCK',
  'PEDIDO INCOMPLETO',
];
const RECLAMOS_ALTOS = [
  'CONTAMINACION CRUZADA', 'ELEMENTOS NO DESEADOS DE ALTO PELIGRO',
  'ELEMENTOS NO DESEADOS DE MENOR PELIGRO', 'FUNA RRSS', 'INTOXICACION',
  'MALA ACTITUD Y RESPUESTA EQUIPO',
];

function severidadReclamo(tipo) {
  if (RECLAMOS_ALTOS.includes(tipo)) return 'ALTO';
  if (RECLAMOS_MEDIOS.includes(tipo)) return 'MEDIO';
  if (RECLAMOS_BAJOS.includes(tipo)) return 'BAJO';
  return 'MEDIO'; // fallback de seguridad: los 26 tipos de TIPOS_RECLAMO ya están cubiertos arriba
}

// ────────────────────────────────────────────────────────────
// Alcance de locales según rol (mismo criterio que estadisticas.js)
// Retorna: null (sin restricción: master/gerencia) | array de ids | []
// ────────────────────────────────────────────────────────────
async function alcanceLocales(req) {
  if (req.user.rol === 'master' || req.user.rol === 'gerencia') return null;

  if (req.user.rol === 'administrador') {
    return (req.user.localesAsignados || []).map(l => (l._id || l).toString());
  }

  if (req.user.rol === 'supervisor') {
    const asignados = (req.user.localesAsignados || []).map(l => (l._id || l).toString());
    if (asignados.length > 0) return asignados;
    const propios = await Revision.distinct('localId', { supervisorId: req.user.id });
    return propios.map(id => id.toString());
  }

  return [];
}

function idsFlexibles(ids) {
  return ids.flatMap(id => {
    try { return [id, new mongoose.Types.ObjectId(id)]; } catch (e) { return [id]; }
  });
}

// ────────────────────────────────────────────────────────────
// Construye el filtro Mongo según rol + query params
// (mes: 'YYYY-MM', supervisorId, localId, categoria)
// ────────────────────────────────────────────────────────────
async function construirFiltro(req) {
  const { mes, supervisorId, localId, categoria } = req.query;
  const permitidos = await alcanceLocales(req);

  const query = { esBorrador: { $ne: true } };

  if (permitidos) {
    if (permitidos.length === 0) return { query: null };
    if (localId && !permitidos.includes(localId.toString())) {
      return { query: null, sinAcceso: true };
    }
    const base = localId ? [localId] : permitidos;
    query.localId = { $in: idsFlexibles(base) };
  } else if (localId) {
    try { query.localId = new mongoose.Types.ObjectId(localId); } catch (e) { query.localId = localId; }
  }

  if (supervisorId) {
    const orClauses = [{ supervisorId }];
    try { orClauses.push({ supervisorId: new mongoose.Types.ObjectId(supervisorId) }); } catch (e) {}
    query.$or = orClauses;
  }

  if (categoria) query.categoria = categoria;

  if (mes) {
    const [anio, mesNum] = mes.split('-').map(Number);
    if (anio && mesNum) {
      query.fechaRevision = {
        $gte: new Date(anio, mesNum - 1, 1),
        $lte: new Date(anio, mesNum, 0, 23, 59, 59, 999),
      };
    }
  }

  return { query };
}

// ────────────────────────────────────────────────────────────
// GET /meses — meses disponibles para el filtro (según alcance del rol)
// ────────────────────────────────────────────────────────────
router.get('/meses', verifyToken, async (req, res) => {
  try {
    const permitidos = await alcanceLocales(req);
    const query = { esBorrador: { $ne: true } };
    if (permitidos) {
      if (permitidos.length === 0) return res.json([]);
      query.localId = { $in: idsFlexibles(permitidos) };
    }
    const revisiones = await Revision.find(query).select('fechaRevision').lean();
    const set = new Set(revisiones.map(r => r.fechaRevision.toISOString().slice(0, 7)));
    res.json([...set].sort().reverse());
  } catch (error) {
    console.error('Error en /dashboard-supervision/meses:', error);
    res.status(500).json({ error: error.message });
  }
});

function resumenVacio() {
  return {
    totalRevisiones: 0, totalReclamos: 0, cumplimientoGeneral: 0, localesEvaluados: 0,
    reclamosPromedioPorVisita: 0, pesimoMalo: 0, pesimoMaloPct: 0,
    distribucionCategorias: {},
    cumplimientoPorArea: { servicioCliente: 0, cuartoFrio: 0, cuartoCaliente: 0 },
    presenciaPersonal: {
      administrador: { presentes: 0, total: 0 },
      subAdministrador: { presentes: 0, total: 0 },
    },
    supervisores: [], evolucion: [],
    preguntasMayorIncumplimiento: { servicioCliente: [], cuartoFrio: [], cuartoCaliente: [] },
    reclamosDelPeriodo: { graves: 0, medios: 0, bajos: 0, promedioPorVisita: 0 },
    ranking: [],
  };
}

// ────────────────────────────────────────────────────────────
// GET /resumen — tab "Resumen"
// ────────────────────────────────────────────────────────────
router.get('/resumen', verifyToken, async (req, res) => {
  try {
    const { query, sinAcceso } = await construirFiltro(req);
    if (sinAcceso) return res.status(403).json({ error: 'No tienes acceso a ese local' });
    if (!query) return res.json(resumenVacio());

    const revisiones = await Revision.find(query).populate('localId', 'nombre ciudad');
    const totalRevisiones = revisiones.length;
    if (totalRevisiones === 0) return res.json(resumenVacio());

    // Reclamos (aplanados)
    const reclamos = [];
    revisiones.forEach(r => {
      (r.servicioCliente?.reclamos || []).forEach(rec => reclamos.push(rec));
    });
    const totalReclamos = reclamos.length;

    // Cumplimiento general
    const cumplimientoGeneral = revisiones.reduce((s, r) => s + (r.porcentajeTotal || 0), 0) / totalRevisiones;

    // Locales evaluados
    const localesSet = new Set(
      revisiones.map(r => (r.localId?._id || r.localId)?.toString()).filter(Boolean)
    );

    // Distribución por categoría + Pésimo/Malo
    const distribucionCategorias = {};
    revisiones.forEach(r => {
      const cat = r.categoria || 'SIN CATEGORÍA';
      distribucionCategorias[cat] = (distribucionCategorias[cat] || 0) + 1;
    });
    const pesimoMalo = (distribucionCategorias['PÉSIMO'] || 0) + (distribucionCategorias['MALO'] || 0);

    // Helper: % de aciertos crudos (sin ponderar) para una sección
    const pctAciertos = (respuestas, banco) => {
      const cont = banco.filter(p => respuestas?.[p.id]?.cumple === true).length;
      return (cont / banco.length) * 100;
    };

    // Cumplimiento por área + acumuladores por supervisor
    let sumaSC = 0, cuentaSC = 0, sumaCF = 0, sumaCC = 0;
    let adminPresentes = 0, subAdminPresentes = 0;
    const porSupervisor = {};
    const porDia = {};
    const porLocal = {};

    revisiones.forEach(r => {
      const incluyeSC = r.borranReclamos !== 'Sí';
      const pctSC = incluyeSC ? pctAciertos(r.servicioCliente?.respuestas, PREGUNTAS_SC) : null;
      const pctCF = pctAciertos(r.cuartoFrio?.respuestas, PREGUNTAS_CF);
      const pctCC = pctAciertos(r.cuartoCaliente?.respuestas, PREGUNTAS_CC);

      if (incluyeSC) { sumaSC += pctSC; cuentaSC++; }
      sumaCF += pctCF;
      sumaCC += pctCC;

      if (r.administrador?.presente) adminPresentes++;
      if (r.subAdministrador?.presente) subAdminPresentes++;

      // Supervisores
      const supKey = (r.supervisorId || 'sin-id').toString();
      if (!porSupervisor[supKey]) {
        porSupervisor[supKey] = {
          supervisorId: supKey, nombre: r.supervisorNombre || 'Sin nombre',
          n: 0, sumaPorcentaje: 0, sumaSC: 0, cuentaSC: 0, sumaCF: 0, sumaCC: 0,
        };
      }
      const sup = porSupervisor[supKey];
      sup.n++;
      sup.sumaPorcentaje += (r.porcentajeTotal || 0);
      sup.sumaCF += pctCF;
      sup.sumaCC += pctCC;
      if (incluyeSC) { sup.sumaSC += pctSC; sup.cuentaSC++; }

      // Evolución por día
      const dia = r.fechaRevision.toISOString().slice(0, 10);
      if (!porDia[dia]) porDia[dia] = { suma: 0, n: 0 };
      porDia[dia].suma += (r.porcentajeTotal || 0);
      porDia[dia].n++;

      // Ranking por local
      const localIdStr = (r.localId?._id || r.localId)?.toString();
      if (localIdStr) {
        if (!porLocal[localIdStr]) {
          porLocal[localIdStr] = {
            localId: localIdStr, nombre: r.localId?.nombre || 'Sin nombre',
            visitas: 0, sumaPorcentaje: 0, categorias: {},
          };
        }
        const l = porLocal[localIdStr];
        l.visitas++;
        l.sumaPorcentaje += (r.porcentajeTotal || 0);
        const cat = r.categoria || 'SIN CATEGORÍA';
        l.categorias[cat] = (l.categorias[cat] || 0) + 1;
      }
    });

    const cumplimientoPorArea = {
      servicioCliente: cuentaSC > 0 ? sumaSC / cuentaSC : 0,
      cuartoFrio: sumaCF / totalRevisiones,
      cuartoCaliente: sumaCC / totalRevisiones,
    };

    const supervisores = Object.values(porSupervisor).map(s => ({
      supervisorId: s.supervisorId,
      nombre: s.nombre,
      n: s.n,
      promedio: s.n > 0 ? s.sumaPorcentaje / s.n : 0,
      sc: s.cuentaSC > 0 ? s.sumaSC / s.cuentaSC : 0,
      cf: s.n > 0 ? s.sumaCF / s.n : 0,
      cc: s.n > 0 ? s.sumaCC / s.n : 0,
    })).sort((a, b) => b.promedio - a.promedio);

    const evolucion = Object.entries(porDia)
      .map(([fecha, d]) => ({ fecha, promedio: d.suma / d.n }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Preguntas con mayor incumplimiento, por sección
    const preguntasMayorIncumplimiento = {};
    Object.entries(BANCO_PREGUNTAS).forEach(([seccion, preguntas]) => {
      preguntasMayorIncumplimiento[seccion] = preguntas.map(p => {
        let respondidas = 0, fallos = 0;
        revisiones.forEach(r => {
          if (seccion === 'servicioCliente' && r.borranReclamos === 'Sí') return;
          const resp = r[seccion]?.respuestas?.[p.id];
          if (resp?.cumple === true || resp?.cumple === false) {
            respondidas++;
            if (resp.cumple === false) fallos++;
          }
        });
        return {
          id: p.id,
          texto: p.texto,
          porcentajeFallo: respondidas > 0 ? (fallos / respondidas) * 100 : 0,
          respondidas,
        };
      }).sort((a, b) => b.porcentajeFallo - a.porcentajeFallo);
    });

    // Reclamos del período por severidad
    let graves = 0, medios = 0, bajos = 0;
    reclamos.forEach(rec => {
      const sev = severidadReclamo(rec.tipo);
      if (sev === 'ALTO') graves++;
      else if (sev === 'MEDIO') medios++;
      else bajos++;
    });

    // Ranking de locales (categoría = la más frecuente entre sus revisiones)
    const ranking = Object.values(porLocal).map(l => {
      const categoriaFrecuente = Object.entries(l.categorias).sort((a, b) => b[1] - a[1])[0]?.[0] || 'SIN CATEGORÍA';
      return {
        localId: l.localId,
        nombre: l.nombre,
        cumplimiento: l.visitas > 0 ? l.sumaPorcentaje / l.visitas : 0,
        visitas: l.visitas,
        categoria: categoriaFrecuente,
      };
    }).sort((a, b) => b.cumplimiento - a.cumplimiento);

    res.json({
      totalRevisiones,
      totalReclamos,
      cumplimientoGeneral,
      localesEvaluados: localesSet.size,
      reclamosPromedioPorVisita: totalReclamos / totalRevisiones,
      pesimoMalo,
      pesimoMaloPct: (pesimoMalo / totalRevisiones) * 100,
      distribucionCategorias,
      cumplimientoPorArea,
      presenciaPersonal: {
        administrador: { presentes: adminPresentes, total: totalRevisiones },
        subAdministrador: { presentes: subAdminPresentes, total: totalRevisiones },
      },
      supervisores,
      evolucion,
      preguntasMayorIncumplimiento,
      reclamosDelPeriodo: { graves, medios, bajos, promedioPorVisita: totalReclamos / totalRevisiones },
      ranking,
    });
  } catch (error) {
    console.error('Error en /dashboard-supervision/resumen:', error);
    res.status(500).json({ error: error.message });
  }
});

function reclamosVacio() {
  return {
    resumen: { total: 0, resueltos: 0, sinSolucion: 0, tiposDistintos: 0, compensaciones: 0, tasaResolucion: 0 },
    tiposFrecuencia: [], resolucionPorTipo: [], reclamosPorLocal: [], ultimosReclamos: [], reclamos: [],
  };
}

// ────────────────────────────────────────────────────────────
// GET /reclamos — tab "Reclamos"
// ────────────────────────────────────────────────────────────
router.get('/reclamos', verifyToken, async (req, res) => {
  try {
    const { query, sinAcceso } = await construirFiltro(req);
    if (sinAcceso) return res.status(403).json({ error: 'No tienes acceso a ese local' });
    if (!query) return res.json(reclamosVacio());

    const revisiones = await Revision.find(query).populate('localId', 'nombre');

    const reclamos = [];
    revisiones.forEach(r => {
      (r.servicioCliente?.reclamos || []).forEach((rec, idx) => {
        reclamos.push({
          id: rec.id || `${r._id}-${idx}`,
          tipo: rec.tipo || 'SIN TIPO',
          fecha: rec.fecha || r.fechaRevision,
          telefono: rec.telefono || '',
          entregoSolucion: rec.entregoSolucion || 'No',
          montoCompensacion: rec.montoCompensacion || '0',
          localId: (r.localId?._id || r.localId)?.toString(),
          localNombre: r.localId?.nombre || 'Sin local',
          supervisor: r.supervisorNombre || 'Sin supervisor',
          severidad: severidadReclamo(rec.tipo),
        });
      });
    });

    const totalReclamos = reclamos.length;
    if (totalReclamos === 0) return res.json(reclamosVacio());

    const resueltos = reclamos.filter(r => r.entregoSolucion === 'Sí').length;
    const sinSolucion = totalReclamos - resueltos;
    const tiposDistintos = new Set(reclamos.map(r => r.tipo)).size;
    const compensaciones = reclamos.reduce((s, r) => s + (parseFloat(r.montoCompensacion) || 0), 0);

    const porTipo = {};
    reclamos.forEach(r => {
      if (!porTipo[r.tipo]) porTipo[r.tipo] = { tipo: r.tipo, total: 0, resueltos: 0 };
      porTipo[r.tipo].total++;
      if (r.entregoSolucion === 'Sí') porTipo[r.tipo].resueltos++;
    });
    const tiposFrecuencia = Object.values(porTipo).sort((a, b) => b.total - a.total);
    const resolucionPorTipo = tiposFrecuencia.map(t => ({
      tipo: t.tipo, casos: t.total,
      resueltoPct: t.total > 0 ? (t.resueltos / t.total) * 100 : 0,
    }));

    const porLocal = {};
    reclamos.forEach(r => {
      if (!porLocal[r.localNombre]) porLocal[r.localNombre] = { local: r.localNombre, total: 0, sinSolucion: 0 };
      porLocal[r.localNombre].total++;
      if (r.entregoSolucion !== 'Sí') porLocal[r.localNombre].sinSolucion++;
    });
    const reclamosPorLocal = Object.values(porLocal)
      .map(l => ({ ...l, resolucionPct: l.total > 0 ? ((l.total - l.sinSolucion) / l.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    const ordenados = [...reclamos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.json({
      resumen: {
        total: totalReclamos, resueltos, sinSolucion, tiposDistintos, compensaciones,
        tasaResolucion: (resueltos / totalReclamos) * 100,
      },
      tiposFrecuencia,
      resolucionPorTipo,
      reclamosPorLocal,
      ultimosReclamos: ordenados.slice(0, 8),
      reclamos: ordenados,
    });
  } catch (error) {
    console.error('Error en /dashboard-supervision/reclamos:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
