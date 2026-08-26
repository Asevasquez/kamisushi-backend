const mongoose = require('mongoose');

const usuarioLocalSchema = new mongoose.Schema({
  usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  localId: { type: mongoose.Schema.Types.ObjectId, ref: 'Local', required: true },
  permisos: {
    type: String,
    enum: ['lectura', 'escritura', 'admin'],
    default: 'lectura'
  },
  asignadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  fechaAsignacion: { type: Date, default: Date.now },
  activo: { type: Boolean, default: true }
});

// Índice compuesto para evitar duplicados
usuarioLocalSchema.index({ usuarioId: 1, localId: 1 }, { unique: true });

module.exports = mongoose.model('UsuarioLocal', usuarioLocalSchema);