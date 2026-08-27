const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const usuarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  rol: {
    type: String,
    enum: ['master', 'administrador', 'gerencia', 'supervisor'],
    default: 'supervisor',
  },
  supervisorId: { type: String },
  // Referencia a los locales asignados — se popula en el middleware
  localesAsignados: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Local' }],
  activo: { type: Boolean, default: true },
}, { timestamps: true });

// Hash de contraseña antes de guardar
usuarioSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Comparar contraseña
usuarioSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('Usuario', usuarioSchema);
