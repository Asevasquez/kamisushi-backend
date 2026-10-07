// backend/routes/compromisos.js
//
// Seguimiento de los compromisos acordados en las revisiones.
//   - La supervisora los crea dentro de la revisión (rutas de revisiones.js) y
//     escribe a mano el nombre de quien toma cada compromiso.
//   - El administrador del local (o el mentor, en los locales que administra)
//     sube la evidencia.
//   - Quien creó la revisión (o gerencia/master) valida: aprueba o pide corrección.
//   - Gerencia/master ven todo. El mentor ve además, en solo lectura, los
//     locales que mentorea (sus locales asignados, como en Mentorías).
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Compromiso = require('../models/Compromiso');
const Usuario = require('../models/Usuario');
const { verifyToken } = require('../middleware/auth');
const { procesarFotosEnObjeto } = require('./upload');
const H = require('../utils/compromisosHelper');

// 'auditor' no tiene acceso.
const ROLES_PERMITIDOS = ['master', 'gerencia', 'supervisor', 'supervisorinterno', 'administrador', 'mentor'];
const ROLES_ADMIN_TOTAL = ['master', 'gerencia'];

const oid = (v) => new mongoose.Types.ObjectId(String(v));

router.use(verifyToken);
router.use(async (req, res, next) => {
  if (!ROLES_PERMITIDOS.includes(req.user.rol)) {
    return res.status(403).json({ error: 'No tienes acceso a Compromisos' });
  }
  try {
    // Se lee de la base (no del token) para tener siempre los locales vigentes.
    const u = await Usuario.findById(req.user.id).select('localesAsignados localesAdministrados activo').lean();
    if (!u || u.activo === false) return res.status(401).json({ error: 'Usuario no disponible' });
    req.alcance = H.alcanceDeUsuario(req.user.rol, u);

    // Filtro por administrador (solo se usa en la vista general): equivale a
    // "los locales de ese administrador".
    if (req.query.administradorId && mongoose.isValidObjectId(req.query.administradorId)) {
      const adm = await Usuario.findById(req.query.administradorId).select('rol localesAsignados localesAdministrados').lean();
      req.localesDeAdministrador = adm ? H.localesComoAdmin(adm).map(oid) : [];
    }
    next();
  } catch (error) {
    console.error('Error cargando alcance de compromisos:', error);
    res.status(500).json({ error: error.message });
  }
});

const filtroBase = (req, opciones = {}) => H.filtroPorRol({
  rol: req.user.rol, userId: req.user.id, alcance: req.alcance, alcanceParam: req.query.alcance, ...opciones,
});

// Filtros opcionales comunes a la lista y al resumen.
function filtrosOpcionales(req) {
  const q = req.query;
  const and = [];
  if (q.localId && mongoose.isValidObjectId(q.localId)) and.push({ localId: oid(q.localId) });
  if (q.supervisorId && mongoose.isValidObjectId(q.supervisorId)) and.push({ supervisorId: oid(q.supervisorId) });
  if (H.SECCIONES.includes(q.seccion)) and.push({ seccion: q.seccion });
  if (req.localesDeAdministrador) and.push({ localId: { $in: req.localesDeAdministrador } });
  return and;
}

// Filtro de la lista: base por rol + filtros opcionales + mes de la revisión.
// 'condicion' tiene el criterio de cada estado (vencido = abierto con fecha pasada).
function armarFiltroLista(req, hoy) {
  const and = [filtroBase(req), ...filtrosOpcionales(req)];
  const { mes } = req.query;
  if (/^\d{4}-\d{2}$/.test(mes || '')) {
    const [y, m] = mes.split('-').map(Number);
    and.push({ fechaRevision: { $gte: new Date(Date.UTC(y, m - 1, 1, 3)), $lt: new Date(Date.UTC(y, m, 1, 3)) } });
  }
  const meses = Math.min(parseInt(req.query.meses, 10) || 0, 24);
  if (meses > 0 && !mes) {
    const [y, m] = H.fechaChileStr().split('-').map(Number);
    and.push({ fechaRevision: { $gte: new Date(Date.UTC(y, m - meses, 1, 3)) } });
  }
  const condicion = {
    abierto: { estado: 'abierto', fechaLimite: { $gte: hoy } },
    vencido: { estado: 'abierto', fechaLimite: { $lt: hoy } },
    en_revision: { estado: 'en_revision' },
    cerrado: { estado: 'cerrado' },
  };
  return { and, condicion };
}

const permisos = (req) => ({ rol: req.user.rol, userId: req.user.id, alcance: req.alcance });

function serializar(c, req, hoyStr, conDetalle = false) {
  const out = {
    _id: c._id,
    revisionId: c.revisionId,
    localId: c.localId,
    localNombre: c.localNombre,
    fechaRevision: c.fechaRevision,
    supervisorId: c.supervisorId,
    supervisorNombre: c.supervisorNombre,
    seccion: c.seccion,
    seccionLabel: H.SECCION_LABEL[c.seccion],
    texto: c.texto,
    responsableNombre: c.responsableNombre,
    fechaLimite: H.fechaAStr(c.fechaLimite),
    estado: c.estado,
    estadoVisible: H.estadoVisible(c, hoyStr),
    diasRestantes: H.diasRestantes(c, hoyStr),
    evidenciasCount: c.evidenciasCount || 0,
    correcciones: c.correcciones || 0,
    fechaCierre: c.fechaCierre || null,
    cerradoATiempo: c.cerradoATiempo ?? null,
    puedeEnviarEvidencia: H.puedeEnviarEvidencia(permisos(req), c),
    puedeRevisar: H.puedeRevisar(permisos(req), c),
  };
  if (conDetalle) {
    out.evidencias = c.evidencias || [];
    out.historial = c.historial || [];
  }
  return out;
}

// Administradores (y mentores) con los locales que administran.
async function cargarAdministradores() {
  const usuarios = await Usuario.find({ rol: { $in: ['administrador', 'mentor'] }, activo: true })
    .select('nombre rol localesAsignados localesAdministrados').lean();
  return usuarios
    .map((u) => ({ administradorId: String(u._id), nombre: u.nombre, esMentor: u.rol === 'mentor', localesIds: H.localesComoAdmin(u) }))
    .filter((a) => a.localesIds.length > 0);
}

// ────────────────────────────────────────────────────────────
// Locales que administra un mentor (solo master). Los que mentorea son sus
// locales asignados de siempre (módulo Mentorías) y no se tocan aquí.
// ────────────────────────────────────────────────────────────
router.get('/administrados/:usuarioId', async (req, res) => {
  if (req.user.rol !== 'master') return res.status(403).json({ error: 'Solo master' });
  try {
    if (!mongoose.isValidObjectId(req.params.usuarioId)) return res.status(400).json({ error: 'Usuario inválido' });
    const u = await Usuario.findById(req.params.usuarioId).select('localesAdministrados').populate('localesAdministrados', 'nombre ciudad').lean();
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(u.localesAdministrados || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/administrados/:usuarioId', async (req, res) => {
  if (req.user.rol !== 'master') return res.status(403).json({ error: 'Solo master' });
  try {
    const { usuarioId } = req.params;
    const localesIds = Array.isArray(req.body.localesIds) ? req.body.localesIds : [];
    if (!mongoose.isValidObjectId(usuarioId) || !localesIds.every((l) => mongoose.isValidObjectId(l))) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
    const u = await Usuario.findById(usuarioId).select('rol').lean();
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (u.rol !== 'mentor') return res.status(400).json({ error: 'Los locales administrados se asignan solo a mentores' });
    await Usuario.updateOne({ _id: usuarioId }, { $set: { localesAdministrados: localesIds.map(oid) } }, { strict: false });
    res.json({ message: 'Locales administrados actualizados' });
  } catch (error) {
    console.error('Error asignando locales administrados:', error);
    res.status(500).json({ error: error.message });
  }
});

// ────────────────────────────────────────────────────────────
// GET /resumen — KPIs y rankings. Gerencia/master reciben además los
// rankings de administradores y supervisoras.
// ────────────────────────────────────────────────────────────
router.get('/resumen', async (req, res) => {
  try {
    const meses = Math.min(Math.max(parseInt(req.query.meses, 10) || 6, 1), 24);
    const top = Math.min(Math.max(parseInt(req.query.top, 10) || 10, 1), 500);
    const hoyStr = H.fechaChileStr();
    const [y, m] = hoyStr.split('-').map(Number);
    // Por mes de la revisión (3 h de margen por la zona horaria de Chile).
    const desde = new Date(Date.UTC(y, m - meses, 1, 3));

    const docs = await Compromiso.find({ $and: [filtroBase(req), ...filtrosOpcionales(req), { fechaRevision: { $gte: desde } }] })
      .select('-evidencias').lean();

    const global = ROLES_ADMIN_TOTAL.includes(req.user.rol);
    const administradores = global ? await cargarAdministradores() : [];
    res.json(H.calcularResumen(docs, { hoyStr, meses, global, top, administradores }));
  } catch (error) {
    console.error('Error en resumen de compromisos:', error);
    res.status(500).json({ error: error.message });
  }
});

// ────────────────────────────────────────────────────────────
// GET /filtros — opciones para los selectores del dashboard: solo los locales,
// supervisoras y administradores que tienen compromisos dentro del alcance de
// esta persona.
// ────────────────────────────────────────────────────────────
router.get('/filtros', async (req, res) => {
  try {
    const docs = await Compromiso.find(filtroBase(req)).select('localId localNombre supervisorId supervisorNombre').lean();
    const unicos = (idKey, nombreKey) => {
      const mapa = new Map();
      docs.forEach((d) => { if (d[idKey] && !mapa.has(String(d[idKey]))) mapa.set(String(d[idKey]), d[nombreKey] || ''); });
      return [...mapa.entries()].map(([_id, nombre]) => ({ _id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    };
    let administradores = [];
    if (ROLES_ADMIN_TOTAL.includes(req.user.rol)) {
      const conCompromisos = new Set(docs.map((d) => String(d.localId)));
      administradores = (await cargarAdministradores())
        .filter((a) => a.localesIds.some((l) => conCompromisos.has(l)))
        .map((a) => ({ _id: a.administradorId, nombre: a.nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }
    res.json({ locales: unicos('localId', 'localNombre'), administradores, supervisoras: unicos('supervisorId', 'supervisorNombre') });
  } catch (error) {
    console.error('Error en filtros de compromisos:', error);
    res.status(500).json({ error: error.message });
  }
});

// ────────────────────────────────────────────────────────────
// GET /exportar — todos los compromisos del filtro (sin paginar, hasta 5.000)
// ────────────────────────────────────────────────────────────
router.get('/exportar', async (req, res) => {
  try {
    const { estado = 'todos' } = req.query;
    const hoyStr = H.fechaChileStr();
    const { and, condicion } = armarFiltroLista(req, H.hoyReferencia());
    const docs = await Compromiso.find({ $and: [...and, ...(condicion[estado] ? [condicion[estado]] : [])] })
      .select('-evidencias -historial').sort({ localNombre: 1, fechaLimite: 1 }).limit(5000).lean();
    res.json(docs.map((c) => serializar(c, req, hoyStr)));
  } catch (error) {
    console.error('Error exportando compromisos:', error);
    res.status(500).json({ error: error.message });
  }
});

// ────────────────────────────────────────────────────────────
// GET / — lista paginada. estado: todos | abierto | vencido | en_revision | cerrado
// alcance (solo mentor): propios (por defecto) | mentoria
// ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { estado = 'todos' } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const hoyStr = H.fechaChileStr();
    const hoy = H.hoyReferencia();

    const { and, condicion } = armarFiltroLista(req, hoy);
    const filtroLista = { $and: [...and, ...(condicion[estado] ? [condicion[estado]] : [])] };
    const sort = estado === 'cerrado' ? { fechaCierre: -1 } : { fechaLimite: 1, localNombre: 1 };

    const [docs, total, cAbierto, cVencido, cRevision, cCerrado] = await Promise.all([
      Compromiso.find(filtroLista).select('-evidencias -historial').sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      Compromiso.countDocuments(filtroLista),
      Compromiso.countDocuments({ $and: [...and, condicion.abierto] }),
      Compromiso.countDocuments({ $and: [...and, condicion.vencido] }),
      Compromiso.countDocuments({ $and: [...and, condicion.en_revision] }),
      Compromiso.countDocuments({ $and: [...and, condicion.cerrado] }),
    ]);

    res.json({
      data: docs.map((c) => serializar(c, req, hoyStr)),
      total,
      conteos: {
        todos: cAbierto + cVencido + cRevision + cCerrado,
        abierto: cAbierto, vencido: cVencido, en_revision: cRevision, cerrado: cCerrado,
      },
    });
  } catch (error) {
    console.error('Error listando compromisos:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /:id — detalle con evidencias e historial
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Compromiso no encontrado' });
    const c = await Compromiso.findOne({ $and: [{ _id: oid(req.params.id) }, filtroBase(req, { incluirMentoria: true })] }).lean();
    if (!c) return res.status(404).json({ error: 'Compromiso no encontrado' });
    res.json(serializar(c, req, H.fechaChileStr(), true));
  } catch (error) {
    console.error('Error obteniendo compromiso:', error);
    res.status(500).json({ error: error.message });
  }
});

// ────────────────────────────────────────────────────────────
// POST /:id/evidencia — el administrador del local envía la evidencia
// body: { comentario, fotos: [url | data:image...] }
// ────────────────────────────────────────────────────────────
router.post('/:id/evidencia', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Compromiso no encontrado' });
    const c = await Compromiso.findOne({ _id: oid(req.params.id), visible: true }).lean();
    if (!c) return res.status(404).json({ error: 'Compromiso no encontrado' });
    if (!H.puedeEnviarEvidencia(permisos(req), c)) {
      const msg = c.estado === 'abierto'
        ? 'Solo el administrador del local puede enviar la evidencia'
        : (c.estado === 'cerrado' ? 'El compromiso ya está cerrado' : 'La evidencia ya fue enviada y está en revisión');
      return res.status(403).json({ error: msg });
    }

    const body = procesarFotosEnObjeto(req.body || {});
    const comentario = String(body.comentario || '').trim().slice(0, 1000);
    const fotos = (Array.isArray(body.fotos) ? body.fotos : []).filter((f) => typeof f === 'string' && f).slice(0, 5);
    if (!comentario && fotos.length === 0) return res.status(400).json({ error: 'Agrega al menos una foto o un comentario' });

    const usuario = { usuarioId: oid(req.user.id), usuarioNombre: req.user.nombre };
    // Con condición de estado para que un doble clic no envíe dos veces.
    const actualizado = await Compromiso.findOneAndUpdate(
      { _id: c._id, estado: 'abierto' },
      {
        $set: { estado: 'en_revision' },
        $inc: { evidenciasCount: 1 },
        $push: {
          evidencias: { ...usuario, comentario, fotos, fecha: new Date() },
          historial: { ...usuario, accion: 'evidencia_enviada', comentario, fecha: new Date() },
        },
      },
      { new: true }
    ).lean();
    if (!actualizado) return res.status(409).json({ error: 'La evidencia ya fue enviada' });

    console.log('Evidencia de compromiso:', c._id.toString(), '| Local:', c.localNombre, '| Por:', req.user.nombre);
    res.json(serializar(actualizado, req, H.fechaChileStr(), true));
  } catch (error) {
    console.error('Error enviando evidencia:', error);
    res.status(500).json({ error: error.message });
  }
});

// ────────────────────────────────────────────────────────────
// PUT /:id/revisar — quien creó la revisión (o gerencia/master) aprueba o
// pide corrección. body: { decision: 'aprobar' | 'corregir', comentario }
// ────────────────────────────────────────────────────────────
router.put('/:id/revisar', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Compromiso no encontrado' });
    const c = await Compromiso.findOne({ _id: oid(req.params.id), visible: true }).lean();
    if (!c) return res.status(404).json({ error: 'Compromiso no encontrado' });
    if (c.estado !== 'en_revision') return res.status(400).json({ error: 'El compromiso no tiene evidencia pendiente de revisión' });
    if (!H.puedeRevisar(permisos(req), c)) return res.status(403).json({ error: 'Solo quien creó la revisión, gerencia o master pueden validar este compromiso' });

    const { decision } = req.body || {};
    const comentario = String((req.body || {}).comentario || '').trim().slice(0, 1000);
    if (!['aprobar', 'corregir'].includes(decision)) return res.status(400).json({ error: 'Decisión inválida' });
    if (decision === 'corregir' && !comentario) return res.status(400).json({ error: 'Indica qué debe corregir el administrador' });

    const ultima = (c.evidencias || [])[(c.evidencias || []).length - 1];
    const diasValidacion = ultima ? H.redondear1((Date.now() - new Date(ultima.fecha).getTime()) / H.DIA_MS) : undefined;
    const usuario = { usuarioId: oid(req.user.id), usuarioNombre: req.user.nombre };

    let cambios;
    if (decision === 'aprobar') {
      const aTiempo = ultima ? H.fechaChileStr(ultima.fecha) <= H.fechaAStr(c.fechaLimite) : false;
      cambios = {
        $set: { estado: 'cerrado', fechaCierre: new Date(), cerradoATiempo: aTiempo },
        $push: { historial: { ...usuario, accion: 'aprobado', comentario, diasValidacion, fecha: new Date() } },
      };
    } else {
      cambios = {
        $set: { estado: 'abierto' },
        $inc: { correcciones: 1 },
        $push: { historial: { ...usuario, accion: 'correccion_solicitada', comentario, diasValidacion, fecha: new Date() } },
      };
    }

    const actualizado = await Compromiso.findOneAndUpdate({ _id: c._id, estado: 'en_revision' }, cambios, { new: true }).lean();
    if (!actualizado) return res.status(409).json({ error: 'El compromiso ya fue revisado' });

    res.json(serializar(actualizado, req, H.fechaChileStr(), true));
  } catch (error) {
    console.error('Error revisando compromiso:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /:id — solo gerencia y master (queda en el log)
router.delete('/:id', async (req, res) => {
  if (!ROLES_ADMIN_TOTAL.includes(req.user.rol)) return res.status(403).json({ error: 'Solo gerencia y master pueden eliminar compromisos' });
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Compromiso no encontrado' });
    const c = await Compromiso.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Compromiso no encontrado' });
    console.log(`Compromiso eliminado: ${c._id} | ${c.localNombre} | "${c.texto}" | por ${req.user.nombre} (${req.user.rol})`);
    await c.deleteOne();
    res.json({ message: 'Compromiso eliminado' });
  } catch (error) {
    console.error('Error eliminando compromiso:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
