const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Mentoria = require('../models/Mentoria');
const Local = require('../models/Local');
const { verifyToken } = require('../middleware/auth');
const { procesarFotosEnObjeto } = require('./upload');
const { generarPdfMentoria } = require('../utils/pdfMentoria');
const {
  PREGUNTAS_MENTORIA,
  PUNTAJE_MAX_PREGUNTA,
  PUNTAJE_MAX_TOTAL,
  UMBRAL_PLAN_ACCION,
  obtenerCategoria,
  preguntaPorNumero,
} = require('../config/mentoriaPreguntas');

// ────────────────────────────────────────────────────────────
// Acceso
//  - mentor:         crea mentorías y ve / hace seguimiento de LAS SUYAS
//  - gerencia/master: ven todo (incluida la ubicación)
//  - administrador:  solo ve informes finalizados y compromisos de sus locales asignados
// ────────────────────────────────────────────────────────────
const ROLES_GLOBALES = ['gerencia', 'master'];
const ROLES_CREAN = ['mentor', ...ROLES_GLOBALES];
const ROLES_MODULO = [...ROLES_CREAN, 'administrador'];

// Las observaciones "sin filtro" (SAC, Cocina, Liderazgo) son internas: el
// administrador no las ve ni en la API ni en su PDF. Finanzas sí la ve.
const OCULTAR_SIN_FILTRO_A_ADMINISTRADOR = true;

function soloRoles(roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}

router.use(verifyToken, soloRoles(ROLES_MODULO));

const esGlobal = (user) => ROLES_GLOBALES.includes(user.rol);
const idUsuario = (user) => String(user.id || user._id);
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const idsLocalesAsignados = (user) => (user.localesAsignados || []).map((l) => String(l._id || l));

// Filtro base según quién pregunta
function filtroAlcance(user) {
  if (esGlobal(user)) return {};
  if (user.rol === 'mentor') return { mentorId: oid(idUsuario(user)) };
  // administrador
  return { localId: { $in: idsLocalesAsignados(user).map(oid) }, esBorrador: false };
}

function puedeVer(user, m) {
  if (esGlobal(user)) return true;
  if (user.rol === 'mentor') return String(m.mentorId) === idUsuario(user);
  if (user.rol === 'administrador') return !m.esBorrador && idsLocalesAsignados(user).includes(String(m.localId));
  return false;
}

const esDuenoOGlobal = (user, m) => esGlobal(user) || String(m.mentorId) === idUsuario(user);

// Quita lo que el rol no debe ver
function paraUsuario(m, user) {
  const o = typeof m.toObject === 'function' ? m.toObject() : { ...m };
  if (!esGlobal(user)) delete o.geolocalizacion;
  if (user.rol === 'administrador' && OCULTAR_SIN_FILTRO_A_ADMINISTRADOR && o.observaciones) {
    o.observaciones = { finanzas: o.observaciones.finanzas || '' };
  }
  return o;
}

function camposOcultosEnListado(user) {
  const ocultos = [];
  if (!esGlobal(user)) ocultos.push('-geolocalizacion');
  if (user.rol === 'administrador' && OCULTAR_SIN_FILTRO_A_ADMINISTRADOR) {
    ocultos.push('-observaciones.sac', '-observaciones.cocina', '-observaciones.liderazgo');
  }
  return ocultos.join(' ');
}

// ────────────────────────────────────────────────────────────
// Puntajes y validaciones
// ────────────────────────────────────────────────────────────
function limpiarPuntaje(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return null;
  return Math.min(PUNTAJE_MAX_PREGUNTA, Math.max(0, n));
}

// Normaliza lo que manda la app: una entrada por número de pregunta (1..10),
// puntaje entero 0-10, y plan solo si el puntaje queda bajo el umbral.
function normalizarPreguntas(entrada) {
  const porNumero = new Map();
  (Array.isArray(entrada) ? entrada : []).forEach((p) => {
    const def = preguntaPorNumero(p && p.numero);
    if (!def) return;
    const puntaje = limpiarPuntaje(p.puntaje);
    const requierePlan = puntaje !== null && puntaje < UMBRAL_PLAN_ACCION;
    const plan = p.plan || {};
    porNumero.set(def.numero, {
      numero: def.numero,
      puntaje,
      comentario: String(p.comentario || '').trim(),
      plan: requierePlan
        ? {
            sugerenciaSeleccionada: [1, 2].includes(Number(plan.sugerenciaSeleccionada)) ? Number(plan.sugerenciaSeleccionada) : null,
            deficiencia: String(plan.deficiencia || '').trim(),
            accionMentor: String(plan.accionMentor || '').trim(),
            compromisoAlumno: String(plan.compromisoAlumno || '').trim(),
            responsable: String(plan.responsable || '').trim(),
            fechaCompromiso: plan.fechaCompromiso ? new Date(plan.fechaCompromiso) : null,
            evidenciaRequerida: String(plan.evidenciaRequerida || '').trim(),
          }
        : null,
    });
  });
  return [...porNumero.values()].sort((a, b) => a.numero - b.numero);
}

function calcularPuntajes(preguntas) {
  const puntajeTotal = (preguntas || []).reduce((s, p) => s + (Number(p.puntaje) || 0), 0);
  const porcentaje = Math.round((puntajeTotal / PUNTAJE_MAX_TOTAL) * 1000) / 10;
  return { puntajeTotal, porcentaje, categoria: obtenerCategoria(porcentaje) };
}

const CAMPOS_PLAN = [
  ['deficiencia', 'la deficiencia detectada'],
  ['accionMentor', 'la acción del mentor'],
  ['compromisoAlumno', 'el compromiso del alumno'],
  ['responsable', 'el responsable'],
  ['fechaCompromiso', 'la fecha de cumplimiento'],
  ['evidenciaRequerida', 'la evidencia de cumplimiento'],
];

function erroresParaFinalizar(m) {
  const errores = [];
  if (!String(m.alumnoNombre || '').trim()) errores.push('Falta el nombre del alumno (administrador).');
  PREGUNTAS_MENTORIA.forEach((def) => {
    const p = (m.preguntas || []).find((x) => x.numero === def.numero);
    if (!p || p.puntaje === null || p.puntaje === undefined) {
      errores.push(`Pregunta ${def.numero}: falta el puntaje.`);
      return;
    }
    if (p.puntaje < UMBRAL_PLAN_ACCION) {
      CAMPOS_PLAN.forEach(([campo, nombre]) => {
        const v = p.plan && p.plan[campo];
        const vacio = campo === 'fechaCompromiso' ? !v || isNaN(new Date(v)) : !String(v || '').trim();
        if (vacio) errores.push(`Pregunta ${def.numero}: falta ${nombre}.`);
      });
    }
  });
  return errores;
}

function generarCompromisos(m, user) {
  return (m.preguntas || [])
    .filter((p) => p.puntaje !== null && p.puntaje < UMBRAL_PLAN_ACCION && p.plan)
    .map((p) => ({
      preguntaNumero: p.numero,
      ambito: (preguntaPorNumero(p.numero) || {}).ambito || '',
      puntaje: p.puntaje,
      deficiencia: p.plan.deficiencia,
      accionMentor: p.plan.accionMentor,
      compromisoAlumno: p.plan.compromisoAlumno,
      responsable: p.plan.responsable,
      fechaCompromiso: p.plan.fechaCompromiso,
      evidenciaRequerida: p.plan.evidenciaRequerida,
      estado: 'abierto',
      historial: [{ accion: 'creado', usuarioId: oid(idUsuario(user)), usuarioNombre: user.nombre }],
    }));
}

async function siguienteNumeroInforme(fecha) {
  const anio = new Date(fecha || Date.now()).getFullYear();
  const prefijo = `MEN-${anio}-`;
  const ultimo = await Mentoria.findOne({ numeroInforme: { $regex: `^${prefijo}` } })
    .sort({ numeroInforme: -1 })
    .select('numeroInforme')
    .lean();
  const n = ultimo ? parseInt(ultimo.numeroInforme.slice(prefijo.length), 10) + 1 : 1;
  return `${prefijo}${String(n).padStart(4, '0')}`;
}

// Finaliza en memoria (valida, calcula, crea compromisos). Devuelve errores o null.
async function finalizar(m, user) {
  const errores = erroresParaFinalizar(m);
  if (errores.length) return errores;
  Object.assign(m, calcularPuntajes(m.preguntas));
  m.compromisos = generarCompromisos(m, user);
  m.esBorrador = false;
  m.fechaFinalizacion = new Date();
  if (!m.fechaFin) m.fechaFin = new Date();
  if (!m.numeroInforme) m.numeroInforme = await siguienteNumeroInforme(m.fechaMentoria);
  return null;
}

function aplicarCamposEditables(m, body) {
  if (body.alumnoNombre !== undefined) m.alumnoNombre = String(body.alumnoNombre || '').trim();
  if (body.preguntas !== undefined) m.preguntas = normalizarPreguntas(body.preguntas);
  if (body.observaciones) {
    ['sac', 'cocina', 'liderazgo', 'finanzas'].forEach((k) => {
      if (body.observaciones[k] !== undefined) m.observaciones[k] = String(body.observaciones[k] || '');
    });
  }
  if (body.geolocalizacion) {
    if (body.geolocalizacion.inicio) m.geolocalizacion.inicio = body.geolocalizacion.inicio;
    if (body.geolocalizacion.fin) m.geolocalizacion.fin = body.geolocalizacion.fin;
  }
  if (body.fechaFin) m.fechaFin = new Date(body.fechaFin);
}

function rangoFechas(q) {
  // ?mes=2026-10   o   ?desde=2026-10-01&hasta=2026-10-31
  if (q.mes && /^\d{4}-\d{2}$/.test(q.mes)) {
    const [a, mm] = q.mes.split('-').map(Number);
    return { $gte: new Date(a, mm - 1, 1), $lte: new Date(a, mm, 0, 23, 59, 59, 999) };
  }
  const r = {};
  if (q.desde) r.$gte = new Date(`${q.desde}T00:00:00`);
  if (q.hasta) r.$lte = new Date(`${q.hasta}T23:59:59.999`);
  return Object.keys(r).length ? r : null;
}

const validarId = (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Id inválido' });
  next();
};

const finDelDia = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const estaVencido = (c) => c.estado === 'abierto' && c.fechaCompromiso && finDelDia(c.fechaCompromiso) < new Date();

// ════════════════════════════════════════════════════════════
// Rutas fijas (van antes de /:id)
// ════════════════════════════════════════════════════════════

// GET /preguntas — catálogo para la app y el dashboard
router.get('/preguntas', (req, res) => {
  res.json({
    preguntas: PREGUNTAS_MENTORIA,
    puntajeMaxPregunta: PUNTAJE_MAX_PREGUNTA,
    puntajeMaxTotal: PUNTAJE_MAX_TOTAL,
    umbralPlanAccion: UMBRAL_PLAN_ACCION,
  });
});

// GET /resumen — KPIs del dashboard (gerencia/master: todo · mentor: lo suyo)
router.get('/resumen', soloRoles(ROLES_CREAN), async (req, res) => {
  try {
    const query = { ...filtroAlcance(req.user), esBorrador: false };
    const rango = rangoFechas(req.query);
    if (rango) query.fechaMentoria = rango;
    if (req.query.localId && mongoose.isValidObjectId(req.query.localId)) query.localId = oid(req.query.localId);
    if (req.query.mentorId && esGlobal(req.user) && mongoose.isValidObjectId(req.query.mentorId)) query.mentorId = oid(req.query.mentorId);

    const mentorias = await Mentoria.find(query)
      .select('localNombre fechaMentoria mentorNombre porcentaje preguntas compromisos')
      .lean();

    const total = mentorias.length;
    const promedio = total ? Math.round((mentorias.reduce((s, m) => s + (m.porcentaje || 0), 0) / total) * 10) / 10 : 0;

    const sumas = {};
    mentorias.forEach((m) => (m.preguntas || []).forEach((p) => {
      if (p.puntaje === null || p.puntaje === undefined) return;
      sumas[p.numero] = sumas[p.numero] || { suma: 0, n: 0 };
      sumas[p.numero].suma += p.puntaje;
      sumas[p.numero].n += 1;
    }));
    const promedioPorPregunta = PREGUNTAS_MENTORIA.map((d) => ({
      numero: d.numero,
      ambito: d.ambito,
      promedio: sumas[d.numero] ? Math.round((sumas[d.numero].suma / sumas[d.numero].n) * 10) / 10 : null,
    }));

    const compromisos = [];
    mentorias.forEach((m) => (m.compromisos || []).forEach((c) => compromisos.push({
      mentoriaId: m._id,
      localNombre: m.localNombre,
      mentorNombre: m.mentorNombre,
      ...c,
      vencido: estaVencido(c),
    })));

    const abiertos = compromisos.filter((c) => c.estado !== 'cerrado');
    const porVencer = abiertos
      .filter((c) => c.fechaCompromiso)
      .sort((a, b) => new Date(a.fechaCompromiso) - new Date(b.fechaCompromiso))
      .slice(0, 8)
      .map(({ evidencias, historial, ...resto }) => resto);

    res.json({
      totalMentorias: total,
      cumplimientoPromedio: promedio,
      compromisosAbiertos: abiertos.length,
      compromisosVencidos: compromisos.filter((c) => c.vencido).length,
      compromisosEnRevision: compromisos.filter((c) => c.estado === 'en_revision').length,
      promedioPorPregunta,
      porVencer,
    });
  } catch (error) {
    console.error('Error en resumen de mentorías:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /compromisos — lista plana para "Mis compromisos" (admin) y seguimiento (mentor)
// ?estado=abierto|en_revision|cerrado|vencido
router.get('/compromisos', async (req, res) => {
  try {
    const query = { ...filtroAlcance(req.user), esBorrador: false, 'compromisos.0': { $exists: true } };
    if (req.query.localId && mongoose.isValidObjectId(req.query.localId)) {
      // el filtro por local nunca amplía lo que el administrador puede ver
      if (req.user.rol !== 'administrador' || idsLocalesAsignados(req.user).includes(String(req.query.localId))) {
        query.localId = oid(req.query.localId);
      }
    }

    const mentorias = await Mentoria.find(query)
      .select('numeroInforme localId localNombre mentorId mentorNombre alumnoNombre fechaMentoria compromisos')
      .sort({ fechaMentoria: -1 })
      .lean();

    let lista = [];
    mentorias.forEach((m) => (m.compromisos || []).forEach((c) => lista.push({
      mentoriaId: m._id,
      numeroInforme: m.numeroInforme,
      localId: m.localId,
      localNombre: m.localNombre,
      mentorNombre: m.mentorNombre,
      alumnoNombre: m.alumnoNombre,
      fechaMentoria: m.fechaMentoria,
      ...c,
      accionMentorEstado: c.accionMentorEstado || 'pendiente', // documentos anteriores al campo
      vencido: estaVencido(c),
    })));

    const { estado } = req.query;
    // "pendientes": todo lo que todavía requiere algo del administrador o del mentor
    if (estado === 'pendientes') lista = lista.filter((c) => c.estado !== 'cerrado' || c.accionMentorEstado !== 'realizada');
    else if (estado === 'vencido') lista = lista.filter((c) => c.vencido);
    else if (['abierto', 'en_revision', 'cerrado'].includes(estado)) lista = lista.filter((c) => c.estado === estado);

    lista.sort((a, b) => new Date(a.fechaCompromiso || 0) - new Date(b.fechaCompromiso || 0));
    res.json(lista);
  } catch (error) {
    console.error('Error listando compromisos:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET / — listado (dashboard y "Mis mentorías")
router.get('/', async (req, res) => {
  try {
    const { localId, mentorId, categoria, estado, page = 1, limit = 50 } = req.query;
    const query = filtroAlcance(req.user);
    const rango = rangoFechas(req.query);
    if (rango) query.fechaMentoria = rango;
    if (localId && mongoose.isValidObjectId(localId)) {
      if (req.user.rol !== 'administrador' || idsLocalesAsignados(req.user).includes(String(localId))) query.localId = oid(localId);
    }
    if (mentorId && esGlobal(req.user) && mongoose.isValidObjectId(mentorId)) query.mentorId = oid(mentorId);
    if (categoria) query.categoria = { $in: String(categoria).split(',') };
    if (estado === 'borrador' && req.user.rol !== 'administrador') query.esBorrador = true;
    if (estado === 'finalizada') query.esBorrador = false;

    const lim = Math.min(Number(limit) || 50, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * lim;
    const [data, total] = await Promise.all([
      Mentoria.find(query).select(camposOcultosEnListado(req.user)).sort({ fechaMentoria: -1 }).skip(skip).limit(lim).lean(),
      Mentoria.countDocuments(query),
    ]);
    res.json({ data, total });
  } catch (error) {
    console.error('Error listando mentorías:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST / — crear (borrador por defecto; esBorrador:false la finaliza de una vez, útil para la cola offline)
router.post('/', soloRoles(ROLES_CREAN), async (req, res) => {
  try {
    const { localId } = req.body;
    if (!localId || !mongoose.isValidObjectId(localId)) return res.status(400).json({ error: 'Falta el local' });
    const local = await Local.findById(localId).select('nombre');
    if (!local) return res.status(404).json({ error: 'El local no existe' });

    // Reenvío de la cola offline: si ya existe, se devuelve tal cual (sin duplicar)
    const clienteId = req.body.clienteId ? String(req.body.clienteId).slice(0, 80) : undefined;
    if (clienteId) {
      const existente = await Mentoria.findOne({ clienteId });
      if (existente) {
        if (!esDuenoOGlobal(req.user, existente)) return res.status(409).json({ error: 'Identificador de mentoría duplicado' });
        // Upsert del borrador: el guardado automático y la cola offline
        // mandan el mismo clienteId una y otra vez; se actualiza el mismo
        // documento. Una mentoría ya finalizada no se vuelve a tocar.
        if (existente.esBorrador) {
          aplicarCamposEditables(existente, req.body);
          Object.assign(existente, calcularPuntajes(existente.preguntas));
          if (req.body.esBorrador === false) {
            const errores = await finalizar(existente, req.user);
            if (errores) return res.status(400).json({ error: 'La mentoría está incompleta', detalles: errores });
          }
          await existente.save();
        }
        return res.status(200).json(paraUsuario(existente, req.user));
      }
    }

    const m = new Mentoria({
      localId: local._id,
      localNombre: local.nombre,
      mentorId: oid(idUsuario(req.user)),
      mentorNombre: req.user.nombre,
      clienteId,
      fechaMentoria: req.body.fechaMentoria ? new Date(req.body.fechaMentoria) : new Date(),
      esBorrador: true,
    });
    aplicarCamposEditables(m, req.body);
    Object.assign(m, calcularPuntajes(m.preguntas));

    if (req.body.esBorrador === false) {
      const errores = await finalizar(m, req.user);
      if (errores) return res.status(400).json({ error: 'La mentoría está incompleta', detalles: errores });
    }

    await m.save();
    console.log('Mentoría creada:', m._id.toString(), '| Local:', m.localNombre, '| Mentor:', req.user.nombre, '| Borrador:', m.esBorrador);
    res.status(201).json(paraUsuario(m, req.user));
  } catch (error) {
    console.error('Error creando mentoría:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /:id — detalle
router.get('/:id', validarId, async (req, res) => {
  try {
    const m = await Mentoria.findById(req.params.id);
    if (!m || !puedeVer(req.user, m)) return res.status(404).json({ error: 'Mentoría no encontrada' });
    res.json(paraUsuario(m, req.user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /:id — guardar borrador (autoguardado de la app)
router.put('/:id', validarId, soloRoles(ROLES_CREAN), async (req, res) => {
  try {
    const m = await Mentoria.findById(req.params.id);
    if (!m || !esDuenoOGlobal(req.user, m)) return res.status(404).json({ error: 'Mentoría no encontrada' });
    if (!m.esBorrador) return res.status(400).json({ error: 'La mentoría ya fue finalizada y no se puede editar' });

    aplicarCamposEditables(m, req.body);
    Object.assign(m, calcularPuntajes(m.preguntas));
    await m.save();
    res.json(paraUsuario(m, req.user));
  } catch (error) {
    console.error('Error actualizando mentoría:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /:id/finalizar — valida, calcula puntaje y genera los compromisos
router.put('/:id/finalizar', validarId, soloRoles(ROLES_CREAN), async (req, res) => {
  try {
    const m = await Mentoria.findById(req.params.id);
    if (!m || !esDuenoOGlobal(req.user, m)) return res.status(404).json({ error: 'Mentoría no encontrada' });
    if (!m.esBorrador) return res.status(400).json({ error: 'La mentoría ya estaba finalizada' });

    aplicarCamposEditables(m, req.body); // permite mandar los últimos cambios junto con el finalizar
    const errores = await finalizar(m, req.user);
    if (errores) return res.status(400).json({ error: 'La mentoría está incompleta', detalles: errores });

    await m.save();
    console.log('Mentoría finalizada:', m._id.toString(), m.numeroInforme, '|', m.localNombre, '|', m.porcentaje + '%', m.categoria, '| Compromisos:', m.compromisos.length);
    res.json(paraUsuario(m, req.user));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Conflicto al asignar el número de informe, intenta de nuevo' });
    }
    console.error('Error finalizando mentoría:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /:id — solo borradores
router.delete('/:id', validarId, soloRoles(ROLES_CREAN), async (req, res) => {
  try {
    const m = await Mentoria.findById(req.params.id);
    if (!m || !esDuenoOGlobal(req.user, m)) return res.status(404).json({ error: 'Mentoría no encontrada' });
    if (!m.esBorrador) return res.status(400).json({ error: 'Solo se pueden eliminar borradores' });
    await m.deleteOne();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /:id/compromisos/:compromisoId/evidencia — el administrador sube su evidencia
// body: { comentario, fotos: [base64 | url] }
router.post('/:id/compromisos/:compromisoId/evidencia', validarId, async (req, res) => {
  try {
    const m = await Mentoria.findById(req.params.id);
    const puedeSubir = m && !m.esBorrador && (
      esGlobal(req.user) ||
      (req.user.rol === 'administrador' && idsLocalesAsignados(req.user).includes(String(m.localId)))
    );
    if (!puedeSubir) return res.status(404).json({ error: 'Compromiso no encontrado' });

    const c = m.compromisos.id(req.params.compromisoId);
    if (!c) return res.status(404).json({ error: 'Compromiso no encontrado' });
    if (c.estado !== 'abierto') {
      return res.status(400).json({ error: c.estado === 'cerrado' ? 'El compromiso ya está cerrado' : 'La evidencia ya fue enviada y está en revisión' });
    }

    const body = procesarFotosEnObjeto(req.body || {});
    const comentario = String(body.comentario || '').trim();
    const fotos = (Array.isArray(body.fotos) ? body.fotos : []).filter(Boolean);
    if (!comentario && !fotos.length) return res.status(400).json({ error: 'Agrega al menos una foto o un comentario' });

    const usuario = { usuarioId: oid(idUsuario(req.user)), usuarioNombre: req.user.nombre };
    c.evidencias.push({ ...usuario, comentario, fotos });
    c.historial.push({ ...usuario, accion: 'evidencia_enviada', comentario });
    c.estado = 'en_revision';

    await m.save();
    console.log('Evidencia enviada:', m._id.toString(), '| Compromiso:', c._id.toString(), '| Por:', req.user.nombre);
    res.json(c);
  } catch (error) {
    console.error('Error enviando evidencia:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /:id/compromisos/:compromisoId/revisar — el mentor aprueba o pide corrección
// body: { decision: 'aprobar' | 'corregir', comentario }
router.put('/:id/compromisos/:compromisoId/revisar', validarId, soloRoles(ROLES_CREAN), async (req, res) => {
  try {
    const m = await Mentoria.findById(req.params.id);
    if (!m || m.esBorrador || !esDuenoOGlobal(req.user, m)) return res.status(404).json({ error: 'Compromiso no encontrado' });

    const c = m.compromisos.id(req.params.compromisoId);
    if (!c) return res.status(404).json({ error: 'Compromiso no encontrado' });
    if (c.estado !== 'en_revision') return res.status(400).json({ error: 'El compromiso no tiene evidencia pendiente de revisión' });

    const { decision } = req.body || {};
    const comentario = String((req.body || {}).comentario || '').trim();
    if (!['aprobar', 'corregir'].includes(decision)) return res.status(400).json({ error: 'Decisión inválida' });
    if (decision === 'corregir' && !comentario) return res.status(400).json({ error: 'Indica qué debe corregir el administrador' });

    const usuario = { usuarioId: oid(idUsuario(req.user)), usuarioNombre: req.user.nombre };
    if (decision === 'aprobar') {
      c.estado = 'cerrado';
      c.fechaCierre = new Date();
      c.historial.push({ ...usuario, accion: 'aprobado', comentario });
    } else {
      c.estado = 'abierto';
      c.historial.push({ ...usuario, accion: 'correccion_solicitada', comentario });
    }

    await m.save();
    res.json(c);
  } catch (error) {
    console.error('Error revisando compromiso:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /:id/compromisos/:compromisoId/accion-mentor — el mentor marca su tarea como realizada
// body: { comentario }   (también sirve para desmarcarla con { realizada: false })
router.put('/:id/compromisos/:compromisoId/accion-mentor', validarId, soloRoles(ROLES_CREAN), async (req, res) => {
  try {
    const m = await Mentoria.findById(req.params.id);
    if (!m || m.esBorrador || !esDuenoOGlobal(req.user, m)) return res.status(404).json({ error: 'Compromiso no encontrado' });
    const c = m.compromisos.id(req.params.compromisoId);
    if (!c) return res.status(404).json({ error: 'Compromiso no encontrado' });

    const realizada = (req.body || {}).realizada !== false;
    const comentario = String((req.body || {}).comentario || '').trim();
    const yaRealizada = c.accionMentorEstado === 'realizada';

    if (realizada) {
      c.accionMentorEstado = 'realizada';
      c.accionMentorRealizadaEn = new Date();
      c.accionMentorComentario = comentario;
      if (!yaRealizada) {
        c.historial.push({ usuarioId: oid(idUsuario(req.user)), usuarioNombre: req.user.nombre, accion: 'accion_mentor_realizada', comentario });
      }
    } else {
      c.accionMentorEstado = 'pendiente';
      c.accionMentorRealizadaEn = null;
    }
    await m.save();
    res.json(c);
  } catch (error) {
    console.error('Error actualizando tarea del mentor:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /:id/pdf — informe (solo mentorías finalizadas)
router.get('/:id/pdf', validarId, async (req, res) => {
  try {
    const m = await Mentoria.findById(req.params.id).lean();
    if (!m || !puedeVer(req.user, m)) return res.status(404).json({ error: 'Mentoría no encontrada' });
    if (m.esBorrador) return res.status(400).json({ error: 'El informe se genera al finalizar la mentoría' });

    const nombre = `Mentoria_${(m.localNombre || 'local').replace(/[^A-Za-z0-9]+/g, '_')}_${m.numeroInforme || m._id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    generarPdfMentoria(m, res, {
      ocultarObservacionesSinFiltro: req.user.rol === 'administrador' && OCULTAR_SIN_FILTRO_A_ADMINISTRADOR,
    });
  } catch (error) {
    console.error('Error generando PDF de mentoría:', error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

module.exports = router;
