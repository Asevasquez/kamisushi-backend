const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const ReunionResultado = require('../models/ReunionResultado');
const Local = require('../models/Local');
const Usuario = require('../models/Usuario');
const { verifyToken, authorize, localesDeSupervision } = require('../middleware/auth');
const { SECCION_LABEL, estadoVisible, resumenReunion, contar, inicioDeHoy } = require('../utils/reunionesResultado');

const router = express.Router();

const ROLES_GERENCIA = ['master', 'gerencia'];
// Rol que cumple compromisos: administrador (localesAsignados) y mentor (solo sus localesAdministrados;
// los locales que mentorea o donde es tutor NO entran aquí)
const ROLES_RESPONSABLES = ['administrador', 'mentor'];
const ROLES_ACCESO = [...ROLES_GERENCIA, ...ROLES_RESPONSABLES];
const SECCIONES = ReunionResultado.SECCIONES;

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024; // 10 MB por archivo
const MAX_ARCHIVOS_POR_ENVIO = 8;
const MIME_PERMITIDOS = {
  'image/jpeg': { ext: 'jpg', tipo: 'imagen' },
  'image/jpg': { ext: 'jpg', tipo: 'imagen' },
  'image/png': { ext: 'png', tipo: 'imagen' },
  'image/webp': { ext: 'webp', tipo: 'imagen' },
  'application/pdf': { ext: 'pdf', tipo: 'pdf' },
};

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'reuniones-resultado');

router.use(verifyToken, authorize(...ROLES_ACCESO));

// ───────────────────────── helpers ─────────────────────────

const esGerencia = (user) => ROLES_GERENCIA.includes(user.rol);

// null = sin restricción (Gerencia/Master). Array de ids = locales que administra
// (administrador → localesAsignados · mentor → localesAdministrados, vía localesDeSupervision).
const localesPermitidos = (user) => (esGerencia(user) ? null : localesDeSupervision(user));

const puedeVerLocal = (user, localId) => {
  const permitidos = localesPermitidos(user);
  return permitidos === null || permitidos.includes(String(localId?._id || localId));
};

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const parseFecha = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Normaliza los compromisos que envía Gerencia (descarta los vacíos)
const normalizarCompromisos = (lista = [], user) => {
  const errores = [];
  const out = [];
  const contadorSeccion = {};
  (Array.isArray(lista) ? lista : []).forEach((c, i) => {
    const descripcion = (c?.descripcion || '').trim();
    if (!descripcion) return; // espacio vacío: se ignora
    if (!SECCIONES.includes(c.seccion)) {
      errores.push(`Compromiso ${i + 1}: sección inválida`);
      return;
    }
    const fechaLimite = parseFecha(c.fechaLimite);
    if (!fechaLimite) {
      errores.push(`${SECCION_LABEL[c.seccion]}: "${descripcion.slice(0, 40)}" no tiene fecha límite válida`);
      return;
    }
    contadorSeccion[c.seccion] = (contadorSeccion[c.seccion] || 0) + 1;
    out.push({
      seccion: c.seccion,
      orden: contadorSeccion[c.seccion],
      descripcion,
      fechaLimite,
      estado: 'pendiente',
      historial: [{ accion: 'creado', usuarioId: user.id, usuarioNombre: user.nombre }],
    });
  });
  return { compromisos: out, errores };
};

// Responsables de un local: administradores + mentores que lo administran
const responsablesDelLocal = (localId) => Usuario.find({
  activo: true,
  $or: [
    { rol: 'administrador', localesAsignados: localId },
    { rol: 'mentor', localesAdministrados: localId },
  ],
}).select('_id nombre email rol').sort({ nombre: 1 }).lean();

const siguienteNumero = async () => {
  const ultimo = await ReunionResultado.findOne().sort({ numero: -1 }).select('numero').lean();
  return (ultimo?.numero || 0) + 1;
};

const folioDe = (n) => `RR-${String(n).padStart(4, '0')}`;

const serializarCompromiso = (c, reunion) => ({
  ...c,
  estadoVisible: estadoVisible(c),
  seccionLabel: SECCION_LABEL[c.seccion],
  ...(reunion ? {
    reunionId: reunion._id,
    folio: reunion.folio,
    fechaReunion: reunion.fecha,
    local: reunion.localId,
  } : {}),
});

const serializarReunion = (r, { conCompromisos = false } = {}) => {
  const base = {
    _id: r._id,
    folio: r.folio,
    numero: r.numero,
    fecha: r.fecha,
    estado: r.estado,
    local: r.localId,
    creadoPor: r.creadoPor,
    creadoPorNombre: r.creadoPorNombre,
    finalizadaAt: r.finalizadaAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    resumen: resumenReunion(r.compromisos),
  };
  if (conCompromisos) base.compromisos = (r.compromisos || []).map((c) => serializarCompromiso(c));
  return base;
};

const filtroReuniones = (req) => {
  const { localId, desde, hasta, estado } = req.query;
  const filtro = {};
  const permitidos = localesPermitidos(req.user);

  if (permitidos !== null) {
    filtro.localId = { $in: permitidos };
    filtro.estado = 'finalizada'; // el administrador nunca ve borradores
  } else if (estado && ['borrador', 'finalizada'].includes(estado)) {
    filtro.estado = estado;
  }

  if (localId) {
    if (!isValidId(localId)) return { error: 'localId inválido' };
    if (permitidos !== null && !permitidos.includes(localId)) return { error: 'Sin acceso a este local', status: 403 };
    filtro.localId = localId;
  }

  const d = parseFecha(desde);
  const h = parseFecha(hasta);
  if (d || h) {
    filtro.fecha = {};
    if (d) filtro.fecha.$gte = d;
    if (h) {
      h.setHours(23, 59, 59, 999);
      filtro.fecha.$lte = h;
    }
  }
  return { filtro };
};

const guardarArchivo = async (reunionId, archivo) => {
  const mime = (archivo?.mimeType || '').toLowerCase();
  const meta = MIME_PERMITIDOS[mime];
  if (!meta) throw Object.assign(new Error(`Tipo de archivo no permitido: ${mime || 'desconocido'}`), { status: 400 });

  const limpio = String(archivo.base64 || '').replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(limpio, 'base64');
  if (!buffer.length) throw Object.assign(new Error('Archivo vacío'), { status: 400 });
  if (buffer.length > MAX_ARCHIVO_BYTES) throw Object.assign(new Error('Un archivo supera los 10 MB'), { status: 400 });

  const dir = path.join(UPLOAD_DIR, String(reunionId));
  await fs.promises.mkdir(dir, { recursive: true });
  const nombreArchivo = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${meta.ext}`;
  await fs.promises.writeFile(path.join(dir, nombreArchivo), buffer);

  return {
    url: `/uploads/reuniones-resultado/${reunionId}/${nombreArchivo}`,
    nombre: (archivo.nombre || nombreArchivo).slice(0, 120),
    tipo: meta.tipo,
  };
};

const borrarArchivos = async (urls = []) => {
  await Promise.all(urls.map((u) => fs.promises.unlink(path.join(process.cwd(), u.replace(/^\//, ''))).catch(() => {})));
};

const manejarError = (res, error, contexto) => {
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error(`Error en ${contexto}:`, error);
  return res.status(500).json({ error: `Error en ${contexto}` });
};

// ───────────────────────── locales ─────────────────────────

// GET /mis-locales — Gerencia/Master: todos; Administrador/Mentor: los locales que administra
router.get('/mis-locales', async (req, res) => {
  try {
    const permitidos = localesPermitidos(req.user);
    const filtro = permitidos === null ? { activo: { $ne: false } } : { _id: { $in: permitidos } };
    const locales = await Local.find(filtro).select('_id nombre ciudad').sort({ nombre: 1 }).lean();
    res.json(locales);
  } catch (error) {
    manejarError(res, error, 'mis-locales');
  }
});

// GET /locales/:localId/administradores — responsables del local
router.get('/locales/:localId/administradores', async (req, res) => {
  try {
    const { localId } = req.params;
    if (!isValidId(localId)) return res.status(400).json({ error: 'localId inválido' });
    if (!puedeVerLocal(req.user, localId)) return res.status(403).json({ error: 'Sin acceso a este local' });
    res.json(await responsablesDelLocal(localId));
  } catch (error) {
    manejarError(res, error, 'administradores del local');
  }
});

// ───────────────────────── estadísticas ─────────────────────────

// GET /estadisticas?localId&desde&hasta — KPIs (solo reuniones finalizadas)
router.get('/estadisticas', async (req, res) => {
  try {
    const { filtro, error, status } = filtroReuniones(req);
    if (error) return res.status(status || 400).json({ error });
    filtro.estado = 'finalizada';

    const reuniones = await ReunionResultado.find(filtro).populate('localId', '_id nombre ciudad').lean();
    const todos = reuniones.flatMap((r) => r.compromisos || []);

    const porLocalMap = {};
    for (const r of reuniones) {
      const key = String(r.localId?._id || r.localId);
      if (!porLocalMap[key]) porLocalMap[key] = { local: r.localId, reuniones: 0, compromisos: [] };
      porLocalMap[key].reuniones += 1;
      porLocalMap[key].compromisos.push(...(r.compromisos || []));
    }
    const porLocal = Object.values(porLocalMap)
      .map((x) => ({ local: x.local, reuniones: x.reuniones, ...contar(x.compromisos) }))
      .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));

    res.json({
      reuniones: reuniones.length,
      ...resumenReunion(todos),
      porLocal,
    });
  } catch (error) {
    manejarError(res, error, 'estadísticas');
  }
});

// ───────────────────────── compromisos (lista plana) ─────────────────────────

// GET /compromisos?estado=pendiente|en_revision|aprobado|rechazado|vencido&localId&seccion
//  - Administrador: compromisos de sus locales
//  - Gerencia/Master: todos (ej. estado=en_revision → "Por revisar")
router.get('/compromisos', async (req, res) => {
  try {
    const { estado, seccion } = req.query;
    const { filtro, error, status } = filtroReuniones(req);
    if (error) return res.status(status || 400).json({ error });
    filtro.estado = 'finalizada';

    const reuniones = await ReunionResultado.find(filtro).populate('localId', '_id nombre ciudad').lean();

    let lista = reuniones.flatMap((r) => (r.compromisos || []).map((c) => serializarCompromiso(c, r)));
    const conteo = { pendiente: 0, en_revision: 0, aprobado: 0, rechazado: 0, vencido: 0 };
    lista.forEach((c) => { conteo[c.estadoVisible] += 1; });

    if (seccion) lista = lista.filter((c) => c.seccion === seccion);
    if (estado) {
      const estados = String(estado).split(',');
      lista = lista.filter((c) => estados.includes(c.estadoVisible));
    }

    const prioridad = { vencido: 0, rechazado: 1, pendiente: 2, en_revision: 3, aprobado: 4 };
    lista.sort((a, b) => (prioridad[a.estadoVisible] - prioridad[b.estadoVisible])
      || (new Date(a.fechaLimite) - new Date(b.fechaLimite)));

    res.json({ conteo, compromisos: lista });
  } catch (error) {
    manejarError(res, error, 'lista de compromisos');
  }
});

// ───────────────────────── reuniones ─────────────────────────

// GET / — listado
router.get('/', async (req, res) => {
  try {
    const { filtro, error, status } = filtroReuniones(req);
    if (error) return res.status(status || 400).json({ error });
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const reuniones = await ReunionResultado.find(filtro)
      .populate('localId', '_id nombre ciudad')
      .sort({ fecha: -1, numero: -1 })
      .limit(limit)
      .lean();
    res.json(reuniones.map((r) => serializarReunion(r)));
  } catch (error) {
    manejarError(res, error, 'listado de reuniones');
  }
});

// GET /:id — detalle
router.get('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'id inválido' });
    const r = await ReunionResultado.findById(req.params.id).populate('localId', '_id nombre ciudad').lean();
    if (!r) return res.status(404).json({ error: 'Reunión no encontrada' });
    if (!puedeVerLocal(req.user, r.localId)) return res.status(403).json({ error: 'Sin acceso a esta reunión' });
    if (!esGerencia(req.user) && r.estado !== 'finalizada') return res.status(404).json({ error: 'Reunión no encontrada' });

    const administradores = await responsablesDelLocal(r.localId._id);
    res.json({ ...serializarReunion(r, { conCompromisos: true }), administradores });
  } catch (error) {
    manejarError(res, error, 'detalle de reunión');
  }
});

// POST / — crear (Gerencia/Master). Body: { localId, fecha, compromisos: [...], finalizar }
router.post('/', authorize(...ROLES_GERENCIA), async (req, res) => {
  try {
    const { localId, fecha, compromisos: lista, finalizar } = req.body;
    if (!isValidId(localId)) return res.status(400).json({ error: 'Debes seleccionar un local' });
    const local = await Local.findById(localId).select('_id').lean();
    if (!local) return res.status(404).json({ error: 'Local no encontrado' });

    const { compromisos, errores } = normalizarCompromisos(lista, req.user);
    if (errores.length) return res.status(400).json({ error: errores[0], errores });
    if (finalizar && !compromisos.length) {
      return res.status(400).json({ error: 'La reunión debe tener al menos un compromiso para finalizarla' });
    }

    for (let intento = 0; intento < 3; intento += 1) {
      const numero = await siguienteNumero();
      try {
        const reunion = await ReunionResultado.create({
          numero,
          folio: folioDe(numero),
          localId,
          fecha: parseFecha(fecha) || new Date(),
          estado: finalizar ? 'finalizada' : 'borrador',
          finalizadaAt: finalizar ? new Date() : undefined,
          creadoPor: req.user.id,
          creadoPorNombre: req.user.nombre,
          compromisos,
        });
        const out = await ReunionResultado.findById(reunion._id).populate('localId', '_id nombre ciudad').lean();
        return res.status(201).json(serializarReunion(out, { conCompromisos: true }));
      } catch (e) {
        if (e.code !== 11000) throw e; // folio duplicado por concurrencia → reintenta
      }
    }
    return res.status(409).json({ error: 'No se pudo asignar folio, intenta nuevamente' });
  } catch (error) {
    manejarError(res, error, 'crear reunión');
  }
});

// PUT /:id — editar borrador (Gerencia/Master). Body igual a POST.
router.put('/:id', authorize(...ROLES_GERENCIA), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'id inválido' });
    const reunion = await ReunionResultado.findById(req.params.id);
    if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
    if (reunion.estado !== 'borrador') return res.status(400).json({ error: 'Solo se pueden editar reuniones en borrador' });

    const { localId, fecha, compromisos: lista, finalizar } = req.body;
    if (localId) {
      if (!isValidId(localId)) return res.status(400).json({ error: 'localId inválido' });
      reunion.localId = localId;
    }
    if (fecha) reunion.fecha = parseFecha(fecha) || reunion.fecha;

    if (lista !== undefined) {
      const { compromisos, errores } = normalizarCompromisos(lista, req.user);
      if (errores.length) return res.status(400).json({ error: errores[0], errores });
      reunion.compromisos = compromisos;
    }
    if (finalizar) {
      if (!reunion.compromisos.length) {
        return res.status(400).json({ error: 'La reunión debe tener al menos un compromiso para finalizarla' });
      }
      reunion.estado = 'finalizada';
      reunion.finalizadaAt = new Date();
    }
    await reunion.save();
    const out = await ReunionResultado.findById(reunion._id).populate('localId', '_id nombre ciudad').lean();
    res.json(serializarReunion(out, { conCompromisos: true }));
  } catch (error) {
    manejarError(res, error, 'editar reunión');
  }
});

// DELETE /:id — eliminar borrador (Gerencia/Master)
router.delete('/:id', authorize(...ROLES_GERENCIA), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'id inválido' });
    const reunion = await ReunionResultado.findById(req.params.id);
    if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
    if (reunion.estado !== 'borrador' && req.user.rol !== 'master') {
      return res.status(400).json({ error: 'Solo se pueden eliminar borradores' });
    }
    const urls = reunion.compromisos.flatMap((c) => c.evidencias.map((e) => e.url));
    await reunion.deleteOne();
    await borrarArchivos(urls);
    res.json({ ok: true });
  } catch (error) {
    manejarError(res, error, 'eliminar reunión');
  }
});

// ───────────────────────── evidencia y validación ─────────────────────────

// POST /:id/compromisos/:cid/evidencia — Administrador o Mentor que administra el local (o Master)
// Body: { comentario, archivos: [{ base64, mimeType, nombre }] }
router.post('/:id/compromisos/:cid/evidencia', authorize(...ROLES_RESPONSABLES, 'master'), async (req, res) => {
  const guardados = [];
  try {
    const { id, cid } = req.params;
    if (!isValidId(id) || !isValidId(cid)) return res.status(400).json({ error: 'id inválido' });

    const reunion = await ReunionResultado.findById(id);
    if (!reunion || reunion.estado !== 'finalizada') return res.status(404).json({ error: 'Reunión no encontrada' });
    if (req.user.rol !== 'master' && !puedeVerLocal(req.user, reunion.localId)) {
      return res.status(403).json({ error: 'Este compromiso no es de tus locales' });
    }
    const c = reunion.compromisos.id(cid);
    if (!c) return res.status(404).json({ error: 'Compromiso no encontrado' });
    if (!['pendiente', 'rechazado'].includes(c.estado)) {
      return res.status(400).json({ error: c.estado === 'aprobado' ? 'El compromiso ya fue aprobado' : 'La evidencia ya está en revisión' });
    }

    const archivos = Array.isArray(req.body.archivos) ? req.body.archivos : [];
    const comentario = (req.body.comentario || '').trim();
    if (!archivos.length) return res.status(400).json({ error: 'Debes adjuntar al menos una foto o archivo' });
    if (archivos.length > MAX_ARCHIVOS_POR_ENVIO) {
      return res.status(400).json({ error: `Máximo ${MAX_ARCHIVOS_POR_ENVIO} archivos por envío` });
    }

    for (const a of archivos) guardados.push(await guardarArchivo(reunion._id, a));

    const envio = (c.envios || 0) + 1;
    guardados.forEach((g) => c.evidencias.push({
      ...g, envio, subidoPor: req.user.id, subidoPorNombre: req.user.nombre,
    }));
    c.envios = envio;
    c.comentarioAdmin = comentario;
    c.enviadoPor = req.user.id;
    c.enviadoPorNombre = req.user.nombre;
    c.enviadoAt = new Date();
    c.estado = 'en_revision';
    c.historial.push({
      accion: 'evidencia_enviada',
      usuarioId: req.user.id,
      usuarioNombre: req.user.nombre,
      detalle: `${guardados.length} archivo(s)${envio > 1 ? ` · reenvío ${envio}` : ''}`,
    });

    await reunion.save();
    res.json(serializarCompromiso(c.toObject(), { ...reunion.toObject(), localId: reunion.localId }));
  } catch (error) {
    await borrarArchivos(guardados.map((g) => g.url));
    manejarError(res, error, 'subir evidencia');
  }
});

// POST /:id/compromisos/:cid/validar — Gerencia/Master. Body: { aprobado: bool, observacion }
router.post('/:id/compromisos/:cid/validar', authorize(...ROLES_GERENCIA), async (req, res) => {
  try {
    const { id, cid } = req.params;
    if (!isValidId(id) || !isValidId(cid)) return res.status(400).json({ error: 'id inválido' });
    const { aprobado } = req.body;
    const observacion = (req.body.observacion || '').trim();
    if (typeof aprobado !== 'boolean') return res.status(400).json({ error: 'Indica si apruebas o rechazas' });
    if (!aprobado && !observacion) return res.status(400).json({ error: 'La observación es obligatoria al rechazar' });

    const reunion = await ReunionResultado.findById(id);
    if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
    const c = reunion.compromisos.id(cid);
    if (!c) return res.status(404).json({ error: 'Compromiso no encontrado' });
    if (c.estado !== 'en_revision') return res.status(400).json({ error: 'Este compromiso no tiene evidencia por revisar' });

    c.estado = aprobado ? 'aprobado' : 'rechazado';
    c.observacionGerencia = observacion;
    c.validadoPor = req.user.id;
    c.validadoPorNombre = req.user.nombre;
    c.validadoAt = new Date();
    c.historial.push({
      accion: aprobado ? 'aprobado' : 'rechazado',
      usuarioId: req.user.id,
      usuarioNombre: req.user.nombre,
      detalle: observacion || undefined,
    });

    await reunion.save();
    res.json(serializarCompromiso(c.toObject(), { ...reunion.toObject(), localId: reunion.localId }));
  } catch (error) {
    manejarError(res, error, 'validar evidencia');
  }
});

module.exports = router;
