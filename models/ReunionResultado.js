const mongoose = require('mongoose');

const SECCIONES = ['servicio_cliente', 'finanzas', 'operaciones'];
const ESTADOS_COMPROMISO = ['pendiente', 'en_revision', 'aprobado', 'rechazado'];

const evidenciaSchema = new mongoose.Schema({
  url: { type: String, required: true },
  nombre: { type: String },
  tipo: { type: String, enum: ['imagen', 'pdf'], default: 'imagen' },
  subidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  subidoPorNombre: { type: String },
  fecha: { type: Date, default: Date.now },
  // Envío al que pertenece (1 = primer envío, 2 = reenvío tras rechazo, etc.)
  envio: { type: Number, default: 1 },
}, { _id: true });

const historialSchema = new mongoose.Schema({
  accion: { type: String, enum: ['creado', 'evidencia_enviada', 'aprobado', 'rechazado', 'editado'], required: true },
  usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  usuarioNombre: { type: String },
  detalle: { type: String },
  fecha: { type: Date, default: Date.now },
}, { _id: false });

const compromisoSchema = new mongoose.Schema({
  seccion: { type: String, enum: SECCIONES, required: true },
  orden: { type: Number, default: 0 },
  descripcion: { type: String, required: true, trim: true },
  fechaLimite: { type: Date, required: true },
  estado: { type: String, enum: ESTADOS_COMPROMISO, default: 'pendiente' },

  // Evidencia (Administrador)
  evidencias: [evidenciaSchema],
  comentarioAdmin: { type: String },
  enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  enviadoPorNombre: { type: String },
  enviadoAt: { type: Date },
  envios: { type: Number, default: 0 },

  // Validación (Gerencia / Master)
  observacionGerencia: { type: String },
  validadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  validadoPorNombre: { type: String },
  validadoAt: { type: Date },

  historial: [historialSchema],
}, { _id: true, timestamps: true });

const reunionResultadoSchema = new mongoose.Schema({
  numero: { type: Number, required: true, unique: true },
  folio: { type: String, required: true, unique: true }, // RR-0001
  localId: { type: mongoose.Schema.Types.ObjectId, ref: 'Local', required: true, index: true },
  fecha: { type: Date, default: Date.now },
  estado: { type: String, enum: ['borrador', 'finalizada'], default: 'borrador', index: true },

  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  creadoPorNombre: { type: String },
  finalizadaAt: { type: Date },

  compromisos: [compromisoSchema],
}, { timestamps: true });

reunionResultadoSchema.index({ 'compromisos.estado': 1 });

reunionResultadoSchema.statics.SECCIONES = SECCIONES;
reunionResultadoSchema.statics.ESTADOS_COMPROMISO = ESTADOS_COMPROMISO;

module.exports = mongoose.model('ReunionResultado', reunionResultadoSchema);
