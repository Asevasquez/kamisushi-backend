// backend/utils/compromisosHelper.js
//
// Lógica compartida de Compromisos: validación y sincronización desde las
// rutas de revisiones, estado visible, y los cálculos de cumplimiento del
// dashboard (funciones puras, fáciles de probar).
const mongoose = require('mongoose');
const Compromiso = require('../models/Compromiso');
const Local = require('../models/Local');

const SECCIONES = ['servicioCliente', 'cocina'];
const SECCION_LABEL = { servicioCliente: 'Servicio al Cliente', cocina: 'Cocina' };
const MAX_POR_SECCION = 3;
const MAX_TEXTO = 200;
const MAX_RESPONSABLE = 80;
const META_CUMPLIMIENTO = 80;   // % a tiempo: Bueno >= 80
const UMBRAL_REGULAR = 60;      // Regular 60-79, Crítico < 60
const TZ = 'America/Santiago';
const DIA_MS = 24 * 60 * 60 * 1000;

// ─── Fechas (todo en calendario de Chile) ────────────────────────────────
function fechaChileStr(d = new Date()) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
}
function strAFecha(str) { return new Date(`${str}T12:00:00.000Z`); }
function fechaAStr(d) { return new Date(d).toISOString().slice(0, 10); }
function hoyReferencia() { return strAFecha(fechaChileStr()); }
function esFechaValida(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = strAFecha(str);
  return !isNaN(d.getTime()) && fechaAStr(d) === str;
}
// Acepta 'YYYY-MM-DD' (lo que manda la app) o una fecha ISO con hora.
function normalizarFechaEntrada(v) {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return esFechaValida(v) ? v : null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return fechaChileStr(d);
}
function diasEntre(strA, strB) { // B - A en días
  return Math.round((strAFecha(strB) - strAFecha(strA)) / DIA_MS);
}
const redondear1 = (n) => Math.round(n * 10) / 10;

// ─── Estado visible ──────────────────────────────────────────────────────
// 'vencido' = sigue abierto (sin evidencia enviada) y la fecha límite ya pasó.
function estadoVisible(c, hoyStr = fechaChileStr()) {
  if (c.estado === 'cerrado') return 'cerrado';
  if (c.estado === 'en_revision') return 'en_revision';
  return fechaAStr(c.fechaLimite) < hoyStr ? 'vencido' : 'abierto';
}
function diasRestantes(c, hoyStr = fechaChileStr()) {
  return diasEntre(hoyStr, fechaAStr(c.fechaLimite)); // negativo = vencido
}
function evaluar(pct) {
  if (pct === null || pct === undefined) return 'Sin datos';
  if (pct >= META_CUMPLIMIENTO) return 'Bueno';
  if (pct >= UMBRAL_REGULAR) return 'Regular';
  return 'Crítico';
}

// Un compromiso se puede editar/eliminar mientras no tenga seguimiento.
function esEditable(c) {
  return c.estado === 'abierto'
    && (c.evidenciasCount || 0) === 0
    && !(c.historial || []).some((h) => h.accion !== 'acordado');
}

// ─── Validación del payload que manda la app ─────────────────────────────
// items: [{ clientId, seccion, texto, responsableNombre, fechaLimite }]
// Devuelve { ok:true, items:[normalizados] } o { ok:false, error }.
async function validarCompromisos(items, { localId, fechaRevision } = {}) {
  if (!Array.isArray(items)) return { ok: false, error: 'Los compromisos deben enviarse como una lista' };

  const porSeccion = { servicioCliente: 0, cocina: 0 };
  const fechaRevStr = normalizarFechaEntrada(fechaRevision) || fechaChileStr();
  const normalizados = [];
  const vistos = new Set();

  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const nombre = `Compromiso ${i + 1}`;

    if (!SECCIONES.includes(it.seccion)) return { ok: false, error: `${nombre}: sección inválida` };
    porSeccion[it.seccion]++;
    if (porSeccion[it.seccion] > MAX_POR_SECCION) {
      return { ok: false, error: `Máximo ${MAX_POR_SECCION} compromisos en ${SECCION_LABEL[it.seccion]}` };
    }

    const texto = String(it.texto || '').trim();
    if (!texto) return { ok: false, error: `${nombre}: escribe qué se va a hacer` };
    if (texto.length > MAX_TEXTO) return { ok: false, error: `${nombre}: máximo ${MAX_TEXTO} caracteres` };

    // El responsable es el nombre que escribió la supervisora (texto libre).
    const responsableNombre = String(it.responsableNombre || '').trim().replace(/\s+/g, ' ');
    if (!responsableNombre) return { ok: false, error: `${nombre}: escribe quién toma el compromiso` };
    if (responsableNombre.length > MAX_RESPONSABLE) return { ok: false, error: `${nombre}: el nombre del responsable admite máximo ${MAX_RESPONSABLE} caracteres` };

    const fl = normalizarFechaEntrada(it.fechaLimite);
    if (!fl) return { ok: false, error: `${nombre}: indica la fecha límite` };
    if (fl <= fechaRevStr) return { ok: false, error: `${nombre}: la fecha límite debe ser posterior a la fecha de la revisión` };

    const clientId = String(it.clientId || '').trim() || new mongoose.Types.ObjectId().toString();
    if (vistos.has(clientId)) return { ok: false, error: `${nombre}: está repetido` };
    vistos.add(clientId);

    normalizados.push({ clientId, seccion: it.seccion, texto, responsableNombre, fechaLimite: fl });
  }

  if (normalizados.length > 0) {
    if (!mongoose.isValidObjectId(localId)) return { ok: false, error: 'Falta el local de la revisión' };
  }
  return { ok: true, items: normalizados };
}

// ─── Sincronización con la colección ─────────────────────────────────────
async function datosBase(revision) {
  const local = await Local.findById(revision.localId).select('nombre').lean();
  return {
    localId: revision.localId,
    localNombre: local?.nombre || '',
    fechaRevision: revision.fechaRevision,
    supervisorId: revision.supervisorId,
    supervisorNombre: revision.supervisorNombre || '',
  };
}

// Deja en la base exactamente los compromisos de la revisión. Los que ya
// tienen seguimiento (evidencia, corrección, cierre) no se modifican ni se
// eliminan: lo acordado no puede cambiar una vez que hay trabajo encima.
async function sincronizarCompromisos({ revision, items, finalizada }) {
  const revisionId = revision._id;
  const base = await datosBase(revision);
  const existentes = await Compromiso.find({ revisionId });
  const porClient = new Map(existentes.map((c) => [c.clientId, c]));
  const recibidos = new Set();

  for (const it of items) {
    recibidos.add(it.clientId);
    const ex = porClient.get(it.clientId);
    const datos = {
      ...base,
      seccion: it.seccion,
      texto: it.texto,
      responsableNombre: it.responsableNombre,
      fechaLimite: strAFecha(it.fechaLimite),
    };
    if (!ex) {
      await Compromiso.create({
        ...datos,
        revisionId,
        clientId: it.clientId,
        visible: !!finalizada,
        historial: [{ accion: 'acordado', usuarioId: revision.supervisorId, usuarioNombre: revision.supervisorNombre || '' }],
      });
    } else if (esEditable(ex)) {
      Object.assign(ex, datos);
      if (finalizada) ex.visible = true;
      await ex.save();
    } else {
      Object.assign(ex, base);
      if (finalizada) ex.visible = true;
      await ex.save();
    }
  }

  for (const ex of existentes) {
    if (!recibidos.has(ex.clientId) && esEditable(ex)) await ex.deleteOne();
  }
  if (finalizada) await publicarCompromisos(revision);
}

// Al finalizar la revisión, sus compromisos pasan a verse en los dashboards.
async function publicarCompromisos(revision) {
  const base = await datosBase(revision);
  await Compromiso.updateMany({ revisionId: revision._id }, { $set: { visible: true, ...base } });
}

// Para GET /revisiones/:id — lo que necesita la app para editar y el
// dashboard para mostrar el resumen dentro del detalle de la revisión.
async function listarCompromisosDeRevision(revisionId) {
  const docs = await Compromiso.find({ revisionId }).select('-evidencias -historial').sort({ seccion: 1, createdAt: 1 }).lean();
  const hoy = fechaChileStr();
  return docs.map((c) => ({
    _id: c._id,
    clientId: c.clientId,
    seccion: c.seccion,
    texto: c.texto,
    responsableNombre: c.responsableNombre,
    fechaLimite: fechaAStr(c.fechaLimite),
    estado: c.estado,
    estadoVisible: estadoVisible(c, hoy),
    evidenciasCount: c.evidenciasCount || 0,
    // Sin evidencia ni correcciones ni cierre: solo tiene el 'acordado' inicial.
    editable: c.estado === 'abierto' && (c.evidenciasCount || 0) === 0 && (c.correcciones || 0) === 0,
  }));
}

// ─── Cálculo de cumplimiento (puro) ──────────────────────────────────────
function acumular(lista, hoyStr) {
  let abiertos = 0, vencidos = 0, enRevision = 0, cerrados = 0, cerradosATiempo = 0;
  let sumCierre = 0, nCierre = 0, sumVal = 0, nVal = 0, conEvidencia = 0, conCorreccion = 0;

  for (const c of lista) {
    const ev = estadoVisible(c, hoyStr);
    if (ev === 'abierto') abiertos++;
    else if (ev === 'vencido') vencidos++;
    else if (ev === 'en_revision') enRevision++;
    else {
      cerrados++;
      if (c.cerradoATiempo) cerradosATiempo++;
      if (c.fechaCierre && c.fechaRevision) {
        sumCierre += (new Date(c.fechaCierre) - new Date(c.fechaRevision)) / DIA_MS;
        nCierre++;
      }
    }
    for (const h of c.historial || []) {
      if ((h.accion === 'aprobado' || h.accion === 'correccion_solicitada') && typeof h.diasValidacion === 'number') {
        sumVal += h.diasValidacion;
        nVal++;
      }
    }
    if ((c.evidenciasCount || 0) > 0) {
      conEvidencia++;
      if ((c.correcciones || 0) > 0) conCorreccion++;
    }
  }

  // Cumplimiento a tiempo = cerrados dentro de plazo / (cerrados + vencidos).
  // Lo que sigue abierto dentro de plazo o en revisión aún no cuenta.
  const base = cerrados + vencidos;
  const pct = base ? Math.round((cerradosATiempo / base) * 100) : null;
  return {
    asumidos: lista.length, abiertos, vencidos, enRevision, cerrados, cerradosATiempo, base,
    pctATiempo: pct,
    evaluacion: evaluar(pct),
    cierrePromedioDias: nCierre ? redondear1(sumCierre / nCierre) : null,
    validacionPromedioDias: nVal ? redondear1(sumVal / nVal) : null,
    pctConCorreccion: conEvidencia ? Math.round((conCorreccion / conEvidencia) * 100) : null,
  };
}

function mesesRango(hoyStr, n) {
  const [y, m] = hoyStr.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  return out;
}

function agrupar(lista, claveFn) {
  const mapa = new Map();
  for (const c of lista) {
    const k = claveFn(c);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(c);
  }
  return mapa;
}

// Menor cumplimiento primero; sin datos al final; a igual cumplimiento, más vencidos primero.
function ordenarPeorPrimero(a, b) {
  const pa = a.pctATiempo === null ? 999 : a.pctATiempo;
  const pb = b.pctATiempo === null ? 999 : b.pctATiempo;
  return pa - pb || b.vencidos - a.vencidos;
}

// administradores: [{ administradorId, nombre, esMentor, localesIds }] — el ranking de
// administradores se calcula por los locales que administra cada uno (el
// responsable de cada compromiso es texto libre y no sirve para agrupar).
function calcularResumen(docs, { hoyStr = fechaChileStr(), meses = 6, global = false, top = 10, administradores = [] } = {}) {
  const total = acumular(docs, hoyStr);

  const claves = mesesRango(hoyStr, meses);
  const porMes = agrupar(docs, (c) => fechaChileStr(c.fechaRevision).slice(0, 7));
  const serie = claves.map((mes) => {
    const a = acumular(porMes.get(mes) || [], hoyStr);
    return { mes, asumidos: a.asumidos, cerradosATiempo: a.cerradosATiempo, pctATiempo: a.pctATiempo, evaluacion: a.evaluacion };
  });
  const ult = serie[serie.length - 1];
  const pen = serie[serie.length - 2];

  const porSeccion = SECCIONES.map((s) => {
    const a = acumular(docs.filter((c) => c.seccion === s), hoyStr);
    return { seccion: s, label: SECCION_LABEL[s], asumidos: a.asumidos, pctATiempo: a.pctATiempo, evaluacion: a.evaluacion };
  });

  const locales = [...agrupar(docs, (c) => String(c.localId)).entries()].map(([id, lista]) => ({
    localId: id, localNombre: lista[0].localNombre,
    responsables: [...new Set(lista.map((c) => c.responsableNombre).filter(Boolean))],
    ...acumular(lista, hoyStr),
  })).sort(ordenarPeorPrimero);

  const resumen = {
    totales: {
      asumidos: total.asumidos, abiertos: total.abiertos, enRevision: total.enRevision,
      vencidos: total.vencidos, cerrados: total.cerrados,
    },
    pctATiempo: total.pctATiempo,
    evaluacion: total.evaluacion,
    metaCumplimiento: META_CUMPLIMIENTO,
    cierrePromedioDias: total.cierrePromedioDias,
    validacionPromedioDias: total.validacionPromedioDias,
    pctConCorreccion: total.pctConCorreccion,
    pctVencidos: total.asumidos ? Math.round((total.vencidos / total.asumidos) * 100) : 0,
    deltaAsumidos: pen ? ult.asumidos - pen.asumidos : null,
    deltaPuntosATiempo: (pen && ult.pctATiempo !== null && pen.pctATiempo !== null) ? ult.pctATiempo - pen.pctATiempo : null,
    serie,
    porSeccion,
    totalLocales: locales.length,
    locales: locales.slice(0, top),
  };

  if (global) {
    resumen.administradores = administradores.map((adm) => {
      const propios = new Set((adm.localesIds || []).map(String));
      const lista = docs.filter((c) => propios.has(String(c.localId)));
      return {
        administradorId: String(adm.administradorId),
        nombre: adm.nombre,
        esMentor: !!adm.esMentor,
        localesConCompromisos: new Set(lista.map((c) => String(c.localId))).size,
        ...acumular(lista, hoyStr),
      };
    }).filter((a) => a.asumidos > 0).sort(ordenarPeorPrimero).slice(0, top);

    resumen.supervisoras = [...agrupar(docs, (c) => String(c.supervisorId)).entries()].map(([id, lista]) => {
      const a = acumular(lista, hoyStr);
      return { supervisorId: id, nombre: lista[0].supervisorNombre, creados: a.asumidos, porRevisar: a.enRevision, validacionPromedioDias: a.validacionPromedioDias };
    }).sort((a, b) => (b.validacionPromedioDias ?? -1) - (a.validacionPromedioDias ?? -1)).slice(0, top);
  }
  return resumen;
}


// ─── Qué puede ver y hacer cada rol ──────────────────────────────────────
const idStr = (l) => String(l && l._id ? l._id : l);
const toOid = (v) => new mongoose.Types.ObjectId(idStr(v));

// Locales que esta persona ADMINISTRA (ids como texto):
//  - administrador: sus locales asignados
//  - mentor: los marcados como "administrados" (sus locales asignados son los
//    que mentorea, igual que en el módulo de Mentorías)
function localesComoAdmin(u) {
  const lista = u.rol === 'mentor' ? u.localesAdministrados : (u.rol === 'administrador' ? u.localesAsignados : []);
  return (lista || []).map(idStr);
}

// propios = locales donde puede subir evidencia · mentoria = solo lectura
function alcanceDeUsuario(rol, u) {
  if (rol === 'mentor') {
    return { propios: (u.localesAdministrados || []).map(toOid), mentoria: (u.localesAsignados || []).map(toOid) };
  }
  return { propios: (u.localesAsignados || []).map(toOid), mentoria: [] };
}

// Filtro de Mongo con lo que esta persona puede VER.
function filtroPorRol({ rol, userId, alcance, alcanceParam, incluirMentoria = false }) {
  const f = { visible: true };
  if (['master', 'gerencia', 'supervisor'].includes(rol)) return f; // la supervisora ve todo; valida solo lo suyo
  if (rol === 'supervisorinterno') {
    f.supervisorId = toOid(userId);
    f.localId = { $in: alcance.propios };
    return f;
  }
  if (rol === 'administrador') { f.localId = { $in: alcance.propios }; return f; }
  if (rol === 'mentor') {
    // En listas y resumen se elige la pestaña; en el detalle basta con cualquiera de las dos.
    const ids = incluirMentoria
      ? [...alcance.propios, ...alcance.mentoria]
      : (alcanceParam === 'mentoria' ? alcance.mentoria : alcance.propios);
    f.localId = { $in: ids };
    return f;
  }
  f.localId = { $in: [] }; // cualquier otro rol: nada
  return f;
}

// Subir evidencia: administrador (o mentor, solo en los locales que administra) y solo si está abierto.
function puedeEnviarEvidencia({ rol, alcance }, c) {
  return ['administrador', 'mentor'].includes(rol)
    && alcance.propios.some((l) => String(l) === String(c.localId))
    && c.estado === 'abierto';
}

// Validar: quien creó la revisión, gerencia o master.
function puedeRevisar({ rol, userId }, c) {
  if (c.estado !== 'en_revision') return false;
  if (['master', 'gerencia'].includes(rol)) return true;
  return ['supervisor', 'supervisorinterno'].includes(rol) && String(c.supervisorId) === String(userId);
}

module.exports = {
  SECCIONES, SECCION_LABEL, MAX_POR_SECCION, MAX_TEXTO, MAX_RESPONSABLE, META_CUMPLIMIENTO, UMBRAL_REGULAR, DIA_MS,
  fechaChileStr, strAFecha, fechaAStr, hoyReferencia, normalizarFechaEntrada, diasEntre, redondear1,
  estadoVisible, diasRestantes, evaluar, esEditable,
  validarCompromisos, sincronizarCompromisos, publicarCompromisos, listarCompromisosDeRevision,
  acumular, mesesRango, calcularResumen,
  idStr, localesComoAdmin, alcanceDeUsuario, filtroPorRol, puedeEnviarEvidencia, puedeRevisar,
};
