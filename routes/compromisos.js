// backend/routes/compromisos.js
//
// Seguimiento de los compromisos acordados en las revisiones.
//   - La supervisora los crea dentro de la revisión (rutas de revisiones.js).
//   - El administrador del local sube la evidencia.
//   - Quien creó la revisión (o gerencia/master) valida: aprueba o pide corrección.
//   - Gerencia/master ven todo; el administrador ve sus locales y, solo en
//     lectura, los locales que mentorea.
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Compromiso = require('../models/Compromiso');
const Usuario = require('../models/Usuario');
const { verifyToken } = require('../middleware/auth');
const { procesarFotosEnObjeto } = require('./upload');
const H = require('../utils/compromisosHelper');

// 'auditor' no tiene acceso. 'mentor' (rol del módulo Mentorías) ve en lectura
// los locales que tiene asignados.
const ROLES_PERMITIDOS = ['master', 'gerencia', 'supervisor', 'supervisorinterno', 'administrador', 'mentor'];
const ROLES_ADMIN_TOTAL = ['master', 'gerencia'];

router.use(verifyToken);
router.use(async (req, res, next) => {
  if (!ROLES_PERMITIDOS.includes(req.user.rol)) {
    return res.status(403).json({ error: 'No tienes acceso a Compromisos' });
  }
  try {
    // Se lee de la base (no del token) para tener siempre los locales vigentes,
    // incluido localesMentoria aunque el middleware no lo cargue.
    const u = await Usuario.findById(req.user.id).select('localesAsignados localesMentoria activo').lean();
    if (!u || u.activo === false) return res.status(401).json({ error: 'Usuario no disponible' });
    const ids = (arr) => (arr || []).map((l) => new mongoose.Types.ObjectId(String(l._id || l)));
    req.alcance = { propios: ids(u.localesAsignados), mentoria: ids(u.localesMentoria) };
    next();
  } catch (error) {
    console.error('Error cargando alcance de compromisos:', error);
    res.status(500).json({ error: error.message });
  }
});

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const mismoId = (a, b) => String(a) === String(b);

// Filtro base según el rol — qué compromisos puede VER esta persona.
function filtroBase(req, { incluirMentoria = false } = {}) {
  const f = { visible: true };
  const { rol, id } = req.user;
  if (['master', 'gerencia', 'supervisor'].includes(rol)) return f; // supervisora: ve todo, valida solo lo suyo
  if (rol === 'supervisorinterno') {
    f.supervisorId = oid(id);
    f.localId = { $in: req.alcance.propios };
    return f;
  }
  if (rol === 'administrador') {
    // En listas y resumen se elige la pestaña (propios | mentoria); en el
    // detalle basta con que el compromiso sea de cualquiera de los dos grupos.
    const ids = incluirMentoria
      ? [...req.alcance.propios, ...req.alcance.mentoria]
      : (req.query.alcance === 'mentoria' ? req.alcance.mentoria : req.alcance.propios);
    f.localId = { $in: ids };
    return f;
  }
  f.localId = { $in: req.alcance.propios }; // mentor (Mentorías): lectura de sus locales
  return f;
}

// Filtros opcionales comunes a la lista y al resumen.
function filtrosOpcionales(q) {
  const and = [];
  if (q.localId && mongoose.isValidObjectId(q.localId)) and.push({ localId: oid(q.localId) });
  if (q.supervisorId && mongoose.isValidObjectId(q.supervisorId)) and.push({ supervisorId: oid(q.supervisorId) });
  if (q.responsableId && mongoose.isValidObjectId(q.responsableId)) and.push({ responsableId: oid(q.responsableId) });
  if (H.SECCIONES.includes(q.seccion)) and.push({ seccion: q.seccion });
  return and;
}

// Filtro de la lista: base por rol + filtros opcionales + mes de la revisión.
// 'condicion' tiene el criterio de cada estado (vencido = abierto con fecha pasada).
function armarFiltroLista(req, hoy) {
  const and = [filtroBase(req), ...filtrosOpcionales(req.query)];
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

// Quién puede hacer qué sobre un compromiso concreto.
function puedeEnviarEvidencia(req, c) {
  return req.user.rol === 'administrador'
    && req.alcance.propios.some((l) => mismoId(l, c.localId))
    && c.estado === 'abierto';
}
function puedeRevisar(req, c) {
  if (c.estado !== 'en_revision') return false;
  if (ROLES_ADMIN_TOTAL.includes(req.user.rol)) return true;
  return ['supervisor', 'supervisorinterno'].includes(req.user.rol) && mismoId(c.supervisorId, req.user.id);
}

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
    responsableId: c.responsableId,
    responsableNombre: c.responsableNombre,
    fechaLimite: H.fechaAStr(c.fechaLimite),
    estado: c.estado,
    estadoVisible: H.estadoVisible(c, hoyStr),
    diasRestantes: H.diasRestantes(c, hoyStr),
    evidenciasCount: c.evidenciasCount || 0,
    correcciones: c.correcciones || 0,
    fechaCierre: c.fechaCierre || null,
    cerradoATiempo: c.cerradoATiempo ?? null,
    puedeEnviarEvidencia: puedeEnviarEvidencia(req, c),
    puedeRevisar: puedeRevisar(req, c),
  };
  if (conDetalle) {
    out.evidencias = c.evidencias || [];
    out.historial = c.historial || [];
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// GET /responsables?localId= — administradores asignados a un local (para el
// selector "Responsable" al crear un compromiso en la revisión).
// ────────────────────────────────────────────────────────────
router.get('/responsables', async (req, res) => {
  try {
    if (!['master', 'gerencia', 'supervisor', 'supervisorinterno'].includes(req.user.rol)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (!mongoose.isValidObjectId(req.query.localId)) return res.status(400).json({ error: 'Falta el local' });
    const admins = await Usuario.find({ rol: 'administrador', activo: true, localesAsignados: oid(req.query.localId) })
      .select('nombre email').sort({ nombre: 1 }).lean();
    res.json(admins);
  } catch (error) {
    console.error('Error listando responsables:', error);
    res.status(500).json({ error: error.message });
  }
});

// ────────────────────────────────────────────────────────────
// Locales que mentorea un administrador (solo master)
// ────────────────────────────────────────────────────────────
router.get('/mentoria/:usuarioId', async (req, res) => {
  if (req.user.rol !== 'master') return res.status(403).json({ error: 'Solo master' });
  try {
    if (!mongoose.isValidObjectId(req.params.usuarioId)) return res.status(400).json({ error: 'Usuario inválido' });
    const u = await Usuario.findById(req.params.usuarioId).select('localesMentoria').populate('localesMentoria', 'nombre ciudad').lean();
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(u.localesMentoria || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/mentoria/:usuarioId', async (req, res) => {
  if (req.user.rol !== 'master') return res.status(403).json({ error: 'Solo master' });
  try {
    const { usuarioId } = req.params;
    const localesIds = Array.isArray(req.body.localesIds) ? req.body.localesIds : [];
    if (!mongoose.isValidObjectId(usuarioId) || !localesIds.every((l) => mongoose.isValidObjectId(l))) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
    const u = await Usuario.findById(usuarioId).select('rol').lean();
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (u.rol !== 'administrador') return res.status(400).json({ error: 'Solo se asignan locales de mentoría a administradores' });
    await Usuario.updateOne({ _id: usuarioId }, { $set: { localesMentoria: localesIds.map(oid) } }, { strict: false });
    res.json({ message: 'Locales de mentoría actualizados' });
  } catch (error) {
    console.error('Error asignando locales de mentoría:', error);
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
    const top = Math.min(Math.max(parseInt(req.query.top, 10) || 10, 1), 200);
    const hoyStr = H.fechaChileStr();
    const [y, m] = hoyStr.split('-').map(Number);
    // Por mes de la revisión (3 h de margen por la zona horaria de Chile).
    const desde = new Date(Date.UTC(y, m - meses, 1, 3));

    const docs = await Compromiso.find({ $and: [filtroBase(req), ...filtrosOpcionales(req.query), { fechaRevision: { $gte: desde } }] })
      .select('-evidencias').lean();

    const global = ROLES_ADMIN_TOTAL.includes(req.user.rol);
    const resumen = H.calcularResumen(docs, { hoyStr, meses, global, top });

    if (global && resumen.administradores?.length) {
      const infos = await Usuario.find({ _id: { $in: resumen.administradores.map((a) => oid(a.administradorId)) } })
        .select('localesMentoria').lean();
      const mentores = new Set(infos.filter((u) => (u.localesMentoria || []).length > 0).map((u) => String(u._id)));
      resumen.administradores.forEach((a) => { a.esMentor = mentores.has(a.administradorId); });
    }
    res.json(resumen);
  } catch (error) {
    console.error('Error en resumen de compromisos:', error);
    res.status(500).json({ error: error.message });
  }
});

// ────────────────────────────────────────────────────────────
// GET /filtros — opciones para los selectores del dashboard: solo los locales,
// administradores y supervisoras que tienen compromisos dentro del alcance
// de esta persona.
// ────────────────────────────────────────────────────────────
router.get('/filtros', async (req, res) => {
  try {
    const docs = await Compromiso.find(filtroBase(req))
      .select('localId localNombre responsableId responsableNombre supervisorId supervisorNombre').lean();
    const unicos = (idKey, nombreKey) => {
      const mapa = new Map();
      docs.forEach((d) => { if (d[idKey] && !mapa.has(String(d[idKey]))) mapa.set(String(d[idKey]), d[nombreKey] || ''); });
      return [...mapa.entries()].map(([_id, nombre]) => ({ _id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    };
    res.json({
      locales: unicos('localId', 'localNombre'),
      administradores: unicos('responsableId', 'responsableNombre'),
      supervisoras: unicos('supervisorId', 'supervisorNombre'),
    });
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
// alcance (solo administrador): propios (por defecto) | mentoria
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
    if (!puedeEnviarEvidencia(req, c)) {
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
    if (!puedeRevisar(req, c)) return res.status(403).json({ error: 'Solo quien creó la revisión, gerencia o master pueden validar este compromiso' });

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
