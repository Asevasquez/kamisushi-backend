const mongoose = require('mongoose');

// Una pregunta con nota de 0 a 10 (a diferencia de Revision, que usa
// cumple/no-cumple). Cada sección tiene exactamente 3 de estas.
const preguntaAuditoriaSchema = new mongoose.Schema({
  id: { type: String, required: true }, // 'SC-A1', 'SC-A2', 'SC-A3', 'COC-A1', 'COC-A2', 'COC-A3'
  puntaje: { type: Number, min: 0, max: 10, required: true },
}, { _id: false });

const reclamoAuditoriaSchema = new mongoose.Schema({
  id: { type: String, required: true },
  tipo: { type: String, required: true },
  telefono: { type: String, default: '' },
  fecha: { type: Date, default: Date.now },
  entregoSolucion: { type: String, default: 'NO' }, // 'Local' | 'Supervisión' | 'SAC' | 'NO'
  montoCompensacion: { type: String, default: '0' },
  comentario: { type: String, default: '' },
  foto: { type: String, default: '' }, // URL ya subida (igual que en Revision)
}, { _id: false });

const auditoriaSchema = new mongoose.Schema({
  // Qué revisión (supervisión previa) se está auditando. ES OPCIONAL: una auditoría
  // también puede hacerse directamente sobre un local, sin supervisión previa.
  // Cuando existe, hay una sola auditoría por revisión (índice único parcial, abajo).
  revisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Revision' },

  // Clave que genera la app para cada auditoría que se llena. Si el mismo envío llega más de una
  // vez (doble toque, reintento por mala señal), se devuelve la auditoría ya creada en vez de
  // crear otra. Hace falta sobre todo en las auditorías SIN supervisión previa, que no tienen
  // otra clave natural (a diferencia de las de una revisión, que son una por revisión).
  clientId: { type: String, maxlength: 80 },

  // Datos de la revisión original, copiados al momento de auditar (para no
  // depender de un populate constante y para que el informe/dashboard no
  // cambien si la revisión original se edita después). Sin supervisión previa,
  // fechaRevision y los datos "originales" quedan vacíos; supervisorNombre es
  // el nombre que escribió el auditor (opcional).
  localId: { type: mongoose.Schema.Types.ObjectId, ref: 'Local', required: true },
  localNombre: { type: String, required: true },
  fechaRevision: { type: Date },
  supervisorNombre: { type: String, default: '' },
  porcentajeRevisionOriginal: { type: Number, default: 0 },
  categoriaRevisionOriginal: { type: String, default: '' },

  // Quién audita y cuándo
  auditorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  auditorNombre: { type: String, required: true },
  fechaAuditoria: { type: Date, default: Date.now },

  // Evaluación — 3 preguntas por sección, cada una 0-10 (máx 30 por sección)
  servicioCliente: {
    preguntas: { type: [preguntaAuditoriaSchema], default: [] },
    observacionSAC: { type: String, default: '' },
  },
  cocina: {
    preguntas: { type: [preguntaAuditoriaSchema], default: [] },
    observacionCocina: { type: String, default: '' },
    observacionSupervision: { type: String, default: '' },
  },

  // Reclamos propios de la auditoría (independientes de los de la revisión)
  reclamos: { type: [reclamoAuditoriaSchema], default: [] },

  // Puntajes calculados — se guardan (no solo se calculan al leer) para que
  // el dashboard pueda filtrar/ordenar por ellos sin tener que recalcular
  // todo cada vez, y para que un cambio futuro en la fórmula no altere
  // auditorías ya finalizadas.
  puntajeServicioCliente: { type: Number, default: 0 }, // suma preguntas SC, menos cantidad de reclamos, piso 0
  puntajeCocina: { type: Number, default: 0 },           // suma preguntas Cocina
  puntajeTotal: { type: Number, default: 0 },             // (SC + Cocina) / 60 * 100
  categoria: { type: String, default: '' },               // mismas categorías que Revision

  esBorrador: { type: Boolean, default: true },
// autoIndex desactivado: el índice de revisionId lo administra asegurarIndiceRevision
// (reemplaza el índice único antiguo por uno parcial; Mongoose no sabe cambiar un índice ya creado).
}, { timestamps: true, autoIndex: false });

const Auditoria = mongoose.model('Auditoria', auditoriaSchema);

// Impide dos auditorías para la misma revisión a nivel de base de datos (evita
// condiciones de carrera), pero solo entre las que tienen supervisión previa:
// las auditorías sin supervisión previa no tienen revisionId y pueden ser muchas.
const { asegurarIndiceRevision, asegurarIndiceClientId } = require('../utils/indicesAuditoria');
const asegurarIndices = async () => {
  await asegurarIndiceRevision(Auditoria.collection);
  await asegurarIndiceClientId(Auditoria.collection);
};
if (mongoose.connection.readyState === 1) asegurarIndices();
else mongoose.connection.once('open', asegurarIndices);

module.exports = Auditoria;
