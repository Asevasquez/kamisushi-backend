// backend/models/AuditoriaProducto.js
//
// Auditoría de Producto de un local: 75 preguntas en 10 secciones (Sí / No / N/A).
// El resultado (puntaje por sección, %, categoría y plan de acción) lo calcula SIEMPRE el
// servidor con utils/productoChecklist.js; la app solo manda las respuestas.
//
// Los compromisos que se acuerdan al final viven en la colección Compromiso (origen
// 'producto', sección 'producto', máx. 3) y usan el _id de esta auditoría como "revisionId".
const mongoose = require('mongoose');

const respuestaSchema = new mongoose.Schema({
  n: { type: Number, required: true },
  valor: { type: String, enum: ['si', 'no', 'na'], required: true },
  observacion: { type: String, maxlength: 500 },
}, { _id: false });

const seccionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  nombre: { type: String, required: true },
  preguntas: { type: Number, default: 0 },
  si: { type: Number, default: 0 },
  no: { type: Number, default: 0 },
  na: { type: Number, default: 0 },
  // null cuando toda la sección es N/A (no cuenta en el total)
  puntos: { type: Number, default: null },
  porcentaje: { type: Number, default: null },
  categoria: { type: String, default: null },
}, { _id: false });

const auditoriaProductoSchema = new mongoose.Schema({
  // Clave que genera la app por cada auditoría: un envío repetido (doble toque, reintento)
  // devuelve la auditoría ya creada en vez de crear otra.
  clientId: { type: String, maxlength: 80 },

  localId: { type: mongoose.Schema.Types.ObjectId, ref: 'Local', required: true },
  localNombre: { type: String, default: '' },
  fechaAuditoria: { type: Date, required: true },

  auditorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  auditorNombre: { type: String, default: '' },

  respuestas: { type: [respuestaSchema], default: [] },
  observacionesEquipo: { type: String, maxlength: 2000, default: '' },

  secciones: { type: [seccionSchema], default: [] },
  seccionesQueAplican: { type: Number, default: 0 },
  puntosTotal: { type: Number, default: 0 },
  porcentajeTotal: { type: Number, default: 0 },
  categoria: { type: String, required: true },

  // La sección con menor porcentaje (para la lista y el filtro del dashboard)
  seccionMasDebil: {
    id: { type: String },
    nombre: { type: String },
    porcentaje: { type: Number },
  },

  // Copia del plan de acción vigente al finalizar (el historial no cambia si luego se edita el plan)
  planAccion: {
    categoria: { type: String },
    rango: { type: String },
    acciones: { type: [String], default: [] },
  },
}, { timestamps: true });

auditoriaProductoSchema.index(
  { auditorId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);
auditoriaProductoSchema.index({ localId: 1, fechaAuditoria: -1 });
auditoriaProductoSchema.index({ fechaAuditoria: -1 });

module.exports = mongoose.model('AuditoriaProducto', auditoriaProductoSchema);
