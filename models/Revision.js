const mongoose = require('mongoose');

const coordenadaSchema = {
  latitude:  { type: Number, default: null },
  longitude: { type: Number, default: null },
  accuracy:  { type: Number, default: null },
  timestamp: { type: Date,   default: null },
};

const revisionSchema = new mongoose.Schema({
  fechaRevision:    { type: Date,    default: Date.now, index: true },
  localId:          { type: String,  required: true,    index: true },
  supervisorId:     { type: String,  required: true,    index: true },
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

// Índices compuestos — los más usados en queries
revisionSchema.index({ localId: 1, fechaRevision: -1 });       // revisiones por local ordenadas por fecha
revisionSchema.index({ supervisorId: 1, fechaRevision: -1 });  // revisiones por supervisor
revisionSchema.index({ esBorrador: 1, supervisorId: 1 });      // borradores por supervisor
revisionSchema.index({ fechaRevision: -1, esBorrador: 1 });    // listado general por fecha

module.exports = mongoose.model('Revision', revisionSchema);
