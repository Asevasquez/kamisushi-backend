const mongoose = require('mongoose');

// Historial de archivos cargados al módulo Estado de Resultados.
const eerrCargaSchema = new mongoose.Schema({
  archivo: { type: String, required: true },
  tamano: Number,
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  usuarioNombre: String,
  modo: { type: String, enum: ['meses', 'todo'], default: 'meses' },
  filas: Number,
  locales: Number,
  registros: Number,
  desde: Number, // periodo AAAAMM
  hasta: Number,
  meses: Number,
  conceptosUnificados: Number,
}, { timestamps: true });

module.exports = mongoose.model('EerrCarga', eerrCargaSchema);
