// backend/models/Revision.js
const mongoose = require('mongoose');

const revisionSchema = new mongoose.Schema({
  fechaRevision: { type: Date, default: Date.now },
  localId: { type: mongoose.Schema.Types.ObjectId, ref: 'Local', required: true },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: false }, // ← Cambiado a false
  supervisorNombre: { type: String, default: '' },
  localNombre: { type: String, default: '' },
  administrador: {
    nombre: { type: String, default: '' },
    presente: { type: Boolean, default: false }
  },
  subAdministrador: {
    nombre: { type: String, default: '' },
    presente: { type: Boolean, default: false }
  },
  borranReclamos: { type: String, default: '' },
  servicioCliente: {
    respuestas: { type: Object, default: {} },
    reclamos: { type: Array, default: [] },
    observacionesPrincipales: { type: String, default: '' },
    derivacionLaury: { type: String, default: '' }
  },
  cuartoFrio: {
    respuestas: { type: Object, default: {} }
  },
  cuartoCaliente: {
    respuestas: { type: Object, default: {} }
  },
  porcentajeTotal: { type: Number, default: 0 },
  categoria: { type: String, default: '' },
  comentariosGenerales: { type: String, default: '' },
  esBorrador: { type: Boolean, default: false },
  fotosUrls: [{ type: String, default: [] }],
  // Auditoría
  creadoPor: { type: String, default: '' },
  creadoPorId: { type: String, default: '' },
  creadoEn: { type: Date, default: Date.now },
  modificadoPor: { type: String, default: '' },
  modificadoPorId: { type: String, default: '' },
  modificadoEn: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Revision', revisionSchema);