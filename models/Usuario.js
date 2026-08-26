// backend/models/Usuario.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const usuarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  telefono: { type: String, default: '' },
  fechaContratacion: { type: Date, default: Date.now },
  rol: {
    type: String,
    enum: ['master', 'administrador', 'gerencia', 'supervisor'],
    default: 'supervisor'
  },
  // ⚠️ IMPORTANTE: Este campo debe existir
  localesAsignados: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Local' }],
  activo: { type: Boolean, default: true }
}, { timestamps: true });

// Hash password antes de guardar
usuarioSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

usuarioSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('Usuario', usuarioSchema);