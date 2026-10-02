const mongoose = require('mongoose');
const { Schema } = mongoose;

// ────────────────────────────────────────────────────────────
// Ubicación de inicio / término de la visita.
// Solo la ven master y gerencia (la ruta la quita para el resto).
// ────────────────────────────────────────────────────────────
const puntoUbicacionSchema = new Schema(
  {
    latitud: Number,
    longitud: Number,
    precision: Number,
    fecha: Date,
  },
  { _id: false }
);

// Plan de acción de una pregunta con puntaje bajo el umbral (7).
const planAccionSchema = new Schema(
  {
    sugerenciaSeleccionada: { type: Number, enum: [1, 2, null], default: null }, // null = acción propia
    deficiencia: { type: String, default: '' },
    accionMentor: { type: String, default: '' },
    compromisoAlumno: { type: String, default: '' },
    responsable: { type: String, default: '' },
    fechaCompromiso: { type: Date, default: null },
    evidenciaRequerida: { type: String, default: '' },
  },
  { _id: false }
);

const preguntaSchema = new Schema(
  {
    numero: { type: Number, required: true, min: 1, max: 10 },
    puntaje: { type: Number, min: 0, max: 10, default: null }, // null = aún sin responder (borrador)
    comentario: { type: String, default: '' },
    plan: { type: planAccionSchema, default: null },
  },
  { _id: false }
);

const historialSchema = new Schema(
  {
    fecha: { type: Date, default: Date.now },
    accion: {
      type: String,
      enum: ['creado', 'evidencia_enviada', 'correccion_solicitada', 'aprobado'],
      required: true,
    },
    usuarioId: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    usuarioNombre: String,
    comentario: { type: String, default: '' },
  },
  { _id: false }
);

const evidenciaSchema = new Schema({
  fecha: { type: Date, default: Date.now },
  usuarioId: { type: Schema.Types.ObjectId, ref: 'Usuario' },
  usuarioNombre: String,
  comentario: { type: String, default: '' },
  fotos: [String],
});

// Un compromiso nace al finalizar la mentoría, uno por cada pregunta bajo
// el umbral. Lleva su propio estado para el seguimiento mentor/administrador.
const compromisoSchema = new Schema({
  preguntaNumero: { type: Number, required: true },
  ambito: String,
  puntaje: Number,
  deficiencia: String,
  accionMentor: String,
  compromisoAlumno: String,
  responsable: String,
  fechaCompromiso: Date,
  evidenciaRequerida: String,
  estado: {
    type: String,
    enum: ['abierto', 'en_revision', 'cerrado'],
    default: 'abierto',
  },
  evidencias: [evidenciaSchema],
  historial: [historialSchema],
  fechaCierre: { type: Date, default: null },
});

const mentoriaSchema = new Schema(
  {
    // MEN-2026-0001, se asigna al finalizar. Sin default a propósito: el índice
    // único es sparse y un null en cada borrador chocaría entre sí.
    numeroInforme: { type: String },

    localId: { type: Schema.Types.ObjectId, ref: 'Local', required: true },
    localNombre: { type: String, default: '' },

    mentorId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    mentorNombre: { type: String, default: '' },

    // Alumno = administrador del local evaluado
    alumnoNombre: { type: String, default: '' },

    fechaMentoria: { type: Date, default: Date.now }, // inicio de la visita
    fechaFin: { type: Date, default: null },

    geolocalizacion: {
      inicio: { type: puntoUbicacionSchema, default: null },
      fin: { type: puntoUbicacionSchema, default: null },
    },

    preguntas: { type: [preguntaSchema], default: [] },

    observaciones: {
      sac: { type: String, default: '' },        // Sin filtro SAC
      cocina: { type: String, default: '' },     // Sin filtro Cocina
      liderazgo: { type: String, default: '' },  // Sin filtro Liderazgo
      finanzas: { type: String, default: '' },
    },

    puntajeTotal: { type: Number, default: 0 },  // sobre 100
    porcentaje: { type: Number, default: 0 },
    categoria: { type: String, default: '' },

    compromisos: { type: [compromisoSchema], default: [] },

    esBorrador: { type: Boolean, default: true },
    fechaFinalizacion: { type: Date, default: null },
  },
  { timestamps: true }
);

mentoriaSchema.index({ localId: 1, fechaMentoria: -1 });
mentoriaSchema.index({ mentorId: 1, fechaMentoria: -1 });
mentoriaSchema.index({ esBorrador: 1, fechaMentoria: -1 });
mentoriaSchema.index({ 'compromisos.estado': 1 });
mentoriaSchema.index({ numeroInforme: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Mentoria', mentoriaSchema);
