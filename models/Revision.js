const mongoose = require('mongoose');

const coordenadaSchema = {
  latitude:  { type: Number, default: null },
  longitude: { type: Number, default: null },
  accuracy:  { type: Number, default: null },
  timestamp: { type: Date,   default: null },
};

const revisionSchema = new mongoose.Schema({
  fechaRevision:    { type: Date,                                    default: Date.now, index: true },
  // ObjectId referenciando al modelo Local — permite populate
  localId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Local',    required: true, index: true },
  // ObjectId referenciando al modelo Usuario
  supervisorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario',  required: true, index: true },
  supervisorNombre: { type: String,  default: '' },
  administrador: {
    nombre:   { type: String,  default: '' },
    presente: { type: Boolean, default: false },
  },
  subAdministrador: {
    nombre:   { type: String,  default: '' },
    presente: { type: Boolean, default: false },
  },
  borranReclamos: { type: String, default: '' },
  servicioCliente: {
    respuestas:               { type: Object, default: {} },
    reclamos:                 { type: Array,  default: [] },
    observacionesPrincipales: { type: String, default: '' },
    derivacionLaury:          { type: String, default: '' },
  },
  cuartoFrio:     { respuestas: { type: Object, default: {} } },
  cuartoCaliente: { respuestas: { type: Object, default: {} } },
  porcentajeTotal:      { type: Number,  default: 0 },
  categoria:            { type: String,  default: '',    index: true },
  comentariosGenerales: { type: String,  default: '' },
  esBorrador:           { type: Boolean, default: false, index: true },

  // Geolocalización
  geolocalizacion: {
    inicio: coordenadaSchema,
    fin:    coordenadaSchema,
  },

  // Auditoría
  creadoPor:       { type: String, default: '' },
  creadoPorId:     { type: String, default: '' },
  creadoEn:        { type: Date,   default: Date.now },
  modificadoPor:   { type: String, default: '' },
  modificadoPorId: { type: String, default: '' },
  modificadoEn:    { type: Date,   default: Date.now },

}, { timestamps: true });

// Índices compuestos
revisionSchema.index({ localId: 1, fechaRevision: -1 });
revisionSchema.index({ supervisorId: 1, fechaRevision: -1 });
revisionSchema.index({ esBorrador: 1, supervisorId: 1 });
revisionSchema.index({ fechaRevision: -1, esBorrador: 1 });

module.exports = mongoose.model('Revision', revisionSchema);
