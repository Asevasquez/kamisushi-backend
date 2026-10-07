// backend/models/Compromiso.js
//
// Un compromiso acordado durante una revisión (máx. 3 por sección: Servicio
// al Cliente y Cocina). Vive en su propia colección — y no dentro de
// Revision — para que su seguimiento (evidencias, validaciones, historial)
// sea independiente de la revisión y se pueda consultar/agregar por local,
// administrador o supervisora sin cargar revisiones completas.
//
// "visible" es false mientras la revisión sigue como borrador: así los
// compromisos que se van guardando con el autoguardado no aparecen en los
// dashboards hasta que la revisión se finaliza.
const mongoose = require('mongoose');

const evidenciaSchema = new mongoose.Schema({
  usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  usuarioNombre: { type: String, default: '' },
  comentario: { type: String, default: '' },
  fotos: { type: [String], default: [] },
  fecha: { type: Date, default: Date.now },
});

const historialSchema = new mongoose.Schema({
  accion: {
    type: String,
    enum: ['acordado', 'evidencia_enviada', 'correccion_solicitada', 'aprobado'],
    required: true,
  },
  usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  usuarioNombre: { type: String, default: '' },
  comentario: { type: String, default: '' },
  fecha: { type: Date, default: Date.now },
  // Solo en 'aprobado' y 'correccion_solicitada': días que tardó la
  // supervisora en revisar desde que llegó la evidencia.
  diasValidacion: { type: Number },
});

const compromisoSchema = new mongoose.Schema({
  revisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Revision', required: true, index: true },
  // Id generado por la app al crear el compromiso: hace idempotente la
  // sincronización (reintentos, cola offline) sin duplicar compromisos.
  clientId: { type: String, required: true },

  // Datos de la revisión, copiados para no depender de un populate
  localId: { type: mongoose.Schema.Types.ObjectId, ref: 'Local', required: true },
  localNombre: { type: String, default: '' },
  fechaRevision: { type: Date },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  supervisorNombre: { type: String, default: '' },

  seccion: { type: String, enum: ['servicioCliente', 'cocina'], required: true },
  texto: { type: String, required: true, maxlength: 200 },
  // Texto libre: quien escribe el compromiso indica el nombre de la persona que lo toma.
  responsableNombre: { type: String, required: true, trim: true, maxlength: 80 },
  // Se guarda al mediodía UTC de la fecha elegida, para que el día calendario
  // no se corra por zona horaria.
  fechaLimite: { type: Date, required: true },

  // 'vencido' no se guarda: se calcula (abierto + fecha límite ya pasada).
  estado: { type: String, enum: ['abierto', 'en_revision', 'cerrado'], default: 'abierto' },
  visible: { type: Boolean, default: false },

  evidencias: { type: [evidenciaSchema], default: [] },
  evidenciasCount: { type: Number, default: 0 },
  historial: { type: [historialSchema], default: [] },
  correcciones: { type: Number, default: 0 },

  fechaCierre: { type: Date },
  // true si la evidencia que se aprobó llegó dentro del plazo. No castiga al
  // administrador por lo que tarde la supervisora en validar.
  cerradoATiempo: { type: Boolean },
}, { timestamps: true });

compromisoSchema.index({ revisionId: 1, clientId: 1 }, { unique: true });
compromisoSchema.index({ localId: 1, visible: 1, estado: 1, fechaLimite: 1 });
compromisoSchema.index({ supervisorId: 1, visible: 1 });
compromisoSchema.index({ fechaRevision: -1 });

module.exports = mongoose.model('Compromiso', compromisoSchema);
