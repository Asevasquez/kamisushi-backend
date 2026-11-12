// backend/routes/auditoriasProducto.js
//
// Auditoría de Producto (checklist de 75 preguntas en 10 secciones).
//   - La hacen, desde la app, el perfil "producto", gerencia y master.
//   - El servidor valida las 75 respuestas y calcula puntaje, %, categoría y plan de acción:
//     la app solo manda lo que se respondió.
//   - Al final se pueden acordar hasta 3 compromisos del local (sección 'producto'): viven en la
//     colección Compromiso (origen 'producto') y siguen el mismo flujo de evidencia y validación.
//   - El envío es idempotente por "clientId" (doble toque, reintentos).
// Registrar en server.js:  app.use('/api/auditorias-producto', require('./routes/auditoriasProducto'));
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const AuditoriaProducto = require('../models/AuditoriaProducto');
const Compromiso = require('../models/Compromiso');
const Local = require('../models/Local');
const { verifyToken } = require('../middleware/auth');
const C = require('../utils/productoChecklist');
const S = require('../utils/productoStats');
const H = require('../utils/compromisosHelper');

const ROLES_PERMITIDOS = ['producto', 'gerencia', 'master'];
const ROLES_VEN_TODO = ['gerencia', 'master'];
const MAX_DIAS_ATRAS = 366;

router.use(verifyToken, (req, res, next) => {
  if (!ROLES_PERMITIDOS.includes(req.user.rol)) {
    return res.status(403).json({ error: 'No tienes acceso a la Auditoría de Producto' });
  }
  next();
});

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const csv = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);

// Producto solo ve las suyas; gerencia y master ven todas.
const filtroAcceso = (req) => (ROLES_VEN_TODO.includes(req.user.rol) ? {} : { auditorId: oid(req.user.id) });

function armarFiltro(req, { conMes = true, query = req.query } = {}) {
  const q = query;
  const f = { ...filtroAcceso(req) };
  if (ROLES_VEN_TODO.includes(req.user.rol) && mongoose.isValidObjectId(q.auditorId)) f.auditorId = oid(q.auditorId);
  const locales = csv(q.localId).filter((x) => mongoose.isValidObjectId(x)).map(oid);
  if (locales.length) f.localId = { $in: locales };
  const cats = csv(q.categoria).filter((c) => C.CATEGORIAS.includes(c));
  if (cats.length) f.categoria = { $in: cats };
  if (C.SECCIONES.some((s) => s.id === q.seccionDebil)) f['seccionMasDebil.id'] = q.seccionDebil;

  const fecha = {};
  if (conMes && /^\d{4}-\d{2}$/.test(q.mes || '')) {
    const [y, m] = q.mes.split('-').map(Number);
    fecha.$gte = new Date(Date.UTC(y, m - 1, 1));
    fecha.$lt = new Date(Date.UTC(y, m, 1));
  } else {
    if (H.esFechaValida(q.desde)) fecha.$gte = new Date(`${q.desde}T00:00:00.000Z`);
    if (H.esFechaValida(q.hasta)) fecha.$lte = new Date(`${q.hasta}T23:59:59.999Z`);
  }
  if (Object.keys(fecha).length) f.fechaAuditoria = fecha;
  return f;
}

const aLite = (d) => ({
  _id: d._id, localId: d.localId, localNombre: d.localNombre, fechaAuditoria: d.fechaAuditoria,
  auditorId: d.auditorId, auditorNombre: d.auditorNombre,
  porcentajeTotal: d.porcentajeTotal, categoria: d.categoria, seccionMasDebil: d.seccionMasDebil || null,
});

// Documento de la auditoría + sus compromisos, tal como lo necesita la app tras guardar
async function respuestaCompleta(doc) {
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  o.compromisos = await H.listarCompromisosDeRevision(o._id);
  return o;
}

// "revision" para el helper de compromisos: la auditoría cumple el mismo papel
const comoOrigen = (doc) => ({
  _id: doc._id, localId: doc.localId, fechaRevision: doc.fechaAuditoria,
  supervisorId: doc.auditorId, supervisorNombre: doc.auditorNombre,
});

// Idempotente: sincronizar dos veces lo mismo no duplica nada (cada compromiso tiene su clientId)
async function guardarCompromisos(doc, items) {
  await H.sincronizarCompromisos({ revision: comoOrigen(doc), items, finalizada: true, origen: 'producto' });
}

const itemsDeCompromisos = (b) => (Array.isArray(b.compromisos) ? b.compromisos : [])
  .map((c) => ({ ...(c || {}), seccion: 'producto' })); // aquí todos son de la sección Producto

// ────────────────────────────────────────────────────────────
// GET /plan — checklist, categorías y plan de acción por rango
// ────────────────────────────────────────────────────────────
router.get('/plan', (req, res) => {
  res.json({ titulo: C.TITULO_PLAN, categorias: C.CATEGORIAS, plan: C.PLAN_ACCION, secciones: C.SECCIONES });
});

// ────────────────────────────────────────────────────────────
// GET /meses — meses (YYYY-MM) con auditorías, el más reciente primero
// ────────────────────────────────────────────────────────────
router.get('/meses', async (req, res) => {
  try {
    const docs = await AuditoriaProducto.find(filtroAcceso(req)).select('fechaAuditoria').lean();
    res.json(S.mesesConDatos(docs));
  } catch (error) {
    console.error('Error listando meses de producto:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// ────────────────────────────────────────────────────────────
// GET /resumen — todo lo que muestra el dashboard (filtros: mes | desde+hasta, localId, categoria,
// auditorId, seccionDebil)
// ────────────────────────────────────────────────────────────
router.get('/resumen', async (req, res) => {
  try {
    const docs = await AuditoriaProducto.find(armarFiltro(req))
      .select('localId localNombre fechaAuditoria porcentajeTotal categoria secciones').limit(5000).lean();
    const resumen = S.resumirAuditorias(docs);

    // Evolución: últimos 6 meses con los mismos filtros, salvo el del mes
    const hastaMes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : H.fechaChileStr().slice(0, 7);
    const [y, m] = hastaMes.split('-').map(Number);
    const filtroSerie = armarFiltro(req, { conMes: false, query: { ...req.query, mes: undefined, desde: undefined, hasta: undefined } });
    filtroSerie.fechaAuditoria = { $gte: new Date(Date.UTC(y, m - 6, 1)), $lt: new Date(Date.UTC(y, m, 1)) };
    const docsSerie = await AuditoriaProducto.find(filtroSerie).select('fechaAuditoria porcentajeTotal').limit(5000).lean();

    // Compromisos de producto de estas auditorías
    const compromisos = await Compromiso.find({ origen: 'producto', visible: true, revisionId: { $in: docs.map((d) => d._id) } })
      .select('-evidencias').lean();
    const acum = H.acumular(compromisos, H.fechaChileStr());

    res.json({
      ...resumen,
      serie: S.serieMensual(docsSerie, hastaMes, 6),
      compromisos: {
        asumidos: acum.asumidos, abiertos: acum.abiertos, vencidos: acum.vencidos,
        enRevision: acum.enRevision, cerrados: acum.cerrados, pctATiempo: acum.pctATiempo,
      },
      tituloPlan: C.TITULO_PLAN,
      planGeneral: C.planDe(resumen.categoriaGeneral),
    });
  } catch (error) {
    console.error('Error en resumen de producto:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// ────────────────────────────────────────────────────────────
// POST / — guarda una auditoría ya terminada (con hasta 3 compromisos)
// body: { clientId, localId, fechaAuditoria, respuestas:[{n,valor,observacion}], observacionesEquipo, compromisos:[…] }
// ────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const b = req.body || {};
  const clientId = typeof b.clientId === 'string' ? b.clientId.trim().slice(0, 80) : '';
  try {
    // ¿Ya se guardó este mismo envío? (doble toque, reintento porque la respuesta no llegó)
    if (clientId) {
      const previa = await AuditoriaProducto.findOne({ auditorId: oid(req.user.id), clientId });
      if (previa) {
        // Si la primera vez falló justo al guardar los compromisos, el reintento los completa
        const items = itemsDeCompromisos(b);
        if (Array.isArray(b.compromisos)) {
          const v = await H.validarCompromisos(items, { localId: previa.localId, fechaRevision: previa.fechaAuditoria, secciones: ['producto'], etiqueta: 'auditoría' });
          if (v.ok) await guardarCompromisos(previa, v.items);
        }
        console.log('Auditoría de producto repetida ignorada (mismo envío):', previa._id.toString(), '| Local:', previa.localNombre);
        return res.status(200).json(await respuestaCompleta(previa));
      }
    }

    if (!mongoose.isValidObjectId(b.localId)) return res.status(400).json({ error: 'Elige el local' });
    const local = await Local.findById(b.localId).select('nombre activo').lean();
    if (!local) return res.status(400).json({ error: 'El local no existe' });

    const fechaStr = H.normalizarFechaEntrada(b.fechaAuditoria);
    if (!fechaStr) return res.status(400).json({ error: 'Indica la fecha de la auditoría' });
    const hoy = H.fechaChileStr();
    if (fechaStr > hoy) return res.status(400).json({ error: 'La fecha de la auditoría no puede ser futura' });
    if (H.diasEntre(fechaStr, hoy) > MAX_DIAS_ATRAS) return res.status(400).json({ error: 'La fecha de la auditoría es demasiado antigua' });

    const resp = C.validarRespuestas(b.respuestas);
    if (!resp.ok) return res.status(400).json({ error: resp.error });
    const resultado = C.calcularResultado(resp.mapa);
    if (!resultado) return res.status(400).json({ error: 'Responde Sí o No en al menos una sección: no todo puede ser N/A' });

    const comp = await H.validarCompromisos(itemsDeCompromisos(b), { localId: local._id, fechaRevision: fechaStr, secciones: ['producto'], etiqueta: 'auditoría' });
    if (!comp.ok) return res.status(400).json({ error: comp.error });

    const doc = new AuditoriaProducto({
      ...(clientId ? { clientId } : {}),
      localId: local._id,
      localNombre: local.nombre,
      fechaAuditoria: H.strAFecha(fechaStr),
      auditorId: oid(req.user.id),
      auditorNombre: req.user.nombre,
      respuestas: resp.respuestas,
      observacionesEquipo: String(b.observacionesEquipo || '').trim().slice(0, C.MAX_OBSERVACION_EQUIPO),
      secciones: resultado.secciones,
      seccionesQueAplican: resultado.seccionesQueAplican,
      puntosTotal: resultado.puntosTotal,
      porcentajeTotal: resultado.porcentajeTotal,
      categoria: resultado.categoria,
      seccionMasDebil: S.seccionMasDebil(resultado.secciones),
      planAccion: C.planDe(resultado.categoria),
    });
    await doc.save();
    await guardarCompromisos(doc, comp.items);

    console.log('Auditoría de producto creada:', doc._id.toString(), '| Local:', doc.localNombre, '|', doc.porcentajeTotal + '%', doc.categoria, '| Auditor:', req.user.nombre);
    res.status(201).json(await respuestaCompleta(doc));
  } catch (error) {
    // Dos envíos iguales llegaron casi al mismo tiempo: gana el primero y al segundo se le devuelve ese
    if (error.code === 11000 && clientId) {
      const previa = await AuditoriaProducto.findOne({ auditorId: oid(req.user.id), clientId }).catch(() => null);
      if (previa) return res.status(200).json(await respuestaCompleta(previa));
    }
    console.error('Error creando auditoría de producto:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// ────────────────────────────────────────────────────────────
// GET / — lista paginada (más recientes primero)
// ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filtro = armarFiltro(req);
    const [docs, total] = await Promise.all([
      AuditoriaProducto.find(filtro)
        .select('localId localNombre fechaAuditoria auditorId auditorNombre porcentajeTotal categoria seccionMasDebil')
        .sort({ fechaAuditoria: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditoriaProducto.countDocuments(filtro),
    ]);
    res.json({ data: docs.map(aLite), total, page, limit });
  } catch (error) {
    console.error('Error listando auditorías de producto:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// ────────────────────────────────────────────────────────────
// GET /:id — detalle con el texto de cada pregunta, resultado por sección, plan y compromisos
// ────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Auditoría no encontrada' });
    const doc = await AuditoriaProducto.findOne({ _id: oid(req.params.id), ...filtroAcceso(req) }).lean();
    if (!doc) return res.status(404).json({ error: 'Auditoría no encontrada' });

    const porN = new Map((doc.respuestas || []).map((r) => [r.n, r]));
    const resultadoPorId = new Map((doc.secciones || []).map((s) => [s.id, s]));
    const detalle = C.SECCIONES.map((def) => ({
      ...(resultadoPorId.get(def.id) || { id: def.id, nombre: def.nombre }),
      preguntas: def.preguntas.map((p) => {
        const r = porN.get(p.n) || {};
        return { n: p.n, texto: p.texto, valor: r.valor || null, observacion: r.observacion || '', llevaObservacion: p.obs };
      }),
    }));
    const compromisos = await H.listarCompromisosDeRevision(doc._id);
    res.json({ ...doc, detalle, compromisos, tituloPlan: C.TITULO_PLAN });
  } catch (error) {
    console.error('Error en detalle de auditoría de producto:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// ────────────────────────────────────────────────────────────
// DELETE /:id — solo gerencia y master; borra también sus compromisos
// ────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  if (!ROLES_VEN_TODO.includes(req.user.rol)) {
    return res.status(403).json({ error: 'Solo gerencia y master pueden eliminar auditorías de producto' });
  }
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Auditoría no encontrada' });
    const doc = await AuditoriaProducto.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Auditoría no encontrada' });
    await Compromiso.deleteMany({ revisionId: doc._id, origen: 'producto' });
    await doc.deleteOne();
    console.log('Auditoría de producto eliminada:', req.params.id, '| por', req.user.nombre);
    res.json({ message: 'Auditoría eliminada' });
  } catch (error) {
    console.error('Error eliminando auditoría de producto:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

module.exports = router;
